import { daHash } from "@/lib/da";

/**
 * Rotation « posée à la main » d'un artifact au repos, en radians : tirée de
 * son index, stable d'un rendu à l'autre, dans ±`rangeDeg`.
 * Partagée entre la tuile, l'overlay de sélection et tout ce qui doit suivre.
 */
export function restRotation(index: number, rangeDeg: number): number {
  return ((daHash(index * 13.7 + 2.1) - 0.5) * 2 * rangeDeg * Math.PI) / 180;
}
