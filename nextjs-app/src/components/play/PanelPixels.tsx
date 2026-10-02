import { daGradient, daHash } from "@/lib/da";

type Rect = {
  id: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
  gradient: string;
  alpha: number;
  float: number;
  breathe: number;
  delay: number;
  dx: number;
  dy: number;
  rot: number;
};

// Grille jitterée 5×3 (espacée, pas de trame) dans le coin bas droit : un rectangle
// de verre par case, de taille et de format différents.
const COLS = 5;
const ROWS = 3;
const CELL_W = 4.6;
const CELL_H = 4.4;
const RECTS: Rect[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const id = r * COLS + c;
    // Plus on s'éloigne du coin, plus on en retire.
    const reach = (c / (COLS - 1)) * 0.75 + (r / (ROWS - 1)) * 0.55;
    if (daHash(id * 3.7) < reach * 0.55) continue;
    const w = 1 + daHash(id * 5.9) * 2.3;
    const h = 0.8 + daHash(id * 7.1) * 1.9;
    RECTS.push({
      id,
      right: Math.round((c * CELL_W + daHash(id * 9.3) * (CELL_W - w)) * 100) / 100,
      bottom: Math.round((r * CELL_H + daHash(id * 11.7) * (CELL_H - h)) * 100) / 100,
      w: Math.round(w * 100) / 100,
      h: Math.round(h * 100) / 100,
      gradient: daGradient(id * 4.1),
      alpha: Math.round((0.3 + daHash(id * 13.1) * 0.35) * 100) / 100,
      float: Math.round((6 + daHash(id * 15.7) * 6) * 10) / 10,
      breathe: Math.round((8 + daHash(id * 17.3) * 8) * 10) / 10,
      delay: -Math.round(daHash(id * 19.9) * 12 * 10) / 10,
      dx: Math.round((daHash(id * 21.1) - 0.5) * 1.6 * 100) / 100,
      dy: Math.round((-0.3 - daHash(id * 23.3) * 0.9) * 100) / 100,
      rot: Math.round((daHash(id * 25.7) - 0.5) * 10 * 10) / 10,
    });
  }
}

/**
 * Quelques grands rectangles de verre qui flottent, tournent à peine et
 * apparaissent / disparaissent doucement dans le coin bas droit du side panel :
 * de la vie, sans trame. Aux couleurs du spectre Prism ; `intensity` (0..1)
 * règle l'opacité, `--pg-scale` (posé par le debug) la taille.
 */
export function PanelPixels({ intensity = 0.6 }: { intensity?: number }) {
  if (intensity <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pg-field pointer-events-none fixed bottom-3 right-3 z-20"
      style={{ opacity: Math.min(1, intensity) }}
    >
      <div
        className="relative"
        style={{
          width: `calc(${COLS * CELL_W}rem * var(--pg-scale, 1))`,
          height: `calc(${ROWS * CELL_H}rem * var(--pg-scale, 1))`,
        }}
      >
        {RECTS.map((r) => (
          <span
            key={r.id}
            className="pg-rect da-rect absolute rounded-[32%]"
            style={{
              right: `calc(${r.right}rem * var(--pg-scale, 1))`,
              bottom: `calc(${r.bottom}rem * var(--pg-scale, 1))`,
              width: `calc(${r.w}rem * var(--pg-scale, 1))`,
              height: `calc(${r.h}rem * var(--pg-scale, 1))`,
              backgroundImage: r.gradient,
              ["--pg-a" as string]: r.alpha,
              ["--pg-f" as string]: `${r.float}s`,
              ["--pg-b" as string]: `${r.breathe}s`,
              ["--pg-delay" as string]: `${r.delay}s`,
              ["--pg-dx" as string]: `${r.dx}rem`,
              ["--pg-dy" as string]: `${r.dy}rem`,
              ["--pg-r" as string]: `${r.rot}deg`,
              ["--da-blur" as string]: `${(0.4 + r.w * 0.35).toFixed(1)}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
