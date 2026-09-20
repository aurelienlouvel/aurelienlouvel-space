"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Vector2,
  SRGBColorSpace,
  TextureLoader,
  VideoTexture,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Texture,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from "three";
import type { ArtifactGalleryItem } from "@/sanity/queries";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import { setAppCursor } from "./ArtifactGrid";
import { buildImageUrl } from "@/lib/sanity-image";
import { fileRefToUrl } from "@/lib/sanity-utils";
import {
  attachUniforms,
  clampRadius,
  FRAME_DEFINES,
  GLSL_PIXEL_WIDTH,
  uniformsOf,
} from "./rounded-frame";

type SecondaryGalleryPlanesProps = {
  gallery: ArtifactGalleryItem[];
  principalPoint: { x: number; y: number; width: number; height: number } | null;
  primaryMedia: { url: string; kind: "image" | "video"; ratio: number };
  runtime: PlayRuntimeRef;
  debug: PlayDebugRef;
  gap?: number;
};

type PoolSlot = {
  key: string;
  url: string;
  kind: "image" | "video";
  ratio: number;
  galleryIdx: number;
  relativeIdx: number;
};

type PlaneUniforms = {
  uSize: IUniform<Vector2>;
  uRadius: IUniform<number>;
  uMotionBlur: IUniform<number>;
};

const ROUNDING_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform float uMotionBlur;

${GLSL_PIXEL_WIDTH}

/** SDF d'un rectangle arrondi centré sur l'origine, négative à l'intérieur. */
float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}
`;

const MOTION_BLUR_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if (uMotionBlur > 0.0008) {
    vec2 bStep = vec2(0.0, uMotionBlur);
    sampledDiffuseColor = sampledDiffuseColor * 0.22
      + texture2D( map, vMapUv + bStep * 0.35 ) * 0.19
      + texture2D( map, vMapUv - bStep * 0.35 ) * 0.19
      + texture2D( map, vMapUv + bStep * 0.70 ) * 0.12
      + texture2D( map, vMapUv - bStep * 0.70 ) * 0.12
      + texture2D( map, vMapUv + bStep * 1.05 ) * 0.08
      + texture2D( map, vMapUv - bStep * 1.05 ) * 0.08;
  }
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb + vec3( 0.055 ), vec3( 1.0 / 2.4 ) ) * vec3( 1.0 / 1.055 ), sampledDiffuseColor.rgb * vec3( 1.0 / 12.92 ), lessThan( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ), sampledDiffuseColor.a );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif

  vec2 framePoint = (vUv - 0.5) * uSize;
  float frameDistance = sdRoundedRect(framePoint, uSize * 0.5, uRadius);
  float frameEdge = pixelWidth(framePoint) * 0.5;
  diffuseColor.a *= 1.0 - smoothstep(-frameEdge, frameEdge, frameDistance);
`;

function roundCorners(
  this: MeshBasicMaterial,
  parameters: WebGLProgramParametersWithUniforms,
) {
  attachUniforms(this, parameters, {
    uSize: { value: new Vector2(1, 1) },
    uRadius: { value: 0 },
    uMotionBlur: { value: 0 },
  } satisfies PlaneUniforms);
  parameters.fragmentShader = parameters.fragmentShader
    .replace("#include <common>", `#include <common>\n${ROUNDING_PARS}`)
    .replace(
      "#include <map_fragment>",
      MOTION_BLUR_MAP,
    );
}

function roundCornersCacheKey() {
  return "play-secondary-planes-motion-blur";
}

// ── Cache global de textures vidéo partagées (1 seul élément vidéo HTML5 par URL) ──
const sharedVideoTextures = new Map<string, { texture: VideoTexture; video: HTMLVideoElement }>();

