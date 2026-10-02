"use client";

import { useRef, useEffect, useState, type RefObject } from "react";
import { useControls, folder, button, buttonGroup, Leva } from "leva";
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
import { currentStage, stageBounds, STAGE_LABELS, type StageId } from "./transition-timeline";
import type { ShardParams } from "./ShardField";

const STORAGE_KEY = "play-debug-v35";
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
  | "transition"
  | "focus";

const TABS: { id: DebugTab; label: string }[] = [
  { id: "camera", label: "camera" },
  { id: "media", label: "media" },
  { id: "canvas", label: "canvas" },
  { id: "transition", label: "transition" },
  { id: "focus", label: "focus" },
];

const TAB_KEYWORDS: Record<DebugTab, string[]> = {
  camera: ["camera", "zoom", "fisheye", "motion", "blur", "strength", "streak"],
  media: ["media", "radius", "corner", "round", "plane"],
  canvas: [
    "canvas",
    "layout",
    "grid",
    "dimensions",
    "width",
    "height",
    "aspect",
    "gravity",
    "pan",
    "friction",
    "drag",
    "threshold",
    "velocity",
  ],
  transition: [
    "transition",
    "approche",
    "zoom",
    "burst",
    "puissance",
    "seed",
    "attente",
    "tortillement",
    "chargement",
    "vague",
    "wave",
    "irisation",
    "cascade",
    "cadrage",
    "panneau",
    "navbar",
    "retour",
    "rewind",
    "duration",
    "easing",
  ],
  focus: [
    "focus",
    "magnetic",
    "snap",
    "aspect",
    "card",
    "offset",
    "detail",
    "close",
    "panel",
  ],
};

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
  if (state.gravity && typeof state.gravity.iterations === "number") {
    if (state.gravity.iterations > 600 || state.gravity.iterations < 20) {
      state.gravity.iterations = 120;
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
    rootWidth: "100%",
    controlWidth: "175px",
    numberInputMinWidth: "44px",
    rowHeight: "26px",
    folderTitleHeight: "24px",
  },
};

