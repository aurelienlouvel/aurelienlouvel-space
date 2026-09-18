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
  TRANSITION_PRESETS,
  type TransitionPresetName,
  type EasingName,
} from "./transition-presets";

const STORAGE_KEY = "play-debug-v24";
const VISIBILITY_STORAGE_KEY = "play-debug-visibility-v1";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const EASING_OPTIONS: EasingName[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInCubic",
  "easeInOutCubic",
  "easeOutExpo",
  "easeOutQuint",
];

export interface SectionVisibility {
  studio: boolean;
  artifactDetails: boolean;
  transition: boolean;
  brackets: boolean;
  indicator: boolean;
  camera: boolean;
  layout: boolean;
  stats: boolean;
  pan: boolean;
  physics: boolean;
  overlay: boolean;
  image: boolean;
}

export type ViewPreset =
  | "studio"
  | "visuals"
  | "layout"
  | "physics"
  | "overlay"
  | "all"
  | "custom";

const DEFAULT_VISIBILITY: SectionVisibility = {
  studio: true,
  artifactDetails: true,
  transition: true,
  brackets: false,
  indicator: false,
  camera: false,
  layout: false,
  stats: false,
  pan: false,
  physics: false,
  overlay: false,
  image: false,
};

const PRESET_MAP: Record<Exclude<ViewPreset, "custom">, SectionVisibility> = {
  studio: {
    studio: true,
    artifactDetails: true,
    transition: true,
    brackets: false,
    indicator: false,
    camera: false,
    layout: false,
    stats: false,
    pan: false,
    physics: false,
    overlay: false,
    image: false,
  },
  visuals: {
    studio: false,
    artifactDetails: false,
    transition: false,
    brackets: true,
    indicator: true,
    camera: false,
    layout: false,
    stats: false,
    pan: false,
    physics: false,
    overlay: false,
    image: true,
  },
  layout: {
    studio: false,
    artifactDetails: false,
    transition: false,
    brackets: false,
    indicator: false,
    camera: true,
    layout: true,
    stats: true,
    pan: false,
    physics: false,
    overlay: false,
    image: false,
  },
  physics: {
    studio: false,
    artifactDetails: false,
    transition: false,
    brackets: false,
    indicator: false,
    camera: false,
    layout: false,
    stats: false,
    pan: true,
    physics: true,
    overlay: false,
    image: false,
  },
  overlay: {
    studio: false,
    artifactDetails: false,
    transition: false,
    brackets: false,
    indicator: false,
    camera: false,
    layout: false,
    stats: false,
    pan: false,
    physics: false,
    overlay: true,
    image: false,
  },
  all: {
    studio: true,
    artifactDetails: true,
    transition: true,
    brackets: true,
    indicator: true,
    camera: true,
    layout: true,
    stats: true,
    pan: true,
    physics: true,
    overlay: true,
    image: true,
  },
};

function loadVisibility(): { visibility: SectionVisibility; preset: ViewPreset } {
  if (typeof window === "undefined") {
    return { visibility: DEFAULT_VISIBILITY, preset: "studio" };
  }
  try {
    const raw = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
    if (!raw) return { visibility: DEFAULT_VISIBILITY, preset: "studio" };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.visibility === "object") {
      return {
        visibility: { ...DEFAULT_VISIBILITY, ...parsed.visibility },
        preset: (parsed.preset as ViewPreset) || "custom",
      };
    }
  } catch {
    // fallback
  }
  return { visibility: DEFAULT_VISIBILITY, preset: "studio" };
}

function saveVisibility(visibility: SectionVisibility, preset: ViewPreset) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      VISIBILITY_STORAGE_KEY,
      JSON.stringify({ visibility, preset }),
    );
  } catch {
    // ignore
  }
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

