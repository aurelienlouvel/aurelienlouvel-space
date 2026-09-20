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
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import {
  attachUniforms,
  clampRadius,
  FRAME_DEFINES,
  GLSL_PIXEL_WIDTH,
  uniformsOf,
} from "./rounded-frame";

type PlaneUniforms = {
  uSize: IUniform<Vector2>;
  uRadius: IUniform<number>;
  uMotionBlur: IUniform<Vector2>;
};

/**
 * `TextureLoader` laisse `colorSpace` à `NoColorSpace` : sans ce marquage,
 * three saute la conversion sRGB → linéaire et l'image sort délavée.
 *
 * Posé via le `onLoad` de drei (appelé en layout effect, donc avant le premier
 * rendu WebGL) plutôt qu'en mutant la texture pendant le rendu React.
 */
function markAsSrgb(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
}

const ROUNDING_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform vec2 uMotionBlur;

${GLSL_PIXEL_WIDTH}

/** SDF d'un rectangle arrondi centré sur l'origine, négative à l'intérieur. */
float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}
`;

const MOTION_BLUR_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float blurLen = length(uMotionBlur);
  if (blurLen > 0.0008) {
    vec2 bStep = uMotionBlur;
    sampledDiffuseColor = sampledDiffuseColor * 0.22
      + texture2D( map, vMapUv + bStep * 0.35 ) * 0.19
      + texture2D( map, vMapUv - bStep * 0.35 ) * 0.19
      + texture2D( map, vMapUv + bStep * 0.70 ) * 0.12
      + texture2D( map, vMapUv - bStep * 0.70 ) * 0.12
      + texture2D( map, vMapUv + bStep * 1.05 ) * 0.08
      + texture2D( map, vMapUv - bStep * 1.05 ) * 0.08;
  }
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb + vec3( 0.055 ), vec3( 1.0 / 2.4 ) ) * vec3( 1.0 / 1.055 ), sampledDiffuseColor.rgb * vec3( 1.0 / 12.92 ), lessThan( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ), sampledDiffuseColor.a );
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
    uMotionBlur: { value: new Vector2(0, 0) },
  } satisfies PlaneUniforms);
  parameters.fragmentShader = parameters.fragmentShader
    .replace("#include <common>", `#include <common>\n${ROUNDING_PARS}`)
    .replace(
      "#include <map_fragment>",
      MOTION_BLUR_MAP,
    );
}

/**
 * three réutilise un programme déjà compilé dès que la clé de cache coïncide,
 * sans rappeler `onBeforeCompile` : il faut donc distinguer explicitement les
 * matériaux qui injectent du code.
 */
function roundCornersCacheKey() {
  return "play-artifact-grid-motion-blur";
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
  onPointerDown?: (world: { x: number; y: number }) => void;
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
 * l'autoplay ne soit pas bloqué par le navigateur. `colorSpace` est posé par
 * le hook lui-même (`gl.outputColorSpace`) — pas besoin d'un `markAsSrgb` ici.
 */
function ArtifactPlaneVideo(props: ArtifactPlaneMediaProps) {
  const texture = useVideoTexture(props.url);
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
  onPointerDown,
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
        onHoverChange(true, worldPosition());
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        onHoverChange(false, worldPosition());
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverChange(true, worldPosition());
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverChange(false, worldPosition());
      }}
      onPointerDown={(e) => {
        const btn = e.button ?? e.nativeEvent?.button;
        if (btn === 0) {
          e.stopPropagation();
          onPointerDown?.(worldPosition());
        }
      }}
      onClick={() => onSelect(worldPosition())}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        defines={FRAME_DEFINES}
        onBeforeCompile={roundCorners}
        customProgramCacheKey={roundCornersCacheKey}
      />
    </mesh>
  );
}
