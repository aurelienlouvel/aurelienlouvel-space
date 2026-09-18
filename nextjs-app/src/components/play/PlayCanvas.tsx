"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, Calendar02Icon } from "@hugeicons/core-free-icons";
import { Canvas, events, useFrame } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import type { OrthographicCamera } from "three";
import { preloadArtifact } from "@/lib/preload-artifact";
import { buildImageUrl } from "@/lib/sanity-image";
import type { PlayArtifact, ArtifactDetail, Mate } from "@/sanity/queries";
import { Tag } from "@/components/primitives/Tag";
import { MatesBlock } from "@/components/blocks/MatesBlock";
import { formatDateRange } from "@/lib/date-utils";
import { ArtifactGrid } from "./ArtifactGrid";
import { SecondaryGalleryPlanes } from "./SecondaryGalleryPlanes";
import { resolveArtifactMedia } from "./artifact-media";
import { dampTowards } from "./damp";
import { FisheyeEffect } from "./FisheyeEffect";
import { FocusIndicator } from "./FocusIndicator";
import {
  buildGravityTile,
  GRAVITY_DEFAULTS,
  type GravityParams,
} from "./gravity-layout";
import { containFit, type LayoutTile, type NeighborEntry } from "./layout-types";
import { PlayLoader } from "./PlayLoader";
import { SelectProgressOverlay } from "./SelectProgressOverlay";
import {
  type TransitionConfig,
  DEFAULT_TRANSITION_CONFIG,
  evaluateEasing,
} from "./transition-presets";

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
  enabled: true,
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
};

