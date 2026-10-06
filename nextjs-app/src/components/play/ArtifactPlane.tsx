"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture, useVideoTexture } from "@react-three/drei";
import {
  SRGBColorSpace,
  Vector2,
  Vector3,
  type IUniform,
  type Mesh,
  type MeshBasicMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { MediaKind } from "./artifact-media";
import { CardShadow } from "./CardShadow";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import { getDirectionCode } from "./SelectProgressOverlay";
import {
  attachUniforms,
  CARD_TILT_GLSL,
  clampRadius,
  FRAME_DEFINES,
  CORNER_SMOOTHING,
  GLSL_PIXEL_WIDTH,
  GLSL_SQUIRCLE,
  uniformsOf,
} from "./rounded-frame";
import {
  registerSharedImageTexture,
  registerSharedVideoTexture,
} from "./SecondaryGalleryPlanes";

export type PlaneUniforms = {
  uSize: IUniform<Vector2>;
  uRadius: IUniform<number>;
  uCornerSmooth: IUniform<number>;
  uMotionBlur: IUniform<Vector2>;
  uCardTilt: IUniform<Vector2>;
  uWaveProgress: IUniform<number>;
  uWaveExit: IUniform<number>;
  uWaveDir: IUniform<number>;
  uWaveCrest: IUniform<number>;
  uWaveAmp: IUniform<number>;
  uWaveFreq: IUniform<number>;
  uWaveBlur: IUniform<number>;
  uWavePunch: IUniform<number>;
  uWaveBulge: IUniform<number>;
  uWaveWidth: IUniform<number>;
  uWaveTrail: IUniform<number>;
  uHoverWave: IUniform<number>;
  uHoverWaveAmp: IUniform<number>;
  uHoverWaveWidth: IUniform<number>;
  uHoverWaveGlow: IUniform<number>;
  uHoverWaveIrid: IUniform<number>;
  uTime: IUniform<number>;
};

/**
 * `TextureLoader` laisse `colorSpace` à `NoColorSpace` : sans ce marquage,
 * three saute la conversion sRGB → linéaire et l'image sort délavée.
 *
 * Posé via le `onLoad` de drei (appelé en layout effect, donc avant le premier
 * rendu WebGL) plutôt qu'en mutant la texture pendant le rendu React.
 */
function markAsSrgb(texture: Texture) {
  if (texture.colorSpace !== SRGBColorSpace) {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }
}

const ROUNDING_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform vec2 uMotionBlur;

// Onde de sélection : mêmes paramètres et même géométrie que le dégradé de
// SelectProgressOverlay, pour que la déformation suive exactement la crête.
uniform float uWaveProgress;
uniform float uWaveExit;
uniform int uWaveDir;
uniform float uWaveCrest;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uWaveBlur;
uniform float uWavePunch;
uniform float uWaveBulge;
uniform float uWaveWidth;
uniform float uWaveTrail;

// Vague de survol (cf. plus bas).
uniform float uHoverWave;
uniform float uHoverWaveAmp;
uniform float uHoverWaveWidth;
uniform float uHoverWaveGlow;
uniform float uHoverWaveIrid;
uniform float uTime;

/**
 * Déplacement UV des pixels sous la crête de la vague : une lentille qui pousse
 * l'image dans le sens de propagation au passage de la crête, suivie d'une
 * ondulation amortie dans son sillage.
 */
float waveDistortion(vec2 uv) {
  if (uWaveProgress <= 0.001 || uWaveExit >= 1.0) return 0.0;

  float along = uv.y;
  float across = uv.x;
  vec2 axis = vec2(0.0, 1.0);
  if (uWaveDir == 1) { along = 1.0 - uv.y; across = uv.x; axis = vec2(0.0, -1.0); }
  else if (uWaveDir == 2) { along = uv.x; across = uv.y; axis = vec2(1.0, 0.0); }
  else if (uWaveDir == 3) { along = 1.0 - uv.x; across = uv.y; axis = vec2(-1.0, 0.0); }
  else if (uWaveDir == 4) {
    along = (uv.x + uv.y) * 0.5; across = (uv.x - uv.y + 1.0) * 0.5;
    axis = normalize(vec2(1.0, 1.0));
  } else if (uWaveDir == 5) {
    along = (uv.x + (1.0 - uv.y)) * 0.5; across = (uv.x - (1.0 - uv.y) + 1.0) * 0.5;
    axis = normalize(vec2(1.0, -1.0));
  }

  float wave = sin(across * uWaveFreq * 1.5) * uWaveAmp
             + cos(across * (uWaveFreq * 2.7)) * (uWaveAmp * 0.35);
  float margin = max(0.06, uWaveCrest * 1.5 + uWaveAmp * 1.5);
  float crestPos = mix(-margin, 1.0 + margin + uWaveCrest * 2.0, uWaveProgress + uWaveExit * 0.4) + wave;
  float d = crestPos - along; // > 0 : la crête est déjà passée

  float width = max(uWaveWidth, 0.02);
  float q = d / width;
  float crest = exp(-q * q);
  // Derrière la crête, la déformation ne retombe pas d'un coup : elle s'étire
  // en traîne douce, ce qui garde le mouvement fluide.
  float trail = smoothstep(-width, width * 3.0, d) * (1.0 - smoothstep(width * 3.0, 1.2, d));
  float fade = 1.0 - smoothstep(0.6, 1.0, uWaveExit);

  return clamp(crest + trail * uWaveTrail, 0.0, 1.0) * fade;
}

${GLSL_PIXEL_WIDTH}

${GLSL_SQUIRCLE}
`;

const CARD_TILT_APPLY = /* glsl */ `
transformed = applyCardTilt(transformed, uCardTilt);
`;

const MOTION_BLUR_MAP = /* glsl */ `
#ifdef USE_MAP
  float lens = waveDistortion(vUv);
  vec2 mapUv = vMapUv;
  vec4 sampledDiffuseColor = texture2D( map, mapUv );
  if (lens > 0.0005) {
    // Comme si le média était happé par un objectif : il grossit vers le centre
    // (punch), se bombe sur les bords (bulge), puis les pixels s'étirent en
    // zoom blur radial. Tout est piloté par la même enveloppe (lens), donc
    // continu dans l'espace et dans le temps.
    vec2 zc = vec2(0.5);
    vec2 zd = mapUv - zc;
    float r2 = dot(zd, zd);
    zd *= (1.0 - uWavePunch * lens) * (1.0 + uWaveBulge * lens * r2 * 4.0);
    vec4 acc = vec4(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
      float t = float(i) / 15.0;
      float w = 1.0 - t * 0.55;
      acc += texture2D( map, zc + zd * (1.0 - uWaveBlur * lens * t) ) * w;
      wsum += w;
    }
    sampledDiffuseColor = acc / wsum;
  }
  // Vague de survol : une bande blanche et lumineuse qui traverse la carte du bas
  // gauche vers le haut droit, suivie d'une traîne douce. Elle éclaircit l'image vers
  // le blanc, et son cœur (plus étroit) la fait briller au-delà. uHoverWaveIrid y mêle
  // des reflets pastel façon film mince : leur teinte change d'un bord de la bande à
  // l'autre, le long de la crête et dans le temps (0 : blanc pur).
  // uHoverWave = 0 : éteinte ; 0..1 : progression.
  if (uHoverWave > 0.001) {
    float along = (vUv.x + vUv.y) * 0.5;
    float across = vUv.x - vUv.y;
    float crest = mix(-0.25, 1.3, uHoverWave) + sin(across * 6.0 + uTime * 3.0) * 0.035;
    float dw = along - crest;
    float w = max(uHoverWaveWidth, 0.03);
    float band = exp(-(dw * dw) / (w * w));
    float tail = dw < 0.0 ? exp(dw / (w * 3.5)) * 0.35 : 0.0;
    float fade = 1.0 - smoothstep(0.82, 1.0, uHoverWave);
    float milk = clamp((band + tail) * fade * uHoverWaveAmp, 0.0, 1.0);
    float core = exp(-(dw * dw) / (w * w * 0.12)) * fade;
    float huePhase = dw / w * 0.22 + across * 0.45 + uTime * 0.25;
    vec3 hue = 0.62 + 0.38 * cos(6.28318 * (huePhase + vec3(0.0, 0.33, 0.67)));
    vec3 sheen = mix(vec3(1.0), hue, clamp(uHoverWaveIrid, 0.0, 1.0));
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sheen, milk * 0.6)
      + sheen * (core * uHoverWaveAmp * uHoverWaveGlow * 0.5);
  }
  float blurLen = length(uMotionBlur);
  if (blurLen > 0.0008) {
    vec2 bStep = uMotionBlur;
    sampledDiffuseColor = sampledDiffuseColor * 0.22
      + texture2D( map, mapUv + bStep * 0.35 ) * 0.19
      + texture2D( map, mapUv - bStep * 0.35 ) * 0.19
      + texture2D( map, mapUv + bStep * 0.70 ) * 0.12
      + texture2D( map, mapUv - bStep * 0.70 ) * 0.12
      + texture2D( map, mapUv + bStep * 1.05 ) * 0.08
      + texture2D( map, mapUv - bStep * 1.05 ) * 0.08;
  }
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif

  vec2 framePoint = (vUv - 0.5) * uSize;
  float frameDistance = sdRoundedRect(framePoint, uSize * 0.5, uRadius);
  float frameEdge = pixelWidth(framePoint) * 0.5;
  diffuseColor.a *= 1.0 - smoothstep(-frameEdge, frameEdge, frameDistance);
