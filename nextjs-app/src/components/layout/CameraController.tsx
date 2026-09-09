"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { triggerIntro, focusState } from "@/lib/artifact-utils";
import { easeOutExpo, easeZoom } from "@/lib/easings";
import { damp } from "@/lib/damp";

// ─── Camera controller ────────────────────────────────────────────────────────
//
//  Intro zoom : time-based easeInOutExpo over INTRO_ZOOM_DURATION ms,
//               starting INTRO_ZOOM_DELAY ms after `active` flips true.
//  Focus snap : position + zoom animated together on easeInOutBack (overshoot +
//               settle doux, cohérent avec easeZoom du dezoom intro).
//  Exit focus : exponential lerp on zoom only (instant-feel, no duration overhead).
//
// Arrivée /play : onde des dots + vague des cards + dézoom démarrent EN MÊME TEMPS.
const INTRO_ZOOM_DURATION = 1050; // ms — dézoom caméra 0.5→1
const FOCUS_DURATION = 500; // ms — focus snap
// Panel appears once media is nearly stable (Framer Motion delay, not a timer)
export const PANEL_DELAY_S = (FOCUS_DURATION * 0.75) / 1000; // seconds for Framer Motion

const DRAG_THRESHOLD = 6;
const IDLE_ZOOM_LERP = 0.22; // vitesse du dézoom de sortie de focus (lerp/frame)

