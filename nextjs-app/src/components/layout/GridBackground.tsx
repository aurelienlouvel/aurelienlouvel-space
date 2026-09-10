"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { DEFAULT_PARAMS, type Params } from "@/lib/play-params";
import type { CameraState, RippleState } from "@/lib/play-types";
import { focusState } from "@/lib/artifact-utils";
import { dampRef } from "@/lib/damp";

const DOT_FADE_LERP = 0.12; // vitesse de fondu des dots à l'entrée/sortie du focus

// ─── Background dots + click ripple ───────────────────────────────────────────
export function GridBackground({
  paramsRef,
  cameraStateRef,
  rippleRef,
}: {
  paramsRef: React.MutableRefObject<Params>;
  cameraStateRef: React.MutableRefObject<CameraState>;
  rippleRef: React.MutableRefObject<RippleState | null>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, size } = useThree();
  const dotFade = useRef(0); // 0 = dots visibles, 1 = complètement effacés (focus actif)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uGridSize: { value: DEFAULT_PARAMS.gridCell },
          uDotRadius: { value: DEFAULT_PARAMS.dotRadius },
          uRippleOrigin: { value: new THREE.Vector2(0, 0) },
          uRippleTime: { value: -1 },
          uRipplePixel: { value: DEFAULT_PARAMS.ripplePixel },
          uRippleSpeed: { value: DEFAULT_PARAMS.rippleSpeed },
          uRippleWidth: { value: DEFAULT_PARAMS.rippleWidth },
          uRippleDuration: { value: DEFAULT_PARAMS.rippleDuration },
          uDotFade: { value: 0 },
        },
        vertexShader: `
      varying vec2 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
        fragmentShader: `
      uniform float uGridSize;
      uniform float uDotRadius;
      uniform vec2 uRippleOrigin;
      uniform float uRippleTime;
      uniform float uRipplePixel;
      uniform float uRippleSpeed;
      uniform float uRippleWidth;
      uniform float uRippleDuration;
      uniform float uDotFade;
      varying vec2 vWorldPos;
      void main() {
        vec2 cell = mod(vWorldPos + uGridSize * 0.5, uGridSize) - uGridSize * 0.5;
        float dist = length(cell);
        float alpha = (1.0 - smoothstep(uDotRadius - 0.5, uDotRadius + 0.5, dist)) * (1.0 - uDotFade);

        // Pixel-art ripple: quantize world position into blocks BEFORE the
        // distance calc, so the ring expands in chunky steps, not a smooth circle.
        vec2 blocky = floor(vWorldPos / uRipplePixel) * uRipplePixel;
        float d = length(blocky - uRippleOrigin);
        float ring = smoothstep(uRippleWidth, 0.0, abs(d - uRippleTime * uRippleSpeed));
        float fade = clamp(1.0 - uRippleTime / uRippleDuration, 0.0, 1.0);
        float rippleAlpha = uRippleTime >= 0.0 ? ring * fade : 0.0;

        float finalAlpha = max(alpha, rippleAlpha);
        if (finalAlpha < 0.01) discard;
        vec3 dotColor = vec3(0.87, 0.86, 0.85);
        vec3 rippleColor = vec3(0.11, 0.098, 0.09);
        vec3 color = mix(dotColor, rippleColor, rippleAlpha);
        gl_FragColor = vec4(color, finalAlpha);
      }
    `,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  // Three.js material/mesh are mutable, GPU-backed objects driven every frame —
  // the standard R3F pattern (mutate in useFrame, don't set state).
  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    if (!meshRef.current) return;
    const q = paramsRef.current;
    const cam = camera as THREE.OrthographicCamera;
    material.uniforms.uGridSize.value = q.gridCell;
    material.uniforms.uDotRadius.value = q.dotRadius;
    material.uniforms.uRipplePixel.value = q.ripplePixel;
    material.uniforms.uRippleSpeed.value = q.rippleSpeed;
    material.uniforms.uRippleWidth.value = q.rippleWidth;
    material.uniforms.uRippleDuration.value = q.rippleDuration;
    // Dots s'effacent pendant le focus (voir focusState.isActive) — la grille
    // ne doit pas rivaliser visuellement avec le média/panel au premier plan.
    material.uniforms.uDotFade.value = dampRef(dotFade, focusState.isActive ? 1 : 0, DOT_FADE_LERP);

    const ripple = rippleRef.current;
    if (ripple) {
      material.uniforms.uRippleOrigin.value.set(ripple.x, ripple.y);
      material.uniforms.uRippleTime.value =
        performance.now() / 1000 - ripple.startTime;
    } else {
      material.uniforms.uRippleTime.value = -1;
    }

    const visW = size.width / cam.zoom;
    const visH = size.height / cam.zoom;
    meshRef.current.position.set(cam.position.x, cam.position.y, -10);
    meshRef.current.scale.set(visW * 4, visH * 4, 1);

    cameraStateRef.current.zoom = cam.zoom;
    cameraStateRef.current.x = cam.position.x;
    cameraStateRef.current.y = cam.position.y;
    cameraStateRef.current.width = size.width;
    cameraStateRef.current.height = size.height;
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh ref={meshRef} material={material} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