`;

/**
 * Découpe le matériau en rectangle arrondi et applique le motion blur directionnel.
 */
function roundCorners(
  this: MeshBasicMaterial,
  parameters: WebGLProgramParametersWithUniforms,
) {
  attachUniforms(this, parameters, {
    uSize: { value: new Vector2(1, 1) },
    uRadius: { value: 0 },
    uCornerSmooth: CORNER_SMOOTHING,
    uMotionBlur: { value: new Vector2(0, 0) },
    uCardTilt: { value: new Vector2(0, 0) },
    uWaveProgress: { value: 0 },
    uWaveExit: { value: 0 },
    uWaveDir: { value: 0 },
    uWaveCrest: { value: 0.12 },
    uWaveAmp: { value: 0.012 },
    uWaveFreq: { value: 3.5 },
    uWaveBlur: { value: 0 },
    uWavePunch: { value: 0 },
    uWaveBulge: { value: 0 },
    uWaveWidth: { value: 0.28 },
    uWaveTrail: { value: 0 },
    uHoverWave: { value: 0 },
    uHoverWaveAmp: { value: 0.8 },
    uHoverWaveWidth: { value: 0.18 },
    uHoverWaveGlow: { value: 0.6 },
    uHoverWaveIrid: { value: 0.5 },
    uTime: { value: 0 },
  } satisfies PlaneUniforms);
  parameters.fragmentShader = parameters.fragmentShader
    .replace("#include <common>", `#include <common>\n${ROUNDING_PARS}`)
    .replace(
      "#include <map_fragment>",
      MOTION_BLUR_MAP,
    );
  parameters.vertexShader = parameters.vertexShader
    .replace("#include <common>", `#include <common>\n${CARD_TILT_GLSL}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${CARD_TILT_APPLY}`);
}

