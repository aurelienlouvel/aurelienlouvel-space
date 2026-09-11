"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ArtifactFirstMedia } from "@/sanity/queries";
import { buildImageUrl } from "@/lib/sanity-image";
import {
  CARD_W,
  GALLERY_REVEAL_STAGGER, GALLERY_REVEAL_DURATION, GALLERY_HIDE_DURATION,
  GALLERY_SCROLL_SNAP_DURATION, SELECTION_POP_SCALE,
} from "@/lib/artifact-utils";
import { getRoundedAlpha } from "@/lib/play-card-textures";
import { easeOutExpo } from "@/lib/easings";
import { dampRef } from "@/lib/damp";
import { usePlayStore } from "@/contexts/PlayStoreContext";
import { SELECTION_SPRING } from "./useCardAnimation";

// ─── Gallery stack ────────────────────────────────────────────────────────────
//  Real, unmasked, scrollable in-canvas replacement for the single mesh once a
//  focused artifact has more than one gallery media — every item stacked
//  top-to-bottom as its own plane (own rounded-corner mask), gap between
//  each — always a vertical column, desktop and mobile alike (only the PANEL
//  docks differently: left of the media on desktop, below it on mobile — see
//  PanelPositioner/play-focus-zoom.ts, unrelated to this axis). Loops
//  infinitely: scrolling past the last item wraps back to the first (and
//  vice versa), same "endless" spirit as the background grid's own tiling.
//  Scroll input is redirected here by CameraController's
//  onWheel/onDown/onMove via store.gallery.scrollOffset instead of panning
//  the camera — see PlayStoreContext.tsx.
const STACK_GAP = 24; // world units between stacked items (incl. gap on wrap)
// Loop copies rendered per item (prev/current/next period) so the wrap reads
// seamlessly right up to the viewport edges — see GalleryStack's useFrame.
const LOOP_COPIES = [-1, 0, 1] as const;
// Items 1+ pop in/out as they reveal (and reverse as they hide): slide up
// from below their resting spot and scale up from smaller — see
// GalleryPlane's useFrame. World +Y is up on screen, so a positive offset
// subtracted from the resting Y starts/ends the item BELOW its resting
// position. Rotation is NOT part of this — that's the continuous wheel-tilt
// below, which already covers every item (including mid-reveal ones).
const GALLERY_REVEAL_SLIDE      = 130; // world units travelled vertically
const GALLERY_REVEAL_SCALE_FROM = 0.7; // starting/ending scale (settles to 1)

// "Wheel" scroll tilt — every item rotates in-plane (rotation.z) by an amount
// that grows with its live distance from the centered/focused slot (its
// resting Y plus the current scroll offset) and passes back through 0° right
// at center — "pivote pour être bien orienté": whichever item is centered
// reads flat/upright, and items ramp away from that the further they've
// scrolled off, like frames on a rolling wheel/reel tipping in and out of
// view. Sign follows which side of center the item currently sits on, so it
// swings smoothly through 0 as an item crosses center rather than jumping.
// TILT_RADIUS is in the same world-unit space as CARD_W/STACK_GAP (NOT
// screen pixels), picked so a neighbouring item already shows a clear tilt
// without needing to scroll far. See GalleryPlane's useFrame.
const GALLERY_WHEEL_TILT_RADIUS = 400; // world units — distance at which tilt saturates
const GALLERY_WHEEL_TILT_MAX    = 12;  // degrees, reached at/beyond the radius above

