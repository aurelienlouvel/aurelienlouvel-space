import type { Ref } from "react";
import { daHash } from "@/lib/da";
import type { PlayDebugRef } from "./PlayCanvas";

type Pixel = {
  id: number;
  /** Position depuis le coin bas droit, en pixels de la grille. */
  col: number;
  row: number;
  /** La densité à partir de laquelle ce pixel apparaît (0..1) : monter la densité en ajoute. */
  at: number;
  /** Sa couleur, mélangée d'après sa place dans le dégradé (voir `pixelColor`). */
  color: string;
  /** Déphasage de sa respiration (0..1 de la période) et profondeur (0..1). */
  ph: number;
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

const PIXELS: Pixel[] = [];
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
    PIXELS.push({
      id,
      col: c,
      row: r,
      at: Math.round(at * 1000) / 1000,
      color: pixelColor(d, Math.atan2(v, u) / (Math.PI / 2)),
      // Le déphasage suit la distance au coin (+ un peu de bruit) : une onde lente rayonne du
      // coin vers l'extérieur.
      ph: Math.round((d * 0.8 + daHash(id * 11.3) * 0.2) * 100) / 100,
      k: Math.round((0.6 + daHash(id * 7.1) * 0.4) * 100) / 100,
    });
  }
}

/**
 * La couleur d'un pixel d'après sa place : celle du coin (`--pg-c0`) près du coin, puis, en
 * s'en éloignant, celle du bord droit (`--pg-c1`) en montant, celle du bas (`--pg-c2`) en
 * allant vers la gauche, comme le halo derrière le panneau. Ces trois variables sont posées
 * sur le champ par `usePanelGradient` d'après les couleurs de la page ouverte ; sans cette
 * palette, `globals.css` donne au champ le rose, le lilas et le ciel de la DA.
 *
 * `d` : distance au coin (0..1) ; `angle` : 0 le long du bas, 1 le long du bord droit.
 */
function pixelColor(d: number, angle: number): string {
  const rim = `color-mix(in oklab, var(--pg-c1) ${Math.round(angle * 100)}%, var(--pg-c2))`;
  return `color-mix(in oklab, var(--pg-c0) ${Math.round(Math.pow(1 - d, 0.9) * 100)}%, ${rim})`;
}

/**
 * Une forme de gros carrés unis dans le coin bas droit du side panel : une trame de pixels
 * qui s'éclaircit du coin vers l'extérieur, dans les couleurs de la page ouverte. Ils
 * respirent lentement et peu (jamais de scintillement) : une onde les traverse depuis le coin.
 *
 * Le debug règle l'opacité (`transition.panelGlitch`, 0..1), le nombre de pixels
 * (`da.panelPixelDensity`, 0..1) et, par `--pg-size`, `--pg-pulse` et `--pg-period`, leur taille,
 * l'amplitude et la lenteur de la respiration ; il relance ce rendu (`onPanelChange`) quand
 * l'opacité ou la densité bouge.
 */
export function PanelPixels({
  debug,
  fieldRef,
}: {
  debug: PlayDebugRef;
  /** Le champ : `usePanelGradient` y pose les couleurs de la page. */
  fieldRef?: Ref<HTMLDivElement>;
}) {
  const intensity = debug.current.transition.panelGlitch;
  const density = debug.current.da.panelPixelDensity;
  if (intensity <= 0 || density <= 0) return null;
  return (
    <div
      ref={fieldRef}
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
        {PIXELS.map((p) =>
          p.at < density ? (
            <span
              key={p.id}
              className="pg-cell absolute"
              style={{
                right: `calc(${p.col} * var(--pg-size, 1rem))`,
                bottom: `calc(${p.row} * var(--pg-size, 1rem))`,
                width: `calc(${FILL} * var(--pg-size, 1rem))`,
                height: `calc(${FILL} * var(--pg-size, 1rem))`,
                backgroundColor: p.color,
                ["--pg-ph" as string]: p.ph,
                ["--pg-k" as string]: p.k,
              }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
