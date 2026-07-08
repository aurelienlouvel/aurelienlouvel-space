"use client";

import { Suspense, useEffect } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

// ─── Doodle textures — small hand-drawn marks, cached per kind ───────────────
//  Corkboard/scrapbook accent scattered across the canvas background (not
//  attached to any card). Drawn as stroke paths on a canvas, same caching
//  technique as getBracketTexture in ArtifactMesh.tsx.
const DOODLE_KINDS = ["squiggle", "star", "spiral", "loop"] as const;
type DoodleKind = (typeof DOODLE_KINDS)[number];

const TEX_SIZE = 64;
const SS = 3;
const _doodleCache = new Map<DoodleKind, THREE.Texture>();

function drawSquiggle(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(6, 32);
  ctx.bezierCurveTo(18, 12, 26, 52, 38, 24);
  ctx.bezierCurveTo(46, 8, 52, 40, 58, 30);
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D) {
  const cx = 32;
  const cy = 32;
  const spikes: [number, number][] = [
    [cx, cy - 26],
    [cx, cy + 26],
    [cx - 26, cy],
    [cx + 26, cy],
  ];
  for (const [x, y] of spikes) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - 12);
  ctx.lineTo(cx + 12, cy + 12);
  ctx.moveTo(cx + 12, cy - 12);
  ctx.lineTo(cx - 12, cy + 12);
  ctx.stroke();
}

function drawSpiral(ctx: CanvasRenderingContext2D) {
  const cx = 32;
  const cy = 32;
  const turns = 2.4;
  const steps = 48;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const r = 2 + t * 24;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawLoop(ctx: CanvasRenderingContext2D) {
  // Slightly wobbly circle — hand-drawn "circling" mark
  const cx = 32;
  const cy = 32;
  const r = 22;
  const steps = 20;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const wobble = Math.sin(i * 2.7) * 2.5;
    const x = cx + Math.cos(t) * (r + wobble);
    const y = cy + Math.sin(t) * (r + wobble);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function getDoodleTexture(kind: DoodleKind): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const cached = _doodleCache.get(kind);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE * SS;
  canvas.height = TEX_SIZE * SS;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SS, SS);
  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (kind) {
    case "squiggle":
      drawSquiggle(ctx);
      break;
    case "star":
      drawStar(ctx);
      break;
    case "spiral":
      drawSpiral(ctx);
      break;
    case "loop":
      drawLoop(ctx);
      break;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _doodleCache.set(kind, tex);
  return tex;
}

// ─── Seeded scatter ───────────────────────────────────────────────────────────
//  Deterministic per-tile placement — computed ONCE in buildTile and reused
//  identically across all 9 infinite-scroll tile copies (fresh Math.random()
//  per copy would break the tiling illusion at the seam).
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

export type Doodle = {
  key: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  kind: DoodleKind | null; // null → custom uploaded image
  imageUrl: string | null; // set when kind is null
  aspect: number; // height/width — 1 for procedural doodles (square canvas)
};

// ─── Anti-collision grid placement ────────────────────────────────────────────
//  Snaps a grid exactly onto tileW/tileH — so the toroidal 3x3 tiling seam is
//  automatically safe, a cell at a tile edge and its neighbour in the next
//  tile copy are just an ordinary adjacent pair — then per-cell coin-flips on
//  density and jitters within a bound that keeps every doodle's bounding box
//  (baseSize*1.65, the size-jitter formula's max) clear of its neighbours.
export function buildDoodles(
  tileW: number,
  tileH: number,
  density: number,
  baseSize: number,
  baseOpacity: number,
  spacing: number,
  customImages: { url: string; aspect: number }[],
): Doodle[] {
  const maxSize = baseSize * 1.65;
  // Clamped to a 1.3x floor so collision-safety holds no matter the slider.
  const targetCell = maxSize * Math.max(1.3, spacing);
  const cols = Math.max(1, Math.round(tileW / targetCell));
  const rows = Math.max(1, Math.round(tileH / targetCell));
  const cellW = tileW / cols;
  const cellH = tileH / rows;
  const jitterFracX = Math.max(0, (cellW - maxSize) / (2 * cellW));
  const jitterFracY = Math.max(0, (cellH - maxSize) / (2 * cellH));
  const poolSize = DOODLE_KINDS.length + customImages.length;

  const doodles: Doodle[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (seededRand(idx * 71 + 1000) >= density) continue;

      const pick = Math.floor(seededRand(idx * 83 + 1001) * poolSize);
      const custom =
        pick >= DOODLE_KINDS.length
          ? customImages[pick - DOODLE_KINDS.length]
          : null;
      const kind = custom ? null : DOODLE_KINDS[pick];
      const aspect = custom?.aspect ?? 1;

      // rawSize ranges over [0.65, 1.65) * baseSize, i.e. up to maxSize.
      // Dividing by max(1, aspect) caps the LONG axis at maxSize for any
      // aspect ratio: a no-op for procedural doodles (aspect=1) and a safe
      // shrink for tall custom images, while wide ones stay non-square.
      const rawSize = baseSize * (0.65 + seededRand(idx * 97 + 1002) * 1.0);
      const size = rawSize / Math.max(1, aspect);

      const cx = (c + 0.5) * cellW - tileW / 2;
      const cy = (r + 0.5) * cellH - tileH / 2;
      const jx =
        (seededRand(idx * 113 + 1003) - 0.5) * 2 * jitterFracX * cellW;
      const jy =
        (seededRand(idx * 127 + 1004) - 0.5) * 2 * jitterFracY * cellH;

      doodles.push({
        key: `doodle-${idx}`,
        x: cx + jx,
        y: cy + jy,
        size,
        rotation: seededRand(idx * 139 + 1005) * Math.PI * 2,
        opacity: baseOpacity * (0.65 + seededRand(idx * 151 + 1006) * 0.65),
        kind,
        imageUrl: custom?.url ?? null,
        aspect,
      });
    }
  }
  return doodles;
}

// ─── Custom image doodle — useTexture suspends until loaded ──────────────────
function CustomDoodleMesh({ d }: { d: Doodle }) {
  const texture = useTexture(d.imageUrl!);
  useEffect(() => {
    // Three.js texture is a mutable GPU-backed object — standard R3F/drei
    // pattern for configuring it post-load, not React state.
    // eslint-disable-next-line react-hooks/immutability
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh position={[d.x, d.y, -1]} rotation={[0, 0, d.rotation]}>
      <planeGeometry args={[d.size, d.size * d.aspect]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={d.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
export function DoodleField({ doodles }: { doodles: Doodle[] }) {
  return (
    <>
      {doodles.map((d) => {
        if (d.kind === null) {
          if (!d.imageUrl) return null;
          return (
            <Suspense key={d.key} fallback={null}>
              <CustomDoodleMesh d={d} />
            </Suspense>
          );
        }
        const tex = getDoodleTexture(d.kind);
        if (!tex) return null;
        return (
          <mesh
            key={d.key}
            position={[d.x, d.y, -1]}
            rotation={[0, 0, d.rotation]}
          >
            <planeGeometry args={[d.size, d.size]} />
            <meshBasicMaterial
              map={tex}
              transparent
              opacity={d.opacity}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}
