import { daHash, daIrid } from "@/lib/da";

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
/** De combien (en tours de la palette) la teinte change d'une rangée à la suivante. */
const ROW_SHIFT = 0.07;

/**
 * `a` : la force de base du pixel (0..1), l'opacité qu'aurait un gris neutre ; `hue` : son
 * reflet irisé, que `--da-nav-irid` mêle ou non au gris.
 */
type Cell = { id: number; col: number; row: number; x: number; a: number; hue: string };

type FieldOptions = {
  cols: number;
  /** Change le tirage (chaque survol a le sien). */
  seed: number;
  /** Part des cases qui portent un pixel ; les autres restent blanches. */
  share: number;
  /** Bornes de la force d'un pixel. */
  min: number;
  max: number;
  /** Tours de palette d'un bord à l'autre du champ (un entier : deux copies se raccordent). */
  span: number;
  /** Où le champ commence dans la palette (en tours). */
  offset: number;
};

/**
 * Les pixels d'un champ : un tirage par case, une part porte un pixel, les autres ne
 * sont pas rendues (la pastille est blanche). Seule leur force (`min` → `max`) change de
 * l'un à l'autre ; leur reflet suit la colonne et la rangée, dans la palette de la vague
 * de survol des cartes : côte à côte, deux pixels ont des teintes voisines.
 */
function fieldCells({ cols, seed, share, min, max, span, offset }: FieldOptions): Cell[] {
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
        a: Math.round((min + daHash(id * 5.1 + seed * 3.3) * (max - min)) * 1000) / 1000,
        // `c / cols` (et non `c / (cols - 1)`) : la dernière colonne ne reprend pas la teinte
        // de la première, qui est déjà celle de la colonne qui la suit dans la copie voisine.
        hue: daIrid((c / cols) * span + r * ROW_SHIFT + offset),
      });
    }
  }
  return cells;
}

/**
 * Au repos : la moitié des cases, de 3 à 8,5 % de force de base (le gris neutre y ferait
 * un voile à peine visible ; l'irisation y ajoute un gain, voir `daIridGain`). Un tour de
 * palette sur les douze colonnes : le champ se raccorde à sa copie et, en défilant, la
 * teinte glisse lentement à travers la pastille.
 */
const IDLE_CELLS = fieldCells({ cols: COLS, seed: 0, share: 0.5, min: 0.03, max: 0.085, span: 1, offset: 0 });

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
            ["--c" as string]: c.hue,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Le fond de la pastille « play » : un champ de carrés à peine opaques, dans les reflets
 * irisés de la vague de survol des cartes (le debug les ramène au gris neutre, `da.navIrid`
 * à 0) ; les autres cases sont blanches. La pastille reste légère.
 *
 * - /play actif : le champ défile lentement vers la droite, en continu et sans
 *   vague (deux copies côte à côte, bords fondus) — chill ;
 * - survol : une vague balaie la pastille de gauche à droite (un nouveau tirage et une
 *   nouvelle teinte de départ à chaque survol, grâce au `key`) : des pixels un peu plus
 *   soutenus s'allument l'un après l'autre, puis s'éteignent. Le loader de /play joue le
 *   même effet sur toute la page.
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
              share: 0.6,
              min: 0.065,
              max: 0.145,
              span: 0.6,
              offset: daHash(hoverKey * 13.7),
            })}
          />
        </span>
      )}
    </span>
  );
}
