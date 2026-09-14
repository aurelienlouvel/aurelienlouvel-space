"use client";

import { useEffect, useRef } from "react";
import { Pane } from "tweakpane";
import type { PlayDebugRef } from "./PlayCanvas";

/**
 * Debug pane tweakpane, monté en dev uniquement (cf. `PlayCanvas`).
 *
 * Les bindings écrivent directement dans l'objet d'état, que les `useFrame` du
 * canvas relisent à chaque frame : les sliders sont donc live, sans repasser
 * par React.
 */
export function PlayDebug({ state }: { state: PlayDebugRef }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { plane: planeState, camera: cameraState } = state.current;
    const pane = new Pane({ container, title: "play" });

    // Titre `image` et non `plane` : c'est ce que le pane donne à lire, et le
    // plane n'est qu'un détail d'implémentation côté three.
    const plane = pane.addFolder({ title: "image" });
    plane.addBinding(planeState, "x", { min: -1000, max: 1000, step: 1 });
    plane.addBinding(planeState, "y", { min: -1000, max: 1000, step: 1 });
    plane.addBinding(planeState, "width", { min: 50, max: 2000, step: 1 });
    plane.addBinding(planeState, "radius", { min: 0, max: 200, step: 1 });

    const camera = pane.addFolder({ title: "camera" });
    camera.addBinding(cameraState, "x", { min: -2000, max: 2000, step: 1 });
    camera.addBinding(cameraState, "y", { min: -2000, max: 2000, step: 1 });
    camera.addBinding(cameraState, "zoom", { min: 0.1, max: 5, step: 0.01 });

    return () => pane.dispose();
  }, [state]);

  return <div ref={containerRef} className="fixed top-4 right-4 z-50 w-64" />;
}
