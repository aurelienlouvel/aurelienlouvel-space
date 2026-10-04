import type {
  IUniform,
  Material,
  WebGLProgramParametersWithUniforms,
} from "three";

/**
 * Outillage commun aux deux formes du cadre : l'image et les brackets.
 *
 * Les deux sont dessinées en SDF dans le fragment shader plutôt qu'en
 * géométrie : leur plane est un carré unitaire mis à l'échelle séparément en x
 * et en y, donc des coins arrondis dans la géométrie sortiraient en ellipses.
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
 * Lissage des coins façon Apple (« squircle ») : 0 = arc de cercle classique,
 * 1 = très lissé. Un seul objet uniform partagé par tous les shaders arrondis,
 * donc un réglage du debug les met à jour d'un coup. 0.32 = 32 %.
 */
export const CORNER_SMOOTHING: IUniform<number> = { value: 0.32 };

/**
 * `sdRoundedRect` à coins lissés : la norme L-n (n > 2) remplace la distance
 * euclidienne dans la zone du coin, ce qui arrondit sans cassure de courbure,
 * et le rayon s'étend légèrement le long des bords, comme le « corner
 * smoothing » de Figma. Déclare `uCornerSmooth` : à fournir avec CORNER_SMOOTHING.
 */
export const GLSL_SQUIRCLE = /* glsl */ `
uniform float uCornerSmooth;

float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  float s = clamp(uCornerSmooth, 0.0, 1.0);
  float n = 2.0 + s * 5.0;
  float r = min(radius * (1.0 + s * 0.55), min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  vec2 qc = max(q, 0.0);
  float corner = pow(pow(qc.x, n) + pow(qc.y, n), 1.0 / n);
  return min(max(q.x, q.y), 0.0) + corner - r;
}
`;

/**
 * Bascule 3D façon CSS `perspective() rotateX() rotateY()`, appliquée en
 * espace local (plan unitaire -0.5..0.5) avant les matrices de la scène.
 *
 * La caméra du canvas est orthographique : lui faire subir une rotation
 * d'Object3D ne produirait qu'un aplatissement symétrique en cosinus,
 * invisible en pratique et identique quel que soit le sens du tilt (cos est
 * pair). Ce warp calcule sa propre perspective *locale*, indépendante de la
 * caméra de scène, pour obtenir un vrai trapèze asymétrique.
 *
 * Partagé entre le média (`ArtifactPlane`, injecté via `onBeforeCompile` sur
 * `#include <begin_vertex>`) et l'overlay de sélection (`SelectProgressOverlay`,
 * shader autonome) : les deux doivent bouger comme un seul objet physique.
 */
export const CARD_TILT_GLSL = /* glsl */ `
uniform vec2 uCardTilt;

vec3 applyCardTilt(vec3 p, vec2 tilt) {
  float cx = cos(tilt.x), sx = sin(tilt.x);
  float cy = cos(tilt.y), sy = sin(tilt.y);

  float y1 = p.y * cx - p.z * sx;
  float z1 = p.y * sx + p.z * cx;

  float x2 = p.x * cy + z1 * sy;
  float z2 = -p.x * sy + z1 * cy;

  const float perspective = 1.35;
  float persp = perspective / max(0.2, perspective - z2);
  return vec3(x2 * persp, y1 * persp, z2);
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
