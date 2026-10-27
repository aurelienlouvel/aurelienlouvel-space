"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, ShaderMaterial, Vector4, type Mesh } from "three";
import { daGradientRgb } from "@/lib/da";
import type { RGB } from "@/lib/dominant-color";
import type { PlayDebugRef } from "./PlayCanvas";
import { getSharedTexture } from "./SecondaryGalleryPlanes";

/** Nombre maximal d'éclats (le debug règle le nombre réellement émis). */
const MAX_SHARDS = 96;

/** Rang des pixels de fond du pack ouvert : devant la mosaïque (0 à 20), derrière toute la pile (`100 − d·10`). */
export const AMBIENT_RENDER_ORDER = 50;

/** Plans de profondeur : 0 = derrière l'image, 1 = au niveau, 2 = devant. */
const PLANE_Z = [-0.15, 0.55, 0.7] as const;

/** Ce qu'un champ d'éclats doit savoir de la carte qu'il décompose. */
export type ShardSource = {
  /** 0..1+ — intensité courante : pilote le nombre d'éclats visibles et leur opacité. */
  intensity: number;
  /** 0..1 — part de la distance d'éjection utilisée (défaut 1) : les éclats partent plus loin à mesure que la carte se désagrège. */
  spread?: number;
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
  /** Étirement maximal (rectangle) : 1 = carrés (la DA), 4 = jusqu'à 4:1. */
  aspect: number;
  /** Distance d'éjection du plan médian (unités monde). */
  travel: number;
  /** Multiplicateurs de distance des plans arrière / avant (parallaxe). */
  travelFar: number;
  travelNear: number;
  /** Échelle finale des plans arrière / avant (le plan avant « se rapproche »). */
  scaleFar: number;
  scaleNear: number;
  /** Opacité globale. */
  opacity: number;
  /** Flou (biais de mipmap) des plans arrière / avant : profondeur de champ (0 = net, la DA). */
  blurFar: number;
  blurNear: number;
  /** Douceur des bords (0 = nets, la DA ; 1 = très fondus). */
  softness: number;
  /** Part d'irisation dans la couleur (0 = aucune, la DA ; 1 = reflet arc-en-ciel). */
  iridescence: number;
  /** Aplat : 1 = un carré d'une seule couleur (la moyenne de son morceau d'image), 0 = le morceau d'image tel quel. */
  flat: number;
  /** Part de la couleur de la DA dans celle de l'éclat : 0 = les couleurs de l'image, 1 = le dégradé ciel → lilas → rose selon sa place sur la carte. */
  tint: number;
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
  count: 17,
  minSize: 14,
  maxSize: 61,
  aspect: 1,
  travel: 170,
  travelFar: 0.45,
  travelNear: 1.9,
  scaleFar: 0.82,
  scaleNear: 1.3,
  opacity: 0.85,
  blurFar: 0,
  blurNear: 0,
  softness: 0,
  iridescence: 0,
  flat: 1,
  tint: 0,
  speed: 0.9,
  spin: 0,
  upBias: 0.25,
  seed: 640,
};

/** Repli tant que la palette du média n'est pas calculée : le début du spectre de la DA (cf. lib/da.ts). */
const FALLBACK_PALETTE: RGB[] = [
  [143, 208, 255],
  [169, 155, 255],
  [255, 159, 208],
];

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Un éclat : un carré net (`da.pixelRadius`, 0 par défaut, peut l'arrondir) qui reprend
// le morceau d'image dont il est issu. À plat (par défaut), il n'a qu'une couleur, la moyenne de son morceau ;
// sinon l'image reste visible, avec en option un flou de profondeur de champ, des bords
// fondus et un reflet irisé (les réglages d'avant la DA « Pixels »).
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uDecode;
uniform vec4 uRect;
uniform vec3 uTint;
uniform vec3 uDa;
uniform float uDaMix;
uniform float uFlat;
uniform float uOpacity;
uniform float uSoft;
uniform float uRadius;
uniform float uAspect;
uniform float uBlur;
uniform float uIrid;
uniform float uSeed;
uniform float uTime;
varying vec2 vUv;

vec3 decodeTexel(vec3 c) {
  return uDecode > 0.5 ? pow(c, vec3(2.2)) : c;
}

// La couleur unie d'un morceau : moyenne de 3 x 3 prises réparties dessus, lues dans
// un mip à leur échelle. Une seule prise donnerait la couleur d'un texel au hasard
// (une vidéo n'a pas de mips), donc un voisin d'une teinte sans rapport.
vec3 patchColor(vec2 centre) {
  vec2 size = vec2(textureSize(uMap, 0));
  float lod = max(log2(max(uRect.z * size.x, uRect.w * size.y) * 0.3), 0.0);
  vec3 sum = vec3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 p = centre + vec2(float(i), float(j)) * uRect.zw * 0.3;
      sum += decodeTexel(textureLod(uMap, p, lod).rgb);
    }
  }
  return sum / 9.0;
}

