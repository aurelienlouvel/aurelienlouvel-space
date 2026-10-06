"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  ShaderMaterial,
  Vector2,
  type IUniform,
  type Material,
  type Mesh,
} from "three";
import type { PlayDebugRef } from "./PlayCanvas";
import {
  CARD_TILT_GLSL,
  CORNER_SMOOTHING,
  GLSL_PIXEL_WIDTH,
  GLSL_SQUIRCLE,
  uniformsOf,
} from "./rounded-frame";

/**
 * Contour des cartes : le plastique qui les entoure et les détache du fond de
 * points. C'est l'ancienne ombre portée, devenue un liseré net (flou à 0) ; les
 * réglages gardent le nom `shadow`. Les unités sont celles du monde (la caméra
 * les zoome comme les cartes), l'axe Y du décalage est « vers le bas ».
 */
export type ShadowParams = {
  enabled: boolean;
  /** Opacité maximale du contour au repos (0..1). */
  opacity: number;
  /** Rayon du flou : la pénombre s'étale de ce rayon de part et d'autre du bord. */
  blur: number;
  /** Décalage vers la droite. */
  offsetX: number;
  /** Décalage vers le bas. */
  offsetY: number;
  /** Épaisseur du contour (+) ou retrait (−) par rapport au bord de la carte. */
  spread: number;
  /** Soulèvement au survol : décalage et flou gagnent ce ratio, le contour se renforce un peu (0 = aucun). */
  lift: number;
  /** Couleur du contour, `#rrggbb`. */
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
 * Juste sous sa carte, jamais sous une autre : le contour d'une carte ne doit
 * pas assombrir sa voisine, mais celui d'une carte du deck passe bien par-dessus
 * les cartes qui sont derrière elle. Les cartes (mosaïque 0, deck ≥ 65…) ne
 * testent pas la profondeur : l'empilement tient au seul `renderOrder` (cf.
 * CLAUDE.md), et le contour reprend celui de sa carte. Le demi-cran ne tombe
 * jamais sur la valeur entière d'une autre carte.
 */
const RENDER_ORDER_BELOW_CARD = 0.5;

/** Au-delà de 3 σ (soit 1,5 × le rayon de flou) le bord flouté vaut moins de 0,2 % : le quad s'arrête là. */
const REACH = 1.6;

/** Rayon de flou effectif : le survol (`raise` = 1 + lift·hov) l'élargit. */
function blurAt(p: ShadowParams, raise: number) {
  return Math.max(0.5, p.blur * raise);
}

/** Débord du quad hors de la carte, de chaque côté, en unités monde. */
function padAt(p: ShadowParams, blur: number) {
  return Math.max(p.spread, 0) + blur * REACH + 2;
}

/**
 * Le quad se dimensionne dans le vertex shader, d'après la matrice de la carte :
 * sa taille, sa rotation et son inclinaison sont ceux du rendu en cours, pas ceux
 * de la frame d'avant. Un `useFrame` enfant tourne avant celui du parent, et la
 * carte du deck grandit de plusieurs dizaines de pixels par frame à l'ouverture :
 * le contour aurait toujours un cran de retard.
 */
