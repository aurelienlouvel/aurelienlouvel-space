"use client";

import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import type { PlayDebugRef, PlayDebugState } from "./PlayCanvas";
import type { LayoutStats } from "./layout-types";
import {
  TRANSITION_PRESETS,
  type TransitionPresetName,
} from "./transition-presets";

const STORAGE_KEY = "play-debug-v18";

/** Durée de l'accusé de réception d'un bouton. */
const FLASH_MS = 1200;

/** Les groupes de l'état sont des sacs de réglages, le stockage aussi. */
type SettingGroups = Record<string, Record<string, unknown>>;

/** La seule chaîne de l'état est une couleur, et le pane la veut valide. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function restore(state: PlayDebugState) {
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
  const groups = Object.entries(state as unknown as SettingGroups);
  for (const [name, group] of groups) {
    const savedGroup = saved[name];
    if (typeof savedGroup !== "object" || savedGroup === null) continue;
    for (const [key, fallback] of Object.entries(group)) {
      const value = (savedGroup as Record<string, unknown>)[key];
      if (typeof value !== typeof fallback) continue;
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      if (typeof value === "string" && key === "color" && !HEX_COLOR.test(value)) continue;
      group[key] = value;
    }
  }
}

function addAction(
  pane: Pane,
  title: string,
  action: () => string | Promise<string>,
) {
  const btn = pane.addButton({ title });
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  btn.on("click", async () => {
    const message = await action();
    btn.title = message;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      btn.title = title;
    }, FLASH_MS);
  });

  return () => clearTimeout(resetTimer);
}

/**
 * Debug pane Tweakpane, monté en dev uniquement (cf. `PlayCanvas`).
 */
