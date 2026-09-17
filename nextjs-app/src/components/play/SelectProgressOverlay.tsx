"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  DoubleSide,
  ShaderMaterial,
  Vector2,
  type Mesh,
} from "three";
import { clampRadius, GLSL_PIXEL_WIDTH } from "./rounded-frame";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import type { LayoutTile } from "./layout-types";

const OVERLAY_Z = 0.5;

const PROGRESS_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PROGRESS_FRAGMENT_SHADER = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform float uProgress;
uniform float uTime;
uniform float uBaseOpacity;
uniform float uLineOpacity;

varying vec2 vUv;

${GLSL_PIXEL_WIDTH}

float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

// Palette irisée nacrée inspirée de la découpe sticker iOS (Photos / Messages)
// Gradient spectral subtil : argent nacré, turquoise électrique, lavande et or champagne
vec3 holographicColor(float t) {
  vec3 a = vec3(0.86, 0.89, 0.94); // Base lumineuse claire
  vec3 b = vec3(0.20, 0.18, 0.26); // Saturation pastel douce
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.00, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  if (uProgress <= 0.001) {
    discard;
  }

  vec2 framePoint = (vUv - 0.5) * uSize;
  float edge = pixelWidth(framePoint) * 0.5;
  float cornerDist = sdRoundedRect(framePoint, uSize * 0.5, uRadius);

  // Masquage strict sur les coins arrondis avec antialiasing
  float alphaCorner = 1.0 - smoothstep(-edge, edge, cornerDist);
  if (alphaCorner <= 0.001) {
    discard;
  }

  // 1. Onde de progression fluide (vague liquide organique)
  // Double harmonique pour un contour de vague vivant
  float wave = sin(vUv.x * 7.0 + uTime * 4.0) * 0.026
             + cos(vUv.x * 12.5 - uTime * 2.5) * 0.012;

  // L'élévation de la crête progresse de -0.05 à 1.05 pour que la vague
  // démarre complètement sous le cadre et termine au-dessus
  float crestY = mix(-0.05, 1.05, uProgress) + wave;
  float deltaY = crestY - vUv.y;

  // Au-dessus de la crête de la vague : non dessiné
  if (deltaY < -0.03) {
    discard;
  }

  float pixelY = pixelWidth(vec2(0.0, framePoint.y)) / max(uSize.y, 1.0);

  // 2. Ligne de crête lumineuse (bordure brillante découpée style sticker)
  float rimWidth = pixelY * 2.8;
  float rimAlpha = (1.0 - smoothstep(0.0, rimWidth, abs(deltaY))) * uLineOpacity;

  // Lueur douce le long de la crête
  float crestGlow = smoothstep(0.06, 0.0, abs(deltaY)) * (uLineOpacity * 0.45);

  // 3. Corps du dégradé holographique nacré (iOS Sticker Sheen)
  // Dégradé diagonal animé qui ondule en suivant la vague
  float holoPhase = vUv.y * 2.0 + vUv.x * 1.2 + uTime * 0.5 + deltaY * 1.5;
  vec3 holo = holographicColor(holoPhase);

  // Dégradé de voile translucide : plus prononcé sous la crête, s'estompant délicatement vers le bas
  float fillAlpha = smoothstep(-pixelY, pixelY, deltaY) * mix(uBaseOpacity * 1.2, uBaseOpacity * 0.7, clamp(deltaY * 1.5, 0.0, 1.0));

  // Éclat spéculaire blanc argenté juste sous la crête
  float sheen = pow(clamp(1.0 - deltaY * 3.5, 0.0, 1.0), 3.0) * 0.5;

  // Fusion de la couleur : le corps irisé s'illumine en blanc argenté sur la crête
  vec3 color = mix(holo, vec3(1.0), clamp(rimAlpha + sheen, 0.0, 1.0));
  float totalAlpha = (fillAlpha + rimAlpha + crestGlow) * alphaCorner;

  if (totalAlpha <= 0.001) {
    discard;
  }

  gl_FragColor = vec4(color, clamp(totalAlpha, 0.0, 1.0));
}
`;

function applyOverlayFrame(
  mesh: Mesh,
  material: ShaderMaterial,
  pos: { x: number; y: number },
  w: number,
  h: number,
  radius: number,
  progress: number,
  time: number,
) {
  mesh.visible = true;
  mesh.position.set(pos.x, pos.y, OVERLAY_Z);
  mesh.scale.set(w, h, 1);

  const u = material.uniforms;
  u.uSize.value.set(w, h);
  u.uRadius.value = radius;
  u.uProgress.value = progress;
  u.uTime.value = time;
}

/**
 * Overlay shader de progression de sélection :
 * - Positionné à Z = 0.5 sur l'artifact en cours de sélection.
 * - Forme d'onde liquide ondulante (vague organique au lieu d'une ligne droite).
 * - Dégradé holographique nacré/irisé inspiré de la création de stickers sur iOS.
 * - Épouse fidèlement la géométrie et le rayon de coin de l'artifact.
 */
export function SelectProgressOverlay({
  debug,
  runtime,
  tile,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  tile: LayoutTile;
}) {
  const meshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: PROGRESS_VERTEX_SHADER,
        fragmentShader: PROGRESS_FRAGMENT_SHADER,
        uniforms: {
          uSize: { value: new Vector2(1, 1) },
          uRadius: { value: 0 },
          uProgress: { value: 0 },
          uTime: { value: 0 },
          uBaseOpacity: { value: 0.32 },
          uLineOpacity: { value: 0.95 },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );

  useFrame((state) => {
    const mesh = meshRef.current;
    const mat = materialRef.current;
    if (!mesh || !mat) return;

    const rc = runtime.current;
    const progress = rc.transition.selectProgress;

    if (progress <= 0.001 || rc.transition.phase !== "selecting") {
      mesh.visible = false;
      return;
    }

    const selIndex = rc.transition.targetIndex >= 0 ? rc.transition.targetIndex : rc.selected;
    const point = tile.points[selIndex];
    if (!point) {
      mesh.visible = false;
      return;
    }

    // Synchronisation position et dimensions avec l'artifact sélectionné
    // (tient compte du déplacement physique et du léger scale d'expansion)
    const scaleFactor = 1 + (debug.current.transition.selectScale - 1) * rc.transition.easedSelectProgress;
    const w = point.width * scaleFactor;
    const h = point.height * scaleFactor;
    const radius = clampRadius(debug.current.plane.radius * scaleFactor, w, h);
    applyOverlayFrame(
      mesh,
      mat,
      { x: rc.indicatorTarget.x, y: rc.indicatorTarget.y },
      w,
      h,
      radius,
      progress,
      state.clock.getElapsedTime(),
    );
  });

  return (
    <mesh ref={meshRef} visible={false} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}
