"use client";

import { createContext, useContext, useRef } from "react";
import { useMotionValue, type MotionValue } from "motion/react";
import {
  DEFAULT_PARAMS,
  getSavedParamOverrides,
  type Params,
} from "@/lib/play-params";
import { CARD_W, CARD_H } from "@/lib/artifact-utils";

// ─── Play runtime — the one seam between the R3F scene and the DOM host ───────
//
//  Everything in here is mutated imperatively (refs / MotionValues) and read
//  inside useFrame loops or plain event handlers — never through useState.
//  This is the fix for the old scattered-refs problem: CameraController,
//  GridBackground, GridCard, GalleryStack and PanelPositioner used to each
//  receive a hand-picked subset of ~15 individually-named refs prop-drilled
//  through InfiniteTiles. Now they all just call usePlayStore().
//
//  Rare-changing values that DO need React re-renders (selected, loading,
//  isMobile, tileVersion) deliberately stay as ordinary useState in
//  InfiniteCanvas instead of living here — see its own comments.

export type CameraPhase = "intro" | "idle" | "focusing" | "focused" | "returning";

// Cards dim/fade the background dots while a focus is up on screen — true for
// the two phases where a card is actually popped in front of the camera.
// "returning" reads as idle here on purpose: the click-outside that starts it
// already cleared the dim/fade immediately (see InfiniteCanvas's
// handleDeselect), same as before this was folded into the phase machine.
export function isFocusPhase(phase: CameraPhase): boolean {
  return phase === "focusing" || phase === "focused";
}

export type CameraState = {
  zoom: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RippleState = { x: number; y: number; startTime: number };

// Shape shared by the intro/outro card-wave clocks — see triggerWave().
export type WaveState = { version: number; startTime: number };

export type PlayRuntime = {
  // Tunable knobs — Tweakpane (dev only) writes directly here, everything
  // else reads it every frame.
  params: Params;

  camera: {
    // Single explicit phase driving CameraController's useFrame — replaces
    // the old implicit "zoomAnim ? … : focusAnim ? … : idle" precedence
    // over independently-mutated flags.
    phase: CameraPhase;
    // Published every frame by CameraController (the camera's actual
    // owner) — read by InfiniteCanvas's triggerRippleAt for its NDC→world
    // math.
    state: CameraState;
    // Desired zoom; the idle phase lerps cam.zoom toward this every frame.
    zoomTarget: number;
  };

  focus: {
    // Desired camera position while focusing/focused; null when idle.
    target: { x: number; y: number } | null;
    // Focused card's world position — PanelPositioner projects this to
    // screen space every frame.
    worldPos: [number, number] | null;
    halfW: number;
    halfH: number;
  };

  gallery: {
    // Multi-media artifact → CameraController redirects wheel/drag into the
    // gallery scroll instead of panning the camera.
    hasGallery: boolean;
    // Bridges GalleryStack (reads it to position items) with
    // CameraController's wheel/drag handlers (which accumulate into it).
    // Accumulates unclamped — GalleryStack wraps it modulo its own
    // locally-computed period so the gallery loops infinitely instead of
    // stopping at the first/last item.
    scrollOffset: number;
  };

  pointer: {
    // Written by CameraController's drag handlers, read by InfiniteCanvas's
    // handleSelect/handleDeselect to suppress click-through right after a
    // drag release.
    dragMoved: boolean;
  };

  panel: {
    // Motion values already ARE the "mutate every frame, no re-render"
    // primitive Motion wants for style bindings — no need to wrap them in a
    // plain ref too. Written by PanelPositioner, read by the panel JSX in
    // InfiniteCanvas.
    x: MotionValue<number>;
    y: MotionValue<number>;
  };

  // Written by InfiniteCanvas's triggerRippleAt (onPointerMissed), read by
  // GridBackground's shader uniforms.
  ripple: RippleState | null;

  // Card entrance/exit wave clocks (see triggerWave()). intro fires on
  // reveal (CameraController, keyed off introKey), outro fires on
  // navigating away (PlayCanvas, before the canvas is hidden).
  intro: WaveState;
  outro: WaveState;
};

/** Bumps a wave clock's version + restarts its startTime — shared by both the intro and outro card waves, which are otherwise identical in shape and behavior. */
export function triggerWave(wave: WaveState): void {
  wave.version += 1;
  wave.startTime = typeof performance !== "undefined" ? performance.now() : 0;
}

// ─── Context plumbing ──────────────────────────────────────────────────────
//
//  Mirrors ActionBarContext's Provider+hook shape, with one addition:
//  PlayCanvas (the persistent-mount host, OUTSIDE the R3F tree) both CREATES
//  the runtime and needs to mutate it directly (triggerWave(runtime.outro)
//  on route-away) — so creation (usePlayRuntime) is split from providing it
//  (PlayStoreProvider) instead of hiding the ref inside a single opaque
//  provider component the way ActionBarProvider does.

const PlayStoreContext = createContext<PlayRuntime | null>(null);

/** Creates the runtime once and returns the same stable instance on every render. Called exactly once, by PlayCanvas. */
export function usePlayRuntime(): PlayRuntime {
  const panelX = useMotionValue(-9999);
  const panelY = useMotionValue(0);
  const ref = useRef<PlayRuntime | null>(null);
  // Lazy-init guarded by the null check itself — the standard React idiom
  // for building an expensive/stable object once without useMemo (which
  // isn't guaranteed to preserve its cache across renders).
  // eslint-disable-next-line react-hooks/refs
  if (!ref.current) {
    ref.current = {
      params: { ...DEFAULT_PARAMS, ...getSavedParamOverrides() },
      camera: {
        phase: "intro",
        state: { zoom: 0.5, x: 0, y: 0, width: 0, height: 0 },
        zoomTarget: 0.5,
      },
      focus: {
        target: null,
        worldPos: null,
        halfW: CARD_W / 2,
        halfH: CARD_H / 2,
      },
      gallery: { hasGallery: false, scrollOffset: 0 },
      pointer: { dragMoved: false },
      panel: { x: panelX, y: panelY },
      ripple: null,
      intro: { version: 0, startTime: -Infinity },
      outro: { version: 0, startTime: -Infinity },
    };
  }
  // Same stable, lazily-created-once object every render — safe to return.
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}

/** Thin wrapper around PlayStoreContext.Provider — takes the runtime as a prop instead of creating it, so PlayCanvas can hold onto the same instance it provides. */
export function PlayStoreProvider({
  runtime,
  children,
}: {
  runtime: PlayRuntime;
  children: React.ReactNode;
}) {
  return (
    <PlayStoreContext.Provider value={runtime}>
      {children}
    </PlayStoreContext.Provider>
  );
}

export function usePlayStore(): PlayRuntime {
  const ctx = useContext(PlayStoreContext);
  if (!ctx) throw new Error("usePlayStore must be used within PlayStoreProvider");
  return ctx;
}
