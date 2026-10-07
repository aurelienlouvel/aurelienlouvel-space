/**
 * Échantillonnage de la timeline de transition.
 *
 * Un seul appel par frame (`CameraRig`, en priorité -1 pour passer avant tous
 * les autres `useFrame`) remplit un `TransitionFrame` mutable partagé. Tous les
 * consommateurs — caméra, mosaïque, colonne, overlay — lisent ce même objet au
 * lieu de brancher chacun sur un nom de phase et de recalculer sa propre
 * progression. Une seule source de vérité, donc aucun risque que deux éléments
 * se désynchronisent d'une frame.
 *
 * Le frame est pré-alloué et muté sur place : rien n'est alloué par frame.
 */

import {
  arrivalBounds,
  evaluateEasing,
  holdTime,
  passEndTime,
  scrollEndTime,
  timelineEnd,
  trackAt,
  trackRaw,
  twistSettleBounds,
  type TransitionConfig,
} from "./transition-presets";

/**
 * Les phases ne décrivent plus le mouvement, seulement l'état logique : ce qui
 * est cliquable, ce qui est visible, quelle horloge tourne.
 *
 * - `playing`   : le clic a eu lieu, la timeline se déroule (vague, boom, …).
 * - `isolated`  : vue détail stabilisée, défilement libre.
 * - `returning` : timeline de sortie.
 */
export type TransitionPhase = "idle" | "playing" | "isolated" | "returning";

/** Toutes les grandeurs animées de la transition, à un instant donné. */
export type TransitionFrame = {
  /** Multiplicateur à appliquer au zoom de base de la caméra. */
  zoom: number;
  /** 0..1 — glissement de la caméra vers le cadrage de la colonne. */
  framing: number;
  /** Écartement radial des tuiles de la mosaïque, en unités monde. */
  scatter: number;
  /** Opacité des tuiles de la mosaïque. */
  mosaicOpacity: number;
  /** Facteur d'échelle de la tuile visée (gonflement pendant le chargement). */
  tileScale: number;
  /**
   * 0.. — punch du boom : toute la pile (la carte du dessus et ses layers) grossit de ce facteur autour
   * du centre de la carte du dessus, puis retombe. À part de `tileScale`, qui ne règle que la taille de
   * départ de la carte et que le `reveal` efface presque aussitôt.
   */
  punch: number;
  /** Bascule 3D (rad) de la tuile visée autour de X. */
  tileTiltX: number;
  /** Bascule 3D (rad) de la tuile visée autour de Y. */
  tileTiltY: number;
  /** Torsion 3D (rad) autour de Z. */
  tileRoll: number;
  /** 0..1 — M0 : taille de tuile → taille de colonne. */
  reveal: number;
  /** 0..1 — part de la rotation « posée à la main » conservée par la tuile visée (0 = bien droite). */
  rest: number;
  /** 0..1 — les cartes de la pile émergent de derrière la première. */
  columnOpacity: number;
  /** 0..1 — avancement de la vague de charge, avant le boom. */
  waveProgress: number;
  /** 0..1+ — intensité des effets (glitch, pixels) autour de l'artifact, dès le clic jusqu'à la fin de la vague. */
  fx: number;
  /** 0..1 — évacuation de la vague de l'overlay de sélection. */
  overlayExit: number;
  /** Le panneau de détail doit-il être monté. */
  textRevealed: boolean;
  /** La navbar doit-elle passer en mode projet. */
  navbarRevealed: boolean;
};

export function createTransitionFrame(): TransitionFrame {
  return {
    zoom: 1,
    framing: 0,
    scatter: 0,
    mosaicOpacity: 1,
    tileScale: 1,
    punch: 0,
    tileTiltX: 0,
    tileTiltY: 0,
    tileRoll: 0,
    reveal: 0,
    rest: 1,
    columnOpacity: 0,
    waveProgress: 0,
    fx: 0,
    overlayExit: 0,
    textRevealed: false,
    navbarRevealed: false,
  };
}

