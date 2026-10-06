import { daGradientAt, daHash } from "@/lib/da";

type Pixel = {
  id: number;
  /** Position depuis le coin bas droit, en pixels de la grille. */
  col: number;
  row: number;
  color: string;
  /** Période du scintillement (s) et déphasage (s, négatif : il tourne déjà au montage). */
  period: number;
  delay: number;
  lo: number;
  hi: number;
};

// Un champ serré de petits carrés ancré dans le coin bas droit : COLS × ROWS cases
// de la grille, dont seules quelques-unes portent un pixel — dense près du coin, de
// plus en plus clairsemé en s'en éloignant, jusqu'à s'éteindre sur une demi-ellipse.
const COLS = 40;
const ROWS = 22;
/** Un pixel dans sa case : la case fait `--pg-size`, le pixel 80 % (l'écart entre voisins). */
const FILL = 0.8;
/** Durée d'un scintillement (s) : une pulsation par `PERIOD`, un peu variable. */
const PERIOD = 3.4;

const PIXELS: Pixel[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const id = r * COLS + c;
    // Distance normalisée au coin (0 = le coin, 1 = le bord de la demi-ellipse).
    const d = Math.hypot(c / (COLS - 1), r / (ROWS - 1));
    if (d >= 1) continue;
    // Densité : ~95 % au coin, qui retombe vite — des pixels isolés vers l'extérieur.
    if (daHash(id * 3.7) >= 0.95 * Math.pow(1 - d, 1.7)) continue;
    const period = PERIOD * (0.75 + daHash(id * 5.9) * 0.5);
    PIXELS.push({
      id,
      col: c,
      row: r,
      // Rose au coin, puis lilas, puis ciel : les voisins forment un dégradé.
      color: daGradientAt(1 - d),
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
 * Un champ de petits carrés unis dans le coin bas droit du side panel, qui
 * scintillent sans interruption : chaque pixel va et vient entre quasi-blanc et sa
 * couleur (jamais de pause à zéro). La couleur naît de la place du pixel — rose au
 * coin, puis lilas, puis ciel : côte à côte, ils forment un dégradé. `intensity`
 * (0..1) règle l'opacité, `--pg-size` (posé par le debug) la taille d'un pixel.
 */
export function PanelPixels({ intensity = 1 }: { intensity?: number }) {
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
          width: `calc(${COLS} * var(--pg-size, 0.5rem))`,
          height: `calc(${ROWS} * var(--pg-size, 0.5rem))`,
        }}
      >
        {PIXELS.map((p) => (
          <span
            key={p.id}
            className="pg-cell absolute"
            style={{
              right: `calc(${p.col} * var(--pg-size, 0.5rem))`,
              bottom: `calc(${p.row} * var(--pg-size, 0.5rem))`,
              width: `calc(${FILL} * var(--pg-size, 0.5rem))`,
              height: `calc(${FILL} * var(--pg-size, 0.5rem))`,
              backgroundColor: p.color,
              ["--pg-t" as string]: `${p.period}s`,
              ["--pg-delay" as string]: `${p.delay}s`,
              ["--pg-lo" as string]: p.lo,
              ["--pg-hi" as string]: p.hi,
            }}
          />
        ))}
      </div>
    </div>
  );
}
