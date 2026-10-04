/**
 * DA « Prism » — le langage visuel de /play, partagé par toutes les interfaces
 * concernées (loader, navigation, side panel, curseur, éclats du canvas).
 *
 * - Forme : rectangles arrondis de formats variés (jamais de carrés tous
 *   identiques), coins lissés à 32 % comme sur iOS.
 * - Matière : verre translucide — dégradé intérieur entre deux teintes, bords
 *   fondus par un léger flou, opacité basse (0.25–0.6), reflet irisé.
 * - Couleur : un seul spectre pastel (ciel → lilas → rose → menthe → abricot)
 *   avec un bleu d'encre pour l'accent. Les mêmes valeurs vivent dans
 *   `globals.css` (`--da-*`) pour le CSS pur.
 * - Mouvement : apparition par paliers (`steps`) ; la seule chorégraphie est la
 *   vague, qui balaie de gauche à droite (nav) ou du bas gauche vers le haut
 *   droit (cartes).
 */

export const DA_COLORS = {
  sky: "#8fd0ff",
  lilac: "#a99bff",
  rose: "#ff9fd0",
  mint: "#8ff0d8",
  apricot: "#ffd6a0",
  ink: "#4a6cff",
} as const;

/** Le spectre dans l'ordre où l'irisation le parcourt. */
export const DA_SPECTRUM = [
  DA_COLORS.sky,
  DA_COLORS.lilac,
  DA_COLORS.rose,
  DA_COLORS.apricot,
  DA_COLORS.mint,
] as const;

/** Bruit déterministe 0..1 (entier : identique sur le serveur et le navigateur). */
export function daHash(n: number): number {
  let h = Math.imul(Math.floor(n * 1000) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Dégradé de verre : deux teintes voisines du spectre, du haut gauche au bas droit. */
export function daGradient(seed: number): string {
  const i = Math.floor(daHash(seed) * DA_SPECTRUM.length);
  const a = DA_SPECTRUM[i];
  const b = DA_SPECTRUM[(i + 1 + Math.floor(daHash(seed + 0.5) * 2)) % DA_SPECTRUM.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/** Couleur d'un point du spectre (0..1, cyclique), en CSS hsl — pour les canvas 2D. */
export function daHue(t: number): number {
  // Du bleu ciel (200°) au rose (330°), puis retour : la plage où le spectre reste doux.
  const u = ((t % 1) + 1) % 1;
  return 200 + 130 * (u < 0.5 ? u * 2 : 2 - u * 2);
}

type RGB3 = [number, number, number];

const SPECTRUM_RGB: RGB3[] = [
  [143, 208, 255],
  [169, 155, 255],
  [255, 159, 208],
  [255, 214, 160],
  [143, 240, 216],
];

/** Un point (0..1) du spectre Prism, interpolé, en `rgb()` CSS : le dégradé de gauche à droite. */
export function daSpectrumAt(t: number): string {
  const u = Math.min(1, Math.max(0, t)) * (SPECTRUM_RGB.length - 1);
  const i = Math.min(SPECTRUM_RGB.length - 2, Math.floor(u));
  const f = u - i;
  const a = SPECTRUM_RGB[i];
  const b = SPECTRUM_RGB[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)} ${Math.round(a[1] + (b[1] - a[1]) * f)} ${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
