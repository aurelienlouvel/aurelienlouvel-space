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
import { Canvas, useFrame } from "@react-three/fiber";
import type { OrthographicCamera } from "three";
import { buildImageUrl } from "@/lib/sanity-image";
import type { PlayArtifact } from "@/sanity/queries";
import { ArtifactGrid } from "./ArtifactGrid";
import { resolveArtifactMedia } from "./artifact-media";
import { dampTowards } from "./damp";
import { FocusIndicator } from "./FocusIndicator";
import {
  buildGravityTile,
  GRAVITY_DEFAULTS,
  type GravityParams,
} from "./gravity-layout";
import { containFit, type LayoutTile, type NeighborEntry } from "./layout-types";
import { PlayLoader } from "./PlayLoader";

/**
 * État réglable depuis le debug pane (dev only) : tweakpane écrit dedans, les
 * `useFrame` le lisent et l'appliquent à la scène. Rien ne passe par
 * `useState`, donc aucun re-render React par frame.
 *
 * Il voyage dans une `RefObject` plutôt qu'en valeur nue : c'est ce qui permet
 * aux enfants de ne le lire qu'en dehors du rendu, là où muter est légitime.
 */
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
};

export type PlayDebugRef = RefObject<PlayDebugState>;

/**
 * État runtime : sélection / survol / caméra / indicateur — écrit par les
 * interactions (clic, survol, pan, flèches), lu par les `useFrame`.
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
};

export type PlayRuntimeRef = RefObject<PlayRuntimeState>;

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
const CAMERA_ZOOM = 1;
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
 * Tweakpane reste hors du bundle de prod et hors du SSR.
 */
const PlayDebug =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("./PlayDebug").then((m) => m.PlayDebug), {
        ssr: false,
      })
    : null;

function stepCamera(
  camera: OrthographicCamera,
  rc: PlayRuntimeState["camera"],
  velocity: { x: number; y: number },
  friction: number,
  zoom: number,
  delta: number,
) {
  if (rc.mode === "follow") {
    if (velocity.x !== 0 || velocity.y !== 0) {
      rc.targetX += velocity.x * delta * 1000;
      rc.targetY += velocity.y * delta * 1000;
      const decay = Math.exp(friction * delta);
      velocity.x *= decay;
      velocity.y *= decay;
      if (Math.abs(velocity.x) < VELOCITY_EPSILON && Math.abs(velocity.y) < VELOCITY_EPSILON) {
        velocity.x = 0;
        velocity.y = 0;
      }
    }
    camera.position.x = rc.targetX;
    camera.position.y = rc.targetY;
  } else {
    camera.position.x = dampTowards(camera.position.x, rc.targetX, CAMERA_SETTLE_SPEED, delta);
    camera.position.y = dampTowards(camera.position.y, rc.targetY, CAMERA_SETTLE_SPEED, delta);
  }

  if (camera.zoom !== zoom) {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }
}