/** Ce que le sampler a besoin de savoir de l'état runtime. */
export type TransitionClock = {
  phase: TransitionPhase;
  /** Horloge de la timeline, en secondes depuis le clic (figée pendant l'attente). */
  t: number;
  /** Temps réel écoulé depuis le clic : alimente le tortillement. */
  wall: number;
  /** Cycles de la vague qui boucle pendant l'attente du chargement. */
  loop: number;
  /** La timeline attend que le pack soit téléchargé. */
  holding: boolean;
  /**
   * Secondes passées dans le hold depuis que le pack est téléchargé : la vague finit son cycle avant
   * de traverser l'artifact, mais le recul de la caméra, lui, démarre dès le téléchargement.
   */
  arrivalWait?: number;
  /** Ce que cette attente durera au total, connu dès que le pack arrive (le reste du cycle de la vague). */
  arrivalSpan?: number;
  /** Retour en cours (Échap) : la timeline ne se joue plus à l'endroit. */
  rewinding?: boolean;
  /** Avancement 0..1 du retour en cours (avant la courbe d'adoucissement). */
  rewindU?: number;
  /** Retour : le frame au moment de l'annulation, d'où chaque grandeur glisse vers le repos. */
  returnFrom: TransitionFrame | null;
};

function clamp01(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
}

