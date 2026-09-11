"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ArtifactCanvasItem, ArtifactFirstMedia } from "@/sanity/queries";
import { buildImageUrl } from "@/lib/sanity-image";
import {
  CARD_W, CARD_H, MIN_CARD_H, MAX_CARD_H,
  INTRO_DURATION, INTRO_STAGGER_MAX, OUTRO_DURATION, OUTRO_STAGGER_MAX,
  GALLERY_HIDE_DURATION, STACK_LAYER_COUNT,
} from "@/lib/artifact-utils";
import { getRoundedAlpha, getBracketTexture } from "@/lib/play-card-textures";
import { easeOutExpo, easeOutBack } from "@/lib/easings";
import { dampRef } from "@/lib/damp";
import { usePlayStore } from "@/contexts/PlayStoreContext";
import { useCardAnimation, DIM_SCALE } from "./useCardAnimation";
import { GalleryStack } from "./GalleryStack";

// ─── Corner brackets ─────────────────────────────────────────────────────────
//
//  Single plane mesh with a canvas alpha map drawing 4 rounded L-brackets.
//
//  Behaviour:
//  • idle    : opacity 0 — invisible
//  • hover   : offAnim jumps to OFF_START (far) then lerps to OFF_NEAR →
//              creates a "zooming in" / approaching-the-card animation
//  • selected: opacity → 1, offAnim lerps to OFF_FOCUS
//              OFF_FOCUS is sized so brackets stay outside even at selAnim=1.04
//
const OFF_START = 36;   // world-units — bracket starting distance on hover entry
const OFF_NEAR  = 14;   // world-units — bracket resting distance while hovered
const OFF_FOCUS = 10;   // world-units — tighter when selected
//  Brackets are hidden entirely once selected (opacity → 0, see opTarget
//  below), so OFF_FOCUS's fit against the popped card scale (SELECTION_POP_SCALE,
//  see artifact-utils.ts) is never actually visible — moot in practice.

const BRACKET_LERP = 0.14; // vitesse d'approche/opacité des brackets (lerp/frame)

// Canvas sized for the maximum gap so we never need to regenerate
const OFF_MAX = OFF_START;