// ── 0. Display Filter & Actions Control ─────────────────────────
function SettingsSection({
  preset,
  visibility,
  onPresetChange,
  onToggle,
  onSave,
  onCopy,
}: {
  preset: ViewPreset;
  visibility: SectionVisibility;
  onPresetChange: (p: ViewPreset) => void;
  onToggle: (key: keyof SectionVisibility, val: boolean) => void;
  onSave: () => void;
  onCopy: () => void;
}) {
  const setControlsRef = useRef<((values: Record<string, unknown>) => void) | null>(null);

  const [, setControls] = useControls("⚙️ Display & Actions", () => ({
    "Filter Preset": {
      value: preset,
      options: {
        "🎬 Studio & Transition": "studio",
        "🔲 Visuals (Brackets & Indicator)": "visuals",
        "🪐 Layout & Camera": "layout",
        "🧲 Physics & Pan": "physics",
        "🌊 Selection Overlay": "overlay",
        "✨ Show All Sections": "all",
        "🛠 Custom Selection": "custom",
      },
      onChange: (val: ViewPreset, _p: string, ctx: { initial: boolean }) => {
        if (!ctx.initial) {
          onPresetChange(val);
        }
      },
    },
    "Toggle Sections": folder(
      {
        "Studio Animation": {
          value: visibility.studio,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("studio", v);
          },
        },
        "Artifact Details": {
          value: visibility.artifactDetails,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("artifactDetails", v);
          },
        },
        "Transition (3 Phases)": {
          value: visibility.transition,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("transition", v);
          },
        },
        "Corner Brackets": {
          value: visibility.brackets,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("brackets", v);
          },
        },
        "Focus Indicator": {
          value: visibility.indicator,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("indicator", v);
          },
        },
        "Camera & Fisheye": {
          value: visibility.camera,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("camera", v);
          },
        },
        "Gravity Layout": {
          value: visibility.layout,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("layout", v);
          },
        },
        "Layout Stats": {
          value: visibility.stats,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("stats", v);
          },
        },
        "Pan & Inertia": {
          value: visibility.pan,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("pan", v);
          },
        },
        "Physics (Repulsion)": {
          value: visibility.physics,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("physics", v);
          },
        },
        "Selection Overlay": {
          value: visibility.overlay,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("overlay", v);
          },
        },
        "Image Plane": {
          value: visibility.image,
          onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
            if (!ctx.initial) onToggle("image", v);
          },
        },
      },
      { collapsed: true },
    ),
    actions: buttonGroup({
      "💾 Save Settings": onSave,
      "📋 Copy JSON": onCopy,
    }),
  }));

  useEffect(() => {
    setControlsRef.current = setControls as unknown as (
      values: Record<string, unknown>,
    ) => void;
  }, [setControls]);

  // Synchronize Leva checkboxes when preset changes externally
  useEffect(() => {
    setControlsRef.current?.({
      "Filter Preset": preset,
      "Studio Animation": visibility.studio,
      "Artifact Details": visibility.artifactDetails,
      "Transition (3 Phases)": visibility.transition,
      "Corner Brackets": visibility.brackets,
      "Focus Indicator": visibility.indicator,
      "Camera & Fisheye": visibility.camera,
      "Gravity Layout": visibility.layout,
      "Layout Stats": visibility.stats,
      "Pan & Inertia": visibility.pan,
      "Physics (Repulsion)": visibility.physics,
      "Selection Overlay": visibility.overlay,
      "Image Plane": visibility.image,
    });
  }, [preset, visibility]);

  return null;
}

