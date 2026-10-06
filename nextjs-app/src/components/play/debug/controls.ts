import type { WaveDirection } from "../PlayCanvas";
import type { ShardParams } from "../ShardField";
import type { EasingName, TrackName, TransitionConfig } from "../transition-presets";

/**
 * Helpers de contrôles Leva partagés par les onglets du debug.
 * Les noms de dossiers / contrôles ne doivent PAS contenir d'apostrophe : Leva
 * en fait un chemin et la page se fige (bug rencontré en dev).
 */

export const EASING_OPTIONS: EasingName[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInCubic",
  "easeInOutCubic",
  "easeInOutQuint",
  "easeOutExpo",
  "easeOutQuint",
];

export type NumberOptions = { label?: string; min: number; max: number; step: number };

/** Slider numérique branché directement sur un champ d'un objet de config. */
export function num<T extends object>(target: T, key: keyof T & string, o: NumberOptions) {
  return {
    label: o.label,
    value: target[key] as unknown as number,
    min: o.min,
    max: o.max,
    step: o.step,
    onChange: (v: number) => {
      (target as Record<string, unknown>)[key] = v;
    },
  };
}

/** Case à cocher branchée sur un champ booléen d'un objet de config. */
export function toggle<T extends object>(target: T, key: keyof T & string, label?: string) {
  return {
    label,
    value: target[key] as unknown as boolean,
    onChange: (v: boolean) => {
      (target as Record<string, unknown>)[key] = v;
    },
  };
}

/** Sélecteur d'easing branché sur un champ d'un objet de config. */
export function easingControl<T extends object>(target: T, key: keyof T & string, label = "Easing") {
  return {
    label,
    value: target[key] as unknown as string,
    options: EASING_OPTIONS,
    onChange: (v: string) => {
      (target as Record<string, unknown>)[key] = v as EasingName;
    },
  };
}

/** Start / Duration / Easing d'une piste de la timeline. */
export function trackControls(
  tr: TransitionConfig,
  name: TrackName,
  maxStart: number,
  maxDuration: number,
  prefix: string = name,
) {
  const track = tr[name];
  return {
    [`${prefix}_start`]: num(track, "start", { label: "Start (s)", min: 0, max: maxStart, step: 0.02 }),
    [`${prefix}_duration`]: num(track, "duration", { label: "Duration (s)", min: 0.05, max: maxDuration, step: 0.02 }),
    [`${prefix}_easing`]: easingControl(track, "easing"),
  };
}

/** Réglages des éclats (image qui se sépare en morceaux), partagés ouverture + changement de carte. */
export function shardControls(p: ShardParams) {
  return {
    shardCount: num(p, "count", { label: "Nombre d eclats", min: 0, max: 96, step: 1 }),
    shardMin: num(p, "minSize", { label: "Taille min", min: 4, max: 120, step: 1 }),
    shardMax: num(p, "maxSize", { label: "Taille max", min: 20, max: 400, step: 1 }),
    shardAspect: num(p, "aspect", { label: "Etirement (1 = carres)", min: 1, max: 8, step: 0.1 }),
    shardTravel: num(p, "travel", { label: "Distance d ejection", min: 0, max: 600, step: 5 }),
    shardTravelFar: num(p, "travelFar", { label: "Parallaxe plan arriere", min: 0, max: 2, step: 0.05 }),
    shardTravelNear: num(p, "travelNear", { label: "Parallaxe plan avant", min: 0, max: 4, step: 0.05 }),
    shardScaleFar: num(p, "scaleFar", { label: "Echelle plan arriere", min: 0.3, max: 1.5, step: 0.02 }),
    shardScaleNear: num(p, "scaleNear", { label: "Echelle plan avant", min: 0.5, max: 2.5, step: 0.02 }),
    shardOpacity: num(p, "opacity", { label: "Opacite", min: 0, max: 1, step: 0.01 }),
    shardFlat: num(p, "flat", { label: "Aplat (1 = une couleur)", min: 0, max: 1, step: 0.01 }),
    shardTint: num(p, "tint", { label: "Couleurs de la DA", min: 0, max: 1, step: 0.01 }),
    shardBlurFar: num(p, "blurFar", { label: "Flou plan arriere", min: 0, max: 6, step: 0.1 }),
    shardBlurNear: num(p, "blurNear", { label: "Flou plan avant", min: 0, max: 6, step: 0.1 }),
    shardSoftness: num(p, "softness", { label: "Bords fondus", min: 0, max: 1, step: 0.01 }),
    shardIrid: num(p, "iridescence", { label: "Irisation", min: 0, max: 1, step: 0.01 }),
    shardSpeed: num(p, "speed", { label: "Vitesse (cycles par s)", min: 0.1, max: 3, step: 0.05 }),
    shardSpin: num(p, "spin", { label: "Rotation max (deg)", min: 0, max: 90, step: 1 }),
    shardUp: num(p, "upBias", { label: "Derive vers le haut", min: 0, max: 1.5, step: 0.05 }),
    shardSeed: num(p, "seed", { label: "Graine", min: 0, max: 999, step: 1 }),
  };
}

export const WAVE_DIRECTIONS: Record<string, WaveDirection> = {
  "Top-left to bottom-right": "tl-to-br",
  "Bottom-left to top-right": "bl-to-tr",
  "Left to right": "left-to-right",
  "Right to left": "right-to-left",
  "Bottom to top": "bottom-to-top",
  "Top to bottom": "top-to-bottom",
};
