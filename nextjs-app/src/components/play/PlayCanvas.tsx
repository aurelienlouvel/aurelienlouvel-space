"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar02Icon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { Canvas, events, useFrame } from "@react-three/fiber";
import { Stats, useTexture } from "@react-three/drei";
import type { OrthographicCamera } from "three";
import { useActionBar } from "@/contexts/ActionBarContext";
import { preloadArtifact } from "@/lib/preload-artifact";
import { buildImageUrl } from "@/lib/sanity-image";
import { fileRefToUrl, playMediaUrl } from "@/lib/sanity-utils";
import type { PlayArtifact, ArtifactDetail, Mate } from "@/sanity/queries";
import { Tag } from "@/components/primitives/Tag";
import { MatesBlock } from "@/components/blocks/MatesBlock";
import { formatMonth } from "@/lib/date-utils";
import { RoleBlock } from "@/components/blocks/RoleBlock";
import { DateAgo } from "@/components/blocks/DateAgo";
import { paletteFromImageUrl, paletteFromVideo, type RGB } from "@/lib/dominant-color";
import { usePanelGradient, type DeckWeight } from "./panel-gradient";
import { getSharedVideoElement } from "./SecondaryGalleryPlanes";
import { ArtifactGrid, setAppCursor } from "./ArtifactGrid";
import {
  SecondaryGalleryPlanes,
} from "./SecondaryGalleryPlanes";
import { resolveArtifactMedia } from "./artifact-media";
import { dampTowards } from "./damp";
import { FisheyeEffect } from "./FisheyeEffect";
import {
  buildGravityTile,
  GRAVITY_DEFAULTS,
  type GravityParams,
} from "./gravity-layout";
import { containFit, type LayoutTile, type NeighborEntry } from "./layout-types";
import { PlayLoader } from "./PlayLoader";
import { PixelEmitter } from "./PixelEmitter";
import { PixelGlitch } from "@/components/primitives/PixelGlitch";
import { SelectProgressOverlay } from "./SelectProgressOverlay";
import {
  type TransitionConfig,
  DEFAULT_TRANSITION_CONFIG,
  cloneTransitionConfig,
  timelineEnd,
  holdTime,
} from "./transition-presets";
import {
  createTransitionFrame,
  sampleTransition,
  type TransitionFrame,
  type TransitionPhase,
} from "./transition-timeline";

/**
 * État réglable depuis le debug pane (dev only) : tweakpane écrit dedans, les
 * `useFrame` le lisent et l'appliquent à la scène. Rien ne passe par
 * `useState`, donc aucun re-render React par frame.
 *
 * Il voyage dans une `RefObject` plutôt qu'en valeur nue : c'est ce qui permet
 * aux enfants de ne le lire qu'en dehors du rendu, là où muter est légitime.
 */
export type PhysicsParams = {
  enabled: boolean;
  strength: number;
  radius: number;
  spring: number;
  damping: number;
  restitution: number;
  friction: number;
  lockRotation: boolean;
  mass: number;
};

export const PHYSICS_DEFAULTS: PhysicsParams = {
  enabled: true,
  strength: 2400,
  radius: 2600,
  spring: 0.7,
  damping: 12,
  restitution: 0.6,
  friction: 0.15,
  lockRotation: true,
  mass: 1,
};

export type FisheyeParams = {
  enabled: boolean;
  strength: number;
};

export const FISHEYE_DEFAULTS: FisheyeParams = {
  enabled: false,
  strength: 0.032,
};

export type WaveDirection =
  | "bottom-to-top"
  | "top-to-bottom"
  | "left-to-right"
  | "right-to-left"
  | "bl-to-tr"
  | "tl-to-br";

export type SelectOverlayParams = {
  direction: WaveDirection;
  crestSoftness: number;
  waveAmplitude: number;
  waveFrequency: number;
  waveSpeed: number;
  iridescence: number;
  baseOpacity: number;
  glowIntensity: number;
  /** Longueur du zoom blur radial sous la crête (0 = aucun, 1 = jusqu'au centre). */
  zoomBlur: number;
  /** Grossissement du média au passage de la crête (0 = aucun). */
  zoomPunch: number;
  /** Bombement type fisheye du média sous la crête. */
  bulge: number;
  /** Largeur de la lentille autour de la crête (fraction de la tuile). */
  lensWidth: number;
  /** Part de la déformation qui traîne derrière la crête (0..1). */
  lensTrail: number;
};

export const OVERLAY_DEFAULTS: SelectOverlayParams = {
  direction: "bl-to-tr",
  crestSoftness: 0.24,
  waveAmplitude: 0.15,
  waveFrequency: 6,
  waveSpeed: 2.6,
  iridescence: 0.64,
  baseOpacity: 0.64,
  glowIntensity: 1,
  zoomBlur: 0.8,
  zoomPunch: 0.48,
  bulge: 0.4,
  lensWidth: 0.4,
  lensTrail: 0,
};

export type AnimationStudioParams = {
  speed: number;
  loopLock: boolean;
  scrubMode: boolean;
  scrubProgress: number;
};

export const STUDIO_DEFAULTS: AnimationStudioParams = {
  speed: 1.0,
  loopLock: false,
  scrubMode: false,
  scrubProgress: 0,
};

export type CameraDebugParams = {
  zoom: number;
  motionBlur: boolean;
  motionBlurStrength: number;
  motionBlurMax: number;
};

export type PlayDebugState = {
  plane: { radius: number };
  indicator: { fadeSpeed: number; moveSpeed: number };
  camera: CameraDebugParams;
  gravity: GravityParams;
  pan: { dragThreshold: number; velocityWindowMs: number; friction: number };
  physics: PhysicsParams;
  transition: TransitionConfig;
  fisheye: FisheyeParams;
  overlay: SelectOverlayParams;
  studio: AnimationStudioParams;
};

export type PlayDebugRef = RefObject<PlayDebugState>;

/**
 * État runtime : sélection / survol / caméra / indicateur / transition 2 temps —
 * écrit par les interactions (clic, survol, pan, flèches, entrée), lu par les `useFrame`.
 */
