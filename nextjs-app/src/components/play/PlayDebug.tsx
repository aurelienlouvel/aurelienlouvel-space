"use client";

import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import type { PlayDebugRef, PlayDebugState } from "./PlayCanvas";

const STORAGE_KEY = "play-debug";

/** Durée de l'accusé de réception du bouton save. */
const SAVED_LABEL_MS = 1200;

/** Les groupes de l'état sont tous des sacs de nombres, le stockage aussi. */
type NumberGroups = Record<string, Record<string, number>>;

/**
 * Recharge les valeurs sauvegardées dans l'objet d'état, en place.
 *
 * L'état est muté clé par clé plutôt que remplacé d'un bloc : les bindings
 * tweakpane pointent sur les objets de groupe, qui doivent survivre. Au passage
 * une sauvegarde antérieure à l'ajout d'un réglage reste lisible, et une entrée
 * abîmée ne fait que retomber sur la valeur par défaut.
 */
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
  for (const [name, group] of Object.entries(state as unknown as NumberGroups)) {
    const savedGroup = saved[name];
    if (typeof savedGroup !== "object" || savedGroup === null) continue;
    for (const key of Object.keys(group)) {
      const value = (savedGroup as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        group[key] = value;
      }
    }
  }
}

/**
 * Debug pane tweakpane, monté en dev uniquement (cf. `PlayCanvas`).
 *
 * Les bindings écrivent directement dans l'objet d'état, que les `useFrame` du
 * canvas relisent à chaque frame : les sliders sont donc live, sans repasser
 * par React.
 *
 * Le bouton save fige les valeurs courantes dans `localStorage`, et le pane les
 * recharge au montage. La persistance s'arrête là : en prod le pane n'est pas
 * embarqué, donc le canvas repart toujours des valeurs par défaut du code.
 */
export function PlayDebug({ state }: { state: PlayDebugRef }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    restore(state.current);
    const {
      plane: planeState,
      brackets: bracketsState,
      camera: cameraState,
    } = state.current;
    const pane = new Pane({ container, title: "play" });

    // Titre `image` et non `plane` : c'est ce que le pane donne à lire, et le
    // plane n'est qu'un détail d'implémentation côté three.
    const plane = pane.addFolder({ title: "image" });
    plane.addBinding(planeState, "x", { min: -1000, max: 1000, step: 1 });
    plane.addBinding(planeState, "y", { min: -1000, max: 1000, step: 1 });
    plane.addBinding(planeState, "width", { min: 50, max: 2000, step: 1 });
    plane.addBinding(planeState, "radius", { min: 0, max: 200, step: 1 });

    const brackets = pane.addFolder({ title: "brackets" });
    brackets.addBinding(bracketsState, "radius", { min: 0, max: 200, step: 1 });
    brackets.addBinding(bracketsState, "thickness", {
      min: 0,
      max: 24,
      step: 0.5,
    });
    brackets.addBinding(bracketsState, "arm", { min: 0, max: 200, step: 1 });

    const camera = pane.addFolder({ title: "camera" });
    camera.addBinding(cameraState, "x", { min: -2000, max: 2000, step: 1 });
    camera.addBinding(cameraState, "y", { min: -2000, max: 2000, step: 1 });
    camera.addBinding(cameraState, "zoom", { min: 0.1, max: 5, step: 0.01 });

    const save = pane.addButton({ title: "save" });
    let revert: ReturnType<typeof setTimeout> | undefined;
    save.on("click", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      save.title = "saved";
      clearTimeout(revert);
      revert = setTimeout(() => {
        save.title = "save";
      }, SAVED_LABEL_MS);
    });

    return () => {
      clearTimeout(revert);
      pane.dispose();
    };
  }, [state]);

  return <div ref={containerRef} className="fixed top-4 right-4 z-50 w-64" />;
}
