/**
 * Échantillonnage de la timeline de transition.
 *
 * Un seul appel par frame (`CameraRig`, en priorité -1 pour passer avant tous
 * les autres `useFrame`) remplit un `TransitionFrame` mutable partagé. Tous les
 * consommateurs — caméra, mosaïque, colonne, brackets, overlay — lisent ce même
 * objet au lieu de brancher chacun sur un nom de phase et de recalculer sa
 * propre progression. Une seule source de vérité, donc aucun risque que deux
 * éléments se désynchronisent d'une frame.
 *
 * Le frame est pré-alloué et muté sur place : rien n'est alloué par frame.
 */

import {
  evaluateEasing,
  timelineEnd,
  trackAt,
  trackRaw,
  type TransitionConfig,
} from "./transition-presets";

/**
 * Les phases ne décrivent plus le mouvement, seulement l'état logique : ce qui
 * est cliquable, ce qui est visible, quelle horloge tourne.
 *
 * - `selecting` : hold réversible, sa progression appartient à l'utilisateur.
 * - `playing`   : la timeline se déroule, `t` avance.
 * - `isolated`  : vue détail stabilisée, défilement libre.
 * - `returning` : timeline de sortie.
 */
export type TransitionPhase =
  | "idle"
  | "selecting"
  | "playing"
  | "isolated"
  | "returning";

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
  /** Facteur d'échelle de la tuile visée (hold + rebond de confirmation). */
  tileScale: number;
  /** Bascule 3D (rad) de la tuile visée autour de X — clic pendant le hold, pop automatique au lock. */
  tileTiltX: number;
  /** Bascule 3D (rad) de la tuile visée autour de Y — vers le point cliqué. */
  tileTiltY: number;
  /** Torsion 3D (rad) autour de Z — micro-roll de finition du pop de lock. */
  tileRoll: number;
  /** 0..1 — M0 : taille de tuile → taille de colonne. */
  reveal: number;
  /** 0..1 — avancement du rouleau, à multiplier par la distance à parcourir. */
  scroll: number;
  /** Décalage d'entrée des cartes secondaires, en unités monde. */
  slide: number;
  /** Opacité des cartes secondaires. */
  columnOpacity: number;
  /** Correction du padding des brackets, en px (négatif = pincement). */
  bracketPad: number;
  /** Opacité des brackets. */
  bracketAlpha: number;
  /** 0..1 — évacuation de la vague de l'overlay de sélection. */
  overlayExit: number;
  /** Le panneau de détail doit-il être monté. */
  textRevealed: boolean;
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
    scroll: 0,
    slide: 0,
    columnOpacity: 0,
    bracketPad: 0,
    bracketAlpha: 1,
    overlayExit: 0,
    textRevealed: false,
  };
}

/** Ce que le sampler a besoin de savoir de l'état runtime. */
export type TransitionClock = {
  phase: TransitionPhase;
  /** Horloge de la timeline, en secondes depuis son début. */
  t: number;
  /** 0..1 — avancement du hold, piloté par l'utilisateur. */
  selectProgress: number;
  /** Point cliqué sur la tuile au déclenchement, normalisé -1..1 depuis son centre. */
  clickOffset: { x: number; y: number };
};

/** Part de la piste `lock` consacrée au pincement, le reste au fondu sortant. */
const LOCK_PINCH_WINDOW = 0.55;