export type PlayRuntimeState = {
  selected: number;
  /**
   * Position monde absolue de `selected`, mise à jour uniquement par un
   * changement de sélection (clic, flèche) — jamais par le pan ni le survol.
   */
  selectedPos: { x: number; y: number };
  hovered: number | null;
  hoveredPos: { x: number; y: number; width: number; height: number } | null;
  camera: {
    targetX: number;
    targetY: number;
    mode: "follow" | "settle";
    /**
     * Reliquats absorbant les sauts de courbe lors d'un changement de phase
     * (hold non convergé, échappée en plein vol). Ajoutés à la courbe puis
     * résorbés, ils la laissent intacte tout en gardant l'image continue.
     */
    settleX: number;
    settleY: number;
    /** Reliquat de zoom, multiplicatif : tend vers 1. */
    settleZoom: number;
    /** Phase de la frame précédente, pour détecter les sauts. */
    lastPhase: TransitionPhase;
  };
  /** Vecteur de flou de mouvement induit par la caméra (unités proportionnelles écran). */
  cameraBlur: { x: number; y: number };
  indicatorTarget: { x: number; y: number; width: number; height: number };
  repulsor: {
    active: boolean;
    pointIndex: number;
    x: number;
    y: number;
  };
  /**
   * La transition se résume à une horloge et une phase logique : tout le
   * mouvement est dérivé de `t` par `sampleTransition`, qui remplit `frame`.
   * Cf. `transition-timeline.ts`.
   */
  transition: {
    phase: TransitionPhase;
    /** Horloge de la timeline, en secondes depuis son début. */
    t: number;
    /** 0..1 — avancement du hold, réversible tant que la timeline n'a pas démarré. */
    /** 0..1 — avancement de la vague de charge (miroir de `frame.waveProgress`). */
    selectProgress: number;
    targetIndex: number;
    /** Mémorise que le panneau a été notifié, pour n'appeler le callback qu'une fois. */
    textRevealed: boolean;
    navbarRevealed: boolean;
    columnScrollY: number;
    targetColumnScrollY: number;
    isSnapping: boolean;
    /** Les données du « pack » sont téléchargées : la timeline peut passer au boom. */
    ready: boolean;
    /** Temps réel depuis le clic (tortillement). */
    wall: number;
    /** Cycles de la vague qui boucle pendant l'attente. */
    loop: number;
    /** La timeline attend le téléchargement. */
    holding: boolean;
    /** Annulation en cours d'entrée : `t` recule jusqu'à 0 (vrai rewind). */
    rewinding: boolean;
    /** La vague a traversé l'artifact (ou le pack était déjà prêt). */
    passed: boolean;
    /** Cycle de boucle auquel on libère l'attente une fois prêt. */
    releaseAt: number | null;
    /** Frame figé au moment d'une annulation en cours d'entrée. */
    returnFrom: TransitionFrame | null;
    /** Échantillon de la frame courante, partagé par tous les `useFrame`. */
    frame: TransitionFrame;
  };
};
export type PlayRuntimeRef = RefObject<PlayRuntimeState>;

/** Remet l'horloge et le hold à zéro, sans toucher à la phase. */
function rewindTransition(rc: PlayRuntimeState) {
  rc.transition.t = 0;
  rc.transition.selectProgress = 0;
  rc.transition.textRevealed = false;
  rc.transition.navbarRevealed = false;
}

/**
 * Démarre la timeline sur `pointIndex` : le clic lance directement la vague,
 * puis le boom. Il n'y a plus de hold.
 */
export function startPlayback(rc: PlayRuntimeState, pointIndex: number) {
  if (rc.transition.phase !== "idle") return;
  rc.transition.targetIndex = pointIndex;
  rc.transition.phase = "playing";
  rc.transition.t = 0;
  rc.transition.selectProgress = 0;
  rc.transition.textRevealed = false;
  rc.transition.navbarRevealed = false;
  rc.transition.columnScrollY = 0;
  rc.transition.targetColumnScrollY = 0;
  rc.transition.isSnapping = false;
  rc.transition.ready = false;
  rc.transition.wall = 0;
  rc.transition.loop = 0;
  rc.transition.holding = false;
  rc.transition.rewinding = false;
  rc.transition.passed = false;
  rc.transition.releaseAt = null;
  rc.transition.returnFrom = null;
  rc.camera.mode = "settle";
  rc.repulsor.active = true;
  rc.repulsor.pointIndex = pointIndex;
  rc.repulsor.x = rc.selectedPos.x;
  rc.repulsor.y = rc.selectedPos.y;
}

export function applyResetTransition(rc: PlayRuntimeState) {
  rc.transition.isSnapping = false;
  setAppCursor("auto");
  rc.hovered = null;
  rc.hoveredPos = null;

  // Depuis la vue détail (ou n'importe où dans la timeline d'entrée), on ne
  // coupe pas : on bascule sur la timeline de sortie, qui repart de zéro.
  // On ne modifie pas targetColumnScrollY ici pour éviter tout spin arrière.
  if (rc.transition.phase === "playing") {
    // Annulée en cours d'entrée : on rejoue le film à l'envers. Le sampler est
    // une fonction pure de `t`, donc faire reculer `t` suffit — chaque grandeur
    // repasse exactement par où elle est venue, sans interpolation de secours.
    rc.transition.holding = false;
    rc.transition.releaseAt = null;
    rc.transition.rewinding = true;
    rc.camera.mode = "settle";
    return;
  }

  if (rc.transition.phase === "isolated") {
    rc.transition.returnFrom = null;
    rc.transition.holding = false;
    rc.transition.phase = "returning";
    rc.camera.mode = "settle";
    rewindTransition(rc);
    return;
  }

  rc.transition.rewinding = false;
  rc.transition.targetColumnScrollY = 0;
  rc.transition.phase = "idle";
  rc.transition.targetIndex = -1;
  rc.transition.columnScrollY = 0;
  rc.repulsor.active = false;
  rc.repulsor.pointIndex = -1;
  rc.camera.mode = "settle";
  rewindTransition(rc);
}

function applyKeyDownEnter(
  rc: PlayRuntimeState,
  points: readonly { x: number; y: number }[],
) {
  if (rc.transition.phase === "isolated" || rc.transition.phase === "returning") {
    applyResetTransition(rc);
    return;
  }
  if (rc.transition.phase !== "idle") return;
  const selPt = points[rc.selected];
  if (!selPt) return;
  startPlayback(rc, rc.selected);
}

function applyPanWheel(
  rc: PlayRuntimeState,
  deltaX: number,
  deltaY: number,
  zoom: number,
) {
  if (rc.transition.phase !== "idle") return;
  rc.camera.mode = "follow";
  rc.camera.targetX += deltaX / zoom;
  rc.camera.targetY -= deltaY / zoom;
}

function applyPanPointerMove(
  rc: PlayRuntimeState,
  dx: number,
  dy: number,
  zoom: number,
) {
  rc.camera.mode = "follow";
  rc.camera.targetX -= dx / zoom;
  rc.camera.targetY += dy / zoom;
}

function applyArrowNavigation(
  rc: PlayRuntimeState,
  match: { dx: number; dy: number; index: number },
  point: { width: number; height: number },
) {
  const worldX = rc.selectedPos.x + match.dx;
  const worldY = rc.selectedPos.y + match.dy;
  rc.selected = match.index;
  rc.selectedPos = { x: worldX, y: worldY };
  rc.hovered = null;
  rc.hoveredPos = null;
  rc.camera.targetX = worldX;
  rc.camera.targetY = worldY;
  rc.camera.mode = "settle";
  rc.indicatorTarget = { x: worldX, y: worldY, width: point.width, height: point.height };
}

// ── Ouverture — image ────────────────────────────────────────────────────
const PLANE_RADIUS = 16;

// ── Ouverture — indicateur (vitesses d'amortissement, par seconde) ──────
const INDICATOR_FADE_SPEED = 26;
const INDICATOR_MOVE_SPEED = 6;

// ── Ouverture — caméra ────────────────────────────────────────────────────
const CAMERA_ZOOM = 0.8;
const CAMERA_MOTION_BLUR_ENABLED = false;
const CAMERA_MOTION_BLUR_STRENGTH = 4.0;
const CAMERA_MOTION_BLUR_MAX = 0.25;
const CAMERA_SETTLE_SPEED = 8;
/** Vitesse d'extinction des reliquats de courbe : assez rapide pour disparaître
 *  sous la seconde, assez lente pour ne jamais se voir comme un saut. */
const SETTLE_DECAY_SPEED = 12;
/** Le glissement de la caméra vers la tuile cliquée, plus doux que le zoom. */
const SETTLE_POS_DECAY_SPEED = 4.5;
const DEFAULT_NEIGHBOR_K = 6;