function CornerBrackets({
  hovered,
  isSelected,
  cardW,
  cardH,
}: {
  hovered:    boolean;
  isSelected: boolean;
  cardW:      number;
  cardH:      number;
}) {
  const store = usePlayStore();
  const meshRef     = useRef<THREE.Mesh>(null);
  const opAnim      = useRef(0);
  const offAnim     = useRef(OFF_NEAR);
  const prevHovered = useRef(false);
  const lastRadius  = useRef(16);

  // Canvas sized for the maximum distance so we never need to rebuild
  const fullW = cardW + 2 * OFF_MAX;
  const fullH = cardH + 2 * OFF_MAX;
  const tex   = getBracketTexture(fullW, fullH, 16);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;

    // ── Live radius swap: debug-pane slider takes effect without remount ────────
    const radius = store.params.bracketRadius;
    if (radius !== lastRadius.current) {
      lastRadius.current = radius;
      const newTex = getBracketTexture(fullW, fullH, radius);
      if (newTex) {
        mat.alphaMap = newTex;
        mat.needsUpdate = true;
      }
    }

    // ── Hover entry: jump to OFF_START so the approaching animation is visible ──
    // Pas de "ré-approche" des brackets si la card est déjà sélectionnée
    const justHovered = hovered && !prevHovered.current;
    if (justHovered && !isSelected) offAnim.current = OFF_START;
    prevHovered.current = hovered;

    // ── Opacity: 0 idle, 0.75 hover, 0 selected (hidden once focused) ───────────
    const opTarget = isSelected ? 0 : hovered ? 0.75 : 0;
    dampRef(opAnim, opTarget, BRACKET_LERP);
    if (opAnim.current < 0.005) opAnim.current = 0;
    if (opAnim.current > 0.995) opAnim.current = 1;
    mat.opacity = opAnim.current;

    // ── Gap: lerp toward OFF_NEAR (hover) or OFF_FOCUS (selected) ───────────────
    const offTarget = isSelected ? OFF_FOCUS : OFF_NEAR;
    dampRef(offAnim, offTarget, BRACKET_LERP);

    // Scale mesh so brackets appear at the animated distance from card edge
    const curW = cardW + 2 * offAnim.current;
    const curH = cardH + 2 * offAnim.current;
    meshRef.current.scale.set(curW / fullW, curH / fullH, 1);
  });

  if (!tex) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, 0.05]}>
      <planeGeometry args={[fullW, fullH]} />
      <meshBasicMaterial
        alphaMap={tex}
        color="#1c1917"
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Shared props ─────────────────────────────────────────────────────────────
type SharedProps = {
  worldPos:   [number, number];
  isSelected: boolean;
  onSelect:   (point: [number, number]) => void;
  cardScale?: number;
  cardH?:     number;
  // Backing layers for the idle-grid stack hint (see StackLayers) — the
  // artifact's OWN other gallery media (gallery[1..STACK_LAYER_COUNT]), real
  // content, not a placeholder. videoTextures is index-aligned with
  // stackMedia and only meaningful where that slot is a galleryVideo — see
  // usePlayVideoTextures.ts for how/why these are pre-shared across
  // InfiniteTiles' 9 tile copies.
  stackMedia?: ArtifactFirstMedia[];
  stackVideoTextures?: (THREE.VideoTexture | undefined)[];
  // Reference height (at CARD_W, pre-cardScale) for stack-layer videos whose
  // ratio has been runtime-detected — index-aligned with stackMedia, see
  // usePlayVideoTextures.ts. undefined until detected (StackLayers falls
  // back to a 16:9 guess meanwhile).
  stackVideoRefHeights?: (number | undefined)[];
};

// Raycast on/off : une card repliée ne doit pas intercepter le clic (le clic
// la traverse → onPointerMissed → désélection). dim/scale/hover config live
// in useCardAnimation.ts, shared by both MeshBody and PlaceholderMesh below.
const DEFAULT_RAYCAST: THREE.Mesh["raycast"] = THREE.Mesh.prototype.raycast;
const NOOP_RAYCAST: THREE.Mesh["raycast"] = () => {};

// ─── Gallery stack indicator (idle grid view) ────────────────────────────────
//  Artifacts with more than one gallery media render a couple of extra REAL
//  media planes (gallery[1..STACK_LAYER_COUNT], own texture each) behind the
//  front card — each with a small random rotation and offset baked in once
//  at mount (see makeStackLayers) — reading as a stack of photos, hinting
//  "there's more" before the artifact is even clicked. Purely decorative:
//  NOOP_RAYCAST so clicks always land on the front card, never these. Shared
//  by MeshBody and PlaceholderMesh below.
//  Images load via useTexture's own URL cache — free dedup across
//  InfiniteTiles' 9 tile copies, no duplicate fetch/upload (same reasoning as
//  GalleryStack's own image items). Videos NEVER decode their own <video>
//  here — they reuse the texture usePlayVideoTextures.ts already created and
//  shared across those same 9 copies (stackVideoTextures prop); doing our
//  own decode per layer would multiply it up to 9× for nothing.
const STACK_ROTATION_MAX  = 6; // degrees — random tilt range per layer
const STACK_OFFSET_MAX    = 5; // world units — random xy nudge range per layer
const STACK_LAYER_OPACITY = [0.92, 0.8]; // per layer, nearest-to-front first

type StackLayer = { rot: number; dx: number; dy: number };

function makeStackLayers(count: number): StackLayer[] {
  return Array.from({ length: count }, () => ({
    rot: (Math.random() * 2 - 1) * STACK_ROTATION_MAX,
    dx:  (Math.random() * 2 - 1) * STACK_OFFSET_MAX,
    dy:  (Math.random() * 2 - 1) * STACK_OFFSET_MAX,
  }));
}

