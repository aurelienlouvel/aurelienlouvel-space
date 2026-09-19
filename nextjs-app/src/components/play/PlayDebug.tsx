"use client";

import { useRef, useEffect, useState, type RefObject } from "react";
import { useControls, folder, buttonGroup, Leva } from "leva";
import { toast } from "sonner";
import {
  type PlayDebugRef,
  type PlayDebugState,
  type PlayRuntimeState,
  type WaveDirection,
} from "./PlayCanvas";
import type { LayoutStats } from "./layout-types";
import type { ArtifactDetail } from "@/sanity/queries";
import {
  type EasingName,
  type TrackName,
  type TransitionConfig,
} from "./transition-presets";

/** Champs numériques de la config — ceux qu'un slider peut piloter. */
type NumericTransitionField = {
  [K in keyof TransitionConfig]: TransitionConfig[K] extends number ? K : never;
}[keyof TransitionConfig];

const STORAGE_KEY = "play-debug-v25";
const TAB_STORAGE_KEY = "play-debug-tab-v2";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const EASING_OPTIONS: EasingName[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInCubic",
  "easeInOutCubic",
  "easeInOutQuint",
  "easeOutExpo",
  "easeOutQuint",
];

export type DebugTab =
  | "camera"
  | "media"
  | "canvas"
  | "selection"
  | "transition"
  | "focus";

const TABS: { id: DebugTab; label: string }[] = [
  { id: "camera", label: "camera" },
  { id: "media", label: "media" },
  { id: "canvas", label: "canvas" },
  { id: "selection", label: "selection" },
  { id: "transition", label: "transition" },
  { id: "focus", label: "focus" },
];

function loadSavedTab(): DebugTab {
  if (typeof window === "undefined") return "transition";
  try {
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY) as DebugTab | null;
    if (saved && TABS.some((t) => t.id === saved)) return saved;
  } catch {
    // fallback
  }
  return "transition";
}

function restore(state: PlayDebugState) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof stored !== "object" || stored === null) return;

  const saved = stored as Record<string, unknown>;
  const groups = Object.entries(
    state as unknown as Record<string, Record<string, unknown>>,
  );
  for (const [name, group] of groups) {
    if (name === "studio") continue; // Session only
    const savedGroup = saved[name];
    if (typeof savedGroup !== "object" || savedGroup === null) continue;
    for (const [key, fallback] of Object.entries(group)) {
      const value = (savedGroup as Record<string, unknown>)[key];
      if (typeof value !== typeof fallback) continue;
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      if (typeof value === "string" && key === "color" && !HEX_COLOR.test(value))
        continue;
      group[key] = value;
    }
  }
}

