"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, ShaderMaterial, Vector4, type Mesh } from "three";
import type { RGB } from "@/lib/dominant-color";
import type { PlayDebugRef } from "./PlayCanvas";
import { getSharedTexture } from "./SecondaryGalleryPlanes";

/** Nombre maximal d'éclats (le debug règle le nombre réellement émis). */
const MAX_SHARDS = 96;

/** Plans de profondeur : 0 = derrière l'image, 1 = au niveau, 2 = devant. */
const PLANE_Z = [-0.15, 0.55, 0.7] as const;

/** Ce qu'un champ d'éclats doit savoir de la carte qu'il décompose. */
export type ShardSource = {
  /** 0..1+ — intensité courante : pilote le nombre d'éclats visibles et leur opacité. */
  intensity: number;
  /** Centre et taille de la carte, en unités monde. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  url: string;
  kind: "image" | "video";
};

/** Réglages des éclats, partagés par l'ouverture et le passage d'une carte à l'autre. */
export type ShardParams = {
  /** Nombre d'éclats émis. */
  count: number;
  /** Côté minimal / maximal d'un éclat (unités monde). */
  minSize: number;
  maxSize: number;
  /** Étirement maximal (rectangle) : 1 = carrés, 4 = jusqu'à 4:1. */
  aspect: number;
  /** Distance d'éjection du plan médian (unités monde). */
  travel: number;
  /** Multiplicateurs de distance des plans arrière / avant (parallaxe). */
  travelFar: number;
  travelNear: number;
  /** Échelle finale des plans arrière / avant (le plan avant « se rapproche »). */
  scaleFar: number;
  scaleNear: number;
  /** Opacité globale (les éclats restent translucides). */
  opacity: number;
  /** Flou (biais de mipmap) des plans arrière / avant : profondeur de champ. */
  blurFar: number;
  blurNear: number;
  /** Douceur des bords (0 = nets, 1 = très fondus) : c'est le dégradé de chaque éclat. */
  softness: number;
  /** Part d'irisation dans la couleur (0 = image pure). */
  iridescence: number;
  /** Cycles de vie par seconde. */
  speed: number;
  /** Rotation maximale (degrés) pendant le vol. */
  spin: number;
  /** Part de dérive vers le haut (0..1). */
  upBias: number;
  /** Graine du tirage (changer = autre éclatement). */
  seed: number;
};

export const SHARD_DEFAULTS: ShardParams = {
  count: 34,
  minSize: 18,
  maxSize: 150,
  aspect: 3.2,
  travel: 170,
  travelFar: 0.45,
  travelNear: 1.9,
  scaleFar: 0.82,
  scaleNear: 1.3,
  opacity: 0.7,
  blurFar: 2.4,
  blurNear: 1.4,
  softness: 0.45,
  iridescence: 0.55,
  speed: 0.9,
  spin: 14,
  upBias: 0.25,
  seed: 1,
};

/** Repli tant que la palette du média n'est pas calculée : le spectre Prism (cf. lib/da.ts). */
const FALLBACK_PALETTE: RGB[] = [
  [143, 208, 255],
  [169, 155, 255],
  [255, 159, 208],
  [143, 240, 216],
];

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Un éclat : un rectangle qui reprend le morceau d'image dont il est issu, flouté
// par la profondeur de champ, bords fondus (le dégradé), teinté d'un reflet irisé.
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uDecode;
uniform vec4 uRect;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uSoft;
uniform float uBlur;
uniform float uIrid;
uniform float uSeed;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 uv = uRect.xy + vUv * uRect.zw;
  vec3 col = uTint;
  if (uHasMap > 0.5) {
    col = texture2D(uMap, uv, uBlur).rgb;
    if (uDecode > 0.5) col = pow(col, vec3(2.2));
  }

  // Reflet irisé, même famille que la vague.
  float g = (vUv.x + (1.0 - vUv.y)) * 0.5;
  vec3 spec = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + uSeed + uTime * 0.1 + g * 0.5));
  col = mix(col, col * (0.6 + 0.8 * spec) + 0.06 * spec, uIrid);
  col += 0.1 * uIrid * smoothstep(0.55, 0.0, g);

  // Bords fondus : l'opacité retombe vers le bord, ce qui donne un dégradé
  // plutôt qu'une découpe nette.
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float a = smoothstep(0.0, max(uSoft, 0.01) * 0.5, e);
  gl_FragColor = linearToOutputTexel(vec4(col, a * uOpacity));
}
`;

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Écrit dans `out` la teinte `c` (0..255) en linéaire, pour sortir par linearToOutputTexel. */
function toLinear(out: Color, c: RGB): Color {
  return out.setRGB(Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2));
}

/**
 * L'image qui se sépare en morceaux : des rectangles de tailles et de formats
 * variés, chacun reprenant un bout réel de l'image, répartis sur trois plans de
 * profondeur (parallaxe, échelle et flou différents), translucides, aux bords
 * fondus et teintés d'un reflet irisé. S'utilise pour l'ouverture d'un artifact
 * et pour le passage d'une carte à la suivante : `source` dit quelle carte
 * décomposer et avec quelle intensité.
 */
export function ShardField({
  debug,
  source,
  paletteRef,
  seedOffset = 0,
}: {
  debug: PlayDebugRef;
  source: () => ShardSource | null;
  paletteRef?: { current: RGB[] | null };
  seedOffset?: number;
}) {
  const meshRefs = useRef<(Mesh | null)[]>([]);
  const matRefs = useRef<(ShaderMaterial | null)[]>([]);

  const materials = useMemo(
    () =>
      Array.from({ length: MAX_SHARDS }, (_, i) => {
        return new ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          uniforms: {
            uMap: { value: null },
            uHasMap: { value: 0 },
            uDecode: { value: 0 },
            uRect: { value: new Vector4(0, 0, 1, 1) },
            uTint: { value: new Color(0.5, 0.6, 1) },
            uOpacity: { value: 0 },
            uSoft: { value: 0.4 },
            uBlur: { value: 0 },
            uIrid: { value: 0.4 },
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
    const p = debug.current.shards;
    const src = source();
    const meshes = meshRefs.current;
    if (!src || src.intensity < 0.01) {
      for (const m of meshes) if (m) m.visible = false;
      return;
    }

    const clock = state.clock.getElapsedTime();
    const intensity = Math.min(1, src.intensity);
    const visibleCount = Math.min(
      MAX_SHARDS,
      Math.round(p.count * Math.min(1, src.intensity * 1.2)),
    );
    const texture = getSharedTexture(src.url, src.kind);
    const palette = paletteRef?.current ?? FALLBACK_PALETTE;
    const planes = [
      { z: PLANE_Z[0], travel: p.travelFar, scale: p.scaleFar, blur: p.blurFar, opacity: 0.6 },
      { z: PLANE_Z[1], travel: 1, scale: 1, blur: 0.4, opacity: 0.9 },
      { z: PLANE_Z[2], travel: p.travelNear, scale: p.scaleNear, blur: p.blurNear, opacity: 1 },
    ] as const;
    const seedBase = p.seed * 37.17 + seedOffset * 11.9;

    for (let i = 0; i < MAX_SHARDS; i++) {
      const mesh = meshes[i];
      if (!mesh) continue;
      if (i >= visibleCount) {
        mesh.visible = false;
        continue;
      }
      const k = seedBase + i * 7.31;
      // Plan de profondeur : 30 % derrière, 40 % au niveau, 30 % devant.
      const hp = hash01(k + 1.3);
      const plane = planes[hp < 0.3 ? 0 : hp < 0.7 ? 1 : 2];

      // Taille log-uniforme, forme plus ou moins étirée, jamais plus grande que la carte.
      const base = p.minSize * Math.pow(p.maxSize / Math.max(1, p.minSize), Math.pow(hash01(k + 2.7), 1.5));
      const stretch = Math.exp((hash01(k + 3.9) - 0.5) * 2 * Math.log(Math.max(1, p.aspect)));
      const w = Math.min(src.w * 0.6, base * Math.sqrt(stretch));
      const h = Math.min(src.h * 0.6, base / Math.sqrt(stretch));

      // Origine sur la carte (coordonnées normalisées -0.5..0.5).
      const sx = (hash01(k + 5.1) - 0.5) * (1 - w / src.w);
      const sy = (hash01(k + 6.7) - 0.5) * (1 - h / src.h);

      // Vie : naissance sur place (le morceau se décolle), envol, disparition.
      const life = (clock * p.speed + hash01(k + 8.3)) % 1;
      const out = 1 - Math.pow(1 - life, 3);
      const ox = sx * src.w;
      const oy = sy * src.h;
      const dist = Math.hypot(ox, oy) || 1;
      const ang = (hash01(k + 9.9) - 0.5) * 1.2;
      let dx = ox / dist;
      let dy = oy / dist;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
      dy += p.upBias;
      const dl = Math.hypot(dx, dy) || 1;
      const travel = p.travel * plane.travel * (0.5 + hash01(k + 10.7)) * out;

      mesh.visible = true;
      mesh.position.set(src.cx + ox + (dx / dl) * travel, src.cy + oy + (dy / dl) * travel, plane.z);
      const sc = 1 + (plane.scale - 1) * out;
      mesh.scale.set(w * sc, h * sc, 1);
      mesh.rotation.z = ((hash01(k + 11.3) - 0.5) * 2 * p.spin * Math.PI * out) / 180;

      const mat = matRefs.current[i];
      if (!mat) continue;
      const u = mat.uniforms;
      u.uMap.value = texture;
      u.uHasMap.value = texture ? 1 : 0;
      u.uDecode.value = texture && src.kind === "video" ? 1 : 0;
      (u.uRect.value as Vector4).set(0.5 + sx - w / src.w / 2, 0.5 + sy - h / src.h / 2, w / src.w, h / src.h);
      toLinear(u.uTint.value as Color, palette[i % palette.length]);
      const fadeIn = Math.min(1, life / 0.12);
      u.uOpacity.value = intensity * p.opacity * plane.opacity * fadeIn * Math.pow(1 - life, 1.1);
      u.uSoft.value = p.softness;
      u.uBlur.value = plane.blur;
      u.uIrid.value = p.iridescence;
      u.uTime.value = clock;
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