// ── 1. Tab Camera ───────────────────────────────────────────────
function CameraTab({ state }: { state: PlayDebugRef }) {
  useControls("Camera Controls", () => ({
    "Camera zoom (base)": {
      value: state.current.camera.zoom,
      min: 0.2,
      max: 2.0,
      step: 0.05,
      onChange: (v: number) => {
        state.current.camera.zoom = v;
      },
    },
    "Hover carte": folder({
      hoverScale: num(state.current.hover, "scale", { label: "Grossissement", min: 0, max: 0.2, step: 0.005 }),
      hoverRotate: num(state.current.hover, "rotate", { label: "Rotation max (deg)", min: 0, max: 8, step: 0.1 }),
      hoverSpeed: num(state.current.hover, "speed", { label: "Vitesse", min: 2, max: 30, step: 0.5 }),
      hoverWaveAmp: num(state.current.hover, "waveAmp", { label: "Vague irisee (intensite)", min: 0, max: 1.5, step: 0.05 }),
      hoverWaveWidth: num(state.current.hover, "waveWidth", { label: "Vague : largeur", min: 0.05, max: 0.6, step: 0.01 }),
      hoverWaveDuration: num(state.current.hover, "waveDuration", { label: "Vague : duree (s)", min: 0.25, max: 2.5, step: 0.05 }),
    }),
    "Dezoom en mouvement": folder({
      speedDezoom: num(state.current.camera, "speedDezoom", { label: "Dezoom max (0.2 = -20 pct)", min: 0, max: 0.6, step: 0.01 }),
      speedDezoomRef: num(state.current.camera, "speedDezoomRef", { label: "Vitesse pour dezoom complet (px/s)", min: 400, max: 5000, step: 50 }),
      speedDezoomResponse: num(state.current.camera, "speedDezoomResponse", { label: "Reactivite (colle au mouvement)", min: 4, max: 40, step: 0.5 }),
    }),
    "DA Prism (nav, panel)": folder({
      daNavPixels: num(state.current.da, "navPixels", { label: "Pixels de la pastille play", min: 0, max: 2, step: 0.05 }),
      daPanelScale: num(state.current.da, "panelPixelScale", { label: "Rectangles du panel (taille)", min: 0.3, max: 2.5, step: 0.05 }),
      daPanelSpread: num(state.current.da, "panelGradientSpread", { label: "Degrade du panel (etendue)", min: 0.4, max: 1.8, step: 0.05 }),
    }),
    Curseur: folder({
      cursorTrail: num(state.current.camera, "cursorTrail", { label: "Trainee de pixels (0 = off)", min: 0, max: 1, step: 0.05 }),
      cursorTrailLife: num(state.current.camera, "cursorTrailLife", { label: "Longueur de la trainee (ms)", min: 80, max: 1200, step: 10 }),
    }),
    "Motion Blur (Camera & Canvas)": folder({
      "Motion blur enabled": {
        value: state.current.camera.motionBlur,
        label: "Enable motion blur",
        onChange: (v: boolean) => {
          state.current.camera.motionBlur = v;
        },
      },
      "Motion blur intensity": {
        value: state.current.camera.motionBlurStrength,
        min: 0.1,
        max: 4.0,
        step: 0.1,
        label: "Blur intensity",
        onChange: (v: number) => {
          state.current.camera.motionBlurStrength = v;
        },
      },
      "Motion blur max streak": {
        value: state.current.camera.motionBlurMax,
        min: 0.01,
        max: 0.25,
        step: 0.005,
        label: "Max blur streak",
        onChange: (v: number) => {
          state.current.camera.motionBlurMax = v;
        },
      },
    }),
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
    "Corner smoothing (0.32 = 32 pct)": {
      value: state.current.plane.cornerSmoothing,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v: number) => {
        state.current.plane.cornerSmoothing = v;
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
        min: 0,
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
        min: 20,
        max: 600,
        step: 10,
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

// ── Helpers de contrôles ────────────────────────────────────────

type NumberOptions = { label?: string; min: number; max: number; step: number };

/** Slider numérique branché directement sur un champ d'un objet de config. */
function num<T extends object>(target: T, key: keyof T & string, o: NumberOptions) {
  return {
    label: o.label,
    value: target[key] as unknown as number,
    min: o.min,
    max: o.max,
    step: o.step,
    onChange: (v: number) => {
      (target as Record<string, unknown>)[key] = v;
    },
  };
}

/** Sélecteur d'easing branché sur un champ d'un objet de config. */
function easingControl<T extends object>(
  target: T,
  key: keyof T & string,
  label = "Easing",
) {
  return {
    label,
    value: target[key] as unknown as string,
    options: EASING_OPTIONS,
    onChange: (v: string) => {
      (target as Record<string, unknown>)[key] = v as EasingName;
    },
  };
}

/** Start / Duration / Easing d'une piste de la timeline. */
function trackControls(
  tr: TransitionConfig,
  name: TrackName,
  maxStart: number,
  maxDuration: number,
  prefix = name,
) {
  const track = tr[name];
  return {
    [`${prefix}_start`]: num(track, "start", { label: "Start (s)", min: 0, max: maxStart, step: 0.02 }),
    [`${prefix}_duration`]: num(track, "duration", { label: "Duration (s)", min: 0.05, max: maxDuration, step: 0.02 }),
    [`${prefix}_easing`]: easingControl(track, "easing"),
  };
}

/** Réglages des éclats (image qui se sépare en morceaux), partagés ouverture + changement de carte. */
function shardControls(p: ShardParams) {
  return {
    shardCount: num(p, "count", { label: "Nombre d eclats", min: 0, max: 96, step: 1 }),
    shardMin: num(p, "minSize", { label: "Taille min", min: 4, max: 120, step: 1 }),
    shardMax: num(p, "maxSize", { label: "Taille max", min: 20, max: 400, step: 1 }),
    shardAspect: num(p, "aspect", { label: "Etirement (rectangles)", min: 1, max: 8, step: 0.1 }),
    shardTravel: num(p, "travel", { label: "Distance d ejection", min: 0, max: 600, step: 5 }),
    shardTravelFar: num(p, "travelFar", { label: "Parallaxe plan arriere", min: 0, max: 2, step: 0.05 }),
    shardTravelNear: num(p, "travelNear", { label: "Parallaxe plan avant", min: 0, max: 4, step: 0.05 }),
    shardScaleFar: num(p, "scaleFar", { label: "Echelle plan arriere", min: 0.3, max: 1.5, step: 0.02 }),
    shardScaleNear: num(p, "scaleNear", { label: "Echelle plan avant", min: 0.5, max: 2.5, step: 0.02 }),
    shardOpacity: num(p, "opacity", { label: "Opacite", min: 0, max: 1, step: 0.01 }),
    shardBlurFar: num(p, "blurFar", { label: "Flou plan arriere", min: 0, max: 6, step: 0.1 }),
    shardBlurNear: num(p, "blurNear", { label: "Flou plan avant", min: 0, max: 6, step: 0.1 }),
    shardSoftness: num(p, "softness", { label: "Bords fondus (degrade)", min: 0, max: 1, step: 0.01 }),
    shardIrid: num(p, "iridescence", { label: "Irisation", min: 0, max: 1, step: 0.01 }),
    shardSpeed: num(p, "speed", { label: "Vitesse (cycles par s)", min: 0.1, max: 3, step: 0.05 }),
    shardSpin: num(p, "spin", { label: "Rotation max (deg)", min: 0, max: 90, step: 1 }),
    shardUp: num(p, "upBias", { label: "Derive vers le haut", min: 0, max: 1.5, step: 0.05 }),
    shardSeed: num(p, "seed", { label: "Graine", min: 0, max: 999, step: 1 }),
  };
}

const WAVE_DIRECTIONS = {
  "Top-left → bottom-right": "tl-to-br",
  "Bottom-left → top-right": "bl-to-tr",
  "Left → right": "left-to-right",
  "Right → left": "right-to-left",
  "Bottom → top": "bottom-to-top",
  "Top → bottom": "top-to-bottom",
};

// ── Barre de timeline ───────────────────────────────────────────

const SEGMENT_COLORS: Record<string, string> = {
  approach: "bg-sky-500/70",
  burst: "bg-orange-500/70",
  wave: "bg-violet-500/70",
  cascade: "bg-teal-500/70",
  panel: "bg-emerald-500/70",
};

type TimelineSnapshot = {
  stage: StageId;
  t: number;
  holding: boolean;
  rewinding: boolean;
  scrubbing: boolean;
  burstStart: number;
  hold: number;
  passEnd: number;
  panelStart: number;
  end: number;
};

const EMPTY_SNAPSHOT: TimelineSnapshot = {
  stage: "idle",
  t: 0,
  holding: false,
  rewinding: false,
  scrubbing: false,
  burstStart: 0,
  hold: 0,
  passEnd: 0,
  panelStart: 0,
  end: 1,
};

/** Le debug écrit dans le ref partagé que lisent les `useFrame` : mutation voulue. */
function setScrub(state: PlayDebugRef, progress: number) {
  state.current.studio.scrubMode = true;
  state.current.studio.scrubProgress = Math.min(1, Math.max(0, progress));
}

function releaseScrub(state: PlayDebugRef) {
  state.current.studio.scrubMode = false;
}

/**
 * Étape courante et tête de lecture de la timeline d'entrée. Un clic ou un
 * glissé sur la barre fige la timeline à cet instant (scrub) ; « Release »
 * rend la main à l'horloge.
 */
function TimelineBar({
  state,
  runtime,
}: {
  state: PlayDebugRef;
  runtime?: RefObject<PlayRuntimeState>;
}) {
  const [snap, setSnap] = useState<TimelineSnapshot>(EMPTY_SNAPSHOT);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let handle = 0;
    let last = 0;
    function tick(now: number) {
      if (now - last > 50) {
        last = now;
        const rc = runtime?.current;
        if (rc) {
          const cfg = state.current.transition;
          const tr = rc.transition;
          const bounds = stageBounds(cfg);
          const next: TimelineSnapshot = {
            stage: currentStage(cfg, tr),
            t: Math.round(tr.t * 50) / 50,
            holding: tr.holding,
            rewinding: tr.rewinding,
            scrubbing: state.current.studio.scrubMode,
            ...bounds,
          };
          setSnap((prev) =>
            (Object.keys(next) as (keyof TimelineSnapshot)[]).every((k) => prev[k] === next[k])
              ? prev
              : next,
          );
        }
      }
      handle = requestAnimationFrame(tick);
    }
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [state, runtime]);

  const end = Math.max(0.05, snap.end);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / end) * 100))}%`;
  const segments: { id: string; from: number; to: number }[] = [
    { id: "approach", from: 0, to: snap.burstStart },
    { id: "burst", from: snap.burstStart, to: snap.hold },
    { id: "wave", from: snap.hold, to: snap.passEnd },
    { id: "cascade", from: snap.passEnd, to: snap.panelStart },
    { id: "panel", from: snap.panelStart, to: snap.end },
  ];
  const active = snap.stage !== "idle" && snap.stage !== "returning" && snap.stage !== "detail";

  function scrubTo(clientX: number) {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setScrub(state, (clientX - rect.left) / Math.max(1, rect.width));
  }

  return (
    <div className="px-2 py-2 border-b border-white/10 bg-[#161616] font-mono text-[11px] text-white/80">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold text-white">
          {snap.rewinding ? "◀ Rewind · " : ""}
          {STAGE_LABELS[snap.stage]}
        </span>
        <span className="text-white/40">
          {active ? `t=${snap.t.toFixed(2)}s / ${snap.end.toFixed(2)}s` : "—"}
        </span>
      </div>
      <div
        ref={barRef}
        className="relative h-5 rounded bg-white/5 overflow-hidden cursor-ew-resize touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons) scrubTo(e.clientX);
        }}
      >
        {segments.map((s) => (
          <div
            key={s.id}
            className={`absolute inset-y-0 border-r border-black/40 ${SEGMENT_COLORS[s.id]}`}
            style={{ left: pct(s.from), width: `calc(${pct(s.to)} - ${pct(s.from)})` }}
            title={s.id}
          />
        ))}
        {/* Point d'attente : la timeline s'y fige tant que le pack n'est pas prêt. */}
        <div
          className={`absolute inset-y-0 w-0.5 bg-amber-300 ${snap.holding ? "animate-pulse" : "opacity-60"}`}
          style={{ left: pct(snap.hold) }}
          title="Point d'attente (chargement)"
        />
        {active && (
          <div
            className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_white]"
            style={{ left: pct(snap.t) }}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5 text-white/40">
        <span>
          <span className="text-amber-300">▎</span> attente chargement
        </span>
        {snap.scrubbing ? (
          <button
            className="px-2 py-0.5 rounded border border-white/20 text-white/80 hover:bg-white/10"
            onClick={() => releaseScrub(state)}
          >
            Release scrub
          </button>
        ) : (
          <span>cliquer la barre = scrub</span>
        )}
      </div>
    </div>
  );
}

// ── Tab Transition — organisé dans l'ordre de la chorégraphie ───

function TransitionTab({
  state,
  onSimulateSelect,
  onResetTransition,
  onPanelChange,
}: {
  state: PlayDebugRef;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
  onPanelChange?: () => void;
}) {
  const tr = state.current.transition;
  const overlay = state.current.overlay;
  const studio = state.current.studio;

  const setRef = useRef<((values: Record<string, unknown>) => void) | null>(null);
  const [, set] = useControls("Transition", () => ({
    Studio: folder({
      Actions: buttonGroup({
        "Play (R)": onSimulateSelect,
        "Reverse (Esc)": onResetTransition,
      }),
      "Playback speed": {
        value: studio.speed,
        options: {
          "0.1x": 0.1,
          "0.25x": 0.25,
          "0.5x": 0.5,
          "1x": 1.0,
          "2x": 2.0,
        },
        onChange: (v: number) => {
          studio.speed = v;
        },
      },
      "Loop (L)": {
        value: studio.loopLock,
        onChange: (v: boolean) => {
          studio.loopLock = v;
        },
      },
    }),

    "1 · Approche": folder(
      {
        ...trackControls(tr, "hero", 3, 3),
        approachZoom: num(tr, "approachZoom", { label: "Zoom approche (x base)", min: 0.5, max: 5, step: 0.05 }),
        silenceDrift: num(tr, "silenceDrift", { label: "Dérive du zoom (attente)", min: 0, max: 0.3, step: 0.005 }),
      },
      { collapsed: true },
    ),

    "2 · Burst": folder(
      {
        ...trackControls(tr, "scatter", 3, 3),
        scatterDistance: num(tr, "scatterDistance", { label: "Distance de base", min: 500, max: 6000, step: 50 }),
        burstPowerMin: num(tr, "burstPowerMin", { label: "Puissance min (x)", min: 0, max: 2, step: 0.05 }),
        burstPowerMax: num(tr, "burstPowerMax", { label: "Puissance max (x)", min: 0, max: 3, step: 0.05 }),
        burstAngleJitter: num(tr, "burstAngleJitter", { label: "Jitter de direction (rad)", min: 0, max: 1.5, step: 0.05 }),
        Seed: {
          value: tr.burstSeed,
          min: 0,
          max: 9999,
          step: 1,
          onChange: (v: number) => {
            tr.burstSeed = v;
          },
        },
        Reseed: button(() => {
          setRef.current?.({ Seed: Math.floor(Math.random() * 10000) });
        }),
      },
      { collapsed: true },
    ),

    "3 · Attente": folder(
      {
        simulatedLoadMs: num(tr, "simulatedLoadMs", { label: "Chargement simule (ms)", min: 0, max: 10000, step: 100 }),
        packShake: num(tr, "packShake", { label: "Tortillement (rad)", min: 0, max: 0.3, step: 0.005 }),
        wiggleSpeed: num(tr, "wiggleSpeed", { label: "Vitesse du tortillement", min: 0, max: 20, step: 0.5 }),
        breathe: num(tr, "breathe", { label: "Respiration (scale)", min: 0, max: 0.1, step: 0.005 }),
        loadGrow: num(tr, "loadGrow", { label: "Grossissement max", min: 0, max: 0.4, step: 0.01 }),
        loadWaveSpeed: num(tr, "loadWaveSpeed", { label: "Vague en boucle (cycles par s)", min: 0.2, max: 3, step: 0.05 }),
        FX: folder(
          {
            fxBurstBoost: num(tr, "fxBurstBoost", { label: "Surintensite au burst", min: 0, max: 3, step: 0.05 }),
          },
          { collapsed: false },
        ),
        Eclats: folder(shardControls(state.current.shards), { collapsed: true }),
      },
      { collapsed: true },
    ),

    "4 · Vague": folder(
      {
        waveDuration: num(tr, "waveDuration", { label: "Durée (s)", min: 0.2, max: 3, step: 0.05 }),
        waveEasing: easingControl(tr, "waveEasing"),
        Direction: {
          value: overlay.direction,
          options: WAVE_DIRECTIONS,
          onChange: (v: WaveDirection) => {
            overlay.direction = v;
          },
        },
        crestSoftness: num(overlay, "crestSoftness", { label: "Douceur de la crête", min: 0.05, max: 0.8, step: 0.01 }),
        waveAmplitude: num(overlay, "waveAmplitude", { label: "Amplitude de l onde", min: 0.01, max: 0.3, step: 0.01 }),
        waveFrequency: num(overlay, "waveFrequency", { label: "Fréquence de l onde", min: 1, max: 20, step: 0.5 }),
        waveSpeed: num(overlay, "waveSpeed", { label: "Vitesse de l onde", min: 0, max: 8, step: 0.2 }),
        iridescence: num(overlay, "iridescence", { label: "Irisation", min: 0, max: 1, step: 0.02 }),
        baseOpacity: num(overlay, "baseOpacity", { label: "Opacité", min: 0, max: 1, step: 0.02 }),
        glowIntensity: num(overlay, "glowIntensity", { label: "Lueur", min: 0, max: 3, step: 0.05 }),
        Lens: folder(
          {
            zoomBlur: num(overlay, "zoomBlur", { label: "Flou de zoom", min: 0, max: 1.2, step: 0.01 }),
            zoomPunch: num(overlay, "zoomPunch", { label: "Punch de zoom", min: 0, max: 0.8, step: 0.01 }),
            bulge: num(overlay, "bulge", { label: "Bombé", min: 0, max: 2, step: 0.02 }),
            lensWidth: num(overlay, "lensWidth", { label: "Largeur", min: 0.05, max: 0.8, step: 0.01 }),
            lensTrail: num(overlay, "lensTrail", { label: "Traîne", min: 0, max: 1, step: 0.02 }),
          },
          { collapsed: true },
        ),
      },
      { collapsed: true },
    ),

    "5 · Cascade et cadrage": folder(
      {
        lockScalePunch: num(tr, "lockScalePunch", { label: "Detachement artifact", min: 0, max: 0.4, step: 0.005 }),
        ...trackControls(tr, "lock", 2, 2),
        ...trackControls(tr, "reveal", 3, 3),
        ...trackControls(tr, "columnFade", 4, 3),
        ...trackControls(tr, "dezoom", 6, 5),
        detailZoom: num(tr, "detailZoom", { label: "Zoom final (x base)", min: 0.5, max: 4, step: 0.05 }),
        Layers: folder(
          {
            stackDepth: num(tr, "stackDepth", { label: "Layers visibles dessous", min: 0, max: 8, step: 1 }),
            stackOpacity: num(tr, "stackOpacity", { label: "Opacite du 1er layer", min: 0, max: 1, step: 0.01 }),
            stackOpacityFalloff: num(tr, "stackOpacityFalloff", { label: "Decroissance par layer", min: 0, max: 1, step: 0.01 }),
            stackPeek: num(tr, "stackPeek", { label: "Decalage vers le bas (px)", min: 4, max: 80, step: 1 }),
            stackScale: num(tr, "stackScale", { label: "Echelle par layer", min: 0.5, max: 1, step: 0.01 }),
          },
          { collapsed: false },
        ),
      },
      { collapsed: true },
    ),

    "6 · Panneau et navbar": folder(
      {
        navbarLead: num(tr, "navbarLead", { label: "Avance navbar (s)", min: 0, max: 2, step: 0.05 }),
        textLead: num(tr, "textLead", { label: "Avance side panel (s)", min: 0, max: 2, step: 0.05 }),
        panelGradientStrength: num(tr, "panelGradientStrength", { label: "Degrade du panel (intensite)", min: 0, max: 1, step: 0.01 }),
        panelGradientSpeed: num(tr, "panelGradientSpeed", { label: "Degrade du panel (vitesse)", min: 0, max: 6, step: 0.1 }),
        panelGlitch: {
          ...num(tr, "panelGlitch", { label: "Glitch pixel bas droite", min: 0, max: 1, step: 0.01 }),
          onChange: (v: number) => {
            tr.panelGlitch = v;
            onPanelChange?.();
          },
        },
      },
      { collapsed: true },
    ),

    "7 · Retour": folder(
      {
        rewindSpeed: num(tr, "rewindSpeed", { label: "Vitesse du rewind (annulation)", min: 0.25, max: 6, step: 0.05 }),
        exit_duration: num(tr.exit, "duration", { label: "Sortie vue detail (s)", min: 0.1, max: 3, step: 0.05 }),
        exit_easing: easingControl(tr.exit, "easing", "Easing de sortie"),
        repulseReturnDelay: num(tr, "repulseReturnDelay", { label: "Retard de la mosaïque (s)", min: 0, max: 1.5, step: 0.05 }),
        cameraReturnDelay: num(tr, "cameraReturnDelay", { label: "Retard de la caméra (s)", min: 0, max: 1, step: 0.02 }),
      },
      { collapsed: true },
    ),
  }));

  useEffect(() => {
    // `set` est typé sur les clés racine ; Leva résout aussi celles des dossiers.
    setRef.current = set as (values: Record<string, unknown>) => void;
  }, [set]);

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
  onTextLayoutChange,
}: {
  state: PlayDebugRef;
  onResetTransition: () => void;
  runtime?: RefObject<PlayRuntimeState>;
  selectedArtifact?: ArtifactDetail | null;
  apiStatus?: "idle" | "fetching" | "ready" | "error";
  onCloseDetail?: () => void;
  onTextLayoutChange?: () => void;
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
      "Desktop width ratio": {
        value: tr.desktopMediaWidthRatio,
        min: 0.15,
        max: 0.6,
        step: 0.01,
        onChange: (v: number) => {
          tr.desktopMediaWidthRatio = v;
        },
      },
      "Max width (% screen)": {
        value: tr.maxMediaWidthRatio ?? 0.38,
        min: 0.2,
        max: 0.8,
        step: 0.01,
        onChange: (v: number) => {
          tr.maxMediaWidthRatio = v;
        },
      },
      "Max height (% screen)": {
        value: tr.maxMediaHeightRatio ?? 0.78,
        min: 0.3,
        max: 0.95,
        step: 0.01,
        onChange: (v: number) => {
          tr.maxMediaHeightRatio = v;
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

    "Landscape Text Position": folder({
      "Text panel width (%)": {
        value: Math.round((tr.landscapeTextWidthRatio ?? 0.5) * 100),
        min: 20,
        max: 80,
        step: 1,
        label: "Width (% screen)",
        onChange: (v: number) => {
          tr.landscapeTextWidthRatio = v / 100;
          onTextLayoutChange?.();
        },
      },
      "Right offset (px)": {
        value: tr.landscapeTextRightOffset ?? 0,
        min: -150,
        max: 300,
        step: 5,
        label: "Right margin/offset (px)",
        onChange: (v: number) => {
          tr.landscapeTextRightOffset = v;
          onTextLayoutChange?.();
        },
      },
      "Vertical offset (px)": {
        value: tr.landscapeTextTopOffset ?? 0,
        min: -300,
        max: 300,
        step: 5,
        label: "Vertical shift (px)",
        onChange: (v: number) => {
          tr.landscapeTextTopOffset = v;
          onTextLayoutChange?.();
        },
      },
      "Max width (px)": {
        value: tr.landscapeTextMaxWidth ?? 576,
        min: 350,
        max: 1200,
        step: 10,
        label: "Max text width (px)",
        onChange: (v: number) => {
          tr.landscapeTextMaxWidth = v;
          onTextLayoutChange?.();
        },
      },
    }),


    "Deck (Card by Card)": folder({
      deckPullDistance: num(tr, "deckPullDistance", { label: "Traction : distance pour passer (px)", min: 120, max: 1600, step: 10 }),
      deckResist: num(tr, "deckResist", { label: "Traction : resistance (courbe)", min: 1, max: 6, step: 0.1 }),
      deckLift: num(tr, "deckLift", { label: "Traction : course de la carte (px)", min: 0, max: 200, step: 1 }),
      deckRelease: num(tr, "deckRelease", { label: "Retour si on lache (vitesse)", min: 1, max: 30, step: 0.5 }),
      deckHold: num(tr, "deckHold", { label: "Delai avant retour (s)", min: 0, max: 1, step: 0.01 }),
      deckShimmer: num(tr, "deckShimmer", { label: "Eclats pendant la traction", min: 0, max: 1.5, step: 0.05 }),
      deckDissolve: num(tr, "deckDissolve", { label: "Evanouissement (courbe)", min: 0.5, max: 4, step: 0.1 }),
      deckStepCooldown: num(tr, "stepCooldown", { label: "Verrou apres changement (s)", min: 0, max: 2, step: 0.05 }),
      deckStepDamping: num(tr, "detailScrollDamping", { label: "Vitesse du changement", min: 2, max: 30, step: 0.5 }),
      "Drag px per card": {
        value: tr.dragPxPerCard ?? 320,
        min: 100,
        max: 800,
        step: 10,
        onChange: (v: number) => {
          tr.dragPxPerCard = v;
        },
      },
      "Pack shake (rad)": {
        value: tr.packShake ?? 0.04,
        min: 0,
        max: 0.2,
        step: 0.005,
        onChange: (v: number) => {
          tr.packShake = v;
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
  onSimulateSelect,
  onResetTransition,
  runtime,
  selectedArtifact,
  apiStatus = "idle",
  onCloseDetail,
  onTextLayoutChange,
}: {
  state: PlayDebugRef;
  stats?: LayoutStats;
  onLayoutChange: () => void;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
  runtime?: RefObject<PlayRuntimeState>;
  selectedArtifact?: ArtifactDetail | null;
  apiStatus?: "idle" | "fetching" | "ready" | "error";
  onCloseDetail?: () => void;
  onTextLayoutChange?: () => void;
}) {
  const initializedRef = useRef<boolean | null>(null);
  if (initializedRef.current == null) {
    restore(state.current);
    initializedRef.current = true;
  }

  const [activeTab, setActiveTab] = useState<DebugTab>(() => loadSavedTab());
  const [searchQuery, setSearchQuery] = useState("");
  const panelContentRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const container = panelContentRef.current;
    if (!container) return;

    const applyFilter = () => {
      const q = searchQuery.trim().toLowerCase();
      const rows = container.querySelectorAll<HTMLElement>(
        '[class*="StyledRow"], [class*="StyledInputRow"]',
      );
      const folders = container.querySelectorAll<HTMLElement>(
        '[class*="StyledFolder"]',
      );

      if (!q) {
        rows.forEach((r) => (r.style.display = ""));
        folders.forEach((f) => (f.style.display = ""));
        return;
      }

      folders.forEach((folder) => {
        const titleEl = folder.querySelector<HTMLElement>(
          '[class*="StyledTitle"]',
        );
        const folderTitle = titleEl?.textContent?.toLowerCase() ?? "";
        const folderMatches = folderTitle.includes(q);

        const folderRows = folder.querySelectorAll<HTMLElement>(
          '[class*="StyledRow"], [class*="StyledInputRow"]',
        );
        let anyRowVisible = false;

        folderRows.forEach((row) => {
          const text = row.textContent?.toLowerCase() ?? "";
          if (folderMatches || text.includes(q)) {
            row.style.display = "";
            anyRowVisible = true;
          } else {
            row.style.display = "none";
          }
        });

        if (folderMatches || anyRowVisible) {
          folder.style.display = "";
        } else {
          folder.style.display = "none";
        }
      });

      rows.forEach((row) => {
        if (row.closest('[class*="StyledFolder"]')) return;
        const text = row.textContent?.toLowerCase() ?? "";
        row.style.display = text.includes(q) ? "" : "none";
      });
    };

    applyFilter();
    const t1 = setTimeout(applyFilter, 50);
    const t2 = setTimeout(applyFilter, 160);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [searchQuery, activeTab]);

  const saveToLocalStorage = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      toast.success("Settings saved to localStorage");
    } catch {
      toast.error("Unable to save settings to localStorage");
    }
  };

  const resetSaved = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
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
      {/* Sleek Floating Debug Panel: Header (2 lines) + Leva Controls Area */}
      <div
        id="leva__root"
        className="fixed top-3 right-3 z-[999999] flex flex-col w-[392px] max-h-[calc(100vh-24px)] pointer-events-auto select-none rounded-xl border border-white/10 bg-[#141414]/95 backdrop-blur-md shadow-2xl overflow-hidden"
      >
        {/* Line 1: 6 Segmented Tabs */}
        <div className="flex items-center gap-1 p-1.5 border-b border-white/5 bg-white/[0.02]">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const q = searchQuery.trim().toLowerCase();
            const hasMatches =
              Boolean(q) &&
              TAB_KEYWORDS[tab.id]?.some((k) => k.includes(q));
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex-1 py-1 text-[11px] font-mono rounded transition-all duration-150 capitalize text-center ${
                  isActive
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
                {hasMatches && !isActive && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Line 2: Search Input + Save & Copy Actions */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/10 bg-[#161616]">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 1114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings..."
              className="w-full h-7 pl-8 pr-6 text-xs font-mono bg-white/5 hover:bg-white/10 focus:bg-white/[0.08] text-white placeholder:text-white/30 rounded border border-white/10 focus:border-white/30 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs px-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={saveToLocalStorage}
            title="Save settings to localStorage"
            className="flex items-center gap-1 px-2.5 h-7 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded transition-all active:scale-95 shrink-0"
          >
            Save
          </button>
          <button
            onClick={resetSaved}
            title="Forget saved settings and reload with the defaults"
            className="flex items-center gap-1 px-2.5 h-7 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded transition-all active:scale-95 shrink-0"
          >
            Reset
          </button>
          <button
            onClick={copyJson}
            title="Copy JSON configuration to clipboard"
            className="flex items-center gap-1 px-2.5 h-7 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded transition-all active:scale-95 shrink-0"
          >
            Copy
          </button>
        </div>

        {/* Étape courante + tête de lecture de la timeline d'entrée */}
        <TimelineBar state={state} runtime={runtime} />

        {/* Leva Controls Area: takes whatever height is needed, scrolls smoothly if taller than screen */}
        <div
          ref={panelContentRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain leva-custom-scroll"
        >
          <Leva
            fill
            flat
            titleBar={false}
            theme={LEVA_THEME}
          />
        </div>
      </div>

      {activeTab === "camera" && <CameraTab state={state} />}
      {activeTab === "media" && <MediaTab state={state} />}
      {activeTab === "canvas" && (
        <CanvasTab
          state={state}
          stats={stats}
          onLayoutChange={onLayoutChange}
        />
      )}
      {activeTab === "transition" && (
        <TransitionTab
          state={state}
          onSimulateSelect={onSimulateSelect}
          onResetTransition={onResetTransition}
          onPanelChange={onTextLayoutChange}
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
          onTextLayoutChange={onTextLayoutChange}
        />
      )}
    </>
  );
}
