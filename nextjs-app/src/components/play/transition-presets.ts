/**
 * Fonctions d'easing et description de la timeline de transition.
 *
 * La transition n'est plus une chaîne de phases qui se passent le relais mais
 * une **timeline unique** : une seule horloge `t` (secondes depuis la fin du
 * hold) et des *pistes* qui se chevauchent. Chaque grandeur animée est une
 * fonction continue de `t`, donc il n'existe plus de frontière où la vitesse
 * retombe à zéro — c'était la cause des à-coups de l'ancienne machine à états.
 *
 * Cf. `transition-timeline.ts` pour l'échantillonnage.
 */

export type EasingName =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInCubic"
  | "easeOutCubic"
  | "easeInOutQuad"
  | "easeInOutCubic"
  | "easeInOutQuint"
  | "easeOutExpo"
  | "easeOutQuint";

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  /**
   * Départ et arrivée à vitesse nulle avec un ventre plus marqué qu'en cubique :
   * c'est la courbe du rouleau, qui doit naître du calme, filer, puis se poser.
   */
  easeInOutQuint: (t) =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
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

/** Une piste de la timeline : quand elle démarre, combien de temps elle dure. */
export type TrackSpec = {
  start: number;
  duration: number;
  easing: EasingName;
};

/** Avancement brut 0..1 d'une piste à l'instant `t`, sans easing. */
export function trackRaw(track: TrackSpec, t: number): number {
  const u = (t - track.start) / Math.max(0.0001, track.duration);
  return u <= 0 ? 0 : u >= 1 ? 1 : u;
}

/** Avancement 0..1 d'une piste à l'instant `t`, easing appliqué. */
export function trackAt(track: TrackSpec, t: number): number {
  return evaluateEasing(track.easing, trackRaw(track, t));
}

export type TransitionPresetName = "cinematic" | "snappy" | "dramatic" | "custom";

export type TransitionConfig = {
  preset: TransitionPresetName;

  // ── 0. Hold — hors timeline, sa durée appartient à l'utilisateur ─────────
  selectDuration: number; // Durée du maintien avant déclenchement (ex: 0.6s)
  selectZoom: number; // Zoom caméra atteint en fin de hold (× zoom de base)
  selectScale: number; // Grossissement de la tuile visée (ex: 1.0)
  selectRepulse: number; // Écartement doux des voisins pendant le hold (ex: 200)
  selectEasing: EasingName;

  // ── 1. Pistes de la timeline — `start` et `duration` en secondes ─────────
  lock: TrackSpec; // Brackets : pincement, expansion, fondu
  scatter: TrackSpec; // Dispersion et fondu de la mosaïque
  reveal: TrackSpec; // M0 : taille de tuile → taille de colonne
  hero: TrackSpec; // Caméra : zoom de hold → sommet de l'arc (M0 plein cadre)
  scroll: TrackSpec; // Rouleau unifié : émergence, 777, atterrissage
  slide: TrackSpec; // Offset d'entrée des cartes secondaires
  columnFade: TrackSpec; // Opacité des cartes secondaires
  dezoom: TrackSpec; // Caméra : sommet de l'arc → vue détail + cadrage colonne
  exit: TrackSpec; // Retour vers la mosaïque

  // ── 2. Amplitudes ────────────────────────────────────────────────────────
  lockBracketShrink: number; // Rétractation des brackets vers l'intérieur (px, ex: 12)
  lockImageShrink: number; // Rétractation de l'image (0..0.3, ex: 0.08 = scale 0.92)
  lockBracketTighten: number; // Pincement des brackets vers l'intérieur (px)
  lockBracketExpand: number; // Expansion vers l'extérieur pendant le fondu (px)
  lockScalePunch: number; // Micro-rebond de confirmation sur la tuile
  overlayExitDuration: number; // Durée d'évacuation de la vague de sélection (s)
  scatterDistance: number; // Écartement radial final de la mosaïque (unités monde)
  heroZoom: number; // Sommet de l'arc, en multiple du zoom de détail (ex: 1.05×)
  detailZoom: number; // Zoom de la vue détail stabilisée (× zoom de base)
  spinMediaCount: number; // Nombre de médias à faire défiler pendant le rouleau
  spinEasing: EasingName; // Easing dédié pour le rouleau
  wheelMotionBlur: boolean; // Flou de mouvement sur les cartes pendant le spin / scroll rapide
  wheelMotionBlurStrength: number; // Multiplicateur d'intensité du flou (ex: 1.0)
  wheelMotionBlurMax: number; // Plafond maximal de flou en espace UV (ex: 0.08)
  slideOffset: number; // Amplitude d'entrée des cartes secondaires (unités monde)
  textRevealAt: number; // Instant d'apparition du panneau de texte (s)
  maxMediaWidthRatio: number; // Largeur max autorisée du média (% écran, ex: 0.38)
  maxMediaHeightRatio: number; // Hauteur max autorisée du média (% écran, ex: 0.78)

  // ── 3. Vue détail & Wheel Arc ─────────────────────────────────────────────
  detailColumnRatio: number; // Position horizontale du centre de la colonne
  arcCurvature: number; // Décalage en arc (px) : centre vers l'intérieur, extrémités vers l'extérieur
  arcRotation: number; // Rotation des médias vers l'extérieur de l'écran (degrés)
  snapEnabled: boolean; // Aimantation du média le plus proche au centre à l'arrêt du scroll
  snapStrength: number; // Vitesse de rappel magnétique
  snapDelay: number; // Délai d'inactivité avant le déclenchement du snap (s)
  snapThreshold: number; // Seuil de vélocité pour déclencher le snap
  desktopMediaWidthRatio: number; // Largeur des médias sur desktop (% écran)
  mobileMediaHeightRatio: number; // Hauteur des médias sur mobile (% écran)
  mediaGap: number; // Espace entre médias consécutifs (px écran)
  detailScrollDamping: number; // Amortissement du défilement infini
  detailScrollSpeed: number; // Multiplicateur de vitesse de défilement

  // ── 4. Retour ────────────────────────────────────────────────────────────
  exitSlideOffset: number; // Glissement des secondaires à la sortie (unités monde)
  repulseReturnDelay: number; // Délai avant le retour de la mosaïque (s)
  cameraReturnDelay: number; // Délai avant le recentrage caméra (s)
};