// ── 1. Animation Studio ─────────────────────────────────────────
function StudioSection({
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
  useControls("🎬 Animation Studio", () => ({
    actions: buttonGroup({
      "▶ Replay Lock": onReplayLock,
      "▶ Simulate Select": onSimulateSelect,
      "⏹ Reset": onResetTransition,
    }),
    "Infinite lock loop": {
      value: state.current.studio.loopLock,
      label: "Infinite loop (L)",
      onChange: (v: boolean) => {
        state.current.studio.loopLock = v;
      },
    },
    "Speed (slow-mo)": {
      value: state.current.studio.speed,
      label: "Playback speed",
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
    "Manual scrub": {
      value: state.current.studio.scrubMode,
      label: "Pause & Scrub",
      onChange: (v: boolean) => {
        state.current.studio.scrubMode = v;
      },
    },
    "Frame scrubber": {
      value: state.current.studio.scrubProgress,
      min: 0.0,
      max: 1.0,
      step: 0.005,
      label: "Scrubber (0-100%)",
      onChange: (v: number) => {
        state.current.studio.scrubProgress = v;
      },
    },
  }));

  return null;
}

// ── 2. Transition (3 Phases) ────────────────────────────────────
function TransitionSection({ state }: { state: PlayDebugRef }) {
  const setControlsRef = useRef<((values: Record<string, unknown>) => void) | null>(null);

  const [, setTransitionControls] = useControls("⚡ Transition (Phases)", () => ({
    preset: {
      value: state.current.transition.preset,
      options: {
        Cinematic: "cinematic",
        Snappy: "snappy",
        Dramatic: "dramatic",
        Custom: "custom",
      },
      onChange: (
        presetKey: TransitionPresetName,
        _p: string,
        ctx: { initial: boolean },
      ) => {
        if (
          !ctx.initial &&
          presetKey !== "custom" &&
          TRANSITION_PRESETS[presetKey]
        ) {
          const p = TRANSITION_PRESETS[presetKey];
          Object.assign(state.current.transition, p);
          setControlsRef.current?.({
            "Hold duration (s)": p.selectDuration,
            "Camera zoom": p.selectZoom,
            "Media scale": p.selectScale,
            "Repulsion tension": p.selectRepulse,
            "Hold easing": p.selectEasing,
            "Lock duration (s)": p.lockDuration,
            "Bracket pinch (px)": p.lockBracketTighten,
            "Bracket outward fade (px)": p.lockBracketExpand,
            "Scale pop punch": p.lockScalePunch,
            "Wave exit duration (s)": p.overlayExitDuration,
            "Delay before burst (s)": p.burstDelay,
            "Burst duration (s)": p.burstDuration,
            "Burst repulsion": p.burstRepulse,
            "Burst easing": p.burstEasing,
            "Main zoom factor": p.mainZoomFactor,
            "Main zoom duration (s)": p.mainZoomDuration,
            "Main zoom easing": p.mainZoomEasing,
            "Main hold duration (s)": p.mainHoldDuration,
            "Stack slide offset (px)": p.stackSlideOffset,
            "M0 upward rise (px)": p.stackM0Rise,
            "Stack entrance duration (s)": p.stackEntranceDuration,
            "Stack entrance easing": p.stackEntranceEasing,
            "Spin duration (s)": p.spinDezoomDuration,
            "Reel loops": p.reelLoops,
            "Spin easing": p.spinEasing,
            "Dezoom easing": p.dezoomEasing,
            "Text reveal delay (s)": p.textRevealDelay,
            "Pause after spin (s)": p.reelEndDelay,
            "Burst zoom (dezoom)": p.burstZoom,
            "Media column ratio": p.detailColumnRatio,
            "Media width % (desktop)": p.desktopMediaWidthRatio,
            "Media height % (mobile)": p.mobileMediaHeightRatio,
            "Media gap (px)": p.mediaGap,
            "Scroll damping (lerp)": p.detailScrollDamping,
            "Scroll speed": p.detailScrollSpeed,
            "Exit duration (s)": p.exitDuration,
            "Camera return delay (s)": p.cameraReturnDelay,
            "Repulsion return delay (s)": p.repulseReturnDelay,
            "Exit slide-out offset (px)": p.exitSlideOffset,
            "Exit easing": p.exitEasing,
          });
        }
      },
    },
    "1 • Progress (Hold)": folder(
      {
        "Hold duration (s)": {
          value: state.current.transition.selectDuration,
          min: 0.2,
          max: 2.0,
          step: 0.05,
          onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
            state.current.transition.selectDuration = v;
            if (!ctx.initial && state.current.transition.preset !== "custom") {
              state.current.transition.preset = "custom";
            }
          },
        },
        "Camera zoom": {
          value: state.current.transition.selectZoom,
          min: 1.0,
          max: 1.5,
          step: 0.01,
          onChange: (v: number) => {
            state.current.transition.selectZoom = v;
          },
        },
        "Media scale": {
          value: state.current.transition.selectScale,
          min: 1.0,
          max: 1.25,
          step: 0.01,
          onChange: (v: number) => {
            state.current.transition.selectScale = v;
          },
        },
        "Repulsion tension": {
          value: state.current.transition.selectRepulse,
          min: 0,
          max: 3000,
          step: 50,
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
      },
      { collapsed: false },
    ),
    "2 • Select Lock Animation": folder(
      {
        "Lock duration (s)": {
          value: state.current.transition.lockDuration,
          min: 0.1,
          max: 2.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.lockDuration = v;
          },
        },
        "Bracket pinch (px)": {
          value: state.current.transition.lockBracketTighten,
          min: 0,
          max: 30,
          step: 0.5,
          onChange: (v: number) => {
            state.current.transition.lockBracketTighten = v;
          },
        },
        "Bracket outward fade (px)": {
          value: state.current.transition.lockBracketExpand,
          min: 0,
          max: 40,
          step: 0.5,
          onChange: (v: number) => {
            state.current.transition.lockBracketExpand = v;
          },
        },
        "Scale pop punch": {
          value: state.current.transition.lockScalePunch,
          min: 0.0,
          max: 0.15,
          step: 0.005,
          onChange: (v: number) => {
            state.current.transition.lockScalePunch = v;
          },
        },
        "Wave exit duration (s)": {
          value: state.current.transition.overlayExitDuration,
          min: 0.1,
          max: 1.5,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.overlayExitDuration = v;
          },
        },
        "Delay before burst (s)": {
          value: state.current.transition.burstDelay,
          min: 0.0,
          max: 1.5,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.burstDelay = v;
          },
        },
      },
      { collapsed: false },
    ),
    "3 • Burst Transition (M0 Isolation)": folder(
      {
        "Burst duration (s)": {
          value: state.current.transition.burstDuration ?? 0.35,
          min: 0.05,
          max: 2.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.burstDuration = v;
          },
        },
        "Burst repulsion": {
          value: state.current.transition.burstRepulse,
          min: 10000,
          max: 300000,
          step: 5000,
          onChange: (v: number) => {
            state.current.transition.burstRepulse = v;
          },
        },
        "Burst easing": {
          value: state.current.transition.burstEasing,
          options: EASING_OPTIONS,
          onChange: (v: string) => {
            state.current.transition.burstEasing = v as EasingName;
          },
        },
      },
      { collapsed: false },
    ),
    "4 • Zoom Principal (M0 Focus)": folder(
      {
        "Main zoom factor": {
          value: state.current.transition.mainZoomFactor ?? 1.28,
          min: 1.0,
          max: 2.0,
          step: 0.02,
          onChange: (v: number) => {
            state.current.transition.mainZoomFactor = v;
          },
        },
        "Main zoom duration (s)": {
          value: state.current.transition.mainZoomDuration ?? 0.40,
          min: 0.1,
          max: 2.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.mainZoomDuration = v;
          },
        },
        "Main zoom easing": {
          value: state.current.transition.mainZoomEasing ?? "easeOutQuint",
          options: EASING_OPTIONS,
          onChange: (v: string) => {
            state.current.transition.mainZoomEasing = v as EasingName;
          },
        },
      },
      { collapsed: false },
    ),
    "5 • Pause Contemplative": folder(
      {
        "Main hold duration (s)": {
          value: state.current.transition.mainHoldDuration ?? 0.25,
          min: 0.0,
          max: 2.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.mainHoldDuration = v;
          },
        },
      },
      { collapsed: false },
    ),
    "6 • Émergence Carte Inférieure": folder(
      {
        "Stack entrance duration (s)": {
          value: state.current.transition.stackEntranceDuration ?? 0.35,
          min: 0.1,
          max: 2.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.stackEntranceDuration = v;
          },
        },
        "Stack slide offset (px)": {
          value: state.current.transition.stackSlideOffset ?? 350,
          min: 0,
          max: 1200,
          step: 20,
          onChange: (v: number) => {
            state.current.transition.stackSlideOffset = v;
          },
        },
        "M0 upward rise (px)": {
          value: state.current.transition.stackM0Rise ?? 90,
          min: 0,
          max: 400,
          step: 5,
          onChange: (v: number) => {
            state.current.transition.stackM0Rise = v;
          },
        },
        "Stack entrance easing": {
          value: state.current.transition.stackEntranceEasing ?? "easeOutQuad",
          options: EASING_OPTIONS,
          onChange: (v: string) => {
            state.current.transition.stackEntranceEasing = v as EasingName;
          },
        },
      },
      { collapsed: false },
    ),
    "7 • 🎰 777 Spin & Dézoom Simultanés": folder(
      {
        "Spin duration (s)": {
          value: state.current.transition.spinDezoomDuration ?? state.current.transition.reelDuration ?? 1.5,
          min: 0.3,
          max: 4.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.spinDezoomDuration = v;
            state.current.transition.reelDuration = v;
            state.current.transition.dezoomDuration = v;
          },
        },
        "Reel loops": {
          value: state.current.transition.reelLoops ?? 3,
          min: 1,
          max: 8,
          step: 1,
          onChange: (v: number) => {
            state.current.transition.reelLoops = v;
          },
        },
        "Spin easing": {
          value: state.current.transition.spinEasing ?? state.current.transition.reelEasing ?? "easeInOutCubic",
          options: EASING_OPTIONS,
          onChange: (v: string) => {
            state.current.transition.spinEasing = v as EasingName;
            state.current.transition.reelEasing = v as EasingName;
          },
        },
        "Dezoom easing": {
          value: state.current.transition.dezoomEasing ?? "easeInOutCubic",
          options: EASING_OPTIONS,
          onChange: (v: string) => {
            state.current.transition.dezoomEasing = v as EasingName;
          },
        },
        "Text reveal delay (s)": {
          value: state.current.transition.textRevealDelay ?? 0.25,
          min: 0.0,
          max: 2.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.textRevealDelay = v;
          },
        },
        "Pause after spin (s)": {
          value: state.current.transition.reelEndDelay ?? 0.15,
          min: 0.0,
          max: 1.5,
          step: 0.02,
          onChange: (v: number) => {
            state.current.transition.reelEndDelay = v;
          },
        },
      },
      { collapsed: false },
    ),
    "8 • Vue Détail & Cadrage": folder(
      {
        "Burst zoom (dezoom)": {
          value: state.current.transition.burstZoom,
          min: 0.4,
          max: 2.5,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.burstZoom = v;
          },
        },
        "Media column ratio": {
          value: state.current.transition.detailColumnRatio,
          min: 0.25,
          max: 0.70,
          step: 0.02,
          onChange: (v: number) => {
            state.current.transition.detailColumnRatio = v;
          },
        },
        "Media width % (desktop)": {
          value: state.current.transition.desktopMediaWidthRatio,
          min: 0.15,
          max: 0.60,
          step: 0.01,
          onChange: (v: number) => {
            state.current.transition.desktopMediaWidthRatio = v;
          },
        },
        "Media height % (mobile)": {
          value: state.current.transition.mobileMediaHeightRatio,
          min: 0.25,
          max: 0.75,
          step: 0.01,
          onChange: (v: number) => {
            state.current.transition.mobileMediaHeightRatio = v;
          },
        },
        "Media gap (px)": {
          value: state.current.transition.mediaGap ?? 32,
          min: 0,
          max: 120,
          step: 2,
          onChange: (v: number) => {
            state.current.transition.mediaGap = v;
          },
        },
        "Scroll damping (lerp)": {
          value: state.current.transition.detailScrollDamping ?? 12,
          min: 2,
          max: 30,
          step: 1,
          onChange: (v: number) => {
            state.current.transition.detailScrollDamping = v;
          },
        },
        "Scroll speed": {
          value: state.current.transition.detailScrollSpeed ?? 1.0,
          min: 0.2,
          max: 3.0,
          step: 0.1,
          onChange: (v: number) => {
            state.current.transition.detailScrollSpeed = v;
          },
        },
      },
      { collapsed: false },
    ),
    "9 • Return to Page": folder(
      {
        "Exit duration (s)": {
          value: state.current.transition.exitDuration ?? 0.6,
          min: 0.1,
          max: 3.0,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.exitDuration = v;
          },
        },
        "Camera return delay (s)": {
          value: state.current.transition.cameraReturnDelay ?? 0.0,
          min: 0.0,
          max: 1.0,
          step: 0.02,
          onChange: (v: number) => {
            state.current.transition.cameraReturnDelay = v;
          },
        },
        "Repulsion return delay (s)": {
          value: state.current.transition.repulseReturnDelay,
          min: 0.0,
          max: 1.5,
          step: 0.05,
          onChange: (v: number) => {
            state.current.transition.repulseReturnDelay = v;
          },
        },
        "Exit slide-out offset (px)": {
          value: state.current.transition.exitSlideOffset ?? 350,
          min: 0,
          max: 1200,
          step: 20,
          onChange: (v: number) => {
            state.current.transition.exitSlideOffset = v;
          },
        },
        "Exit easing": {
          value: state.current.transition.exitEasing ?? "easeInOutCubic",
          options: EASING_OPTIONS,
          onChange: (v: string) => {
            state.current.transition.exitEasing = v as EasingName;
          },
        },
      },
      { collapsed: false },
    ),
  }));

  useEffect(() => {
    setControlsRef.current = setTransitionControls as unknown as (
      values: Record<string, unknown>,
    ) => void;
  }, [setTransitionControls]);

  return null;
}