function smoothstep(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * Retour dans la mosaïque d'une carte qui n'est pas le média de la tuile : sur les
 * derniers 20 % du `reveal`, elle se fond dans la tuile au lieu de la remplacer d'un coup.
 */
export const REWIND_LAND_ZONE = 0.2;

/** Part (1 → 0) de la carte gardée encore visible à ce `reveal` ; la tuile prend le reste. */
export function rewindLandMix(reveal: number): number {
  return smoothstep(reveal / REWIND_LAND_ZONE);
}

/** Part de la piste `lock` passée à tenir la pose au sommet du punch, entre la montée et le relâchement. */
const LOCK_POP_HOLD = 0.08;
/** Part de la piste `lock` passée à monter quand `lockPunchAttack` n'est pas réglé. */
const LOCK_POP_ATTACK_DEFAULT = 0.22;

/**
 * Poids 0→1→1→0 du punch au boom : la pile gonfle d'un coup (`attack` = part de la piste passée à
 * monter), tient à peine la pose, puis retombe longuement. Flancs en smoothstep, donc départ et
 * arrivée à vitesse nulle.
 */
function lockPopEnvelope(u: number, attack = LOCK_POP_ATTACK_DEFAULT): number {
  if (u <= 0 || u >= 1) return 0;
  const rise = Math.min(0.9, Math.max(0.02, attack));
  const holdEnd = Math.min(0.98, rise + LOCK_POP_HOLD);
  if (u < rise) return smoothstep(u / rise);
  if (u <= holdEnd) return 1;
  return 1 - smoothstep((u - holdEnd) / (1 - holdEnd));
}

function sampleIdle(frame: TransitionFrame) {
  frame.zoom = 1;
  frame.framing = 0;
  frame.scatter = 0;
  frame.mosaicOpacity = 1;
  frame.tileScale = 1;
  frame.punch = 0;
  frame.tileTiltX = 0;
  frame.tileTiltY = 0;
  frame.tileRoll = 0;
  frame.reveal = 0;
  frame.rest = 1;
  frame.columnOpacity = 0;
  frame.waveProgress = 0;
  frame.fx = 0;
  frame.overlayExit = 0;
  frame.textRevealed = false;
  frame.navbarRevealed = false;
}

function samplePlaying(
  config: TransitionConfig,
  clock: TransitionClock,
  frame: TransitionFrame,
) {
  const t = clock.t;
  const hold = holdTime(config);
  const passEnd = passEndTime(config);
  const waveDuration = passEnd - hold;
  sampleIdle(frame);

  // Retour en « film » : ce que l'ouverture n'a joué qu'une fois (torsion, éclats, vague, coup de
  // zoom du silence) ne repart pas à l'envers. `rewindCalm` étouffe tout cela, 1 = rien ne revient.
  const calm = clock.rewinding ? clamp01(config.rewindCalm ?? 1) : 0;

  // ── 1. Approche : la caméra file vers l'artifact (zoom du hero) ─────────
  const heroT = trackAt(config.hero, t);
  // La tuile se redresse pendant l'approche.
  frame.rest = 1 - heroT;
  const wait = Math.min(1, Math.max(0, (t - config.hero.start - config.hero.duration) / 1.5));
  const drift = (config.silenceDrift ?? 0) * evaluateEasing("easeOutQuad", wait) * (1 - calm);
  // Arrivée : dès que le pack est chargé, la caméra recule (dézoom) puis revient au cadrage de la vue
  // détail (zoom, §5). Le temps d'arrivée court depuis le hold, ou depuis le chargement quand celui-ci
  // a fini pendant l'attente (`arrivalWait`, sur une attente totale `arrivalSpan`) ; au retour l'horloge
  // recule, ils ne comptent plus. Le creux est atteint quand la piste `dezoom` démarre : de là, la
  // formule du §5 remonte vers le zoom final. `arrivalDip` à 0 : la trajectoire d'avant, sans recul.
  const waited = clock.rewinding ? 0 : (clock.arrivalWait ?? 0);
  const span = clock.rewinding ? 0 : (clock.arrivalSpan ?? 0);
  const arrival = arrivalBounds(config, span);
  const arrivalTime = (t >= hold ? t - hold : 0) + waited;
  const dip =
    (config.arrivalDip ?? 0) *
    evaluateEasing(config.arrivalEasing ?? "easeInOutCubic", (arrivalTime - arrival.start) / (arrival.end - arrival.start)) *
    (1 - calm);
  const climbing = (1 + (config.approachZoom - 1) * heroT) * (1 + drift) * (1 - dip);

  // ── 2. Burst : la mosaïque explose, absolu dans la timeline ─────────────
  const burstT = trackAt(config.scatter, t);
  frame.scatter = config.scatterDistance * burstT;
  frame.mosaicOpacity = 1 - burstT;

  // ── 3. Tortillement de l'artifact, du clic jusqu'à son retour à plat ───────
  // Il démarre au clic, pas au burst : l'approche, le burst et le tortillement
  // se jouent en même temps au lieu de se passer le relais. Il ne s'arrête pas
  // net à la fin de la vague : son amplitude redescend sur `twistSettle` secondes,
  // avec sa propre courbe, et déborde sur le boom (la carte du deck reprend la
  // torsion restante, cf. SecondaryGalleryPlanes).
  const wiggleIn = smoothstep(t / 0.35);
  const settle = twistSettleBounds(config);
  const wiggleOut =
    1 - evaluateEasing(config.twistSettleEasing ?? "easeInOutCubic", (t - settle.start) / (settle.end - settle.start));
  const env = wiggleIn * wiggleOut * (1 - calm);
  const w = clock.wall * (config.wiggleSpeed ?? 7);
  const amp = config.packShake ?? 0.05;
  frame.tileRoll = env * amp * (Math.sin(w) + 0.5 * Math.sin(w * 1.7 + 1.3));
  frame.tileTiltX = env * amp * 0.8 * Math.sin(w * 1.3 + 0.6);
  frame.tileTiltY = env * amp * 0.8 * Math.cos(w * 0.9);
  const grow = (config.loadGrow ?? 0.1) * (1 - Math.exp(-Math.max(0, clock.wall) * 1.1));
  const breathe = (config.breathe ?? 0.025) * (0.5 + 0.5 * Math.sin(clock.wall * 3.1));
  const swell = env * (grow + breathe);
  frame.tileScale = 1 + swell;

  // Effets visuels (pixels d'ouverture) : ils s'arrêtent avec la vague, pas avec le retour
  // à plat de la carte, et ont un pic au moment où la mosaïque explose.
  const fxOut = 1 - smoothstep((t - hold - waveDuration * 0.6) / (waveDuration * 0.4 + 0.001));
  const burstPulse = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - config.scatter.start) / 0.9)));
  frame.fx = wiggleIn * fxOut * (1 + (config.fxBurstBoost ?? 0) * burstPulse) * (1 - calm);

  // ── 4. Vague : boucle pendant l'attente, puis traverse l'artifact ───────
  if (clock.holding) {
    const phase = clock.loop - Math.floor(clock.loop);
    frame.waveProgress = evaluateEasing(config.waveEasing, phase);
    frame.overlayExit = smoothstep((phase - 0.3) / 0.7);
  } else if (t < hold) {
    frame.waveProgress = 0;
  } else {
    const u = Math.min(1, (t - hold) / waveDuration);
    frame.waveProgress = evaluateEasing(config.waveEasing, u);
    frame.overlayExit = smoothstep((u - 0.3) / 0.7);
  }

  // ── 5. Après la vague : réveil, cascade des cartes, cadrage ─────────────
  const tp = t - passEnd;
  const dezoomT = trackAt(config.dezoom, tp);
  frame.zoom = climbing + (config.detailZoom - climbing) * dezoomT;
  frame.framing = dezoomT;

  frame.reveal = trackAt(config.reveal, tp);
  frame.columnOpacity = trackAt(config.columnFade, tp);

  if (tp > 0) {
    // Le punch du boom grossit toute la pile d'un coup, par-dessus la carte qui prend sa place. Il ne
    // passe plus par `tileScale` : ce facteur n'est que la taille de DÉPART de la carte, que le
    // `reveal` a effacée aux trois quarts quand le punch culmine (il valait 1 à 3 % à l'écran), et le
    // gonflement du chargement le couvrait déjà. Sous le punch, la taille de la carte ne fait que
    // tendre vers sa taille finale (le gonflement retombe pendant que le `reveal` monte) : pas de « V ».
    frame.punch =
      Math.max(0, config.lockScalePunch ?? 0) *
      lockPopEnvelope(trackRaw(config.lock, tp), config.lockPunchAttack) *
      (1 - calm);
    // Roulis et bascule continuent de s'éteindre (`env`) : plus remis à zéro d'un coup.
    frame.overlayExit = 1;
    frame.waveProgress = 1;
  }
  // La vague qui a déjà quitté la carte à l'aller ne la retraverse pas au retour.
  frame.overlayExit += (1 - frame.overlayExit) * calm;

  const scrollEnd = scrollEndTime(config);
  frame.navbarRevealed = t >= scrollEnd - (config.navbarLead ?? 0.3);
  frame.textRevealed = t >= scrollEnd - (config.textLead ?? 0.2);
}

