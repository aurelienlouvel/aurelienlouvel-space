/**
 * Dézoom en mouvement de la caméra de /play.
 *
 * Le zoom est lié au RETARD de la caméra sur sa cible, jamais à une vitesse
 * lissée à part : la caméra rattrape sa cible par amortissement exponentiel, donc
 * à chaque instant sa vitesse à l'écran vaut `retard × raideur`. Le canvas
 * immobile (retard nul) donne un zoom de base exact ; le zoom revient au rythme
 * exact où le mouvement s'éteint, sans second délai ni animation de fin.
 *
 * Fonctions pures : la caméra three, elle, reste dans `PlayCanvas`.
 */

/**
 * Vitesse d'écran (px/s) sous laquelle la caméra est à l'arrêt pour l'œil
 * (environ 1 px de retard au suivi par défaut) : le zoom y est exactement celui
 * de base.
 */
export const DEZOOM_DEAD_SPEED = 24;

/** Exposant de la courbe vitesse → dézoom (1 = linéaire). */
const DEZOOM_CURVE_POWER = 0.85;

/**
 * Vitesse (px/s) à laquelle la caméra file à l'écran, lue sur son retard :
 * `lagWorld` en unités monde, `zoom` le zoom courant, `rate` la raideur du
 * suivi (par seconde).
 */
export function cameraScreenSpeed(lagWorld: number, zoom: number, rate: number): number {
  return lagWorld * zoom * rate;
}

/**
 * Dézoom visé (0..max) pour une vitesse d'écran : 0 à l'arrêt, `max` à partir de
 * `ref` px/s.
 */
export function dezoomForSpeed(speed: number, max: number, ref: number): number {
  const span = Math.max(1, ref - DEZOOM_DEAD_SPEED);
  const t = Math.min(1, Math.max(0, (speed - DEZOOM_DEAD_SPEED) / span));
  return max * Math.pow(t, DEZOOM_CURVE_POWER);
}

/**
 * Dézoom appliqué : monte avec une attaque rapide (`attack`, par seconde) pour
 * qu'un cran de molette ne fasse pas sauter le zoom d'une frame à l'autre, et
 * redescend sans délai, puisque la cible, elle, s'éteint avec le retard.
 */
export function stepDezoom(current: number, target: number, attack: number, delta: number): number {
  if (target <= current) return target;
  return current + (target - current) * (1 - Math.exp(-attack * delta));
}

/**
 * Décalage de la caméra (unités monde) qui garde immobile à l'écran le point
 * monde situé sous le pointeur quand le zoom passe de `from` à `to`.
 * `px`, `py` : position du pointeur depuis le centre de l'écran, en px, y vers
 * le haut (comme le monde).
 */
export function anchorShift(
  px: number,
  py: number,
  from: number,
  to: number,
): { x: number; y: number } {
  const k = 1 / from - 1 / to;
  return { x: px * k, y: py * k };
}