// Applies the SAME live scale/opacity already driving the front card's own
// mesh this frame (see useCardAnimation.ts's tick()) to every backing layer —
// called inline from MeshBody/PlaceholderMesh's existing useFrame, never
// through React props, or it would only refresh on re-render.
function applyStackFrame(
  refs: React.MutableRefObject<(THREE.Mesh | null)[]>,
  scale: number,
  frontOpacity: number,
) {
  refs.current.forEach((mesh, i) => {
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const layerOpacity = STACK_LAYER_OPACITY[i] ?? STACK_LAYER_OPACITY[STACK_LAYER_OPACITY.length - 1];
    mat.opacity = frontOpacity * layerOpacity;
    mesh.scale.setScalar(scale);
    mesh.visible = mat.opacity > 0.001;
  });
}

// One backing layer's plane — position/rotation from its randomized layer,
// registers into stackRefs (index-aligned with the owning StackLayers' media
// array) so applyStackFrame can drive it every frame. NOOP_RAYCAST: never
// intercepts clicks, purely decorative.
function StackLayerPlane({
  layer, index, texture, w, h, stackRefs,
}: {
  layer: StackLayer; index: number; texture: THREE.Texture;
  w: number; h: number; stackRefs: React.MutableRefObject<(THREE.Mesh | null)[]>;
}) {
  return (
    <mesh
      ref={(m) => {
        // stackRefs is a ref threaded down as a prop (owned by MeshBody/
        // PlaceholderMesh, populated here so their useFrame can drive every
        // backing layer) — same imperative-ref-as-prop idiom as elsewhere in
        // this file, not accidental prop mutation.
        // eslint-disable-next-line react-hooks/immutability
        stackRefs.current[index] = m;
        if (m) m.raycast = NOOP_RAYCAST;
      }}
      position={[layer.dx, layer.dy, -0.02 * (index + 1)]}
      rotation={[0, 0, (layer.rot * Math.PI) / 180]}
    >
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        transparent
        opacity={0}
        depthWrite={false}
        alphaMap={getRoundedAlpha(CARD_W, h) ?? undefined}
      />
    </mesh>
  );
}

// Image backing layer — useTexture caches by URL, so this dedupes for free
// across InfiniteTiles' 9 tile copies (same texture, no duplicate fetch),
// same idiom as ImageMesh elsewhere in this file.
function StackLayerImage({
  url, layer, index, w, h, stackRefs,
}: {
  url: string; layer: StackLayer; index: number; w: number; h: number;
  stackRefs: React.MutableRefObject<(THREE.Mesh | null)[]>;
}) {
  const texture = useTexture(url);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return <StackLayerPlane layer={layer} index={index} texture={texture} w={w} h={h} stackRefs={stackRefs} />;
}

// Per-layer height honouring EACH layer's own aspect ratio — layers used to
// be forced uniformly into the FRONT card's h, stretching any layer whose
// native aspect differed from the front card's (e.g. a landscape photo
// stacked behind a portrait front card rendered squashed into portrait).
// Images: real Sanity asset dimensions. Videos: runtime-detected reference
// height (see usePlayVideoTextures.ts), rescaled from CARD_W to this card's
// actual w; falls back to a 16:9 guess until detected.
function stackLayerHeight(m: ArtifactFirstMedia, w: number, videoRefH: number | undefined): number {
  if (m._type === "galleryImage" && m.imageWidth && m.imageHeight) {
    return Math.max(MIN_CARD_H, Math.min(MAX_CARD_H, Math.round((w * m.imageHeight) / m.imageWidth)));
  }
  if (m._type === "galleryVideo") {
    if (videoRefH) return Math.max(MIN_CARD_H, Math.min(MAX_CARD_H, Math.round(videoRefH * (w / CARD_W))));
    return Math.round((w * 9) / 16); // fallback until runtime-detected
  }
  return CARD_H;
}

