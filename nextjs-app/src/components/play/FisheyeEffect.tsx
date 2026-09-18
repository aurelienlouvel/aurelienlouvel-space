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
uniform vec2 uResolution;

varying vec2 vUv;

// Formule officielle Three.js de conversion Linéaire vers sRGB (sRGBTransferOETF).
// Indispensable car les RenderTargets Three.js stockent les texels en espace linéaire.
vec3 linearToSRGB(vec3 color) {
  return mix(
    pow(color, vec3(0.41666)) * 1.055 - vec3(0.055),
    color * 12.92,
    vec3(lessThanEqual(color, vec3(0.0031308)))
  );
}

void main() {
  vec2 coord = (vUv - 0.5) * 2.0;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  coord.x *= aspect;

  float r2 = dot(coord, coord);
  float rCorner2 = aspect * aspect + 1.0;
  float normR2 = r2 / rCorner2;

  // Projection sphérique convexe (défilement sur un globe) :
  // Le centre est bombé vers l'avant, tandis que les bords
  // s'incurvent et s'éloignent vers l'horizon avec symétrie circulaire parfaite.
  float factor = (1.0 + uStrength * normR2) / (1.0 + uStrength);

  vec2 uv = vec2(coord.x * factor / aspect, coord.y * factor) * 0.5 + 0.5;

  vec3 rgb = vec3(1.0);
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
    vec4 col = texture2D(tDiffuse, uv);
    rgb = clamp(col.rgb, 0.0, 1.0);
  }

  // Conversion Linéaire -> sRGB pour retrouver exactement la luminosité,
  // les contrastes et les teintes naturelles du rendu canvas natif.
  gl_FragColor = vec4(linearToSRGB(rgb), 1.0);
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
  fisheye: { enabled: boolean; strength: number },
  width: number,
  height: number,
) {
  if (!fisheye.enabled || fisheye.strength <= 0.001) {
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    return;
  }

  // 1. Rendu de la scène principale dans le render target avec fond blanc pur
  gl.setRenderTarget(renderTarget);
  gl.setClearColor(0xffffff, 1.0);
  gl.clear();
  gl.render(scene, camera);

  // 2. Rendu de la distorsion globe plein écran sur le canvas
  gl.setRenderTarget(null);
  const u = material.uniforms;
  u.tDiffuse.value = renderTarget.texture;
  u.uStrength.value = fisheye.strength;
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

  // Matériau shader de post-processing fisheye convexe
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FISHEYE_VERTEX_SHADER,
        fragmentShader: FISHEYE_FRAGMENT_SHADER,
        uniforms: {
          tDiffuse: { value: null },
          uStrength: { value: 0 },
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
