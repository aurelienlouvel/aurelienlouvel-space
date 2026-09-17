/**
 * Amortissement exponentiel vers une cible, indépendant du framerate.
 *
 * Même formule que celle déjà éprouvée dans `FocusIndicator` pour son fondu
 * d'opacité (avant que ce fichier n'existe) — généralisée ici pour être
 * partagée par la caméra (mode "settle", cf. `PlayCanvas`) et les brackets
 * (position/taille).
 *
 * `speed` est un taux de convergence par seconde : plus il est grand, plus
 * `current` rattrape `target` vite. `1 - Math.exp(-speed * delta)` reste
 * indépendant du framerate là où un facteur fixe appliqué par frame ne le
 * serait pas — c'est justement pour cette raison que l'ancien `lib/damp.ts`
 * (un `current + (target - current) * factor` sans terme `delta`) n'a pas été
 * repris : à framerate variable il n'amortit pas à la même vitesse perçue.
 */
export function dampTowards(
  current: number,
  target: number,
  speed: number,
  delta: number,
): number {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}