void main() {
  vec2 uv = uRect.xy + vUv * uRect.zw;
  vec3 col = uTint;
  if (uHasMap > 0.5) {
    vec3 imageCol = vec3(0.0);
    vec3 flatCol = vec3(0.0);
    if (uFlat < 0.999) imageCol = decodeTexel(texture2D(uMap, uv, uBlur).rgb);
    if (uFlat > 0.001) flatCol = patchColor(uRect.xy + 0.5 * uRect.zw);
    col = mix(imageCol, flatCol, uFlat);
  }
  col = mix(col, uDa, uDaMix);

  // Reflet irisé, même famille que la vague.
  float g = (vUv.x + (1.0 - vUv.y)) * 0.5;
  vec3 spec = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + uSeed + uTime * 0.1 + g * 0.5));
  col = mix(col, col * (0.6 + 0.8 * spec) + 0.06 * spec, uIrid);
  col += 0.1 * uIrid * smoothstep(0.55, 0.0, g);

  // Coins arrondis : un rectangle dont le plus petit côté vaut 1, et dont le rayon des
  // coins est la fraction uRadius de ce côté. Sa distance signée donne une découpe nette,
  // lissée sur un pixel d'écran.
  vec2 sz = uAspect >= 1.0 ? vec2(uAspect, 1.0) : vec2(1.0, 1.0 / uAspect);
  vec2 q = abs((vUv - 0.5) * sz) - 0.5 * sz + uRadius;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float cover = clamp(0.5 - dist / max(fwidth(dist), 0.0001), 0.0, 1.0);

  // Bords fondus : l'opacité retombe vers le bord. À 0, la découpe est nette.
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float a = cover * smoothstep(0.0, max(uSoft, 0.01) * 0.5, e);
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
 * L'image qui se sépare en morceaux : des carrés de tailles variées, chacun d'une
 * seule couleur (la moyenne de son morceau d'image, donc voisins, ils forment le
 * dégradé de l'image), répartis sur trois plans de profondeur (parallaxe et échelle
 * différentes), nets, sans coins arrondis par défaut (`da.pixelRadius`), sans flou ni bord
 * fondu. S'utilise pour l'ouverture d'un artifact et pour le passage d'une carte à la
 * suivante : `source` dit quelle carte décomposer et avec quelle intensité. Les pixels de fond
 * du pack ouvert en sont une troisième instance : mêmes morceaux, mais bien moins nombreux,
 * posés derrière les cartes (`params`, `renderOrder`, `groupOrder`).
 */
export function ShardField({
  debug,
  source,
  paletteRef,
  seedOffset = 0,
  params,
  renderOrder = 300,
  groupOrder = 300,
}: {
  debug: PlayDebugRef;
  source: () => ShardSource | null;
  paletteRef?: { current: RGB[] | null };
  seedOffset?: number;
  /** Réglages propres à ce champ ; sans eux, ceux du debug (`shards`). */
  params?: () => ShardParams;
  /** Rang des éclats dans l'empilement : 300 les met devant tout (cf. « Empilement des cartes » du CLAUDE.md). */
  renderOrder?: number;
  /** Rang du groupe : le tri de three le compare avant le `renderOrder` des meshes, donc 0 pour passer derrière les cartes. */
  groupOrder?: number;
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
            uDa: { value: new Color(0.5, 0.6, 1) },
            uDaMix: { value: 0 },
            uFlat: { value: 1 },
            uOpacity: { value: 0 },
            uSoft: { value: 0 },
            uRadius: { value: 0 },
            uAspect: { value: 1 },
            uBlur: { value: 0 },
            uIrid: { value: 0 },
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
    const p = params?.() ?? debug.current.shards;
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
      { z: PLANE_Z[1], travel: 1, scale: 1, blur: 0, opacity: 0.9 },
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
      let w = Math.min(src.w * 0.6, base * Math.sqrt(stretch));
      let h = Math.min(src.h * 0.6, base / Math.sqrt(stretch));
      // Sans étirement, de vrais carrés même quand la carte est plus petite que l'éclat.
      if (p.aspect <= 1.001) w = h = Math.min(w, h);

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
      const travel = p.travel * plane.travel * (0.5 + hash01(k + 10.7)) * out * (src.spread ?? 1);

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
      u.uFlat.value = p.flat;
      u.uDaMix.value = p.tint;
      // La couleur de la DA suit la place de l'éclat sur la carte, en diagonale : voisins,
      // ils se suivent dans le spectre.
      if (p.tint > 0.001) toLinear(u.uDa.value as Color, daGradientRgb(0.5 + (sx - sy) * 0.5));
      const fadeIn = Math.min(1, life / 0.12);
      u.uOpacity.value = intensity * p.opacity * plane.opacity * fadeIn * Math.pow(1 - life, 1.1);
      u.uSoft.value = p.softness;
      u.uRadius.value = debug.current.da.pixelRadius;
      u.uAspect.value = w / h;
      u.uBlur.value = plane.blur;
      u.uIrid.value = p.iridescence;
      u.uTime.value = clock;
    }
  });

  return (
    <group renderOrder={groupOrder}>
      {materials.map((mat, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m;
          }}
          visible={false}
          renderOrder={renderOrder}
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