// ── 2b. Artifact Details (artifact-details) ─────────────────────
function ArtifactDetailsSection({
  state,
  onSimulateSelect,
  onResetTransition,
  runtime,
  selectedArtifact,
  apiStatus = "idle",
  onCloseDetail,
}: {
  state: PlayDebugRef;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
  runtime?: RefObject<PlayRuntimeState>;
  selectedArtifact?: ArtifactDetail | null;
  apiStatus?: "idle" | "fetching" | "ready" | "error";
  onCloseDetail?: () => void;
}) {
  const [, set] = useControls(
    "artifact-details",
    () => ({
      Actions: buttonGroup({
        "▶ Enter Detail": onSimulateSelect,
        "◀ Exit Detail": () => (onCloseDetail ? onCloseDetail() : onResetTransition()),
        "🔄 Force Reset": onResetTransition,
      }),
      "Status Monitor": folder(
        {
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
          "Media Count": {
            value: 1,
            editable: false,
          },
          "Scroll Y": {
            value: 0,
            editable: false,
          },
        },
        { collapsed: false },
      ),
      "1 • Enter & Burst (M0 Isolation)": folder(
        {
          "Burst duration (s)": {
            value: state.current.transition.burstDuration ?? 0.35,
            min: 0.05,
            max: 2.0,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.burstDuration = v;
            },
          },
          "Burst easing": {
            value: state.current.transition.burstEasing ?? "easeInQuad",
            options: EASING_OPTIONS,
            onChange: (v: EasingName) => {
              state.current.transition.burstEasing = v;
            },
          },
        },
        { collapsed: false },
      ),
      "2 • Zoom Principal (M0 Focus)": folder(
        {
          "Main zoom factor": {
            value: state.current.transition.mainZoomFactor ?? 1.28,
            min: 1.0,
            max: 2.0,
            step: 0.02,
            onChange: (v: number) => {
              state.current.transition.mainZoomFactor = v;
            },
          },
          "Main zoom duration (s)": {
            value: state.current.transition.mainZoomDuration ?? 0.40,
            min: 0.1,
            max: 2.0,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.mainZoomDuration = v;
            },
          },
          "Main zoom easing": {
            value: state.current.transition.mainZoomEasing ?? "easeOutQuint",
            options: EASING_OPTIONS,
            onChange: (v: EasingName) => {
              state.current.transition.mainZoomEasing = v;
            },
          },
        },
        { collapsed: false },
      ),
      "3 • Pause Contemplative": folder(
        {
          "Main hold duration (s)": {
            value: state.current.transition.mainHoldDuration ?? 0.25,
            min: 0.0,
            max: 2.0,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.mainHoldDuration = v;
            },
          },
        },
        { collapsed: false },
      ),
      "4 • Émergence Carte Inférieure": folder(
        {
          "Stack entrance duration (s)": {
            value: state.current.transition.stackEntranceDuration ?? 0.35,
            min: 0.1,
            max: 2.0,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.stackEntranceDuration = v;
            },
          },
          "Stack slide offset (px)": {
            value: state.current.transition.stackSlideOffset ?? 350,
            min: 0,
            max: 1200,
            step: 20,
            onChange: (v: number) => {
              state.current.transition.stackSlideOffset = v;
            },
          },
          "Stack entrance easing": {
            value: state.current.transition.stackEntranceEasing ?? "easeOutQuad",
            options: EASING_OPTIONS,
            onChange: (v: EasingName) => {
              state.current.transition.stackEntranceEasing = v;
            },
          },
        },
        { collapsed: false },
      ),
      "5 • 🎰 777 Spin & Dézoom Simultanés": folder(
        {
          "Spin duration (s)": {
            value: state.current.transition.spinDezoomDuration ?? state.current.transition.reelDuration ?? 1.5,
            min: 0.3,
            max: 4.0,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.spinDezoomDuration = v;
              state.current.transition.reelDuration = v;
              state.current.transition.dezoomDuration = v;
            },
          },
          "Reel loops": {
            value: state.current.transition.reelLoops ?? 3,
            min: 1,
            max: 8,
            step: 1,
            onChange: (v: number) => {
              state.current.transition.reelLoops = v;
            },
          },
          "Spin easing": {
            value: state.current.transition.spinEasing ?? state.current.transition.reelEasing ?? "easeInOutCubic",
            options: EASING_OPTIONS,
            onChange: (v: string) => {
              state.current.transition.spinEasing = v as EasingName;
              state.current.transition.reelEasing = v as EasingName;
            },
          },
          "Dezoom easing": {
            value: state.current.transition.dezoomEasing ?? "easeInOutCubic",
            options: EASING_OPTIONS,
            onChange: (v: string) => {
              state.current.transition.dezoomEasing = v as EasingName;
            },
          },
          "Text reveal delay (s)": {
            value: state.current.transition.textRevealDelay ?? 0.25,
            min: 0.0,
            max: 2.0,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.textRevealDelay = v;
            },
          },
          "Pause after spin (s)": {
            value: state.current.transition.reelEndDelay ?? 0.15,
            min: 0.0,
            max: 1.5,
            step: 0.02,
            onChange: (v: number) => {
              state.current.transition.reelEndDelay = v;
            },
          },
        },
        { collapsed: false },
      ),
      "6 • Vue Détail & Cadrage": folder(
        {
          "Width % (desktop)": {
            value: state.current.transition.desktopMediaWidthRatio ?? 0.34,
            min: 0.15,
            max: 0.65,
            step: 0.01,
            onChange: (v: number) => {
              state.current.transition.desktopMediaWidthRatio = v;
            },
          },
          "Height % (mobile)": {
            value: state.current.transition.mobileMediaHeightRatio ?? 0.48,
            min: 0.2,
            max: 0.8,
            step: 0.01,
            onChange: (v: number) => {
              state.current.transition.mobileMediaHeightRatio = v;
            },
          },
          "Column center X ratio": {
            value: state.current.transition.detailColumnRatio ?? 0.5,
            min: 0.2,
            max: 0.8,
            step: 0.01,
            onChange: (v: number) => {
              state.current.transition.detailColumnRatio = v;
            },
          },
          "Media gap (px)": {
            value: state.current.transition.mediaGap ?? 32,
            min: 0,
            max: 120,
            step: 2,
            onChange: (v: number) => {
              state.current.transition.mediaGap = v;
            },
          },
          "Camera zoom in detail": {
            value: state.current.transition.burstZoom ?? 1.8,
            min: 0.4,
            max: 2.5,
            step: 0.02,
            onChange: (v: number) => {
              state.current.transition.burstZoom = v;
            },
          },
          "Scroll damping (lerp)": {
            value: state.current.transition.detailScrollDamping ?? 12,
            min: 2,
            max: 30,
            step: 1,
            onChange: (v: number) => {
              state.current.transition.detailScrollDamping = v;
            },
          },
          "Scroll speed multiplier": {
            value: state.current.transition.detailScrollSpeed ?? 1.0,
            min: 0.2,
            max: 3.0,
            step: 0.1,
            onChange: (v: number) => {
              state.current.transition.detailScrollSpeed = v;
            },
          },
        },
        { collapsed: false },
      ),
      "7 • Exit & Return": folder(
        {
          "Exit duration (s)": {
            value: state.current.transition.exitDuration ?? 0.6,
            min: 0.1,
            max: 3.0,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.exitDuration = v;
            },
          },
          "Camera return delay (s)": {
            value: state.current.transition.cameraReturnDelay ?? 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.02,
            onChange: (v: number) => {
              state.current.transition.cameraReturnDelay = v;
            },
          },
          "Repulse return delay (s)": {
            value: state.current.transition.repulseReturnDelay ?? 0.25,
            min: 0,
            max: 1.5,
            step: 0.05,
            onChange: (v: number) => {
              state.current.transition.repulseReturnDelay = v;
            },
          },
          "Exit slide-out offset (px)": {
            value: state.current.transition.exitSlideOffset ?? 350,
            min: 0,
            max: 1200,
            step: 20,
            onChange: (v: number) => {
              state.current.transition.exitSlideOffset = v;
            },
          },
          "Exit easing": {
            value: state.current.transition.exitEasing ?? "easeInOutCubic",
            options: EASING_OPTIONS,
            onChange: (v: EasingName) => {
              state.current.transition.exitEasing = v;
            },
          },
        },
        { collapsed: false },
      ),
    }),
    [],
  );

  useEffect(() => {
    const id = setInterval(() => {
      if (runtime?.current) {
        const curPhase = runtime.current.transition.phase;
        const curScroll = Math.round(runtime.current.transition.columnScrollY || 0);
        const slug = selectedArtifact?.slug ?? (curPhase === "idle" ? "none" : "...");
        const mediaCount = selectedArtifact?.gallery?.length ? selectedArtifact.gallery.length + 1 : 1;
        set({
          Phase: curPhase,
          "Target Slug": slug,
          "API Status": apiStatus,
          "Media Count": mediaCount,
          "Scroll Y": curScroll,
        });
      }
    }, 100);
    return () => clearInterval(id);
  }, [runtime, selectedArtifact, apiStatus, set]);

  return null;
}

