"use client";

import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { Canvas } from "@react-three/fiber";
import { motion, AnimatePresence, useMotionValue } from "motion/react";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import {
  CARD_W,
  CARD_H,
  focusState,
  SELECTION_POP_SCALE,
} from "@/lib/artifact-utils";
import { ArtifactInfo } from "@/components/blocks/ArtifactInfo";
import { useActionBar } from "@/contexts/ActionBarContext";
import {
  type Params,
  DEFAULT_PARAMS,
  MOBILE_BREAKPOINT,
  applyResponsiveLayout,
  getSavedParamOverrides,
} from "@/lib/play-params";
import { computeFocusZoom, computeMobileVFrac } from "@/lib/play-focus-zoom";
import { buildTile } from "@/lib/play-tile-layout";
import type {
  SelectedInstance,
  CameraState,
  RippleState,
} from "@/lib/play-types";
import { InfiniteTiles } from "./InfiniteTiles";
import { PANEL_DELAY_S } from "./CameraController";
import { DebugPane } from "./DebugPane";
import { LoadingBar } from "./LoadingBar";
import { usePlayVideoTextures } from "./usePlayVideoTextures";

// ─── Module-level persistence (survives React remounts / soft navigations) ────
//
//  _hasVisited : true after first mount → skip entrance animation on revisit
//
let _hasVisited = false;

const LOADING_BAR_MS = 1600; // durée fixe de la loading bar au tout premier chargement