function sampleIsolated(config: TransitionConfig, frame: TransitionFrame) {
  frame.zoom = config.detailZoom;
  frame.framing = 1;
  frame.scatter = config.scatterDistance;
  frame.mosaicOpacity = 0;
  frame.tileScale = 1;
  frame.punch = 0;
  frame.tileTiltX = 0;
  frame.tileTiltY = 0;
  frame.tileRoll = 0;
  frame.reveal = 1;
  frame.rest = 0;
  frame.columnOpacity = 1;
  frame.waveProgress = 1;
  frame.fx = 0;
  frame.overlayExit = 1;
  frame.textRevealed = true;
  frame.navbarRevealed = true;
}

/** Rang de départ, dans le retour « clean », de chaque grandeur : 0 part la première, 1 la dernière. */
const REWIND_RANK_CARD = 0.2;
const REWIND_RANK_CAMERA = 0.4;
const REWIND_RANK_MOSAIC = 1;
/** Part du retour (0..1) que prennent la vague, les éclats, la torsion et la pile à s'éteindre. */
const REWIND_QUICK = 0.3;
/** Le `reveal` est fini bien avant ce point : la rotation « posée à la main » ne reprend qu'après. */
const REWIND_REST_LATEST = 0.8;

/** Source de repli d'un retour sans instantané : la vue détail stabilisée (réutilisée, rien d'alloué par frame). */
const rewindFallback = createTransitionFrame();

/**
 * Avancement adouci (0..1) d'une grandeur de rang `rank` : sa fenêtre court de `rank × half` à
 * `1 − (1 − rank) × half`, donc toutes ont la même largeur et la dernière est décalée de `half`
 * sur la première (`half` = la moitié de `rewindStagger`).
 */