export function CameraController({
  selectTarget,
  zoomTarget,
  panDeltaRef,
  dragMovedRef,
  active,
  running,
  introKey,
}: {
  selectTarget: React.MutableRefObject<{ x: number; y: number } | null>;
  zoomTarget: React.MutableRefObject<number>;
  panDeltaRef: React.MutableRefObject<{ x: number; y: number }>;
  dragMovedRef: React.MutableRefObject<boolean>;
  active: boolean;
  running: boolean; // frameloop alive — false only when fully at rest (hidden)
  introKey: number; // bumps when the canvas is actually revealed → play intro
}) {
  const { camera } = useThree();
  const wheel = useRef({ x: 0, y: 0 });
  const inFocus = useRef(false);
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
      if (inFocus.current) {
        // Focused → wheel never pans the camera or exits focus anymore; only
        // clicking outside the card does (onPointerMissed → handleDeselect).
        // Redirect into the gallery stack if there's one to scroll
        // (accumulates unclamped — GalleryStack wraps it modulo scrollPeriod
        // so it loops infinitely), otherwise just swallow the scroll.
        if (focusState.hasGallery) {
          focusState.scrollOffset += e.deltaY;
        }
        return;
      }
      velocityRef.current = { x: 0, y: 0 }; // stop inertia on scroll
      if (zoomAnim.current) {
        zoomAnim.current = null; // abort intro zoom — user is already navigating
        zoomTarget.current = 1.0;
      }
      focusAnim.current = null; // abort any in-progress focus snap
      selectTarget.current = null;
      zoomTarget.current = 1.0;
      wheel.current.x += e.deltaX;
      wheel.current.y -= e.deltaY;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [selectTarget, zoomTarget]);

  // Drag (mouse left-button) + touch swipe → pan + inertia on release
  // Threshold avoids triggering pan on accidental micro-movements during clicks.
  // dragMovedRef is shared with the orchestrator (InfiniteCanvas) so handleSelect
  // / handleDeselect can skip — threaded by prop like the other cross-component refs.
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
      // Focused → drag never pans the camera or exits focus anymore; only
      // clicking outside the card does. If there's a gallery, drag scrolls it
      // instead; otherwise the drag is simply swallowed (see onMove below).
      focusedDrag = inFocus.current;
      scrollingGallery = focusedDrag && focusState.hasGallery;
      dragActive = true;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      dragMovedRef.current = false;
      velocityRef.current = { x: 0, y: 0 }; // stop ongoing inertia
      recentMoves.length = 0;
      recentMoves.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (zoomAnim.current) { zoomAnim.current = null; zoomTarget.current = 1.0; }
      focusAnim.current = null;
      selectTarget.current = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!dragActive) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const now = performance.now();
      recentMoves.push({ x: e.clientX, y: e.clientY, t: now });
      // Keep only last 80ms for velocity estimation
      while (recentMoves.length > 1 && now - recentMoves[0].t > 80) recentMoves.shift();
      if (!dragMovedRef.current) {
        const totalDx = e.clientX - startX;
        const totalDy = e.clientY - startY;
        if (Math.abs(totalDx) < DRAG_THRESHOLD && Math.abs(totalDy) < DRAG_THRESHOLD) return;
        dragMovedRef.current = true;
      }
      // Focused artifact has a scrollable gallery → drag scrolls the
      // in-canvas stack instead of panning the camera (see onWheel above).
      if (scrollingGallery) {
        focusState.scrollOffset -= dy;
        return;
      }
      if (focusedDrag) return; // focused, no gallery → swallow, camera stays put
      // x: drag right → camera left (inverted); y: drag down → camera up (same)
      panDeltaRef.current.x -= dx;
      panDeltaRef.current.y += dy;
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
      setTimeout(() => { dragMovedRef.current = false; }, 50);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // From here down, every effect/useFrame mutates the R3F camera (a mutable,
  // GPU-backed Three.js object, not React state) or refs shared with the
  // parent — the standard imperative R3F pattern, not accidental impurity.
  /* eslint-disable react-hooks/immutability */

  // Reset transient camera state whenever the canvas goes inactive (leaving /play)
  useEffect(() => {
    if (!active) {
      wheel.current = { x: 0, y: 0 };
      zoomAnim.current = null;
      focusAnim.current = null;
      zoomTarget.current = 1.0;
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
      zoomTarget.current = 0.5;
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

    triggerIntro(); // vague des cards
    zoomTarget.current = 1.0;
    zoomAnim.current = { startTime: performance.now(), fromZoom: cam.zoom }; // dézoom

    return () => {
      zoomAnim.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introKey, camera]);

  useFrame((_state, delta) => {
    const cam = camera as THREE.OrthographicCamera;

    // Cancel intro zoom if selection starts mid-animation
    if (zoomAnim.current && selectTarget.current) {
      zoomAnim.current = null;
    }

    // Detect new selectTarget → initiate synchronized focus animation
    if (selectTarget.current && !focusAnim.current && !zoomAnim.current) {
      focusAnim.current = {
        startTime: performance.now(),
        fromX: cam.position.x,
        fromY: cam.position.y,
        toX: selectTarget.current.x,
        toY: selectTarget.current.y,
        fromZoom: cam.zoom,
        toZoom: zoomTarget.current,
      };
    }

    // ── Zoom + position ──────────────────────────────────────────────────────
    if (zoomAnim.current) {
      // Intro zoom (phase 3) — courbe custom cubic-bezier(1,-0.01,.42,1)
      const elapsed = performance.now() - zoomAnim.current.startTime;
      const t = Math.min(1, elapsed / INTRO_ZOOM_DURATION);
      cam.zoom =
        zoomAnim.current.fromZoom +
        (1.0 - zoomAnim.current.fromZoom) * easeZoom(t);
      cam.updateProjectionMatrix();
      if (t >= 1) {
        cam.zoom = 1.0;
        zoomAnim.current = null;
      }
    } else if (focusAnim.current) {
      // Focus: position + zoom — easeOutExpo, smooth decel, no bounce
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
        selectTarget.current = null;
        focusAnim.current = null;
      }
    } else {
      // Idle: zoom lerp for exit-focus, then inertia + wheel/drag pan
      const zDiff = zoomTarget.current - cam.zoom;
      if (Math.abs(zDiff) > 0.001) {
        cam.zoom = damp(cam.zoom, zoomTarget.current, IDLE_ZOOM_LERP);
        cam.updateProjectionMatrix();
      } else if (cam.zoom !== zoomTarget.current) {
        cam.zoom = zoomTarget.current;
        cam.updateProjectionMatrix();
      }
      // Inertia — velocity in camera px/ms, decays with exp friction
      const vx = velocityRef.current.x;
      const vy = velocityRef.current.y;
      if (vx !== 0 || vy !== 0) {
        const deltaMs = delta * 1000;
        cam.position.x += vx * deltaMs / cam.zoom;
        cam.position.y += vy * deltaMs / cam.zoom;
        const decay = Math.exp(-2.5 * delta);
        velocityRef.current.x *= decay;
        velocityRef.current.y *= decay;
        if (Math.abs(velocityRef.current.x) < 0.0001 && Math.abs(velocityRef.current.y) < 0.0001) {
          velocityRef.current.x = 0;
          velocityRef.current.y = 0;
        }
      }
      cam.position.x += (wheel.current.x + panDeltaRef.current.x) / cam.zoom;
      cam.position.y += (wheel.current.y + panDeltaRef.current.y) / cam.zoom;
      wheel.current = { x: 0, y: 0 };
      panDeltaRef.current.x = 0;
      panDeltaRef.current.y = 0;
    }

    inFocus.current = cam.zoom > 1.01;
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
