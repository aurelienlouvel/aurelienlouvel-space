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
};

/** Part de la piste `lock` consacrée au pincement, le reste au fondu sortant. */
const LOCK_PINCH_WINDOW = 0.55;

function smoothstep(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * Animation des brackets : rétrécissement vers l'intérieur (retrait progressif du padding)
 * et fondu sortant fluide sans expansion parasite.
 */
function sampleBrackets(config: TransitionConfig, t: number, frame: TransitionFrame) {
  const u = trackRaw(config.lock, t);
  const shrinkDist = config.lockBracketShrink ?? config.lockBracketTighten ?? 12;
  const shrinkProgress = Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.5);
  frame.bracketPad = -shrinkProgress * shrinkDist;
  frame.bracketAlpha = Math.max(0, 1.0 - Math.pow(u, 1.4));
}

function sampleIdle(frame: TransitionFrame) {
  frame.zoom = 1;
  frame.framing = 0;
  frame.scatter = 0;
  frame.mosaicOpacity = 1;
  frame.tileScale = 1;
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
  frame.scatter = config.selectRepulse * p;
}

function samplePlaying(
  config: TransitionConfig,
  t: number,
  frame: TransitionFrame,
) {
  const scatterT = trackAt(config.scatter, t);
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
    config.selectRepulse + (config.scatterDistance - config.selectRepulse) * scatterT;
  frame.mosaicOpacity = 1 - scatterT;

  frame.reveal = trackAt(config.reveal, t);
  frame.scroll = evaluateEasing(config.spinEasing || config.scroll.easing, trackRaw(config.scroll, t));
  frame.slide = config.slideOffset * (1 - trackAt(config.slide, t));
  frame.columnOpacity = trackAt(config.columnFade, t);

  // Micro-animation de l'image sélectionnée pendant la confirmation :
  // L'image rétrécit légèrement (squeeze), puis regrandit/ressort juste après.
  const lockU = trackRaw(config.lock, t);
  let tileScale = config.selectScale;
  if (lockU > 0 && lockU < 1) {
    const shrinkAmp = config.lockImageShrink ?? 0.08;
    const dip = Math.sin(lockU * Math.PI);
    const rebound = lockU > 0.6 ? Math.sin(((lockU - 0.6) / 0.4) * Math.PI) * 0.015 : 0;
    tileScale = config.selectScale - dip * shrinkAmp + rebound;
  }
  frame.tileScale = tileScale;
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
  frame.reveal = 1;
  // Le rouleau a parcouru un nombre entier de cycles : à contenu identique près,
  // revenir à 0 est exactement la même image. C'est ce qui permet de rendre la
  // main au défilement libre sans la moindre coupure — et c'est exact, pas
  // approché, parce que la hauteur de cycle est figée pendant toute la timeline.
  frame.scroll = 0;
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
  frame.reveal = 1 - exitT;
  frame.scroll = 0;
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
      samplePlaying(config, clock.t, frame);
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