// ── 3. Corner Brackets ──────────────────────────────────────────
function BracketsSection({ state }: { state: PlayDebugRef }) {
  useControls("🔲 Corner Brackets", () => ({
    "Padding (px)": {
      value: state.current.brackets.padding,
      min: 0,
      max: 40,
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
      min: 0,
      max: 360,
      step: 5,
      onChange: (v: number) => {
        state.current.brackets.angle = v;
      },
    },
    "Arm length (px)": {
      value: state.current.brackets.arm,
      min: 2,
      max: 30,
      step: 1,
      onChange: (v: number) => {
        state.current.brackets.arm = v;
      },
    },
    "Thickness (px)": {
      value: state.current.brackets.thickness,
      min: 1,
      max: 10,
      step: 0.5,
      onChange: (v: number) => {
        state.current.brackets.thickness = v;
      },
    },
    Color: {
      value: state.current.brackets.color,
      onChange: (v: string) => {
        state.current.brackets.color = v;
      },
    },
  }));

  return null;
}

// ── 4. Focus Indicator ──────────────────────────────────────────
function IndicatorSection({ state }: { state: PlayDebugRef }) {
  useControls("🎯 Focus Indicator", () => ({
    "Fade speed": {
      value: state.current.indicator.fadeSpeed,
      min: 1,
      max: 30,
      step: 1,
      onChange: (v: number) => {
        state.current.indicator.fadeSpeed = v;
      },
    },
    "Move speed": {
      value: state.current.indicator.moveSpeed,
      min: 1,
      max: 30,
      step: 1,
      onChange: (v: number) => {
        state.current.indicator.moveSpeed = v;
      },
    },
  }));

  return null;
}

