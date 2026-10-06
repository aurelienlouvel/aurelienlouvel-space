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
  /** Sa place dans le dégradé : 1 au coin, 0 au bord du champ. */
  g: number;
  /** Période du scintillement (s) et déphasage (s, négatif : il tourne déjà au montage). */
  period: number;
  delay: number;
  lo: number;
  hi: number;
};

// Un champ de petits carrés ancré dans le coin bas droit : COLS × ROWS cases de la
// grille, dont seules quelques-unes portent un pixel — plus nombreux près du coin,
// de plus en plus clairsemés en s'en éloignant, jusqu'à s'éteindre sur une demi-ellipse.
const COLS = 40;
const ROWS = 22;
/** Un pixel dans sa case : la case fait `--pg-size`, le pixel 80 % (l'écart entre voisins). */
const FILL = 0.8;
/** Durée d'un scintillement (s) : une pulsation par `PERIOD`, un peu variable. */
const PERIOD = 3.4;
/** Densité par défaut : 36 pixels (la grille pleine, `density` à 1, en compte 137). */
export const PANEL_PIXEL_DENSITY = 0.3;

const PIXELS: Pixel[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const id = r * COLS + c;
    // Distance normalisée au coin (0 = le coin, 1 = le bord de la demi-ellipse).
    const d = Math.hypot(c / (COLS - 1), r / (ROWS - 1));
    if (d >= 1) continue;
    // Chance de pixel : ~95 % au coin, qui retombe vite — des pixels isolés vers
    // l'extérieur. Le tirage du pixel, rapporté à cette chance, donne la densité à
    // laquelle il apparaît : le même tirage garde les mêmes pixels quand on règle la densité.
    const at = daHash(id * 3.7) / (0.95 * Math.pow(1 - d, 1.7));
    if (at >= 1) continue;
    const period = PERIOD * (0.75 + daHash(id * 5.9) * 0.5);
    PIXELS.push({
      id,
      col: c,
      row: r,
      at,
      g: 1 - d,
      period: Math.round(period * 100) / 100,
      // Le déphasage suit la distance au coin (+ un peu de bruit) : de lentes
      // pulsations rayonnent du coin vers l'extérieur.
      delay: -Math.round((d * 0.85 + daHash(id * 11.3) * 0.5) * PERIOD * 100) / 100,
      lo: Math.round((0.1 + daHash(id * 7.1) * 0.12) * 100) / 100,
      hi: Math.round((0.7 + daHash(id * 13.9) * 0.3) * 100) / 100,
    });
  }
}

/**
 * La couleur d'un pixel d'après sa place dans le dégradé : celle du coin, puis celle
 * du milieu, puis celle du bord (`--pg-c0`, `--pg-c1`, `--pg-c2`, posées sur le champ
 * par `usePanelGradient` d'après les couleurs de la page ouverte). Sans cette
 * palette, `globals.css` donne au champ le rose, le lilas et le ciel de la DA.
 */
function pixelColor(g: number): string {
  if (g >= 0.5) {
    return `color-mix(in oklab, var(--pg-c0) ${Math.round((g - 0.5) * 200)}%, var(--pg-c1))`;
  }
  return `color-mix(in oklab, var(--pg-c1) ${Math.round(g * 200)}%, var(--pg-c2))`;
}

/**
 * Un champ de petits carrés unis, aux coins à peine arrondis, dans le coin bas droit
 * du side panel : ils scintillent sans interruption, chaque pixel va et vient entre
 * quasi-blanc et sa couleur (jamais de pause à zéro). La couleur naît de la place du
 * pixel et de la page ouverte : voisins, ils forment un dégradé dans ses teintes.
 *
 * Le debug règle l'opacité (`transition.panelGlitch`, 0..1), le nombre de pixels
 * (`da.panelPixelDensity`, 0..1) et, par `--pg-size`, leur taille ; il relance ce rendu
 * (`onPanelChange`) quand l'opacité ou la densité bouge.
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
          width: `calc(${COLS} * var(--pg-size, 0.5rem))`,
          height: `calc(${ROWS} * var(--pg-size, 0.5rem))`,
        }}
      >
        {PIXELS.map((p) =>
          p.at < density ? (
            <span
              key={p.id}
              className="pg-cell absolute"
              style={{
                right: `calc(${p.col} * var(--pg-size, 0.5rem))`,
                bottom: `calc(${p.row} * var(--pg-size, 0.5rem))`,
                width: `calc(${FILL} * var(--pg-size, 0.5rem))`,
                height: `calc(${FILL} * var(--pg-size, 0.5rem))`,
                backgroundColor: pixelColor(p.g),
                ["--pg-t" as string]: `${p.period}s`,
                ["--pg-delay" as string]: `${p.delay}s`,
                ["--pg-lo" as string]: p.lo,
                ["--pg-hi" as string]: p.hi,
              }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
