"use client";

import { useEffect, type MutableRefObject } from "react";
import { daSpectrumRgb } from "@/lib/da";
import type { RGB } from "@/lib/dominant-color";
import type { PlayDebugRef } from "./PlayCanvas";

export type DeckWeight = { url: string; kind: "image" | "video"; w: number };

const WHITE: RGB = [255, 255, 255];
/**
 * Les couleurs de repli quand la page n'a pas (encore) de palette : le rose, le lilas
 * et le ciel de la DA, dans l'ordre coin → milieu → bord du dégradé.
 */
export const PANEL_FALLBACK: RGB[] = [daSpectrumRgb(0.5), daSpectrumRgb(0.25), daSpectrumRgb(0)];

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
 *
 * Les couleurs viennent de la page ouverte, pas d'un arc-en-ciel à part : le halo en
 * reprend les teintes (délavées), et les pixels du coin bas droit (voir `PanelPixels`) les
 * lisent telles quelles dans `paletteRef`, que ce hook réécrit à chaque image.
 * `da.panelGradientIrid` (0 par défaut) mêle un peu d'irisation au halo, pour comparer.
 */
export function usePanelGradient(
  el: HTMLElement | null,
  paletteRef: MutableRefObject<RGB[]>,
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
      // Les trois teintes de la page ; sans palette (pas encore chargée), celles de la DA.
      const base = layers.map((layer, i) => mix(layer, PANEL_FALLBACK[i]));

      // Les pixels du coin lisent ces trois couleurs telles quelles.
      paletteRef.current = base;

      // Teintes du média, un peu délavées : le dégradé reste léger.
      const [c0, c1, c2] = base.map((c) => tint(c, 0.75));

      // Irisation (0 par défaut) : trois pastels qui glissent lentement le long du
      // spectre, mêlés aux teintes du média à hauteur de `panelGradientIrid`.
      const irid = Math.min(1, Math.max(0, debug.current.da.panelGradientIrid));
      const ph = t * 0.045;
      const iri = (k: number): RGB => [
        215 + 40 * Math.cos(2 * Math.PI * (ph + k)),
        215 + 40 * Math.cos(2 * Math.PI * (ph + k + 0.33)),
        215 + 40 * Math.cos(2 * Math.PI * (ph + k + 0.67)),
      ];
      const blend = (a: RGB, b: RGB): RGB => [
        a[0] + (b[0] - a[0]) * irid,
        a[1] + (b[1] - a[1]) * irid,
        a[2] + (b[2] - a[2]) * irid,
      ];
      const k0 = blend(c0, iri(0));
      const k1 = blend(c1, iri(0.3));
      const k2 = blend(c2, iri(0.6));

      // Le dégradé occupe le bas du panel et monte le long du bord droit ; le haut
      // reste blanc. Les halos dérivent lentement autour du coin bas droit.
      const spread = debug.current.da.panelGradientSpread;
      const x1 = 100 + 6 * Math.sin(t * 0.37);
      const y1 = 100 + 5 * Math.cos(t * 0.29 + 1.1);
      const x2 = 96 + 8 * Math.cos(t * 0.31 + 2.0);
      const y2 = 66 + 8 * Math.sin(t * 0.43 + 0.4);
      const x3 = 74 + 9 * Math.sin(t * 0.23 + 4.0);
      const y3 = 100 + 5 * Math.cos(t * 0.35 + 2.7);
      const a = Math.min(1, strength);

      el.style.backgroundImage = [
        // Voile blanc : garde le haut du panel net, là où vit le texte.
        "linear-gradient(to bottom, rgb(255 255 255) 0%, rgb(255 255 255 / 0.85) 24%, rgb(255 255 255 / 0) 62%)",
        `radial-gradient(${88 * spread}% ${62 * spread}% at ${x1}% ${y1}%, ${rgb(k0, a)} 0%, transparent 72%)`,
        `radial-gradient(${62 * spread}% ${58 * spread}% at ${x2}% ${y2}%, ${rgb(k1, a * 0.85)} 0%, transparent 74%)`,
        `radial-gradient(${64 * spread}% ${46 * spread}% at ${x3}% ${y3}%, ${rgb(k2, a * 0.8)} 0%, transparent 76%)`,
      ].join(",");

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [el, paletteRef, weightsRef, palettesRef, debug]);
}
