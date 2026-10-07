/**
 * Anneau de cartes du deck : les maths, sans three ni React (testables hors navigateur).
 *
 * Chaque case de l'anneau montre toujours le même média (`case mod K`) et le deck les parcourt en
 * boucle. `deckPos` est l'indice continu de la carte du dessus ; il ne revient jamais en arrière et
 * n'est pas borné. Résultat : la pile garde ses layers visibles même quand l'artifact n'a qu'un ou
 * deux médias, la même carte revenant alors derrière elle-même.
 */
import { STACK_DEPTH_MAX } from "./transition-presets";

/**
 * Nombre de cases pour `mediaCount` médias : un multiple de K (la case s et la case s + taille montrent
 * le même média, donc le bouclage de l'anneau ne change aucune carte), d'au moins
 * `2 * STACK_DEPTH_MAX + 4` (la case qui boucle, de −taille/2 à +taille/2, est loin des deux bords
 * visibles de la pile, quel que soit `stackDepth`).
 */
export function ringSizeFor(mediaCount: number): number {
  const K = Math.max(1, mediaCount);
  return K * Math.ceil((2 * STACK_DEPTH_MAX + 4) / K);
}

/** Profondeur signée de la case `slot` : 0 = carte du dessus, > 0 = derrière, ]−1, 0[ = en train de partir. */
export function ringDepth(slot: number, deckPos: number, ringSize: number): number {
  const d = slot - deckPos;
  return d - ringSize * Math.round(d / ringSize);
}

/**
 * Opacité d'un layer à la profondeur `dv` (≥ 0) : 1 pour la carte du dessus, `stackOpacity` pour le
 * premier layer, puis `falloff` à chaque layer suivant. Le dernier layer (`depthMax`) garde la
 * sienne en entier ; au-delà, la carte s'efface sur un pas.
 */
export function layerOpacityAt(
  dv: number,
  depthMax: number,
  stackOpacity: number,
  falloff: number,
): number {
  const base = dv <= 1 ? 1 + (stackOpacity - 1) * dv : stackOpacity * Math.pow(falloff, dv - 1);
  return base * Math.max(0, Math.min(1, depthMax + 1 - dv));
}
