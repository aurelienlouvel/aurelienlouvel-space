"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ShaderMaterial, Vector2, type Mesh } from "three";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import {
  CORNER_SMOOTHING,
  GLSL_PIXEL_WIDTH,
  GLSL_SQUIRCLE,
  clampRadius,
} from "./rounded-frame";

/**
 * Ombre portée des cartes de la mosaïque : ce qui les détache du fond de points
 * maintenant qu'elles ne tournent plus. Les unités sont celles du monde (la
 * caméra les zoome comme les cartes), l'axe Y de l'ombre est « vers le bas ».
 */
export type ShadowParams = {
  enabled: boolean;
  /** Opacité maximale de l'ombre au repos (0..1). */
  opacity: number;
  /** Rayon du flou : la pénombre s'étale de ce rayon de part et d'autre du bord. */
  blur: number;
  /** Décalage vers la droite. */
  offsetX: number;
  /** Décalage vers le bas. */
  offsetY: number;
  /** Agrandissement (+) ou rétrécissement (−) de la forme de l'ombre par rapport à la carte. */
  spread: number;
  /** Soulèvement au survol : décalage et flou gagnent ce ratio, l'ombre se renforce un peu (0 = aucun). */
  lift: number;
  /** Couleur de l'ombre, `#rrggbb`. */
  color: string;
};

export const SHADOW_DEFAULTS: ShadowParams = {
  enabled: true,
  opacity: 0.04,
  blur: 0,
  offsetX: 0,
  offsetY: 0,
  spread: 8,
  lift: 0.6,
  color: "#000000",
};

/**
 * Sous toutes les cartes : l'ombre d'une carte ne doit jamais assombrir sa
 * voisine. Les cartes (mosaïque 0, deck ≥ 65…) ne testent pas la profondeur,
 * l'empilement tient donc au seul `renderOrder` (cf. CLAUDE.md).
 */
const SHADOW_RENDER_ORDER = -10;

/** Au-delà de 3 σ (soit 1,5 × le rayon de flou) le bord flouté vaut moins de 0,2 % : le quad s'arrête là. */
const REACH = 1.6;

const VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec2 uQuad;
uniform vec2 uHalf;
uniform float uRadius;
uniform vec2 uCardHalf;
uniform float uCardRadius;
uniform vec2 uCardShift;
uniform float uBlur;
uniform float uOpacity;
uniform vec3 uColor;

varying vec2 vUv;

${GLSL_PIXEL_WIDTH}

${GLSL_SQUIRCLE}

