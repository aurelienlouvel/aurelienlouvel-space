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
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import { dampTowards } from "./damp";
import {
  attachUniforms,
  FRAME_DEFINES,
  GLSL_PIXEL_WIDTH,
  uniformsOf,
} from "./rounded-frame";

/** Marge de quad autour de la forme, pour ne pas rogner l'antialiasing. */
const MARGIN = 4;

/** Devant le plane, qui est à z = 0. */
const Z = 1;

/** En dessous, on considère l'indicateur éteint et on cesse de le dessiner. */
const OPACITY_EPSILON = 0.001;

/**
 * `uSize` est la taille de l'image, pas celle du quad : le shader en déduit le
 * cadre, et le quad se contente de le contenir avec un peu de marge.
 */
type BracketUniforms = {
  uSize: IUniform<Vector2>;
  uPadding: IUniform<number>;
  uRadius: IUniform<number>;
  uAngle: IUniform<number>;
  uArm: IUniform<Vector2>;
  uThickness: IUniform<number>;
};

const BRACKETS_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uPadding;
uniform float uRadius;
uniform float uAngle;
uniform vec2 uArm;
uniform float uThickness;

${GLSL_PIXEL_WIDTH}

const float MARGIN = ${MARGIN.toFixed(1)};

/** Plus loin que tout ce que le quad peut contenir. */
const float FAR = 1e6;

const float HALF_SQRT2 = 0.70710678;

/** Diagonale sortante du coin, dans le quadrant replié. */
const vec2 CORNER_DIAGONAL = vec2(-HALF_SQRT2);

/** Distance au segment [a, b]. */
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  // Le plancher couvre le bras de longueur nulle, que les réglages autorisent.
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

/**
 * Distance à l'arc de centre c et de rayon r, ouvert de part et d'autre de la
 * diagonale du coin.
 *
 * Hors du secteur, le point le plus proche est une extrémité de l'arc — donc
 * aussi une extrémité de l'un des deux bras, qui s'en chargent. Sans ce rejet,
 * l'arc se refermerait en cercle complet autour du coin.
 */