// ── 5. Camera & Fisheye ─────────────────────────────────────────
function CameraSection({ state }: { state: PlayDebugRef }) {
  useControls("📷 Camera & Fisheye", () => ({
    "Camera zoom": {
      value: state.current.camera.zoom,
      min: 0.3,
      max: 2.0,
      step: 0.05,
      onChange: (v: number) => {
        state.current.camera.zoom = v;
      },
    },
    "Enable fisheye": {
      value: state.current.fisheye.enabled,
      onChange: (v: boolean) => {
        state.current.fisheye.enabled = v;
      },
    },
    "Fisheye strength": {
      value: state.current.fisheye.strength,
      min: 0.0,
      max: 0.15,
      step: 0.002,
      onChange: (v: number) => {
        state.current.fisheye.strength = v;
      },
    },
  }));

  return null;
}

// ── 6. Gravity Layout ───────────────────────────────────────────
function LayoutSection({
  state,
  onLayoutChange,
}: {
  state: PlayDebugRef;
  onLayoutChange: () => void;
}) {
  useControls("🪐 Gravity Layout", () => ({
    actions: buttonGroup({
      "🔄 Recompute Layout": onLayoutChange,
    }),
    "Max width": {
      value: state.current.gravity.maxWidth,
      min: 200,
      max: 1200,
      step: 20,
      onChange: (v: number) => {
        state.current.gravity.maxWidth = v;
      },
    },
    "Max height": {
      value: state.current.gravity.maxHeight,
      min: 200,
      max: 1200,
      step: 20,
      onChange: (v: number) => {
        state.current.gravity.maxHeight = v;
      },
    },
    "Min gap (px)": {
      value: state.current.gravity.gap,
      min: 20,
      max: 400,
      step: 10,
      onChange: (v: number) => {
        state.current.gravity.gap = v;
      },
    },
    "Repeat gap (px)": {
      value: state.current.gravity.repeatGap,
      min: 50,
      max: 500,
      step: 10,
      onChange: (v: number) => {
        state.current.gravity.repeatGap = v;
      },
    },
    "Scale variance": {
      value: state.current.gravity.scaleVariance,
      min: 0.0,
      max: 0.5,
      step: 0.02,
      onChange: (v: number) => {
        state.current.gravity.scaleVariance = v;
      },
    },
    "Tile repeats": {
      value: state.current.gravity.repeat,
      min: 1,
      max: 6,
      step: 1,
      onChange: (v: number) => {
        state.current.gravity.repeat = v;
      },
    },
    "Anti-neighbor": {
      value: state.current.gravity.antiNeighbor,
      onChange: (v: boolean) => {
        state.current.gravity.antiNeighbor = v;
      },
    },
    Iterations: {
      value: state.current.gravity.iterations,
      min: 500,
      max: 15000,
      step: 500,
      onChange: (v: number) => {
        state.current.gravity.iterations = v;
      },
    },
    Seed: {
      value: state.current.gravity.seed,
      min: 0,
      max: 9999,
      step: 1,
      onChange: (v: number) => {
        state.current.gravity.seed = v;
      },
    },
    "Target aspect": {
      value: state.current.gravity.targetAspect,
      min: 0.5,
      max: 3.0,
      step: 0.1,
      onChange: (v: number) => {
        state.current.gravity.targetAspect = v;
      },
    },
  }));

  return null;
}

