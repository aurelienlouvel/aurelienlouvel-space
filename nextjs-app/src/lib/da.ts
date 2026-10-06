/**
 * DA « Pixels » — le langage visuel de /play, partagé par toutes les interfaces
 * concernées (loader, navigation, side panel, curseur, éclats du canvas).
 *
 * - Forme : des carrés, rien d'autre. Ni rectangles de formats variés, ni coins
 *   arrondis, ni dégradé à l'intérieur d'un pixel.
 * - Matière : un aplat net. Une couleur unie par pixel, sans flou, sans verre
 *   translucide, sans bord fondu. Un pixel éteint est blanc.
 * - Couleur : le dégradé naît ENTRE les pixels voisins (`daGradientAt`) : côte à
 *   côte, ils glissent d'une teinte à sa voisine du spectre pastel. On n'en montre
 *   qu'une fenêtre courte à la fois (`DA_WINDOW`), jamais tout le spectre d'un coup.
 *   Les mêmes valeurs vivent dans `globals.css` (`--da-*`) pour le CSS pur.
 * - Mouvement : des pixels qui s'allument puis redeviennent blancs. La vague balaie
 *   la nav de gauche à droite et traverse les cartes au survol (une bande blanche
 *   lumineuse) ; le coin bas droit du panneau scintille en permanence.
 */

export const DA_COLORS = {
  sky: "#8fd0ff",
  lilac: "#a99bff",
  rose: "#ff9fd0",
  mint: "#8ff0d8",
  apricot: "#ffd6a0",
  ink: "#4a6cff",
} as const;

/** Le spectre dans l'ordre où le dégradé le parcourt. */
export const DA_SPECTRUM = [
  DA_COLORS.sky,
  DA_COLORS.lilac,
  DA_COLORS.rose,
  DA_COLORS.apricot,
  DA_COLORS.mint,
] as const;

/** La part du spectre (0..1) visible d'un coup : un dégradé, pas un arc-en-ciel. */
export const DA_WINDOW = 0.5;

/** Bruit déterministe 0..1 (entier : identique sur le serveur et le navigateur). */
export function daHash(n: number): number {
  let h = Math.imul(Math.floor(n * 1000) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type RGB3 = [number, number, number];

function hexToRgb(hex: string): RGB3 {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const SPECTRUM_RGB: RGB3[] = DA_SPECTRUM.map(hexToRgb);

/** Un point (0..1) du spectre pastel, interpolé, en composantes 0..255 entières. */
export function daSpectrumRgb(t: number): RGB3 {
  const u = Math.min(1, Math.max(0, t)) * (SPECTRUM_RGB.length - 1);
  const i = Math.min(SPECTRUM_RGB.length - 2, Math.floor(u));
  const f = u - i;
  const a = SPECTRUM_RGB[i];
  const b = SPECTRUM_RGB[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** Un point (0..1) du spectre pastel, interpolé, en `rgb()` CSS. */
export function daSpectrumAt(t: number): string {
  const [r, g, b] = daSpectrumRgb(t);
  return `rgb(${r} ${g} ${b})`;
}

/** Où tombe `x` (0..1) dans le spectre quand on n'en parcourt que la fenêtre `from` → `from + DA_WINDOW`. */
function windowed(x: number, from: number): number {
  const start = Math.min(1 - DA_WINDOW, Math.max(0, from));
  return start + Math.min(1, Math.max(0, x)) * DA_WINDOW;
}

/**
 * La couleur unie d'un pixel dans un dégradé. `x` (0..1) est sa place dans le champ ;
 * `from` (0..1) place le départ de la fenêtre dans le spectre : seule la tranche
 * `from` → `from + DA_WINDOW` est parcourue (ciel → lilas → rose pour `from = 0`).
 */
export function daGradientAt(x: number, from = 0): string {
  return daSpectrumAt(windowed(x, from));
}

/** Comme `daGradientAt`, en composantes 0..255 (pour un shader ou un canvas). */
export function daGradientRgb(x: number, from = 0): RGB3 {
  return daSpectrumRgb(windowed(x, from));
}

/**
 * Aller-retour 0 → 1 → 0 de période 1. Appliqué à `x` avant `daGradientAt`, il donne
 * un dégradé qui reboucle sans raccord : un champ qui défile en boucle, copié deux
 * fois côte à côte, ne montre aucune couture.
 */
export function daPingPong(t: number): number {
  return 1 - Math.abs(2 * (t - Math.floor(t)) - 1);
}
