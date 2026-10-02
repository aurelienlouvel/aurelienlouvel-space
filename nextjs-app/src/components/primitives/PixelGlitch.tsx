const COLS = 16;
const ROWS = 10;
/** Pas entre deux pixels (rem). */
const PITCH = 0.62;

// Matrice de Bayer 4×4 : la trame ordonnée qui donne l'effet « dither ».
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

// Chaque pixel est un dégradé entre deux des trois teintes irisées du panel.
const GRADIENTS = [
  "linear-gradient(135deg, var(--pg-c0, #9cccff), var(--pg-c1, #b9a8ff))",
  "linear-gradient(135deg, var(--pg-c1, #b9a8ff), var(--pg-c2, #8fe0ff))",
  "linear-gradient(135deg, var(--pg-c2, #8fe0ff), var(--pg-c0, #9cccff))",
] as const;

function hash01(n: number): number {
  let h = Math.imul(Math.floor(n * 1000) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Cell = {
  id: number;
  col: number;
  row: number;
  size: number;
  gradient: string;
  alpha: number;
  dur: number;
  delay: number;
};

// Densité décroissante depuis le coin bas droit, seuillée par la trame de Bayer.
const CELLS: Cell[] = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const dx = (COLS - 1 - col) / (COLS - 1);
    const dy = (ROWS - 1 - row) / (ROWS - 1);
    const dist = Math.min(1, Math.hypot(dx, dy * 1.15) / 1.2);
    const density = Math.pow(1 - dist, 1.35);
    const threshold = (BAYER[row % 4][col % 4] + 0.5) / 16;
    if (threshold >= density) continue;
    const id = row * COLS + col;
    CELLS.push({
      id,
      col,
      row,
      // Plus petits en s'éloignant du coin.
      size: 0.28 + 0.2 * (1 - dist),
      gradient: GRADIENTS[(col + row) % GRADIENTS.length],
      alpha: 0.45 + 0.45 * (1 - dist) + hash01(id * 3.3) * 0.1,
      dur: 3.2 + hash01(id * 5.9) * 4,
      delay: -hash01(id * 7.7) * 6,
    });
  }
}

/**
 * Petit nuage de pixels arrondis, en dégradé irisé, qui palpitent doucement
 * dans le coin bas droit : une trame de dither de plus en plus clairsemée en
 * s'éloignant du coin. Purement décoratif ; `intensity` (0..1) règle l'opacité.
 */
export function PixelGlitch({ intensity = 0.6 }: { intensity?: number }) {
  if (intensity <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pg-field pointer-events-none fixed bottom-3 right-3 z-20"
      style={{ opacity: Math.min(1, intensity) }}
    >
      <div className="relative" style={{ width: `${COLS * PITCH}rem`, height: `${ROWS * PITCH}rem` }}>
        {CELLS.map((c) => (
          <span
            key={c.id}
            className="pg-dot absolute rounded-[30%]"
            style={{
              right: `${(COLS - 1 - c.col) * PITCH}rem`,
              bottom: `${(ROWS - 1 - c.row) * PITCH}rem`,
              width: `${c.size + 0.14}rem`,
              height: `${c.size + 0.14}rem`,
              backgroundImage: c.gradient,
              ["--pg-a" as string]: c.alpha.toFixed(2),
              ["--pg-d" as string]: `${c.dur.toFixed(2)}s`,
              ["--pg-delay" as string]: `${c.delay.toFixed(2)}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
