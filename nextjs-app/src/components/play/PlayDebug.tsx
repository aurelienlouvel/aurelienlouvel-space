"use client";

import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import type { PlayDebugRef, PlayDebugState } from "./PlayCanvas";
import type { LayoutStats } from "./layout-types";

const STORAGE_KEY = "play-debug";

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
  const button = pane.addButton({ title });
  let revert: ReturnType<typeof setTimeout> | undefined;

  function flash(done: string) {
    button.title = done;
    clearTimeout(revert);
    revert = setTimeout(() => {
      button.title = title;
    }, FLASH_MS);
  }

  button.on("click", () => {
    void Promise.resolve(action()).then(flash);
  });

  return () => clearTimeout(revert);
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
    computeTime: "0 ms",
    density: "0%",
    occupiedArea: "0 px²",
    boundingBoxArea: "0 px²",
    perfectLayouts: "0 / 0",
  });

  // Synchronisation dynamique des statistiques calculées sans recréer le pane
  useEffect(() => {
    if (!stats) return;
    statsObj.current.computeTime = stats.computeTimeFormatted;
    statsObj.current.density = stats.densityPercent;
    statsObj.current.occupiedArea = stats.occupiedAreaFormatted;
    statsObj.current.boundingBoxArea = stats.boundingBoxAreaFormatted;
    statsObj.current.perfectLayouts = `${stats.perfectCount} / ${stats.totalIterations}`;
    paneRef.current?.refresh();
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

    // ── Caméra ────────────────────────────────────────────────────
    const camera = pane.addFolder({ title: "camera" });
    camera.addBinding(cameraState, "zoom", { min: 0.1, max: 5, step: 0.01 });

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
