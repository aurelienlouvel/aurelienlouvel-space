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
  // ── 1. Progression du select (Hold) ──────────────────────────────
  selectDuration: number; // Durée pour charger la sélection (ex: 0.6s)
  selectZoom: number; // Facteur multiplicatif du zoom caméra (ex: 1.06)
  selectScale: number; // Grossissement subtil du média sélectionné (ex: 1.0)
  selectRepulse: number; // Force de répulsion progressive douce (ex: 200)
  selectEasing: EasingName;

  // ── 2. Animation de select (Lock) ────────────────────────────────
  lockDuration: number; // Durée totale de l'animation de lock (ex: 0.4s)
  lockBracketTighten: number; // Pincement des brackets vers l'intérieur en px (ex: 16px)
  lockBracketExpand: number; // Expansion vers l'extérieur lors du fade out en px (ex: 24px)
  lockScalePunch: number; // Intensité du rebond / scale punch de confirmation (ex: 0.05)
  overlayExitDuration: number; // Durée d'évacuation de l'overlay vague (ex: 0.35s)

  // ── 3. Transition vers la page artifact (Burst) ──────────────────
  burstDuration: number; // Durée de l'explosion / zoom final (ex: 0.6s)
  burstZoom: number; // Gros zoom final (ex: 1.8x)
  burstRepulse: number; // Maxi-répulsion expulsant tous les autres médias (ex: 40000)
  burstEasing: EasingName;

  // ── 4. Retour vers la page de base ───────────────────────────────
  repulseReturnDelay: number; // Délai avant que la répulsion des voisins ne revienne à zéro (ex: 0.25s)
};

export const TRANSITION_PRESETS: Record<Exclude<TransitionPresetName, "custom">, Omit<TransitionConfig, "preset">> = {
  cinematic: {
    selectDuration: 0.8,
    selectZoom: 1.15,
    selectScale: 1.06,
    selectRepulse: 600,
    selectEasing: "easeInQuad",
    lockDuration: 0.5,
    lockBracketTighten: 16,
    lockBracketExpand: 28,
    lockScalePunch: 0.06,
    overlayExitDuration: 0.4,
    burstDuration: 1.2,
    burstZoom: 3.2,
    burstRepulse: 120000,
    burstEasing: "easeInOutCubic",
    repulseReturnDelay: 0.3,
  },
  snappy: {
    selectDuration: 0.5,
    selectZoom: 1.18,
    selectScale: 1.08,
    selectRepulse: 800,
    selectEasing: "easeOutQuad",
    lockDuration: 0.3,
    lockBracketTighten: 18,
    lockBracketExpand: 20,
    lockScalePunch: 0.08,
    overlayExitDuration: 0.25,
    burstDuration: 0.7,
    burstZoom: 3.0,
    burstRepulse: 140000,
    burstEasing: "easeOutExpo",
    repulseReturnDelay: 0.15,
  },
  dramatic: {
    selectDuration: 0.9,
    selectZoom: 1.12,
    selectScale: 1.04,
    selectRepulse: 350,
    selectEasing: "easeInCubic",
    lockDuration: 0.6,
    lockBracketTighten: 14,
    lockBracketExpand: 32,
    lockScalePunch: 0.05,
    overlayExitDuration: 0.5,
    burstDuration: 1.4,
    burstZoom: 3.6,
    burstRepulse: 180000,
    burstEasing: "easeOutQuint",
    repulseReturnDelay: 0.35,
  },
};

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  preset: "custom",
  // 1. Progression du select (Hold : 0.6s)
  selectDuration: 0.6,
  selectZoom: 1.06,
  selectScale: 1,
  selectRepulse: 200,
  selectEasing: "easeOutQuint",
  // 2. Animation de select (Lock : 0.4s)
  lockDuration: 0.4,
  lockBracketTighten: 16,
  lockBracketExpand: 24,
  lockScalePunch: 0.05,
  overlayExitDuration: 0.35,
  // 3. Transition vers artifact (Burst : 0.6s) — Total = 1.6s
  burstDuration: 0.6,
  burstZoom: 1.8,
  burstRepulse: 40000,
  burstEasing: "easeInQuad",
  // 4. Retour vers la page de base
  repulseReturnDelay: 0.25,
};