// Item 0 (the clicked media) keeps a constant, fully-opaque, full-scale look
// here — its own transition is the group-level pop in GalleryStack's
// scaleAnim. Items 1+ cascade in (staggered fade+scale) when selected, and
// fade back out on deselect. isSelected/revealStartRef come from the owning
// GalleryStack — revealStartRef is a ref (read fresh every frame, not a
// snapshot prop) so the animation restarts the instant it's reset, even if
// this instance never actually unmounted (e.g. a fast reselect during the
// exit grace window — see GridCard's useDelayedFalse). The wheel tilt
// below applies to EVERY item incl. index 0, every frame, regardless of
// reveal state — index 0 can scroll away from center too, same as any other.
function GalleryPlane({
  texture, y, w, h, index, isSelected, revealStartRef, offsetRef, onSelect,
}: {
  texture: THREE.Texture; y: number; w: number; h: number; index: number;
  isSelected: boolean; revealStartRef: React.MutableRefObject<number | null>;
  // Live wrapped scroll offset (world units), updated every frame by the
  // owning GalleryStack's own useFrame — read fresh here (not a snapshot
  // prop) so the wheel tilt animates continuously as the user scrolls,
  // instead of only updating on this item's own re-render.
  offsetRef: React.MutableRefObject<number>;
  // Clicking a stacked item eases it to center (see GalleryStack's
  // handleItemClick/scrollAnim) — wired on every item incl. index 0, where
  // it's a harmless near-zero-distance no-op since it's already centered.
  onSelect: (y: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    const mat  = mesh?.material as THREE.MeshBasicMaterial | undefined;
    if (!mesh || !mat) return;

    // ── Wheel tilt ───────────────────────────────────────────────────────────
    // Clamped to ±1 before scaling to degrees — beyond the radius the tilt
    // holds at its max instead of continuing to increase without bound.
    const dist  = y + offsetRef.current;
    const ratio = THREE.MathUtils.clamp(dist / GALLERY_WHEEL_TILT_RADIUS, -1, 1);
    mesh.rotation.z = THREE.MathUtils.degToRad(ratio * GALLERY_WHEEL_TILT_MAX);
    // Sign is a judgment call made without a live render to check against —
    // flip the sign above if it curls the wrong way once you see it moving.

    if (index === 0) {
      mat.opacity = 1;
      mesh.scale.setScalar(1);
      return;
    }

    const start = revealStartRef.current;
    if (start === null) return; // GalleryStack hasn't ticked its own useFrame yet this mount — wait one frame

    const now = performance.now();
    let p: number;
    if (!isSelected) {
      const t = Math.max(0, Math.min(1, (now - start) / GALLERY_HIDE_DURATION));
      p = easeOutExpo(t);
      mat.opacity = 1 - p;
    } else {
      const delay = index * GALLERY_REVEAL_STAGGER;
      const t = Math.max(0, Math.min(1, (now - start - delay) / GALLERY_REVEAL_DURATION));
      p = easeOutExpo(t);
      mat.opacity = p;
    }
    // travel: 1 = fully off (below resting spot, shrunk), 0 = fully settled —
    // drives position/scale together so they read as one motion instead of
    // two unrelated tweens. Slides+scales into place on reveal (p: 0→1 while
    // appearing), reverses on hide (p: 0→1 while disappearing).
    const travel = isSelected ? 1 - p : p;
    mesh.position.y = y - travel * GALLERY_REVEAL_SLIDE;
    mesh.scale.setScalar(1 - travel * (1 - GALLERY_REVEAL_SCALE_FROM));
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, y, 0]}
      onClick={(e) => {
        e.stopPropagation(); // don't let this reach onPointerMissed → deselect
        onSelect(y);
      }}
      onPointerOver={(e) => {
        if (index === 0) return; // already centered — no affordance needed
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (index !== 0) document.body.style.cursor = "auto";
      }}
    >
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        transparent
        opacity={0}
        alphaMap={getRoundedAlpha(w, h) ?? undefined}
      />
    </mesh>
  );
}

function GalleryStackImageItem({
  src, y, w, h, index, isSelected, revealStartRef, offsetRef, onSelect,
}: {
  src: string; y: number; w: number; h: number; index: number;
  isSelected: boolean; revealStartRef: React.MutableRefObject<number | null>;
  offsetRef: React.MutableRefObject<number>;
  onSelect: (y: number) => void;
}) {
  // useTexture caches by URL — mounting this 3× for an item's looped copies
  // resolves to the same GPU texture, no duplicate fetch/upload.
  const texture = useTexture(src);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <GalleryPlane
      texture={texture} y={y} w={w} h={h} index={index}
      isSelected={isSelected} revealStartRef={revealStartRef} offsetRef={offsetRef}
      onSelect={onSelect}
    />
  );
}