void main() {
  vec2 p = (vUv - 0.5) * uQuad;

  // Bord flouté au gaussien : 1 − erf(d / σ√2), avec σ = blur / 2 et
  // erf(x) ≈ tanh(1,2285 · x). Le clamp évite les NaN de tanh sur certains GPU.
  float d = sdRoundedRect(p, uHalf, uRadius);
  float shade = 0.5 - 0.5 * tanh(clamp(1.7374 * d / uBlur, -6.0, 6.0));

  // La carte recouvre sa propre ombre. Si son média est translucide (PNG), on
  // ne veut pas d'un aplat sombre qui transparaît : l'ombre est évidée sous la
  // carte, en gardant 1 à 3 pixels sous son bord pour que le liseré
  // antialiasé de la carte repose bien sur l'ombre.
  vec2 cp = p - uCardShift;
  float px = pixelWidth(cp);
  float outside = smoothstep(-3.0 * px, -1.0 * px, sdRoundedRect(cp, uCardHalf, uCardRadius));

  float a = shade * outside * uOpacity;
  if (a < 0.001) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/** `#rrggbb` → composantes 0..1 telles quelles : les shaders de la scène sortent leurs couleurs sans conversion. */
function setRawColor(target: Color, hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return;
  target.setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

type ShadowUniforms = {
  uQuad: { value: Vector2 };
  uHalf: { value: Vector2 };
  uRadius: { value: number };
  uCardHalf: { value: Vector2 };
  uCardRadius: { value: number };
  uCardShift: { value: Vector2 };
  uBlur: { value: number };
  uOpacity: { value: number };
  uColor: { value: Color };
};

/**
 * L'ombre d'une carte, à poser en enfant du mesh de la carte : elle en hérite
 * la position (donc le survol, le burst, le tuilage) sans rien recalculer, et
 * relit la taille et la rotation de la carte à chaque frame.
 *
 * Un quad plus grand que la carte, dessiné en SDF : la forme est la même que
 * celle de la carte (coins lissés compris), le flou est analytique. Aucun
 * rendu hors écran, aucune texture.
 *
 * Elle ne participe pas au survol : sans `raycast` neutralisé, R3F testerait
 * aussi les enfants du mesh écouteur, et l'ombre, plus grande que la carte,
 * élargirait la zone de survol et de clic.
 */
export function CardShadow({
  debug,
  runtime,
}: {
  debug: PlayDebugRef;
  runtime?: PlayRuntimeRef;
}) {
  const meshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const hexRef = useRef("");

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uQuad: { value: new Vector2(1, 1) },
          uHalf: { value: new Vector2(1, 1) },
          uRadius: { value: 0 },
          uCornerSmooth: CORNER_SMOOTHING,
          uCardHalf: { value: new Vector2(1, 1) },
          uCardRadius: { value: 0 },
          uCardShift: { value: new Vector2(0, 0) },
          uBlur: { value: 1 },
          uOpacity: { value: 0 },
          uColor: { value: new Color(0, 0, 0) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const mesh = meshRef.current;
    const card = mesh?.parent;
    const mat = materialRef.current;
    if (!mesh || !card || !mat) return;

    const p = debug.current.shadow;
    // L'ombre fait partie de la mosaïque : elle s'efface avec elle à l'ouverture
    // d'une carte (la tuile ciblée garde son opacité 1, pas son ombre) et revient
    // avec elle au retour. Le deck n'a pas d'ombre : la tuile qui s'ouvre non plus.
    const fade = runtime ? runtime.current.transition.frame.mosaicOpacity : 1;
    const hov = (card.userData.hov as number | undefined) ?? 0;
    const opacity = p.enabled
      ? Math.min(1, p.opacity * (1 + 0.4 * p.lift * hov)) * fade
      : 0;
    if (opacity < 0.002) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    // Les groupes parents ne sont pas mis à l'échelle : l'échelle du mesh est la
    // taille monde de la carte (comme dans `ArtifactPlaneMesh`).
    const w = Math.max(1, card.scale.x);
    const h = Math.max(1, card.scale.y);
    const raise = 1 + p.lift * hov;
    const blur = Math.max(0.5, p.blur * raise);

    // Décalage dans le repère de la carte, en unités monde : l'ombre tombe
    // toujours vers le bas de l'écran, même si la carte est tournée.
    const rot = card.rotation.z;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const ox = p.offsetX * raise;
    const oy = -p.offsetY * raise;
    const dx = ox * cos + oy * sin;
    const dy = -ox * sin + oy * cos;

    // Le quad enveloppe la forme de l'ombre, centrée sur elle, et le mesh hérite
    // de l'échelle de la carte : sa position et son échelle locales sont des
    // fractions de la carte.
    const halfW = Math.max(1, w / 2 + p.spread);
    const halfH = Math.max(1, h / 2 + p.spread);
    const pad = Math.max(p.spread, 0) + blur * REACH + 2;
    const quadW = w + 2 * pad;
    const quadH = h + 2 * pad;
    mesh.position.set(dx / w, dy / h, 0);
    mesh.scale.set(quadW / w, quadH / h, 1);

    const cardRadius = clampRadius(debug.current.plane.radius, w, h);
    const u = mat.uniforms as unknown as ShadowUniforms;
    u.uQuad.value.set(quadW, quadH);
    u.uHalf.value.set(halfW, halfH);
    u.uRadius.value = clampRadius(Math.max(0, cardRadius + p.spread), halfW * 2, halfH * 2);
    u.uCardHalf.value.set(w / 2, h / 2);
    u.uCardRadius.value = cardRadius;
    u.uCardShift.value.set(-dx, -dy);
    u.uBlur.value = blur;
    u.uOpacity.value = opacity;
    if (hexRef.current !== p.color) {
      hexRef.current = p.color;
      setRawColor(u.uColor.value, p.color);
    }
  });

  return (
    <mesh ref={meshRef} visible={false} renderOrder={SHADOW_RENDER_ORDER} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}
