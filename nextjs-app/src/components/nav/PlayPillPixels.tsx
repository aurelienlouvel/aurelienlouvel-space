import { daHash, daSpectrumAt } from "@/lib/da";

const COLS = 9;
const ROWS = 5;

type Cell = { id: number; x: number; a: number; color: string };

// Un champ régulier de cellules, chacune à sa propre opacité, teintées d'un
// dégradé qui parcourt le spectre de gauche à droite. --x (0..1) donne à chaque
// cellule son instant dans la vague.
const CELLS: Cell[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const id = r * COLS + c;
    const x = c / (COLS - 1);
    CELLS.push({
      id,
      x: Math.round(x * 1000) / 1000,
      a: Math.round((0.08 + Math.pow(daHash(id * 7.3), 1.4) * 0.5) * 100) / 100,
      color: daSpectrumAt(x + (daHash(id * 3.9) - 0.5) * 0.1),
    });
  }
}

function Field({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} grid h-full w-full gap-[2px] p-[2px]`}
      style={{
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
      }}
    >
      {CELLS.map((c) => (
        <span
          key={c.id}
          className="da-cell rounded-[28%]"
          style={{
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
 * Le fond de la pastille « play » : un champ régulier de cellules aux opacités
 * variées, teintées d'un dégradé de gauche à droite.
 *
 * - /play actif : le champ défile lentement vers la droite, en continu et sans
 *   vague (deux copies côte à côte, bords fondus) — chill ;
 * - survol : une vague balaie le champ de gauche à droite (relancée à chaque
 *   survol grâce au `key`).
 */
export function PlayPillPixels({ active, hoverKey }: { active: boolean; hoverKey: number }) {
  return (
    <span
      aria-hidden="true"
      className="da-pill pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
    >
      {active && (
        <span className="da-drift absolute inset-y-0 left-0 flex w-[200%]">
          <span className="block h-full w-1/2">
            <Field className="da-field" />
          </span>
          <span className="block h-full w-1/2">
            <Field className="da-field" />
          </span>
        </span>
      )}
      {hoverKey > 0 && (
        <span key={hoverKey} className="da-hover absolute inset-0 block">
          <Field className="da-field-hover" />
        </span>
      )}
    </span>
  );
}