const VERTEX = /* glsl */ `
uniform vec2 uOffset;
uniform float uPad;

${CARD_TILT_GLSL}

varying vec2 vUv;
varying vec2 vCard;
varying vec2 vShift;
varying vec2 vQuad;

void main() {
  vUv = uv;

  // Les groupes parents ne sont pas mis à l'échelle : les colonnes de la matrice
  // de la carte sont sa taille monde (comme dans \`ArtifactPlaneMesh\`).
  vec3 ax = modelMatrix[0].xyz;
  vec3 ay = modelMatrix[1].xyz;
  float sx = length(ax);
  float sy = length(ay);
  vec2 axisX = ax.xy / max(sx, 1e-4);
  vec2 axisY = ay.xy / max(sy, 1e-4);
  vec2 card = max(vec2(sx, sy), vec2(1.0));

  // Décalage dans le repère de la carte, en unités monde : le contour tombe
  // toujours vers le bas de l'écran, même si la carte est tournée.
  vec2 shift = vec2(dot(uOffset, axisX), dot(uOffset, axisY));
  vec2 quad = card + 2.0 * uPad;

  vCard = card;
  vShift = shift;
  vQuad = quad;

  // Le quad enveloppe la forme du contour, centrée sur elle ; il subit le même
  // warp que la carte pour la suivre pendant la torsion de l'ouverture.
  vec3 local = vec3((position.xy * quad + shift) / card, 0.0);
  vec3 warped = applyCardTilt(local, uCardTilt);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(warped.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uSpread;
uniform float uBlur;
uniform float uPlaneRadius;
uniform float uOpacity;
uniform vec3 uColor;

varying vec2 vUv;
varying vec2 vCard;
varying vec2 vShift;
varying vec2 vQuad;

${GLSL_PIXEL_WIDTH}

${GLSL_SQUIRCLE}

void main() {
  vec2 p = (vUv - 0.5) * vQuad;

  // Forme du contour : celle de la carte (coins lissés compris), agrandie de
  // l'épaisseur.
  vec2 cardHalf = vCard * 0.5;
  float cardRadius = min(uPlaneRadius, min(cardHalf.x, cardHalf.y));
  vec2 halfSize = max(vec2(1.0), cardHalf + uSpread);
  float radius = min(max(0.0, cardRadius + uSpread), min(halfSize.x, halfSize.y));

  // Bord flouté au gaussien : 1 − erf(d / σ√2), avec σ = blur / 2 et
  // erf(x) ≈ tanh(1,2285 · x). Le clamp évite les NaN de tanh sur certains GPU.
  float d = sdRoundedRect(p, halfSize, radius);
  float shade = 0.5 - 0.5 * tanh(clamp(1.7374 * d / uBlur, -6.0, 6.0));

  // La carte recouvre son propre contour. Si son média est translucide (PNG), on
  // ne veut pas d'un aplat sombre qui transparaît : le contour est évidé sous la
  // carte, en gardant 1 à 3 pixels sous son bord pour que le liseré
  // antialiasé de la carte repose bien dessus.
  vec2 cp = p + vShift;
  float px = pixelWidth(cp);
  float outside = smoothstep(-3.0 * px, -1.0 * px, sdRoundedRect(cp, cardHalf, cardRadius));

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
  uCardTilt: IUniform<Vector2>;
  uOffset: IUniform<Vector2>;
  uPad: IUniform<number>;
  uSpread: IUniform<number>;
  uBlur: IUniform<number>;
  uPlaneRadius: IUniform<number>;
  uOpacity: IUniform<number>;
  uColor: IUniform<Color>;
};

/** Ce que le contour relit du matériau de sa carte (la mosaïque n'a pas de dissolution). */
type HostUniforms = {
  uCardTilt?: IUniform<Vector2>;
  uDissolve?: IUniform<number>;
};

/**
 * Le contour d'une carte, à poser en enfant du mesh de la carte : mosaïque
 * comme deck, c'est le même objet. Il en hérite la position (donc le survol, le
 * burst, le tuilage) sans rien recalculer et suit l'opacité de la carte : il
 * s'efface avec elle, apparaît avec elle, et un layer du deck plus en retrait a
 * un contour plus discret.
 *
 * Un quad plus grand que la carte, dessiné en SDF : la forme est la même que
 * celle de la carte (coins lissés compris), le flou est analytique. Aucun
 * rendu hors écran, aucune texture.
 *
 * Tout ce qui change à chaque frame (opacité de la carte, inclinaison,
 * dissolution, survol) est relu juste avant le dessin (`onBeforeRender`), après
 * que le parent a posé son état de la frame ; ce qui sert avant le dessin (le
 * tri par `renderOrder`, le frustum culling, la visibilité) est relu au tri ou
 * dans `useFrame`.
 *
 * Il ne participe pas au survol : sans `raycast` neutralisé, R3F testerait
 * aussi les enfants du mesh écouteur, et le contour, plus grand que la carte,
 * élargirait la zone de survol et de clic.
 */
export function CardShadow({ debug }: { debug: PlayDebugRef }) {
  const meshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const hexRef = useRef("");

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uCardTilt: { value: new Vector2(0, 0) },
          uOffset: { value: new Vector2(0, 0) },
          uPad: { value: 0 },
          uSpread: { value: 0 },
          uBlur: { value: 1 },
          uPlaneRadius: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: new Color(0, 0, 0) },
          uCornerSmooth: CORNER_SMOOTHING,
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  // L'ordre de rendu se relit au moment du tri, pas à la frame d'avant : selon
  // l'ordre de montage, le `useFrame` d'un contour tourne avant ou après celui
  // de la liste qui pose le `renderOrder` de sa carte, et une carte qui change de
  // rang au pas du deck aurait un contour en retard d'un cran.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    Object.defineProperty(mesh, "renderOrder", {
      configurable: true,
      get: () => (mesh.parent?.renderOrder ?? 0) - RENDER_ORDER_BELOW_CARD,
      set: () => {},
    });
  }, []);

  // Un matériau par contour (jamais partagé) : c'est ce qui garantit que three
  // renvoie les uniforms au GPU à chaque dessin, donc après `refresh`.
  const refresh = useCallback(() => {
    const card = meshRef.current?.parent as Mesh | null | undefined;
    const mat = materialRef.current;
    if (!card || !mat) return;

    const p = debug.current.shadow;
    const host = card.material as Material | undefined;
    const hostUniforms = uniformsOf<HostUniforms>(host ?? null);
    const hov = (card.userData.hov as number | undefined) ?? 0;
    const dissolve = Math.min(1, Math.max(0, hostUniforms?.uDissolve?.value ?? 0));

    // La carte qui se désagrège emporte son contour avec elle.
    const fade = (host?.opacity ?? 1) * (1 - dissolve);
    const raise = 1 + p.lift * hov;
    const blur = blurAt(p, raise);

    const u = mat.uniforms as unknown as ShadowUniforms;
    u.uOpacity.value = p.enabled ? Math.min(1, p.opacity * (1 + 0.4 * p.lift * hov)) * fade : 0;
    u.uBlur.value = blur;
    u.uSpread.value = p.spread;
    u.uPad.value = padAt(p, blur);
    u.uOffset.value.set(p.offsetX * raise, -p.offsetY * raise);
    u.uPlaneRadius.value = debug.current.plane.radius;
    const tilt = hostUniforms?.uCardTilt?.value;
    if (tilt) u.uCardTilt.value.copy(tilt);
    else u.uCardTilt.value.set(0, 0);
    if (hexRef.current !== p.color) {
      hexRef.current = p.color;
      setRawColor(u.uColor.value, p.color);
    }
  }, [debug]);

  useFrame(() => {
    const mesh = meshRef.current;
    const card = mesh?.parent;
    if (!mesh || !card) return;
    const p = debug.current.shadow;
    mesh.visible = p.enabled;

    // Le quad est dimensionné dans le vertex shader, hors de ce que three sait de
    // sa géométrie : sa sphère englobante, celle d'un carré unité, ne couvre que
    // la carte. On lui donne le débord du contour, au pire du survol, pour que le
    // frustum culling écarte toujours les cartes hors écran (une carte de plus
    // dessinée pour rien, c'est un draw call par contour) sans manger leur bord.
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (sphere) {
      const w = Math.max(card.scale.x, 1);
      const h = Math.max(card.scale.y, 1);
      const worst = 1 + p.lift;
      const reach = padAt(p, blurAt(p, worst)) + Math.hypot(p.offsetX, p.offsetY) * worst;
      sphere.radius = (Math.hypot(w, h) / 2 + reach * Math.SQRT2) / Math.max(w, h);
    }
  });

  return (
    <mesh ref={meshRef} raycast={() => null} onBeforeRender={refresh}>
      <planeGeometry args={[1, 1]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}