function StackLayers({
  media, videoTextures, videoRefHeights, layers, stackRefs, w,
}: {
  media:           ArtifactFirstMedia[]; // stackMedia — gallery[1..STACK_LAYER_COUNT]
  videoTextures:   (THREE.VideoTexture | undefined)[]; // index-aligned with media
  videoRefHeights: (number | undefined)[]; // index-aligned with media, video slots only
  layers:          StackLayer[]; // index-aligned with media (see makeStackLayers)
  stackRefs:       React.MutableRefObject<(THREE.Mesh | null)[]>;
  w: number;
}) {
  return (
    <>
      {media.map((m, i) => {
        const layer = layers[i];
        if (!layer) return null;
        const h = stackLayerHeight(m, w, videoRefHeights[i]);
        if (m._type === "galleryVideo") {
          const tex = videoTextures[i];
          if (!tex) return null; // shared texture not created yet — see usePlayVideoTextures.ts
          return (
            <StackLayerPlane
              key={i} layer={layer} index={i} texture={tex} w={w} h={h} stackRefs={stackRefs}
            />
          );
        }
        const src = m.imageRef
          ? buildImageUrl(m.imageRef, m.imageUrl, m.imageHotspot, m.imageCrop, { width: 640, quality: 70 })
          : m.imageUrl;
        if (!src) return null;
        return (
          <Suspense key={i} fallback={null}>
            <StackLayerImage url={src} layer={layer} index={i} w={w} h={h} stackRefs={stackRefs} />
          </Suspense>
        );
      })}
    </>
  );
}

