"use client";

import { useEffect } from "react";

import { getTransitionRig, setTheatreStudioApi, setTheatreStudioMounted } from "./theatre-timeline";

/**
 * Monte l'éditeur de keyframes Theatre.js — développement uniquement.
 *
 * `@theatre/studio` pèse ~800 ko et n'est chargé qu'ici, en import dynamique
 * sous garde `NODE_ENV`, donc il disparaît du bundle de production. Seul
 * `@theatre/core` (qui rejoue l'état exporté) part en ligne.
 *
 * L'initialisation est verrouillée au niveau module : Theatre ne supporte pas
 * d'être initialisé deux fois, et le double montage des effets en StrictMode le
 * ferait sinon systématiquement.
 */
let initialized = false;

export function TheatreStudio() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cancelled = false;

    void (async () => {
      // Créer projet + feuille + objet avant l'éditeur : il les découvre au
      // démarrage au lieu d'afficher une outline vide.
      getTransitionRig();

      const mod = await import("@theatre/studio");
      if (cancelled) return;

      if (!initialized) {
        initialized = true;
        mod.default.initialize({ persistenceKey: "ore-play-transition" });
      }

      setTheatreStudioApi(mod.default);
      setTheatreStudioMounted(true);
    })();

    return () => {
      cancelled = true;
      setTheatreStudioApi(null);
      setTheatreStudioMounted(false);
    };
  }, []);

  return null;
}
