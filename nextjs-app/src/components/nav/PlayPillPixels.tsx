import { daHash } from "@/lib/da";

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

/** `a` : la force propre du pixel (0..1), l'opacité d'un gris neutre. */
type Cell = { id: number; col: number; row: number; x: number; a: number };

type FieldOptions = {
  cols: number;
  /** Change le tirage (chaque survol a le sien). */
  seed: number;
  /** Part des cases qui portent un pixel ; les autres restent blanches. */
  share: number;
  /** Bornes de la force d'un pixel. */
  min: number;
  max: number;
};

/**
 * Les pixels d'un champ : un tirage par case, une part porte un pixel, les autres ne
 * sont pas rendues (la pastille est blanche). Tous sont le même gris neutre ; seule leur
 * opacité (`min` → `max`) change de l'un à l'autre, ce qui donne des niveaux de gris
 * pâles, jamais sombres.
 */
function fieldCells({ cols, seed, share, min, max }: FieldOptions): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      if (daHash(id * 7.3 + seed * 31.7) >= share) continue;
      cells.push({
        id,
        col: c + 1,
        row: r + 1,
        x: Math.round((c / (cols - 1)) * 1000) / 1000,
        a: Math.round((min + daHash(id * 5.1 + seed * 3.3) * (max - min)) * 100) / 100,
      });
    }
  }
  return cells;
}

/** Au repos : la moitié des cases, de 5 à 14 % de gris. */
const IDLE_CELLS = fieldCells({ cols: COLS, seed: 0, share: 0.5, min: 0.05, max: 0.14 });

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
          className="da-cell"
          style={{
            gridColumn: c.col,
            gridRow: c.row,
            ["--x" as string]: c.x,
            ["--a" as string]: c.a,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Le fond de la pastille « play » : un champ de carrés, tous d'un gris neutre très pâle
 * (quelques niveaux d'opacité, à peine visibles) ; les autres cases sont blanches. Aucune
 * couleur : la pastille reste légère.
 *
 * - /play actif : le champ défile lentement vers la droite, en continu et sans
 *   vague (deux copies côte à côte, bords fondus) — chill ;
 * - survol : une vague balaie la pastille de gauche à droite (un nouveau tirage à chaque
 *   survol, grâce au `key`) : des pixels un peu plus soutenus s'allument l'un après
 *   l'autre, puis s'éteignent. Le loader de /play joue le même effet sur toute la page.
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
            cells={fieldCells({ cols: HOVER_COLS, seed: hoverKey, share: 0.6, min: 0.1, max: 0.22 })}
          />
        </span>
      )}
    </span>
  );
}