// ── Ouverture — pan ───────────────────────────────────────────────────────
const DRAG_THRESHOLD = 6;
const VELOCITY_WINDOW_MS = 80;
const INERTIA_FRICTION = -0.5;
const VELOCITY_EPSILON = 0.0001;

/** Texture tirée au double de la largeur affichée, pour les écrans retina. */
const RETINA_MULTIPLIER = 2;

/** Directions flèches en espace monde (+Y vers le haut, three.js). */
const ARROW_DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};
/** Cône de ±60° autour de la direction pressée. */
const DIRECTION_CONE_COS = Math.cos((60 * Math.PI) / 180);

/**
 * Animation fluide d'apparition du contenu texte depuis le bas lors du focus.
 */
const DETAIL_PANEL_VARIANTS: Variants = {
  hidden: (desktop: boolean) =>
    desktop ? { opacity: 0, x: 48 } : { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
  exit: (desktop: boolean) => ({
    opacity: 0,
    ...(desktop ? { x: 32 } : { y: 32 }),
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  }),
};

const DETAIL_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
};

/**
 * Tweakpane reste hors du SSR et chargé uniquement à la demande si #debug est présent.
 */
const PlayDebug = dynamic(() => import("./PlayDebug").then((m) => m.PlayDebug), {
  ssr: false,
});

/**
 * Décalage horizontal de la caméra pour amener la colonne à `detailColumnRatio`.
 *
 * La largeur visible est évaluée au **zoom final**, pas au zoom courant : sinon
 * la cible se déplacerait pendant la rampe de zoom et la caméra poursuivrait un
 * point mobile — un des mouvements parasites de l'ancienne version.
 */
function framingOffsetX(
  config: TransitionConfig,
  baseZoom: number,
  framing: number,
  screenSize?: { width: number; height: number },
): number {
  const width = screenSize?.width ?? 1920;
  const height = screenSize?.height ?? 1080;
  const isDesktop = width >= 1024 && width >= height;
  if (!isDesktop || framing <= 0) return 0;
  const visibleW = width / Math.max(0.1, baseZoom * config.detailZoom);
  return (0.5 - config.detailColumnRatio * 0.5) * visibleW * framing;
}

/**
 * Décalage vertical de la caméra en portrait pour cadrer le média dans la moitié supérieure,
 * libérant la moitié inférieure pour le panneau d'informations.
 */
function framingOffsetY(
  config: TransitionConfig,
  baseZoom: number,
  framing: number,
  screenSize?: { width: number; height: number },
): number {
  const width = screenSize?.width ?? 1920;
  const height = screenSize?.height ?? 1080;
  const isDesktop = width >= 1024 && width >= height;
  if (isDesktop || framing <= 0) return 0;
  const visibleH = height / Math.max(0.1, baseZoom * config.detailZoom);
  return -0.2 * visibleH * framing;
}

/**
 * Avance l'horloge et gère les seuls changements de phase qui subsistent.
 * Aucun mouvement ici : le mouvement est entièrement décrit par la timeline.
 */
function advanceClock(
  rc: PlayRuntimeState,
  config: TransitionConfig,
  effDelta: number,
  studio?: AnimationStudioParams,
) {
  const tr = rc.transition;

  if (tr.phase === "playing") {
    if (tr.rewinding) {
      tr.wall += effDelta;
      tr.t = Math.max(0, tr.t - effDelta * Math.max(0.1, config.rewindSpeed ?? 1));
      return;
    }
    const end = timelineEnd(config);
    if (studio?.scrubMode) {
      tr.t = Math.max(0, Math.min(1, studio.scrubProgress)) * end;
      return;
    }
    tr.wall += effDelta;
    const hold = holdTime(config);

    if (tr.holding) {
      // Le pack n'est pas encore téléchargé : la vague boucle, l'artifact se tortille.
      tr.loop += effDelta * (config.loadWaveSpeed ?? 0.9);
      if (tr.ready && tr.releaseAt === null) tr.releaseAt = Math.ceil(tr.loop);
      if (tr.ready && tr.releaseAt !== null && tr.loop >= tr.releaseAt) {
        tr.holding = false;
        tr.passed = true;
      }
      return;
    }

    tr.t += effDelta;
    if (!tr.passed && tr.t >= hold) {
      if (tr.ready) {
        tr.passed = true;
      } else {
        tr.t = hold;
        tr.holding = true;
        tr.loop = 0;
        tr.releaseAt = null;
        return;
      }
    }
    if (tr.t >= end) {
      if (studio?.loopLock) {
        tr.t = 0;
        tr.wall = 0;
        tr.passed = false;
        tr.textRevealed = false;
        tr.navbarRevealed = false;
        return;
      }
      tr.t = end;
      tr.phase = "isolated";
    }
    return;
  }

  if (tr.phase === "returning") {
    tr.t += effDelta;
  }
}

