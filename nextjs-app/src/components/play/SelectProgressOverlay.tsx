"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
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
uniform vec3 uColor;
uniform float uBaseOpacity;
uniform float uLineOpacity;

varying vec2 vUv;

${GLSL_PIXEL_WIDTH}

float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
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

  // Remplissage vertical du bas (vUv.y = 0) vers le haut (vUv.y = 1)
  float progressY = uProgress;
  float deltaY = progressY - vUv.y;
  float pixelY = pixelWidth(vec2(0.0, framePoint.y)) / max(uSize.y, 1.0);

  // 1. Zone remplie sous la ligne de progression
  float fillAlpha = smoothstep(-pixelY, pixelY, deltaY) * uBaseOpacity;

  // 2. Ligne de tête lumineuse (scanline) de 2.5 pixels
  float lineHalfWidth = pixelY * 2.5;
  float lineAlpha = (1.0 - smoothstep(0.0, lineHalfWidth, abs(deltaY))) * uLineOpacity;

  // 3. Légère lueur diffuse juste sous la tête de lecture
  float glowAlpha = smoothstep(lineHalfWidth * 4.0, 0.0, max(0.0, deltaY)) * (uLineOpacity * 0.35);

  float totalAlpha = (fillAlpha + lineAlpha + glowAlpha) * alphaCorner;
  if (totalAlpha <= 0.001) {
    discard;
  }

  gl_FragColor = vec4(uColor, clamp(totalAlpha, 0.0, 1.0));
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
) {
  mesh.visible = true;
  mesh.position.set(pos.x, pos.y, OVERLAY_Z);
  mesh.scale.set(w, h, 1);

  const u = material.uniforms;
  u.uSize.value.set(w, h);
  u.uRadius.value = radius;
  u.uProgress.value = progress;
}

/**
 * Overlay shader de progression de sélection :
 * - Positionné à Z = 0.5 sur l'artifact en cours de sélection.
 * - Effectue un remplissage vertical ultra-net du bas vers le haut
 *   avec une ligne de scan lumineuse en tête de progression.
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
          uColor: { value: new Color("#ffffff") },
          uBaseOpacity: { value: 0.22 },
          uLineOpacity: { value: 0.85 },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );

  useFrame(() => {
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
    );
  });

  return (
    <mesh ref={meshRef} visible={false} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}
