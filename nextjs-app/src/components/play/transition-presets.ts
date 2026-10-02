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

  // ── 0. Vague — la charge avant le boom, déclenchée par le clic ───────────
  waveDuration: number; // Durée de la vague de dégradé avant le boom (s)
  waveEasing: EasingName; // Courbe de la charge (accélère vers le boom)
  silenceDrift: number; // Dérive lente du zoom pendant l'attente (ex: 0.06)
  packShake: number; // Amplitude du tortillement de l'artifact pendant le chargement (rad, ex: 0.05)
  wiggleSpeed: number; // Vitesse du tortillement (rad/s)
  breathe: number; // Respiration du scale pendant le chargement (ex: 0.025)
  loadGrow: number; // Grossissement borné pendant le chargement (ex: 0.1)
  loadWaveSpeed: number; // Cycles/s de la vague qui boucle pendant le chargement
  burstPowerMin: number; // Puissance minimale du burst d'une tuile (× scatterDistance, ex: 0.5)
  burstPowerMax: number; // Puissance maximale du burst d'une tuile (× scatterDistance, ex: 1.5)
  burstAngleJitter: number; // Écart angulaire aléatoire de chaque tuile (rad)
  burstSeed: number; // Graine du tirage aléatoire du burst (changer = autre explosion)
  simulatedLoadMs: number; // Debug : délai artificiel ajouté au chargement du pack (ms)
  rewindDuration: number; // Durée du rewind de l'ouverture (s) : lent au début, rapide au milieu, lent à la fin
  rewindEasing: EasingName; // Courbe du rewind (easeInOut = effet cinématique)
  rewindDeckShare: number; // Part du rewind consacrée à défaire les cartes passées (0..0.8)
  rewindDeckPerCard: number; // Durée ajoutée par carte à défaire (s)
  fxBurstBoost: number; // Surintensité des éclats au moment du burst (×, 0 = aucune)

  // ── 1. Pistes de la timeline — `start` et `duration` en secondes ─────────
  lock: TrackSpec; // Impact : la carte se détache au boom
  scatter: TrackSpec; // Dispersion et fondu de la mosaïque
  reveal: TrackSpec; // M0 : taille de tuile → taille de colonne
  hero: TrackSpec; // Caméra : zoom de base → sommet de l'arc (M0 plein cadre)
  columnFade: TrackSpec; // Les cartes de la pile émergent de derrière la première
  dezoom: TrackSpec; // Caméra : sommet de l'arc → vue détail + cadrage colonne
  exit: TrackSpec; // Retour vers la mosaïque

  // ── 2. Amplitudes ────────────────────────────────────────────────────────
  lockScalePunch: number; // Détachement (scale) de la carte au lock — lift discret, sans rebond (ex: 0.08)
  overlayExitDuration: number; // Durée d'évacuation de la vague de sélection (s)
  scatterDistance: number; // Écartement radial final de la mosaïque (unités monde)
  approachZoom: number; // Zoom ABSOLU en fin d'approche, avant la vague (× zoom de base)
  detailZoom: number; // Zoom ABSOLU de la vue détail stabilisée (× zoom de base)
  navbarLead: number; // Avance du changement de navbar sur la fin du cadrage (s)
  textLead: number; // Avance de l'apparition du side panel sur la fin du cadrage (s)
  maxMediaWidthRatio: number; // Largeur max autorisée du média (% écran, ex: 0.38)
  maxMediaHeightRatio: number; // Hauteur max autorisée du média (% écran, ex: 0.78)

  // ── 3. Vue détail : la pile de cartes ─────────────────────────────────────
  detailColumnRatio: number; // Position horizontale du centre de la colonne
  desktopMediaWidthRatio: number; // Largeur des médias sur desktop (% écran)
  mobileMediaHeightRatio: number; // Hauteur des médias sur mobile (% écran)
  detailScrollDamping: number; // Amortissement du passage d'une carte à l'autre
  stackScale: number; // Échelle de chaque carte de plus dans la pile (ex: 0.9)
  stackPeek: number; // Décalage vers le haut de chaque carte de la pile (unités monde)
  stackDepth: number; // Nombre de layers visibles sous la première carte
  stackOpacity: number; // Opacité du premier layer sous la carte (0..1)
  stackOpacityFalloff: number; // Facteur d'opacité appliqué à chaque layer suivant (0..1)
  panelGradientStrength: number; // 0..1 — intensité du dégradé de fond du side panel
  panelGradientSpeed: number; // Vitesse de dérive du dégradé du side panel (×)
  panelGlitch: number; // 0..1 — intensité du glitch pixel en bas à droite (0 = coupé)
  cardExit: number; // Course de la carte qui s'en va, en hauteurs de carte
  stepCooldown: number; // Délai minimal entre deux cartes (s) : verrou après un changement
  deckPullDistance: number; // Défilement (px de molette) à fournir pour passer à la carte suivante
  deckResist: number; // Raideur de la résistance : la carte monte beaucoup au début puis de moins en moins (≥ 1)
  deckLift: number; // Course maximale de la carte pendant la traction (px écran)
  deckRelease: number; // Vitesse de retour de la carte quand on lâche avant le seuil (par seconde)
  deckHold: number; // Délai sans geste avant que la carte ne redescende (s)
  deckShimmer: number; // Éclats qui se décollent pendant la traction (0 = aucun)
  deckAimMix: number; // 0..1 — part de la visée (curseur / geste) dans la direction de la carte, le reste étant tout droit
  deckThrow: number; // Distance dont la carte part dans sa direction en se désagrégeant (px écran)
  deckSpin: number; // Rotation maximale de la carte lancée (degrés), selon sa direction
  deckTilt: number; // Inclinaison 3D maximale de la carte et des layers selon la souris (degrés, négatif = inverse)
  deckTiltLayerGain: number; // Inclinaison supplémentaire des layers plus profonds (× par niveau)
  deckTiltSmooth: number; // Raideur de l'inclinaison (par seconde)
  deckDissolve: number; // Courbe d'évanouissement de la carte qui part (1 = linéaire, 2 = tardive)
  dragPxPerCard: number; // Distance de drag (px) pour passer une carte

  // ── 4. Retour ────────────────────────────────────────────────────────────
  repulseReturnDelay: number; // Délai avant le retour de la mosaïque (s)
  cameraReturnDelay: number; // Délai avant le recentrage caméra (s)

  // ── 5. Positionnement du texte en paysage ──────────────────────────────────
  landscapeTextWidthRatio: number; // Largeur du panneau texte en % écran (ex: 0.5)
  landscapeTextRightOffset: number; // Décalage depuis le bord droit (px, ex: 0)
  landscapeTextTopOffset: number; // Décalage vertical depuis le centre/haut (px, ex: 0)
  landscapeTextMaxWidth: number; // Largeur max du bloc de texte en px (ex: 576)

  // ── 6. Wheel en format portrait ───────────────────────────────────────────
};