export const OVERLAY_DEFAULTS: SelectOverlayParams = {
  direction: "bottom-to-top",
  crestSoftness: 0.26,
  waveAmplitude: 0.06,
  waveFrequency: 3.3,
  waveSpeed: 2.6,
  iridescence: 0.41,
  baseOpacity: 0.6,
  glowIntensity: 1.0,
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

export type PlayDebugState = {
  plane: { radius: number };
  brackets: {
    padding: number;
    radius: number;
    angle: number;
    arm: number;
    thickness: number;
    color: string;
  };
  indicator: { fadeSpeed: number; moveSpeed: number };
  camera: { zoom: number };
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
  camera: { targetX: number; targetY: number; mode: "follow" | "settle" };
  indicatorTarget: { x: number; y: number; width: number; height: number };
  repulsor: {
    active: boolean;
    pointIndex: number;
    x: number;
    y: number;
  };
  transition: {
    phase: "idle" | "selecting" | "lock" | "burst" | "isolated" | "returning";
    selectProgress: number;
    easedSelectProgress: number;
    lockTimer: number;
    lockProgress: number;
    burstProgress: number;
    easedBurstProgress: number;
    returnTimer: number;
    targetIndex: number;
    holding: boolean;
    trigger: "pointer" | "key" | null;
  };
};

export type PlayRuntimeRef = RefObject<PlayRuntimeState>;

export function applyPointerDown(
  rc: PlayRuntimeState,
  pointIndex: number,
  canonicalPos: { x: number; y: number },
) {
  if (rc.transition.phase === "isolated" || rc.transition.phase === "returning") {
    applyResetTransition(rc);
    return;
  }
  if (rc.transition.phase !== "idle") return;

  rc.repulsor.active = true;
  rc.repulsor.pointIndex = pointIndex;
  rc.repulsor.x = canonicalPos.x;
  rc.repulsor.y = canonicalPos.y;
  rc.transition.phase = "selecting";
  rc.transition.targetIndex = pointIndex;
  rc.transition.holding = true;
  rc.transition.trigger = "pointer";
  rc.transition.selectProgress = 0;
  rc.transition.easedSelectProgress = 0;
  rc.transition.lockTimer = 0;
  rc.transition.lockProgress = 0;
  rc.transition.returnTimer = 0;
}

export function applyPointerUp(rc: PlayRuntimeState) {
  if (rc.transition.trigger === "pointer") {
    rc.transition.holding = false;
    rc.transition.trigger = null;
  }
}

export function applyResetTransition(rc: PlayRuntimeState) {
  if (rc.transition.phase === "isolated" || rc.transition.phase === "burst") {
    rc.transition.phase = "returning";
    rc.transition.returnTimer = 0;
    rc.transition.holding = false;
    rc.transition.trigger = null;
    rc.camera.mode = "settle";
    return;
  }
  rc.transition.phase = "idle";
  rc.transition.holding = false;
  rc.transition.selectProgress = 0;
  rc.transition.easedSelectProgress = 0;
  rc.transition.lockTimer = 0;
  rc.transition.lockProgress = 0;
  rc.transition.burstProgress = 0;
  rc.transition.easedBurstProgress = 0;
  rc.transition.returnTimer = 0;
  rc.transition.trigger = null;
  rc.transition.targetIndex = -1;
  rc.repulsor.active = false;
  rc.repulsor.pointIndex = -1;
  rc.camera.mode = "settle";
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

  rc.repulsor.active = true;
  rc.repulsor.pointIndex = rc.selected;
  rc.repulsor.x = selPt.x;
  rc.repulsor.y = selPt.y;
  rc.transition.phase = "selecting";
  rc.transition.targetIndex = rc.selected;
  rc.transition.holding = true;
  rc.transition.trigger = "key";
  rc.transition.selectProgress = 0;
  rc.transition.easedSelectProgress = 0;
  rc.transition.lockTimer = 0;
  rc.transition.lockProgress = 0;
  rc.camera.mode = "settle";
  rc.camera.targetX = rc.selectedPos.x;
  rc.camera.targetY = rc.selectedPos.y;
}

function applyKeyUpEnter(rc: PlayRuntimeState) {
  if (rc.transition.trigger === "key") {
    rc.transition.holding = false;
    rc.transition.trigger = null;
  }
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
  rc.camera.targetX = worldX;
  rc.camera.targetY = worldY;
  rc.camera.mode = "settle";
  rc.indicatorTarget = { x: worldX, y: worldY, width: point.width, height: point.height };
}

// ── Ouverture — image ────────────────────────────────────────────────────
const PLANE_RADIUS = 32;

// ── Ouverture — brackets ─────────────────────────────────────────────────
const BRACKET_PADDING = 20;
const BRACKET_RADIUS = 48;
const BRACKET_ANGLE = 90;
const BRACKET_ARM = 8;
const BRACKET_THICKNESS = 4;
const BRACKET_COLOR = "#a6a09b";

// ── Ouverture — indicateur (vitesses d'amortissement, par seconde) ──────
const INDICATOR_FADE_SPEED = 14;
const INDICATOR_MOVE_SPEED = 10;

// ── Ouverture — caméra ────────────────────────────────────────────────────
const CAMERA_ZOOM = 0.8;
const CAMERA_SETTLE_SPEED = 8;
const DEFAULT_NEIGHBOR_K = 6;

// ── Ouverture — pan ───────────────────────────────────────────────────────
const DRAG_THRESHOLD = 6;
const VELOCITY_WINDOW_MS = 80;
const INERTIA_FRICTION = -2.5;
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
 * Tweakpane reste hors du SSR et chargé uniquement à la demande si #debug est présent.
 */
const PlayDebug = dynamic(() => import("./PlayDebug").then((m) => m.PlayDebug), {
  ssr: false,
});

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
  onBurstComplete?: () => void,
) {
  const speed = studio?.speed ?? 1.0;
  const effDelta = delta * speed;
  const tr = rc.transition;

  // ── Temps 1 : Progression du select (Hold to Select) ───────────────────
  if (tr.phase === "selecting") {
    if (tr.holding) {
      tr.selectProgress = Math.min(
        1,
        tr.selectProgress + effDelta / Math.max(0.1, config.selectDuration),
      );
      if (tr.selectProgress >= 1) {
        tr.selectProgress = 1;
        if (config.lockDuration > 0.01 || config.burstDelay > 0.01) {
          tr.phase = "lock";
          tr.lockTimer = 0;
          tr.lockProgress = 0;
        } else {
          tr.phase = "burst";
          tr.burstProgress = 0;
          tr.easedBurstProgress = 0;
        }
      }
    } else {
      tr.selectProgress = Math.max(
        0,
        tr.selectProgress - effDelta / Math.max(0.05, config.selectDuration * 0.4),
      );
      if (tr.selectProgress <= 0.02) {
        tr.selectProgress = 0;
        tr.phase = "idle";
        rc.repulsor.active = false;
        rc.repulsor.pointIndex = -1;
      }
    }
    tr.easedSelectProgress = evaluateEasing(config.selectEasing, tr.selectProgress);

    const targetZoom = baseZoom * (1 + (config.selectZoom - 1) * tr.easedSelectProgress);
    const smoothedZoom = dampTowards(camera.zoom, targetZoom, 14, effDelta);
    if (Math.abs(camera.zoom - smoothedZoom) > 0.0001) {
      camera.zoom = smoothedZoom;
      camera.updateProjectionMatrix();
    }

    camera.position.x = dampTowards(camera.position.x, rc.camera.targetX, CAMERA_SETTLE_SPEED, effDelta);
    camera.position.y = dampTowards(camera.position.y, rc.camera.targetY, CAMERA_SETTLE_SPEED, effDelta);
    return;
  }

  // ── Temps 2 : Animation de select (Lock confirmation & délai pré-burst) ─
  if (tr.phase === "lock") {
    if (studio?.scrubMode) {
      tr.lockProgress = Math.min(1, Math.max(0, studio.scrubProgress));
      tr.lockTimer = tr.lockProgress * Math.max(0.01, config.lockDuration);
    } else {
      tr.lockTimer += effDelta;
      tr.lockProgress = Math.min(1, tr.lockTimer / Math.max(0.01, config.lockDuration));
      const totalLockTime = Math.max(0.01, config.lockDuration) + Math.max(0, config.burstDelay);
      if (tr.lockTimer >= totalLockTime) {
        if (studio?.loopLock) {
          tr.lockTimer = 0;
          tr.lockProgress = 0;
        } else {
          tr.phase = "burst";
          tr.burstProgress = 0;
          tr.easedBurstProgress = 0;
        }
      }
    }

    const targetZoom = baseZoom * config.selectZoom;
    const smoothedZoom = dampTowards(camera.zoom, targetZoom, 14, effDelta);
    if (Math.abs(camera.zoom - smoothedZoom) > 0.0001) {
      camera.zoom = smoothedZoom;
      camera.updateProjectionMatrix();
    }

    camera.position.x = dampTowards(camera.position.x, rc.camera.targetX, CAMERA_SETTLE_SPEED, effDelta);
    camera.position.y = dampTowards(camera.position.y, rc.camera.targetY, CAMERA_SETTLE_SPEED, effDelta);
    return;
  }

  // ── Temps 3 : Transition vers la vue détail (Burst & Dezoom vers colonne gauche 40%) ─
  if (tr.phase === "burst") {
    tr.burstProgress = Math.min(
      1,
      tr.burstProgress + effDelta / Math.max(0.1, config.burstDuration),
    );
    tr.easedBurstProgress = evaluateEasing(config.burstEasing, tr.burstProgress);
    if (tr.burstProgress >= 1) {
      tr.burstProgress = 1;
      tr.phase = "isolated";
      onBurstComplete?.();
    }

    const startZoom = baseZoom * config.selectZoom;
    const endZoom = baseZoom * config.burstZoom; // config.burstZoom = 0.85 (dézoom)
    const targetZoom = startZoom + (endZoom - startZoom) * tr.easedBurstProgress;
    const smoothedZoom = dampTowards(camera.zoom, targetZoom, 14, effDelta);
    if (Math.abs(camera.zoom - smoothedZoom) > 0.0001) {
      camera.zoom = smoothedZoom;
      camera.updateProjectionMatrix();
    }

    const screenW = screenSize?.width ?? 1920;
    const isDesktop = screenW >= 1024;
    const visibleW = screenW / Math.max(0.1, camera.zoom);
    const colRatio = config.detailColumnRatio ?? 0.40;
    const offsetRatio = 0.5 - colRatio * 0.5; // (0.40 * 0.5) - 0.5 = -0.30 -> offset +0.30

    // Déplacement horizontal : le média principal se positionne au centre de la colonne gauche (40%)
    const targetPosX = isDesktop ? rc.selectedPos.x + offsetRatio * visibleW : rc.selectedPos.x;
    const targetPosY = rc.selectedPos.y; // Centrage vertical

    const curTargetX = rc.selectedPos.x + (targetPosX - rc.selectedPos.x) * tr.easedBurstProgress;
    const curTargetY = rc.selectedPos.y + (targetPosY - rc.selectedPos.y) * tr.easedBurstProgress;

    camera.position.x = dampTowards(camera.position.x, curTargetX, CAMERA_SETTLE_SPEED, effDelta);
    camera.position.y = dampTowards(camera.position.y, curTargetY, CAMERA_SETTLE_SPEED, effDelta);
    return;
  }

  // ── Mode Isolé (Maintenu centré à gauche dans la colonne 40% avec dézoom) ─
  if (tr.phase === "isolated") {
    const targetZoom = baseZoom * config.burstZoom;
    const smoothedZoom = dampTowards(camera.zoom, targetZoom, 14, effDelta);
    if (Math.abs(camera.zoom - smoothedZoom) > 0.0001) {
      camera.zoom = smoothedZoom;
      camera.updateProjectionMatrix();
    }

    const screenW = screenSize?.width ?? 1920;
    const isDesktop = screenW >= 1024;
    const visibleW = screenW / Math.max(0.1, camera.zoom);
    const colRatio = config.detailColumnRatio ?? 0.40;
    const offsetRatio = 0.5 - colRatio * 0.5;

    const targetPosX = isDesktop ? rc.selectedPos.x + offsetRatio * visibleW : rc.selectedPos.x;
    const targetPosY = rc.selectedPos.y;

    camera.position.x = dampTowards(camera.position.x, targetPosX, CAMERA_SETTLE_SPEED, effDelta);
    camera.position.y = dampTowards(camera.position.y, targetPosY, CAMERA_SETTLE_SPEED, effDelta);
    return;
  }

  // ── Mode Retour vers la page de base ─────────────────────────────────
  if (tr.phase === "returning") {
    const targetZoom = baseZoom;
    const smoothedZoom = dampTowards(camera.zoom, targetZoom, 8, effDelta);
    if (Math.abs(camera.zoom - smoothedZoom) > 0.0001) {
      camera.zoom = smoothedZoom;
      camera.updateProjectionMatrix();
    }

    camera.position.x = dampTowards(camera.position.x, rc.camera.targetX, CAMERA_SETTLE_SPEED, effDelta);
    camera.position.y = dampTowards(camera.position.y, rc.camera.targetY, CAMERA_SETTLE_SPEED, effDelta);
    return;
  }

  // ── Phase Idle : Retour au zoom de base et pan inertiel ────────────────
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
    camera.position.x = rc.camera.targetX;
    camera.position.y = rc.camera.targetY;
  } else {
    camera.position.x = dampTowards(camera.position.x, rc.camera.targetX, CAMERA_SETTLE_SPEED, effDelta);
    camera.position.y = dampTowards(camera.position.y, rc.camera.targetY, CAMERA_SETTLE_SPEED, effDelta);
  }
}

