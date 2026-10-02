"use client";

import { folder, useControls } from "leva";
import type { PlayDebugRef } from "../PlayCanvas";
import { num } from "./controls";

/** Media : dimensions des artifacts, variance d'échelle, arrondi, rotation. */
export function MediaTab({
  state,
  onLayoutChange,
}: {
  state: PlayDebugRef;
  onLayoutChange: () => void;
}) {
  const g = state.current.gravity;
  const plane = state.current.plane;

  // Les réglages de dimension recalculent le layout (comme dans l'ancien onglet canvas).
  const layoutNum = (key: "maxWidth" | "maxHeight" | "scaleVariance", o: Parameters<typeof num>[2]) => ({
    ...num(g, key, o),
    onChange: (v: number) => {
      g[key] = v;
      onLayoutChange();
    },
  });

  useControls("Media", () => ({
    Dimensions: folder({
      maxWidth: layoutNum("maxWidth", { label: "Max width", min: 200, max: 1200, step: 20 }),
      maxHeight: layoutNum("maxHeight", { label: "Max height", min: 200, max: 1200, step: 20 }),
      scaleVariance: layoutNum("scaleVariance", { label: "Scale variance", min: 0, max: 0.5, step: 0.02 }),
    }),
    Forme: folder({
      radius: num(plane, "radius", { label: "Border radius (px)", min: 0, max: 120, step: 1 }),
      cornerSmoothing: num(plane, "cornerSmoothing", { label: "Corner smoothing (0.32 = 32 pct)", min: 0, max: 1, step: 0.01 }),
      rotationRange: num(plane, "rotationRange", { label: "Rotation range (+/- deg)", min: 0, max: 20, step: 0.25 }),
    }),
  }));

  return null;
}
