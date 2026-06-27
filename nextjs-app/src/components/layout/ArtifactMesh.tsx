"use client";

import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import { buildImageUrl } from "@/lib/sanity-image";
import { CARD_W, CARD_H, getArtifactImageUrl, introState, outroState, OUTRO_DURATION, OUTRO_STAGGER_MAX, focusState, DIM_OPACITY } from "@/lib/artifact-utils";
import { easeOutExpo, easeOutBack } from "@/lib/easings";

export { CARD_W, CARD_H, getArtifactImageUrl };

// ─── Card rounded-corner alpha map ───────────────────────────────────────────
//  3× supersampling for smooth anti-aliased edges.
const CARD_RADIUS = 24;
const _alphaCache = new Map<number, THREE.Texture>();
const SS          = 3;

function getRoundedAlpha(w: number, h: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  if (_alphaCache.has(h)) return _alphaCache.get(h)!;

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
  _alphaCache.set(h, tex);
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
//  Safety check: card at max selAnim (1.04) has half-width = CARD_W*1.04/2 = 176.8
//  OFF_FOCUS = 10 → bracket half = CARD_W/2 + 10 = 180 > 176.8 ✓

const ARM = 28;  // arm length in world units
const TH  = 2.0; // stroke thickness

// Canvas sized for the maximum gap so we never need to regenerate
const OFF_MAX = OFF_START;

// Cache keyed by "cw_ch" string to handle different card proportions
const _bracketCache = new Map<string, THREE.Texture>();

function getBracketTexture(cw: number, ch: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = `${Math.round(cw)}_${Math.round(ch)}`;
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
  ctx.lineJoin    = "miter";   // sharp 90° corner at the L bend
  ctx.lineCap     = "square";  // clean arm ends

  // Inset half-stroke so lines stay fully within canvas bounds
  const o = TH / 2;

  // Four straight L-brackets — minimal, crisp, tool-UI style
  ctx.beginPath(); ctx.moveTo(ARM, o);     ctx.lineTo(o,      o);      ctx.lineTo(o,      ARM);     ctx.stroke(); // TL
  ctx.beginPath(); ctx.moveTo(cw-ARM, o);  ctx.lineTo(cw-o,   o);      ctx.lineTo(cw-o,   ARM);     ctx.stroke(); // TR
  ctx.beginPath(); ctx.moveTo(ARM, ch-o);  ctx.lineTo(o,      ch-o);   ctx.lineTo(o,      ch-ARM);  ctx.stroke(); // BL
  ctx.beginPath(); ctx.moveTo(cw-ARM, ch-o); ctx.lineTo(cw-o, ch-o);   ctx.lineTo(cw-o,   ch-ARM);  ctx.stroke(); // BR

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter       = THREE.LinearFilter;
  tex.magFilter       = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _bracketCache.set(key, tex);
  return tex;
}

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
  const meshRef     = useRef<THREE.Mesh>(null);
  const opAnim      = useRef(0);
  const offAnim     = useRef(OFF_NEAR);
  const prevHovered = useRef(false);

  // Canvas sized for the maximum distance so we never need to rebuild
  const fullW = cardW + 2 * OFF_MAX;
  const fullH = cardH + 2 * OFF_MAX;
  const tex   = getBracketTexture(fullW, fullH);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;

    // ── Hover entry: jump to OFF_START so the approaching animation is visible ──
    // Pas de "ré-approche" des brackets si la card est déjà sélectionnée
    const justHovered = hovered && !prevHovered.current;
    if (justHovered && !isSelected) offAnim.current = OFF_START;
    prevHovered.current = hovered;

    // ── Opacity: 0 idle, 0.75 hover, 1 selected ─────────────────────────────────
    const opTarget = isSelected ? 1.0 : hovered ? 0.75 : 0;
    opAnim.current += (opTarget - opAnim.current) * 0.14;
    if (opAnim.current < 0.005) opAnim.current = 0;
    if (opAnim.current > 0.995) opAnim.current = 1;
    mat.opacity = opAnim.current;

    // ── Gap: lerp toward OFF_NEAR (hover) or OFF_FOCUS (selected) ───────────────
    const offTarget = isSelected ? OFF_FOCUS : OFF_NEAR;
    offAnim.current += (offTarget - offAnim.current) * 0.14;

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
};

// ─── Intro animation config ───────────────────────────────────────────────────
const INTRO_DURATION    = 520;
const INTRO_STAGGER_MAX = 240; // more spread → visible wave effect

// ─── Focus dim config ─────────────────────────────────────────────────────────
//  Quand un item est sélectionné, les autres cards se replient : scale ↓ +
//  fondu d'opacité (pas de rotation), et deviennent non-cliquables.
const DIM_LERP  = 0.12; // vitesse du repli (lerp/frame)
const DIM_SCALE = 0.22; // réduction d'échelle au repli (→ 78 %)