function CameraRig({
  debug,
  runtime,
  velocity,
  onBurstComplete,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  velocity: RefObject<{ x: number; y: number }>;
  onBurstComplete?: () => void;
}) {
  useFrame((state, delta) => {
    stepCamera(
      state.camera as OrthographicCamera,
      runtime.current,
      velocity.current,
      debug.current.pan.friction,
      debug.current.camera.zoom,
      debug.current.transition,
      delta,
      debug.current.studio,
      state.size,
      onBurstComplete,
    );
  });

  return null;
}

export function PlayCanvas({ artifacts }: { artifacts: PlayArtifact[] }) {
  const debug = useRef<PlayDebugState>({
    plane: { radius: PLANE_RADIUS },
    brackets: {
      padding: BRACKET_PADDING,
      radius: BRACKET_RADIUS,
      angle: BRACKET_ANGLE,
      arm: BRACKET_ARM,
      thickness: BRACKET_THICKNESS,
      color: BRACKET_COLOR,
    },
    indicator: { fadeSpeed: INDICATOR_FADE_SPEED, moveSpeed: INDICATOR_MOVE_SPEED },
    camera: { zoom: CAMERA_ZOOM },
    gravity: { ...GRAVITY_DEFAULTS },
    pan: {
      dragThreshold: DRAG_THRESHOLD,
      velocityWindowMs: VELOCITY_WINDOW_MS,
      friction: INERTIA_FRICTION,
    },
    physics: { ...PHYSICS_DEFAULTS },
    transition: { ...DEFAULT_TRANSITION_CONFIG },
    fisheye: { ...FISHEYE_DEFAULTS },
    overlay: { ...OVERLAY_DEFAULTS },
    studio: { ...STUDIO_DEFAULTS },
  });

  const runtime = useRef<PlayRuntimeState>({
    selected: 0,
    selectedPos: { x: 0, y: 0 },
    hovered: null,
    camera: { targetX: 0, targetY: 0, mode: "follow" },
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
      selectProgress: 0,
      easedSelectProgress: 0,
      lockTimer: 0,
      lockProgress: 0,
      burstProgress: 0,
      easedBurstProgress: 0,
      returnTimer: 0,
      targetIndex: -1,
      holding: false,
      trigger: null,
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

  const handleReplayLock = useCallback(() => {
    const rc = runtime.current;
    const selIndex = rc.selected >= 0 ? rc.selected : 0;
    rc.transition.targetIndex = selIndex;
    rc.transition.phase = "lock";
    rc.transition.lockTimer = 0;
    rc.transition.lockProgress = 0;
    rc.repulsor.active = true;
    rc.repulsor.pointIndex = selIndex;
    rc.repulsor.x = rc.selectedPos.x;
    rc.repulsor.y = rc.selectedPos.y;
  }, []);

  const handleResetTransition = useCallback(() => {
    applyResetTransition(runtime.current);
  }, []);

  const [viewport, setViewport] = useState(() => {
    if (typeof window !== "undefined") {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1920, height: 1080 };
  });
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
  const [selectedArtifactDetail, setSelectedArtifactDetail] = useState<ArtifactDetail | null>(null);
  const [principalPoint, setPrincipalPoint] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);

  const handleStartSelect = useCallback(
    (artifactIndex: number, point?: { x: number; y: number; width: number; height: number }) => {
      if (point) setPrincipalPoint(point);
      const artifact = artifacts[artifactIndex];
      if (artifact?.slug) {
        preloadArtifact(artifact.slug).then((data) => {
          if (data) setSelectedArtifactDetail(data);
        });
      }
    },
    [artifacts],
  );

  const handleBurstComplete = useCallback(() => {
    setIsDetailVisible(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setIsDetailVisible(false);
    applyResetTransition(runtime.current);
    setTimeout(() => {
      setSelectedArtifactDetail(null);
      setPrincipalPoint(null);
    }, 600);
  }, []);

  const handleSimulateSelect = useCallback(() => {
    const rc = runtime.current;
    const selIndex = rc.selected >= 0 ? rc.selected : 0;
    rc.transition.targetIndex = selIndex;
    rc.transition.phase = "selecting";
    rc.transition.holding = true;
    rc.transition.selectProgress = 0;
    rc.transition.lockTimer = 0;
    rc.transition.lockProgress = 0;
    rc.repulsor.active = true;
    rc.repulsor.pointIndex = selIndex;
    rc.repulsor.x = rc.selectedPos.x;
    rc.repulsor.y = rc.selectedPos.y;
    if (tile?.points[selIndex]) {
      handleStartSelect(tile.points[selIndex].artifactIndex, tile.points[selIndex]);
    }
  }, [handleStartSelect, tile]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const computedTile = buildGravityTile(
        ratios,
        gravityParams,
        viewport.width / viewport.height,
      );
      setTile(computedTile);
      setIsCalculated(true);
    }, 16);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ratios, gravityParams, viewport]);

  const textureUrls = useMemo(
    () =>
      media.map((m, i) => {
        if (m.kind === "video") return m.url;
        const { width } = containFit(ratios[i], gravityParams.maxWidth, gravityParams.maxHeight);
        return buildImageUrl(m.ref, null, null, null, {
          width: Math.round(width * RETINA_MULTIPLIER),
        });
      }),
    [media, ratios, gravityParams],
  );


  useEffect(() => {
    if (!tile || tile.points.length === 0) return;
    const rc = runtime.current;
    if (!initializedTileRef.current || rc.selected < 0 || rc.selected >= tile.points.length) {
      initializedTileRef.current = true;
      const origin = tile.points[tile.originIndex];
      rc.selected = tile.originIndex;
      rc.hovered = null;
      const ox = origin ? origin.x : 0;
      const oy = origin ? origin.y : 0;
      rc.selectedPos = { x: ox, y: oy };
      rc.camera = { targetX: ox, targetY: oy, mode: "follow" };
      if (origin) {
        rc.indicatorTarget = { x: ox, y: oy, width: origin.width, height: origin.height };
      }
    }
  }, [tile]);

  // ── Préchargement DOM des textures (images et vidéos) ────────────────────
  const [loaded, setLoaded] = useState(0);
  const total = textureUrls.length;

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

    textureUrls.forEach((url, i) => {
      if (mediaKinds[i] === "video") {
        const video = document.createElement("video");
        video.preload = "auto";
        video.src = url;
        let fired = false;
        const onDone = () => {
          if (fired) return;
          fired = true;
          bump();
        };
        video.onloadeddata = onDone;
        video.onerror = onDone;
        setTimeout(onDone, 2500);
        elements.push(video);
        return;
      }
      const img = new Image();
      img.onload = img.onerror = bump;
      img.src = url;
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
  }, [textureUrls, mediaKinds, total]);

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

    function onWheel(e: WheelEvent) {
      e.preventDefault();

      // Le contrôle du zoom est interdit à l'utilisateur (pinch trackpad Mac ou Cmd+scroll)
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      // ── Pan : défilement standard au trackpad / molette ─────────────────────
      velocity.current.x = 0;
      velocity.current.y = 0;
      applyPanWheel(runtime.current, e.deltaX, e.deltaY, debug.current.camera.zoom);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (runtime.current.transition.phase === "isolated") {
        applyResetTransition(runtime.current);
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
      if (runtime.current.transition.phase === "burst" || runtime.current.transition.phase === "isolated") return;
      if (!dragging) return;
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
        if (runtime.current.transition.phase === "selecting") {
          applyResetTransition(runtime.current);
        }
      }

      const zoom = debug.current.camera.zoom;
      applyPanPointerMove(runtime.current, dx, dy, zoom);
    }

    function onPointerUp() {
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
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
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
        rc.transition.targetIndex = selIndex;
        rc.transition.phase = "lock";
        rc.transition.lockTimer = 0;
        rc.transition.lockProgress = 0;
        rc.repulsor.active = true;
        rc.repulsor.pointIndex = selIndex;
        rc.repulsor.x = rc.selectedPos.x;
        rc.repulsor.y = rc.selectedPos.y;
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
        const pt = points[runtime.current.selected];
        if (pt) handleStartSelect(pt.artifactIndex, pt);
        return;
      }

      const dir = ARROW_DIRECTIONS[e.key];
      if (!dir) return;
      e.preventDefault();

      const rc = runtime.current;
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
        applyKeyUpEnter(runtime.current);
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
            dpr={[1, 2]}
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
            <Stats className="!top-4 !left-4" />
            <CameraRig
              debug={debug}
              runtime={runtime}
              velocity={velocity}
              onBurstComplete={handleBurstComplete}
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
            {selectedArtifactDetail && principalPoint && (
              <SecondaryGalleryPlanes
                gallery={selectedArtifactDetail.gallery}
                principalPoint={principalPoint}
                runtime={runtime}
                debug={debug}
                gap={32}
              />
            )}
            <SelectProgressOverlay debug={debug} runtime={runtime} tile={tile} />
            <FocusIndicator debug={debug} runtime={runtime} />
            <FisheyeEffect debug={debug} />
          </Canvas>
        )}
      </div>

      {/* Panneau d'informations transparent sur les 60% droits de l'écran (aucun fond blanc opaque) */}
      <AnimatePresence>
        {selectedArtifactDetail && isDetailVisible && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full lg:w-[60%] flex flex-col justify-center px-8 sm:px-16 pointer-events-none z-10 select-none"
          >
            <div className="max-w-xl pointer-events-auto flex flex-col">
              <div className="mb-6">
                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-950 transition-colors cursor-pointer group"
                >
                  <motion.span
                    whileHover={{ x: -3 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100/80 backdrop-blur-sm group-hover:bg-zinc-200 transition-colors"
                  >
                    <HugeiconsIcon icon={ArrowLeft02Icon} size={15} strokeWidth={2} />
                  </motion.span>
                  <span>back to canvas</span>
                </button>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-950 mb-6 text-balance">
                {selectedArtifactDetail.title}
              </h1>

              {selectedArtifactDetail.tags && selectedArtifactDetail.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {selectedArtifactDetail.tags.map((tag) => (
                    <Tag
                      key={tag._id}
                      name={tag.name}
                      color={tag.color}
                      icon={tag.icon}
                    />
                  ))}
                </div>
              )}

              {selectedArtifactDetail.startDate && (
                <div className="flex items-center gap-2 text-sm text-zinc-500 font-medium mb-6">
                  <HugeiconsIcon icon={Calendar02Icon} size={16} strokeWidth={2} />
                  <span>
                    {formatDateRange(
                      selectedArtifactDetail.startDate,
                      selectedArtifactDetail.endDate ?? null,
                    )}
                  </span>
                </div>
              )}

              {selectedArtifactDetail.description && (
                <div className="text-base sm:text-lg text-zinc-600 leading-relaxed whitespace-pre-line mb-8 max-h-48 overflow-y-auto">
                  {selectedArtifactDetail.description}
                </div>
              )}

              {selectedArtifactDetail.contributors && selectedArtifactDetail.contributors.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-zinc-200/60 mb-6">
                  <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
                    Collaborators
                  </span>
                  <MatesBlock mates={selectedArtifactDetail.contributors as unknown as Mate[]} />
                </div>
              )}

              {selectedArtifactDetail.roles && selectedArtifactDetail.roles.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
                    Roles
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedArtifactDetail.roles.map((r) => (
                      <span
                        key={r._id}
                        className="px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-100 text-zinc-700"
                      >
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showDebug && (
        <PlayDebug
          state={debug}
          stats={tile?.stats}
          onLayoutChange={handleLayoutChange}
          onReplayLock={handleReplayLock}
          onSimulateSelect={handleSimulateSelect}
          onResetTransition={handleResetTransition}
        />
      )}
    </div>
  );
}
