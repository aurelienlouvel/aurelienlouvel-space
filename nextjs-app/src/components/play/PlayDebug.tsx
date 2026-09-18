"use client";

import { useRef, useEffect } from "react";
import { useControls, folder, buttonGroup, Leva } from "leva";
import { toast } from "sonner";
import {
  type PlayDebugRef,
  type PlayDebugState,
} from "./PlayCanvas";
import type { LayoutStats } from "./layout-types";
import {
  TRANSITION_PRESETS,
  type TransitionPresetName,
  type EasingName,
} from "./transition-presets";

const STORAGE_KEY = "play-debug-v20";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

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
    if (name === "studio") continue; // Session uniquement
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

/**
 * Interface de contrôle et de débogage animée avec Leva.
 */
export function PlayDebug({
  state,
  stats,
  onLayoutChange,
  onReplayLock,
  onSimulateSelect,
  onResetTransition,
}: {
  state: PlayDebugRef;
  stats?: LayoutStats;
  onLayoutChange: () => void;
  onReplayLock: () => void;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
}) {
  const initializedRef = useRef<boolean | null>(null);
  if (initializedRef.current == null) {
    restore(state.current);
    initializedRef.current = true;
  }

  const setControlsRef = useRef<((values: Record<string, unknown>) => void) | null>(null);

  const saveToLocalStorage = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      toast.success("Réglages sauvegardés dans localStorage");
    } catch {
      toast.error("Impossible de sauvegarder dans localStorage");
    }
  };

  const copyJson = () => {
    navigator.clipboard
      .writeText(JSON.stringify(state.current, null, 2))
      .then(
        () => toast.success("Configuration copiée dans le presse-papiers"),
        () => toast.error("Échec de la copie dans le presse-papiers"),
      );
  };

  // ── 1. Studio Animation ─────────────────────────────────────────
  useControls("🎬 studio animation", () => ({
    actions: buttonGroup({
      "▶ Rejouer Lock": onReplayLock,
      "▶ Simuler Select": onSimulateSelect,
      "⏹ Reset": onResetTransition,
    }),
    "boucler le lock": {
      value: state.current.studio.loopLock,
      label: "boucler le lock",
      onChange: (v: boolean) => {
        state.current.studio.loopLock = v;
      },
    },
    "vitesse (ralenti)": {
      value: state.current.studio.speed,
      label: "vitesse",
      options: {
        "0.1x (Ultra slow)": 0.1,
        "0.25x (Ralenti)": 0.25,
        "0.5x (Demi)": 0.5,
        "1.0x (Normal)": 1.0,
      },
      onChange: (v: number) => {
        state.current.studio.speed = v;
      },
    },
    "arrêt sur image": {
      value: state.current.studio.scrubMode,
      label: "mode scrubber",
      onChange: (v: boolean) => {
        state.current.studio.scrubMode = v;
        if (v) {
          onReplayLock();
        }
      },
    },
    "curseur scrubber": {
      value: state.current.studio.scrubProgress,
      label: "curseur (0% - 100%)",
      min: 0,
      max: 1,
      step: 0.005,
      onChange: (v: number) => {
        state.current.studio.scrubProgress = v;
      },
    },
  }));

  // ── 2. Image ────────────────────────────────────────────────────
  useControls("image", () => ({
    radius: {
      value: state.current.plane.radius,
      min: 0,
      max: 200,
      step: 1,
      label: "arrondi (radius)",
      onChange: (v: number) => {
        state.current.plane.radius = v;
      },
    },
  }));

  // ── 3. Brackets ─────────────────────────────────────────────────
  useControls("brackets", () => ({
    padding: {
      value: state.current.brackets.padding,
      min: 0,
      max: 200,
      step: 1,
      onChange: (v: number) => {
        state.current.brackets.padding = v;
      },
    },
    radius: {
      value: state.current.brackets.radius,
      min: 0,
      max: 200,
      step: 1,
      onChange: (v: number) => {
        state.current.brackets.radius = v;
      },
    },
    angle: {
      value: state.current.brackets.angle,
      min: 0,
      max: 90,
      step: 1,
      onChange: (v: number) => {
        state.current.brackets.angle = v;
      },
    },
    arm: {
      value: state.current.brackets.arm,
      min: 0,
      max: 200,
      step: 1,
      onChange: (v: number) => {
        state.current.brackets.arm = v;
      },
    },
    thickness: {
      value: state.current.brackets.thickness,
      min: 0,
      max: 24,
      step: 0.5,
      label: "épaisseur",
      onChange: (v: number) => {
        state.current.brackets.thickness = v;
      },
    },
    color: {
      value: state.current.brackets.color,
      label: "couleur",
      onChange: (v: string) => {
        state.current.brackets.color = v;
      },
    },
  }));

  // ── 4. Indicateur ───────────────────────────────────────────────
  useControls("indicator", () => ({
    fadeSpeed: {
      value: state.current.indicator.fadeSpeed,
      min: 1,
      max: 40,
      step: 1,
      label: "vitesse fade",
      onChange: (v: number) => {
        state.current.indicator.fadeSpeed = v;
      },
    },
    moveSpeed: {
      value: state.current.indicator.moveSpeed,
      min: 1,
      max: 40,
      step: 1,
      label: "vitesse suivi",
      onChange: (v: number) => {
        state.current.indicator.moveSpeed = v;
      },
    },
  }));

  // ── 5. Caméra & Fisheye ─────────────────────────────────────────
  useControls("camera", () => ({
    zoom: {
      value: state.current.camera.zoom,
      min: 0.1,
      max: 5,
      step: 0.01,
      onChange: (v: number) => {
        state.current.camera.zoom = v;
      },
    },
    "fisheye (optique)": folder({
      "activer fisheye": {
        value: state.current.fisheye.enabled,
        label: "activer",
        onChange: (v: boolean) => {
          state.current.fisheye.enabled = v;
        },
      },
      "courbure globe": {
        value: state.current.fisheye.strength,
        min: 0,
        max: 0.2,
        step: 0.002,
        label: "courbure globe",
        onChange: (v: number) => {
          state.current.fisheye.strength = v;
        },
      },
    }),
  }));

  // ── 6. Layout (Gravité) ─────────────────────────────────────────
  useControls("layout (gravité)", () => ({
    maxWidth: {
      value: state.current.gravity.maxWidth,
      min: 100,
      max: 1000,
      step: 10,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.maxWidth = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    maxHeight: {
      value: state.current.gravity.maxHeight,
      min: 100,
      max: 1000,
      step: 10,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.maxHeight = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    gap: {
      value: state.current.gravity.gap,
      min: 0,
      max: 400,
      step: 4,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.gap = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    "ratio rectangle": {
      value: state.current.gravity.targetAspect,
      min: 0.5,
      max: 3.0,
      step: 0.05,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.targetAspect = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    "variance scale": {
      value: state.current.gravity.scaleVariance,
      min: 0,
      max: 0.8,
      step: 0.05,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.scaleVariance = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    "anti-voisins": {
      value: state.current.gravity.antiNeighbor,
      onChange: (v: boolean, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.antiNeighbor = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    "écart anti-voisin": {
      value: state.current.gravity.repeatGap,
      min: 0,
      max: 400,
      step: 10,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.repeatGap = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    repeat: {
      value: state.current.gravity.repeat,
      min: 1,
      max: 10,
      step: 1,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.repeat = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    "itérations M-C": {
      value: state.current.gravity.iterations,
      min: 1,
      max: 10000,
      step: 10,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.iterations = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    seed: {
      value: state.current.gravity.seed,
      min: 0,
      max: 9999,
      step: 1,
      onChange: (v: number, _p: string, ctx: { initial: boolean }) => {
        state.current.gravity.seed = v;
        if (!ctx.initial) onLayoutChange();
      },
    },
    statistiques: folder(
      {
        "temps calcul": {
          value: stats?.computeTimeFormatted ?? "-",
          editable: false,
        },
        densité: {
          value: stats?.densityPercent ?? "-",
          editable: false,
        },
        "aire occupée": {
          value: stats?.occupiedAreaFormatted ?? "-",
          editable: false,
        },
        "aire totale (BB)": {
          value: stats?.boundingBoxAreaFormatted ?? "-",
          editable: false,
        },
        "layouts parfaits": {
          value: stats
            ? `${stats.perfectCount} / ${stats.totalIterations}`
            : "-",
          editable: false,
        },
      },
      { collapsed: true },
    ),
  }));

  // ── 7. Pan ──────────────────────────────────────────────────────
  useControls("pan", () => ({
    dragThreshold: {
      value: state.current.pan.dragThreshold,
      min: 0,
      max: 40,
      step: 1,
      onChange: (v: number) => {
        state.current.pan.dragThreshold = v;
      },
    },
    velocityWindowMs: {
      value: state.current.pan.velocityWindowMs,
      min: 10,
      max: 300,
      step: 5,
      onChange: (v: number) => {
        state.current.pan.velocityWindowMs = v;
      },
    },
    friction: {
      value: state.current.pan.friction,
      min: -10,
      max: -0.2,
      step: 0.1,
      onChange: (v: number) => {
        state.current.pan.friction = v;
      },
    },
  }));

  // ── 8. Cinématique (Répulsion) ──────────────────────────────────
  useControls("cinématique (répulsion)", () => ({
    activer: {
      value: state.current.physics.enabled,
      onChange: (v: boolean) => {
        state.current.physics.enabled = v;
      },
    },
    "vitesse de retour": {
      value: state.current.physics.damping,
      min: 2,
      max: 40,
      step: 0.5,
      label: "amortissement",
      onChange: (v: number) => {
        state.current.physics.damping = v;
      },
    },
  }));

  // ── 9. Transition (3 parties) ───────────────────────────────────
  const [, setTransitionControls] = useControls("transition (3 parties)", () => ({
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
            "durée hold (s)": p.selectDuration,
            "zoom caméra": p.selectZoom,
            "scale média": p.selectScale,
            "tension répulsion": p.selectRepulse,
            "courbe easing hold": p.selectEasing,
            "durée lock (s)": p.lockDuration,
            "pincement brackets (px)": p.lockBracketTighten,
            "expansion fade extérieur (px)": p.lockBracketExpand,
            "scale punch pop": p.lockScalePunch,
            "durée fin vague (s)": p.overlayExitDuration,
            "délai avant transition (s)": p.burstDelay,
            "durée burst (s)": p.burstDuration,
            "maxi zoom": p.burstZoom,
            "maxi répulsion": p.burstRepulse,
            "courbe easing burst": p.burstEasing,
            "délai retour répulsion (s)": p.repulseReturnDelay,
          });
        }
      },
    },
    "1. progression": folder({
      "durée hold (s)": {
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
      "zoom caméra": {
        value: state.current.transition.selectZoom,
        min: 1.0,
        max: 1.5,
        step: 0.01,
        onChange: (v: number) => {
          state.current.transition.selectZoom = v;
        },
      },
      "scale média": {
        value: state.current.transition.selectScale,
        min: 1.0,
        max: 1.25,
        step: 0.01,
        onChange: (v: number) => {
          state.current.transition.selectScale = v;
        },
      },
      "tension répulsion": {
        value: state.current.transition.selectRepulse,
        min: 0,
        max: 3000,
        step: 50,
        onChange: (v: number) => {
          state.current.transition.selectRepulse = v;
        },
      },
      "courbe easing hold": {
        value: state.current.transition.selectEasing,
        options: [
          "linear",
          "easeInQuad",
          "easeOutQuad",
          "easeInCubic",
          "easeInOutCubic",
          "easeOutExpo",
          "easeOutQuint",
        ],
        onChange: (v: string) => {
          state.current.transition.selectEasing = v as EasingName;
        },
      },
    }),
    "2. animation lock": folder({
      "durée lock (s)": {
        value: state.current.transition.lockDuration,
        min: 0.1,
        max: 2.0,
        step: 0.05,
        onChange: (v: number) => {
          state.current.transition.lockDuration = v;
        },
      },
      "pincement brackets (px)": {
        value: state.current.transition.lockBracketTighten,
        min: 0,
        max: 30,
        step: 0.5,
        onChange: (v: number) => {
          state.current.transition.lockBracketTighten = v;
        },
      },
      "expansion fade extérieur (px)": {
        value: state.current.transition.lockBracketExpand,
        min: 0,
        max: 40,
        step: 0.5,
        onChange: (v: number) => {
          state.current.transition.lockBracketExpand = v;
        },
      },
      "scale punch pop": {
        value: state.current.transition.lockScalePunch,
        min: 0.0,
        max: 0.15,
        step: 0.005,
        onChange: (v: number) => {
          state.current.transition.lockScalePunch = v;
        },
      },
      "durée fin vague (s)": {
        value: state.current.transition.overlayExitDuration,
        min: 0.1,
        max: 1.5,
        step: 0.05,
        onChange: (v: number) => {
          state.current.transition.overlayExitDuration = v;
        },
      },
      "délai avant transition (s)": {
        value: state.current.transition.burstDelay,
        min: 0.0,
        max: 1.5,
        step: 0.05,
        onChange: (v: number) => {
          state.current.transition.burstDelay = v;
        },
      },
    }),
    "3. transition burst": folder({
      "durée burst (s)": {
        value: state.current.transition.burstDuration,
        min: 0.2,
        max: 3.0,
        step: 0.05,
        onChange: (v: number) => {
          state.current.transition.burstDuration = v;
        },
      },
      "maxi zoom": {
        value: state.current.transition.burstZoom,
        min: 1.2,
        max: 5.0,
        step: 0.1,
        onChange: (v: number) => {
          state.current.transition.burstZoom = v;
        },
      },
      "maxi répulsion": {
        value: state.current.transition.burstRepulse,
        min: 10000,
        max: 300000,
        step: 5000,
        onChange: (v: number) => {
          state.current.transition.burstRepulse = v;
        },
      },
      "courbe easing burst": {
        value: state.current.transition.burstEasing,
        options: [
          "linear",
          "easeInQuad",
          "easeOutQuad",
          "easeInCubic",
          "easeInOutCubic",
          "easeOutExpo",
          "easeOutQuint",
        ],
        onChange: (v: string) => {
          state.current.transition.burstEasing = v as EasingName;
        },
      },
    }),
    "4. retour page": folder({
      "délai retour répulsion (s)": {
        value: state.current.transition.repulseReturnDelay,
        min: 0.0,
        max: 1.5,
        step: 0.05,
        onChange: (v: number) => {
          state.current.transition.repulseReturnDelay = v;
        },
      },
    }),
  }));

  useEffect(() => {
    setControlsRef.current = setTransitionControls as unknown as (
      values: Record<string, unknown>,
    ) => void;
  }, [setTransitionControls]);

  // ── 10. Overlay Sélection ───────────────────────────────────────
  useControls("overlay sélection", () => ({
    "douceur fondu": {
      value: state.current.overlay.crestSoftness,
      min: 0.02,
      max: 0.35,
      step: 0.005,
      onChange: (v: number) => {
        state.current.overlay.crestSoftness = v;
      },
    },
    "amplitude vague": {
      value: state.current.overlay.waveAmplitude,
      min: 0.0,
      max: 0.06,
      step: 0.001,
      onChange: (v: number) => {
        state.current.overlay.waveAmplitude = v;
      },
    },
    "fréquence vague": {
      value: state.current.overlay.waveFrequency,
      min: 1.0,
      max: 10.0,
      step: 0.2,
      onChange: (v: number) => {
        state.current.overlay.waveFrequency = v;
      },
    },
    "vitesse clapotis": {
      value: state.current.overlay.waveSpeed,
      min: 0.0,
      max: 8.0,
      step: 0.2,
      onChange: (v: number) => {
        state.current.overlay.waveSpeed = v;
      },
    },
    iridescence: {
      value: state.current.overlay.iridescence,
      min: 0.0,
      max: 1.0,
      step: 0.02,
      onChange: (v: number) => {
        state.current.overlay.iridescence = v;
      },
    },
    "opacité voile": {
      value: state.current.overlay.baseOpacity,
      min: 0.05,
      max: 0.8,
      step: 0.01,
      onChange: (v: number) => {
        state.current.overlay.baseOpacity = v;
      },
    },
    "lueur diffuse": {
      value: state.current.overlay.glowIntensity,
      min: 0.0,
      max: 1.0,
      step: 0.02,
      onChange: (v: number) => {
        state.current.overlay.glowIntensity = v;
      },
    },
  }));

  // ── 11. Actions Sauvegarde & Export ─────────────────────────────
  useControls("sauvegarde & export", () => ({
    actions: buttonGroup({
      "💾 Sauvegarder": saveToLocalStorage,
      "📋 Copier JSON": copyJson,
    }),
  }));

  return (
    <Leva
      theme={{
        colors: {
          elevation1: "#121214",
          elevation2: "#18181b",
          elevation3: "#27272a",
          accent1: "#38bdf8",
          accent2: "#0284c7",
          accent3: "#0369a1",
          highlight1: "#f8fafc",
          highlight2: "#e2e8f0",
          highlight3: "#94a3b8",
        },
        radii: {
          xs: "3px",
          sm: "5px",
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
          sans: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        },
        fontSizes: {
          root: "11px",
        },
        sizes: {
          rootWidth: "320px",
          controlWidth: "150px",
          numberInputMinWidth: "46px",
        },
      }}
      collapsed={false}
      oneLineLabels={false}
      titleBar={{ title: "play · studio & debug", drag: true, filter: true }}
    />
  );
}
