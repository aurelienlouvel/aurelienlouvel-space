/**
 * Fonctions d'easing mathématiques et profils de transition (Presets).
 */

export type EasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInCubic"
  | "easeInOutCubic"
  | "easeOutExpo"
  | "easeOutQuint";

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInCubic: (t) => t * t * t,
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeOutQuint: (t) => {
    const p = t - 1;
    return p * p * p * p * p + 1;
  },
};

export function evaluateEasing(name: EasingName, t: number): number {
  const fn = EASINGS[name] ?? EASINGS.linear;
  return fn(Math.max(0, Math.min(1, t)));
}

export type TransitionPresetName = "cinematic" | "snappy" | "dramatic" | "custom";

export type TransitionConfig = {
  preset: TransitionPresetName;
  // ── Temps 1 : Sélection maintenue (Hold) ─────────────────────────
  selectDuration: number; // Durée pour charger la sélection (ex: 1.2s)
  selectZoom: number; // Facteur multiplicatif du zoom caméra (ex: 1.15 = +15%)
  selectScale: number; // Grossissement subtil du média sélectionné (ex: 1.06)
  selectRepulse: number; // Force de répulsion progressive douce (ex: 500)
  selectEasing: EasingName;
  // ── Temps 2 : Explosion / Isolation (Burst) ──────────────────────
  burstDuration: number; // Durée de l'explosion/zoom final (ex: 1.2s)
  burstZoom: number; // Gros zoom final (ex: 3.2x)
  burstRepulse: number; // Maxi-répulsion expulsant tous les autres médias (ex: 120000)
  burstEasing: EasingName;
};

export const TRANSITION_PRESETS: Record<Exclude<TransitionPresetName, "custom">, Omit<TransitionConfig, "preset">> = {
  cinematic: {
    selectDuration: 1.2,
    selectZoom: 1.15,
    selectScale: 1.06,
    selectRepulse: 600,
    selectEasing: "easeInQuad",
    burstDuration: 1.2,
    burstZoom: 3.2,
    burstRepulse: 120000,
    burstEasing: "easeInOutCubic",
  },
  snappy: {
    selectDuration: 0.9,
    selectZoom: 1.18,
    selectScale: 1.08,
    selectRepulse: 800,
    selectEasing: "easeOutQuad",
    burstDuration: 0.8,
    burstZoom: 3.0,
    burstRepulse: 140000,
    burstEasing: "easeOutExpo",
  },
  dramatic: {
    selectDuration: 1.4,
    selectZoom: 1.12,
    selectScale: 1.04,
    selectRepulse: 350,
    selectEasing: "easeInCubic",
    burstDuration: 1.5,
    burstZoom: 3.6,
    burstRepulse: 180000,
    burstEasing: "easeOutQuint",
  },
};

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  preset: "custom",
  selectDuration: 0.7,
  selectZoom: 1.06,
  selectScale: 1,
  selectRepulse: 200,
  selectEasing: "easeOutQuint",
  burstDuration: 0.6,
  burstZoom: 1.8,
  burstRepulse: 40000,
  burstEasing: "easeInQuad",
};