// ── 7. Layout Stats ─────────────────────────────────────────────
function StatsSection({ stats }: { stats: LayoutStats }) {
  useControls("📊 Layout Stats", () => ({
    Density: {
      value: stats.densityPercent,
      editable: false,
    },
    "Occupied area": {
      value: stats.occupiedAreaFormatted,
      editable: false,
    },
    "Bounding box": {
      value: stats.boundingBoxAreaFormatted,
      editable: false,
    },
    "Compute time": {
      value: stats.computeTimeFormatted,
      editable: false,
    },
  }));

  return null;
}

// ── 8. Pan & Inertia ────────────────────────────────────────────
function PanSection({ state }: { state: PlayDebugRef }) {
  useControls("👆 Pan & Inertia", () => ({
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
      min: -8.0,
      max: -0.5,
      step: 0.25,
      onChange: (v: number) => {
        state.current.pan.friction = v;
      },
    },
  }));

  return null;
}

// ── 9. Physics (Repulsion) ──────────────────────────────────────
function PhysicsSection({ state }: { state: PlayDebugRef }) {
  useControls("🧲 Physics (Repulsion)", () => ({
    "Enable physics": {
      value: state.current.physics.enabled,
      onChange: (v: boolean) => {
        state.current.physics.enabled = v;
      },
    },
    "Repulsion strength": {
      value: state.current.physics.strength,
      min: 500,
      max: 15000,
      step: 100,
      onChange: (v: number) => {
        state.current.physics.strength = v;
      },
    },
    "Effect radius": {
      value: state.current.physics.radius,
      min: 500,
      max: 6000,
      step: 100,
      onChange: (v: number) => {
        state.current.physics.radius = v;
      },
    },
    "Spring stiffness": {
      value: state.current.physics.spring,
      min: 0.1,
      max: 3.0,
      step: 0.05,
      onChange: (v: number) => {
        state.current.physics.spring = v;
      },
    },
    Damping: {
      value: state.current.physics.damping,
      min: 2,
      max: 40,
      step: 0.5,
      onChange: (v: number) => {
        state.current.physics.damping = v;
      },
    },
    "Restitution (bounce)": {
      value: state.current.physics.restitution,
      min: 0.0,
      max: 1.0,
      step: 0.05,
      onChange: (v: number) => {
        state.current.physics.restitution = v;
      },
    },
    Friction: {
      value: state.current.physics.friction,
      min: 0.0,
      max: 1.0,
      step: 0.05,
      onChange: (v: number) => {
        state.current.physics.friction = v;
      },
    },
    "Lock rotation": {
      value: state.current.physics.lockRotation,
      onChange: (v: boolean) => {
        state.current.physics.lockRotation = v;
      },
    },
    Mass: {
      value: state.current.physics.mass,
      min: 0.2,
      max: 5.0,
      step: 0.1,
      onChange: (v: number) => {
        state.current.physics.mass = v;
      },
    },
  }));

  return null;
}

