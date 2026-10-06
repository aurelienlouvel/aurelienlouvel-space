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
  evaluateEasing,
  holdTime,
  passEndTime,
  scrollEndTime,
  timelineEnd,
  trackAt,
  trackRaw,
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
  /** Facteur d'échelle de la tuile visée (détachement au boom). */
  tileScale: number;
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
  /** Annulation en cours d'entrée : `t` recule, le film se déroule à l'envers. */
  rewinding?: boolean;
  /** Si le retour part d'une entrée interrompue : le frame au moment de l'annulation. */
  returnFrom: TransitionFrame | null;
};

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

/** Part de la piste `lock` consacrée à la montée du détachement. */
const LOCK_POP_ATTACK_END = 0.3;
/** Fin du mini temps de pause tenu, début du relâchement. */
const LOCK_POP_HOLD_END = 0.62;

/**
 * Poids 0→1→1→0 du détachement au boom : la carte se décolle, tient la pose,
 * puis se repose. Flancs en smoothstep, donc départ et arrivée à vitesse nulle.
 */
function lockPopEnvelope(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < LOCK_POP_ATTACK_END) return smoothstep(u / LOCK_POP_ATTACK_END);
  if (u <= LOCK_POP_HOLD_END) return 1;
  return 1 - smoothstep((u - LOCK_POP_HOLD_END) / (1 - LOCK_POP_HOLD_END));
}

function sampleIdle(frame: TransitionFrame) {
  frame.zoom = 1;
  frame.framing = 0;
  frame.scatter = 0;
  frame.mosaicOpacity = 1;
  frame.tileScale = 1;
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

  // ── 1. Approche : la caméra file vers l'artifact (zoom du hero) ─────────
  const heroT = trackAt(config.hero, t);
  // La tuile se redresse pendant l'approche.
  frame.rest = 1 - heroT;
  const wait = Math.min(1, Math.max(0, (t - config.hero.start - config.hero.duration) / 1.5));
  const drift = (config.silenceDrift ?? 0) * evaluateEasing("easeOutQuad", wait);
  const climbing = (1 + (config.approachZoom - 1) * heroT) * (1 + drift);

  // ── 2. Burst : la mosaïque explose, absolu dans la timeline ─────────────
  const burstT = trackAt(config.scatter, t);
  frame.scatter = config.scatterDistance * burstT;
  frame.mosaicOpacity = 1 - burstT;

  // ── 3. Tortillement de l'artifact, du clic jusqu'à la fin de la vague ───────
  // Il démarre au clic, pas au burst : l'approche, le burst et le tortillement
  // se jouent en même temps au lieu de se passer le relais.
  const wiggleIn = smoothstep(t / 0.35);
  const wiggleOut = 1 - smoothstep((t - hold - waveDuration * 0.6) / (waveDuration * 0.4 + 0.001));
  const env = wiggleIn * wiggleOut;
  const w = clock.wall * (config.wiggleSpeed ?? 7);
  const amp = config.packShake ?? 0.05;
  frame.tileRoll = env * amp * (Math.sin(w) + 0.5 * Math.sin(w * 1.7 + 1.3));
  frame.tileTiltX = env * amp * 0.8 * Math.sin(w * 1.3 + 0.6);
  frame.tileTiltY = env * amp * 0.8 * Math.cos(w * 0.9);
  const grow = (config.loadGrow ?? 0.1) * (1 - Math.exp(-Math.max(0, clock.wall) * 1.1));
  const breathe = (config.breathe ?? 0.025) * (0.5 + 0.5 * Math.sin(clock.wall * 3.1));
  frame.tileScale = 1 + env * (grow + breathe);

  // Effets visuels (glitch, pixels) : même enveloppe que le tortillement, avec
  // un pic au moment où la mosaïque explose.
  const burstPulse = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - config.scatter.start) / 0.9)));
  frame.fx = env * (1 + (config.fxBurstBoost ?? 0) * burstPulse);

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
    const popWeight = lockPopEnvelope(trackRaw(config.lock, tp));
    frame.tileScale = 1 + (config.lockScalePunch ?? 0.02) * popWeight;
    frame.tileRoll = 0;
    frame.tileTiltX = 0;
    frame.tileTiltY = 0;
    frame.overlayExit = 1;
    frame.waveProgress = 1;
  }

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
      samplePlaying(config, clock, frame);
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