function rewindAt(config: TransitionConfig, u: number, half: number, rank: number): number {
  const from = rank * half;
  const to = 1 - (1 - rank) * half;
  return evaluateEasing(config.rewindEasing, (u - from) / Math.max(0.001, to - from));
}

/**
 * Retour « clean » : chaque grandeur glisse vers son repos depuis l'état exact où l'ouverture
 * en était (`returnFrom`), au lieu de rejouer le film à l'envers. Aucune vague, aucune torsion,
 * aucun éclat ne repart, et la caméra ne fait qu'un trajet, sans à-coup. La carte revient
 * d'abord, la caméra juste derrière, la mosaïque se remet en place en dernier.
 */
function sampleRewind(config: TransitionConfig, clock: TransitionClock, frame: TransitionFrame) {
  let src = clock.returnFrom;
  if (!src) {
    sampleIsolated(config, rewindFallback);
    src = rewindFallback;
  }
  const u = clamp01(clock.rewindU ?? 0);
  const half = 0.5 * clamp01(config.rewindStagger ?? 0.6);
  const card = rewindAt(config, u, half, REWIND_RANK_CARD);
  const camera = rewindAt(config, u, half, REWIND_RANK_CAMERA);
  const mosaic = rewindAt(config, u, half, REWIND_RANK_MOSAIC);
  // La tuile de la mosaïque a une rotation posée à la main que la carte du deck n'a pas : elle ne
  // la reprend qu'une fois la carte rentrée dans la tuile (`reveal` à 0), jamais pendant.
  const restFrom = Math.min(1 - (1 - REWIND_RANK_CARD) * half, REWIND_REST_LATEST);
  const rest = evaluateEasing(config.rewindEasing, (u - restFrom) / Math.max(0.001, 1 - restFrom));
  const quick = smoothstep(u / REWIND_QUICK);

  frame.zoom = src.zoom + (1 - src.zoom) * camera;
  frame.framing = src.framing * (1 - camera);
  frame.scatter = src.scatter * (1 - mosaic);
  frame.mosaicOpacity = src.mosaicOpacity + (1 - src.mosaicOpacity) * mosaic;
  frame.reveal = src.reveal * (1 - card);
  frame.rest = src.rest + (1 - src.rest) * rest;
  // Ce qu'une ouverture interrompue laissait en route (torsion, gonflement, vague, éclats) s'éteint d'abord.
  frame.tileScale = src.tileScale + (1 - src.tileScale) * quick;
  frame.punch = src.punch * (1 - quick);
  frame.tileTiltX = src.tileTiltX * (1 - quick);
  frame.tileTiltY = src.tileTiltY * (1 - quick);
  frame.tileRoll = src.tileRoll * (1 - quick);
  frame.columnOpacity = src.columnOpacity * (1 - quick);
  frame.fx = src.fx * (1 - quick);
  frame.waveProgress = src.waveProgress;
  frame.overlayExit = src.overlayExit + (1 - src.overlayExit) * quick;
  frame.textRevealed = false;
  frame.navbarRevealed = false;
}