/**
 * La chorégraphie de référence. Les pistes se recouvrent volontairement :
 * `scatter` démarre avant la fin de `lock`, `dezoom` pendant que `scroll`
 * tourne encore. C'est ce recouvrement qui fait tenir la séquence en ~2,1s
 * là où l'enchaînement séquentiel en demandait 3,5 — sans rien accélérer.
 */
const BASE_TRACKS = {
  lock: { start: 0.0, duration: 0.42, easing: "linear" },
  scatter: { start: 0.18, duration: 0.65, easing: "easeOutCubic" },
  reveal: { start: 0.35, duration: 0.65, easing: "easeOutCubic" },
  hero: { start: 0.35, duration: 0.7, easing: "easeOutCubic" },
  columnFade: { start: 0.38, duration: 0.45, easing: "easeOutQuad" },
  slide: { start: 0.38, duration: 0.65, easing: "easeOutCubic" },
  scroll: { start: 0.42, duration: 2.0, easing: "easeInOutCubic" },
  dezoom: { start: 1.45, duration: 1.25, easing: "easeInOutCubic" },
  exit: { start: 0.0, duration: 0.6, easing: "easeInOutCubic" },
} as const satisfies Record<string, TrackSpec>;

export type TrackName = keyof typeof BASE_TRACKS;

export const TRACK_NAMES = Object.keys(BASE_TRACKS) as TrackName[];

/** Copie des pistes avec toutes les durées et tous les départs mis à l'échelle. */
function scaleTracks(
  speed: number,
  overrides: Partial<Record<TrackName, Partial<TrackSpec>>> = {},
): Record<TrackName, TrackSpec> {
  const out = {} as Record<TrackName, TrackSpec>;
  for (const name of TRACK_NAMES) {
    const base = BASE_TRACKS[name];
    out[name] = {
      start: Number((base.start * speed).toFixed(3)),
      duration: Number((base.duration * speed).toFixed(3)),
      easing: base.easing,
      ...overrides[name],
    };
  }
  return out;
}

