"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePlayStore, triggerWave } from "@/contexts/PlayStoreContext";
import { easeOutExpo, easeZoom } from "@/lib/easings";
import { damp } from "@/lib/damp";

// ─── Camera controller ────────────────────────────────────────────────────────
//
//  Drives store.camera.phase explicitly — one switch, one place — instead of
//  inferring "what's animating" from which of several independently-mutated
//  refs happens to be non-null this frame (the old ArtifactMesh-era design).
//  Entering "focusing"/"returning" is InfiniteCanvas's call (it owns the
//  click/deselect intent); this component only reacts to the phase it's
//  handed and owns the actual tweening + the phase's own internal advances
//  (intro → idle, focusing → focused, returning → idle).
//
//  Intro zoom : time-based easeInOutExpo over INTRO_ZOOM_DURATION ms,
//               starting once introKey bumps (canvas actually revealed).
//  Focus snap : position + zoom animated together on easeOutExpo (smooth
//               decel, no bounce).
//  Exit focus : exponential lerp on zoom only (instant-feel, no duration
//               overhead) — "returning" collapses into "idle" the instant
//               zoom settles; both phases run identical per-frame math.
//
// Arrivée /play : onde des dots + vague des cards + dézoom démarrent EN MÊME TEMPS.
const INTRO_ZOOM_DURATION = 1050; // ms — dézoom caméra 0.5→1
const FOCUS_DURATION = 500; // ms — focus snap
// Panel appears once media is nearly stable (Framer Motion delay, not a timer)
export const PANEL_DELAY_S = (FOCUS_DURATION * 0.75) / 1000; // seconds for Framer Motion

const DRAG_THRESHOLD = 6;
const IDLE_ZOOM_LERP = 0.22; // vitesse du dézoom de sortie de focus (lerp/frame)

// focusLockedRef bascule seulement un court instant après le DÉBUT du snap de
// focus — distinct de la phase "focused" elle-même, qui bascule seulement une
// fois le snap terminé. Permet à un wheel/drag tiré juste après le clic
// d'annuler le focus avant que la caméra ait vraiment commencé à bouger.
// Basé sur le temps écoulé depuis focusAnim.startTime, PAS sur une valeur de
// zoom absolue : depuis que computeFocusZoom cible une fraction de largeur
// d'écran (focusWidthFrac), le zoom focus peut légitimement être < 1 pour une
// grande card sur un petit viewport — un seuil comme `cam.zoom > 1.01` n'est
// plus un proxy fiable de "la caméra a commencé à bouger" (il ne se
// déclenchait alors quasiment jamais, laissant le pan/scroll actif même en
// focus).
const FOCUS_LOCK_DELAY_MS = 30;
const VELOCITY_WINDOW_MS   = 80; // ms — fenêtre glissante pour la vélocité de release
const DRAG_MOVED_RESET_MS  = 50; // ms — debounce avant que dragMoved retombe à false
const INERTIA_FRICTION     = -2.5; // décroissance exponentielle de la vélocité post-drag

