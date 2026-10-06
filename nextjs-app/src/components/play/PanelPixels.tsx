"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { daHash } from "@/lib/da";
import type { RGB } from "@/lib/dominant-color";
import type { PlayDebugRef } from "./PlayCanvas";

export type Pixel = {
  id: number;
  /** Position depuis le coin bas droit, en pixels de la grille. */
  col: number;
  row: number;
  /** La densité à partir de laquelle ce pixel apparaît (0..1) : monter la densité en ajoute. */
  at: number;
  /** Ses parts des trois couleurs de la page (coin, bord droit, bas), d'après sa place : somme = 1. */
  w: [number, number, number];
  /** Déphasage (0..1 de la période) : croît du coin vers le large, avec un peu de bruit. */
  ph: number;
  /** Profondeur de sa respiration (0..1). */
  k: number;
};

// Une forme tramée ancrée dans le coin bas droit : COLS × ROWS cases, dont seules celles que
// la trame laisse passer portent un pixel. La couverture d'un quart d'ellipse (dense au coin,
// qui s'éteint vers l'extérieur) est comparée à une matrice de Bayer 4×4 : les pixels se
// répartissent régulièrement au lieu de s'agglutiner, et le dégradé se lit dans leur densité.
const COLS = 12;
const ROWS = 8;
/** Un pixel dans sa case : la case fait `--pg-size`, le pixel 80 % (l'écart entre voisins). */
const FILL = 0.8;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
/** Raideur de la forme : 1 = la couverture tombe linéairement, plus petit = elle s'étire vers le large. */
const CURVE = 0.7;
/** Part de bruit dans le seuil de la trame (0..1) : rompt la régularité du Bayer. */
const JITTER = 0.25;
/** Densité par défaut : 20 pixels (la forme pleine, `density` à 1, en compte 36). */
export const PANEL_PIXEL_DENSITY = 0.75;
/** Largeur (en densité) du fondu d'un pixel qui apparaît ou s'éteint : plus large = plus doux. */
const SOFT = 0.16;
const TAU = Math.PI * 2;

export const PIXELS: Pixel[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const id = r * COLS + c;
    // Place du centre de la case dans le quart d'ellipse : 0 au coin, 1 sur son bord.
    const u = (c + 0.5) / COLS;
    const v = (r + 0.5) / ROWS;
    const d = Math.hypot(u, v);
    if (d >= 1) continue;
    const threshold = ((BAYER[r % 4][c % 4] + 0.5) / 16) * (1 - JITTER) + daHash(id * 3.7) * JITTER;
    // Le seuil rapporté à la couverture donne la densité à laquelle le pixel apparaît : la même
    // trame garde les mêmes pixels quand on règle la densité.
    const at = threshold / Math.pow(1 - d, CURVE);
    if (at >= 1) continue;
    // Ses couleurs : celle du coin (`c0`) près du coin, puis, en s'en éloignant, celle du bord
    // droit (`c1`) en montant, celle du bas (`c2`) en allant vers la gauche, comme le halo derrière
    // le panneau. `angle` : 0 le long du bas, 1 le long du bord droit.
    const angle = Math.atan2(v, u) / (Math.PI / 2);
    const corner = Math.pow(1 - d, 0.9);
    PIXELS.push({
      id,
      col: c,
      row: r,
      at: Math.round(at * 1000) / 1000,
      w: [corner, (1 - corner) * angle, (1 - corner) * (1 - angle)],
      ph: Math.round((d * 0.8 + daHash(id * 11.3) * 0.2) * 100) / 100,
      k: Math.round((0.6 + daHash(id * 7.1) * 0.4) * 100) / 100,
    });
  }
}

/** Les réglages qui animent la forme (`da.panelPixel*`, voir `DaParams`), lus à chaque image. */
export type PanelPixelCfg = {
  /** Nombre de pixels au milieu de l'onde (0..1). */
  density: number;
  /** De combien la densité monte et descend de part et d'autre (0 = nombre fixe). */
  flux: number;
  /** Durée d'un cycle de ce nombre (s). */
  fluxPeriod: number;
  /** Part d'un cycle qui sépare le coin du large (0 = tous ensemble, 1 = une onde entière). */
  ripple: number;
  /** Amplitude de la respiration de l'opacité (0 = fixe), sa durée (s). */
  pulse: number;
  period: number;
  /** Dérive des couleurs le long de la palette de la page (en couleurs : 1 = d'une couleur à la suivante), sa durée (s). */
  shift: number;
  shiftPeriod: number;
  /** Réduction des animations : le champ reste à sa forme moyenne, sans rien bouger. */
  calm?: boolean;
};

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * L'état d'un pixel à l'instant `t` (s) : son opacité (0..1) et son décalage dans la palette
 * (en couleurs, `phi`). Les cases ne bougent jamais ; trois ondes lentes, déphasées d'un pixel à
 * l'autre, font le reste :
 * - le nombre : la densité du champ monte et descend, un pixel est allumé tant qu'elle dépasse
 *   son seuil `at`, avec un fondu de `SOFT` : des pixels naissent et s'éteignent en place ;
 * - la respiration : l'opacité des pixels allumés dérive un peu, comme avant ;
 * - la couleur : `phi` fait glisser le pixel le long de la palette (voir `pixelRgb`).
 */
