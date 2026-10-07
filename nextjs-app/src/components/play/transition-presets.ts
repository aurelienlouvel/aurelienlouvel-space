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

/**
 * Façon de sortir d'un pack ouvert :
 * - `clean` : chaque grandeur glisse vers le repos depuis l'état exact où elle était, chacune
 *   dans sa fenêtre (cf. `sampleRewind`) ; pas de vague, pas de torsion, pas d'éclats.
 * - `film`  : l'ouverture se rejoue à l'envers (le temps de la timeline recule).
 */
export type RewindMode = "clean" | "film";

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
  rewindLayerFade: number; // Retour : durée (s) de la disparition des cartes derrière la carte gardée
  rewindMode: RewindMode; // Retour : « clean » (glissement vers le repos) ou « film » (l'ouverture rejouée à l'envers)
  rewindStagger: number; // Retour « clean » : 0..1 — décalage entre la caméra, la carte et la mosaïque (0 = ensemble, 1 = l'un après l'autre)
  rewindCalm: number; // Retour « film » : 0..1 — part de la torsion, des éclats et de la vague étouffée dès le début du retour
  fxBurstBoost: number; // Surintensité des éclats au moment du burst (×, 0 = aucune)
  twistSettleStart: number; // Fin du tortillement : début du retour à plat, en s après la fin de la vague (négatif = pendant la vague)
  twistSettle: number; // Fin du tortillement : durée (s) du retour à plat de la torsion, de la bascule et du gonflement
  twistSettleEasing: EasingName; // Fin du tortillement : courbe du retour à plat (easeInOut = départ et arrivée doux)
  twistSettleBlend: number; // 0..1 — part du détachement du boom qui s'ajoute au gonflement encore présent (0 = le plus grand des deux, 1 = les deux s'additionnent)

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
  arrivalDip: number; // Arrivée : part du zoom dont la caméra recule dès que le pack est chargé, avant de revenir au cadrage (0 = aucun recul)
  arrivalStart: number; // Arrivée : retard du recul sur le moment où le pack est chargé (s)
  arrivalEasing: EasingName; // Arrivée : courbe du recul (easeInOut = départ et arrivée doux)
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
  stackSaturation: number; // Saturation des layers derrière la carte du dessus (1 = couleurs d'origine, 0 = noir et blanc)
  panelGradientStrength: number; // 0..1 — intensité du dégradé de fond du side panel
  panelGradientSpeed: number; // Vitesse de dérive du dégradé du side panel (×)
  panelGlitch: number; // 0..1 — opacité des pixels qui scintillent en bas à droite (0 = coupés)
  ambientPixels: number; // Pixels de fond tant que le pack est ouvert : nombre (0 = aucun)
  ambientOpacity: number; // 0..1 — opacité des pixels de fond (très discrets)
  ambientSize: number; // Côté maximal d'un pixel de fond (unités monde), le plus petit fait 35 % de ce côté
  ambientTravel: number; // Distance de dérive d'un pixel de fond, de sa naissance à sa disparition (unités monde)
  ambientSpeed: number; // Cycles de vie par seconde des pixels de fond (0.1 = un pixel vit 10 s)
  ambientFade: number; // Apparition de la couche à l'ouverture du pack, et changement de carte (s) ; la sortie va deux fois plus vite
  cardExit: number; // Course de la carte qui s'en va, en hauteurs de carte
  stepCooldown: number; // Délai minimal entre deux cartes (s) : verrou après un changement
  deckPullDistance: number; // Défilement (px de molette) à fournir pour passer à la carte suivante
  deckResist: number; // Raideur de la résistance : la carte monte beaucoup au début puis de moins en moins (≥ 1)
  deckLift: number; // Course maximale de la carte pendant la traction (px écran)
  deckRelease: number; // Vitesse de retour de la carte quand on lâche avant le seuil (par seconde, 0 = elle reste où on l'a laissée)
  deckHold: number; // Délai sans geste avant que la carte ne retombe (s) ; sans effet quand deckRelease vaut 0
  deckInvertX: boolean; // Inverse l'axe horizontal des gestes (molette, drag, flèches) : par défaut le contenu défile, la carte part à gauche quand on défile vers la droite
  deckInvertY: boolean; // Inverse l'axe vertical des gestes : par défaut la carte monte quand on défile vers le bas
  deckShimmer: number; // Éclats qui se décollent pendant la traction (0 = aucun)
  deckDissolveAmount: number; // 0..1 — part de la carte désagrégée quand elle est tirée au maximum
  deckCellCols: number; // Nombre de zones (carrés) de désagrégation sur la largeur de la carte
  deckCellPixel: number; // 0..1 — pixellisation des zones qui se détachent (1 = une couleur unie par zone)
  deckCellIrid: number; // 0..1 — reflet irisé des zones en train de partir (0 = aucun, la DA est à plat)
  deckCellBias: number; // 0..1 — la désagrégation part du bord qui mène (1) plutôt qu'au hasard (0)
  deckAimMix: number; // 0..1 — courbure de la trajectoire vers le côté du curseur, de part et d'autre de la direction du geste (0 = droit devant)
  deckThrow: number; // Distance dont la carte part dans sa direction en se désagrégeant (px écran)
  deckSpin: number; // Rotation maximale de la carte lancée (degrés), selon sa direction
  deckTilt: number; // Inclinaison 3D maximale de la carte et des layers selon la souris (degrés, négatif = inverse, 0 = carte plane au repos)
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