function CameraRig({
  debug,
  runtime,
  velocity,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  velocity: RefObject<{ x: number; y: number }>;
}) {
  useFrame((state, delta) => {
    stepCamera(
      state.camera as OrthographicCamera,
      runtime.current.camera,
      velocity.current,
      debug.current.pan.friction,
      debug.current.camera.zoom,
      delta,
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
  });

  const [gravityParams, setGravityParams] = useState<GravityParams>(() => ({
    ...GRAVITY_DEFAULTS,
  }));
  const handleLayoutChange = useCallback(() => {
    setGravityParams({ ...debug.current.gravity });
  }, []);

  const [viewport, setViewport] = useState(() => ({ width: 1920, height: 1080 }));
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

  const media = useMemo(() => artifacts.map(resolveArtifactMedia), [artifacts]);
  const ratios = useMemo(() => media.map((m) => m.ratio), [media]);
  const mediaKinds = useMemo(() => media.map((m) => m.kind), [media]);

  const tile = useMemo<LayoutTile>(() => {
    return buildGravityTile(ratios, gravityParams, viewport.width / viewport.height);
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

  const runtime = useRef<PlayRuntimeState>({
    selected: tile.originIndex,
    selectedPos: { x: 0, y: 0 },
    hovered: null,
    camera: { targetX: 0, targetY: 0, mode: "follow" },
    indicatorTarget: {
      x: 0,
      y: 0,
      width: tile.points[tile.originIndex]?.width ?? gravityParams.maxWidth,
      height: tile.points[tile.originIndex]?.height ?? gravityParams.maxHeight,
    },
  });
  const velocity = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);

  useEffect(() => {
    const rc = runtime.current;
    if (tile.points.length === 0) return;
    if (rc.selected < 0 || rc.selected >= tile.points.length) {
      const origin = tile.points[tile.originIndex];
      rc.selected = tile.originIndex;
      rc.hovered = null;
      rc.selectedPos = { x: 0, y: 0 };
      rc.camera = { targetX: 0, targetY: 0, mode: "follow" };
      rc.indicatorTarget = { x: 0, y: 0, width: origin.width, height: origin.height };
    }
  }, [tile]);

  // ── Préchargement DOM des textures ───────────────────────────────────────
  const [loaded, setLoaded] = useState(0);
  const total = textureUrls.length;

  useEffect(() => {
    if (total === 0) return;
    let cancelled = false;
    let count = 0;
    const images: HTMLImageElement[] = [];

    function bump() {
      if (cancelled) return;
      count += 1;
      setLoaded(count);
    }

    textureUrls.forEach((url, i) => {
      if (mediaKinds[i] === "video") {
        bump();
        return;
      }
      const img = new Image();
      img.onload = img.onerror = bump;
      img.src = url;
      images.push(img);
    });

    return () => {
      cancelled = true;
      for (const img of images) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [textureUrls, mediaKinds, total]);

  const loading = total > 0 && loaded < total;

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
      velocity.current.x = 0;
      velocity.current.y = 0;
      const rc = runtime.current;
      rc.camera.mode = "follow";
      const zoom = debug.current.camera.zoom;
      rc.camera.targetX += e.deltaX / zoom;
      rc.camera.targetY -= e.deltaY / zoom;
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
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
        runtime.current.camera.mode = "follow";
      }

      const zoom = debug.current.camera.zoom;
      runtime.current.camera.targetX -= dx / zoom;
      runtime.current.camera.targetY += dy / zoom;
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

  // ── Flèches : déplace la sélection vers son voisin le plus proche ────────
  useEffect(() => {
    const { points, neighbors } = tile;
    if (points.length === 0) return;

    function bestInCone(pool: NeighborEntry[], dir: readonly [number, number]) {
      for (const n of pool) {
        const len = Math.hypot(n.dx, n.dy) || 1;
        const cos = (n.dx * dir[0] + n.dy * dir[1]) / len;
        if (cos >= DIRECTION_CONE_COS) return n;
      }
      return null;
    }

    function onKeyDown(e: KeyboardEvent) {
      const dir = ARROW_DIRECTIONS[e.key];
      if (!dir) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
      ) {
        return;
      }
      e.preventDefault();

      const rc = runtime.current;
      const candidates = neighbors[rc.selected];
      if (!candidates || candidates.length === 0) return;

      const k = DEFAULT_NEIGHBOR_K;
      const match = bestInCone(candidates.slice(0, k), dir) ?? bestInCone(candidates, dir);
      if (!match) return;

      const point = points[match.index];
      const worldX = rc.selectedPos.x + match.dx;
      const worldY = rc.selectedPos.y + match.dy;
      rc.selected = match.index;
      rc.selectedPos = { x: worldX, y: worldY };
      rc.camera.targetX = worldX;
      rc.camera.targetY = worldY;
      rc.camera.mode = "settle";
      rc.indicatorTarget = { x: worldX, y: worldY, width: point.width, height: point.height };
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tile]);

  return (
    <div data-lenis-prevent className="fixed inset-0 bg-white">
      {loading ? (
        <PlayLoader loaded={loaded} total={total} />
      ) : (
        <Canvas
          flat
          orthographic
          dpr={[1, 2]}
          camera={{ position: [0, 0, 100], zoom: CAMERA_ZOOM, near: 0.1, far: 1000 }}
        >
          <CameraRig debug={debug} runtime={runtime} velocity={velocity} />
          {tile.points.length > 0 && (
            <>
              <ArtifactGrid
                textureUrls={textureUrls}
                mediaKinds={mediaKinds}
                tile={tile}
                debug={debug}
                runtime={runtime}
                dragMoved={dragMoved}
              />
              <FocusIndicator debug={debug} runtime={runtime} />
            </>
          )}
        </Canvas>
      )}
      {PlayDebug && (
        <PlayDebug
          state={debug}
          stats={tile.stats}
          onLayoutChange={handleLayoutChange}
        />
      )}
    </div>
  );
}
