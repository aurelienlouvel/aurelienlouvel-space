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
  burstDelay: number; // Délai d'attente après le lock avant de lancer le burst (ex: 0.25s)
  lockBracketTighten: number; // Pincement des brackets vers l'intérieur en px (ex: 6px)
  lockBracketExpand: number; // Expansion vers l'extérieur lors du fade out en px (ex: 10px)
  lockScalePunch: number; // Intensité du rebond / scale punch de confirmation (ex: 0.02)
  overlayExitDuration: number; // Durée d'évacuation de l'overlay vague (ex: 0.5s)

  // ── 3. Transition Burst & Apparition des médias ─────────────────
  burstDuration: number; // Durée de la transition initiale et apparition (ex: 0.6s)
  reelStartDelay: number; // Pause après apparition avant de démarrer le rouleau (ex: 0.0s)
  burstSlideOffset: number; // Distance de glissement vertical lors de l'apparition (ex: 400px)
  burstRepulse: number; // Répulsion radiale des autres médias (ex: 40000)
  burstEasing: EasingName;

  // ── 3b. Machine à sous 777 (Slot machine reel spin - 3 tours) ────
  reelDuration: number; // Durée du défilement des tours (ex: 1.4s)
  reelLoops: number; // Nombre de tours de rouleau (ex: 3)
  reelEasing: EasingName; // Easing du rouleau (ex: "easeInOutCubic")
  reelEndDelay: number; // Pause de confirmation sur le média gagnant avant le dézoom (ex: 0.15s)

  // ── 3c. Dézoom & Décalage vers la gauche (Révélation Texte) ──────
  dezoomDuration: number; // Durée du dézoom et glissement à gauche (ex: 0.75s)
  dezoomEasing: EasingName; // Easing du dézoom (ex: "easeInOutCubic")
  textRevealDelay: number; // Délai avant la révélation du panneau texte lors du dézoom (ex: 0.1s)
  burstZoom: number; // Facteur de zoom caméra appliqué en vue détail (ex: 1.8x)
  detailColumnRatio: number; // Position horizontale du centre de la colonne (ex: 0.50 = 50%)
  desktopMediaWidthRatio: number; // Largeur des médias sur desktop (ex: 0.34 = 34% de l'écran)
  mobileMediaHeightRatio: number; // Hauteur des médias sur mobile (ex: 0.48 = 48% de l'écran)
  mediaGap: number; // Espace entre médias consécutifs en px (ex: 32)
  detailScrollDamping: number; // Amortissement fluide du défilement infini (ex: 12)
  detailScrollSpeed: number; // Multiplicateur de vitesse de défilement (ex: 1.0)

  // ── 4. Retour vers la page de base (Exit / Return) ─────────────────
  exitDuration: number; // Durée de retour au canvas (ex: 0.6s)
  exitSlideOffset: number; // Glissement des secondaires vers le bas lors de la sortie (ex: 350)
  exitEasing: EasingName; // Easing du retour
  repulseReturnDelay: number; // Délai avant que la répulsion des voisins ne revienne à zéro (ex: 0.25s)
  cameraReturnDelay: number; // Délai avant le recentrage caméra au retour (ex: 0.0s)
};