/**
 * Instants (absolus) où le retour à plat de la fin du tortillement commence et finit.
 * Il ne démarre jamais avant le hold : tant que le pack charge, la carte continue de se tordre.
 */
export function twistSettleBounds(config: TransitionConfig): { start: number; end: number } {
  const start = Math.max(holdTime(config), passEndTime(config) + (config.twistSettleStart ?? -0.3));
  return { start, end: start + Math.max(0.05, config.twistSettle ?? 1) };
}

/**
 * Fenêtre du recul d'arrivée, en secondes d'« arrivée » : le temps écoulé depuis que le pack est
 * chargé et que la timeline a atteint le hold (le plus tardif des deux). Le recul démarre après
 * `arrivalStart` et finit quand la piste `dezoom` démarre : le creux de la caméra est atteint au
 * moment précis où elle se met à revenir vers le cadrage de la vue détail. `span` est ce qui reste à
 * attendre dans le hold une fois le pack chargé (la vague finit son cycle avant de traverser) : le
 * recul s'étire d'autant, sans palier au creux en attendant que la vague passe. Le retard n'en mange
 * jamais plus de 60 % : au-delà, le recul se réduirait à un à-coup (la fenêtre finit toujours quand
 * `dezoom` démarre, un retard plus long ne la décale pas).
 */
export function arrivalBounds(config: TransitionConfig, span = 0): { start: number; end: number } {
  const end = passEndTime(config) - holdTime(config) + config.dezoom.start + Math.max(0, span);
  const start = Math.min(Math.max(0, config.arrivalStart ?? 0), Math.max(0, end) * 0.6);
  return { start, end: Math.max(start + 0.05, end) };
}

/** Instant auquel la dernière piste de la séquence d'entrée se termine, retour à plat de la torsion compris. */
export function timelineEnd(config: TransitionConfig): number {
  let end = 0;
  for (const name of ["lock", "reveal", "columnFade", "dezoom"] as const) {
    const track = config[name];
    end = Math.max(end, track.start + track.duration);
  }
  const passEnd = passEndTime(config);
  return Math.max(passEnd + Math.max(0.05, end), twistSettleBounds(config).end);
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
  rewindLayerFade: 0.25,
  rewindMode: "clean" as RewindMode,
  rewindStagger: 0.6,
  rewindCalm: 1,
  fxBurstBoost: 1,
  twistSettleStart: -0.3,
  twistSettle: 1,
  twistSettleEasing: "easeInOutCubic" as EasingName,
  twistSettleBlend: 0.5,
  lockScalePunch: 0.08,
  overlayExitDuration: 0.35,
  scatterDistance: 1000,
  approachZoom: 1.8,
  detailZoom: 1.8,
  arrivalDip: 0.22,
  arrivalStart: 0,
  arrivalEasing: "easeInOutCubic" as EasingName,
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
  stackSaturation: 0.45,
  panelGradientStrength: 0.65,
  panelGradientSpeed: 1.8,
  panelGlitch: 0.9,
  ambientPixels: 8,
  ambientOpacity: 0.32,
  ambientSize: 30,
  ambientTravel: 140,
  ambientSpeed: 0.12,
  ambientFade: 1.2,
  cardExit: 0.7,
  stepCooldown: 0.55,
  deckPullDistance: 1030,
  deckResist: 2.6,
  deckLift: 135,
  deckRelease: 0,
  deckHold: 0.14,
  deckInvertX: false,
  deckInvertY: false,
  deckShimmer: 1,
  deckDissolveAmount: 0.64,
  deckCellCols: 6,
  deckCellPixel: 1,
  deckCellIrid: 1,
  deckCellBias: 0.45,
  deckAimMix: 0.8,
  deckThrow: 180,
  deckSpin: 12,
  deckTilt: 0,
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
    twistSettleStart: -0.33,
    twistSettle: 1.1,
    approachZoom: 2.7,
    ...scaleTracks(1.1),
  },
  snappy: {
    ...BASE_AMPLITUDES,
    waveDuration: 0.8,
    twistSettleStart: -0.23,
    twistSettle: 0.78,
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
    twistSettleStart: -0.42,
    twistSettle: 1.4,
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
