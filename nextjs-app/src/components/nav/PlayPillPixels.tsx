import { daGradient, daHash } from "@/lib/da";

const COLS = 18;
const ROWS = 3;

type Pix = { id: number; x: number; left: number; top: number; w: number; h: number; gradient: string; alpha: number };

// Rectangles répartis sur la pastille ; --x (0..1) fixe l'instant où la vague les touche.
const PIXELS: Pix[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const id = r * COLS + c;
    if (daHash(id * 3.1) > 0.62) continue;
    const x = (c + daHash(id * 5.3)) / COLS;
    PIXELS.push({
      id,
      x: Math.round(x * 1000) / 1000,
      left: Math.round(x * 1000) / 10,
      top: Math.round(((r + daHash(id * 7.7)) / ROWS) * 1000) / 10,
      w: Math.round((0.35 + daHash(id * 9.1) * 0.85) * 100) / 100,
      h: Math.round((0.22 + daHash(id * 11.3) * 0.5) * 100) / 100,
      gradient: daGradient(id * 2.7),
      alpha: Math.round((0.2 + daHash(id * 13.9) * 0.3) * 100) / 100,
    });
  }
}

function Layer({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={`${className} pointer-events-none absolute inset-0 overflow-hidden rounded-xl`}>
      {PIXELS.map((p) => (
        <span
          key={p.id}
          className="da-pix da-rect absolute rounded-[32%] opacity-0"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.w}rem`,
            height: `${p.h}rem`,
            backgroundImage: p.gradient,
            ["--x" as string]: p.x,
            ["--da-a" as string]: `calc(${p.alpha} * var(--da-nav-a, 1))`,
            ["--da-blur" as string]: "0.5px",
          }}
        />
      ))}
    </span>
  );
}

/**
 * Pixels de la pastille « play » : rectangles de verre translucides au fond du
 * lien. Quand /play est la page active, une vague lente les balaie de gauche à
 * droite en continu ; au survol, une vague plus vive repart du bord gauche
 * (remontée à chaque survol grâce au `key`).
 */
export function PlayPillPixels({ active, hoverKey }: { active: boolean; hoverKey: number }) {
  return (
    <>
      {active && <Layer className="da-wave-active" />}
      {hoverKey > 0 && <Layer key={hoverKey} className="da-wave-hover" />}
    </>
  );
}