/** Duplique une config sans partager les objets `TrackSpec` avec la source. */
export function cloneTransitionConfig(config: TransitionConfig): TransitionConfig {
  const clone = { ...config };
  for (const name of TRACK_NAMES) {
    clone[name] = { ...config[name] };
  }
  return clone;
}

/** Instant auquel la dernière piste de la séquence d'entrée se termine. */
export function timelineEnd(config: TransitionConfig): number {
  let end = 0;
  for (const name of TRACK_NAMES) {
    if (name === "exit") continue;
    const track = config[name];
    end = Math.max(end, track.start + track.duration);
  }
  return Math.max(0.05, end);
}

const BASE_AMPLITUDES = {
  lockBracketShrink: 12,
  lockImageShrink: 0.08,
  lockBracketTighten: 12,
  lockBracketExpand: 0,
  lockScalePunch: 0.02,
  overlayExitDuration: 0.35,
  scatterDistance: 2800,
  heroZoom: 1.05,
  detailZoom: 1.8,
  spinMediaCount: 8,
  spinEasing: "easeInOutCubic" as EasingName,
  wheelMotionBlur: true,
  wheelMotionBlurStrength: 1.0,
  wheelMotionBlurMax: 0.08,
  slideOffset: 680,
  textRevealAt: 2.55,
  detailColumnRatio: 0.6,
  arcCurvature: -16,
  arcRotation: 2,
  snapEnabled: true,
  snapStrength: 10,
  snapDelay: 0.15,
  snapThreshold: 0.05,
  desktopMediaWidthRatio: 0.34,
  mobileMediaHeightRatio: 0.44,
  maxMediaWidthRatio: 0.38,
  maxMediaHeightRatio: 0.78,
  mediaGap: 32,
  detailScrollDamping: 12,
  detailScrollSpeed: 1,
  exitSlideOffset: 350,
  repulseReturnDelay: 0.25,
  cameraReturnDelay: 0.0,
};

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  preset: "custom",
  selectDuration: 0.6,
  selectZoom: 1.06,
  selectScale: 1,
  selectRepulse: 200,
  selectEasing: "easeOutQuint",
  ...BASE_AMPLITUDES,
  ...scaleTracks(1),
};

export const TRANSITION_PRESETS: Record<
  Exclude<TransitionPresetName, "custom">,
  Omit<TransitionConfig, "preset">
> = {
  cinematic: {
    selectDuration: 0.8,
    selectZoom: 1.15,
    selectScale: 1.06,
    selectRepulse: 600,
    selectEasing: "easeInQuad",
    ...BASE_AMPLITUDES,
    heroZoom: 1.5,
    textRevealAt: 2.7,
    ...scaleTracks(1.1),
  },
  snappy: {
    selectDuration: 0.5,
    selectZoom: 1.18,
    selectScale: 1.08,
    selectRepulse: 800,
    selectEasing: "easeOutQuad",
    ...BASE_AMPLITUDES,
    lockBracketTighten: 8,
    lockBracketExpand: 12,
    lockScalePunch: 0.03,
    overlayExitDuration: 0.22,
    heroZoom: 1.35,
    spinMediaCount: 20,
    textRevealAt: 1.9,
    detailScrollDamping: 14,
    detailScrollSpeed: 1.2,
    repulseReturnDelay: 0.1,
    ...scaleTracks(0.78, {
      scroll: { start: 0.95, duration: 1.4, easing: "easeInOutCubic" },
      dezoom: { start: 1.4, duration: 1.15, easing: "easeInOutCubic" },
    }),
  },
  dramatic: {
    selectDuration: 0.9,
    selectZoom: 1.12,
    selectScale: 1.04,
    selectRepulse: 350,
    selectEasing: "easeInCubic",
    ...BASE_AMPLITUDES,
    lockBracketExpand: 16,
    lockScalePunch: 0.025,
    overlayExitDuration: 0.4,
    scatterDistance: 3400,
    heroZoom: 1.65,
    spinMediaCount: 40,
    slideOffset: 350,
    textRevealAt: 3.4,
    desktopMediaWidthRatio: 0.36,
    mobileMediaHeightRatio: 0.5,
    mediaGap: 36,
    detailScrollDamping: 10,
    detailScrollSpeed: 0.9,
    exitSlideOffset: 400,
    ...scaleTracks(1.4),
  },
};
