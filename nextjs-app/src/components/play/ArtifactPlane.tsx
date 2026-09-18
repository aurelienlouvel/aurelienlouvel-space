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
import type { PlayDebugRef } from "./PlayCanvas";
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

${GLSL_PIXEL_WIDTH}

/** SDF d'un rectangle arrondi centré sur l'origine, négative à l'intérieur. */
float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}
`;

const ROUNDING_MASK = /* glsl */ `
  vec2 framePoint = (vUv - 0.5) * uSize;
  float frameDistance = sdRoundedRect(framePoint, uSize * 0.5, uRadius);
  float frameEdge = pixelWidth(framePoint) * 0.5;
  diffuseColor.a *= 1.0 - smoothstep(-frameEdge, frameEdge, frameDistance);
`;

/**
 * Découpe le matériau en rectangle arrondi.
 *
 * Injection dans `MeshBasicMaterial` plutôt que `ShaderMaterial` maison : on
 * garde ainsi la gestion des couleurs de three, qui décode la texture sRGB en
 * entrée et ré-encode en sortie. La refaire à la main ne rapporterait qu'un
 * risque de la rater. Vrai autant pour une texture image que vidéo — les deux
 * arrivent ici sous la même forme (`THREE.Texture`), cf. `ArtifactPlaneMesh`.
 */
function roundCorners(
  this: MeshBasicMaterial,
  parameters: WebGLProgramParametersWithUniforms,
) {
  attachUniforms(this, parameters, {
    uSize: { value: new Vector2(1, 1) },
    uRadius: { value: 0 },
  } satisfies PlaneUniforms);
  parameters.fragmentShader = parameters.fragmentShader
    .replace("#include <common>", `#include <common>\n${ROUNDING_PARS}`)
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>\n${ROUNDING_MASK}`,
    );
}

/**
 * three réutilise un programme déjà compilé dès que la clé de cache coïncide,
 * sans rappeler `onBeforeCompile` : il faut donc distinguer explicitement les
 * matériaux qui injectent du code.
 */
function roundCornersCacheKey() {
  return "play-artifact-rounded";
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
export function ArtifactPlane({ kind, ...rest }: ArtifactPlaneProps) {
  return kind === "video" ? <ArtifactPlaneVideo {...rest} /> : <ArtifactPlaneImage {...rest} />;
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
      const sx = localMeshRef.current ? localMeshRef.current.scale.x : width;
      const sy = localMeshRef.current ? localMeshRef.current.scale.y : height;
      uniforms.uSize.value.set(sx, sy);
      uniforms.uRadius.value = clampRadius(debug.current.plane.radius, sx, sy);
    }
  });

  function worldPosition() {
    const vector = new Vector3();
    localMeshRef.current?.getWorldPosition(vector);
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
      onPointerOver={() => onHoverChange(true, worldPosition())}
      onPointerOut={() => onHoverChange(false, worldPosition())}
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
