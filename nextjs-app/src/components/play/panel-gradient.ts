"use client";

import { useEffect, type MutableRefObject } from "react";
import type { RGB } from "@/lib/dominant-color";

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
) {
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const smooth = new Map<string, number>();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
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
      const c0 = mix(layers[0], WHITE);
      const c1 = mix(layers[1], WHITE);
      const c2 = mix(layers[2], WHITE);

      const x1 = 50 + 42 * Math.sin(t * 0.37);
      const y1 = 30 + 28 * Math.cos(t * 0.29 + 1.1);
      const x2 = 50 + 45 * Math.cos(t * 0.31 + 2.0);
      const y2 = 72 + 24 * Math.sin(t * 0.43 + 0.4);
      const x3 = 50 + 38 * Math.sin(t * 0.23 + 4.0);
      const y3 = 50 + 40 * Math.cos(t * 0.35 + 2.7);
      const angle = 160 + 25 * Math.sin(t * 0.21);

      el.style.backgroundImage = [
        `radial-gradient(70% 55% at ${x1}% ${y1}%, ${rgb(c2, 0.95)} 0%, transparent 70%)`,
        `radial-gradient(65% 50% at ${x2}% ${y2}%, ${rgb(c1, 0.9)} 0%, transparent 72%)`,
        `radial-gradient(55% 45% at ${x3}% ${y3}%, ${rgb(c0, 0.75)} 0%, transparent 70%)`,
        `linear-gradient(${angle}deg, ${rgb(c0)} 0%, ${rgb(c1)} 55%, rgb(255 255 255) 100%)`,
      ].join(",");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [el, weightsRef, palettesRef]);
}
