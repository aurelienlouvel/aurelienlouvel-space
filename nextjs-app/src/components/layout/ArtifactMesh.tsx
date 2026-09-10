"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ArtifactCanvasItem, ArtifactFirstMedia } from "@/sanity/queries";
import { buildImageUrl } from "@/lib/sanity-image";
import { CARD_W, CARD_H, MIN_CARD_H, MAX_CARD_H, introState, outroState, OUTRO_DURATION, OUTRO_STAGGER_MAX, focusState, SELECTION_POP_SCALE, GALLERY_REVEAL_STAGGER, GALLERY_REVEAL_DURATION, GALLERY_HIDE_DURATION, GALLERY_SCROLL_SNAP_DURATION, STACK_LAYER_COUNT } from "@/lib/artifact-utils";
import { easeOutExpo, easeOutBack } from "@/lib/easings";
import { dampRef } from "@/lib/damp";
import type { Params } from "@/lib/play-params";
import { useCardAnimation, DIM_SCALE, SELECTION_SPRING } from "./useCardAnimation";

// ─── Card rounded-corner alpha map ───────────────────────────────────────────
//  3× supersampling for smooth anti-aliased edges.
const CARD_RADIUS = 24;
// Keyed by "w_h" (not just h) — every call site used to pass a constant
// reference w (CARD_W), so caching by h alone was safe; the gallery's wheel
// effect (see GalleryPlane) now varies w per item too (row layout: fixed
// height, variable width), so an h-only key would collide two different-
// aspect items onto the same cached mask and stretch its rounded corners.
const _alphaCache = new Map<string, THREE.Texture>();
const SS          = 3;

function getRoundedAlpha(w: number, h: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = `${Math.round(w)}_${Math.round(h)}`;
  if (_alphaCache.has(key)) return _alphaCache.get(key)!;

  const canvas = document.createElement("canvas");
  canvas.width  = w * SS;
  canvas.height = h * SS;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SS, SS);

  const r = CARD_RADIUS;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter       = THREE.LinearFilter;
  tex.magFilter       = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _alphaCache.set(key, tex);
  return tex;
}

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

const ARM = 28;  // arm length in world units
const TH  = 2.0; // stroke thickness
const BRACKET_LERP = 0.14; // vitesse d'approche/opacité des brackets (lerp/frame)

// Canvas sized for the maximum gap so we never need to regenerate
const OFF_MAX = OFF_START;

// Cache keyed by "cw_ch" string to handle different card proportions
const _bracketCache = new Map<string, THREE.Texture>();

function getBracketTexture(cw: number, ch: number, radius: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = `${Math.round(cw)}_${Math.round(ch)}_${radius}`;
  if (_bracketCache.has(key)) return _bracketCache.get(key)!;

  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(cw) * SS;
  canvas.height = Math.round(ch) * SS;
  const ctx     = canvas.getContext("2d")!;
  ctx.scale(SS, SS);

  ctx.fillStyle = "#000000";  // transparent in alphaMap
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = "#ffffff"; // opaque in alphaMap
  ctx.lineWidth   = TH;
  ctx.lineCap     = "square";  // clean arm ends

  // Inset half-stroke so lines stay fully within canvas bounds
  const o = TH / 2;

  // Four L-brackets with a softly rounded bend — minimal, tool-UI style
  ctx.beginPath(); ctx.moveTo(ARM, o);       ctx.arcTo(o,    o,    o,    ARM,    radius); ctx.lineTo(o,    ARM);    ctx.stroke(); // TL
  ctx.beginPath(); ctx.moveTo(cw-ARM, o);    ctx.arcTo(cw-o, o,    cw-o, ARM,    radius); ctx.lineTo(cw-o, ARM);    ctx.stroke(); // TR
  ctx.beginPath(); ctx.moveTo(ARM, ch-o);    ctx.arcTo(o,    ch-o, o,    ch-ARM, radius); ctx.lineTo(o,    ch-ARM); ctx.stroke(); // BL
  ctx.beginPath(); ctx.moveTo(cw-ARM, ch-o); ctx.arcTo(cw-o, ch-o, cw-o, ch-ARM, radius); ctx.lineTo(cw-o, ch-ARM); ctx.stroke(); // BR

  const tex = new THREE.CanvasTexture(canvas);
  // Mesh is routinely shown minified (scaled down from the max-gap bake size
  // toward OFF_NEAR/OFF_FOCUS, further shrunk at low camera zoom) — mipmaps
  // keep the curved stroke crisp instead of shimmering/blurring at a distance.
  tex.minFilter       = THREE.LinearMipmapLinearFilter;
  tex.magFilter       = THREE.LinearFilter;
  tex.generateMipmaps = true;
  _bracketCache.set(key, tex);
  return tex;
}

function CornerBrackets({
  hovered,
  isSelected,
  cardW,
  cardH,
  paramsRef,
}: {
  hovered:    boolean;
  isSelected: boolean;
  cardW:      number;
  cardH:      number;
  paramsRef:  React.MutableRefObject<Params>;
}) {
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
    const radius = paramsRef.current.bracketRadius;
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
  paramsRef:  React.MutableRefObject<Params>;
};

