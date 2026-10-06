import { daGradientAt, daHash, daPingPong } from "@/lib/da";

const COLS = 10;
const ROWS = 6;
/** Un pixel et l'écart entre deux pixels (rem). */
const CELL = 0.3125;
const GAP = 0.125;

type Cell = { id: number; col: number; row: number; x: number; a: number; color: string };

/**
 * Les pixels allumés d'un champ ; tous les autres restent blancs (ils ne sont pas
 * rendus : la pastille est blanche). `seed` change le tirage (chaque survol a le sien),
 * `from` place la fenêtre du dégradé dans le spectre. Un pixel prend sa couleur de sa
 * place dans le champ, en diagonale : voisins, ils forment un dégradé.
 */
function litCells(seed: number, density: number, from: number, loop: boolean): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = r * COLS + c;
      if (daHash(id * 7.3 + seed * 31.7) >= density) continue;
      // En boucle (le champ défile), l'aller-retour garantit qu'il n'y a pas de couture
      // entre la fin d'une copie et le début de la suivante.
      const along = (c + r * 0.6) / COLS;
      cells.push({
        id,
        col: c + 1,
        row: r + 1,
        x: Math.round((c / (COLS - 1)) * 1000) / 1000,
        // Force propre du pixel : l'ambiance (défilement) est plus douce que la vague.
        a: Math.round((loop ? 0.5 + daHash(id * 5.1) * 0.35 : 0.85 + daHash(id * 5.1 + seed) * 0.15) * 100) / 100,
        color: daGradientAt(loop ? daPingPong(along) : along / 1.3, from),
      });
    }
  }
  return cells;
}

const IDLE_CELLS = litCells(0, 0.4, 0, true);

function Field({ className, cells }: { className: string; cells: Cell[] }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} grid h-full content-center`}
      style={{
        width: `${COLS * (CELL + GAP)}rem`,
        gridTemplateColumns: `repeat(${COLS}, ${CELL}rem)`,
        gridTemplateRows: `repeat(${ROWS}, ${CELL}rem)`,
        gap: `${GAP}rem`,
      }}
    >
      {cells.map((c) => (
        <span
          key={c.id}
          className="da-cell"
          style={{
            gridColumn: c.col,
            gridRow: c.row,
            backgroundColor: c.color,
            ["--x" as string]: c.x,
            ["--a" as string]: c.a,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Le fond de la pastille « play » : un champ de petits carrés, dont une partie est
 * allumée en couleur unie, d'un dégradé de gauche à droite (ciel → lilas → rose) ;
 * les autres pixels sont blancs.
 *
 * - /play actif : le champ défile lentement vers la droite, en continu et sans
 *   vague (deux copies côte à côte, bords fondus) — chill ;
 * - survol : une vague balaie le champ de gauche à droite, allume d'autres pixels
 *   (un nouveau tirage et une autre tranche du spectre à chaque survol, grâce au
 *   `key`), puis ils redeviennent blancs.
 */
export function PlayPillPixels({ active, hoverKey }: { active: boolean; hoverKey: number }) {
  return (
    <span
      aria-hidden="true"
      className="da-pill pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
    >
      {active && (
        <span className="da-drift absolute inset-y-0 left-0 flex w-max">
          <Field className="da-field" cells={IDLE_CELLS} />
          <Field className="da-field" cells={IDLE_CELLS} />
        </span>
      )}
      {hoverKey > 0 && (
        <span key={hoverKey} className="da-hover absolute inset-0 block">
          <Field
            className="da-field-hover"
            cells={litCells(hoverKey, 0.45, (hoverKey * 0.23) % 0.5, false)}
          />
        </span>
      )}
    </span>
  );
}