function stepCamera(
  camera: OrthographicCamera,
  rc: PlayRuntimeState,
  velocity: { x: number; y: number },
  friction: number,
  baseZoom: number,
  config: TransitionConfig,
  delta: number,
  studio?: AnimationStudioParams,
  screenSize?: { width: number; height: number },
  onTextReveal?: () => void,
  onReturnComplete?: () => void,
  onNavbarReveal?: () => void,
) {
  const effDelta = delta * (studio?.speed ?? 1);
  const tr = rc.transition;

  advanceClock(rc, config, effDelta, studio);
  sampleTransition(config, tr, tr.frame);
  const frame = tr.frame;
  tr.selectProgress = frame.waveProgress;

  // Le panneau de détail est notifié une seule fois, sur le front montant.
  if (frame.textRevealed !== tr.textRevealed) {
    tr.textRevealed = frame.textRevealed;
    if (frame.textRevealed) onTextReveal?.();
  }
  if (frame.navbarRevealed !== tr.navbarRevealed) {
    tr.navbarRevealed = frame.navbarRevealed;
    if (frame.navbarRevealed) onNavbarReveal?.();
  }

  // ── Défilement libre de la colonne (vue détail) ─────────────────────────
  if (tr.phase === "isolated") {
    tr.columnScrollY = dampTowards(
      tr.columnScrollY,
      tr.targetColumnScrollY,
      config.detailScrollDamping,
      effDelta,
    );
  } else if (tr.phase === "returning") {
    // Ne pas modifier targetColumnScrollY ni columnScrollY pendant le retour :
    // l'itération la plus proche de M0 est directement ramenée à sa tuile sur la mosaïque, sans faire tourner la colonne.
  }

  // La courbe : ce que la caméra devrait valoir à cet instant, sans mémoire.
  const curveZoom = baseZoom * frame.zoom;
  const curveX = rc.selectedPos.x + framingOffsetX(config, baseZoom, frame.framing, screenSize);
  const curveY = rc.selectedPos.y + framingOffsetY(config, baseZoom, frame.framing, screenSize);

  // Un changement de phase peut déplacer la courbe d'un coup — hold qui se
  // valide avant que le recentrage ait convergé, échappée en plein vol. On
  // convertit l'écart en reliquat qui s'éteint : la courbe reste intacte (donc
  // jamais déformée par un amortissement) et l'image reste continue.
  if (tr.phase !== rc.camera.lastPhase) {
    rc.camera.lastPhase = tr.phase;
    if (tr.phase === "playing" || tr.phase === "isolated" || tr.phase === "returning") {
      rc.camera.settleX = camera.position.x - curveX;
      rc.camera.settleY = camera.position.y - curveY;
      rc.camera.settleZoom = camera.zoom / Math.max(0.0001, curveZoom);
    } else {
      rc.camera.settleX = 0;
      rc.camera.settleY = 0;
      rc.camera.settleZoom = 1;
    }
  }

  // ── Repos : zoom de base et pan inertiel ────────────────────────────────
  if (tr.phase === "idle") {
    if (Math.abs(camera.zoom - baseZoom) > 0.0005) {
      camera.zoom = dampTowards(camera.zoom, baseZoom, 8, effDelta);
      camera.updateProjectionMatrix();
    }

    if (rc.camera.mode === "follow") {
      if (velocity.x !== 0 || velocity.y !== 0) {
        rc.camera.targetX += velocity.x * delta * 1000;
        rc.camera.targetY += velocity.y * delta * 1000;
        const decay = Math.exp(friction * delta);
        velocity.x *= decay;
        velocity.y *= decay;
        if (Math.abs(velocity.x) < VELOCITY_EPSILON && Math.abs(velocity.y) < VELOCITY_EPSILON) {
          velocity.x = 0;
          velocity.y = 0;
        }
      }
      // Lissage léger : les deltas discrets de la molette ne sautent plus d'une frame à l'autre.
      camera.position.x = dampTowards(camera.position.x, rc.camera.targetX, 22, effDelta);
      camera.position.y = dampTowards(camera.position.y, rc.camera.targetY, 22, effDelta);
      return;
    }
    camera.position.x = dampTowards(camera.position.x, rc.camera.targetX, CAMERA_SETTLE_SPEED, effDelta);
    camera.position.y = dampTowards(camera.position.y, rc.camera.targetY, CAMERA_SETTLE_SPEED, effDelta);
    return;
  }

  // ── Transition : la courbe s'applique telle quelle ──────────────────────
  rc.camera.settleZoom = dampTowards(rc.camera.settleZoom, 1, SETTLE_DECAY_SPEED, effDelta);
  const appliedZoom = curveZoom * rc.camera.settleZoom;
  if (Math.abs(camera.zoom - appliedZoom) > 0.00001) {
    camera.zoom = appliedZoom;
    camera.updateProjectionMatrix();
  }

  rc.camera.settleX = dampTowards(rc.camera.settleX, 0, SETTLE_POS_DECAY_SPEED, effDelta);
  rc.camera.settleY = dampTowards(rc.camera.settleY, 0, SETTLE_POS_DECAY_SPEED, effDelta);
  camera.position.x = curveX + rc.camera.settleX;
  camera.position.y = curveY + rc.camera.settleY;

  const exitEnd = config.exit.start + config.exit.duration + config.cameraReturnDelay;
  const returned =
    (tr.phase === "returning" && tr.t >= exitEnd) ||
    (tr.phase === "playing" && tr.rewinding && tr.t <= 0);
  if (returned) {
    tr.rewinding = false;
    // La courbe a déjà ramené la caméra au repos : on se contente de recaler
    // la cible du pan sur ce que la courbe vient de produire.
    camera.zoom = baseZoom;
    camera.updateProjectionMatrix();
    camera.position.x = curveX;
    camera.position.y = curveY;
    rc.camera.targetX = curveX;
    rc.camera.targetY = curveY;
    tr.phase = "idle";
    tr.t = 0;
    tr.targetIndex = -1;
    tr.columnScrollY = 0;
    tr.targetColumnScrollY = 0;
    rc.camera.settleX = 0;
    rc.camera.settleY = 0;
    rc.camera.settleZoom = 1;
    rc.camera.lastPhase = "idle";
    rc.repulsor.active = false;
    rc.repulsor.pointIndex = -1;
    sampleTransition(config, tr, frame);
    onReturnComplete?.();
  }
}

function CameraRig({
  debug,
  runtime,
  velocity,
  onTextReveal,
  onNavbarReveal,
  onReturnComplete,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  velocity: RefObject<{ x: number; y: number }>;
  onTextReveal?: () => void;
  onNavbarReveal?: () => void;
  onReturnComplete?: () => void;
}) {
  const prevCamPosRef = useRef({ x: 0, y: 0, initialized: false });
  const blurSmoothedRef = useRef({ x: 0, y: 0 });

  // Priorité -1 : l'échantillonnage de la timeline doit précéder tous les autres
  // `useFrame`, qui lisent le frame qu'il vient de remplir. Une priorité négative
  // ordonne sans basculer r3f en rendu manuel (seul un `> 0` le ferait).
  useFrame((state, delta) => {
    const cam = state.camera as OrthographicCamera;
    stepCamera(
      cam,
      runtime.current,
      velocity.current,
      debug.current.pan.friction,
      debug.current.camera.zoom,
      debug.current.transition,
      delta,
      debug.current.studio,
      state.size,
      onTextReveal,
      onReturnComplete,
      onNavbarReveal,
    );

    // Vélocité instantanée de la caméra pour le flou de mouvement global
    if (!prevCamPosRef.current.initialized) {
      prevCamPosRef.current = { x: cam.position.x, y: cam.position.y, initialized: true };
    }

    const camVx = delta > 0 ? (cam.position.x - prevCamPosRef.current.x) / delta : 0;
    const camVy = delta > 0 ? (cam.position.y - prevCamPosRef.current.y) / delta : 0;
    prevCamPosRef.current.x = cam.position.x;
    prevCamPosRef.current.y = cam.position.y;

    const camCfg = debug.current.camera;
    let targetBlurX = 0;
    let targetBlurY = 0;

    if (camCfg.motionBlur) {
      const speed = Math.hypot(camVx, camVy);
      const strength = camCfg.motionBlurStrength ?? 1.0;
      const maxBlur = camCfg.motionBlurMax ?? 0.08;
      // Normaliser par rapport à la taille d'une tuile standard (~400px)
      const normSpeed = speed / 400;
      const blurMag = Math.min(maxBlur, normSpeed * 0.0035 * strength);
      if (speed > 1e-4) {
        // Le flou s'étire dans le sens inverse du déplacement de la caméra (traînée apparente)
        targetBlurX = (-camVx / speed) * blurMag;
        targetBlurY = (-camVy / speed) * blurMag;
      }
    }

    const smoothing = 20;
    blurSmoothedRef.current.x +=
      (targetBlurX - blurSmoothedRef.current.x) * Math.min(1, delta * smoothing);
    blurSmoothedRef.current.y +=
      (targetBlurY - blurSmoothedRef.current.y) * Math.min(1, delta * smoothing);

    if (Math.abs(blurSmoothedRef.current.x) < 0.0004) blurSmoothedRef.current.x = 0;
    if (Math.abs(blurSmoothedRef.current.y) < 0.0004) blurSmoothedRef.current.y = 0;

    if (!runtime.current.cameraBlur) {
      runtime.current.cameraBlur = { x: 0, y: 0 };
    }
    runtime.current.cameraBlur.x = blurSmoothedRef.current.x;
    runtime.current.cameraBlur.y = blurSmoothedRef.current.y;
  }, -1);

  return null;
}