export const TRANSITION_PRESETS: Record<Exclude<TransitionPresetName, "custom">, Omit<TransitionConfig, "preset">> = {
  cinematic: {
    selectDuration: 0.8,
    selectZoom: 1.15,
    selectScale: 1.06,
    selectRepulse: 600,
    selectEasing: "easeInQuad",
    lockDuration: 0.7,
    burstDelay: 0.35,
    lockBracketTighten: 5,
    lockBracketExpand: 10,
    lockScalePunch: 0.02,
    overlayExitDuration: 0.6,
    burstDuration: 0.8,
    reelStartDelay: 0.1,
    burstSlideOffset: 400,
    burstRepulse: 40000,
    burstEasing: "easeInOutCubic",
    reelDuration: 1.6,
    reelLoops: 3,
    reelEasing: "easeInOutCubic",
    reelEndDelay: 0.2,
    dezoomDuration: 0.85,
    dezoomEasing: "easeInOutCubic",
    textRevealDelay: 0.15,
    burstZoom: 1.8,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.34,
    mobileMediaHeightRatio: 0.48,
    mediaGap: 32,
    detailScrollDamping: 12,
    detailScrollSpeed: 1.0,
    exitDuration: 0.7,
    exitSlideOffset: 350,
    exitEasing: "easeInOutCubic",
    repulseReturnDelay: 0.2,
    cameraReturnDelay: 0.05,
  },
  snappy: {
    selectDuration: 0.5,
    selectZoom: 1.18,
    selectScale: 1.08,
    selectRepulse: 800,
    selectEasing: "easeOutQuad",
    lockDuration: 0.45,
    burstDelay: 0.12,
    lockBracketTighten: 8,
    lockBracketExpand: 12,
    lockScalePunch: 0.03,
    overlayExitDuration: 0.38,
    burstDuration: 0.5,
    reelStartDelay: 0.0,
    burstSlideOffset: 400,
    burstRepulse: 40000,
    burstEasing: "easeOutExpo",
    reelDuration: 1.1,
    reelLoops: 3,
    reelEasing: "easeOutExpo",
    reelEndDelay: 0.1,
    dezoomDuration: 0.6,
    dezoomEasing: "easeOutExpo",
    textRevealDelay: 0.05,
    burstZoom: 1.8,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.34,
    mobileMediaHeightRatio: 0.48,
    mediaGap: 32,
    detailScrollDamping: 14,
    detailScrollSpeed: 1.2,
    exitDuration: 0.45,
    exitSlideOffset: 300,
    exitEasing: "easeOutExpo",
    repulseReturnDelay: 0.1,
    cameraReturnDelay: 0.0,
  },
  dramatic: {
    selectDuration: 0.9,
    selectZoom: 1.12,
    selectScale: 1.04,
    selectRepulse: 350,
    selectEasing: "easeInCubic",
    lockDuration: 0.8,
    burstDelay: 0.4,
    lockBracketTighten: 6,
    lockBracketExpand: 12,
    lockScalePunch: 0.025,
    overlayExitDuration: 0.7,
    burstDuration: 1.0,
    reelStartDelay: 0.2,
    burstSlideOffset: 450,
    burstRepulse: 50000,
    burstEasing: "easeOutQuint",
    reelDuration: 1.8,
    reelLoops: 3,
    reelEasing: "easeOutQuint",
    reelEndDelay: 0.3,
    dezoomDuration: 1.0,
    dezoomEasing: "easeOutQuint",
    textRevealDelay: 0.25,
    burstZoom: 1.8,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.36,
    mobileMediaHeightRatio: 0.50,
    mediaGap: 36,
    detailScrollDamping: 10,
    detailScrollSpeed: 0.9,
    exitDuration: 0.85,
    exitSlideOffset: 400,
    exitEasing: "easeOutQuint",
    repulseReturnDelay: 0.25,
    cameraReturnDelay: 0.1,
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
  burstDelay: 0.25,
  lockBracketTighten: 6,
  lockBracketExpand: 10,
  lockScalePunch: 0.02,
  overlayExitDuration: 0.5,

  // 3. Transition initiale & Apparition des médias (0.6s)
  burstDuration: 0.6,
  reelStartDelay: 0.0,
  burstSlideOffset: 400,
  burstRepulse: 40000,
  burstEasing: "easeInQuad",

  // 3b. Machine à sous 777 (3 tours : 1.4s)
  reelDuration: 1.4,
  reelLoops: 3,
  reelEasing: "easeInOutCubic",
  reelEndDelay: 0.15,

  // 3c. Dézoom & Révélation Texte (0.75s)
  dezoomDuration: 0.75,
  dezoomEasing: "easeInOutCubic",
  textRevealDelay: 0.1,
  burstZoom: 1.8,
  detailColumnRatio: 0.5,
  desktopMediaWidthRatio: 0.34,
  mobileMediaHeightRatio: 0.48,
  mediaGap: 32,
  detailScrollDamping: 12,
  detailScrollSpeed: 1,

  // 4. Retour vers la page de base (Exit / Return : 0.6s)
  exitDuration: 0.6,
  exitSlideOffset: 350,
  exitEasing: "easeInOutCubic",
  repulseReturnDelay: 0.25,
  cameraReturnDelay: 0.0,
};
