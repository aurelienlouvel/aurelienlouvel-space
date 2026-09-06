import {
  UnifrakturMaguntia,
  Birthstone_Bounce,
  Jersey_10,
  Unkempt,
} from "next/font/google";

// Curated 4-vibe pool — self-hosted via next/font so there's zero runtime
// request to Google: blackletter, bouncy script, pixel/arcade, scrawly.
const unifrakturMaguntia = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
});
const birthstoneBounce = Birthstone_Bounce({
  subsets: ["latin"],
  weight: "400",
});
const jersey10 = Jersey_10({ subsets: ["latin"], weight: "400" });
const unkempt = Unkempt({ subsets: ["latin"], weight: "400" });

export const SCRAMBLE_FONT_CLASSNAMES = [
  unifrakturMaguntia.className,
  birthstoneBounce.className,
  jersey10.className,
  unkempt.className,
];

// Small fixed tilt paired index-for-index with the font pool, so each
// scrambled letter also leans a bit — reinforces the "wonky" combo.
const SCRAMBLE_ROTATIONS = [-7, 5, -6, 8];

function cycleToLength<T>(pool: T[], length: number): T[] {
  const result: T[] = [];
  while (result.length < length) {
    result.push(...pool);
  }
  return result.slice(0, length);
}

/**
 * Returns `length` font classNames, one per letter, in the pool's fixed
 * order (cycling if the word is longer than the pool). Deterministic on
 * purpose — no shuffling — so the combination always matches the curated
 * order the fonts were picked in, and server/client render identically.
 */
export function scrambleFontsForLength(length: number): string[] {
  return cycleToLength(SCRAMBLE_FONT_CLASSNAMES, length);
}

/** Same pairing/cycling as `scrambleFontsForLength`, but the tilt angles (degrees). */
export function scrambleRotationsForLength(length: number): number[] {
  return cycleToLength(SCRAMBLE_ROTATIONS, length);
}