// ─── Main component ────────────────────────────────────────────────────────────
export function InfiniteCanvas({
  artifacts,
  active = true,
  running = active,
}: {
  artifacts: ArtifactCanvasItem[];
  active?: boolean;
  running?: boolean; // keeps frameloop alive during outro even when active=false
}) {
  // firstMount captures _hasVisited at construction time (before we flip it)
  const firstMount = useRef(!_hasVisited);
  const { setProject, clearProject } = useActionBar();

  const [selected, setSelected] = useState<SelectedInstance>(null);
  // firstMount.current is written once above and never reassigned — safe to
  // read synchronously here to seed the initial loading state.
  // eslint-disable-next-line react-hooks/refs
  const [loading, setLoading] = useState(firstMount.current);
  const [tileVersion, setTileVersion] = useState(0);
  // Bumps when the canvas is actually revealed (active & not loading) → triggers
  // the intro. Decoupling from `active` ensures the first-visit intro isn't
  // consumed behind the LoadingBar during WebGL init.
  const [introKey, setIntroKey] = useState(0);
  const readyRef = useRef(false);

  // Responsive — grille verticale en mobile (≤768px)
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);

  const paramsRef = useRef<Params>({
    ...DEFAULT_PARAMS,
    ...getSavedParamOverrides(),
  });
  const selectTargetRef = useRef<{ x: number; y: number } | null>(null);
  const selectedWorldPosRef = useRef<[number, number] | null>(null);
  const selectedHalfWRef = useRef<number>(CARD_W / 2);
  const selectedHalfHRef = useRef<number>(CARD_H / 2);
  // Always start at 0.5 — CameraController handles the dezoom on each visit
  const zoomTargetRef = useRef<number>(0.5);
  const panDeltaRef = useRef({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);
  // Read by CameraController only (wheel/drag redirect into the gallery scroll
  // instead of panning) — a plain prop-threaded ref, same idiom as the other
  // cross-component refs above, rather than focusState module state (nothing
  // else needs it across renders).
  const hasGalleryRef = useRef(false);
  const cameraStateRef = useRef<CameraState>({
    zoom: 0.5,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const rippleRef = useRef<RippleState | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const panelX = useMotionValue(-9999);
  const panelY = useMotionValue(0);

  const handleLayoutChange = useCallback(
    () => setTileVersion((v) => v + 1),
    [],
  );

  // Détecte mobile/desktop → bascule la grille (verticale ↔ masonry) + rebuild
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const apply = () => {
      isMobileRef.current = mq.matches;
      setIsMobile(mq.matches);
      applyResponsiveLayout(paramsRef.current, mq.matches);
      handleLayoutChange();
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [handleLayoutChange]);

  // paramsRef holds tunable layout params mutated by other effects; tileVersion
  // is the deliberate reactive trigger to recompute this memo off that ref.
  const tile = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => buildTile(artifacts, paramsRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artifacts, tileVersion],
  );

  const videoTextures = usePlayVideoTextures(artifacts, handleLayoutChange);

  // Mark visited on mount (used by loading bar — shows only on first visit)
  useEffect(() => {
    _hasVisited = true;
  }, []);

  // Loading bar — only on first visit (revisits have all assets cached).
  // Simple fixed-duration timer — more reliable than DefaultLoadingManager
  // which can fire prematurely or not at all depending on asset caching.
  useEffect(() => {
    if (!firstMount.current) return;
    const t = setTimeout(() => setLoading(false), LOADING_BAR_MS);
    return () => clearTimeout(t);
  }, []);

  // Intro trigger — bump introKey on the rising edge of "revealed"
  // (active & not loading). First visit: waits for the LoadingBar to clear.
  // Revisits: fires when `active` flips true after the route transition.
  useEffect(() => {
    const ready = active && !loading;
    if (ready && !readyRef.current) {
      readyRef.current = true;
      setIntroKey((k) => k + 1);
    } else if (!ready) {
      readyRef.current = false;
    }
  }, [active, loading]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const triggerRippleAt = useCallback((clientX: number, clientY: number) => {
    const cam = cameraStateRef.current;
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect || cam.width === 0 || cam.height === 0) return;
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const ndcX = (offsetX / cam.width) * 2 - 1;
    const ndcY = -((offsetY / cam.height) * 2 - 1);
    const worldX = cam.x + (ndcX * cam.width) / (2 * cam.zoom);
    const worldY = cam.y + (ndcY * cam.height) / (2 * cam.zoom);
    rippleRef.current = {
      x: worldX,
      y: worldY,
      startTime: performance.now() / 1000,
    };
  }, []);

  // onPointerMissed is R3F-specific: it fires only when a click's raycast hits
  // no scene object, so it naturally distinguishes "clicked empty canvas"
  // (ripple + deselect) from "clicked a card" (focus, no ripple).
  const handleDeselect = useCallback(
    (e?: MouseEvent) => {
      if (dragMovedRef.current) return;
      setSelected(null);
      selectedWorldPosRef.current = null;
      zoomTargetRef.current = 1.0;
      panelX.set(-9999);
      hasGalleryRef.current = false;
      focusState.scrollOffset = 0;
      if (e) triggerRippleAt(e.clientX, e.clientY);
    },
    [panelX, triggerRippleAt],
  );

  // Sync focusState synchronously before browser paint (useLayoutEffect
  // fires before rAF) so Three.js always reads the correct value on the very
  // next frame. Focus now only ever exits via onPointerMissed → handleDeselect
  // (explicit click outside the card) — scroll/drag never trigger it.
  useLayoutEffect(() => {
    focusState.isActive = selected !== null;
  }, [selected]);

  // Deselect panel when navigating away from /play. handleDeselect calls
  // setSelected, but this reacts to the `active` transition itself — not a
  // value derivable during render.
  useEffect(() => {
    if (!active) handleDeselect();
  }, [active, handleDeselect]);

  // ActionBar → "project" mode while an artifact is focused, same principle
  // as ProjectPageClient on /work/[slug] (setProject/clearProject). onBack
  // deselects in place instead of the default "back → /work" navigation.
  useEffect(() => {
    if (!selected) return;
    setProject({
      title: selected.artifact.title,
      redirectUrl: null,
      onBack: handleDeselect,
    });
    return () => clearProject();
  }, [selected, setProject, clearProject, handleDeselect]);

  const handleSelect = useCallback(
    (
      item: ArtifactCanvasItem,
      point: [number, number],
      halfW: number,
      halfH: number,
      groupIdx: number,
      itemIdx: number,
    ) => {
      if (dragMovedRef.current) return;
      const q = paramsRef.current;
      const mobile = isMobileRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Zoom adaptatif : la card rentre dans une boîte cible (max W/H), donc
      // toutes les cards focus apparaissent ~à la même taille. (SELECTION_POP_SCALE
      // mirrors ArtifactMesh.tsx's own selection-pop scale.)
      const z = computeFocusZoom(
        halfW * 2 * SELECTION_POP_SCALE,
        halfH * 2 * SELECTION_POP_SCALE,
        vw,
        vh,
        mobile,
        q.focusZoomIntensity,
        q.camOffsetX,
        q.gapPanel,
      );

      // Cadrage caméra : card en haut (mobile, panel dessous) ou décalée à
      // gauche (desktop, panel à droite).
      const targetX = mobile ? point[0] : point[0] + q.camOffsetX / z;
      // Mobile : la card peut désormais remplir toute la largeur de l'écran,
      // donc être bien plus haute qu'avant — on la cale près du haut avec
      // juste assez de marge pour que son bord supérieur ne sorte jamais de
      // l'écran (sinon plus moyen d'y remonter : seul un clic en dehors fait
      // sortir du focus, le scroll ne le fait plus).
      const halfHScreen = halfH * SELECTION_POP_SCALE * z;
      const vFrac = mobile
        ? computeMobileVFrac(halfHScreen, vh)
        : q.focusVCenter; // centre card (0 haut · 1 bas)
      const targetY = point[1] - ((0.5 - vFrac) * vh) / z;

      setSelected({ artifact: item, groupIdx, itemIdx });
      selectTargetRef.current = { x: targetX, y: targetY };
      selectedWorldPosRef.current = point;
      // × SELECTION_POP_SCALE : PanelPositioner doit suivre le bord réel de
      // la card une fois poppée, pas sa taille native.
      selectedHalfWRef.current = halfW * SELECTION_POP_SCALE;
      selectedHalfHRef.current = halfH * SELECTION_POP_SCALE;
      zoomTargetRef.current = z;
      // Multi-media artifact → CameraController redirects wheel/drag into the
      // in-canvas gallery stack instead of panning (see onWheel/onMove).
      hasGalleryRef.current = !!item.gallery && item.galleryCount > 1;
      focusState.scrollOffset = 0;
    },
    [],
  );

  if (artifacts.length === 0) {
    return (
      <div className="w-screen h-dvh flex items-center justify-center bg-stone-50">
        <p className="text-sm text-stone-400">no artifacts yet</p>
      </div>
    );
  }

  return (
    <div
      className="w-screen h-dvh relative"
      data-lenis-prevent
      style={{ backgroundColor: "#ffffff" }}
    >
      <LoadingBar loading={loading && active} />

      {/* Canvas — always visible, dezoom 0.5→1 on mount */}
      <div
        ref={canvasWrapperRef}
        style={{ position: "absolute", inset: 0, touchAction: "none" }}
      >
        <Canvas
          orthographic
          camera={{ zoom: 0.5, position: [0, 0, 100], near: 0.1, far: 10000 }}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            alpha: true,
          }}
          frameloop={running ? "always" : "never"}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
          onPointerMissed={handleDeselect}
        >
          <InfiniteTiles
            tile={tile}
            videoTextures={videoTextures}
            selected={selected}
            onSelect={handleSelect}
            selectTarget={selectTargetRef}
            zoomTarget={zoomTargetRef}
            worldPosRef={selectedWorldPosRef}
            halfWRef={selectedHalfWRef}
            halfHRef={selectedHalfHRef}
            panelX={panelX}
            panelY={panelY}
            paramsRef={paramsRef}
            panDeltaRef={panDeltaRef}
            dragMovedRef={dragMovedRef}
            hasGalleryRef={hasGalleryRef}
            cameraStateRef={cameraStateRef}
            rippleRef={rippleRef}
            active={active}
            running={running}
            introKey={introKey}
            isMobile={isMobile}
          />
        </Canvas>
      </div>

      {/* Info panel — tracks selected card via motion values */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={`${selected.groupIdx}-${selected.itemIdx}`}
            className="fixed z-50 pointer-events-none"
            style={{ left: 0, top: 0, x: panelX, y: panelY }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: {
                duration: 0.22,
                delay: PANEL_DELAY_S,
                ease: "easeOut",
              },
            }}
            exit={{
              opacity: 0,
              transition: { duration: 0.14, ease: "easeIn" },
            }}
          >
            <div className="pointer-events-auto">
              <ArtifactInfo artifact={selected.artifact} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tweakpane debug — dev only, dynamic import → not bundled in prod */}
      <DebugPane
        paramsRef={paramsRef}
        onLayoutChange={handleLayoutChange}
      />
    </div>
  );
}