export function pixelFrame(p: Pixel, t: number, cfg: PanelPixelCfg): { alpha: number; phi: number } {
  const calm = cfg.calm === true;
  const wave = calm ? 0 : Math.sin(TAU * (t / cfg.fluxPeriod - p.ph * cfg.ripple));
  const lit = smooth(Math.min(1, Math.max(0, (cfg.density + cfg.flux * wave - p.at) / SOFT + 0.5)));
  const swell = calm ? 0.5 : 0.5 - 0.5 * Math.cos(TAU * (t / cfg.period - p.ph));
  const phi = calm ? 0 : cfg.shift * Math.sin(TAU * (t / cfg.shiftPeriod - p.ph * 0.7));
  return { alpha: lit * (1 - cfg.pulse * p.k * swell), phi };
}

/** La palette lue en boucle : 0 = sa première couleur, 1 = la deuxième, 2 = la troisième, 3 = la première. */
function cyclic(pal: RGB[], x: number, channel: number): number {
  const n = pal.length;
  const lo = Math.floor(x);
  const a = pal[((lo % n) + n) % n][channel];
  const b = pal[(((lo + 1) % n) + n) % n][channel];
  return a + (b - a) * (x - lo);
}

/**
 * La couleur d'un pixel : ses parts (`w`) des trois couleurs de la page, que `phi` fait glisser le
 * long de la palette. À 0 c'est le mélange de la page ; à 1, chaque couleur a pris la place de la
 * suivante.
 */
export function pixelRgb(p: Pixel, pal: RGB[], phi: number): RGB {
  const out: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let ch = 0; ch < 3; ch++) out[ch] += p.w[i] * cyclic(pal, i + phi, ch);
  }
  return out;
}

/**
 * Une forme de gros carrés unis dans le coin bas droit du side panel : une trame de pixels
 * qui s'éclaircit du coin vers l'extérieur, dans les couleurs de la page ouverte. Les cases ne
 * bougent pas : ce sont leur nombre et leurs couleurs qui vivent, par une onde lente qui part du
 * coin (`pixelFrame`). Jamais de scintillement.
 *
 * Les 36 cases sont toujours dans le DOM : la boucle d'animation écrit l'opacité et la couleur de
 * chacune à chaque image (seulement quand la valeur change), d'après les réglages du debug lus en
 * direct. `paletteRef` porte les trois couleurs de la page ouverte, que `usePanelGradient` tient
 * à jour. React ne rend que la grille : le debug le relance (`onPanelChange`) quand l'opacité du
 * champ (`transition.panelGlitch`, 0..1) ou la densité de base tombe à 0 ou en revient.
 */
export function PanelPixels({
  debug,
  paletteRef,
}: {
  debug: PlayDebugRef;
  /** Les trois couleurs de la page ouverte (coin, bord droit, bas). */
  paletteRef: MutableRefObject<RGB[]>;
}) {
  const intensity = debug.current.transition.panelGlitch;
  const density = debug.current.da.panelPixelDensity;
  const cells = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Ce qui est déjà écrit sur chaque pixel : on n'y touche que quand la valeur change.
    const written = new WeakMap<HTMLElement, { alpha: string; color: string }>();
    let raf = 0;

    const tick = () => {
      const da = debug.current.da;
      const cfg: PanelPixelCfg = {
        density: da.panelPixelDensity,
        flux: da.panelPixelFlux,
        fluxPeriod: da.panelPixelFluxPeriod,
        ripple: da.panelPixelRipple,
        pulse: da.panelPixelPulse,
        period: da.panelPixelPeriod,
        shift: da.panelPixelShift,
        shiftPeriod: da.panelPixelShiftPeriod,
        calm: reduced,
      };
      const t = performance.now() / 1000;
      const pal = paletteRef.current;
      for (let i = 0; i < PIXELS.length; i++) {
        const el = cells.current[i];
        if (!el) continue;
        const prev = written.get(el) ?? { alpha: "", color: "" };
        written.set(el, prev);
        const { alpha, phi } = pixelFrame(PIXELS[i], t, cfg);
        const a = alpha < 0.004 ? "0" : alpha.toFixed(3);
        if (a !== prev.alpha) {
          el.style.opacity = a;
          prev.alpha = a;
        }
        // Un pixel éteint n'a pas besoin de couleur.
        if (a === "0") continue;
        const [r, g, b] = pixelRgb(PIXELS[i], pal, phi);
        const color = `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
        if (color !== prev.color) {
          el.style.backgroundColor = color;
          prev.color = color;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(raf);
  }, [debug, paletteRef]);

  if (intensity <= 0 || density <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pg-field pointer-events-none fixed bottom-3 right-3 z-20"
      style={{ opacity: Math.min(1, intensity) }}
    >
      <div
        className="relative"
        style={{
          width: `calc(${COLS} * var(--pg-size, 1rem))`,
          height: `calc(${ROWS} * var(--pg-size, 1rem))`,
        }}
      >
        {PIXELS.map((p, i) => (
          <span
            key={p.id}
            ref={(el) => {
              cells.current[i] = el;
            }}
            className="pg-cell absolute"
            style={{
              right: `calc(${p.col} * var(--pg-size, 1rem))`,
              bottom: `calc(${p.row} * var(--pg-size, 1rem))`,
              width: `calc(${FILL} * var(--pg-size, 1rem))`,
              height: `calc(${FILL} * var(--pg-size, 1rem))`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