export function PlayDebug({
  state,
  stats,
  onLayoutChange,
}: {
  state: PlayDebugRef;
  stats?: LayoutStats;
  onLayoutChange: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<Pane | null>(null);

  const statsObj = useRef({
    computeTime: "-",
    density: "-",
    occupiedArea: "-",
    boundingBoxArea: "-",
    perfectLayouts: "-",
  });

  // Synchronisation dynamique des statistiques calculées sans recréer le pane
  useEffect(() => {
    if (stats) {
      statsObj.current.computeTime = stats.computeTimeFormatted;
      statsObj.current.density = stats.densityPercent;
      statsObj.current.occupiedArea = stats.occupiedAreaFormatted;
      statsObj.current.boundingBoxArea = stats.boundingBoxAreaFormatted;
      statsObj.current.perfectLayouts = `${stats.perfectCount} / ${stats.totalIterations}`;
      paneRef.current?.refresh();
    }
  }, [stats]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    restore(state.current);
    const {
      plane: planeState,
      brackets: bracketsState,
      indicator: indicatorState,
      camera: cameraState,
      gravity: gravityState,
      pan: panState,
      physics: physicsState,
      transition: transitionState,
    } = state.current;

    const pane = new Pane({ container, title: "play" });
    paneRef.current = pane;

    // ── Image ─────────────────────────────────────────────────────────────
    const image = pane.addFolder({ title: "image" });
    image.addBinding(planeState, "radius", { min: 0, max: 200, step: 1 });

    // ── Brackets ──────────────────────────────────────────────────────────
    const brackets = pane.addFolder({ title: "brackets" });
    brackets.addBinding(bracketsState, "padding", { min: 0, max: 200, step: 1 });
    brackets.addBinding(bracketsState, "radius", { min: 0, max: 200, step: 1 });
    brackets.addBinding(bracketsState, "angle", { min: 0, max: 90, step: 1 });
    brackets.addBinding(bracketsState, "arm", { min: 0, max: 200, step: 1 });
    brackets.addBinding(bracketsState, "thickness", {
      min: 0,
      max: 24,
      step: 0.5,
    });
    brackets.addBinding(bracketsState, "color");

    // ── Indicateur ────────────────────────────────────────────────────────
    const indicator = pane.addFolder({ title: "indicator" });
    indicator.addBinding(indicatorState, "fadeSpeed", { min: 1, max: 40, step: 1 });
    indicator.addBinding(indicatorState, "moveSpeed", { min: 1, max: 40, step: 1 });

    // ── Caméra & Fisheye ──────────────────────────────────────────
    const camera = pane.addFolder({ title: "camera" });
    camera.addBinding(cameraState, "zoom", { min: 0.1, max: 5, step: 0.01 });
    const fisheye = camera.addFolder({ title: "fisheye (optique)" });
    fisheye.addBinding(state.current.fisheye, "enabled", { label: "activer" });
    fisheye.addBinding(state.current.fisheye, "strength", {
      min: 0,
      max: 0.2,
      step: 0.002,
      label: "courbure globe",
    });

    // ── Layout : Gravité Centrale ─────────────────────────────────
    const layout = pane.addFolder({ title: "layout (gravité)" });
    layout
      .addBinding(gravityState, "maxWidth", { min: 100, max: 1000, step: 10 })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "maxHeight", { min: 100, max: 1000, step: 10 })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "gap", { min: 0, max: 400, step: 4 })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "targetAspect", {
        min: 0.5,
        max: 3.0,
        step: 0.05,
        label: "ratio rectangle",
      })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "scaleVariance", {
        min: 0,
        max: 0.8,
        step: 0.05,
        label: "variance scale",
      })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "antiNeighbor", {
        label: "anti-voisins",
      })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "repeatGap", {
        min: 0,
        max: 400,
        step: 10,
        label: "écart anti-voisin",
      })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "repeat", { min: 1, max: 10, step: 1 })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "iterations", {
        min: 1,
        max: 10000,
        step: 10,
        label: "itérations M-C",
      })
      .on("change", onLayoutChange);
    layout
      .addBinding(gravityState, "seed", { min: 0, max: 9999, step: 1 })
      .on("change", onLayoutChange);

    // ── Statistiques du layout calculé ────────────────────────────
    const statsFolder = layout.addFolder({ title: "statistiques" });
    statsFolder.addBinding(statsObj.current, "computeTime", {
      readonly: true,
      label: "temps calcul",
    });
    statsFolder.addBinding(statsObj.current, "density", {
      readonly: true,
      label: "densité",
    });
    statsFolder.addBinding(statsObj.current, "occupiedArea", {
      readonly: true,
      label: "aire occupée",
    });
    statsFolder.addBinding(statsObj.current, "boundingBoxArea", {
      readonly: true,
      label: "aire totale (BB)",
    });
    statsFolder.addBinding(statsObj.current, "perfectLayouts", {
      readonly: true,
      label: "layouts parfaits",
    });

    // ── Pan ───────────────────────────────────────────────────────
    const pan = pane.addFolder({ title: "pan" });
    pan.addBinding(panState, "dragThreshold", { min: 0, max: 40, step: 1 });
    pan.addBinding(panState, "velocityWindowMs", { min: 10, max: 300, step: 5 });
    pan.addBinding(panState, "friction", { min: -10, max: -0.2, step: 0.1 });

    // ── Déplacement cinématique : Répulsion uniforme ────────────
    const physics = pane.addFolder({ title: "cinématique (répulsion)" });
    physics.addBinding(physicsState, "enabled", { label: "activer" });
    physics.addBinding(physicsState, "damping", {
      min: 2,
      max: 40,
      step: 0.5,
      label: "vitesse de retour",
    });

    // ── Transition 3 phases (Progression -> Animation Select -> Transition Artifact) ───
    const transition = pane.addFolder({ title: "transition (3 parties)" });

    const presetBinding = transition.addBinding(transitionState, "preset", {
      options: {
        Cinematic: "cinematic",
        Snappy: "snappy",
        Dramatic: "dramatic",
        Custom: "custom",
      },
      label: "preset",
    });

    // 1. Progression du select (Hold)
    const phase1 = transition.addFolder({ title: "1. progression du select" });
    phase1.addBinding(transitionState, "selectDuration", {
      min: 0.2,
      max: 2.0,
      step: 0.05,
      label: "durée hold (s)",
    });
    phase1.addBinding(transitionState, "selectZoom", {
      min: 1.0,
      max: 1.5,
      step: 0.01,
      label: "zoom caméra",
    });
    phase1.addBinding(transitionState, "selectScale", {
      min: 1.0,
      max: 1.25,
      step: 0.01,
      label: "scale média",
    });
    phase1.addBinding(transitionState, "selectRepulse", {
      min: 0,
      max: 3000,
      step: 50,
      label: "tension répulsion",
    });
    phase1.addBinding(transitionState, "selectEasing", {
      options: {
        linear: "linear",
        easeInQuad: "easeInQuad",
        easeOutQuad: "easeOutQuad",
        easeInCubic: "easeInCubic",
        easeInOutCubic: "easeInOutCubic",
        easeOutExpo: "easeOutExpo",
        easeOutQuint: "easeOutQuint",
      },
      label: "courbe easing",
    });

    // 2. Animation de select (Lock)
    const phase2 = transition.addFolder({ title: "2. animation de select (lock)" });
    phase2.addBinding(transitionState, "lockDuration", {
      min: 0.1,
      max: 1.5,
      step: 0.05,
      label: "durée lock (s)",
    });
    phase2.addBinding(transitionState, "lockBracketTighten", {
      min: 0,
      max: 40,
      step: 1,
      label: "pincement brackets (px)",
    });
    phase2.addBinding(transitionState, "lockBracketExpand", {
      min: 0,
      max: 60,
      step: 1,
      label: "expansion fade extérieur (px)",
    });
    phase2.addBinding(transitionState, "lockScalePunch", {
      min: 0.0,
      max: 0.2,
      step: 0.01,
      label: "scale punch pop",
    });
    phase2.addBinding(transitionState, "overlayExitDuration", {
      min: 0.1,
      max: 1.2,
      step: 0.05,
      label: "durée fin vague (s)",
    });

    // 3. Transition vers la page artifact (Burst)
    const phase3 = transition.addFolder({ title: "3. transition artifact (burst)" });
    phase3.addBinding(transitionState, "burstDuration", {
      min: 0.2,
      max: 3.0,
      step: 0.05,
      label: "durée burst (s)",
    });
    phase3.addBinding(transitionState, "burstZoom", {
      min: 1.2,
      max: 5.0,
      step: 0.1,
      label: "maxi zoom",
    });
    phase3.addBinding(transitionState, "burstRepulse", {
      min: 10000,
      max: 300000,
      step: 5000,
      label: "maxi répulsion",
    });
    phase3.addBinding(transitionState, "burstEasing", {
      options: {
        linear: "linear",
        easeInQuad: "easeInQuad",
        easeOutQuad: "easeOutQuad",
        easeInCubic: "easeInCubic",
        easeInOutCubic: "easeInOutCubic",
        easeOutExpo: "easeOutExpo",
        easeOutQuint: "easeOutQuint",
      },
      label: "courbe easing",
    });

    // 4. Retour vers la page de base
    const phase4 = transition.addFolder({ title: "4. retour page de base" });
    phase4.addBinding(transitionState, "repulseReturnDelay", {
      min: 0.0,
      max: 1.5,
      step: 0.05,
      label: "délai retour répulsion (s)",
    });

    presetBinding.on("change", (ev) => {
      const presetKey = ev.value as TransitionPresetName;
      if (presetKey !== "custom" && TRANSITION_PRESETS[presetKey]) {
        Object.assign(transitionState, TRANSITION_PRESETS[presetKey]);
        transitionState.preset = presetKey;
        pane.refresh();
      }
    });

    phase1.on("change", () => {
      if (transitionState.preset !== "custom") {
        transitionState.preset = "custom";
        pane.refresh();
      }
    });
    phase2.on("change", () => {
      if (transitionState.preset !== "custom") {
        transitionState.preset = "custom";
        pane.refresh();
      }
    });
    phase3.on("change", () => {
      if (transitionState.preset !== "custom") {
        transitionState.preset = "custom";
        pane.refresh();
      }
    });
    phase4.on("change", () => {
      if (transitionState.preset !== "custom") {
        transitionState.preset = "custom";
        pane.refresh();
      }
    });

    // ── Overlay Sélection (Sticker iOS & Vague) ───────────────────
    const overlayFolder = pane.addFolder({ title: "overlay sélection (sticker)" });
    overlayFolder.addBinding(state.current.overlay, "crestSoftness", {
      min: 0.02,
      max: 0.35,
      step: 0.005,
      label: "douceur fondu",
    });
    overlayFolder.addBinding(state.current.overlay, "waveAmplitude", {
      min: 0.0,
      max: 0.06,
      step: 0.001,
      label: "amplitude vague",
    });
    overlayFolder.addBinding(state.current.overlay, "waveFrequency", {
      min: 1.0,
      max: 10.0,
      step: 0.2,
      label: "fréquence vague",
    });
    overlayFolder.addBinding(state.current.overlay, "waveSpeed", {
      min: 0.0,
      max: 8.0,
      step: 0.2,
      label: "vitesse clapotis",
    });
    overlayFolder.addBinding(state.current.overlay, "iridescence", {
      min: 0.0,
      max: 1.0,
      step: 0.02,
      label: "iridescence",
    });
    overlayFolder.addBinding(state.current.overlay, "baseOpacity", {
      min: 0.05,
      max: 0.8,
      step: 0.01,
      label: "opacité voile",
    });
    overlayFolder.addBinding(state.current.overlay, "glowIntensity", {
      min: 0.0,
      max: 1.0,
      step: 0.02,
      label: "lueur diffuse",
    });

    const stopSave = addAction(pane, "save", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      return "saved";
    });

    const stopCopy = addAction(pane, "copy", () =>
      navigator.clipboard
        .writeText(JSON.stringify(state.current, null, 2))
        .then(
          () => "copied",
          () => "clipboard refused",
        ),
    );

    return () => {
      stopSave();
      stopCopy();
      pane.dispose();
      paneRef.current = null;
    };
  }, [state, onLayoutChange]);

  return <div ref={containerRef} className="fixed top-4 right-4 z-50 w-64" />;
}
