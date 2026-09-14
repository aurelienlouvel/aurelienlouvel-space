"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  SRGBColorSpace,
  Vector2,
  type IUniform,
  type Mesh,
  type MeshBasicMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
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
 * risque de la rater.
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

/**
 * Le plane texturé, au ratio réel de l'image.
 *
 * La géométrie est un carré unitaire remis à l'échelle à chaque frame : la
 * largeur du debug pane devient un simple `scale`, sans reconstruire de
 * géométrie.
 *
 * `ratio` = largeur / hauteur de l'image source.
 *
 * Le survol est remonté au parent plutôt que gardé ici : c'est `FocusIndicator`
 * qui le consomme, et les deux sont frères dans la scène.
 */
export function ArtifactPlane({
  url,
  ratio,
  debug,
  onHoverChange,
}: {
  url: string;
  ratio: number;
  debug: PlayDebugRef;
  onHoverChange: (hovered: boolean) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const texture = useTexture(url, markAsSrgb);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { x, y, width, radius } = debug.current.plane;
    const height = width / ratio;
    mesh.position.set(x, y, 0);
    mesh.scale.set(width, height, 1);

    const uniforms = uniformsOf<PlaneUniforms>(materialRef.current);
    if (!uniforms) return;
    uniforms.uSize.value.set(width, height);
    uniforms.uRadius.value = clampRadius(radius, width, height);
  });

  return (
    <mesh
      ref={meshRef}
      onPointerOver={() => onHoverChange(true)}
      onPointerOut={() => onHoverChange(false)}
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