float sdArc(vec2 p, vec2 c, float r, float cosHalfAngle) {
  vec2 v = p - c;
  if (dot(v, CORNER_DIAGONAL) < cosHalfAngle * length(v)) return FAR;
  return abs(length(v) - r);
}
`;

const BRACKETS_MASK = /* glsl */ `
  float halfThickness = uThickness * 0.5;
  vec2 quadSize = uSize + 2.0 * (uPadding + uArm + halfThickness + MARGIN);
  vec2 quadPoint = (vUv - 0.5) * quadSize;

  // Les quatre brackets sont identiques au miroir près : on replie le plan sur
  // un seul quadrant et la forme n'est décrite qu'une fois.
  vec2 frameCorner = uSize * 0.5 + uPadding;
  vec2 cornerPoint = frameCorner - abs(quadPoint);

  // Le bord extérieur du trait épouse le cadre ; l'axe du trait est donc rentré
  // d'une demi-épaisseur. C'est le rayon extérieur qu'on borne, jamais celui de
  // l'axe : borner l'axe romprait ce lien et laisserait le trait mordre hors du
  // cadre dès qu'il est plus épais que l'arrondi. Sous une demi-épaisseur il n'y
  // a donc plus d'arrondi à prendre, et l'axe se referme sur un point.
  float cornerLimit = min(frameCorner.x, frameCorner.y);
  float outerRadius = clamp(uRadius, halfThickness, max(cornerLimit, halfThickness));
  float axisRadius = outerRadius - halfThickness;
  vec2 arcCenter = vec2(outerRadius);

  // L'arc est centré sur la diagonale et s'ouvre de uAngle ; les bras partent
  // de ses extrémités, tangents. À 90° ils tombent donc sur les axes et longent
  // les bords du cadre, et en deçà ils s'en écartent d'autant.
  float halfAngle = uAngle * 0.5;
  float cosHalfAngle = cos(halfAngle);
  float sinHalfAngle = sin(halfAngle);
  vec2 arcDir = HALF_SQRT2 * vec2(
    -(cosHalfAngle + sinHalfAngle),
    sinHalfAngle - cosHalfAngle
  );
  vec2 arcTangent = vec2(arcDir.y, -arcDir.x);

  vec2 armStart = arcCenter + axisRadius * arcDir;
  vec2 armTipY = armStart + uArm.y * arcTangent;
  vec2 armTipX = armStart.yx + uArm.x * arcTangent.yx;

  float bracketDistance = min(
    min(
      sdSegment(cornerPoint, armStart, armTipY),
      // L'autre bras est le miroir du premier par la diagonale du coin.
      sdSegment(cornerPoint, armStart.yx, armTipX)
    ),
    sdArc(cornerPoint, arcCenter, axisRadius, cosHalfAngle)
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
 * la même raison que `ArtifactPlane` : la conversion de la couleur vers l'espace
 * de sortie reste celle de three, et le fondu passe par l'uniform `opacity`
 * déjà présent.
 */
function carveBrackets(
  this: MeshBasicMaterial,
  parameters: WebGLProgramParametersWithUniforms,
) {
  attachUniforms(this, parameters, {
    uSize: { value: new Vector2(1, 1) },
    uPadding: { value: 0 },
    uRadius: { value: 0 },
    uAngle: { value: 0 },
    uArm: { value: new Vector2(0, 0) },
    uThickness: { value: 0 },
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
  return "play-focus-brackets-v2";
}

/**
 * Quatre brackets d'angle qui encadrent le point actuellement ciblé — la
 * sélection au repos, ou le survol le temps qu'il dure.
 *
 * Lors du maintien pour sélection (hold), les quatre bras s'étirent le long des bords
 * jusqu'à se rejoindre au centre de chaque arête pour former un rectangle fermé continu.
 */
export function FocusIndicator({
  debug,
  runtime,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
}) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const opacityRef = useRef(0);
  const colorRef = useRef("");
  const posRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const armRef = useRef({ x: 0, y: 0 });

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    const { brackets, indicator } = debug.current;
    const target = runtime.current.indicatorTarget;

    // Posée même quand l'indicateur est éteint : le matériau resterait sinon au
    // blanc de three jusqu'à la première frame visible. Le garde évite de
    // reparser la chaîne à chaque frame — three la relit caractère par
    // caractère, et elle ne bouge qu'au picker.
    if (colorRef.current !== brackets.color) {
      colorRef.current = brackets.color;
      material.color.set(brackets.color);
    }

    const opacity = dampTowards(opacityRef.current, 1, indicator.fadeSpeed, delta);
    opacityRef.current = opacity;

    mesh.visible = opacity > OPACITY_EPSILON;
    if (!mesh.visible) return;
    material.opacity = opacity;

    const pos = posRef.current;
    pos.x = dampTowards(pos.x, target.x, indicator.moveSpeed, delta);
    pos.y = dampTowards(pos.y, target.y, indicator.moveSpeed, delta);
    pos.width = dampTowards(pos.width, target.width, indicator.moveSpeed, delta);
    pos.height = dampTowards(pos.height, target.height, indicator.moveSpeed, delta);

    // Calcul de la longueur de bras requise pour fermer entièrement le cadre
    const halfThickness = brackets.thickness * 0.5;
    const frameCornerX = pos.width * 0.5 + brackets.padding;
    const frameCornerY = pos.height * 0.5 + brackets.padding;
    const cornerLimit = Math.min(frameCornerX, frameCornerY);
    const outerRadius = Math.max(
      halfThickness,
      Math.min(brackets.radius, Math.max(cornerLimit, halfThickness)),
    );

    // Le bras rejoint le centre de chaque arête (+ 1px pour sceller parfaitement tout artefact subpixel)
    const neededArmX = Math.max(brackets.arm, frameCornerX - outerRadius + 1.0);
    const neededArmY = Math.max(brackets.arm, frameCornerY - outerRadius + 1.0);

    const tr = runtime.current.transition;
    let joinProgress = 0;
    if (tr.phase === "selecting") {
      joinProgress = tr.easedSelectProgress;
    } else if (tr.phase === "burst" || tr.phase === "isolated") {
      joinProgress = 1;
    }

    const targetArmX = brackets.arm + (neededArmX - brackets.arm) * joinProgress;
    const targetArmY = brackets.arm + (neededArmY - brackets.arm) * joinProgress;

    const armDampSpeed = 16;
    const currentArmX = dampTowards(
      armRef.current.x || brackets.arm,
      targetArmX,
      armDampSpeed,
      delta,
    );
    const currentArmY = dampTowards(
      armRef.current.y || brackets.arm,
      targetArmY,
      armDampSpeed,
      delta,
    );
    armRef.current.x = currentArmX;
    armRef.current.y = currentArmY;

    const marginX = 2 * (brackets.padding + currentArmX + halfThickness + MARGIN);
    const marginY = 2 * (brackets.padding + currentArmY + halfThickness + MARGIN);
    mesh.position.set(pos.x, pos.y, Z);
    mesh.scale.set(pos.width + marginX, pos.height + marginY, 1);

    const uniforms = uniformsOf<BracketUniforms>(material);
    if (!uniforms) return;
    uniforms.uSize.value.set(pos.width, pos.height);
    uniforms.uPadding.value = brackets.padding;
    uniforms.uRadius.value = brackets.radius;
    // Le pane raisonne en degrés, le shader en radians.
    uniforms.uAngle.value = (brackets.angle * Math.PI) / 180;
    uniforms.uArm.value.set(currentArmX, currentArmY);
    uniforms.uThickness.value = brackets.thickness;
  });

  return (
    <mesh ref={meshRef} visible={false} raycast={() => null}>
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
