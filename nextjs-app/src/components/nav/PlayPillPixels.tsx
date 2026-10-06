import { daGradientAt, daHash, daPingPong } from "@/lib/da";

/**
 * Colonnes du champ qui défile (pastille active) et de celui de la vague de survol : cinq
 * colonnes de 0.5rem (écarts compris, 50 px) couvrent les 52 px de la pastille.
 */
const COLS = 12;
const HOVER_COLS = 5;
/** Lignes : à 0.5rem par pixel, quatre rangées tiennent dans les 44 px de la pastille. */
const ROWS = 4;
/** L'écart entre deux pixels (rem) ; leur côté vient de `--da-cell` (0.5rem, réglé par le debug). */
const GAP = 0.125;

/** `color` absent : un pixel gris, qui fait le fond. */
type Cell = { id: number; col: number; row: number; x: number; a: number; color?: string };

type FieldOptions = {
  cols: number;
  /** Change le tirage (chaque survol a le sien). */
  seed: number;
  /** Part des cases allumées en couleur, puis part grisée ; les autres restent blanches. */
  colored: number;
  gray: number;
  /** Place la fenêtre du dégradé dans le spectre. */
  from: number;
  /** En boucle (le champ défile), le dégradé reboucle sans couture. */
  loop: boolean;
};

/**
 * Les pixels d'un champ. Un tirage par case : une part s'allume en couleur, une autre
 * est un gris pâle (le fond de la pastille), les autres ne sont pas rendus, la
 * pastille est blanche. Un pixel de couleur la tient de sa place dans le champ, en
 * diagonale : voisins, ils forment un dégradé. Les gris, eux, ont des niveaux
 * différents (opacité de 0.05 à 0.16 d'un gris neutre) : ils restent discrets.
 */
function fieldCells({ cols, seed, colored, gray, from, loop }: FieldOptions): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      const h = daHash(id * 7.3 + seed * 31.7);
      const isColor = h < colored;
      if (!isColor && h >= colored + gray) continue;
      const cell = {
        id,
        col: c + 1,
        row: r + 1,
        x: Math.round((c / (cols - 1)) * 1000) / 1000,
      };
      if (!isColor) {
        cells.push({ ...cell, a: Math.round((0.05 + daHash(id * 5.1 + 3.3) * 0.11) * 100) / 100 });
        continue;
      }
      // En boucle, l'aller-retour garantit qu'il n'y a pas de couture entre la fin d'une
      // copie du champ et le début de la suivante.
      const along = (c + r * 0.6) / cols;
      cells.push({
        ...cell,
        // Force propre du pixel : l'ambiance (défilement) est plus douce que la vague.
        a: Math.round((loop ? 0.5 + daHash(id * 5.1) * 0.35 : 0.85 + daHash(id * 5.1 + seed) * 0.15) * 100) / 100,
        color: daGradientAt(loop ? daPingPong(along) : along / 1.3, from),
      });
    }
  }
  return cells;
}

const IDLE_CELLS = fieldCells({ cols: COLS, seed: 0, colored: 0.3, gray: 0.45, from: 0, loop: true });

function Field({ className, cols, cells }: { className: string; cols: number; cells: Cell[] }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} grid h-full content-center`}
      style={{
        // Largeur d'un pas × colonnes (écart final compris) : deux copies côte à côte
        // se raccordent exactement, c'est ce qui rend le défilement sans couture.
        width: `calc(${cols} * (var(--da-cell, 0.5rem) + ${GAP}rem))`,
        gridTemplateColumns: `repeat(${cols}, var(--da-cell, 0.5rem))`,
        gridTemplateRows: `repeat(${ROWS}, var(--da-cell, 0.5rem))`,
        gap: `${GAP}rem`,
      }}
    >
      {cells.map((c) => (
        <span
          key={c.id}
          className={c.color ? "da-cell da-cell-color" : "da-cell da-cell-gray"}
          style={{
            gridColumn: c.col,
            gridRow: c.row,
            ...(c.color ? { backgroundColor: c.color } : null),
            ["--x" as string]: c.x,
            ["--a" as string]: c.a,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Le fond de la pastille « play » : un champ de carrés arrondis, dont une partie est
 * allumée en couleur unie, d'un dégradé de gauche à droite (ciel → lilas → rose), une
 * autre est un gris pâle qui fait le fond (des niveaux de gris, à peine visibles) ;
 * les autres cases sont blanches.
 *
 * - /play actif : le champ défile lentement vers la droite, en continu et sans
 *   vague (deux copies côte à côte, bords fondus) — chill ;
 * - survol : une vague balaie le champ de gauche à droite, allume d'autres pixels de
 *   couleur (un nouveau tirage et une autre tranche du spectre à chaque survol, grâce
 *   au `key`), puis ils s'éteignent, et laissent voir le fond gris dessous.
 */
export function PlayPillPixels({ active, hoverKey }: { active: boolean; hoverKey: number }) {
  return (
    <span
      aria-hidden="true"
      className="da-pill pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
    >
      {active && (
        <span className="da-drift absolute inset-y-0 left-0 flex w-max">
          <Field className="da-field" cols={COLS} cells={IDLE_CELLS} />
          <Field className="da-field" cols={COLS} cells={IDLE_CELLS} />
        </span>
      )}
      {hoverKey > 0 && (
        <span key={hoverKey} className="da-hover absolute inset-0 block">
          <Field
            className="da-field-hover"
            cols={HOVER_COLS}
            cells={fieldCells({
              cols: HOVER_COLS,
              seed: hoverKey,
              colored: 0.55,
              gray: 0,
              from: (hoverKey * 0.23) % 0.5,
              loop: false,
            })}
          />
        </span>
      )}
    </span>
  );
}