// Raycast on/off : une card repliée ne doit pas intercepter le clic (le clic
// la traverse → onPointerMissed → désélection).
const DEFAULT_RAYCAST: THREE.Mesh["raycast"] = THREE.Mesh.prototype.raycast;
const NOOP_RAYCAST: THREE.Mesh["raycast"] = () => {};

// ─── MeshBody — image or video card ──────────────────────────────────────────
function MeshBody({
  texture,
  worldPos,
  isSelected,
  onSelect,
  cardScale = 1,
  cardH = CARD_H,
}: SharedProps & { texture: THREE.Texture }) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const selAnim  = useRef(1);
  const intro    = useRef({ version: -1, opacity: 0, scaleBoost: 0.72, done: false });
  const outro    = useRef({ version: -1, opacity: 1, scaleBoost: 1.0, done: true });
  const staggerMs      = useRef(Math.random() * INTRO_STAGGER_MAX).current;
  // Outro stagger is a scaled-down version of intro stagger (same relative order)
  const outroStaggerMs = staggerMs * (OUTRO_STAGGER_MAX / INTRO_STAGGER_MAX);
  // Légère inclinaison initiale (rendu organique) — se résorbe avec l'opacity.
  const introRot       = useRef((Math.random() - 0.5) * 0.16).current; // ±~4.6°
  // Repli quand un AUTRE item est focus (scale ↓ + fade, sans rotation)
  const dimAnim        = useRef(0);
  const [hovered, setHovered] = useState(false);

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

    const mat = meshRef.current?.material as THREE.MeshBasicMaterial | undefined;

    // ── Selection spring ─────────────────────────────────────────────────────
    const selTarget = isSelected ? 1.04 : 1;
    selAnim.current += (selTarget - selAnim.current) * 0.12;

    // ── Focus dim : les autres cards se replient quand un item est focus ──────
    const dimmed = focusState.isActive && !isSelected;
    if (isSelected) {
      dimAnim.current = 0; // snap : la card sélectionnée ne doit jamais être dimmée
    } else {
      dimAnim.current += ((dimmed ? 1 : 0) - dimAnim.current) * DIM_LERP;
      if (dimAnim.current < 0.001) dimAnim.current = 0;
    }
    const dim = dimAnim.current;

    const finalOpacity = opacity * (1 - (1 - DIM_OPACITY) * dim);
    if (mat) mat.opacity = finalOpacity;

    meshRef.current?.scale.setScalar(selAnim.current * scaleBoost * (1 - DIM_SCALE * dim));
    if (meshRef.current) {
      meshRef.current.rotation.z = introRot * (1 - opacity);
      meshRef.current.visible    = finalOpacity > 0.001;
      // repliée → non-cliquable (le clic traverse et désélectionne)
      meshRef.current.raycast    = dimmed ? NOOP_RAYCAST : DEFAULT_RAYCAST;
    }
  });

  return (
    <group ref={groupRef} position={[worldPos[0], worldPos[1], 0]}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
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
}: SharedProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef  = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  // Repli quand un autre item est focus (scale ↓ + fade, cohérent avec MeshBody)
  const dimAnim = useRef(0);

  const w = CARD_W * cardScale;
  const h = cardH  * cardScale;

  useFrame(() => {
    const dimmed = focusState.isActive && !isSelected;
    if (isSelected) {
      dimAnim.current = 0;
    } else {
      dimAnim.current += ((dimmed ? 1 : 0) - dimAnim.current) * DIM_LERP;
      if (dimAnim.current < 0.001) dimAnim.current = 0;
    }
    const dim = dimAnim.current;
    const mat = meshRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 1 - (1 - DIM_OPACITY) * dim;
    meshRef.current?.scale.setScalar(1 - DIM_SCALE * dim);
    if (meshRef.current) {
      meshRef.current.visible = 1 - dim > 0.001;
      meshRef.current.raycast = dimmed ? NOOP_RAYCAST : DEFAULT_RAYCAST;
    }
  });

  return (
    <group ref={groupRef} position={[worldPos[0], worldPos[1], 0]}>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
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
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return <MeshBody texture={texture} {...rest} />;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function ArtifactMesh({
  artifact,
  videoTexture,
  cardH,
  ...rest
}: SharedProps & {
  artifact:      ArtifactCanvasItem;
  videoTexture?: THREE.VideoTexture;
  cardH?:        number;
}) {
  const m = artifact.firstMedia;

  if (m?._type === "galleryVideo") {
    if (videoTexture) return <MeshBody texture={videoTexture} cardH={cardH} {...rest} />;
    return <PlaceholderMesh cardH={cardH} {...rest} />;
  }

  const src = m?.imageRef
    ? buildImageUrl(m.imageRef, m.imageUrl, m.imageHotspot, m.imageCrop, { width: 1280, quality: 80 })
    : (m?.imageUrl ?? null);

  if (!src) return <PlaceholderMesh cardH={cardH} {...rest} />;
  return <ImageMesh url={src} cardH={cardH} {...rest} />;
}