function sampleReturning(
  config: TransitionConfig,
  t: number,
  frame: TransitionFrame,
  from: TransitionFrame | null,
) {
  const exitT = trackAt(config.exit, t);
  const camT = trackAt(config.exit, t - config.cameraReturnDelay);

  const remaining = Math.max(0.1, config.exit.duration - config.repulseReturnDelay);
  const repulseT = evaluateEasing(
    config.exit.easing,
    Math.max(
      0,
      Math.min(1, (t - config.exit.start - config.repulseReturnDelay) / remaining),
    ),
  );

  // Entrée interrompue : on rembobine depuis l'état exact où elle en était,
  // sans passer par la vue détail.
  const src: TransitionFrame = from ?? {
    zoom: config.detailZoom,
    framing: 1,
    scatter: config.scatterDistance,
    mosaicOpacity: 0,
    tileScale: 1,
    punch: 0,
    tileTiltX: 0,
    tileTiltY: 0,
    tileRoll: 0,
    reveal: 1,
    rest: 0,
    columnOpacity: 1,
    waveProgress: 1,
    fx: 0,
    overlayExit: 1,
    textRevealed: false,
    navbarRevealed: false,
  };

  frame.zoom = src.zoom + (1 - src.zoom) * camT;
  frame.framing = src.framing * (1 - camT);
  frame.scatter = src.scatter * (1 - repulseT);
  frame.mosaicOpacity = src.mosaicOpacity + (1 - src.mosaicOpacity) * repulseT;
  frame.tileScale = src.tileScale + (1 - src.tileScale) * exitT;
  // La carte qui rentre part de la pose que son mesh avait (punch compris, cf. `exitStartRef`) : la
  // pile ne reçoit plus le punch dans cette phase.
  frame.punch = 0;
  frame.tileTiltX = src.tileTiltX * (1 - exitT);
  frame.tileTiltY = src.tileTiltY * (1 - exitT);
  frame.tileRoll = src.tileRoll * (1 - exitT);
  frame.reveal = src.reveal * (1 - exitT);
  frame.rest = src.rest + (1 - src.rest) * exitT;
  frame.columnOpacity = src.columnOpacity * (1 - exitT);
  frame.waveProgress = src.waveProgress * (1 - exitT);
  frame.fx = src.fx * (1 - exitT);
  frame.overlayExit = 1;
  frame.textRevealed = false;
  frame.navbarRevealed = false;
}

/** Les étapes du film, dans l'ordre de la chorégraphie voulue. */
export type StageId =
  | "idle"
  | "approach"
  | "burst"
  | "wait"
  | "wave"
  | "cascade"
  | "panel"
  | "detail"
  | "returning";

export const STAGE_LABELS: Record<StageId, string> = {
  idle: "Repos",
  approach: "1 · Approche",
  burst: "2 · Burst",
  wait: "3 · Attente (chargement)",
  wave: "4 · Vague",
  cascade: "5 · Cascade",
  panel: "6 · Panneau",
  detail: "Vue détail",
  returning: "Retour",
};

/**
 * Bornes (en secondes de timeline) des étapes d'entrée. Sert à la fois au
 * calcul de l'étape courante et à la barre de timeline du debug.
 */
export function stageBounds(config: TransitionConfig) {
  const hold = holdTime(config);
  const passEnd = passEndTime(config);
  const end = timelineEnd(config);
  const panelStart = Math.min(
    end,
    Math.max(passEnd, scrollEndTime(config) - (config.textLead ?? 0.2)),
  );
  const burstStart = Math.min(hold, Math.max(0, config.scatter.start));
  return { burstStart, hold, passEnd, panelStart, end };
}

/** Étape logique en cours, pour l'affichage du debug. */
export function currentStage(
  config: TransitionConfig,
  clock: Pick<TransitionClock, "phase" | "t" | "holding">,
): StageId {
  switch (clock.phase) {
    case "idle":
      return "idle";
    case "isolated":
      return "detail";
    case "returning":
      return "returning";
  }
  const b = stageBounds(config);
  if (clock.holding) return "wait";
  if (clock.t < b.burstStart) return "approach";
  if (clock.t < b.hold) return "burst";
  if (clock.t < b.passEnd) return "wave";
  if (clock.t < b.panelStart) return "cascade";
  return "panel";
}

/** Remplit `frame` avec l'état de la transition à l'instant décrit par `clock`. */
export function sampleTransition(
  config: TransitionConfig,
  clock: TransitionClock,
  frame: TransitionFrame,
) {
  switch (clock.phase) {
    case "playing":
      if (clock.rewinding && (config.rewindMode ?? "clean") !== "film") sampleRewind(config, clock, frame);
      else samplePlaying(config, clock, frame);
      return;
    case "isolated":
      sampleIsolated(config, frame);
      return;
    case "returning":
      sampleReturning(config, clock.t, frame, clock.returnFrom);
      return;
    default:
      sampleIdle(frame);
  }
}

export { timelineEnd };
