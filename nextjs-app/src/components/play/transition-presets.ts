/**
 * Fonctions d'easing mathématiques et profils de transition (Presets).
 */

export type EasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutCubic"
  | "easeOutExpo"
  | "easeOutQuint";

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
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

  // ── 3. Burst (Isolement M0 & Répulsion Voisins Mosaïque) ─────────
  burstDuration: number; // Durée d'évacuation des voisins de la mosaïque (ex: 0.35s)
  burstRepulse: number; // Répulsion radiale des autres médias (ex: 40000)
  burstEasing: EasingName;

  // ── 4. Zoom Avant Focalisé sur M0 ──────────────────────────────
  mainZoomFactor: number; // Facteur multiplicateur de zoom avant sur M0 (ex: 1.28x)
  mainZoomDuration: number; // Durée du zoom avant sur M0 seule au centre (ex: 0.40s)
  mainZoomEasing: EasingName; // Easing du zoom avant (ex: "easeOutQuint")

  // ── 5. Pause Contemplative sur M0 ──────────────────────────────
  mainHoldDuration: number; // Pause contemplative sur M0 agrandie avant l'émergence (ex: 0.25s)

  // ── 6. Émergence de la Première Carte Inférieure ────────────────
  stackEntranceDuration: number; // Durée d'émergence de M1 en glissant sous M0 (ex: 0.35s)
  stackSlideOffset: number; // Amplitude de glissement vertical depuis le bas (ex: 350px)
  stackM0Rise: number; // Montée vers le haut de M0 lors de l'arrivée de M1 (ex: 90px)
  stackEntranceEasing: EasingName;

  // ── 7. Rouleau 777 & Dézoom Simultanés (Climax) ────────────────
  spinDezoomDuration: number; // Durée conjointe du rouleau 777 et du dézoom (ex: 1.5s)
  reelDuration: number; // Alias durée défilement (ex: 1.5s)
  reelLoops: number; // Nombre de tours de rouleau (ex: 3)
  spinEasing: EasingName; // Easing du défilement des cartes (ex: "easeInOutCubic")
  reelEasing: EasingName; // Alias easing défilement
  dezoomDuration: number; // Alias durée dézoom (ex: 1.5s)
  dezoomEasing: EasingName; // Easing du recul caméra (ex: "easeInOutCubic")
  textRevealDelay: number; // Délai avant apparition du texte pendant le spin (ex: 0.25s)
  reelEndDelay: number; // Pause de confirmation sur le média gagnant stabilisé (ex: 0.15s)

  // ── 8. Vue Détail & Courbure en Arc de Cercle 3D ───────────────
  burstZoom: number; // Facteur de cadrage caméra en vue détail (ex: 1.8x)
  detailColumnRatio: number; // Position horizontale du centre de la colonne (ex: 0.50 = 50%)
  desktopMediaWidthRatio: number; // Largeur des médias sur desktop (ex: 0.34 = 34% de l'écran)
  mobileMediaHeightRatio: number; // Hauteur des médias sur mobile (ex: 0.48 = 48% de l'écran)
  mediaGap: number; // Espace entre médias consécutifs en px (ex: 32)
  detailScrollDamping: number; // Amortissement fluide du défilement infini (ex: 12)
  detailScrollSpeed: number; // Multiplicateur de vitesse de défilement (ex: 1.0)
  arcRadius: number; // Rayon de l'arc cylindrique 3D (ex: 1800px)
  arcMaxAngleDeg: number; // Angle maximal d'inclinaison tangentielle en degrés (ex: 22°)
  arcCenterConvergence: number; // Intensité d'orientation vers le centre horizontal (ex: 0.12)

  // ── 9. Retour vers la page de base (Exit / Return) ─────────────
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
    burstDuration: 0.35,
    burstRepulse: 40000,
    burstEasing: "easeOutCubic",
    mainZoomFactor: 1.25,
    mainZoomDuration: 0.38,
    mainZoomEasing: "easeOutQuint",
    mainHoldDuration: 0.08,
    stackEntranceDuration: 0.34,
    stackSlideOffset: 260,
    stackM0Rise: 80,
    stackEntranceEasing: "easeInQuad",
    spinDezoomDuration: 1.45,
    reelDuration: 1.45,
    reelLoops: 2,
    spinEasing: "easeOutQuint",
    reelEasing: "easeOutQuint",
    dezoomDuration: 1.45,
    dezoomEasing: "easeInOutCubic",
    textRevealDelay: 0.30,
    reelEndDelay: 0.08,
    burstZoom: 1.8,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.34,
    mobileMediaHeightRatio: 0.48,
    mediaGap: 32,
    detailScrollDamping: 12,
    detailScrollSpeed: 1.0,
    arcRadius: 1800,
    arcMaxAngleDeg: 22,
    arcCenterConvergence: 0.12,
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
    burstDuration: 0.3,
    burstRepulse: 40000,
    burstEasing: "easeOutExpo",
    mainZoomFactor: 1.30,
    mainZoomDuration: 0.30,
    mainZoomEasing: "easeOutExpo",
    mainHoldDuration: 0.15,
    stackEntranceDuration: 0.25,
    stackSlideOffset: 320,
    stackM0Rise: 70,
    stackEntranceEasing: "easeOutExpo",
    spinDezoomDuration: 1.2,
    reelDuration: 1.2,
    reelLoops: 3,
    spinEasing: "easeOutExpo",
    reelEasing: "easeOutExpo",
    dezoomDuration: 1.2,
    dezoomEasing: "easeOutExpo",
    textRevealDelay: 0.15,
    reelEndDelay: 0.1,
    burstZoom: 1.8,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.34,
    mobileMediaHeightRatio: 0.48,
    mediaGap: 32,
    detailScrollDamping: 14,
    detailScrollSpeed: 1.2,
    arcRadius: 1600,
    arcMaxAngleDeg: 24,
    arcCenterConvergence: 0.14,
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
    burstDuration: 0.5,
    burstRepulse: 50000,
    burstEasing: "easeOutQuint",
    mainZoomFactor: 1.35,
    mainZoomDuration: 0.55,
    mainZoomEasing: "easeOutQuint",
    mainHoldDuration: 0.35,
    stackEntranceDuration: 0.45,
    stackSlideOffset: 400,
    stackM0Rise: 110,
    stackEntranceEasing: "easeOutQuint",
    spinDezoomDuration: 1.8,
    reelDuration: 1.8,
    reelLoops: 3,
    spinEasing: "easeOutQuint",
    reelEasing: "easeOutQuint",
    dezoomDuration: 1.8,
    dezoomEasing: "easeOutQuint",
    textRevealDelay: 0.4,
    reelEndDelay: 0.25,
    burstZoom: 1.8,
    detailColumnRatio: 0.50,
    desktopMediaWidthRatio: 0.36,
    mobileMediaHeightRatio: 0.50,
    mediaGap: 36,
    detailScrollDamping: 10,
    detailScrollSpeed: 0.9,
    arcRadius: 2000,
    arcMaxAngleDeg: 20,
    arcCenterConvergence: 0.10,
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

  // 2. Animation de select (Lock : 0.6s)
  lockDuration: 0.6,
  burstDelay: 0.25,
  lockBracketTighten: 6,
  lockBracketExpand: 10,
  lockScalePunch: 0.02,
  overlayExitDuration: 0.5,

  // 3. Burst (Isolement M0 & Répulsion Voisins Mosaïque : 0.35s)
  burstDuration: 0.35,
  burstRepulse: 40000,
  burstEasing: "easeOutCubic",

  // 4. Zoom Avant Focalisé sur M0 (0.38s)
  mainZoomFactor: 1.25,
  mainZoomDuration: 0.38,
  mainZoomEasing: "easeOutQuint",

  // 5. Pause Contemplative sur M0 (0.08s micro-breath)
  mainHoldDuration: 0.08,

  // 6. Émergence de la Première Carte Inférieure (0.34s)
  stackEntranceDuration: 0.34,
  stackSlideOffset: 260,
  stackM0Rise: 80,
  stackEntranceEasing: "easeInQuad",

  // 7. Rouleau 777 & Dézoom Simultanés (1.45s)
  spinDezoomDuration: 1.45,
  reelDuration: 1.45,
  reelLoops: 2,
  spinEasing: "easeOutQuint",
  reelEasing: "easeOutQuint",
  dezoomDuration: 1.45,
  dezoomEasing: "easeInOutCubic",
  textRevealDelay: 0.30,
  reelEndDelay: 0.08,

  // 8. Vue Détail & Courbure en Arc 3D
  burstZoom: 1.8,
  detailColumnRatio: 0.5,
  desktopMediaWidthRatio: 0.34,
  mobileMediaHeightRatio: 0.48,
  mediaGap: 32,
  detailScrollDamping: 12,
  detailScrollSpeed: 1,
  arcRadius: 1800,
  arcMaxAngleDeg: 22,
  arcCenterConvergence: 0.12,

  // 9. Retour vers la page de base (Exit / Return : 0.6s)
  exitDuration: 0.6,
  exitSlideOffset: 350,
  exitEasing: "easeInOutCubic",
  repulseReturnDelay: 0.25,
  cameraReturnDelay: 0.0,
};