// ─── Intro animation config ───────────────────────────────────────────────────
const INTRO_DURATION    = 520;
const INTRO_STAGGER_MAX = 240; // more spread → visible wave effect

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
//  GalleryStackImageItem below). Videos NEVER decode their own <video> here —
//  they reuse the texture usePlayVideoTextures.ts already created and shared
//  across those same 9 copies (stackVideoTextures prop); doing our own decode
//  per layer would multiply it up to 9× for nothing.
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
        // this file (e.g. GalleryPlane's revealStartRef), not accidental
        // prop mutation.
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
// same idiom as GalleryStackImageItem/ImageMesh elsewhere in this file.
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
  paramsRef,
}: SharedProps & { texture: THREE.Texture }) {
  const { meshRef, groupRef, hovered, setHovered, tick } = useCardAnimation(paramsRef);
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
    if (intro.current.version !== introState.version) {
      intro.current = { version: introState.version, opacity: 0, scaleBoost: 0.72, done: false };
      outro.current.done = true; // new intro cancels any ongoing outro
    }
    if (!intro.current.done) {
      const elapsed = performance.now() - introState.startTime - staggerMs;
      const t       = Math.max(0, Math.min(1, elapsed / INTRO_DURATION));
      intro.current.opacity    = easeOutExpo(t);
      intro.current.scaleBoost = t >= 1 ? 1 : 0.72 + 0.28 * easeOutBack(t);
      if (t >= 1) intro.current.done = true;
    }

    // ── Outro ────────────────────────────────────────────────────────────────
    if (outro.current.version !== outroState.version) {
      outro.current = { version: outroState.version, opacity: 1, scaleBoost: 1.0, done: false };
    }
    if (!outro.current.done) {
      const elapsed = performance.now() - outroState.startTime - outroStaggerMs;
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
      <CornerBrackets hovered={hovered} isSelected={isSelected} cardW={w} cardH={h} paramsRef={paramsRef} />
    </group>
  );
}

// ─── Placeholder (no media) ───────────────────────────────────────────────────
function PlaceholderMesh({
  worldPos, isSelected, onSelect, cardScale = 1, cardH = CARD_H,
  stackMedia = [], stackVideoTextures = [], stackVideoRefHeights = [], paramsRef,
}: SharedProps) {
  const { meshRef, groupRef, hovered, setHovered, tick } = useCardAnimation(paramsRef);
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
      <CornerBrackets hovered={hovered} isSelected={isSelected} cardW={w} cardH={h} paramsRef={paramsRef} />
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
//  onWheel/onDown/onMove via focusState.scrollOffset instead of panning the
//  camera — see artifact-utils.ts.
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
// exit grace window — see ArtifactMesh's useDelayedFalse). The wheel tilt
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
    // flagged by react-hooks/set-state-in-effect (unlike the old direct
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

function GalleryStack({
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
  isSelected:     boolean; // false while playing its exit fade, just before ArtifactMesh unmounts it
}) {
  const groupRef  = useRef<THREE.Group>(null);
  const scaleAnim = useRef(1); // pops toward SELECTION_POP_SCALE, same feel as MeshBody's selAnim
  // Local reveal-animation clock for items 1+ (see GalleryPlane) — reset
  // whenever isSelected actually flips, including a reselect that lands
  // before this instance ever unmounted (that's what makes the animation
  // reliably "relaunch" on every reselect). Deliberately a ref local to THIS
  // instance, not module state: a shared clock would let a fast deselect-A /
  // select-B (both galleries) reset A's timer while A is still playing its
  // own exit fade in the unmount grace period (see ArtifactMesh's
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
  // focusState.scrollOffset so CameraController's wheel/drag deltas keep
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
      focusState.scrollOffset = from + (to - from) * easeOutExpo(t);
      if (t >= 1) scrollAnim.current = null;
    }

    if (!groupRef.current) return;
    // Un-pop toward 1 while exiting (isSelected already false, still mounted
    // for its trailing fade-out) — mirrors MeshBody's selAnim un-popping on
    // deselect, so the handoff back to MeshBody once GalleryStack finally
    // unmounts never has a visible scale jump.
    const scaleTarget = isSelected ? SELECTION_POP_SCALE : 1;
    dampRef(scaleAnim, scaleTarget, SELECTION_SPRING);
    groupRef.current.scale.setScalar(scaleAnim.current);
    // Wrap into [0, period) — scrolling past either end cycles back around
    // instead of stopping, matching the canvas's own infinite-tiling feel.
    const offset = period > 0
      ? ((focusState.scrollOffset % period) + period) % period
      : 0;
    offsetRef.current = offset;
    groupRef.current.position.set(worldPos[0], worldPos[1] + offset, 0);
  });

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
        // wrapper around ArtifactMesh) would wait for EVERY gallery image to
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
export function ArtifactMesh({
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