// Gallery items beyond index 0 aren't covered by InfiniteCanvas.tsx's
// artifact-scoped video cache (which only ever holds firstMedia = gallery[0])
// — this loads its own <video> on demand and tears it down on unmount, same
// spirit as the old DOM filmstrip loading gallery videos fresh each mount.
// Renders nothing itself: owns exactly ONE decode pipeline per gallery item,
// published up via setTextures/setAspects (plain useState setters — stable
// identity, safe deps) regardless of how many looped copies GalleryStack
// draws from that one texture. Three independent <video> elements decoding
// the same file would waste bandwidth/CPU and could drift out of sync.
function GalleryVideoLoader({
  media,
  index,
  setTextures,
  setAspects,
}: {
  media:       ArtifactFirstMedia;
  index:       number;
  setTextures: React.Dispatch<React.SetStateAction<Map<number, THREE.VideoTexture>>>;
  setAspects:  React.Dispatch<React.SetStateAction<Map<number, number>>>;
}) {
  useEffect(() => {
    const src = media.videoFileUrl ?? media.videoUrl;
    if (!src) return;

    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous"; // MUST be before src to avoid CORS taint
    vid.src = src;
    vid.muted = true;
    vid.autoplay = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.preload = "auto";
    vid.play().catch(() => {});

    const tex = new THREE.VideoTexture(vid);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Publishing a handle to the video/texture this effect just created (an
    // external resource, not a value derivable from render) — same pattern
    // as StoryStack.tsx's advance(). The functional-updater form isn't
    // flagged by react-hooks/set-state-in-effect (unlike a direct
    // setTexture(tex) call), so no disable comment needed here.
    setTextures((prev) => new Map(prev).set(index, tex));

    const onMeta = () => {
      if (vid.videoWidth && vid.videoHeight) {
        const ratio = vid.videoHeight / vid.videoWidth;
        setAspects((prev) => (prev.get(index) === ratio ? prev : new Map(prev).set(index, ratio)));
      }
    };
    if (vid.readyState >= 1 /* HAVE_METADATA */) onMeta();
    else vid.addEventListener("loadedmetadata", onMeta, { once: true });

    return () => {
      vid.removeEventListener("loadedmetadata", onMeta);
      vid.pause();
      vid.removeAttribute("src");
      vid.load();
      tex.dispose();
      setTextures((prev) => {
        if (!prev.has(index)) return prev;
        const next = new Map(prev);
        next.delete(index);
        return next;
      });
    };
  }, [media, index, setTextures, setAspects]);

  return null;
}

// gallery[0]'s video texture (videoTexture0) is owned/created elsewhere
// (InfiniteCanvas.tsx's shared grid video cache, already playing before the
// artifact was even clicked) — this only ever OBSERVES that existing <video>
// element for its true aspect ratio, never creates a second decode pipeline
// for it. Without this, index 0 permanently fell back to the 9:16 guess
// (GalleryVideoLoader is never mounted for it), visibly stretching or
// squishing any video that isn't actually 9:16.
function GalleryFirstVideoAspect({
  texture,
  setAspects,
}: {
  texture:     THREE.VideoTexture;
  setAspects:  React.Dispatch<React.SetStateAction<Map<number, number>>>;
}) {
  useEffect(() => {
    const vid = texture.image as HTMLVideoElement | undefined;
    if (!vid) return;
    const onMeta = () => {
      if (!vid.videoWidth || !vid.videoHeight) return;
      const ratio = vid.videoHeight / vid.videoWidth;
      setAspects((prev) => (prev.get(0) === ratio ? prev : new Map(prev).set(0, ratio)));
    };
    if (vid.readyState >= 1 /* HAVE_METADATA */) onMeta();
    else vid.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => vid.removeEventListener("loadedmetadata", onMeta);
  }, [texture, setAspects]);

  return null;
}

export function GalleryStack({
  gallery,
  worldPos,
  cardScale = 1,
  videoTexture0,
  isSelected,
}: {
  gallery:        ArtifactFirstMedia[];
  worldPos:       [number, number];
  cardScale?:     number;
  videoTexture0?: THREE.VideoTexture; // already-cached texture for gallery[0], if it's a video
  isSelected:     boolean; // false while playing its exit fade, just before GridCard unmounts it
}) {
  const store     = usePlayStore();
  const groupRef  = useRef<THREE.Group>(null);
  const scaleAnim = useRef(1); // pops toward SELECTION_POP_SCALE, same feel as MeshBody's selAnim
  // Local reveal-animation clock for items 1+ (see GalleryPlane) — reset
  // whenever isSelected actually flips, including a reselect that lands
  // before this instance ever unmounted (that's what makes the animation
  // reliably "relaunch" on every reselect). Deliberately a ref local to THIS
  // instance, not module state: a shared clock would let a fast deselect-A /
  // select-B (both galleries) reset A's timer while A is still playing its
  // own exit fade in the unmount grace period (see GridCard's
  // useDelayedFalse), snapping its items back to "revealing" mid-hide.
  const revealStart  = useRef<number | null>(null); // lazily set on first useFrame tick — performance.now() is impure, can't seed it during render
  const prevSelected = useRef(isSelected);
  // Live wrapped scroll offset (world units), updated every frame below —
  // read fresh by every GalleryPlane instance to drive the wheel tilt (see
  // GALLERY_WHEEL_TILT_RADIUS). A ref, not state: it changes every frame
  // during a scroll, and routing that through React state would re-render
  // this whole subtree at 60fps for nothing — same idiom as revealStart.
  const offsetRef = useRef(0);
  // Eased scrollOffset transition — set either by clicking a stacked item
  // (handleItemClick below) or automatically when exiting focus (see
  // useFrame below), and ticked down each frame until it lands on `to`. A
  // ref, not state, same "written every frame during an animation" idiom as
  // offsetRef — this one just happens to also write back into the shared
  // store.gallery.scrollOffset so CameraController's wheel/drag deltas keep
  // compounding on top of wherever it settles.
  const scrollAnim = useRef<{ startTime: number; from: number; to: number } | null>(null);
  // Detected video aspect ratios (height/width) and loaded textures, keyed by
  // gallery index — unknown until each video's loadedmetadata fires (Sanity
  // doesn't store video dimensions, same runtime-detection story as
  // artifact-utils.ts). Owned here (not per loop-copy) so every wrapped copy
  // of a given item shares the exact same decoded video texture.
  const [videoAspect, setVideoAspect]     = useState<Map<number, number>>(new Map());
  const [videoTextures, setVideoTextures] = useState<Map<number, THREE.VideoTexture>>(new Map());

  const w = CARD_W * cardScale;
  const heights = gallery.map((m, i) => {
    if (m._type === "galleryImage" && m.imageWidth && m.imageHeight) {
      return Math.round((w * m.imageHeight) / m.imageWidth);
    }
    const ratio = videoAspect.get(i);
    return Math.round(w * (ratio ?? 9 / 16)); // fallback until video metadata loads
  });

  // Cumulative top-Y of each item — reduce-accumulator style (no outer
  // mutable variable) so this stays a pure render-time computation.
  const { tops, rawTotal } = heights.reduce<{ tops: number[]; rawTotal: number }>(
    (acc, h) => {
      acc.tops.push(acc.rawTotal);
      acc.rawTotal += h + STACK_GAP;
      return acc;
    },
    { tops: [], rawTotal: 0 },
  );
  // Full loop distance — scroll this far and item 0 reappears exactly where
  // it started, so wrapping the offset by this period is seamless.
  const period = rawTotal;

  // Clicking a stacked item eases scrollOffset so IT becomes the centered
  // "front" item — the rest of the stack reflows around it for free, since
  // their positions are already fixed relative to it (see yBase below).
  // Reuses the exact same eased-transition machinery as the exit-to-rest
  // case in useFrame below. `y` is the clicked mesh's own resting position,
  // its loop copy's k*period baked in (see the render loop) — targeting -y
  // directly keeps the animated direction faithful to the actual copy that
  // was clicked, then the shortest-path adjustment below avoids an
  // unnecessarily long spin if that raw target and the live offset land far
  // apart.
  const handleItemClick = (y: number) => {
    if (period <= 0) return;
    const from = offsetRef.current;
    const rawTarget = ((-y % period) + period) % period;
    let delta = rawTarget - from;
    if (delta > period / 2) delta -= period;
    else if (delta < -period / 2) delta += period;
    scrollAnim.current = { startTime: performance.now(), from, to: from + delta };
  };

  // Three.js objects (groupRef) are mutable, GPU-backed and driven every
  // frame — the standard R3F pattern — and store.gallery.scrollOffset is the
  // shared runtime's designated imperative field (see PlayStoreContext.tsx).
  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    if (revealStart.current === null || isSelected !== prevSelected.current) {
      if (prevSelected.current && !isSelected && period > 0) {
        // Exiting focus — ease scrollOffset back to rest (item 0 centered)
        // instead of InfiniteCanvas's handleDeselect snapping it to 0
        // outright, which used to jump-cut the stack to wherever it
        // happened to be scrolled the instant the swap to MeshBody/
        // ImageMesh/PlaceholderMesh landed. Shortest path, same as a click.
        // Unconditionally overrides any in-flight click-triggered animation
        // (handleItemClick) — deselecting always wins, so a click-then-
        // immediately-deselect never leaves scrollOffset mid-flight toward
        // the clicked item instead of back to rest.
        const from = offsetRef.current;
        const to = from > period / 2 ? period : 0;
        scrollAnim.current = { startTime: performance.now(), from, to };
      }
      prevSelected.current = isSelected;
      revealStart.current = performance.now();
    }

    if (scrollAnim.current) {
      const { startTime, from, to } = scrollAnim.current;
      const t = Math.min(1, (performance.now() - startTime) / GALLERY_SCROLL_SNAP_DURATION);
      store.gallery.scrollOffset = from + (to - from) * easeOutExpo(t);
      if (t >= 1) scrollAnim.current = null;
    }

    if (!groupRef.current) return;
    // Un-pop toward 1 while exiting (isSelected already false, still mounted
    // for its trailing fade-out) — mirrors MeshBody's selAnim un-popping on
    // deselect, so the handoff back to MeshBody once GridCard finally
    // unmounts never has a visible scale jump.
    const scaleTarget = isSelected ? SELECTION_POP_SCALE : 1;
    dampRef(scaleAnim, scaleTarget, SELECTION_SPRING);
    groupRef.current.scale.setScalar(scaleAnim.current);
    // Wrap into [0, period) — scrolling past either end cycles back around
    // instead of stopping, matching the canvas's own infinite-tiling feel.
    const offset = period > 0
      ? ((store.gallery.scrollOffset % period) + period) % period
      : 0;
    offsetRef.current = offset;
    groupRef.current.position.set(worldPos[0], worldPos[1] + offset, 0);
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group ref={groupRef} position={[worldPos[0], worldPos[1], 0]}>
      {/* One loader per video item, mounted once regardless of loop-copy count
          (see GalleryVideoLoader). Index 0 reuses the already-cached texture
          passed down via videoTexture0 instead of loading a duplicate — it
          still needs its real aspect ratio though, hence the watcher branch. */}
      {gallery.map((media, i) => {
        if (media._type !== "galleryVideo") return null;
        if (i === 0 && videoTexture0) {
          return <GalleryFirstVideoAspect key="aspect-0" texture={videoTexture0} setAspects={setVideoAspect} />;
        }
        return (
          <GalleryVideoLoader
            key={`loader-${i}`}
            media={media}
            index={i}
            setTextures={setVideoTextures}
            setAspects={setVideoAspect}
          />
        );
      })}

      {gallery.map((media, i) => {
        const h = heights[i];
        // Y of item i relative to item 0 — item 0 (the clicked/centered
        // media) always rests exactly at the group origin (0), which is what
        // GalleryPlane's wheel-tilt reads as "centered → upright" (see
        // GALLERY_WHEEL_TILT_RADIUS). The previous formula centered the
        // stack's overall bounding box instead, which left item 0 itself
        // off-center — and visibly tilted — the instant the gallery opened,
        // for any gallery where the other items don't sum to exactly its own
        // height (i.e. almost always).
        const yBase = heights[0] / 2 - tops[i] - h / 2;
        const isVideo = media._type === "galleryVideo";

        const texture = isVideo ? (i === 0 ? videoTexture0 : videoTextures.get(i)) : undefined;
        if (isVideo && !texture) return null; // not loaded yet

        const src = !isVideo
          ? (media.imageRef
              ? buildImageUrl(media.imageRef, media.imageUrl, media.imageHotspot, media.imageCrop, {
                  width: 1280,
                  quality: 80,
                })
              : media.imageUrl)
          : null;
        if (!isVideo && !src) return null;

        // Own Suspense per item: a slow-loading image no longer blocks the
        // others (or even the clicked item itself) from popping in. Without
        // this, the single outer Suspense (InfiniteTiles' per-artifact
        // wrapper around GridCard) would wait for EVERY gallery image to
        // resolve before showing anything at all — a multi-media artifact
        // would just vanish on click until the whole gallery finished
        // loading, instead of transitioning smoothly.
        return (
          <Suspense key={`s-${i}`} fallback={null}>
            {LOOP_COPIES.map((k) => {
              const y = yBase + k * period;
              const key = `${i}-${k}`;
              return isVideo
                ? <GalleryPlane key={key} texture={texture!} y={y} w={w} h={h} index={i} isSelected={isSelected} revealStartRef={revealStart} offsetRef={offsetRef} onSelect={handleItemClick} />
                : <GalleryStackImageItem key={key} src={src!} y={y} w={w} h={h} index={i} isSelected={isSelected} revealStartRef={revealStart} offsetRef={offsetRef} onSelect={handleItemClick} />;
            })}
          </Suspense>
        );
      })}
    </group>
  );
}
