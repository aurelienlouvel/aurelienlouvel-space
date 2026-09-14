"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Vector2,
  type IUniform,
  type Mesh,
  type MeshBasicMaterial,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { PlayDebugRef } from "./PlayCanvas";
import {
  attachUniforms,
  FRAME_DEFINES,
  GLSL_PIXEL_WIDTH,
  uniformsOf,
} from "./rounded-frame";

/** Écart entre le bord de l'image et le bord extérieur des brackets. */
const PADDING = 16;

/** Marge de quad autour du cadre, pour ne pas rogner l'antialiasing. */
const MARGIN = 4;

/** Devant le plane, qui est à z = 0. */
const Z = 1;

/** Vitesse du fondu (amortissement exponentiel, par seconde). */
const FADE_SPEED = 14;

/** En dessous, on considère l'indicateur éteint et on cesse de le dessiner. */
const OPACITY_EPSILON = 0.001;

/**
 * `uSize` est la taille de l'image, pas celle du quad : le shader en déduit le
 * cadre, et le quad se contente de le contenir avec un peu de marge.
 */
type BracketUniforms = {
  uSize: IUniform<Vector2>;
  uRadius: IUniform<number>;
  uThickness: IUniform<number>;
  uArm: IUniform<number>;
};

/**
 * De combien le quad déborde l'image, sur chaque axe.
 *
 * Un trait de rayon nul déborde du cadre de la moitié de son épaisseur — c'est
 * son bout arrondi qui dépasse — donc la marge doit en tenir compte.
 */
function oversize(thickness: number) {
  return 2 * (PADDING + thickness / 2 + MARGIN);
}

const BRACKETS_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform float uThickness;
uniform float uArm;

${GLSL_PIXEL_WIDTH}

const float PADDING = ${PADDING.toFixed(1)};
const float MARGIN = ${MARGIN.toFixed(1)};

/** Plus loin que tout ce que le quad peut contenir. */
const float FAR = 1e6;

/** Distance au segment [a, b]. */
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  // Le plancher couvre le bras de longueur nulle, que les réglages autorisent.
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

/**
 * Distance au quart de cercle de centre c et de rayon r, côté -x / -y.
 *
 * Hors du quadrant, le point le plus proche est une extrémité de l'arc — donc
 * aussi une extrémité de l'un des deux segments, qui s'en chargent. Sans ce
 * rejet, l'arc prolongerait les bras jusqu'au bord du quad.
 */
float sdCornerArc(vec2 p, vec2 c, float r) {
  vec2 v = p - c;
  if (v.x > 0.0 || v.y > 0.0) return FAR;
  return abs(length(v) - r);
}
`;

const BRACKETS_MASK = /* glsl */ `
  float halfThickness = uThickness * 0.5;
  vec2 quadSize = uSize + 2.0 * (PADDING + halfThickness + MARGIN);
  vec2 quadPoint = (vUv - 0.5) * quadSize;

  // Les quatre brackets sont identiques au miroir près : on replie le plan sur
  // un seul quadrant et la forme n'est décrite qu'une fois.
  vec2 frameCorner = uSize * 0.5 + PADDING;
  vec2 cornerPoint = frameCorner - abs(quadPoint);

  // Le bord extérieur du trait épouse le cadre ; l'axe du trait est donc rentré
  // d'une demi-épaisseur. Au-delà du cadre, le centre d'arc sortirait du quad.
  float outerRadius = min(uRadius, min(frameCorner.x, frameCorner.y));
  float axisRadius = max(outerRadius - halfThickness, 0.0);
  float armTip = outerRadius + uArm;

  float bracketDistance = min(
    min(
      sdSegment(cornerPoint, vec2(halfThickness, outerRadius), vec2(halfThickness, armTip)),
      sdSegment(cornerPoint, vec2(outerRadius, halfThickness), vec2(armTip, halfThickness))
    ),
    sdCornerArc(cornerPoint, vec2(outerRadius), axisRadius)
  );

  float bracketEdge = pixelWidth(quadPoint) * 0.5;
  diffuseColor.a *= 1.0 - smoothstep(
    -bracketEdge,
    bracketEdge,
    bracketDistance - halfThickness
  );
