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
import type {
  PlayDebugRef,
  PlayRuntimeRef,
  SelectOverlayParams,
} from "./PlayCanvas";
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
uniform float uCrestSoftness;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uIridescence;
uniform float uBaseOpacity;
uniform float uGlowIntensity;

varying vec2 vUv;

${GLSL_PIXEL_WIDTH}

float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

// Palette irisée nacrée style sticker iOS (Lift subject / Foil Sheen)
// uIridescence dose la présence de teintes spectrales pastel sur la base argent/blanche
vec3 holographicColor(float t, float irid) {
  vec3 silveryBase = vec3(0.94, 0.95, 0.97);
  vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0) * t + vec3(0.00, 0.33, 0.67)));
  vec3 pastelHolo = mix(silveryBase, spectrum, 0.45);
  return mix(silveryBase, pastelHolo, clamp(irid, 0.0, 1.0));
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

  // 1. Onde de progression fluide (ondulation organique subtile)
  float wave = sin(vUv.x * uWaveFrequency + uTime * uWaveSpeed) * uWaveAmplitude
             + cos(vUv.x * (uWaveFrequency * 1.6) - uTime * (uWaveSpeed * 0.7)) * (uWaveAmplitude * 0.4);

  // L'élévation de la crête progresse doucement du bas vers le haut
  float margin = max(0.06, uCrestSoftness * 1.5 + uWaveAmplitude * 1.5);
  float crestY = mix(-margin, 1.0 + margin, uProgress) + wave;
  float deltaY = crestY - vUv.y;

  // Au-dessus de la zone de transition : non dessiné
  if (deltaY < -uCrestSoftness * 2.0) {
    discard;
  }

  // 2. Fondu ultra-doux (ZÉRO ligne définie)
  // Transition sigmoïde continue sans coupure abrupte
  float crestFactor = smoothstep(-uCrestSoftness, uCrestSoftness, deltaY);

  // Lueur optique diffuse en cloche gaussienne autour de la crête
  float glowWidth = max(uCrestSoftness * 1.4, 0.01);
  float crestGlow = exp(-pow(deltaY / glowWidth, 2.0)) * uGlowIntensity;

  // 3. Corps du dégradé holographique nacré (iOS Sticker Sheen)
  float holoPhase = vUv.y * 1.6 + vUv.x * 1.0 + uTime * 0.35 + deltaY * 1.2;
  vec3 holo = holographicColor(holoPhase, uIridescence);

  // Voile translucide s'atténuant délicatement vers le bas
  float fillAlpha = crestFactor * uBaseOpacity * mix(1.15, 0.75, clamp(deltaY * 1.2, 0.0, 1.0));

  // Éclat nacré doux qui se fond avec la crête
  float sheen = exp(-max(0.0, deltaY) / max(uCrestSoftness * 0.9, 0.01)) * 0.35;

  vec3 color = mix(holo, vec3(1.0), sheen);
  float totalAlpha = (fillAlpha + crestGlow * 0.4) * alphaCorner;

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
  overlay: SelectOverlayParams,
) {
  mesh.visible = true;
  mesh.position.set(pos.x, pos.y, OVERLAY_Z);
  mesh.scale.set(w, h, 1);

  const u = material.uniforms;
  u.uSize.value.set(w, h);
  u.uRadius.value = radius;
  u.uProgress.value = progress;
  u.uTime.value = time;
  u.uCrestSoftness.value = overlay.crestSoftness;
  u.uWaveAmplitude.value = overlay.waveAmplitude;
  u.uWaveFrequency.value = overlay.waveFrequency;
  u.uWaveSpeed.value = overlay.waveSpeed;
  u.uIridescence.value = overlay.iridescence;
  u.uBaseOpacity.value = overlay.baseOpacity;
  u.uGlowIntensity.value = overlay.glowIntensity;
}

/**
 * Overlay shader de progression de sélection :
 * - Positionné à Z = 0.5 sur l'artifact en cours de sélection.
 * - Forme d'onde liquide douce (fondu organique sans ligne définie).
 * - Dégradé holographique nacré/irisé inspiré de la création de stickers sur iOS.
 * - Paramétrable en temps réel via Tweakpane.
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
          uCrestSoftness: { value: 0.12 },
          uWaveAmplitude: { value: 0.012 },
          uWaveFrequency: { value: 3.5 },
          uWaveSpeed: { value: 2.0 },
          uIridescence: { value: 0.45 },
          uBaseOpacity: { value: 0.28 },
          uGlowIntensity: { value: 0.45 },
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
      debug.current.overlay,
    );
  });

  return (
    <mesh ref={meshRef} visible={false} raycast={() => null}>
      <planeGeometry args={[1, 1]} />
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}