function smoothstep(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * Animation des brackets : rétrécissement vers l'intérieur (retrait du padding),
 * maintien pendant le mini-temps de pause, puis fondu sortant fluide lors du pop.
 */
function sampleBrackets(config: TransitionConfig, t: number, frame: TransitionFrame) {
  const u = trackRaw(config.lock, t);
  if (u <= 0) {
    frame.bracketPad = 0;
    frame.bracketAlpha = 1;
    return;
  }
  if (u >= 1) {
    frame.bracketPad = 0;
    frame.bracketAlpha = 0;
    return;
  }

  const shrinkDist = config.lockBracketShrink ?? config.lockBracketTighten ?? 14;
  const uPauseStart = 0.22;
  const uPauseEnd = 0.72;

  if (u < uPauseStart) {
    // 1. Attaque : pincement rapide vers l'intérieur
    const p = u / uPauseStart;
    const ease = 1 - Math.pow(1 - p, 3);
    frame.bracketPad = -ease * shrinkDist;
    frame.bracketAlpha = 1;
  } else if (u <= uPauseEnd) {
    // 2. Mini temps de pause : maintien serré contre l'image squeezée
    frame.bracketPad = -shrinkDist;
    frame.bracketAlpha = 1;
  } else {
    // 3. Relâchement & fondu sortant
    const p = (u - uPauseEnd) / (1 - uPauseEnd);
    frame.bracketPad = -(1 - p) * shrinkDist;
    frame.bracketAlpha = Math.max(0, 1 - Math.pow(p, 1.5));
  }
}

/** Part de la piste `lock` consacrée à l'attaque du pop 3D automatique. */
const LOCK_POP_ATTACK_END = 0.3;
/** Fin du mini temps de pause tenu, début du relâchement. */
const LOCK_POP_HOLD_END = 0.62;

/**
 * Poids 0→1→1→0 du pop 3D automatique pendant le lock : la carte se décolle,
 * tient la pose, puis se repose à plat. Les deux flancs sont en smoothstep,
 * donc départ et arrivée à vitesse nulle : c'est ce qui donne du poids au
 * décollement au lieu de le faire claquer, seule différence de fond entre un
 * mouvement filmique et un rebond cartoon.
 */
function lockPopEnvelope(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < LOCK_POP_ATTACK_END) return smoothstep(u / LOCK_POP_ATTACK_END);
  if (u <= LOCK_POP_HOLD_END) return 1;
  return 1 - smoothstep((u - LOCK_POP_HOLD_END) / (1 - LOCK_POP_HOLD_END));
}

/**
 * Avancement 0..1 de l'amorce du burst dans la queue du hold. La mosaïque
 * commence à céder *avant* que la sélection ne soit validée : sans cette
 * anticipation le burst démarre pile sur la validation et se lit comme une
 * réaction mécanique au clic, pas comme un geste déjà en cours.
 */
function burstLeadProgress(
  config: TransitionConfig,
  selectProgress: number,
): number {
  const span = Math.min(1, Math.max(0, config.burstLead ?? 0));
  if (span <= 0) return 0;
  const u = (selectProgress - (1 - span)) / span;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u;
}

/**
 * Micro-torsion (rad, normalisée 0..1) qui n'apparaît que pendant le
 * relâchement : un petit coup de poignet au moment où la carte se repose
 * bien à plat, comme la touche finale d'un geste plutôt qu'un mouvement
 * continu depuis l'attaque.
 */
function lockPopRollShape(u: number): number {
  if (u <= LOCK_POP_HOLD_END || u >= 1) return 0;
  const p = (u - LOCK_POP_HOLD_END) / (1 - LOCK_POP_HOLD_END);
  return Math.sin(p * Math.PI);
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
  frame.scroll = 0;
  frame.slide = 0;
  frame.columnOpacity = 0;
  frame.bracketPad = 0;
  frame.bracketAlpha = 1;
  frame.overlayExit = 0;
  frame.textRevealed = false;
}

function sampleSelecting(
  config: TransitionConfig,
  clock: TransitionClock,
  frame: TransitionFrame,
) {
  const p = evaluateEasing(config.selectEasing, clock.selectProgress);
  sampleIdle(frame);
  frame.zoom = 1 + (config.selectZoom - 1) * p;
  frame.tileScale = 1 + (config.selectScale - 1) * p;

  // Écartement à peine perceptible pendant tout le hold, puis amorce du burst
  // sur la fin. La valeur atteinte ici est exactement celle d'où `samplePlaying`
  // repart, donc le passage de phase ne saute ni en position ni en vitesse.
  const base = config.selectRepulse * p;
  const lead =
    (config.burstLeadDepth ?? 0) * burstLeadProgress(config, clock.selectProgress);
  frame.scatter = base + (config.scatterDistance - base) * lead;
  frame.mosaicOpacity = 1 - lead;

  // La tuile bascule vers le point cliqué (coin pressé qui s'enfonce, coin
  // opposé qui remonte) — cf. ArtifactPlaneMesh pour l'origine de l'offset.
  frame.tileTiltX = -clock.clickOffset.y * config.selectTiltMax * p;
  frame.tileTiltY = clock.clickOffset.x * config.selectTiltMax * p;
}