export function PlayCanvas({ artifacts }: { artifacts: PlayArtifact[] }) {
  const debug = useRef<PlayDebugState>({
    plane: { radius: PLANE_RADIUS },
    indicator: { fadeSpeed: INDICATOR_FADE_SPEED, moveSpeed: INDICATOR_MOVE_SPEED },
    camera: {
      zoom: CAMERA_ZOOM,
      motionBlur: CAMERA_MOTION_BLUR_ENABLED,
      motionBlurStrength: CAMERA_MOTION_BLUR_STRENGTH,
      motionBlurMax: CAMERA_MOTION_BLUR_MAX,
    },
    gravity: { ...GRAVITY_DEFAULTS },
    pan: {
      dragThreshold: DRAG_THRESHOLD,
      velocityWindowMs: VELOCITY_WINDOW_MS,
      friction: INERTIA_FRICTION,
    },
    physics: { ...PHYSICS_DEFAULTS },
    transition: cloneTransitionConfig(DEFAULT_TRANSITION_CONFIG),
    fisheye: { ...FISHEYE_DEFAULTS },
    overlay: { ...OVERLAY_DEFAULTS },
    studio: { ...STUDIO_DEFAULTS },
  });

  const runtime = useRef<PlayRuntimeState>({
    selected: 0,
    selectedPos: { x: 0, y: 0 },
    hovered: null,
    hoveredPos: null,
    camera: { targetX: 0, targetY: 0, mode: "follow", settleX: 0, settleY: 0, settleZoom: 1, lastPhase: "idle" },
    cameraBlur: { x: 0, y: 0 },
    indicatorTarget: {
      x: 0,
      y: 0,
      width: GRAVITY_DEFAULTS.maxWidth,
      height: GRAVITY_DEFAULTS.maxHeight,
    },
    repulsor: {
      active: false,
      pointIndex: -1,
      x: 0,
      y: 0,
    },
    transition: {
      phase: "idle",
      t: 0,
      selectProgress: 0,
      targetIndex: -1,
      textRevealed: false,
      navbarRevealed: false,
      columnScrollY: 0,
      targetColumnScrollY: 0,
      isSnapping: false,
      ready: false,
      wall: 0,
      loop: 0,
      holding: false,
      rewinding: false,
      passed: false,
      releaseAt: null,
      returnFrom: null,
      frame: createTransitionFrame(),
    },
  });
  const velocity = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const initializedTileRef = useRef<boolean | null>(null);

  const [gravityParams, setGravityParams] = useState<GravityParams>(() => ({
    ...GRAVITY_DEFAULTS,
  }));
  const handleLayoutChange = useCallback(() => {
    setGravityParams({ ...debug.current.gravity });
  }, []);

  const handleResetTransition = useCallback(() => {
    applyResetTransition(runtime.current);
  }, []);

  const [textLayoutRev, setTextLayoutRev] = useState(0);
  const handleTextLayoutChange = useCallback(() => setTextLayoutRev((r) => r + 1), []);

  const [viewport, setViewport] = useState(() => {
    if (typeof window !== "undefined") {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1920, height: 1080 };
  });
  const isDesktop = viewport.width >= 1024 && viewport.width >= viewport.height;
  useEffect(() => {
    function measure() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }
    measure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    }
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const [showDebug, setShowDebug] = useState(false);
  useEffect(() => {
    function checkHash() {
      setShowDebug(window.location.hash === "#debug");
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  const [dynamicRatios, setDynamicRatios] = useState<Record<string, number>>({});

  const media = useMemo(() => artifacts.map(resolveArtifactMedia), [artifacts]);

  // Détection dynamique du ratio réel des vidéos pour rattraper immédiatement
  // tout nouvel asset vidéo dont le ratio différerait ou ne serait pas encore en cache.
  useEffect(() => {
    media.forEach((m) => {
      if (m.kind === "video" && m.url) {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.src = m.url;
        v.onloadedmetadata = () => {
          if (v.videoWidth && v.videoHeight) {
            const actualRatio = v.videoWidth / v.videoHeight;
            if (Math.abs(m.ratio - actualRatio) > 0.02) {
              setDynamicRatios((prev) => {
                if (prev[m.url] && Math.abs(prev[m.url] - actualRatio) < 0.01) return prev;
                return { ...prev, [m.url]: actualRatio };
              });
            }
          }
        };
      }
    });
  }, [media]);

  const ratios = useMemo(
    () =>
      media.map((m) => {
        if (m.kind === "video" && dynamicRatios[m.url]) {
          return dynamicRatios[m.url];
        }
        return m.ratio;
      }),
    [media, dynamicRatios],
  );
  const mediaKinds = useMemo(() => media.map((m) => m.kind), [media]);

  const [tile, setTile] = useState<LayoutTile | null>(null);
  const [isCalculated, setIsCalculated] = useState(false);
  const [selectedArtifactIndex, setSelectedArtifactIndex] = useState<number | null>(null);
  const [selectedArtifactDetail, setSelectedArtifactDetail] = useState<ArtifactDetail | null>(null);
  const [principalPoint, setPrincipalPoint] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(false);
  const [apiStatus, setApiStatus] = useState<"idle" | "fetching" | "ready" | "error">("idle");


  useEffect(() => {
    const idle = selectedArtifactIndex === null;
    const slug = selectedArtifactIndex !== null ? artifacts[selectedArtifactIndex]?.slug : null;
    runtime.current.transition.ready = idle ? false : !slug || apiStatus === "ready" || apiStatus === "error";
  }, [apiStatus, selectedArtifactIndex, artifacts]);

  const selectionToken = useRef(0);

  const handleStartSelect = useCallback(
    (artifactIndex: number, point?: { x: number; y: number; width: number; height: number }) => {
      if (point) setPrincipalPoint(point);
      setSelectedArtifactIndex(artifactIndex);
      const artifact = artifacts[artifactIndex];
      const token = ++selectionToken.current;
      if (artifact?.slug) {
        setApiStatus("fetching");
        const startedAt = performance.now();
        preloadArtifact(artifact.slug)
          .then(async (data) => {
            // Debug : rallonge artificiellement le chargement pour observer l'attente.
            const extra =
              debug.current.transition.simulatedLoadMs - (performance.now() - startedAt);
            if (extra > 0) await new Promise((resolve) => setTimeout(resolve, extra));
            if (token !== selectionToken.current) return;
            if (data) {
              setSelectedArtifactDetail(data);
              setApiStatus("ready");
            } else {
              setApiStatus("error");
            }
          })
          .catch(() => {
            if (token !== selectionToken.current) return;
            setApiStatus("error");
          });
      }
    },
    [artifacts],
  );

  /** Front montant de la piste de texte : le panneau de détail apparaît. */
  const handleTextReveal = useCallback(() => {
    setIsDetailVisible(true);
  }, []);

  /** Front montant de la navbar : elle change un peu avant la fin du rouleau. */
  const handleNavbarReveal = useCallback(() => {
    setIsNavbarVisible(true);
  }, []);

  const { setProject, clearProject } = useActionBar();

  const handleCloseDetail = useCallback(() => {
    selectionToken.current++;
    setIsDetailVisible(false);
    setIsNavbarVisible(false);
    clearProject();
    applyResetTransition(runtime.current);
  }, [clearProject]);

  const handleReturnComplete = useCallback(() => {
    setIsNavbarVisible(false);
    setSelectedArtifactDetail(null);
    setPrincipalPoint(null);
    setSelectedArtifactIndex(null);
    setApiStatus("idle");
    runtime.current.transition.columnScrollY = 0;
    runtime.current.transition.targetColumnScrollY = 0;
  }, []);

  // Le bouton retour (avec le nom de l'artifact) est là dès le clic : il annule
  // l'entrée en cours, ou ferme la vue détail.
  const selectedTitle =
    selectedArtifactIndex !== null
      ? selectedArtifactDetail?.title || artifacts[selectedArtifactIndex]?.title || "Artifact"
      : null;
  const selectedLink = selectedArtifactDetail?.link ?? null;

  useEffect(() => {
    if (selectedTitle && runtime.current.transition.phase !== "returning") {
      setProject({ title: selectedTitle, redirectUrl: selectedLink, onBack: handleCloseDetail });
    } else {
      clearProject();
    }
    return () => {
      clearProject();
    };
  }, [selectedTitle, selectedLink, setProject, clearProject, handleCloseDetail]);

  const handleSimulateSelect = useCallback(() => {
    const rc = runtime.current;
    if (rc.transition.phase !== "idle") return;
    const selIndex = rc.selected >= 0 ? rc.selected : 0;
    startPlayback(rc, selIndex);
    if (tile?.points[selIndex]) {
      handleStartSelect(tile.points[selIndex].artifactIndex, {
        ...tile.points[selIndex],
        x: rc.selectedPos.x,
        y: rc.selectedPos.y,
      });
    }
  }, [handleStartSelect, tile]);

  const viewportAspect =
    gravityParams.targetAspect && gravityParams.targetAspect > 0
      ? gravityParams.targetAspect
      : (viewport.height > 0 ? viewport.width / viewport.height : 1.6);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const computedTile = buildGravityTile(
        ratios,
        gravityParams,
        viewportAspect,
      );
      setTile(computedTile);
      setIsCalculated(true);
    }, 16);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ratios, gravityParams, viewportAspect]);

  const textureUrls = useMemo(
    () =>
      media.map((m, i) => {
        if (m.kind === "video") return playMediaUrl(m.url);
        const { width } = containFit(ratios[i], gravityParams.maxWidth, gravityParams.maxHeight);
        return playMediaUrl(
          buildImageUrl(m.ref, null, null, null, {
            width: Math.round(width * RETINA_MULTIPLIER),
          }),
        );
      }),
    [media, ratios, gravityParams],
  );

  const primaryMedia = useMemo(() => {
    if (selectedArtifactIndex === null) return null;
    return {
      url: textureUrls[selectedArtifactIndex] ?? "",
      kind: mediaKinds[selectedArtifactIndex] ?? "image",
      ratio: ratios[selectedArtifactIndex] ?? 1.5,
    };
  }, [selectedArtifactIndex, textureUrls, mediaKinds, ratios]);

  // Palettes (3 teintes) des médias de la pile ; le dégradé du side panel les
  // mélange en continu selon le poids de chaque carte visible.
  const deckWeightsRef = useRef<DeckWeight[]>([]);
  const palettesRef = useRef<Map<string, RGB[]>>(new Map());
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  usePanelGradient(panelEl, deckWeightsRef, palettesRef, debug);

  const loadPalette = useCallback((media: { url: string; kind: "image" | "video" }) => {
    if (palettesRef.current.has(media.url)) return;
    if (media.kind === "image") {
      paletteFromImageUrl(media.url).then((p) => {
        if (p) palettesRef.current.set(media.url, p);
      });
      return;
    }
    let attempts = 0;
    const sample = () => {
      const video = getSharedVideoElement(media.url);
      const p = video ? paletteFromVideo(video) : null;
      if (p) palettesRef.current.set(media.url, p);
      else if (attempts++ < 10) setTimeout(sample, 300);
    };
    sample();
  }, []);

  useEffect(() => {
    palettesRef.current = new Map();
    if (primaryMedia) loadPalette({ url: primaryMedia.url, kind: primaryMedia.kind });
  }, [primaryMedia, loadPalette]);

  useEffect(() => {
    if (!tile || tile.points.length === 0) return;
    const rc = runtime.current;
    if (!initializedTileRef.current || rc.selected < 0 || rc.selected >= tile.points.length) {
      initializedTileRef.current = true;
      const origin = tile.points[tile.originIndex];
      rc.selected = tile.originIndex;
      rc.hovered = null;
      rc.hoveredPos = null;
      const ox = origin ? origin.x : 0;
      const oy = origin ? origin.y : 0;
      rc.selectedPos = { x: ox, y: oy };
      rc.camera = { targetX: ox, targetY: oy, mode: "follow", settleX: 0, settleY: 0, settleZoom: 1, lastPhase: "idle" };
      if (origin) {
        rc.indicatorTarget = { x: ox, y: oy, width: origin.width, height: origin.height };
      }
    }
  }, [tile]);

  // ── Préchargement DOM & Drei des textures (mosaïque et galeries de détail) ─
  const [loaded, setLoaded] = useState(0);

  // Rassemble les médias visibles de la mosaïque principale pour le loader initial
  const allMediaToPreload = useMemo(() => {
    const list: { url: string; kind: "image" | "video" }[] = [];
    const seen = new Set<string>();

    textureUrls.forEach((url, i) => {
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push({ url, kind: mediaKinds[i] ?? "image" });
      }
    });

    return list;
  }, [textureUrls, mediaKinds]);

  const total = allMediaToPreload.length;

  useEffect(() => {
    if (total === 0) return;
    let cancelled = false;
    let count = 0;
    const elements: (HTMLImageElement | HTMLVideoElement)[] = [];

    function bump() {
      if (cancelled) return;
      count += 1;
      setLoaded(count);
    }

    allMediaToPreload.forEach((m) => {
      if (m.kind === "video") {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = m.url;
        let fired = false;
        const onDone = () => {
          if (fired) return;
          fired = true;
          bump();
        };
        video.onloadeddata = onDone;
        video.onerror = onDone;
        setTimeout(onDone, 1800);
        elements.push(video);
        return;
      }
      try {
        useTexture.preload(m.url);
      } catch {}
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = img.onerror = bump;
      img.src = m.url;
      elements.push(img);
    });

    return () => {
      cancelled = true;
      for (const el of elements) {
        if (el instanceof HTMLImageElement) {
          el.onload = null;
          el.onerror = null;
        } else if (el instanceof HTMLVideoElement) {
          el.onloadeddata = null;
          el.onerror = null;
        }
      }
    };
  }, [allMediaToPreload, total]);

  const isReady =
    isCalculated &&
    tile !== null &&
    tile.points.length > 0 &&
    total > 0 &&
    loaded >= total;

  // ── Pan : molette + drag, avec inertie à la relâche ──────────────────────
  useEffect(() => {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    const recent: { x: number; y: number; t: number }[] = [];
    let wheelAcc = 0;
    let lastWheelAt = 0;
    let lastStepAt = 0;

    function onWheel(e: WheelEvent) {
      e.preventDefault();

      // Le contrôle du zoom est interdit à l'utilisateur (pinch trackpad Mac ou Cmd+scroll)
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      if (runtime.current.transition.phase === "isolated") {
        const isDesktopLayout = window.innerWidth >= 1024 && window.innerWidth >= window.innerHeight;
        const deltaVal = isDesktopLayout
          ? e.deltaY
          : (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
        const now = performance.now();
        if (now - lastWheelAt > 160) wheelAcc = 0;
        lastWheelAt = now;
        wheelAcc += deltaVal;
        const cooldown = (debug.current.transition.stepCooldown ?? 0.35) * 1000;
        if (Math.abs(wheelAcc) >= 36 && now - lastStepAt >= cooldown) {
          const tr = runtime.current.transition;
          tr.targetColumnScrollY = Math.round(tr.targetColumnScrollY) + Math.sign(wheelAcc);
          lastStepAt = now;
          wheelAcc = 0;
        }
        return;
      }

      // ── Pan : défilement standard au trackpad / molette ─────────────────────
      velocity.current.x = 0;
      velocity.current.y = 0;
      applyPanWheel(runtime.current, e.deltaX, e.deltaY, debug.current.camera.zoom);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const curPhase = runtime.current.transition.phase;
      if (
        curPhase === "isolated" ||
        curPhase === "playing" ||
        curPhase === "returning"
      ) {
        // Un clic dans le vide ne fait pas retourner dans le canvas !
        dragging = true;
        dragMoved.current = false;
        startX = lastX = e.clientX;
        startY = lastY = e.clientY;
        return;
      }
      dragging = true;
      dragMoved.current = false;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      recent.length = 0;
      recent.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      velocity.current.x = 0;
      velocity.current.y = 0;
    }

    function onPointerMove(e: PointerEvent) {
      const curPhase = runtime.current.transition.phase;
      if (
        curPhase === "playing" ||
        curPhase === "returning"
      ) return;
      if (!dragging) return;

      if (curPhase === "isolated") {
        if (!dragMoved.current) {
          const threshold = debug.current.pan.dragThreshold;
          if (Math.abs(e.clientX - startX) >= threshold || Math.abs(e.clientY - startY) >= threshold) {
            dragMoved.current = true;
            setAppCursor("grabbing");
          }
        }
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        const isDesktopLayout = window.innerWidth >= 1024 && window.innerWidth >= window.innerHeight;
        const moveDelta = isDesktopLayout ? dy : dx;
        const pxPerCard = debug.current.transition.dragPxPerCard ?? 320;
        if (dragMoved.current) {
          runtime.current.transition.targetColumnScrollY -= moveDelta / pxPerCard;
        }
        return;
      }

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const now = performance.now();
      recent.push({ x: e.clientX, y: e.clientY, t: now });
      const windowMs = debug.current.pan.velocityWindowMs;
      while (recent.length > 1 && now - recent[0].t > windowMs) recent.shift();

      if (!dragMoved.current) {
        const threshold = debug.current.pan.dragThreshold;
        if (Math.abs(e.clientX - startX) < threshold && Math.abs(e.clientY - startY) < threshold) {
          return;
        }
        dragMoved.current = true;
        setAppCursor("grabbing");
        if (runtime.current.hovered !== null) {
          runtime.current.hovered = null;
          runtime.current.hoveredPos = null;
        }
      }

      const zoom = debug.current.camera.zoom;
      applyPanPointerMove(runtime.current, dx, dy, zoom);
    }

    function onPointerLeaveDocument(e: PointerEvent) {
      if (!e.relatedTarget && runtime.current.hovered !== null) {
        runtime.current.hovered = null;
        runtime.current.hoveredPos = null;
        setAppCursor("auto");
      }
    }

    function onWindowBlur() {
      if (runtime.current.hovered !== null) {
        runtime.current.hovered = null;
        runtime.current.hoveredPos = null;
        setAppCursor("auto");
      }
    }

    function onPointerUp() {
      const curPhase = runtime.current.transition.phase;
      if (
        curPhase === "isolated" ||
        curPhase === "playing" ||
        curPhase === "returning"
      ) {
        if (curPhase === "isolated" && dragging && dragMoved.current) {
          // Fin du drag : la carte la plus proche vient se poser au premier plan.
          const tr = runtime.current.transition;
          tr.targetColumnScrollY = Math.round(tr.targetColumnScrollY);
        }
        dragging = false;
        dragMoved.current = false;
        setAppCursor("auto");
        return;
      }
      if (dragging && dragMoved.current && recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = last.t - first.t;
        if (dt > 5) {
          velocity.current.x = -(last.x - first.x) / dt;
          velocity.current.y = (last.y - first.y) / dt;
        }
      }
      dragging = false;
      dragMoved.current = false;
      if (curPhase === "idle") {
        if (runtime.current.hovered !== null) {
          setAppCursor("pointer");
        } else {
          setAppCursor("auto");
        }
      } else {
        setAppCursor("auto");
      }
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("pointerleave", onPointerLeaveDocument);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("pointerleave", onPointerLeaveDocument);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  // ── Flèches, Entrée & Escape : navigation spatiale et transition 2 temps ───
  useEffect(() => {
    if (!tile || tile.points.length === 0) return;
    const { points, neighbors } = tile;

    function bestInCone(pool: NeighborEntry[], dir: readonly [number, number]) {
      for (const n of pool) {
        const len = Math.hypot(n.dx, n.dy) || 1;
        const cos = (n.dx * dir[0] + n.dy * dir[1]) / len;
        if (cos >= DIRECTION_CONE_COS) return n;
      }
      return null;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable ||
          Boolean(e.target.closest("#leva__root")))
      ) {
        return;
      }

      // Raccourcis Studio Animation :
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        const rc = runtime.current;
        const selIndex = rc.selected >= 0 ? rc.selected : 0;
        startPlayback(rc, selIndex);
        if (tile?.points[selIndex]) {
          handleStartSelect(tile.points[selIndex].artifactIndex, {
            ...tile.points[selIndex],
            x: rc.selectedPos.x,
            y: rc.selectedPos.y,
          });
        }
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        debug.current.studio.loopLock = !debug.current.studio.loopLock;
        return;
      }

      // Touche Escape : ferme la vue détail ou annule la transition
      if (e.key === "Escape") {
        if (isDetailVisible || runtime.current.transition.phase !== "idle") {
          e.preventDefault();
          handleCloseDetail();
          return;
        }
      }

      // Maintien de la touche Entrée : lance la transition 2 temps (Hold -> Burst)
      if (e.key === "Enter") {
        if (e.repeat) return;
        e.preventDefault();
        applyKeyDownEnter(runtime.current, points);
        const selIndex = runtime.current.selected;
        const pt = points[selIndex];
        if (pt) {
          handleStartSelect(pt.artifactIndex, {
            ...pt,
            x: runtime.current.selectedPos.x,
            y: runtime.current.selectedPos.y,
          });
        }
        return;
      }

      const dir = ARROW_DIRECTIONS[e.key];
      if (!dir) return;
      e.preventDefault();

      const rc = runtime.current;
      if (rc.transition.phase === "isolated") {
        const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        rc.transition.targetColumnScrollY = Math.round(rc.transition.targetColumnScrollY) + next;
        return;
      }
      if (rc.transition.phase !== "idle") return;
      const candidates = neighbors[rc.selected];
      if (!candidates || candidates.length === 0) return;

      const k = DEFAULT_NEIGHBOR_K;
      const match = bestInCone(candidates.slice(0, k), dir) ?? bestInCone(candidates, dir);
      if (!match) return;

      const point = points[match.index];
      applyArrowNavigation(rc, match, point);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Enter") {
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [tile, isDetailVisible, handleCloseDetail, handleStartSelect]);

  return (
    <div data-lenis-prevent className="fixed inset-0 bg-white">
      <PlayLoader loaded={loaded} total={total} isReady={isReady} />

      <div
        className={`h-full w-full transition-opacity duration-700 ease-out ${isReady ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
      >
        {isCalculated && tile && tile.points.length > 0 && (
          <Canvas
            flat
            orthographic
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 100], zoom: CAMERA_ZOOM, near: 0.1, far: 1000 }}
            events={(store) => {
              const base = events(store);
              return {
                ...base,
                compute(event, state) {
                  const px = (event.offsetX / state.size.width) * 2 - 1;
                  const py = -(event.offsetY / state.size.height) * 2 + 1;
                  const fish = debug.current.fisheye;
                  if (fish?.enabled && fish.strength > 0.001) {
                    const aspect = state.size.width / Math.max(state.size.height, 1);
                    const cx = px * aspect;
                    const cy = py;
                    const r2 = cx * cx + cy * cy;
                    const rCorner2 = aspect * aspect + 1.0;
                    const normR2 = r2 / rCorner2;
                    const factor = (1.0 + fish.strength * normR2) / (1.0 + fish.strength);
                    state.pointer.set((cx * factor) / aspect, cy * factor);
                  } else {
                    state.pointer.set(px, py);
                  }
                  state.raycaster.setFromCamera(state.pointer, state.camera);
                },
              };
            }}
          >
            {showDebug && <Stats className="!top-4 !left-4" />}
            <CameraRig
              debug={debug}
              runtime={runtime}
              velocity={velocity}
              onTextReveal={handleTextReveal}
              onNavbarReveal={handleNavbarReveal}
              onReturnComplete={handleReturnComplete}
            />
            <ArtifactGrid
              textureUrls={textureUrls}
              mediaKinds={mediaKinds}
              tile={tile}
              debug={debug}
              runtime={runtime}
              dragMoved={dragMoved}
              onStartSelect={handleStartSelect}
            />
            {selectedArtifactIndex !== null && principalPoint && primaryMedia && (
              <SecondaryGalleryPlanes
                gallery={artifacts[selectedArtifactIndex]?.gallery ?? selectedArtifactDetail?.gallery ?? []}
                principalPoint={principalPoint}
                primaryMedia={primaryMedia}
                runtime={runtime}
                debug={debug}
                gap={32}
                onFocusMedia={loadPalette}
                weightsRef={deckWeightsRef}
              />
            )}
            <SelectProgressOverlay debug={debug} runtime={runtime} tile={tile} />
            <PixelEmitter debug={debug} runtime={runtime} tile={tile} />
            <FisheyeEffect debug={debug} />
          </Canvas>
        )}
      </div>

      {/* Side panel : posé à droite, décollé du haut, bord léger, sans ombre,
          grand arrondi en haut à gauche. Fond dégradé teinté par le média au
          centre de la wheel ; les textes en mix-blend-mode multiply en
          héritent. Sur mobile il devient une feuille basse. */}
      {selectedArtifactDetail && isDetailVisible && (
        <PixelGlitch intensity={debug.current.transition.panelGlitch} />
      )}

      <AnimatePresence mode="wait">
        {selectedArtifactDetail && isDetailVisible && (
          <motion.aside
            key={selectedArtifactDetail._id}
            ref={setPanelEl}
            custom={isDesktop}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={DETAIL_PANEL_VARIANTS}
            onWheel={(e) => e.stopPropagation()}
            className="fixed z-10 select-none overflow-y-auto overscroll-contain border border-zinc-200/80 inset-x-0 bottom-0 top-[52%] rounded-t-[1.75rem] border-b-0 lg:inset-x-auto lg:right-0 lg:rounded-tr-none lg:rounded-tl-[2.5rem] lg:border-r-0"
            style={
              {
                isolation: "isolate",
                backgroundColor: "#fff",
                ...(isDesktop
                  ? {
                      top: `calc(6rem + ${debug.current.transition.landscapeTextTopOffset ?? 0}px)`,
                      right: `${debug.current.transition.landscapeTextRightOffset ?? 0}px`,
                      width: `min(${(debug.current.transition.landscapeTextWidthRatio ?? 0.42) * 100}vw, ${(debug.current.transition.landscapeTextMaxWidth ?? 576) + 96}px)`,
                    }
                  : {}),
              } as CSSProperties
            }
          >
            <div className="flex flex-col gap-6 px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
              <motion.h1
                variants={DETAIL_ITEM_VARIANTS}
                className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-900 text-balance mix-blend-multiply"
              >
                {selectedArtifactDetail.title}
              </motion.h1>

              {selectedArtifactDetail.tags && selectedArtifactDetail.tags.length > 0 && (
                <motion.div variants={DETAIL_ITEM_VARIANTS} className="flex flex-wrap gap-2">
                  {selectedArtifactDetail.tags.map((tag) => (
                    <Tag
                      key={tag._id}
                      name={tag.name}
                      color={tag.color}
                      icon={tag.icon}
                    />
                  ))}
                </motion.div>
              )}

              {selectedArtifactDetail.description && (
                <motion.div
                  variants={DETAIL_ITEM_VARIANTS}
                  className="text-base sm:text-lg text-zinc-700 leading-relaxed whitespace-pre-line mix-blend-multiply"
                >
                  {selectedArtifactDetail.description}
                </motion.div>
              )}

              {/* Date, rôles, collaborateurs : les uns sous les autres. Les mates
                  sont en dernier, pour que leur carte de survol ne cache rien. */}
              <div className="flex flex-col gap-7 border-t border-zinc-900/10 pt-7">
                {selectedArtifactDetail.startDate && (
                  <motion.div variants={DETAIL_ITEM_VARIANTS} className="mix-blend-multiply">
                    <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-stone-500">
                      <HugeiconsIcon icon={Calendar02Icon} size={12} strokeWidth={2} />
                      timeline
                    </div>
                    <DateAgo
                      date={selectedArtifactDetail.endDate ?? selectedArtifactDetail.startDate}
                      ongoing={!selectedArtifactDetail.endDate}
                    >
                      <p className="whitespace-nowrap text-lg font-semibold text-stone-700">
                        {(() => {
                          const start = formatMonth(selectedArtifactDetail.startDate);
                          const end = selectedArtifactDetail.endDate
                            ? formatMonth(selectedArtifactDetail.endDate)
                            : "Present";
                          if (start === end) return start;
                          return (
                            <>
                              {start}
                              <span className="px-2 font-semibold text-stone-500">→</span>
                              {end}
                            </>
                          );
                        })()}
                      </p>
                    </DateAgo>
                  </motion.div>
                )}

                {selectedArtifactDetail.roles && selectedArtifactDetail.roles.length > 0 && (
                  <motion.div variants={DETAIL_ITEM_VARIANTS} className="mix-blend-multiply">
                    <RoleBlock roles={selectedArtifactDetail.roles} />
                  </motion.div>
                )}

                {selectedArtifactDetail.contributors &&
                  selectedArtifactDetail.contributors.length > 0 && (
                    <motion.div variants={DETAIL_ITEM_VARIANTS} className="relative z-10">
                      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-500 mix-blend-multiply">
                        <HugeiconsIcon icon={UserMultipleIcon} size={12} strokeWidth={2} />
                        mates
                      </div>
                      <MatesBlock
                        mates={selectedArtifactDetail.contributors as unknown as Mate[]}
                      />
                    </motion.div>
                  )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {showDebug && (
        <PlayDebug
          state={debug}
          stats={tile?.stats}
          onLayoutChange={handleLayoutChange}
          onSimulateSelect={handleSimulateSelect}
          onResetTransition={handleResetTransition}
          runtime={runtime}
          selectedArtifact={selectedArtifactDetail}
          apiStatus={apiStatus}
          onCloseDetail={handleCloseDetail}
          onTextLayoutChange={handleTextLayoutChange}
        />
      )}
    </div>
  );
}