/**
 * La chorégraphie de référence : une charge, un coup, un silence.
 *
 * Le clic lance tout, sans hold. Les pistes ci-dessous sont comptées à partir
 * du boom (`waveDuration` après le clic).
 *
 * -  Avant : la vague de dégradé balaie la tuile en accélérant, l'image se
 *    déforme sous la crête. Rien d'autre ne bouge.
 * 1. 0.0s - 0.7s : BOOM. La mosaïque explose (dispersion + fondu en expo-out),
 *    la caméra file vers le plein cadre, la carte se détache puis prend sa taille.
 * 2. 0.7s - 1.9s : SILENCE au ralenti. Carte seule, dérive de zoom à peine
 *    perceptible.
 * 3. 1.9s - 2.6s : les cartes secondaires apparaissent et glissent en dessous.
 * 4. 2.3s - 4.2s : roulement de la roue (wheel spin) + cadrage colonne.
 * Le side panel et la navbar arrivent juste avant la fin du roulement.
 */
const BASE_TRACKS = {
  lock: { start: 0.0, duration: 0.45, easing: "linear" },
  scatter: { start: 0.32, duration: 2, easing: "easeOutExpo" },
  reveal: { start: 0.0, duration: 0.6, easing: "easeOutQuint" },
  hero: { start: 0.0, duration: 0.9, easing: "easeInOutCubic" },
  columnFade: { start: 0.25, duration: 1.1, easing: "easeOutCubic" },
  dezoom: { start: 0.1, duration: 1.1, easing: "easeInOutCubic" },
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

/**
 * Instant où la timeline attend le chargement : le burst a eu lieu, la vague
 * n'a pas encore traversé l'artifact. Les pistes `hero` et `scatter` sont
 * absolues (avant ce point) ; les autres sont comptées après la vague.
 */
export function holdTime(config: TransitionConfig): number {
  return Math.max(
    config.hero.start + config.hero.duration,
    config.scatter.start + config.scatter.duration * 0.6,
  );
}

/** Instant (absolu) où la vague a fini de traverser l'artifact. */
export function passEndTime(config: TransitionConfig): number {
  return holdTime(config) + Math.max(0.05, config.waveDuration);
}

/** Instant auquel la dernière piste de la séquence d'entrée se termine. */
export function timelineEnd(config: TransitionConfig): number {
  let end = 0;
  for (const name of ["lock", "reveal", "columnFade", "dezoom"] as const) {
    const track = config[name];
    end = Math.max(end, track.start + track.duration);
  }
  return passEndTime(config) + Math.max(0.05, end);
}

/** Instant (absolu) où la caméra a fini de cadrer la pile. */
export function scrollEndTime(config: TransitionConfig): number {
  return passEndTime(config) + config.dezoom.start + config.dezoom.duration;
}

const BASE_AMPLITUDES = {
  waveDuration: 1.1,
  waveEasing: "easeInOutCubic" as EasingName,
  silenceDrift: 0.145,
  packShake: 0.125,
  wiggleSpeed: 7,
  breathe: 0.025,
  loadGrow: 0.1,
  loadWaveSpeed: 0.9,
  burstPowerMin: 0.1,
  burstPowerMax: 1,
  burstAngleJitter: 0,
  burstSeed: 1,
  simulatedLoadMs: 0,
  rewindDuration: 1.4,
  rewindEasing: "easeInOutQuint" as EasingName,
  rewindDeckShare: 0.4,
  rewindDeckPerCard: 0.15,
  fxBurstBoost: 1,
  lockScalePunch: 0.08,
  overlayExitDuration: 0.35,
  scatterDistance: 1000,
  approachZoom: 1.8,
  detailZoom: 1.8,
  navbarLead: 0.3,
  textLead: 0.2,
  detailColumnRatio: 0.6,
  desktopMediaWidthRatio: 0.34,
  mobileMediaHeightRatio: 0.48,
  maxMediaWidthRatio: 0.38,
  maxMediaHeightRatio: 0.74,
  detailScrollDamping: 8,
  stackScale: 0.9,
  stackPeek: 22,
  stackDepth: 4,
  stackOpacity: 0.55,
  stackOpacityFalloff: 0.55,
  panelGradientStrength: 0.65,
  panelGradientSpeed: 1.8,
  panelGlitch: 0.6,
  cardExit: 0.7,
  stepCooldown: 0.55,
  deckPullDistance: 1030,
  deckResist: 2.6,
  deckLift: 135,
  deckRelease: 9,
  deckHold: 0.14,
  deckShimmer: 0.5,
  deckAimMix: 0.8,
  deckThrow: 180,
  deckSpin: 12,
  deckTilt: 7,
  deckTiltLayerGain: 0.35,
  deckTiltSmooth: 8,
  deckDissolve: 3.6,
  dragPxPerCard: 580,
  repulseReturnDelay: 0.25,
  cameraReturnDelay: 0.0,
  landscapeTextWidthRatio: 0.42,
  landscapeTextRightOffset: 0,
  landscapeTextTopOffset: 0,
  landscapeTextMaxWidth: 576,
};

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  preset: "custom",
  ...BASE_AMPLITUDES,
  ...scaleTracks(1),
};

export const TRANSITION_PRESETS: Record<
  Exclude<TransitionPresetName, "custom">,
  Omit<TransitionConfig, "preset">
> = {
  cinematic: {
    ...BASE_AMPLITUDES,
    waveDuration: 1.3,
    approachZoom: 2.7,
    ...scaleTracks(1.1),
  },
  snappy: {
    ...BASE_AMPLITUDES,
    waveDuration: 0.8,
    lockScalePunch: 0.11,
    overlayExitDuration: 0.22,
    approachZoom: 2.4,
    detailScrollDamping: 14,
    repulseReturnDelay: 0.1,
    ...scaleTracks(0.78),
  },
  dramatic: {
    ...BASE_AMPLITUDES,
    waveDuration: 1.6,
    lockScalePunch: 0.1,
    overlayExitDuration: 0.4,
    scatterDistance: 3400,
    approachZoom: 3,
    desktopMediaWidthRatio: 0.36,
    mobileMediaHeightRatio: 0.5,
    detailScrollDamping: 10,
    ...scaleTracks(1.4),
  },
};
