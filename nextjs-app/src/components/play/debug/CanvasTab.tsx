"use client";

import { button, folder, useControls } from "leva";
import type { PlayDebugRef } from "../PlayCanvas";
import type { LayoutStats } from "../layout-types";
import { num, toggle } from "./controls";

/** Canvas : la mosaïque (layout) et le fond de points (plan de travail). */
export function CanvasTab({
  state,
  stats,
  onLayoutChange,
}: {
  state: PlayDebugRef;
  stats?: LayoutStats;
  onLayoutChange: () => void;
}) {
  const g = state.current.gravity;
  const bg = state.current.background;

  const layoutNum = (
    key: "targetAspect" | "gap" | "repeatGap" | "repeat" | "iterations" | "seed",
    o: Parameters<typeof num>[2],
  ) => ({
    ...num(g, key, o),
    onChange: (v: number) => {
      g[key] = v;
      onLayoutChange();
    },
  });

  useControls("Canvas", () => ({
    Layout: folder({
      Recompute: button(() => onLayoutChange()),
      targetAspect: layoutNum("targetAspect", { label: "Target aspect", min: 0.5, max: 3, step: 0.1 }),
      gap: layoutNum("gap", { label: "Min gap (px)", min: 20, max: 400, step: 10 }),
      repeatGap: layoutNum("repeatGap", { label: "Repeat gap (px)", min: 0, max: 600, step: 10 }),
      repeat: layoutNum("repeat", { label: "Tile repeats", min: 1, max: 6, step: 1 }),
      antiNeighbor: {
        label: "Anti-neighbor",
        value: g.antiNeighbor,
        onChange: (v: boolean) => {
          g.antiNeighbor = v;
          onLayoutChange();
        },
      },
      iterations: layoutNum("iterations", { label: "Iterations", min: 20, max: 600, step: 10 }),
      seed: layoutNum("seed", { label: "Seed", min: 1, max: 100, step: 1 }),
    }),

    Background: folder({
      dots: toggle(bg, "dots", "Points de fond"),
      dotSize: num(bg, "dotSize", { label: "Diametre (px)", min: 0.5, max: 6, step: 0.1 }),
      dotSpacing: num(bg, "dotSpacing", { label: "Espacement (monde)", min: 16, max: 160, step: 2 }),
      dotOpacity: num(bg, "dotOpacity", { label: "Opacite", min: 0, max: 0.6, step: 0.01 }),
      dotColor: { label: "Couleur", value: bg.dotColor, onChange: (v: string) => { bg.dotColor = v; } },
      parallax: num(bg, "parallax", { label: "Parallaxe (1 = colle au plan)", min: 0, max: 1.5, step: 0.02 }),
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