// ─── MeshBody — image or video card ──────────────────────────────────────────
function MeshBody({
  texture,
  worldPos,
  isSelected,
  onSelect,
  cardScale = 1,
  cardH = CARD_H,
  stackMedia = [],
  stackVideoTextures = [],
  stackVideoRefHeights = [],
}: SharedProps & { texture: THREE.Texture }) {
  const store = usePlayStore();
  const { meshRef, groupRef, hovered, setHovered, tick } = useCardAnimation();
  const intro = useRef({ version: -1, opacity: 0, scaleBoost: 0.72, done: false });
  const outro = useRef({ version: -1, opacity: 1, scaleBoost: 1.0, done: true });
  const [staggerMs] = useState(() => Math.random() * INTRO_STAGGER_MAX);
  // Outro stagger is a scaled-down version of intro stagger (same relative order)
  const outroStaggerMs = staggerMs * (OUTRO_STAGGER_MAX / INTRO_STAGGER_MAX);
  const [stackLayers] = useState(() => makeStackLayers(stackMedia.length));
  const stackRefs = useRef<(THREE.Mesh | null)[]>([]);

  const w = CARD_W * cardScale;
  const h = cardH  * cardScale;

  useFrame(() => {
    // ── Intro ────────────────────────────────────────────────────────────────
    if (intro.current.version !== store.intro.version) {
      intro.current = { version: store.intro.version, opacity: 0, scaleBoost: 0.72, done: false };
      outro.current.done = true; // new intro cancels any ongoing outro
    }
    if (!intro.current.done) {
      const elapsed = performance.now() - store.intro.startTime - staggerMs;
      const t       = Math.max(0, Math.min(1, elapsed / INTRO_DURATION));
      intro.current.opacity    = easeOutExpo(t);
      intro.current.scaleBoost = t >= 1 ? 1 : 0.72 + 0.28 * easeOutBack(t);
      if (t >= 1) intro.current.done = true;
    }

    // ── Outro ────────────────────────────────────────────────────────────────
    if (outro.current.version !== store.outro.version) {
      outro.current = { version: store.outro.version, opacity: 1, scaleBoost: 1.0, done: false };
    }
    if (!outro.current.done) {
      const elapsed = performance.now() - store.outro.startTime - outroStaggerMs;
      const t       = Math.max(0, Math.min(1, elapsed / OUTRO_DURATION));
      outro.current.opacity    = 1 - easeOutExpo(t);
      outro.current.scaleBoost = 1 - 0.16 * t;
      if (t >= 1) outro.current.done = true;
    }

    // Outro overrides intro while playing
    const opacity    = outro.current.done ? intro.current.opacity    : outro.current.opacity;
    const scaleBoost = outro.current.done ? intro.current.scaleBoost : outro.current.scaleBoost;

    // ── Shared hover/selection spring + focus dim + idle tilt ──────────────────
    const { scale, dimAmount, dimmed } = tick(isSelected);
    const finalOpacity = opacity * (1 - dimAmount);

    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = finalOpacity;
      meshRef.current.scale.setScalar(scale * scaleBoost * (1 - DIM_SCALE * dimAmount));
      meshRef.current.visible = finalOpacity > 0.001;
      // repliée → non-cliquable (le clic traverse et désélectionne)
      meshRef.current.raycast = dimmed ? NOOP_RAYCAST : DEFAULT_RAYCAST;
    }
    if (stackLayers.length > 0) {
      applyStackFrame(stackRefs, scale * scaleBoost * (1 - DIM_SCALE * dimAmount), finalOpacity);
    }
  });

  return (
    <group ref={groupRef} position={[worldPos[0], worldPos[1], 0]}>
      {stackLayers.length > 0 && (
        <StackLayers
          media={stackMedia} videoTextures={stackVideoTextures} videoRefHeights={stackVideoRefHeights}
          layers={stackLayers} stackRefs={stackRefs} w={w}
        />
      )}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
        onClick={(e) => {
          e.stopPropagation();
          const wp = new THREE.Vector3();
          groupRef.current?.getWorldPosition(wp);
          onSelect([wp.x, wp.y]);
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          map={texture}
          toneMapped={false}
          transparent
          alphaMap={getRoundedAlpha(CARD_W, cardH) ?? undefined}
        />
      </mesh>
      <CornerBrackets hovered={hovered} isSelected={isSelected} cardW={w} cardH={h} />
    </group>
  );
}

// ─── Placeholder (no media) ───────────────────────────────────────────────────
function PlaceholderMesh({
  worldPos, isSelected, onSelect, cardScale = 1, cardH = CARD_H,
  stackMedia = [], stackVideoTextures = [], stackVideoRefHeights = [],
}: SharedProps) {
  const { meshRef, groupRef, hovered, setHovered, tick } = useCardAnimation();
  const [stackLayers] = useState(() => makeStackLayers(stackMedia.length));
  const stackRefs = useRef<(THREE.Mesh | null)[]>([]);

  const w = CARD_W * cardScale;
  const h = cardH  * cardScale;

  useFrame(() => {
    const { scale, dimAmount, dimmed } = tick(isSelected);

    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - dimAmount;
      meshRef.current.scale.setScalar(scale * (1 - DIM_SCALE * dimAmount));
      meshRef.current.visible = 1 - dimAmount > 0.001;
      meshRef.current.raycast = dimmed ? NOOP_RAYCAST : DEFAULT_RAYCAST;
    }
    if (stackLayers.length > 0) {
      applyStackFrame(stackRefs, scale * (1 - DIM_SCALE * dimAmount), 1 - dimAmount);
    }
  });

  return (
    <group ref={groupRef} position={[worldPos[0], worldPos[1], 0]}>
      {stackLayers.length > 0 && (
        <StackLayers
          media={stackMedia} videoTextures={stackVideoTextures} videoRefHeights={stackVideoRefHeights}
          layers={stackLayers} stackRefs={stackRefs} w={w}
        />
      )}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
        onClick={(e) => {
          e.stopPropagation();
          const wp = new THREE.Vector3();
          groupRef.current?.getWorldPosition(wp);
          onSelect([wp.x, wp.y]);
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          color="#e7e5e4"
          transparent
          alphaMap={getRoundedAlpha(CARD_W, cardH) ?? undefined}
        />
      </mesh>
      <CornerBrackets hovered={hovered} isSelected={isSelected} cardW={w} cardH={h} />
    </group>
  );
}

// ─── Image mesh — useTexture suspends until loaded ────────────────────────────
function ImageMesh({ url, ...rest }: SharedProps & { url: string }) {
  const texture = useTexture(url);
  useEffect(() => {
    // Three.js texture is a mutable GPU-backed object — this is the standard
    // R3F/drei pattern for configuring it post-load, not React state.
    // eslint-disable-next-line react-hooks/immutability
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return <MeshBody texture={texture} {...rest} />;
}

// Stays true for `delayMs` after `value` flips back to false. Lets
// GalleryStack remain mounted long enough to finish its own exit fade
// (see GALLERY_HIDE_DURATION) instead of vanishing the instant the artifact
// is deselected — plain React unmount is immediate and gives nothing a
// chance to animate out otherwise.
function useDelayedFalse(value: boolean, delayMs: number): boolean {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    if (value) {
      // Reacting to the value→true transition itself (re-selecting mid exit-fade) — not derivable during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDelayed(true);
      return;
    }
    const t = setTimeout(() => setDelayed(false), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return delayed;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function GridCard({
  artifact,
  videoTexture,
  cardH,
  isSelected,
  ...rest
}: SharedProps & {
  artifact:      ArtifactCanvasItem;
  videoTexture?: THREE.VideoTexture;
  cardH?:        number;
}) {
  // Focused artifact with more than one gallery media → hand off entirely to
  // the in-canvas scrollable stack, no single mesh rendered underneath it.
  // galleryMounted stays true a bit past isSelected going false so
  // GalleryStack can play its exit fade before actually being removed.
  const showGallery   = isSelected && !!artifact.gallery && artifact.galleryCount > 1;
  const galleryMounted = useDelayedFalse(showGallery, GALLERY_HIDE_DURATION + 40);
  // Idle-grid stack indicator (see StackLayers) — independent of isSelected:
  // in practice only ever observed by MeshBody/PlaceholderMesh while NOT
  // showing the GalleryStack above (that branch returns early), i.e. exactly
  // the idle/grid state this is meant for. Real media, index-aligned with
  // stackVideoTextures (already resolved one level up by InfiniteTiles from
  // the shared cache — see usePlayVideoTextures.ts).
  const stackMedia = artifact.gallery?.slice(1, 1 + STACK_LAYER_COUNT) ?? [];

  if (galleryMounted && artifact.gallery) {
    return (
      <GalleryStack
        gallery={artifact.gallery}
        worldPos={rest.worldPos}
        cardScale={rest.cardScale}
        videoTexture0={videoTexture}
        isSelected={showGallery}
      />
    );
  }

  const m = artifact.firstMedia || null;

  if (m?._type === "galleryVideo") {
    if (videoTexture) return <MeshBody texture={videoTexture} cardH={cardH} isSelected={isSelected} stackMedia={stackMedia} {...rest} />;
    return <PlaceholderMesh cardH={cardH} isSelected={isSelected} stackMedia={stackMedia} {...rest} />;
  }

  const src = m?.imageRef
    ? buildImageUrl(m.imageRef, m.imageUrl, m.imageHotspot, m.imageCrop, { width: 1280, quality: 80 })
    : (m?.imageUrl ?? null);

  if (!src) return <PlaceholderMesh cardH={cardH} isSelected={isSelected} stackMedia={stackMedia} {...rest} />;
  return <ImageMesh url={src} cardH={cardH} isSelected={isSelected} stackMedia={stackMedia} {...rest} />;
}