export function getOrCreateVideoTexture(url: string, colorSpace?: string): VideoTexture | null {
  if (!url) return null;
  const entry = sharedVideoTextures.get(url);
  if (entry) {
    if (entry.video.paused) {
      entry.video.play().catch(() => {});
    }
    return entry.texture;
  }

  if (typeof document === "undefined") return null;

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";
  video.src = url;
  video.play().catch(() => {});

  const texture = new VideoTexture(video);
  texture.colorSpace = (colorSpace as any) || SRGBColorSpace;
  sharedVideoTextures.set(url, { texture, video });
  return texture;
}

// ── Cache global de textures images ──
const sharedImageTextures = new Map<string, Texture>();
let globalTextureLoader: TextureLoader | null = null;

export function getOrCreateImageTexture(
  url: string,
  onLoad?: (texture: Texture) => void,
): Texture | null {
  if (!url) return null;
  const cached = sharedImageTextures.get(url);
  if (cached) return cached;

  if (typeof document === "undefined") return null;

  if (!globalTextureLoader) {
    globalTextureLoader = new TextureLoader();
    globalTextureLoader.setCrossOrigin("anonymous");
  }

  globalTextureLoader.load(
    url,
    (tex) => {
      tex.colorSpace = SRGBColorSpace;
      sharedImageTextures.set(url, tex);
      onLoad?.(tex);
    },
    undefined,
    () => {
      // Ignoré silencieusement pour ne pas bloquer le rendu
    },
  );
  return null;
}

/**
 * Enroulement modulaire sans faille pour scroller infini périodique.
 * Garantit qu'un item reste strictement dans l'intervalle [topLimit - span, topLimit].
 * Aucun saut, aucun clignotement, aucune boucle infinie.
 */
function wrapPeriodic(delta: number, span: number, topLimit: number): number {
  if (span <= 0) return delta;
  const offset = delta - topLimit;
  const wrapped = ((offset % span) + span) % span;
  return wrapped - span + topLimit;
}

type GallerySlotPlaneProps = {
  url: string;
  kind: "image" | "video";
  x: number;
  y: number;
  width: number;
  height: number;
  debug: PlayDebugRef;
  isMain?: boolean;
  fallbackTexture?: Texture | null;
  meshRef?: (mesh: Mesh | null) => void;
};

/**
 * Composant de carte 3D résilient :
 * NE SUSPEND JAMAIS React (aucun unmount intempestif, aucun trou blanc transparent).
 * Partage les textures vidéo pour éviter d'épuiser les décodeurs matériels du navigateur.
 */
function GallerySlotPlane({
  url,
  kind,
  x,
  y,
  width,
  height,
  debug,
  fallbackTexture,
  meshRef,
}: GallerySlotPlaneProps) {
  const { gl } = useThree();
  const localMeshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);

  const [tex, setTex] = useState<Texture | null>(() => {
    if (!url) return fallbackTexture ?? null;
    if (kind === "video") {
      return getOrCreateVideoTexture(url, gl.outputColorSpace) ?? fallbackTexture ?? null;
    }
    return getOrCreateImageTexture(url) ?? fallbackTexture ?? null;
  });

  useEffect(() => {
    if (!url) {
      setTex(fallbackTexture ?? null);
      return;
    }
    if (kind === "video") {
      const vTex = getOrCreateVideoTexture(url, gl.outputColorSpace);
      if (vTex) setTex(vTex);
    } else {
      const existing = getOrCreateImageTexture(url, (loaded) => {
        setTex(loaded);
      });
      if (existing) {
        setTex(existing);
      } else if (fallbackTexture && !tex) {
        setTex(fallbackTexture);
      }
    }
  }, [url, kind, fallbackTexture, gl.outputColorSpace]);

  useFrame(() => {
    const uniforms = uniformsOf<PlaneUniforms>(materialRef.current);
    if (uniforms) {
      const rawSx = localMeshRef.current ? localMeshRef.current.scale.x : width;
      const rawSy = localMeshRef.current ? localMeshRef.current.scale.y : height;
      const sx = Math.max(1, rawSx);
      const sy = Math.max(1, rawSy);
      uniforms.uSize.value.set(sx, sy);
      uniforms.uRadius.value = clampRadius(debug.current.plane.radius, sx, sy);
    }
  });

  function handleRef(mesh: Mesh | null) {
    localMeshRef.current = mesh;
    meshRef?.(mesh);
  }

  const activeTexture = tex ?? fallbackTexture ?? null;

  return (
    <mesh
      ref={handleRef}
      position={[x, y, 0]}
      scale={[width, height, 1]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setAppCursor("pointer");
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setAppCursor("auto");
      }}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={activeTexture ?? undefined}
        color={activeTexture ? "#ffffff" : "#1a1a1e"}
        transparent
        defines={FRAME_DEFINES}
        onBeforeCompile={roundCorners}
        customProgramCacheKey={roundCornersCacheKey}
      />
    </mesh>
  );
}

