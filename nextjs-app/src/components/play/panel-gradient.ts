"use client";

import { useEffect, type MutableRefObject } from "react";
import type { RGB } from "@/lib/dominant-color";
import type { PlayDebugRef } from "./PlayCanvas";

export type DeckWeight = { url: string; kind: "image" | "video"; w: number };

const WHITE: RGB = [255, 255, 255];

function mix(list: { w: number; c: RGB }[], fallback: RGB): RGB {
  let total = 0;
  for (const e of list) total += e.w;
  if (total < 0.001) return fallback;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const e of list) {
    const k = e.w / total;
    r += e.c[0] * k;
    g += e.c[1] * k;
    b += e.c[2] * k;
  }
  // Quand peu de couleur est disponible, on fond vers le blanc.
  const presence = Math.min(1, total);
  return [
    fallback[0] + (r - fallback[0]) * presence,
    fallback[1] + (g - fallback[1]) * presence,
    fallback[2] + (b - fallback[2]) * presence,
  ];
}

/** Éclaircit une couleur vers le blanc : `strength` 1 = couleur pleine, 0 = blanc. */
function tint(c: RGB, strength: number): RGB {
  const k = Math.min(1, Math.max(0, strength));
  return [
    WHITE[0] + (c[0] - WHITE[0]) * k,
    WHITE[1] + (c[1] - WHITE[1]) * k,
    WHITE[2] + (c[2] - WHITE[2]) * k,
  ];
}

const rgb = (c: RGB, a = 1) =>
  `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${a})`;

/**
 * Anime en continu le fond du side panel : trois teintes par média, mélangées
 * selon le poids de chaque carte visible (deux cartes à moitié passées = deux
 * palettes à parts égales), et des halos qui dérivent sans jamais s'arrêter.
 */
export function usePanelGradient(
  el: HTMLElement | null,
  weightsRef: MutableRefObject<DeckWeight[]>,
  palettesRef: MutableRefObject<Map<string, RGB[]>>,
  debug: PlayDebugRef,
) {
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const smooth = new Map<string, number>();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cfg = debug.current.transition;
      const strength = cfg.panelGradientStrength ?? 0.55;
      const t = (now / 1000) * (cfg.panelGradientSpeed ?? 1);
      const k = 1 - Math.exp(-dt * 5);

      const layers: { w: number; c: RGB }[][] = [[], [], []];
      for (const entry of weightsRef.current) {
        const prev = smooth.get(entry.url) ?? 0;
        const next = prev + (entry.w - prev) * k;
        smooth.set(entry.url, next);
        const pal = palettesRef.current.get(entry.url);
        if (!pal || next < 0.002) continue;
        for (let i = 0; i < 3; i++) layers[i].push({ w: next, c: pal[i] });
      }
      // Teintes du média, un peu délavées : le dégradé reste léger.
      const c0 = tint(mix(layers[0], WHITE), 0.75);
      const c1 = tint(mix(layers[1], WHITE), 0.75);
      const c2 = tint(mix(layers[2], WHITE), 0.75);

      // Irisation : trois pastels qui glissent lentement le long du spectre, mêlés
      // à moitié aux teintes du média pour rester accordés à ce qu'on regarde.
      const ph = t * 0.045;
      const iri = (k: number): RGB => [
        215 + 40 * Math.cos(2 * Math.PI * (ph + k)),
        215 + 40 * Math.cos(2 * Math.PI * (ph + k + 0.33)),
        215 + 40 * Math.cos(2 * Math.PI * (ph + k + 0.67)),
      ];
      const blend = (a: RGB, b: RGB): RGB => [
        a[0] * 0.5 + b[0] * 0.5,
        a[1] * 0.5 + b[1] * 0.5,
        a[2] * 0.5 + b[2] * 0.5,
      ];
      const k0 = blend(iri(0), c0);
      const k1 = blend(iri(0.3), c1);
      const k2 = blend(iri(0.6), c2);

      // Le dégradé vit uniquement dans le coin bas droit, là où se trouve le glitch pixel.
      const x1 = 100 + 7 * Math.sin(t * 0.37);
      const y1 = 100 + 6 * Math.cos(t * 0.29 + 1.1);
      const x2 = 88 + 10 * Math.cos(t * 0.31 + 2.0);
      const y2 = 100 + 8 * Math.sin(t * 0.43 + 0.4);
      const x3 = 100 + 9 * Math.sin(t * 0.23 + 4.0);
      const y3 = 84 + 8 * Math.cos(t * 0.35 + 2.7);
      const a = Math.min(1, strength);

      el.style.backgroundImage = [
        `radial-gradient(58% 34% at ${x1}% ${y1}%, ${rgb(k0, a)} 0%, transparent 72%)`,
        `radial-gradient(44% 26% at ${x2}% ${y2}%, ${rgb(k1, a * 0.85)} 0%, transparent 74%)`,
        `radial-gradient(34% 22% at ${x3}% ${y3}%, ${rgb(k2, a * 0.8)} 0%, transparent 76%)`,
      ].join(",");

      // Mêmes couleurs, partagées avec le glitch pixel (cf. PixelGlitch).
      const root = document.documentElement.style;
      root.setProperty("--pg-c0", rgb(blend(k0, [90, 120, 255]), 1));
      root.setProperty("--pg-c1", rgb(blend(k1, [150, 110, 255]), 1));
      root.setProperty("--pg-c2", rgb(blend(k2, [120, 210, 255]), 1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      const root = document.documentElement.style;
      root.removeProperty("--pg-c0");
      root.removeProperty("--pg-c1");
      root.removeProperty("--pg-c2");
    };
  }, [el, weightsRef, palettesRef, debug]);
}