`;

/**
 * Creuse les quatre brackets dans le quad.
 *
 * Injection dans `MeshBasicMaterial` plutôt que `ShaderMaterial` maison, pour
 * la même raison que `ArtifactPlane` : la conversion de `COLOR` vers l'espace
 * de sortie reste celle de three, et le fondu passe par l'uniform `opacity`
 * déjà présent.
 */
function carveBrackets(
  this: MeshBasicMaterial,
  parameters: WebGLProgramParametersWithUniforms,
) {
  attachUniforms(this, parameters, {
    uSize: { value: new Vector2(1, 1) },
    uRadius: { value: 0 },
    uThickness: { value: 0 },
    uArm: { value: 0 },
  } satisfies BracketUniforms);
  parameters.fragmentShader = parameters.fragmentShader
    .replace("#include <common>", `#include <common>\n${BRACKETS_PARS}`)
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>\n${BRACKETS_MASK}`,
    );
}

/**
 * three réutilise un programme déjà compilé dès que la clé de cache coïncide,
 * sans rappeler `onBeforeCompile` : il faut donc distinguer explicitement les
 * matériaux qui injectent du code.
 */
function carveBracketsCacheKey() {
  return "play-focus-brackets";
}

/**
 * Quatre brackets d'angle qui encadrent l'artifact au survol.
 *
 * Un seul quad, une seule passe de shader : les brackets sont symétriques, donc
 * le fragment shader replie le plan avec `abs()` et ne décrit la forme qu'une
 * fois. Le quad suit l'image de près pour que l'antialiasing garde la même
 * résolution quelle que soit sa taille.
 *
 * Arrondi, épaisseur, longueur de bras et couleur viennent du debug pane. Les
 * trois premiers gardent la même valeur quelle que soit la taille de l'image —
 * seule la position des coins suit le cadre.
 *
 * `ratio` = largeur / hauteur de l'image, comme pour `ArtifactPlane`.
 */
export function FocusIndicator({
  ratio,
  debug,
  active,
}: {
  ratio: number;
  debug: PlayDebugRef;
  active: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const opacityRef = useRef(0);
  const colorRef = useRef("");

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    const { plane, brackets } = debug.current;

    // Posée même quand l'indicateur est éteint : le matériau resterait sinon au
    // blanc de three jusqu'à la première frame visible. Le garde évite de
    // reparser la chaîne à chaque frame — three la relit caractère par
    // caractère, et elle ne bouge qu'au picker.
    if (colorRef.current !== brackets.color) {
      colorRef.current = brackets.color;
      material.color.set(brackets.color);
    }

    // Amortissement exponentiel plutôt qu'un pas fixe : le fondu dure le même
    // temps quel que soit le framerate.
    const target = active ? 1 : 0;
    const opacity =
      opacityRef.current +
      (target - opacityRef.current) * (1 - Math.exp(-FADE_SPEED * delta));
    opacityRef.current = opacity;

    mesh.visible = opacity > OPACITY_EPSILON;
    if (!mesh.visible) return;
    material.opacity = opacity;

    const width = plane.width;
    const height = width / ratio;
    const margin = oversize(brackets.thickness);
    mesh.position.set(plane.x, plane.y, Z);
    mesh.scale.set(width + margin, height + margin, 1);

    const uniforms = uniformsOf<BracketUniforms>(material);
    if (!uniforms) return;
    uniforms.uSize.value.set(width, height);
    uniforms.uRadius.value = brackets.radius;
    uniforms.uThickness.value = brackets.thickness;
    uniforms.uArm.value = brackets.arm;
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        transparent
        opacity={0}
        defines={FRAME_DEFINES}
        onBeforeCompile={carveBrackets}
        customProgramCacheKey={carveBracketsCacheKey}
      />
    </mesh>
  );
}