export function SecondaryGalleryPlanes({
  gallery,
  principalPoint,
  primaryMedia,
  runtime,
  debug,
  gap = 32,
}: SecondaryGalleryPlanesProps) {
  const { size, camera } = useThree();
  const groupRef = useRef<Group>(null);
  const meshRefs = useRef<(Mesh | null)[]>([]);

  // Détection responsive : desktop (>= 1024px et paysage) vs mobile
  const isDesktop = size.width >= 1024 && size.width >= size.height;

  // Préparation du pool symétrique d'items :
  // Le média principal (M0) est exactement au centre (centerSlotIdx, à anchorY).
  // Les slots s'étendent symétriquement vers le haut (offsets négatifs) et vers le bas (offsets positifs)
  // pour couvrir l'intégralité de l'écran dès la frame 0 sans aucun trou.
  const { pool, uniqueCount, totalCycles, centerSlotIdx, uniqueMedia } = useMemo(() => {
    if (!principalPoint) {
      return { pool: [], uniqueCount: 0, totalCycles: 0, centerSlotIdx: 0, uniqueMedia: [] };
    }

    const secondaryItems =
      gallery && gallery.length > 1 ? gallery.slice(1) : [];

    const uMedia: {
      url: string;
      kind: "image" | "video";
      ratio: number;
      galleryIdx: number;
    }[] = [
      {
        url: primaryMedia.url,
        kind: primaryMedia.kind,
        ratio: Math.max(0.2, primaryMedia.ratio),
        galleryIdx: 0,
      },
    ];

    for (let k = 0; k < secondaryItems.length; k++) {
      const item = secondaryItems[k];
      const isVideo = item._type === "galleryVideo";
      const url = isVideo
        ? (item.videoUrl || fileRefToUrl(item.videoRef) || "")
        : (item.imageRef
            ? buildImageUrl(item.imageRef, item.imageUrl ?? null, null, null, { width: 1400 })
            : (item.imageUrl ?? ""));

      const ratio =
        item.imageWidth && item.imageHeight
          ? item.imageWidth / item.imageHeight
          : isVideo
            ? 16 / 9
            : 1.5;

      if (url) {
        uMedia.push({
          url,
          kind: isVideo ? "video" : "image",
          ratio: Math.max(0.2, ratio),
          galleryIdx: k + 1,
        });
      }
    }

    const K = uMedia.length;
    // Estimation de la hauteur moyenne d'un cycle pour dimensionner le pool
    const approxCycleHeight = uMedia.reduce((acc, m) => acc + (450 / Math.max(0.3, m.ratio)) + 32, 0);
    // Couvre au moins 3600px de span vertical pour garantir un enroulement sans rupture
    const minCycles = Math.ceil(3600 / Math.max(300, approxCycleHeight));
    const baseCycles = Math.max(3, minCycles);
    // Nombre impair de cycles C garantissant une symétrie parfaite autour du slot central
    const C = baseCycles % 2 === 0 ? baseCycles + 1 : baseCycles;
    const halfCycles = Math.floor(C / 2);
    const totalSlots = C * K;
    const centerIdx = halfCycles * K;

    const slots: PoolSlot[] = [];
    for (let s = 0; s < totalSlots; s++) {
      const offset = s - centerIdx;
      const itemIdx = ((offset % K) + K) % K;
      const m = uMedia[itemIdx];
      slots.push({
        key: `slot-${s}-off${offset}-g${m.galleryIdx}`,
        url: m.url,
        kind: m.kind,
        ratio: m.ratio,
        galleryIdx: m.galleryIdx,
        relativeIdx: offset,
      });
    }

    return {
      pool: slots,
      uniqueCount: K,
      totalCycles: C,
      centerSlotIdx: centerIdx,
      uniqueMedia: uMedia,
    };
  }, [gallery, principalPoint, primaryMedia]);

  const lastTargetScrollYRef = useRef(0);
  const quietTimeRef = useRef(0);
  const prevScrollYRef = useRef(0);
  const motionBlurValRef = useRef(0);
  const lastPhaseRef = useRef<string>("idle");

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !principalPoint || pool.length === 0) return;

    const tr = runtime.current.transition;
    const frame = tr.frame;

    if (tr.phase !== "playing" && tr.phase !== "isolated" && tr.phase !== "returning") {
      group.visible = false;
      return;
    }
    group.visible = true;

    const cfg = debug.current.transition;
    const effectiveGap = cfg.mediaGap ?? gap;

    // ── Géométrie de la colonne, figée au zoom de destination ───────────────
    const refZoom = Math.max(0.01, debug.current.camera.zoom * cfg.detailZoom);
    const desktopWidthRatio = cfg.desktopMediaWidthRatio ?? 0.34;
    const mobileHeightRatio = cfg.mobileMediaHeightRatio ?? 0.48;

    let baseColWidth = 0;
    let baseColHeight = 0;
    if (isDesktop) {
      baseColWidth = Math.max(380, size.width * desktopWidthRatio) / refZoom;
    } else {
      baseColHeight = Math.max(260, size.height * mobileHeightRatio) / refZoom;
    }

    const K = Math.max(1, uniqueCount);
    const uniqueHeights: number[] = new Array(K);
    const uniqueWidths: number[] = new Array(K);

    for (let m = 0; m < K; m++) {
      const r = uniqueMedia[m]?.ratio ?? 1.5;
      if (isDesktop) {
        uniqueWidths[m] = baseColWidth;
        uniqueHeights[m] = baseColWidth / r;
      } else {
        uniqueHeights[m] = baseColHeight;
        uniqueWidths[m] = baseColHeight * r;
      }
    }

    let oneCycleHeight = 0;
    for (let m = 0; m < K; m++) {
      oneCycleHeight += uniqueHeights[m] + effectiveGap;
    }

    const totalPoolSpan = oneCycleHeight * totalCycles;

    // Positions de repos : M0 ancré au centre, la colonne se construit de part
    // et d'autre.
    const restingY: number[] = new Array(pool.length);
    restingY[centerSlotIdx] = principalPoint.y;

    for (let s = centerSlotIdx + 1; s < pool.length; s++) {
      const prevH = uniqueHeights[pool[s - 1].galleryIdx % K];
      const curH = uniqueHeights[pool[s].galleryIdx % K];
      restingY[s] = restingY[s - 1] - prevH * 0.5 - effectiveGap - curH * 0.5;
    }

    for (let s = centerSlotIdx - 1; s >= 0; s--) {
      const nextH = uniqueHeights[pool[s + 1].galleryIdx % K];
      const curH = uniqueHeights[pool[s].galleryIdx % K];
      restingY[s] = restingY[s + 1] + nextH * 0.5 + effectiveGap + curH * 0.5;
    }

    // ── Rouleau (Spin de la wheel basé sur le nombre de médias) ─────────────
    const spinCount = Math.max(1, cfg.spinMediaCount ?? 30);
    let spinDistance = 0;
    for (let i = 0; i < spinCount; i++) {
      spinDistance += uniqueHeights[i % K] + effectiveGap;
    }
    const scrollY = frame.scroll * spinDistance + tr.columnScrollY;

    // ── Calcul de la vélocité et du Motion Blur de la roue ─────────────────
    let deltaScroll = 0;
    if (lastPhaseRef.current !== tr.phase) {
      prevScrollYRef.current = scrollY;
      lastPhaseRef.current = tr.phase;
    } else if (delta > 0) {
      deltaScroll = (scrollY - prevScrollYRef.current) / delta;
      prevScrollYRef.current = scrollY;
    }

    const camCfg = debug.current.camera;
    const isBlurActive = camCfg.motionBlur ?? true;
    let targetBlur = 0;
    if (isBlurActive && (tr.phase === "playing" || tr.phase === "isolated")) {
      const speed = Math.abs(deltaScroll);
      const refCardH = Math.max(100, isDesktop ? baseColWidth / 1.5 : baseColHeight);
      const normSpeed = speed / refCardH;
      const blurStrength = camCfg.motionBlurStrength ?? 1.0;
      const blurMax = camCfg.motionBlurMax ?? 0.08;
      targetBlur = Math.min(blurMax, normSpeed * 0.0035 * blurStrength);
    }

    const smoothing = tr.phase === "playing" ? 25 : 15;
    motionBlurValRef.current +=
      (targetBlur - motionBlurValRef.current) * Math.min(1, delta * smoothing);
    if (motionBlurValRef.current < 0.0005) {
      motionBlurValRef.current = 0;
    }
    const currentMotionBlur = motionBlurValRef.current;

    const anchorY = principalPoint.y;
    const screenCenterY = camera.position.y;
    const visibleHalfH = (size.height / Math.max(0.1, camera.zoom)) * 0.5;
    const topLimit = anchorY + Math.max(visibleHalfH + 300, oneCycleHeight * 0.75);
    const screenTop = screenCenterY + visibleHalfH;
    const screenBottom = screenCenterY - visibleHalfH;

    // M0 part exactement de la tuile de la mosaïque
    const mainStartW = principalPoint.width * frame.tileScale;
    const mainStartH = principalPoint.height * frame.tileScale;

    pool.forEach((slot, s) => {
      const mesh = meshRefs.current[s];
      if (!mesh) return;

      const isMain = s === centerSlotIdx;
      const offset = slot.relativeIdx;

      let y = restingY[s] + scrollY;
      if (!isMain && frame.slide !== 0) {
        y += offset > 0 ? -frame.slide : frame.slide;
      }

      // À l'entrée, la colonne ne se déploie que vers le bas
      const gatedAbove =
        tr.phase === "playing" && offset < 0 && restingY[s] + scrollY <= topLimit;

      if (pool.length > 1 && totalPoolSpan > 100) {
        y = wrapPeriodic(y, totalPoolSpan, topLimit);
      }

      // ── Roue & Arc de cercle (Wheel Curvature) ──────────────────────────
      // L'image au centre est plus vers le centre de l'écran (gauche en paysage).
      // Les autres médias s'écartent vers l'extérieur et s'inclinent en rotation.
      const dy = y - screenCenterY;
      const normY = Math.max(-2, Math.min(2, dy / Math.max(1, visibleHalfH)));

      // Incurvation en arc (translation vers l'intérieur pour le centre, vers l'extérieur pour les bords)
      const arcCurve = cfg.arcCurvature ?? 140;
      const arcShift = -arcCurve * Math.max(0, 1 - normY * normY * 0.7);

      // Rotation vers l'extérieur de l'écran (gauche en paysage, haut en portrait)
      const arcAngleDeg = cfg.arcRotation ?? 12;
      const rotZ = isDesktop
        ? normY * ((arcAngleDeg * Math.PI) / 180)
        : -normY * ((arcAngleDeg * Math.PI) / 180);

      // Pendant la transition d'entrée, M0 part parfaitement droit et l'arc s'installe avec reveal
      const revealFactor = isMain ? frame.reveal : 1;
      const posX = principalPoint.x + arcShift * revealFactor;
      mesh.position.set(posX, y, 0);
      mesh.rotation.set(0, 0, rotZ * revealFactor);
      mesh.renderOrder = isMain ? 10 : 5;

      const curItemIdx = slot.galleryIdx % K;
      const targetW = uniqueWidths[curItemIdx];
      const targetH = uniqueHeights[curItemIdx];

      // M0 : taille de tuile → taille de colonne, piloté par la piste `reveal`.
      const drawW = isMain ? mainStartW + (targetW - mainStartW) * frame.reveal : targetW;
      const drawH = isMain ? mainStartH + (targetH - mainStartH) * frame.reveal : targetH;
      mesh.scale.set(drawW, drawH, 1);

      // Fondu doux aux extrémités de l'écran
      const fadeZone = Math.max(100, drawH * 0.35);
      const cardTop = y + drawH * 0.5;
      const cardBottom = y - drawH * 0.5;
      let edgeFade = 1;
      if (cardBottom < screenBottom + fadeZone) {
        edgeFade = Math.max(0, Math.min(1, (cardTop - screenBottom) / fadeZone));
      } else if (cardTop > screenTop - fadeZone) {
        edgeFade = Math.max(0, Math.min(1, (screenTop - cardBottom) / fadeZone));
      }

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        const uniforms = uniformsOf<PlaneUniforms>(mat);
        if (uniforms && uniforms.uMotionBlur) {
          uniforms.uMotionBlur.value = currentMotionBlur;
        }
        if (gatedAbove) {
          mat.opacity = 0;
        } else if (isMain) {
          mat.opacity = edgeFade;
        } else {
          mat.opacity = frame.columnOpacity * edgeFade;
        }
      }
    });

    // ── Système magnétique de snap au centre (Focus mode) ───────────────────
    if (tr.phase === "isolated" && cfg.snapEnabled) {
      const scrollDiff = Math.abs(tr.targetColumnScrollY - lastTargetScrollYRef.current);
      lastTargetScrollYRef.current = tr.targetColumnScrollY;

      if (scrollDiff > 0.05) {
        quietTimeRef.current = 0;
      } else {
        quietTimeRef.current += delta;
      }

      const snapDelay = cfg.snapDelay ?? 0.15;
      if (quietTimeRef.current >= snapDelay) {
        const currentSpeed = Math.abs(tr.columnScrollY - tr.targetColumnScrollY);
        if (currentSpeed < 12) {
          // Trouver le média le plus proche du centre vertical (screenCenterY)
          let closestOffset = Infinity;
          pool.forEach((_, s) => {
            const m = meshRefs.current[s];
            if (!m) return;
            const dist = m.position.y - screenCenterY;
            if (Math.abs(dist) < Math.abs(closestOffset)) {
              closestOffset = dist;
            }
          });

          if (
            Math.abs(closestOffset) > 0.8 &&
            Math.abs(closestOffset) < oneCycleHeight * 0.5
          ) {
            const snapSpeed = Math.max(1, cfg.snapStrength ?? 10);
            tr.targetColumnScrollY -= closestOffset * Math.min(1, delta * snapSpeed);
          }
        }
      }
    } else {
      quietTimeRef.current = 0;
      lastTargetScrollYRef.current = tr.targetColumnScrollY;
    }
  });

  if (!principalPoint || pool.length === 0) {
    return null;
  }

  return (
    <group ref={groupRef} visible={false}>
      {pool.map((item, idx) => (
        <GallerySlotPlane
          key={item.key}
          url={item.url}
          kind={item.kind}
          x={principalPoint.x}
          y={principalPoint.y}
          width={principalPoint.width}
          height={principalPoint.height}
          debug={debug}
          isMain={idx === centerSlotIdx}
          meshRef={(mesh) => {
            meshRefs.current[idx] = mesh;
          }}
        />
      ))}
    </group>
  );
}
