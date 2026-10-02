const COLS = 12;
const ROWS = 7;
const COLORS = ["#0b1a5e", "#1d3fd0", "#4a8cff", "#4a8cff", "#9cccff", "#7c6cff"] as const;
const SIZES = [0.25, 0.25, 0.375, 0.5] as const;

function hash01(n: number): number {
  // Hash entier (pas de Math.sin) : identique à l'octet près sur le serveur et dans le navigateur.
  let h = Math.imul(Math.floor(n * 1000) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Cell = { id: number; col: number; row: number; size: number; color: string; alpha: number; dur: number; delay: number };

// Nuage clairsemé, plus dense vers le coin bas droit : une émanation, pas une grille.
const CELLS: Cell[] = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const id = row * COLS + col;
    const nearCorner = (col / (COLS - 1)) * 0.6 + (row / (ROWS - 1)) * 0.4;
    if (hash01(id * 3.7) > 0.12 + nearCorner * 0.5) continue;
    CELLS.push({
      id,
      col,
      row,
      size: SIZES[Math.floor(hash01(id * 5.1) * SIZES.length)],
      color: COLORS[Math.floor(hash01(id * 7.7) * COLORS.length)],
      alpha: 0.35 + hash01(id * 9.3) * 0.45,
      dur: 2.6 + hash01(id * 11.9) * 3.4,
      delay: hash01(id * 13.1) * 4,
    });
  }
}

/**
 * Petit nuage de pixels qui clignotent en bas à droite de l'écran, avec un
 * léger décalage horizontal par à-coups (glitch). Purement décoratif et
 * discret : `intensity` (0..1) règle l'opacité globale.
 */
export function PixelGlitch({ intensity = 0.6 }: { intensity?: number }) {
  if (intensity <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pg-field pointer-events-none fixed bottom-4 right-4 z-20"
      style={{ opacity: Math.min(1, intensity) }}
    >
      <div className="pg-slice relative" style={{ width: `${COLS * 0.75}rem`, height: `${ROWS * 0.75}rem` }}>
        {CELLS.map((c) => (
          <span
            key={c.id}
            className="pg-dot absolute"
            style={{
              right: `${(COLS - 1 - c.col) * 0.75}rem`,
              bottom: `${(ROWS - 1 - c.row) * 0.75}rem`,
              width: `${c.size}rem`,
              height: `${c.size}rem`,
              backgroundColor: c.color,
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
