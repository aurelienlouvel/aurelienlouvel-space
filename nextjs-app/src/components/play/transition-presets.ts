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
  lockDuration: number; // Durée totale de l'animation de lock (ex: 0.6s)
  lockBracketTighten: number; // Pincement des brackets vers l'intérieur en px (ex: 6px)
  lockBracketExpand: number; // Expansion vers l'extérieur lors du fade out en px (ex: 10px)
  lockScalePunch: number; // Intensité du rebond / scale punch de confirmation (ex: 0.02)
  overlayExitDuration: number; // Durée d'évacuation de l'overlay vague (ex: 0.5s)
  burstDelay: number; // Délai d'attente après l'animation avant de lancer la transition (ex: 0.25s)

  // ── 3. Transition vers la page artifact (Burst / Dezoom) ────────
  burstDuration: number; // Durée de la transition vers la vue détaillée (ex: 0.8s)
  burstZoom: number; // Dézoom multiplicateur appliqué au baseZoom (ex: 0.85x)
  detailColumnRatio: number; // Largeur relative de la colonne média (ex: 0.40 = 40% média / 60% infos)
  desktopMediaWidthRatio: number; // Largeur des médias sur desktop (ex: 0.24 = 24% de la largeur d'écran)
  mobileMediaHeightRatio: number; // Hauteur des médias sur mobile (ex: 0.48 = 48% de la hauteur d'écran)
  burstRepulse: number; // Répulsion radiale des autres médias (ex: 40000)
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
    lockDuration: 0.7,
    lockBracketTighten: 5,
    lockBracketExpand: 10,
    lockScalePunch: 0.02,
    overlayExitDuration: 0.6,
    burstDelay: 0.35,
    burstDuration: 1.0,
    burstZoom: 0.85,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.24,
    mobileMediaHeightRatio: 0.48,
    burstRepulse: 40000,
    burstEasing: "easeInOutCubic",
    repulseReturnDelay: 0.3,
  },
  snappy: {
    selectDuration: 0.5,
    selectZoom: 1.18,
    selectScale: 1.08,
    selectRepulse: 800,
    selectEasing: "easeOutQuad",
    lockDuration: 0.45,
    lockBracketTighten: 8,
    lockBracketExpand: 12,
    lockScalePunch: 0.03,
    overlayExitDuration: 0.38,
    burstDelay: 0.12,
    burstDuration: 0.6,
    burstZoom: 0.90,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.24,
    mobileMediaHeightRatio: 0.48,
    burstRepulse: 40000,
    burstEasing: "easeOutExpo",
    repulseReturnDelay: 0.15,
  },
  dramatic: {
    selectDuration: 0.9,
    selectZoom: 1.12,
    selectScale: 1.04,
    selectRepulse: 350,
    selectEasing: "easeInCubic",
    lockDuration: 0.8,
    lockBracketTighten: 6,
    lockBracketExpand: 12,
    lockScalePunch: 0.025,
    overlayExitDuration: 0.7,
    burstDelay: 0.4,
    burstDuration: 1.2,
    burstZoom: 0.80,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.24,
    mobileMediaHeightRatio: 0.48,
    burstRepulse: 50000,
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
  // 2. Animation de select (Lock : 0.6s) — très léger et calme
  lockDuration: 0.6,
  lockBracketTighten: 6,
  lockBracketExpand: 10,
  lockScalePunch: 0.02,
  overlayExitDuration: 0.5,
  burstDelay: 0.25,
  // 3. Transition vers artifact (Burst & Dezoom : 0.8s)
  burstDuration: 0.8,
  burstZoom: 0.85,
  detailColumnRatio: 0.50,
  desktopMediaWidthRatio: 0.24,
  mobileMediaHeightRatio: 0.48,
  burstRepulse: 35000,
  burstEasing: "easeInOutCubic",
  // 4. Retour vers la page de base
  repulseReturnDelay: 0.25,
};
