"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";
import type { PlayDebugRef } from "./PlayCanvas";

const FISHEYE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FISHEYE_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uStrength;
uniform float uAberration;
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
  vec2 coord = (vUv - 0.5) * 2.0;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  coord.x *= aspect;

  float r2 = dot(coord, coord);

  // Distorsion sphérique barrel / fisheye avec légère aberration chromatique aux extrémités
  float factorG = 1.0 / (1.0 + uStrength * r2);
  float factorR = 1.0 / (1.0 + (uStrength * (1.0 + uAberration)) * r2);
  float factorB = 1.0 / (1.0 + (uStrength * (1.0 - uAberration)) * r2);

  vec2 uvG = vec2(coord.x * factorG / aspect, coord.y * factorG) * 0.5 + 0.5;
  vec2 uvR = vec2(coord.x * factorR / aspect, coord.y * factorR) * 0.5 + 0.5;
  vec2 uvB = vec2(coord.x * factorB / aspect, coord.y * factorB) * 0.5 + 0.5;

  vec4 colG = texture2D(tDiffuse, uvG);
  vec4 colR = texture2D(tDiffuse, uvR);
  vec4 colB = texture2D(tDiffuse, uvB);

  // Composite propre sur le fond blanc du canvas (#ffffff)
  vec3 rgb = vec3(
    mix(1.0, colR.r, colR.a),
    mix(1.0, colG.g, colG.a),
    mix(1.0, colB.b, colB.a)
  );

  gl_FragColor = vec4(rgb, 1.0);
}
`;

function renderFisheyePass(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  postScene: Scene,
  postCamera: OrthographicCamera,
  renderTarget: WebGLRenderTarget,
  material: ShaderMaterial,
  fisheye: { enabled: boolean; strength: number; aberration: number },
  width: number,
  height: number,
) {
  if (!fisheye.enabled || fisheye.strength <= 0.001) {
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    return;
  }

  // 1. Rendu de la scène principale dans le render target
  gl.setRenderTarget(renderTarget);
  gl.render(scene, camera);

  // 2. Rendu de la distorsion fisheye plein écran sur le canvas
  gl.setRenderTarget(null);
  const u = material.uniforms;
  u.tDiffuse.value = renderTarget.texture;
  u.uStrength.value = fisheye.strength;
  u.uAberration.value = fisheye.aberration;
  u.uResolution.value.set(width, height);
  gl.render(postScene, postCamera);
}

export function FisheyeEffect({ debug }: { debug: PlayDebugRef }) {
  const { gl, scene, camera, size } = useThree();

  // Création / redimensionnement du render target selon la taille écran et le DPR
  const renderTarget = useMemo(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(size.width * dpr));
    const h = Math.max(1, Math.round(size.height * dpr));
    return new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      type: HalfFloatType,
    });
  }, [size.width, size.height]);

  useEffect(() => {
    return () => {
      renderTarget.dispose();
    };
  }, [renderTarget]);

  // Matériau shader de post-processing fisheye
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FISHEYE_VERTEX_SHADER,
        fragmentShader: FISHEYE_FRAGMENT_SHADER,
        uniforms: {
          tDiffuse: { value: null },
          uStrength: { value: 0 },
          uAberration: { value: 0 },
          uResolution: { value: new Vector2(1, 1) },
        },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  // Scène plein écran pour la passe post-processing
  const { postScene, postCamera } = useMemo(() => {
    const s = new Scene();
    const c = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geom = new PlaneGeometry(2, 2);
    const quad = new Mesh(geom, material);
    s.add(quad);
    return { postScene: s, postCamera: c };
  }, [material]);

  // Passe de rendu post-process avec priorité 1 pour remplacer le rendu direct de R3F
  useFrame(() => {
    renderFisheyePass(
      gl,
      scene,
      camera,
      postScene,
      postCamera,
      renderTarget,
      material,
      debug.current.fisheye,
      size.width,
      size.height,
    );
  }, 1);

  return null;
}
