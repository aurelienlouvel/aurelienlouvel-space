"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, ShaderMaterial, type Mesh } from "three";
import type { RGB } from "@/lib/dominant-color";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import type { LayoutTile } from "./layout-types";

const MAX_PIXELS = 64;
const PIXEL_Z = 0.6;
/** Pas de la grille sur laquelle les pixels s'alignent (unités monde) : c'est ce qui les fait paraître « pixel ». */
const SNAP = 4;

/** Repli tant que la palette du média n'est pas calculée : bleus et lilas du verre dépoli. */
const FALLBACK_PALETTE: RGB[] = [
  [74, 140, 255],
  [124, 108, 255],
  [156, 204, 255],
];

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Un pixel : carré arrondi, dégradé intérieur entre deux teintes du média, léger
// reflet irisé (même famille que la vague) et petit éclat en haut à gauche.
const FRAGMENT = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uOpacity;
uniform float uSeed;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 p = vUv - 0.5;
  float d = length(max(abs(p) - 0.28, 0.0)) - 0.17;
  float shape = 1.0 - smoothstep(-0.02, 0.04, d);
  if (shape <= 0.001) discard;

  float g = clamp(0.5 - p.x * 0.7 + p.y * 0.7, 0.0, 1.0);
  vec3 col = mix(uColB, uColA, g);
  vec3 spec = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + uSeed + uTime * 0.1 + g * 0.3));
  col = mix(col, col * (0.7 + 0.6 * spec), 0.35);
  col += 0.18 * smoothstep(0.12, -0.25, d + (p.y - p.x) * 0.25);

  gl_FragColor = vec4(col, shape * uOpacity);
}
`;

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type PixelSeed = {
  /** Position le long du périmètre de l'artifact, 0..1. */
  along: number;
  /** Phase initiale de vie, 0..1. */
  phase: number;
  /** Taille relative, 0.3..1. */
  size: number;
  /** Éloignement relatif, 0.35..1. */
  reach: number;
  /** Glissement tangentiel relatif, -1..1. */
  slide: number;
};

const SEEDS: PixelSeed[] = Array.from({ length: MAX_PIXELS }, (_, i) => ({
  along: hash01(i * 1.7 + 0.3),
  phase: hash01(i * 3.1 + 1.1),
  size: 0.3 + 0.7 * Math.pow(hash01(i * 5.3 + 2.9), 1.6),
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

/** Écrit dans `out` la teinte `c` éclaircie vers le blanc (k 0..1), sans rien allouer. */
function lift(out: Color, c: RGB, k: number): Color {
  return out.setRGB(
    (c[0] + (255 - c[0]) * k) / 255,
    (c[1] + (255 - c[1]) * k) / 255,
    (c[2] + (255 - c[2]) * k) / 255,
  );
}

/**
 * Pixels qui jaillissent autour de l'artifact ouvert, du clic jusqu'à la fin de
 * la vague : petits carrés arrondis à dégradé intérieur, teintés par les
 * couleurs du média (palette dominante) avec un reflet irisé. Leur nombre,
 * taille, portée et vitesse se règlent dans le debug (étape « 3 · Attente »).
 * Pilotés par `frame.fx`, donc rejoués à l'envers pendant un rewind.
 */
export function PixelEmitter({
  debug,
  runtime,
  tile,
  paletteRef,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  tile: LayoutTile;
  /** Palette (3 teintes) du média ouvert, si déjà calculée. */
  paletteRef: { current: RGB[] | null };
}) {
  const meshRefs = useRef<(Mesh | null)[]>([]);
  const matRefs = useRef<(ShaderMaterial | null)[]>([]);

  const materials = useMemo(
    () =>
      Array.from({ length: MAX_PIXELS }, (_, i) => {
        return new ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          uniforms: {
            uColA: { value: new Color(0.6, 0.7, 1) },
            uColB: { value: new Color(0.45, 0.4, 1) },
            uOpacity: { value: 0 },
            uSeed: { value: hash01(i * 11.3 + 8.1) },
            uTime: { value: 0 },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: DoubleSide,
        });
      }),
    [],
  );

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
    const palette = paletteRef.current ?? FALLBACK_PALETTE;

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
      const size = Math.max(SNAP * 1.5, cfg.fxPixelSize * seed.size * (0.4 + 0.6 * step));
      const fade = Math.pow(1 - life, 0.9);

      mesh.visible = true;
      mesh.position.set(Math.round(x / SNAP) * SNAP, Math.round(y / SNAP) * SNAP, PIXEL_Z);
      mesh.scale.set(size, size, 1);

      const mat = matRefs.current[i];
      if (mat) {
        const a = palette[i % palette.length];
        const b = palette[(i + 1) % palette.length];
        // Teinte du média, légèrement éclaircie : discret sur fond blanc.
        lift(mat.uniforms.uColA.value as Color, a, 0.18);
        lift(mat.uniforms.uColB.value as Color, b, 0.02);
        mat.uniforms.uOpacity.value = intensity * fade * 0.85;
        mat.uniforms.uTime.value = clock;
      }
    }
  });

  return (
    <group renderOrder={300}>
      {materials.map((mat, i) => (
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
          <primitive
            object={mat}
            attach="material"
            ref={(m: ShaderMaterial | null) => {
              matRefs.current[i] = m;
            }}
          />
        </mesh>
      ))}
    </group>
  );
}