const LEVA_THEME = {
  colors: {
    elevation1: "#141414",
    elevation2: "#1c1c1c",
    elevation3: "#262626",
    accent1: "#ffffff",
    accent2: "#888888",
    accent3: "#444444",
    highlight1: "#e0e0e0",
    highlight2: "#b0b0b0",
    highlight3: "#707070",
    vivid1: "#f5a623",
  },
  radii: {
    xs: "2px",
    sm: "4px",
    lg: "8px",
  },
  space: {
    sm: "6px",
    md: "10px",
    rowGap: "7px",
    colGap: "7px",
  },
  fonts: {
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  sizes: {
    rootWidth: "460px",
    controlWidth: "175px",
    numberInputMinWidth: "44px",
    rowHeight: "26px",
    folderTitleHeight: "24px",
  },
};

// ── 1. Tab Camera ───────────────────────────────────────────────
function CameraTab({ state }: { state: PlayDebugRef }) {
  useControls("Camera & Fisheye", () => ({
    "Camera zoom (base)": {
      value: state.current.camera.zoom,
      min: 0.2,
      max: 2.0,
      step: 0.05,
      onChange: (v: number) => {
        state.current.camera.zoom = v;
      },
    },
    Fisheye: folder({
      "Fisheye enabled": {
        value: state.current.fisheye.enabled,
        onChange: (v: boolean) => {
          state.current.fisheye.enabled = v;
        },
      },
      "Fisheye strength": {
        value: state.current.fisheye.strength,
        min: 0.0,
        max: 0.08,
        step: 0.002,
        onChange: (v: number) => {
          state.current.fisheye.strength = v;
        },
      },
    }),
  }));
  return null;
}

// ── 2. Tab Media ────────────────────────────────────────────────
function MediaTab({ state }: { state: PlayDebugRef }) {
  useControls("Media Settings", () => ({
    "Corner radius (px)": {
      value: state.current.plane.radius,
      min: 0,
      max: 60,
      step: 1,
      onChange: (v: number) => {
        state.current.plane.radius = v;
      },
    },
  }));
  return null;
}

// ── 3. Tab Canvas ───────────────────────────────────────────────
function CanvasTab({
  state,
  stats,
  onLayoutChange,
}: {
  state: PlayDebugRef;
  stats?: LayoutStats;
  onLayoutChange: () => void;
}) {
  useControls("Canvas Layout & Navigation", () => ({
    Actions: buttonGroup({
      "Recompute Layout": onLayoutChange,
    }),
    "Media Dimensions & Gaps": folder({
      "Max width": {
        value: state.current.gravity.maxWidth,
        min: 200,
        max: 1200,
        step: 20,
        onChange: (v: number) => {
          state.current.gravity.maxWidth = v;
          onLayoutChange();
        },
      },
      "Max height": {
        value: state.current.gravity.maxHeight,
        min: 200,
        max: 1200,
        step: 20,
        onChange: (v: number) => {
          state.current.gravity.maxHeight = v;
          onLayoutChange();
        },
      },
      "Target aspect": {
        value: state.current.gravity.targetAspect,
        min: 0.5,
        max: 3.0,
        step: 0.1,
        onChange: (v: number) => {
          state.current.gravity.targetAspect = v;
          onLayoutChange();
        },
      },
      "Min gap (px)": {
        value: state.current.gravity.gap,
        min: 20,
        max: 400,
        step: 10,
        onChange: (v: number) => {
          state.current.gravity.gap = v;
          onLayoutChange();
        },
      },
      "Repeat gap (px)": {
        value: state.current.gravity.repeatGap,
        min: 50,
        max: 500,
        step: 10,
        onChange: (v: number) => {
          state.current.gravity.repeatGap = v;
          onLayoutChange();
        },
      },
      "Scale variance": {
        value: state.current.gravity.scaleVariance,
        min: 0.0,
        max: 0.5,
        step: 0.02,
        onChange: (v: number) => {
          state.current.gravity.scaleVariance = v;
          onLayoutChange();
        },
      },
    }),
    "Mosaic Generation": folder({
      "Tile repeats": {
        value: state.current.gravity.repeat,
        min: 1,
        max: 6,
        step: 1,
        onChange: (v: number) => {
          state.current.gravity.repeat = v;
          onLayoutChange();
        },
      },
      "Anti-neighbor": {
        value: state.current.gravity.antiNeighbor,
        onChange: (v: boolean) => {
          state.current.gravity.antiNeighbor = v;
          onLayoutChange();
        },
      },
      Iterations: {
        value: state.current.gravity.iterations,
        min: 1000,
        max: 20000,
        step: 500,
        onChange: (v: number) => {
          state.current.gravity.iterations = v;
          onLayoutChange();
        },
      },
      Seed: {
        value: state.current.gravity.seed,
        min: 1,
        max: 100,
        step: 1,
        onChange: (v: number) => {
          state.current.gravity.seed = v;
          onLayoutChange();
        },
      },
    }),
    "Pan & Inertia": folder({
      "Drag threshold (px)": {
        value: state.current.pan.dragThreshold,
        min: 1,
        max: 20,
        step: 1,
        onChange: (v: number) => {
          state.current.pan.dragThreshold = v;
        },
      },
      "Velocity window (ms)": {
        value: state.current.pan.velocityWindowMs,
        min: 20,
        max: 200,
        step: 10,
        onChange: (v: number) => {
          state.current.pan.velocityWindowMs = v;
        },
      },
      "Inertia friction": {
        value: state.current.pan.friction,
        min: -8,
        max: -0.5,
        step: 0.25,
        onChange: (v: number) => {
          state.current.pan.friction = v;
        },
      },
    }),
    ...(stats
      ? {
          "Layout Stats": folder({
            Density: { value: stats.densityPercent, editable: false },
            "Occupied area": { value: stats.occupiedAreaFormatted, editable: false },
            "Bounding box": { value: stats.boundingBoxAreaFormatted, editable: false },
            "Compute time": { value: stats.computeTimeFormatted, editable: false },
          }),
        }
      : {}),
  }));
  return null;
}

// ── 4. Tab Selection ────────────────────────────────────────────
function SelectionTab({ state }: { state: PlayDebugRef }) {
  useControls("Selection, Brackets & Repulsion", () => ({
    "Hold to Select": folder({
      "Hold duration (s)": {
        value: state.current.transition.selectDuration,
        min: 0.2,
        max: 2.0,
        step: 0.05,
        onChange: (v: number) => {
          state.current.transition.selectDuration = v;
        },
      },
      "Hold zoom": {
        value: state.current.transition.selectZoom,
        min: 1.0,
        max: 1.5,
        step: 0.01,
        onChange: (v: number) => {
          state.current.transition.selectZoom = v;
        },
      },
      "Hold tile scale": {
        value: state.current.transition.selectScale,
        min: 0.8,
        max: 1.5,
        step: 0.01,
        onChange: (v: number) => {
          state.current.transition.selectScale = v;
        },
      },
      "Hold repulsion": {
        value: state.current.transition.selectRepulse,
        min: 0,
        max: 2000,
        step: 10,
        onChange: (v: number) => {
          state.current.transition.selectRepulse = v;
        },
      },
      "Hold easing": {
        value: state.current.transition.selectEasing,
        options: EASING_OPTIONS,
        onChange: (v: string) => {
          state.current.transition.selectEasing = v as EasingName;
        },
      },
    }),
    "Mosaic Repulsion Physics": folder({
      "Physics enabled": {
        value: state.current.physics.enabled,
        onChange: (v: boolean) => {
          state.current.physics.enabled = v;
        },
      },
      Strength: {
        value: state.current.physics.strength,
        min: 200,
        max: 8000,
        step: 50,
        onChange: (v: number) => {
          state.current.physics.strength = v;
        },
      },
      Radius: {
        value: state.current.physics.radius,
        min: 500,
        max: 6000,
        step: 50,
        onChange: (v: number) => {
          state.current.physics.radius = v;
        },
      },
      Damping: {
        value: state.current.physics.damping,
        min: 2,
        max: 30,
        step: 0.5,
        onChange: (v: number) => {
          state.current.physics.damping = v;
        },
      },
      Spring: {
        value: state.current.physics.spring,
        min: 0.1,
        max: 2.0,
        step: 0.05,
        onChange: (v: number) => {
          state.current.physics.spring = v;
        },
      },
      Restitution: {
        value: state.current.physics.restitution,
        min: 0,
        max: 1,
        step: 0.05,
        onChange: (v: number) => {
          state.current.physics.restitution = v;
        },
      },
      Friction: {
        value: state.current.physics.friction,
        min: 0,
        max: 1,
        step: 0.02,
        onChange: (v: number) => {
          state.current.physics.friction = v;
        },
      },
      Mass: {
        value: state.current.physics.mass,
        min: 0.1,
        max: 5,
        step: 0.1,
        onChange: (v: number) => {
          state.current.physics.mass = v;
        },
      },
    }),
    "Corner Brackets": folder({
      "Padding (px)": {
        value: state.current.brackets.padding,
        min: 0,
        max: 60,
        step: 1,
        onChange: (v: number) => {
          state.current.brackets.padding = v;
        },
      },
      "Radius (px)": {
        value: state.current.brackets.radius,
        min: 0,
        max: 80,
        step: 1,
        onChange: (v: number) => {
          state.current.brackets.radius = v;
        },
      },
      "Angle (deg)": {
        value: state.current.brackets.angle,
        min: 10,
        max: 90,
        step: 1,
        onChange: (v: number) => {
          state.current.brackets.angle = v;
        },
      },
      "Arm length (px)": {
        value: state.current.brackets.arm,
        min: 0,
        max: 40,
        step: 1,
        onChange: (v: number) => {
          state.current.brackets.arm = v;
        },
      },
      "Thickness (px)": {
        value: state.current.brackets.thickness,
        min: 1,
        max: 12,
        step: 0.5,
        onChange: (v: number) => {
          state.current.brackets.thickness = v;
        },
      },
      Color: {
        value: state.current.brackets.color,
        onChange: (v: string) => {
          if (HEX_COLOR.test(v)) state.current.brackets.color = v;
        },
      },
    }),
    "Focus Indicator": folder({
      "Move speed": {
        value: state.current.indicator.moveSpeed,
        min: 1,
        max: 30,
        step: 0.5,
        onChange: (v: number) => {
          state.current.indicator.moveSpeed = v;
        },
      },
      "Fade speed": {
        value: state.current.indicator.fadeSpeed,
        min: 5,
        max: 60,
        step: 1,
        onChange: (v: number) => {
          state.current.indicator.fadeSpeed = v;
        },
      },
    }),
    "Selection Overlay Wave": folder({
      Direction: {
        value: state.current.overlay.direction,
        options: {
          "Top-left to bottom-right": "tl-to-br",
          "Bottom-left to top-right": "bl-to-tr",
          "Left to right": "left-to-right",
          "Right to left": "right-to-left",
          "Bottom to top": "bottom-to-top",
          "Top to bottom": "top-to-bottom",
        },
        onChange: (v: WaveDirection) => {
          state.current.overlay.direction = v;
        },
      },
      "Wave speed": {
        value: state.current.overlay.waveSpeed,
        min: 0.0,
        max: 8.0,
        step: 0.2,
        onChange: (v: number) => {
          state.current.overlay.waveSpeed = v;
        },
      },
      "Wave frequency": {
        value: state.current.overlay.waveFrequency,
        min: 1.0,
        max: 20.0,
        step: 0.5,
        onChange: (v: number) => {
          state.current.overlay.waveFrequency = v;
        },
      },
      "Wave amplitude": {
        value: state.current.overlay.waveAmplitude,
        min: 0.01,
        max: 0.3,
        step: 0.01,
        onChange: (v: number) => {
          state.current.overlay.waveAmplitude = v;
        },
      },
      "Crest softness": {
        value: state.current.overlay.crestSoftness,
        min: 0.05,
        max: 0.8,
        step: 0.01,
        onChange: (v: number) => {
          state.current.overlay.crestSoftness = v;
        },
      },
      Iridescence: {
        value: state.current.overlay.iridescence,
        min: 0.0,
        max: 1.0,
        step: 0.02,
        onChange: (v: number) => {
          state.current.overlay.iridescence = v;
        },
      },
      "Base opacity": {
        value: state.current.overlay.baseOpacity,
        min: 0.0,
        max: 1.0,
        step: 0.02,
        onChange: (v: number) => {
          state.current.overlay.baseOpacity = v;
        },
      },
      "Glow intensity": {
        value: state.current.overlay.glowIntensity,
        min: 0.0,
        max: 3.0,
        step: 0.05,
        onChange: (v: number) => {
          state.current.overlay.glowIntensity = v;
        },
      },
    }),
  }));
  return null;
}

// ── 5. Tab Transition ───────────────────────────────────────────
function TransitionTab({
  state,
  onReplayLock,
  onSimulateSelect,
  onResetTransition,
}: {
  state: PlayDebugRef;
  onReplayLock: () => void;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
}) {
  const tr = state.current.transition;

  function trackRow(
    field: TrackName,
    maxStart = 4,
    maxDuration = 4,
  ) {
    const track = tr[field];
    return folder(
      {
        Start: {
          value: track.start,
          min: 0,
          max: maxStart,
          step: 0.02,
          onChange: (v: number) => {
            tr[field].start = v;
          },
        },
        Duration: {
          value: track.duration,
          min: 0.05,
          max: maxDuration,
          step: 0.02,
          onChange: (v: number) => {
            tr[field].duration = v;
          },
        },
        Easing: {
          value: track.easing,
          options: EASING_OPTIONS,
          onChange: (v: string) => {
            tr[field].easing = v as EasingName;
          },
        },
      },
      { collapsed: true },
    );
  }

  useControls("Transition Studio & Timeline", () => ({
    "Studio Controls": folder({
      Actions: buttonGroup({
        "Replay (R)": onReplayLock,
        "Simulate Select": onSimulateSelect,
        Reset: onResetTransition,
      }),
      "Playback speed": {
        value: state.current.studio.speed,
        options: {
          "0.1x (Ultra slow)": 0.1,
          "0.25x (Slow motion)": 0.25,
          "0.5x (Half speed)": 0.5,
          "1.0x (Normal speed)": 1.0,
        },
        onChange: (v: number) => {
          state.current.studio.speed = v;
        },
      },
      "Infinite loop (L)": {
        value: state.current.studio.loopLock,
        onChange: (v: boolean) => {
          state.current.studio.loopLock = v;
        },
      },
      "Scrub mode": {
        value: state.current.studio.scrubMode,
        onChange: (v: boolean) => {
          state.current.studio.scrubMode = v;
        },
      },
      "Scrub timeline": {
        value: state.current.studio.scrubProgress,
        min: 0,
        max: 1,
        step: 0.005,
        onChange: (v: number) => {
          state.current.studio.scrubProgress = v;
        },
      },
    }),

    "Transition IN (Choreography)": folder({
      "1. Lock (Brackets)": folder(
        {
          Start: {
            value: tr.lock.start,
            min: 0,
            max: 2,
            step: 0.02,
            onChange: (v: number) => {
              tr.lock.start = v;
            },
          },
          Duration: {
            value: tr.lock.duration,
            min: 0.05,
            max: 2,
            step: 0.02,
            onChange: (v: number) => {
              tr.lock.duration = v;
            },
          },
          "Tighten pinch (px)": {
            value: tr.lockBracketTighten,
            min: 0,
            max: 40,
            step: 1,
            onChange: (v: number) => {
              tr.lockBracketTighten = v;
            },
          },
          "Expand (px)": {
            value: tr.lockBracketExpand,
            min: 0,
            max: 60,
            step: 1,
            onChange: (v: number) => {
              tr.lockBracketExpand = v;
            },
          },
          "Scale punch": {
            value: tr.lockScalePunch,
            min: 0,
            max: 0.2,
            step: 0.005,
            onChange: (v: number) => {
              tr.lockScalePunch = v;
            },
          },
        },
        { collapsed: true },
      ),
      "2. Scatter (Mosaic)": folder(
        {
          Start: {
            value: tr.scatter.start,
            min: 0,
            max: 3,
            step: 0.02,
            onChange: (v: number) => {
              tr.scatter.start = v;
            },
          },
          Duration: {
            value: tr.scatter.duration,
            min: 0.05,
            max: 3,
            step: 0.02,
            onChange: (v: number) => {
              tr.scatter.duration = v;
            },
          },
          Easing: {
            value: tr.scatter.easing,
            options: EASING_OPTIONS,
            onChange: (v: string) => {
              tr.scatter.easing = v as EasingName;
            },
          },
          "Scatter distance": {
            value: tr.scatterDistance,
            min: 500,
            max: 6000,
            step: 50,
            onChange: (v: number) => {
              tr.scatterDistance = v;
            },
          },
        },
        { collapsed: true },
      ),
      "3. Reveal (Hero Morph)": trackRow("reveal", 3, 3),
      "4. Hero (Peak Zoom)": folder(
        {
          Start: {
            value: tr.hero.start,
            min: 0,
            max: 3,
            step: 0.02,
            onChange: (v: number) => {
              tr.hero.start = v;
            },
          },
          Duration: {
            value: tr.hero.duration,
            min: 0.05,
            max: 3,
            step: 0.02,
            onChange: (v: number) => {
              tr.hero.duration = v;
            },
          },
          Easing: {
            value: tr.hero.easing,
            options: EASING_OPTIONS,
            onChange: (v: string) => {
              tr.hero.easing = v as EasingName;
            },
          },
          "Hero zoom (x detail)": {
            value: tr.heroZoom,
            min: 1,
            max: 2.5,
            step: 0.05,
            onChange: (v: number) => {
              tr.heroZoom = v;
            },
          },
        },
        { collapsed: true },
      ),
      "5. Slide (Secondary Entry)": folder(
        {
          Start: {
            value: tr.slide.start,
            min: 0,
            max: 4,
            step: 0.02,
            onChange: (v: number) => {
              tr.slide.start = v;
            },
          },
          Duration: {
            value: tr.slide.duration,
            min: 0.05,
            max: 4,
            step: 0.02,
            onChange: (v: number) => {
              tr.slide.duration = v;
            },
          },
          Easing: {
            value: tr.slide.easing,
            options: EASING_OPTIONS,
            onChange: (v: string) => {
              tr.slide.easing = v as EasingName;
            },
          },
          "Slide offset (px)": {
            value: tr.slideOffset,
            min: 0,
            max: 1200,
            step: 20,
            onChange: (v: number) => {
              tr.slideOffset = v;
            },
          },
        },
        { collapsed: true },
      ),
      "6. Column Fade (Opacity)": trackRow("columnFade", 4, 3),
      "7. Scroll (Wheel Spin & Blur)": folder(
        {
          "Media count to spin": {
            value: tr.spinMediaCount,
            min: 1,
            max: 60,
            step: 1,
            label: "Items to scroll past",
            onChange: (v: number) => {
              tr.spinMediaCount = v;
            },
          },
          "Spin easing": {
            value: tr.spinEasing,
            options: EASING_OPTIONS,
            label: "Spin curve",
            onChange: (v: string) => {
              tr.spinEasing = v as EasingName;
            },
          },
          Start: {
            value: tr.scroll.start,
            min: 0,
            max: 5,
            step: 0.02,
            onChange: (v: number) => {
              tr.scroll.start = v;
            },
          },
          Duration: {
            value: tr.scroll.duration,
            min: 0.2,
            max: 6,
            step: 0.05,
            onChange: (v: number) => {
              tr.scroll.duration = v;
            },
          },
          "Motion blur enabled": {
            value: tr.wheelMotionBlur,
            label: "Enable motion blur",
            onChange: (v: boolean) => {
              tr.wheelMotionBlur = v;
            },
          },
          "Motion blur strength": {
            value: tr.wheelMotionBlurStrength,
            min: 0.1,
            max: 3.0,
            step: 0.1,
            label: "Blur intensity",
            onChange: (v: number) => {
              tr.wheelMotionBlurStrength = v;
            },
          },
          "Motion blur max": {
            value: tr.wheelMotionBlurMax,
            min: 0.01,
            max: 0.25,
            step: 0.01,
            label: "Max blur streak",
            onChange: (v: number) => {
              tr.wheelMotionBlurMax = v;
            },
          },
        },
        { collapsed: false },
      ),
      "8. Dezoom (Framing)": folder(
        {
          Start: {
            value: tr.dezoom.start,
            min: 0,
            max: 5,
            step: 0.02,
            onChange: (v: number) => {
              tr.dezoom.start = v;
            },
          },
          Duration: {
            value: tr.dezoom.duration,
            min: 0.1,
            max: 5,
            step: 0.05,
            onChange: (v: number) => {
              tr.dezoom.duration = v;
            },
          },
          Easing: {
            value: tr.dezoom.easing,
            options: EASING_OPTIONS,
            onChange: (v: string) => {
              tr.dezoom.easing = v as EasingName;
            },
          },
          "Detail zoom (x base)": {
            value: tr.detailZoom,
            min: 0.5,
            max: 4,
            step: 0.05,
            onChange: (v: number) => {
              tr.detailZoom = v;
            },
          },
        },
        { collapsed: true },
      ),
      "9. Text Reveal": folder(
        {
          "Text reveal at (s)": {
            value: tr.textRevealAt,
            min: 0,
            max: 6,
            step: 0.05,
            onChange: (v: number) => {
              tr.textRevealAt = v;
            },
          },
        },
        { collapsed: true },
      ),
    }),

    "Transition OUT (Exit)": folder({
      "Exit (Return to Mosaic)": folder(
        {
          Duration: {
            value: tr.exit.duration,
            min: 0.1,
            max: 3,
            step: 0.05,
            onChange: (v: number) => {
              tr.exit.duration = v;
            },
          },
          Easing: {
            value: tr.exit.easing,
            options: EASING_OPTIONS,
            onChange: (v: string) => {
              tr.exit.easing = v as EasingName;
            },
          },
        },
        { collapsed: true },
      ),
      "Exit slide offset": {
        value: tr.exitSlideOffset,
        min: 0,
        max: 1200,
        step: 20,
        onChange: (v: number) => {
          tr.exitSlideOffset = v;
        },
      },
      "Mosaic return delay (s)": {
        value: tr.repulseReturnDelay,
        min: 0,
        max: 1.5,
        step: 0.05,
        onChange: (v: number) => {
          tr.repulseReturnDelay = v;
        },
      },
      "Camera return delay (s)": {
        value: tr.cameraReturnDelay,
        min: 0,
        max: 1,
        step: 0.02,
        onChange: (v: number) => {
          tr.cameraReturnDelay = v;
        },
      },
    }),
  }));

  return null;
}

// ── 6. Tab Focus ────────────────────────────────────────────────
function FocusTab({
  state,
  onResetTransition,
  runtime,
  selectedArtifact,
  apiStatus = "idle",
  onCloseDetail,
}: {
  state: PlayDebugRef;
  onResetTransition: () => void;
  runtime?: RefObject<PlayRuntimeState>;
  selectedArtifact?: ArtifactDetail | null;
  apiStatus?: "idle" | "fetching" | "ready" | "error";
  onCloseDetail?: () => void;
}) {
  const tr = state.current.transition;
  const [, set] = useControls("Focus View & Wheel Arc", () => ({
    Actions: buttonGroup({
      "Exit Detail": () => (onCloseDetail ? onCloseDetail() : onResetTransition()),
      "Force Reset": onResetTransition,
    }),

    "Wheel & Arc Curvature": folder({
      "Center column ratio": {
        value: tr.detailColumnRatio,
        min: 0.1,
        max: 1.0,
        step: 0.02,
        label: "Column position (0.5=center)",
        onChange: (v: number) => {
          tr.detailColumnRatio = v;
        },
      },
      "Arc curvature (px)": {
        value: tr.arcCurvature,
        min: -400,
        max: 400,
        step: 10,
        label: "Arc curvature (center inset px)",
        onChange: (v: number) => {
          tr.arcCurvature = v;
        },
      },
      "Arc rotation (deg)": {
        value: tr.arcRotation,
        min: -30,
        max: 30,
        step: 1,
        label: "Rotation toward exterior (deg)",
        onChange: (v: number) => {
          tr.arcRotation = v;
        },
      },
      "Media gap (px)": {
        value: tr.mediaGap,
        min: 0,
        max: 120,
        step: 2,
        onChange: (v: number) => {
          tr.mediaGap = v;
        },
      },
      "Desktop width ratio": {
        value: tr.desktopMediaWidthRatio,
        min: 0.15,
        max: 0.6,
        step: 0.01,
        onChange: (v: number) => {
          tr.desktopMediaWidthRatio = v;
        },
      },
      "Mobile height ratio": {
        value: tr.mobileMediaHeightRatio,
        min: 0.2,
        max: 0.8,
        step: 0.02,
        onChange: (v: number) => {
          tr.mobileMediaHeightRatio = v;
        },
      },
    }),

    "Wheel Motion Blur": folder({
      "Motion blur enabled": {
        value: tr.wheelMotionBlur,
        label: "Enable motion blur",
        onChange: (v: boolean) => {
          tr.wheelMotionBlur = v;
        },
      },
      "Motion blur strength": {
        value: tr.wheelMotionBlurStrength,
        min: 0.1,
        max: 3.0,
        step: 0.1,
        label: "Blur intensity",
        onChange: (v: number) => {
          tr.wheelMotionBlurStrength = v;
        },
      },
      "Motion blur max": {
        value: tr.wheelMotionBlurMax,
        min: 0.01,
        max: 0.25,
        step: 0.01,
        label: "Max blur streak",
        onChange: (v: number) => {
          tr.wheelMotionBlurMax = v;
        },
      },
    }),

    "Center Magnetic Snap": folder({
      "Snap enabled": {
        value: tr.snapEnabled,
        label: "Snap to center enabled",
        onChange: (v: boolean) => {
          tr.snapEnabled = v;
        },
      },
      "Snap strength": {
        value: tr.snapStrength,
        min: 1,
        max: 30,
        step: 1,
        label: "Snap magnetic strength",
        onChange: (v: number) => {
          tr.snapStrength = v;
        },
      },
      "Snap delay (s)": {
        value: tr.snapDelay,
        min: 0.0,
        max: 1.0,
        step: 0.05,
        label: "Snap idle delay (s)",
        onChange: (v: number) => {
          tr.snapDelay = v;
        },
      },
      "Snap velocity threshold": {
        value: tr.snapThreshold,
        min: 0.01,
        max: 0.5,
        step: 0.01,
        label: "Snap velocity threshold",
        onChange: (v: number) => {
          tr.snapThreshold = v;
        },
      },
    }),

    "Free Scroll (Inertia)": folder({
      "Scroll damping": {
        value: tr.detailScrollDamping,
        min: 2,
        max: 30,
        step: 0.5,
        onChange: (v: number) => {
          tr.detailScrollDamping = v;
        },
      },
      "Scroll speed multiplier": {
        value: tr.detailScrollSpeed,
        min: 0.2,
        max: 3.0,
        step: 0.05,
        onChange: (v: number) => {
          tr.detailScrollSpeed = v;
        },
      },
    }),

    "Status Monitor": folder({
      Phase: {
        value: "idle",
        editable: false,
      },
      "Target Slug": {
        value: "none",
        editable: false,
      },
      "API Status": {
        value: "idle",
        editable: false,
      },
      "Scroll Y": {
        value: 0,
        editable: false,
      },
      "Clock t": {
        value: "0.00 s",
        editable: false,
      },
    }),
  }));

  // Update read-only monitor fields
  useEffect(() => {
    let handle: number;
    let lastPhase = "";
    let lastSlug = "";
    let lastStatus = "";
    let lastScroll = -999999;
    let lastClock = "";

    function poll() {
      if (runtime?.current) {
        const rc = runtime.current;
        const currentPhase = rc.transition.phase;
        const currentSlug = selectedArtifact?.slug ?? "none";
        const currentScroll = Math.round(rc.transition.columnScrollY);
        const currentClock = `${rc.transition.t.toFixed(2)} s`;

        if (
          currentPhase !== lastPhase ||
          currentSlug !== lastSlug ||
          apiStatus !== lastStatus ||
          currentScroll !== lastScroll ||
          currentClock !== lastClock
        ) {
          lastPhase = currentPhase;
          lastSlug = currentSlug;
          lastStatus = apiStatus;
          lastScroll = currentScroll;
          lastClock = currentClock;

          set({
            Phase: currentPhase,
            "Target Slug": currentSlug,
            "API Status": apiStatus,
            "Scroll Y": currentScroll,
            "Clock t": currentClock,
          });
        }
      }
      handle = requestAnimationFrame(poll);
    }
    handle = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(handle);
  }, [runtime, selectedArtifact, apiStatus, set]);

  return null;
}

// ── Main Debug Component ────────────────────────────────────────
export function PlayDebug({
  state,
  stats,
  onLayoutChange,
  onReplayLock,
  onSimulateSelect,
  onResetTransition,
  runtime,
  selectedArtifact,
  apiStatus = "idle",
  onCloseDetail,
}: {
  state: PlayDebugRef;
  stats?: LayoutStats;
  onLayoutChange: () => void;
  onReplayLock: () => void;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
  runtime?: RefObject<PlayRuntimeState>;
  selectedArtifact?: ArtifactDetail | null;
  apiStatus?: "idle" | "fetching" | "ready" | "error";
  onCloseDetail?: () => void;
}) {
  const initializedRef = useRef<boolean | null>(null);
  if (initializedRef.current == null) {
    restore(state.current);
    initializedRef.current = true;
  }

  const [activeTab, setActiveTab] = useState<DebugTab>(() => loadSavedTab());

  const handleTabChange = (tab: DebugTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TAB_STORAGE_KEY, tab);
      } catch {
        // ignore
      }
    }
  };

  const saveToLocalStorage = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      toast.success("Settings saved to localStorage");
    } catch {
      toast.error("Unable to save settings to localStorage");
    }
  };

  const copyJson = () => {
    navigator.clipboard
      .writeText(JSON.stringify(state.current, null, 2))
      .then(
        () => toast.success("Configuration copied to clipboard"),
        () => toast.error("Failed to copy configuration to clipboard"),
      );
  };

  return (
    <>
      {/* Sleek Floating Tab Navigation Header */}
      <div className="fixed top-3 right-3 z-[999999] flex flex-col items-end pointer-events-auto select-none">
        <div className="flex items-center gap-1 p-1 bg-[#141414]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl mb-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3 py-1 text-xs font-mono rounded transition-all duration-150 capitalize ${
                  isActive
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          <div className="w-[1px] h-4 bg-white/15 mx-1" />
          <button
            onClick={saveToLocalStorage}
            title="Save settings to localStorage"
            className="px-2.5 py-1 text-xs font-mono text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            Save
          </button>
          <button
            onClick={copyJson}
            title="Copy JSON config to clipboard"
            className="px-2.5 py-1 text-xs font-mono text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      <Leva
        theme={LEVA_THEME}
        titleBar={{ title: `oré • debug (${activeTab})` }}
      />

      {activeTab === "camera" && <CameraTab state={state} />}
      {activeTab === "media" && <MediaTab state={state} />}
      {activeTab === "canvas" && (
        <CanvasTab
          state={state}
          stats={stats}
          onLayoutChange={onLayoutChange}
        />
      )}
      {activeTab === "selection" && <SelectionTab state={state} />}
      {activeTab === "transition" && (
        <TransitionTab
          state={state}
          onReplayLock={onReplayLock}
          onSimulateSelect={onSimulateSelect}
          onResetTransition={onResetTransition}
        />
      )}
      {activeTab === "focus" && (
        <FocusTab
          state={state}
          onResetTransition={onResetTransition}
          runtime={runtime}
          selectedArtifact={selectedArtifact}
          apiStatus={apiStatus}
          onCloseDetail={onCloseDetail}
        />
      )}
    </>
  );
}