function samplePlaying(
  config: TransitionConfig,
  t: number,
  clickOffset: { x: number; y: number },
  frame: TransitionFrame,
) {
  // Le burst reprend là où la queue du hold l'a laissé au lieu de repartir de
  // zéro : une seule courbe qui traverse la validation sans rupture.
  const leadDepth = config.burstLeadDepth ?? 0;
  const burstT = leadDepth + (1 - leadDepth) * trackAt(config.scatter, t);
  const heroT = trackAt(config.hero, t);
  const dezoomT = trackAt(config.dezoom, t);

  // Le zoom est une seule courbe en deux rampes superposées : la seconde reprend
  // la première là où elle en est, au lieu de repartir d'une valeur recalculée.
  // Leur recouvrement est donc continu en vitesse, même s'il est large.
  const heroZoom = config.detailZoom * (config.heroZoom ?? 1.05);
  const climbing = config.selectZoom + (heroZoom - config.selectZoom) * heroT;
  frame.zoom = climbing + (config.detailZoom - climbing) * dezoomT;
  frame.framing = dezoomT;

  frame.scatter =
    config.selectRepulse + (config.scatterDistance - config.selectRepulse) * burstT;
  frame.mosaicOpacity = 1 - burstT;

  frame.reveal = trackAt(config.reveal, t);
  frame.scroll = evaluateEasing(config.spinEasing || config.scroll.easing, trackRaw(config.scroll, t));
  frame.slide = config.slideOffset * (1 - trackAt(config.slide, t));
  frame.columnOpacity = trackAt(config.columnFade, t);

  // Micro-animation de lock : la bascule au clic cède la place, en un geste
  // continu (attaque 0..LOCK_POP_ATTACK_END), à un pop 3D automatique de
  // direction fixe — la carte se soulève vers le spectateur, tient la pose,
  // puis se repose bien à plat avec une micro-torsion de finition. Se résout
  // strictement à plat avant que `reveal` ne démarre (même instant que la fin
  // de cette piste).
  const lockU = trackRaw(config.lock, t);
  const popWeight = lockPopEnvelope(lockU);
  const clickWeight = lockU >= LOCK_POP_ATTACK_END ? 0 : 1 - popWeight;

  frame.tileTiltX =
    -clickOffset.y * config.selectTiltMax * clickWeight -
    config.lockPopTilt * popWeight;
  frame.tileTiltY = clickOffset.x * config.selectTiltMax * clickWeight;
  frame.tileScale =
    config.selectScale * (1 + (config.lockScalePunch ?? 0.02) * popWeight);
  frame.tileRoll = config.lockPopRoll * lockPopRollShape(lockU);

  sampleBrackets(config, t, frame);

  frame.overlayExit = smoothstep(t / Math.max(0.01, config.overlayExitDuration));
  frame.textRevealed = t >= config.textRevealAt;
}

function sampleIsolated(config: TransitionConfig, frame: TransitionFrame) {
  frame.zoom = config.detailZoom;
  frame.framing = 1;
  frame.scatter = config.scatterDistance;
  frame.mosaicOpacity = 0;
  frame.tileScale = config.selectScale;
  frame.tileTiltX = 0;
  frame.tileTiltY = 0;
  frame.tileRoll = 0;
  frame.reveal = 1;
  // Maintien continu du rouleau à 1 (100% de la distance parcourue).
  // La transition playing -> isolated ne subit ainsi aucun saut de position.
  frame.scroll = 1;
  frame.slide = 0;
  frame.columnOpacity = 1;
  frame.bracketPad = 0;
  frame.bracketAlpha = 0;
  frame.overlayExit = 1;
  frame.textRevealed = true;
}

function sampleReturning(
  config: TransitionConfig,
  t: number,
  frame: TransitionFrame,
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

  frame.zoom = config.detailZoom + (1 - config.detailZoom) * camT;
  frame.framing = 1 - camT;
  frame.scatter = config.scatterDistance * (1 - repulseT);
  frame.mosaicOpacity = repulseT;
  frame.tileScale = 1 + (config.selectScale - 1) * (1 - exitT);
  frame.tileTiltX = 0;
  frame.tileTiltY = 0;
  frame.tileRoll = 0;
  frame.reveal = 1 - exitT;
  frame.scroll = 1;
  frame.slide = config.exitSlideOffset * exitT;
  frame.columnOpacity = 1 - exitT;
  frame.bracketPad = 0;
  frame.bracketAlpha = 0;
  frame.overlayExit = 1;
  frame.textRevealed = false;
}

/** Remplit `frame` avec l'état de la transition à l'instant décrit par `clock`. */
export function sampleTransition(
  config: TransitionConfig,
  clock: TransitionClock,
  frame: TransitionFrame,
) {
  switch (clock.phase) {
    case "selecting":
      sampleSelecting(config, clock, frame);
      return;
    case "playing":
      samplePlaying(config, clock.t, clock.clickOffset, frame);
      return;
    case "isolated":
      sampleIsolated(config, frame);
      return;
    case "returning":
      sampleReturning(config, clock.t, frame);
      return;
    default:
      sampleIdle(frame);
  }
}

export { timelineEnd };
