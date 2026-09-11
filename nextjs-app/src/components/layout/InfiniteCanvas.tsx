"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Canvas } from "@react-three/fiber";
import { motion, AnimatePresence } from "motion/react";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import { SELECTION_POP_SCALE } from "@/lib/artifact-utils";
import { ArtifactInfo } from "@/components/blocks/ArtifactInfo";
import { useActionBar } from "@/contexts/ActionBarContext";
import {
  MOBILE_BREAKPOINT,
  applyResponsiveLayout,
} from "@/lib/play-params";
import { computeFocusZoom, computeMobileVFrac } from "@/lib/play-focus-zoom";
import { buildTile } from "@/lib/play-tile-layout";
import type { SelectedInstance } from "@/lib/play-types";
import { usePlayStore, PlayStoreProvider } from "@/contexts/PlayStoreContext";
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
//  Reads/writes the shared PlayRuntime via usePlayStore() — PlayCanvas.tsx
//  (our parent) already wraps us in PlayStoreProvider. React Three Fiber's
//  <Canvas> renders its children through a SEPARATE reconciler root, so plain
//  Context from outside doesn't reach it (the documented reason drei ships
//  useContextBridge) — we re-provide the same runtime instance a second time
//  around <InfiniteTiles> below to bridge it in, no extra dependency needed
//  since we already own both the value and the Provider.
export function InfiniteCanvas({
  artifacts,
  active = true,
  running = active,
}: {
  artifacts: ArtifactCanvasItem[];
  active?: boolean;
  running?: boolean; // keeps frameloop alive during outro even when active=false
}) {
  const store = usePlayStore();
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
  // Synchronous mirror of isMobile for handleSelect (stable-identity callback,
  // can't close over the state value without going stale) — same idiom as
  // firstMount/readyRef above, unrelated to the shared PlayRuntime.
  const isMobileRef = useRef(false);

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  // Adapter for DebugPane's still-ref-shaped API (step 7, not yet migrated to
  // usePlayStore()) — store.params never gets reassigned after creation, only
  // mutated in place, so mirroring it into a ref once keeps both call sites
  // looking at the exact same object.
  const paramsRef = useRef(store.params);

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
      applyResponsiveLayout(store.params, mq.matches);
      handleLayoutChange();
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [handleLayoutChange, store]);

  // store.params holds tunable layout params mutated by other effects/DebugPane;
  // tileVersion is the deliberate reactive trigger to recompute this memo off it.
  const tile = useMemo(
    () => buildTile(artifacts, store.params),
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
  // store is the shared runtime's designated imperative-mutation surface
  // (see PlayStoreContext.tsx's own header comment) — reads/writes to it from
  // event handlers are the intended pattern, not accidental impurity.
  /* eslint-disable react-hooks/immutability */
  const triggerRippleAt = useCallback((clientX: number, clientY: number) => {
    const cam = store.camera.state;
    const rect = canvasWrapperRef.current?.getBoundingClientRect();
    if (!rect || cam.width === 0 || cam.height === 0) return;
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const ndcX = (offsetX / cam.width) * 2 - 1;
    const ndcY = -((offsetY / cam.height) * 2 - 1);
    const worldX = cam.x + (ndcX * cam.width) / (2 * cam.zoom);
    const worldY = cam.y + (ndcY * cam.height) / (2 * cam.zoom);
    store.ripple = { x: worldX, y: worldY, startTime: performance.now() / 1000 };
  }, [store]);

  // onPointerMissed is R3F-specific: it fires only when a click's raycast hits
  // no scene object, so it naturally distinguishes "clicked empty canvas"
  // (ripple + deselect) from "clicked a card" (focus, no ripple).
  const handleDeselect = useCallback(
    (e?: MouseEvent) => {
      if (store.pointer.dragMoved) return;
      setSelected(null);
      store.focus.worldPos = null;
      store.camera.zoomTarget = 1.0;
      // Hands off to CameraController's own FSM — collapses to "idle" itself
      // once the exit-focus zoom lerp actually settles (see CameraController).
      store.camera.phase = "returning";
      store.panel.x.set(-9999);
      store.gallery.hasGallery = false;
      // scrollOffset is deliberately NOT reset here (unlike handleSelect
      // below) — GalleryStack stays mounted through its own exit-fade grace
      // window (see useDelayedFalse in GridCard.tsx) and eases it back to
      // rest itself, so the stack settles into place instead of jump-cutting
      // past wherever the user had scrolled to.
      if (e) triggerRippleAt(e.clientX, e.clientY);
    },
    [store, triggerRippleAt],
  );
  /* eslint-enable react-hooks/immutability */

  // Deselect panel when navigating away from /play. handleDeselect calls
  // setSelected, but this reacts to the `active` transition itself — not a
  // value derivable during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // See the earlier triggerRippleAt/handleDeselect block — store is the
  // shared runtime's designated imperative-mutation surface.
  /* eslint-disable react-hooks/immutability */
  const handleSelect = useCallback(
    (
      item: ArtifactCanvasItem,
      point: [number, number],
      halfW: number,
      halfH: number,
      groupIdx: number,
      itemIdx: number,
    ) => {
      if (store.pointer.dragMoved) return;
      const q = store.params;
      const mobile = isMobileRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Zoom adaptatif : la card rentre dans une boîte cible (desktop : largeur
      // fixe, hauteur libre — mobile : largeur pleine, hauteur bornée), donc
      // toutes les cards focus apparaissent ~à la même taille. (SELECTION_POP_SCALE
      // mirrors useCardAnimation.ts's own selection-pop scale.)
      const boxW = mobile ? vw : q.focusWidthFrac * vw;
      const boxH = mobile ? vh * 0.85 * q.focusZoomIntensity : Infinity;
      const z = computeFocusZoom(
        halfW * 2 * SELECTION_POP_SCALE,
        halfH * 2 * SELECTION_POP_SCALE,
        boxW,
        boxH,
      );

      // Cadrage caméra : card en haut (mobile, panel dessous) ou centrée sur
      // focusCenterFrac (règle des tiers par défaut, desktop, panel à droite).
      const targetX = mobile
        ? point[0]
        : point[0] + ((0.5 - q.focusCenterFrac) * vw) / z;
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
      store.focus.target = { x: targetX, y: targetY };
      store.focus.worldPos = point;
      // × SELECTION_POP_SCALE : PanelPositioner doit suivre le bord réel de
      // la card une fois poppée, pas sa taille native.
      store.focus.halfW = halfW * SELECTION_POP_SCALE;
      store.focus.halfH = halfH * SELECTION_POP_SCALE;
      store.camera.zoomTarget = z;
      // CameraController notices the phase change next frame and builds the
      // snap tween from wherever the camera actually is right now.
      store.camera.phase = "focusing";
      // Multi-media artifact → CameraController redirects wheel/drag into the
      // in-canvas gallery stack instead of panning (see onWheel/onMove).
      store.gallery.hasGallery = !!item.gallery && item.galleryCount > 1;
      store.gallery.scrollOffset = 0;
    },
    [store],
  );
  /* eslint-enable react-hooks/immutability */

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
          <PlayStoreProvider runtime={store}>
            <InfiniteTiles
              tile={tile}
              videoTextures={videoTextures}
              selected={selected}
              onSelect={handleSelect}
              active={active}
              running={running}
              introKey={introKey}
              isMobile={isMobile}
            />
          </PlayStoreProvider>
        </Canvas>
      </div>

      {/* Info panel — tracks selected card via motion values */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={`${selected.groupIdx}-${selected.itemIdx}`}
            className="fixed z-50 pointer-events-none"
            style={{ left: 0, top: 0, x: store.panel.x, y: store.panel.y }}
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