/**
 * three réutilise un programme déjà compilé dès que la clé de cache coïncide,
 * sans rappeler `onBeforeCompile` : il faut donc distinguer explicitement les
 * matériaux qui injectent du code.
 */
function roundCornersCacheKey() {
  return "play-artifact-grid-motion-blur-lens-hover-irid-flat-tilt";
}

/**
 * L'état de survol vit sur le mesh lui-même (userData), lu par `ArtifactGrid` :
 * c'est la copie réellement sous le curseur, sans comparer de positions monde
 * (qui dérivent avec le tuilage 3×3 et la caméra).
 */
function setMeshHovered(mesh: Mesh | null, hovered: boolean) {
  if (mesh) mesh.userData.hovered = hovered;
}

type ArtifactPlaneProps = {
  url: string;
  /** cf. `artifact-media.ts` — détermine quel hook de chargement de texture appeler. */
  kind: MediaKind;
  x: number;
  y: number;
  width: number;
  height: number;
  debug: PlayDebugRef;
  runtime?: PlayRuntimeRef;
  meshRef?: (mesh: Mesh | null) => void;
  onHoverChange: (hovering: boolean, world: { x: number; y: number }) => void;
  onSelect: (world: { x: number; y: number }) => void;
};

/**
 * Le plane d'un point de la mosaïque, image ou vidéo selon `kind`.
 *
 * N'est lui-même qu'un aiguillage : `useTexture` (image) et `useVideoTexture`
 * (vidéo) sont deux hooks distincts, et les régles de React interdisent de
 * n'en appeler qu'un des deux selon une condition (`kind`) — le nombre et
 * l'ordre des hooks doivent être identiques à chaque rendu d'un même
 * composant. `ArtifactPlaneImage`/`ArtifactPlaneVideo` existent pour ça :
 * chacun appelle inconditionnellement exactement un hook, puis délègue tout
 * le reste (taille, position, survol, clic, découpe du shader) à
 * `ArtifactPlaneMesh`, strictement identique quel que soit le média.
 */
export function ArtifactPlane({ kind, url, ...rest }: ArtifactPlaneProps) {
  if (!url) return null;
  return kind === "video" ? <ArtifactPlaneVideo url={url} {...rest} /> : <ArtifactPlaneImage url={url} {...rest} />;
}

type ArtifactPlaneMediaProps = Omit<ArtifactPlaneProps, "kind">;

function ArtifactPlaneImage(props: ArtifactPlaneMediaProps) {
  const texture = useTexture(props.url, markAsSrgb);
  if (texture && texture.colorSpace !== SRGBColorSpace) {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }
  if (texture) {
    registerSharedImageTexture(props.url, texture);
  }
  return <ArtifactPlaneMesh {...props} texture={texture} />;
}

