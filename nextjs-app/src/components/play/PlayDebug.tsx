"use client";

import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import type { PlayDebugRef, PlayDebugState } from "./PlayCanvas";

const STORAGE_KEY = "play-debug";

/** Durée de l'accusé de réception d'un bouton. */
const FLASH_MS = 1200;

/** Les groupes de l'état sont des sacs de réglages, le stockage aussi. */
type SettingGroups = Record<string, Record<string, unknown>>;

/** Les seules chaînes de l'état sont des couleurs, et le pane les veut valides. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Recharge les valeurs sauvegardées dans l'objet d'état, en place.
 *
 * L'état est muté clé par clé plutôt que remplacé d'un bloc : les bindings
 * tweakpane pointent sur les objets de groupe, qui doivent survivre. Au passage
 * une sauvegarde antérieure à l'ajout d'un réglage reste lisible, et une entrée
 * abîmée ne fait que retomber sur la valeur par défaut.
 *
 * Le type de la valeur par défaut fait loi : une entrée d'un autre type est le
 * reste d'une version antérieure du pane, pas une valeur à recharger. Le
 * contrôle va jusqu'à la forme pour les couleurs, car tweakpane refuse de créer
 * un binding sur une chaîne qu'il ne sait pas lire — une seule entrée abîmée
 * emporterait le pane entier.
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
  const groups = Object.entries(state as unknown as SettingGroups);
  for (const [name, group] of groups) {
    const savedGroup = saved[name];
    if (typeof savedGroup !== "object" || savedGroup === null) continue;
    for (const [key, fallback] of Object.entries(group)) {
      const value = (savedGroup as Record<string, unknown>)[key];
      if (typeof value !== typeof fallback) continue;
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      if (typeof value === "string" && !HEX_COLOR.test(value)) continue;
      group[key] = value;
    }
  }
}

/**
 * Ajoute un bouton qui confirme son action en changeant de titre un instant, et
 * rend de quoi annuler une confirmation restée en attente.
 *
 * Le titre de repos est celui passé en argument, jamais celui relu sur le
 * bouton : deux clics rapprochés le liraient pendant la confirmation, et
 * l'auraient figé dessus.
 *
 * L'action rend le mot de sa confirmation, au besoin plus tard : c'est ce qui
 * permet au presse-papiers de n'annoncer le succès qu'une fois sa promesse
 * tenue, et de dire autre chose si elle est rompue.
 */
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
    // `Promise.resolve` ramène les deux formes d'action au même traitement ; le
    // tick qu'il coûte à une action synchrone ne se voit pas.
    void Promise.resolve(action()).then(flash);
  });

  return () => clearTimeout(revert);
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
 * embarqué, donc le canvas repart toujours des valeurs par défaut du code — le
 * bouton copy sert justement à en sortir les valeurs pour les y reporter.
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

    // Rangés comme se lit la forme : où elle se pose, comment elle tourne, sur
    // quelle longueur elle se prolonge, de quel trait elle s'écrit.
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

    const camera = pane.addFolder({ title: "camera" });
    camera.addBinding(cameraState, "x", { min: -2000, max: 2000, step: 1 });
    camera.addBinding(cameraState, "y", { min: -2000, max: 2000, step: 1 });
    camera.addBinding(cameraState, "zoom", { min: 0.1, max: 5, step: 0.01 });

    const stopSave = addAction(pane, "save", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      return "saved";
    });

    // Indenté, contrairement à la sauvegarde : celle-ci n'est relue que par du
    // code, alors que la copie est faite pour être collée dans une discussion.
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
    };
  }, [state]);

  return <div ref={containerRef} className="fixed top-4 right-4 z-50 w-64" />;
}