export function CameraController({
  active,
  running,
  introKey,
}: {
  active: boolean;
  running: boolean; // frameloop alive — false only when fully at rest (hidden)
  introKey: number; // bumps when the canvas is actually revealed → play intro
}) {
  const store = usePlayStore();
  const { camera, size } = useThree();
  const wheel = useRef({ x: 0, y: 0 });
  const panDelta = useRef({ x: 0, y: 0 });
  const focusLockedRef = useRef(false);
  const velocityRef = useRef({ x: 0, y: 0 }); // inertia after drag release
  // Time-based intro zoom animation (null = not running)
  const zoomAnim = useRef<{ startTime: number; fromZoom: number } | null>(null);
  // Time-based focus animation — position + zoom synchronized on the same curve
  const focusAnim = useRef<{
    startTime: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    fromZoom: number;
    toZoom: number;
  } | null>(null);

  // Wheel → accumulate raw deltas, cancel intro zoom if still running
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (focusLockedRef.current) {
        // Focused → wheel never pans the camera or exits focus anymore; only
        // clicking outside the card does (onPointerMissed → handleDeselect).
        // Redirect into the gallery stack if there's one to scroll
        // (accumulates unclamped — GalleryStack wraps it modulo its own
        // locally-computed period so it loops infinitely), otherwise just
        // swallow the scroll.
        if (store.gallery.hasGallery) {
          store.gallery.scrollOffset += e.deltaY;
        }
        return;
      }
      velocityRef.current = { x: 0, y: 0 }; // stop inertia on scroll
      zoomAnim.current = null; // abort intro zoom — user is already navigating
      focusAnim.current = null; // abort any in-progress focus snap
      store.focus.target = null;
      store.camera.zoomTarget = 1.0;
      store.camera.phase = "idle";
      wheel.current.x += e.deltaX;
      wheel.current.y -= e.deltaY;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [store]);

  // Drag (mouse left-button) + touch swipe → pan + inertia on release
  // Threshold avoids triggering pan on accidental micro-movements during clicks.
  useEffect(() => {
    if (!active) {
      velocityRef.current = { x: 0, y: 0 };
      return;
    }
    let dragActive = false;
    let focusedDrag = false;      // this drag session started while focused — never pans the camera
    let scrollingGallery = false; // ...and has a gallery to scroll (see onWheel above)
    let startX = 0, startY = 0, lastX = 0, lastY = 0;
    // Circular buffer of recent moves for accurate release velocity
    const recentMoves: Array<{ x: number; y: number; t: number }> = [];

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Focused → drag never pans the camera or exits focus anymore. If
      // there's a gallery, drag scrolls it instead; otherwise the drag is
      // simply swallowed (see onMove below).
      focusedDrag = focusLockedRef.current;
      scrollingGallery = focusedDrag && store.gallery.hasGallery;
      dragActive = true;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      store.pointer.dragMoved = false;
      velocityRef.current = { x: 0, y: 0 }; // stop ongoing inertia
      recentMoves.length = 0;
      recentMoves.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      // Locked → this pointerdown is being redirected to gallery-scroll or
      // swallowed above, never a focus cancel (only clicking OUTSIDE the
      // card, via onPointerMissed, exits focus while locked).
      if (!focusedDrag) {
        zoomAnim.current = null;
        focusAnim.current = null;
        store.focus.target = null;
        store.camera.zoomTarget = 1.0;
        store.camera.phase = "idle";
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!dragActive) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const now = performance.now();
      recentMoves.push({ x: e.clientX, y: e.clientY, t: now });
      // Keep only last VELOCITY_WINDOW_MS for velocity estimation
      while (recentMoves.length > 1 && now - recentMoves[0].t > VELOCITY_WINDOW_MS) recentMoves.shift();
      if (!store.pointer.dragMoved) {
        const totalDx = e.clientX - startX;
        const totalDy = e.clientY - startY;
        if (Math.abs(totalDx) < DRAG_THRESHOLD && Math.abs(totalDy) < DRAG_THRESHOLD) return;
        store.pointer.dragMoved = true;
      }
      // Focused artifact has a scrollable gallery → drag scrolls the
      // in-canvas stack instead of panning the camera (see onWheel above).
      if (scrollingGallery) {
        store.gallery.scrollOffset -= dy;
        return;
      }
      if (focusedDrag) return; // focused, no gallery → swallow, camera stays put
      // x: drag right → camera left (inverted); y: drag down → camera up (same)
      panDelta.current.x -= dx;
      panDelta.current.y += dy;
    };

    const onUp = () => {
      // Focused drags never moved the camera — no inertia to compute.
      if (dragActive && !focusedDrag && recentMoves.length >= 2) {
        const first = recentMoves[0];
        const last = recentMoves[recentMoves.length - 1];
        const dt = last.t - first.t;
        if (dt > 5) {
          // Camera coord convention: invert x, keep y
          velocityRef.current.x = -(last.x - first.x) / dt;
          velocityRef.current.y =  (last.y - first.y) / dt;
        }
      }
      dragActive = false;
      focusedDrag = false;
      scrollingGallery = false;
      setTimeout(() => { store.pointer.dragMoved = false; }, DRAG_MOVED_RESET_MS);
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [active, store]);

  // From here down, every effect/useFrame mutates the R3F camera (a mutable,
  // GPU-backed Three.js object, not React state) or the shared PlayRuntime —
  // the standard imperative R3F pattern, not accidental impurity.
  /* eslint-disable react-hooks/immutability */

  // Reset transient camera state whenever the canvas goes inactive (leaving /play)
  useEffect(() => {
    if (!active) {
      wheel.current = { x: 0, y: 0 };
      zoomAnim.current = null;
      focusAnim.current = null;
      store.focus.target = null;
      store.camera.zoomTarget = 1.0;
      store.camera.phase = "idle";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Arm the camera at the intro start zoom while fully at rest (frameloop off,
  // canvas hidden after the outro). The next reveal then renders at 0.5 from the
  // first frame — no flash at zoom 1 before the dezoom kicks in.
  useEffect(() => {
    if (!running) {
      const cam = camera as THREE.OrthographicCamera;
      cam.zoom = 0.5;
      cam.updateProjectionMatrix();
      store.camera.zoomTarget = 0.5;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, camera]);

  // Intro — fires when the canvas is actually REVEALED (introKey bumps), not at
  // mount (the WebGL init freezes behind the LoadingBar on first visit).
  // Vague des cards + dézoom 0.5→1 démarrent ensemble.
  useEffect(() => {
    if (introKey === 0) return;
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = 0.5;
    cam.updateProjectionMatrix();
    wheel.current = { x: 0, y: 0 };

    triggerWave(store.intro); // vague des cards
    store.camera.zoomTarget = 1.0;
    zoomAnim.current = { startTime: performance.now(), fromZoom: cam.zoom }; // dézoom
    store.camera.phase = "intro";

    return () => {
      zoomAnim.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey, camera]);

  useFrame((_state, delta) => {
    const cam = camera as THREE.OrthographicCamera;

    switch (store.camera.phase) {
      case "intro": {
        if (!zoomAnim.current) {
          store.camera.phase = "idle";
          break;
        }
        const elapsed = performance.now() - zoomAnim.current.startTime;
        const t = Math.min(1, elapsed / INTRO_ZOOM_DURATION);
        cam.zoom = zoomAnim.current.fromZoom + (1.0 - zoomAnim.current.fromZoom) * easeZoom(t);
        cam.updateProjectionMatrix();
        if (t >= 1) {
          cam.zoom = 1.0;
          zoomAnim.current = null;
          store.camera.phase = "idle";
        }
        break;
      }

      // Entering "focusing" is InfiniteCanvas's call (handleSelect writes
      // focus.target + camera.zoomTarget + phase together); this just
      // notices the phase changed and builds the tween from wherever the
      // camera actually is right now — which correctly picks up mid-flight
      // from an interrupted intro/returning, no separate cancellation logic
      // needed (the switch already guarantees only one case runs per frame).
      case "focusing": {
        if (!focusAnim.current) {
          const target = store.focus.target;
          if (!target) { store.camera.phase = "idle"; break; }
          focusAnim.current = {
            startTime: performance.now(),
            fromX: cam.position.x,
            fromY: cam.position.y,
            toX: target.x,
            toY: target.y,
            fromZoom: cam.zoom,
            toZoom: store.camera.zoomTarget,
          };
        }
        const elapsed = performance.now() - focusAnim.current.startTime;
        const t = Math.min(1, elapsed / FOCUS_DURATION);
        const ease = easeOutExpo(t);
        const { fromX, fromY, toX, toY, fromZoom, toZoom } = focusAnim.current;
        cam.position.x = fromX + (toX - fromX) * ease;
        cam.position.y = fromY + (toY - fromY) * ease;
        cam.zoom = fromZoom + (toZoom - fromZoom) * ease;
        cam.updateProjectionMatrix();
        if (t >= 1) {
          cam.position.set(toX, toY, cam.position.z);
          cam.zoom = toZoom;
          cam.updateProjectionMatrix();
          focusAnim.current = null;
          store.camera.phase = "focused";
        }
        break;
      }

      // Settled on the focused card — locked, inputs redirected to the
      // gallery (or swallowed) by the wheel/pointer listeners above. Nothing
      // to animate until InfiniteCanvas's handleDeselect moves phase to
      // "returning".
      case "focused":
        break;

      // "returning" and "idle" run identical math — the only difference is
      // that "returning" collapses back into "idle" the instant zoom
      // actually settles on its target, once the exit-focus lerp is done.
      case "returning":
      case "idle":
      default: {
        const zDiff = store.camera.zoomTarget - cam.zoom;
        if (Math.abs(zDiff) > 0.001) {
          cam.zoom = damp(cam.zoom, store.camera.zoomTarget, IDLE_ZOOM_LERP);
          cam.updateProjectionMatrix();
        } else if (cam.zoom !== store.camera.zoomTarget) {
          cam.zoom = store.camera.zoomTarget;
          cam.updateProjectionMatrix();
          if (store.camera.phase === "returning") store.camera.phase = "idle";
        }
        // Inertia — velocity in camera px/ms, decays with exp friction
        const vx = velocityRef.current.x;
        const vy = velocityRef.current.y;
        if (vx !== 0 || vy !== 0) {
          const deltaMs = delta * 1000;
          cam.position.x += vx * deltaMs / cam.zoom;
          cam.position.y += vy * deltaMs / cam.zoom;
          const decay = Math.exp(INERTIA_FRICTION * delta);
          velocityRef.current.x *= decay;
          velocityRef.current.y *= decay;
          if (Math.abs(velocityRef.current.x) < 0.0001 && Math.abs(velocityRef.current.y) < 0.0001) {
            velocityRef.current.x = 0;
            velocityRef.current.y = 0;
          }
        }
        cam.position.x += (wheel.current.x + panDelta.current.x) / cam.zoom;
        cam.position.y += (wheel.current.y + panDelta.current.y) / cam.zoom;
        wheel.current = { x: 0, y: 0 };
        panDelta.current.x = 0;
        panDelta.current.y = 0;
        break;
      }
    }

    // Locked once focused AND the snap has had a brief instant to actually
    // start moving (or has already finished — phase is "focused" once
    // settled). Not focused at all → never locked (idle browsing).
    focusLockedRef.current =
      store.camera.phase === "focused" ||
      (store.camera.phase === "focusing" &&
        (!focusAnim.current || performance.now() - focusAnim.current.startTime > FOCUS_LOCK_DELAY_MS));

    // ── Publish camera state — this component is the camera's actual owner,
    // GridBackground/InfiniteCanvas's triggerRippleAt just read it. ─────────
    store.camera.state.zoom = cam.zoom;
    store.camera.state.x = cam.position.x;
    store.camera.state.y = cam.position.y;
    store.camera.state.width = size.width;
    store.camera.state.height = size.height;
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