/**
 * `useVideoTexture` (drei) crée et joue lui-même un `<video>` hors DOM, mis en
 * cache par url exactement comme `useTexture` met les images en cache par url
 * (même mécanisme `suspend-react` dessous) — un même artifact vidéo répété
 * sur plusieurs points (`repeat` > 1, cf. `scatter-layout.ts`) ne décode donc
 * son fichier qu'une seule fois, pas une par occurrence à l'écran.
 *
 * Défauts de drei (`muted`, `loop`, `playsInline`) : même convention que le
 * `<video>` DOM de `ProjectCard.tsx`, nécessaire de toute façon pour que
 * l'autoplay ne soit pas bloqué par le navigateur. On garantit `colorSpace`
 * à `SRGBColorSpace` pour que Three.js active le décodage vidéo sRGBTransferEOTF.
 */
function ArtifactPlaneVideo(props: ArtifactPlaneMediaProps) {
  const texture = useVideoTexture(props.url);
  if (texture && texture.colorSpace !== SRGBColorSpace) {
    texture.colorSpace = SRGBColorSpace;
  }
  if (texture) {
    registerSharedVideoTexture(props.url, texture);
  }
  return <ArtifactPlaneMesh {...props} texture={texture} />;
}

/**
 * Rendu commun à une image et une vidéo : taille, position, découpe en
 * rectangle arrondi, survol et clic — tout ce qui ne dépend pas de la façon
 * dont `texture` a été obtenue.
 */
function ArtifactPlaneMesh({
  x,
  y,
  width,
  height,
  debug,
  runtime,
  texture,
  meshRef,
  onHoverChange,
  onSelect,
}: ArtifactPlaneMediaProps & { texture: Texture }) {
  const localMeshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);

  useFrame(() => {
    const uniforms = uniformsOf<PlaneUniforms>(materialRef.current);
    if (uniforms) {
      const rawSx = localMeshRef.current ? localMeshRef.current.scale.x : width;
      const rawSy = localMeshRef.current ? localMeshRef.current.scale.y : height;
      const sx = Math.max(1, rawSx);
      const sy = Math.max(1, rawSy);
      uniforms.uSize.value.set(sx, sy);
      uniforms.uRadius.value = clampRadius(debug.current.plane.radius, sx, sy);

      // Paramètres de l'onde — l'avancement (progress/exit) est posé par la
      // grille, uniquement sur la tuile visée.
      const ov = debug.current.overlay;
      uniforms.uWaveDir.value = getDirectionCode(ov.direction);
      uniforms.uWaveCrest.value = ov.crestSoftness;
      uniforms.uWaveAmp.value = ov.waveAmplitude;
      uniforms.uWaveFreq.value = ov.waveFrequency;
      uniforms.uWaveBlur.value = ov.zoomBlur;
      uniforms.uWavePunch.value = ov.zoomPunch;
      uniforms.uWaveBulge.value = ov.bulge;
      uniforms.uWaveWidth.value = ov.lensWidth;
      uniforms.uWaveTrail.value = ov.lensTrail;

      if (runtime && runtime.current && runtime.current.cameraBlur) {
        const cb = runtime.current.cameraBlur;
        // cb est exprimé en unités proportionnelles au carreau standard (~400px).
        // L'échelle inverse garantit un flou uniforme en pixels écran quel que soit l'aspect ratio.
        uniforms.uMotionBlur.value.set(
          cb.x * (400 / sx),
          cb.y * (400 / sy),
        );
      } else {
        uniforms.uMotionBlur.value.set(0, 0);
      }
    }
  });

  function worldPosition() {
    const mesh = localMeshRef.current;
    if (!mesh) return { x, y };
    mesh.updateWorldMatrix(true, false);
    const vector = new Vector3();
    mesh.getWorldPosition(vector);
    return { x: vector.x, y: vector.y };
  }

  function handleRef(mesh: Mesh | null) {
    localMeshRef.current = mesh;
    meshRef?.(mesh);
  }

  return (
    <mesh
      ref={handleRef}
      position={[x, y, 0]}
      scale={[width, height, 1]}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setMeshHovered(localMeshRef.current, true);
        onHoverChange(true, worldPosition());
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        setMeshHovered(localMeshRef.current, false);
        onHoverChange(false, worldPosition());
      }}
      onClick={(e) => {
        // `delta` : distance parcourue entre l'appui et le relâchement. Au-delà du
        // seuil de drag, c'était un glisser de la mosaïque, pas un clic.
        if (e.delta > debug.current.pan.dragThreshold) return;
        e.stopPropagation();
        onSelect(worldPosition());
      }}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        // Empilement au seul `renderOrder` : même transparente, une tuile
        // écrirait sa profondeur et découperait les cartes du deck qui la
        // recouvrent à l'ouverture.
        depthTest={false}
        depthWrite={false}
        defines={FRAME_DEFINES}
        onBeforeCompile={roundCorners}
        customProgramCacheKey={roundCornersCacheKey}
      />
      <CardShadow debug={debug} />
    </mesh>
  );
}
