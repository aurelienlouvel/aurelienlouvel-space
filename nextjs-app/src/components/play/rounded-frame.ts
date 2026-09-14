import type {
  IUniform,
  Material,
  WebGLProgramParametersWithUniforms,
} from "three";

/**
 * Outillage des formes du cadre, dessinées en SDF dans le fragment shader
 * plutôt qu'en géométrie : leur plane est un carré unitaire mis à l'échelle
 * séparément en x et en y, donc des coins arrondis dans la géométrie
 * sortiraient en ellipses.
 */

/**
 * `vUv` n'existe que derrière ce define : three ne le pose jamais lui-même, il
 * ne génère que `USE_UV1` / `USE_UV2` / `USE_UV3` pour les canaux secondaires.
 */
export const FRAME_DEFINES = { USE_UV: "" };

/**
 * Largeur d'un pixel écran, en unités monde.
 *
 * Mesurée sur le point plutôt que sur la distance : les SDF replient le plan
 * avec `abs()`, et `fwidth` appliqué directement à la distance explose sur le
 * pli, ce qui trace une croix au milieu de la forme. Le point, lui, reste
 * linéaire en `vUv` — ses dérivées sont constantes.
 *
 * Le plancher garde le résultat utilisable comme bornes de `smoothstep`, dont
 * le comportement n'est pas défini quand les deux bornes coïncident.
 */
export const GLSL_PIXEL_WIDTH = /* glsl */ `
float pixelWidth(vec2 p) {
  return max(max(fwidth(p.x), fwidth(p.y)), 1e-5);
}
`;

/**
 * Déclare des uniforms sur un programme en cours de compilation, et en garde la
 * trace sur le matériau.
 *
 * three n'expose pas les uniforms d'un matériau standard : sans ce stash, on
 * n'aurait aucun moyen de les réécrire après coup. Le typage revient à
 * l'appelant — `userData` est un sac non typé, et chaque matériau y range la
 * forme qui lui est propre.
 */
export function attachUniforms(
  material: Material,
  parameters: WebGLProgramParametersWithUniforms,
  uniforms: Record<string, IUniform>,
) {
  Object.assign(parameters.uniforms, uniforms);
  material.userData.uniforms = uniforms;
}

/**
 * Les uniforms posés par `attachUniforms`, ou `null` tant que le programme n'a
 * pas été compilé — `onBeforeCompile` ne tourne qu'au premier rendu du
 * matériau, donc la toute première frame passe forcément à vide.
 */
export function uniformsOf<T>(material: Material | null): T | null {
  return (material?.userData.uniforms as T | undefined) ?? null;
}

/**
 * Rayon d'arrondi réellement applicable à une boîte.
 *
 * Au-delà de la demi-dimension la plus courte, la SDF de rectangle arrondi se
 * replie sur elle-même et les coins partent en vrille.
 */
export function clampRadius(radius: number, width: number, height: number) {
  return Math.min(radius, Math.min(width, height) / 2);
}