// ── 10. Selection Overlay ───────────────────────────────────────
function OverlaySection({ state }: { state: PlayDebugRef }) {
  useControls("🌊 Selection Overlay", () => ({
    "Wave direction": {
      value: state.current.overlay.direction,
      options: {
        "Bottom → Top": "bottom-to-top",
        "Top → Bottom": "top-to-bottom",
        "Left → Right": "left-to-right",
        "Right → Left": "right-to-left",
        "Bottom-Left → Top-Right": "bl-to-tr",
        "Top-Left → Bottom-Right": "tl-to-br",
      },
      onChange: (v: WaveDirection) => {
        state.current.overlay.direction = v;
      },
    },
    "Crest softness": {
      value: state.current.overlay.crestSoftness,
      min: 0.02,
      max: 0.35,
      step: 0.005,
      onChange: (v: number) => {
        state.current.overlay.crestSoftness = v;
      },
    },
    "Wave amplitude": {
      value: state.current.overlay.waveAmplitude,
      min: 0.0,
      max: 0.06,
      step: 0.001,
      onChange: (v: number) => {
        state.current.overlay.waveAmplitude = v;
      },
    },
    "Wave frequency": {
      value: state.current.overlay.waveFrequency,
      min: 1.0,
      max: 10.0,
      step: 0.2,
      onChange: (v: number) => {
        state.current.overlay.waveFrequency = v;
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
  }));

  return null;
}

// ── 11. Image Plane ─────────────────────────────────────────────
function ImageSection({ state }: { state: PlayDebugRef }) {
  useControls("🖼 Image Plane", () => ({
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

  const [displayState, setDisplayState] = useState(() => loadVisibility());

  const handlePresetChange = (preset: ViewPreset) => {
    if (preset === "custom") {
      setDisplayState((prev) => {
        const next = { ...prev, preset: "custom" as const };
        saveVisibility(next.visibility, "custom");
        return next;
      });
      return;
    }
    const newVisibility = { ...PRESET_MAP[preset] };
    const next = { visibility: newVisibility, preset };
    setDisplayState(next);
    saveVisibility(newVisibility, preset);
  };

  const handleToggle = (key: keyof SectionVisibility, val: boolean) => {
    setDisplayState((prev) => {
      const newVis = { ...prev.visibility, [key]: val };
      const next = { visibility: newVis, preset: "custom" as const };
      saveVisibility(newVis, "custom");
      return next;
    });
  };

  const saveToLocalStorage = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      saveVisibility(displayState.visibility, displayState.preset);
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

  const { visibility, preset } = displayState;

  return (
    <>
      <Leva theme={LEVA_THEME} titleBar={{ title: "oré • debug" }} />
      <SettingsSection
        preset={preset}
        visibility={visibility}
        onPresetChange={handlePresetChange}
        onToggle={handleToggle}
        onSave={saveToLocalStorage}
        onCopy={copyJson}
      />
      {visibility.studio && (
        <StudioSection
          state={state}
          onReplayLock={onReplayLock}
          onSimulateSelect={onSimulateSelect}
          onResetTransition={onResetTransition}
        />
      )}
      {visibility.artifactDetails && (
        <ArtifactDetailsSection
          state={state}
          onSimulateSelect={onSimulateSelect}
          onResetTransition={onResetTransition}
          runtime={runtime}
          selectedArtifact={selectedArtifact}
          apiStatus={apiStatus}
          onCloseDetail={onCloseDetail}
        />
      )}
      {visibility.transition && <TransitionSection state={state} />}
      {visibility.brackets && <BracketsSection state={state} />}
      {visibility.indicator && <IndicatorSection state={state} />}
      {visibility.camera && <CameraSection state={state} />}
      {visibility.layout && (
        <LayoutSection state={state} onLayoutChange={onLayoutChange} />
      )}
      {visibility.stats && stats && <StatsSection stats={stats} />}
      {visibility.pan && <PanSection state={state} />}
      {visibility.physics && <PhysicsSection state={state} />}
      {visibility.overlay && <OverlaySection state={state} />}
      {visibility.image && <ImageSection state={state} />}
    </>
  );
}
