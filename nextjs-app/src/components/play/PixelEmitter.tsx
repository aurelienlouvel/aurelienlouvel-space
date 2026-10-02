"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, type Mesh, type MeshBasicMaterial } from "three";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import type { LayoutTile } from "./layout-types";

const MAX_PIXELS = 64;
const PIXEL_Z = 0.6;
/** Pas de la grille sur laquelle les pixels s'alignent (unités monde) : c'est ce qui les fait paraître « pixel ». */
const SNAP = 4;

// Famille de bleus du verre dépoli (encre, cobalt, azur, ciel, glace) avec un
// rare accent violet — assez de contraste pour se lire sur le fond blanc.
const PALETTE = [
  "#0a0f2c",
  "#0b1a5e",
  "#1d3fd0",
  "#1d3fd0",
  "#4a8cff",
  "#4a8cff",
  "#9cccff",
  "#cfe3ff",
  "#7c6cff",
] as const;

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type PixelSeed = {
  /** Position le long du périmètre de l'artifact, 0..1. */
  along: number;
  /** Phase initiale de vie, 0..1. */
  phase: number;
  /** Taille relative, 0.25..1. */
  size: number;
  /** Éloignement relatif, 0.35..1. */
  reach: number;
  /** Glissement tangentiel relatif, -1..1. */
  slide: number;
};

const SEEDS: PixelSeed[] = Array.from({ length: MAX_PIXELS }, (_, i) => ({
  along: hash01(i * 1.7 + 0.3),
  phase: hash01(i * 3.1 + 1.1),
  size: 0.25 + 0.75 * Math.pow(hash01(i * 5.3 + 2.9), 1.6),
  reach: 0.35 + 0.65 * hash01(i * 7.9 + 4.2),
  slide: hash01(i * 9.7 + 6.6) * 2 - 1,
}));

/** Point du périmètre d'un rectangle w×h centré sur l'origine, avec sa normale sortante. */
function perimeterPoint(u: number, w: number, h: number) {
  const per = 2 * (w + h);
  let d = u * per;
  if (d < w) return { x: -w / 2 + d, y: h / 2, nx: 0, ny: 1 };
  d -= w;
  if (d < h) return { x: w / 2, y: h / 2 - d, nx: 1, ny: 0 };
  d -= h;
  if (d < w) return { x: w / 2 - d, y: -h / 2, nx: 0, ny: -1 };
  d -= w;
  return { x: -w / 2, y: -h / 2 + d, nx: -1, ny: 0 };
}

/**
 * Pixels qui jaillissent autour de l'artifact ouvert, du clic jusqu'à la fin de
 * la vague. Leur nombre, taille, portée et vitesse se règlent dans le debug
 * (étape « 3 · Attente »). Pilotés par `frame.fx`, donc rejoués à l'envers
 * pendant un rewind comme tout le reste de la timeline.
 */
export function PixelEmitter({
  debug,
  runtime,
  tile,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  tile: LayoutTile;
}) {
  const meshRefs = useRef<(Mesh | null)[]>([]);

  const matRefs = useRef<(MeshBasicMaterial | null)[]>([]);

  useFrame((state) => {
    const rc = runtime.current;
    const tr = rc.transition;
    const cfg = debug.current.transition;
    const fx = tr.frame.fx;
    const meshes = meshRefs.current;

    const idx = tr.targetIndex >= 0 ? tr.targetIndex : rc.selected;
    const point = tile.points[idx];
    const active = tr.phase === "playing" && fx > 0.01 && Boolean(point);
    const count = active ? Math.min(MAX_PIXELS, Math.round(cfg.fxPixelCount)) : 0;

    const w = point ? point.width * tr.frame.tileScale : 0;
    const h = point ? point.height * tr.frame.tileScale : 0;
    const cx = rc.indicatorTarget.x;
    const cy = rc.indicatorTarget.y;
    const clock = state.clock.getElapsedTime();
    const intensity = Math.min(1, fx);

    for (let i = 0; i < MAX_PIXELS; i++) {
      const mesh = meshes[i];
      if (!mesh) continue;
      if (i >= count) {
        mesh.visible = false;
        continue;
      }
      const seed = SEEDS[i];
      const life = (clock * cfg.fxPixelSpeed + seed.phase) % 1;
      const out = 1 - Math.pow(1 - life, 3);
      const p = perimeterPoint(seed.along, w, h);
      const reach = cfg.fxPixelSpread * seed.reach * out;
      const slide = seed.slide * cfg.fxPixelSpread * 0.35 * out;
      const x = cx + p.x + p.nx * reach + p.ny * slide;
      const y = cy + p.y + p.ny * reach + p.nx * slide;

      // Taille par paliers (steps) : le pixel « pop » puis se tasse, sans interpolation douce.
      const step = Math.floor((1 - life) * 5) / 5;
      const size = Math.max(SNAP, cfg.fxPixelSize * seed.size * (0.35 + 0.65 * step));
      // Clignotement saccadé, propre à chaque pixel.
      const flicker = hash01(Math.floor(clock * 14) * 0.37 + i) > 0.18 ? 1 : 0.25;
      const fade = Math.pow(1 - life, 0.8);

      mesh.visible = true;
      mesh.position.set(Math.round(x / SNAP) * SNAP, Math.round(y / SNAP) * SNAP, PIXEL_Z);
      mesh.scale.set(size, size, 1);
      const mat = matRefs.current[i];
      if (mat) mat.opacity = intensity * fade * flicker;
    }
  });

  return (
    <group renderOrder={300}>
      {SEEDS.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m;
          }}
          visible={false}
          renderOrder={300}
          raycast={() => null}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={(m) => {
              matRefs.current[i] = m;
            }}
            color={PALETTE[Math.floor(hash01(i * 11.3 + 8.1) * PALETTE.length)]}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
