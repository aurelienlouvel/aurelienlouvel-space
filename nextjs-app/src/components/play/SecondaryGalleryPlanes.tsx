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
import { buildImageUrl } from "@/lib/sanity-image";
import { fileRefToUrl } from "@/lib/sanity-utils";
import { thumbnailRatio } from "@/lib/thumbnail-ratios";
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
  uMotionBlurDir: IUniform<Vector2>;
};

const ROUNDING_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform float uMotionBlur;
uniform vec2 uMotionBlurDir;

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
    vec2 bStep = uMotionBlurDir * uMotionBlur;
    sampledDiffuseColor = sampledDiffuseColor * 0.22
      + texture2D( map, vMapUv + bStep * 0.35 ) * 0.19
      + texture2D( map, vMapUv - bStep * 0.35 ) * 0.19
      + texture2D( map, vMapUv + bStep * 0.70 ) * 0.12
      + texture2D( map, vMapUv - bStep * 0.70 ) * 0.12
      + texture2D( map, vMapUv + bStep * 1.05 ) * 0.08
      + texture2D( map, vMapUv - bStep * 1.05 ) * 0.08;
  }
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
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
    uMotionBlurDir: { value: new Vector2(0, 1) },
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
export const sharedVideoDimensions = new Map<string, { width: number; height: number; ratio: number }>();

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
  video.onloadedmetadata = () => {
    if (video.videoWidth && video.videoHeight) {
      sharedVideoDimensions.set(url, {
        width: video.videoWidth,
        height: video.videoHeight,
        ratio: video.videoWidth / video.videoHeight,
      });
    }
  };
  video.play().catch(() => {});

  const texture = new VideoTexture(video);
  texture.colorSpace = (colorSpace as any) || SRGBColorSpace;
  sharedVideoTextures.set(url, { texture, video });
  return texture;
}

const sharedImageTextures = new Map<string, Texture>();
let globalTextureLoader: TextureLoader | null = null;

export function registerSharedImageTexture(url: string, texture: Texture) {
  if (url && texture) {
    sharedImageTextures.set(url, texture);
  }
}

export function registerSharedVideoTexture(
  url: string,
  texture: Texture,
) {
  if (url && texture && (texture as any).isVideoTexture) {
    const vt = texture as VideoTexture;
    const vid = vt.image as HTMLVideoElement;
    if (vid) {
      sharedVideoTextures.set(url, { texture: vt, video: vid });
    }
  }
}

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
      tex.needsUpdate = true;
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
    if (fallbackTexture) return fallbackTexture;
    if (!url) return null;
    if (kind === "video") {
      return (
        sharedVideoTextures.get(url)?.texture ??
        getOrCreateVideoTexture(url, gl.outputColorSpace) ??
        null
      );
    }
    return (
      sharedImageTextures.get(url) ??
      getOrCreateImageTexture(url) ??
      null
    );
  });

  useEffect(() => {
    if (!url) {
      if (fallbackTexture) setTex(fallbackTexture);
      return;
    }
    if (kind === "video") {
      const vTex =
        sharedVideoTextures.get(url)?.texture ??
        getOrCreateVideoTexture(url, gl.outputColorSpace);
      if (vTex) setTex(vTex);
    } else {
      const existing =
        sharedImageTextures.get(url) ??
        getOrCreateImageTexture(url, (loaded) => {
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

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.needsUpdate = true;
    }
  }, [activeTexture]);

  return (
    <mesh
      ref={handleRef}
      position={[x, y, 0]}
      scale={[width, height, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={activeTexture ?? undefined}
        color={activeTexture ? "#ffffff" : "#000000"}
        opacity={activeTexture ? 1 : 0}
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

  // Pause les vidéos partagées au démontage pour libérer les décodeurs matériels
  useEffect(() => {
    return () => {
      sharedVideoTextures.forEach(({ video }) => {
        try {
          if (!video.paused) {
            video.pause();
          }
        } catch {}
      });
    };
  }, []);

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

    const primaryDyn = sharedVideoDimensions.get(primaryMedia.url)?.ratio;
    const uMedia: {
      url: string;
      kind: "image" | "video";
      ratio: number;
      galleryIdx: number;
    }[] = [
      {
        url: primaryMedia.url,
        kind: primaryMedia.kind,
        ratio: Math.max(0.2, primaryDyn ?? primaryMedia.ratio),
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

      let ratio = 1.5;
      if (item.imageWidth && item.imageHeight) {
        ratio = item.imageWidth / item.imageHeight;
      } else if (isVideo) {
        if (item.videoRef) {
          ratio = thumbnailRatio(item.videoRef);
        } else {
          ratio = 16 / 9;
        }
      }

      if (url) {
        const dyn = sharedVideoDimensions.get(url)?.ratio;
        uMedia.push({
          url,
          kind: isVideo ? "video" : "image",
          ratio: Math.max(0.2, dyn ?? ratio),
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
  const isSnappingRef = useRef(false);
  const exitSlotRef = useRef<number>(-1);
  const exitStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const exitStartRotRef = useRef<number>(0);
  const exitStartScaleRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !principalPoint || pool.length === 0) return;

    const tr = runtime.current.transition;
    const frame = tr.frame;

    if (tr.phase !== "playing" && tr.phase !== "isolated" && tr.phase !== "returning") {
      group.visible = false;
      return;
    }
    // Pendant la phase playing avant le début de reveal (pause 0.6s + lock micro-animation),
    // la tuile reste affichée dans ArtifactGrid : aucun conflit, Z-fighting ou clignotement.
    if (tr.phase === "playing" && frame.reveal < 0.001) {
      group.visible = false;
      return;
    }
    group.visible = true;

    const isPortrait = !isDesktop;
    const cfg = debug.current.transition;
    const effectiveGap = cfg.mediaGap ?? gap;

    // ── Géométrie de la colonne / ligne et contain-fit avec marges d'écran garanties ──
    const curZoom = Math.max(0.1, camera.zoom);
    const screenW = size.width / curZoom;
    const screenH = size.height / curZoom;

    // Bornes maximales avec marges confortables quel que soit le ratio (portrait, paysage, carré) :
    // - En paysage (desktop) : max 38% largeur, max 74% hauteur (au moins 13% de marge en haut et en bas).
    // - En portrait (mobile) : max 72% largeur, max 34% hauteur (reste strictement dans la moitié haute sans toucher le haut).
    const maxW = isDesktop
      ? screenW * (cfg.maxMediaWidthRatio ?? 0.38)
      : screenW * (cfg.desktopMediaWidthRatio ?? 0.72);
    const maxH = isDesktop
      ? screenH * (cfg.maxMediaHeightRatio ?? 0.74)
      : screenH * (cfg.mobileMediaHeightRatio ?? 0.34);

    const K = Math.max(1, uniqueCount);
    const uniqueHeights: number[] = new Array(K);
    const uniqueWidths: number[] = new Array(K);

    for (let m = 0; m < K; m++) {
      const itemUrl = uniqueMedia[m]?.url;
      const dynRatio = itemUrl ? sharedVideoDimensions.get(itemUrl)?.ratio : undefined;
      const r = dynRatio ?? uniqueMedia[m]?.ratio ?? 1.5;
      if (isPortrait) {
        let h = maxH;
        let w = h * r;
        if (w > maxW) {
          w = maxW;
          h = w / r;
        }
        uniqueWidths[m] = w;
        uniqueHeights[m] = h;
      } else {
        let w = maxW;
        let h = w / r;
        if (h > maxH) {
          h = maxH;
          w = h * r;
        }
        uniqueWidths[m] = w;
        uniqueHeights[m] = h;
      }
    }

    let oneCycleSpan = 0;
    for (let m = 0; m < K; m++) {
      oneCycleSpan += (isPortrait ? uniqueWidths[m] : uniqueHeights[m]) + effectiveGap;
    }

    const totalPoolSpan = oneCycleSpan * totalCycles;

    // Positions de repos : M0 ancré au centre, la ligne/colonne se construit de part et d'autre.
    const restingPos: number[] = new Array(pool.length);
    restingPos[centerSlotIdx] = isPortrait ? principalPoint.x : principalPoint.y;

    for (let s = centerSlotIdx + 1; s < pool.length; s++) {
      const prevDim = isPortrait
        ? uniqueWidths[pool[s - 1].galleryIdx % K]
        : uniqueHeights[pool[s - 1].galleryIdx % K];
      const curDim = isPortrait
        ? uniqueWidths[pool[s].galleryIdx % K]
        : uniqueHeights[pool[s].galleryIdx % K];
      if (isPortrait) {
        restingPos[s] = restingPos[s - 1] + prevDim * 0.5 + effectiveGap + curDim * 0.5;
      } else {
        restingPos[s] = restingPos[s - 1] - prevDim * 0.5 - effectiveGap - curDim * 0.5;
      }
    }

    for (let s = centerSlotIdx - 1; s >= 0; s--) {
      const nextDim = isPortrait
        ? uniqueWidths[pool[s + 1].galleryIdx % K]
        : uniqueHeights[pool[s + 1].galleryIdx % K];
      const curDim = isPortrait
        ? uniqueWidths[pool[s].galleryIdx % K]
        : uniqueHeights[pool[s].galleryIdx % K];
      if (isPortrait) {
        restingPos[s] = restingPos[s + 1] - nextDim * 0.5 - effectiveGap - curDim * 0.5;
      } else {
        restingPos[s] = restingPos[s + 1] + nextDim * 0.5 + effectiveGap + curDim * 0.5;
      }
    }

    const anchorCoord = isPortrait ? principalPoint.x : principalPoint.y;
    const screenCenterCoord = isPortrait ? camera.position.x : camera.position.y;
    const visibleHalfCoord = ((isPortrait ? size.width : size.height) / Math.max(0.1, camera.zoom)) * 0.5;
    const boundLimit = anchorCoord + Math.max(visibleHalfCoord + 300, oneCycleSpan * 0.75);
    const screenMin = screenCenterCoord - visibleHalfCoord;
    const screenMax = screenCenterCoord + visibleHalfCoord;

    // ── Rouleau (Spin de la wheel basé sur le nombre de médias) ─────────────
    const spinCount = Math.max(1, Math.round(cfg.spinMediaCount ?? 30));
    const fullCycles = Math.floor(spinCount / K);
    const remainder = spinCount % K;
    const targetSlot = centerSlotIdx + remainder;
    const subDistance =
      targetSlot < pool.length
        ? Math.abs(restingPos[centerSlotIdx] - restingPos[targetSlot])
        : 0;
    const baseDistance = fullCycles * oneCycleSpan + subDistance;
    const spinDistance = baseDistance + (screenCenterCoord - anchorCoord);
    const scrollOffset = frame.scroll * spinDistance + tr.columnScrollY;

    // ── Calcul de la vélocité et du Motion Blur de la roue ─────────────────
    let deltaScroll = 0;
    if (lastPhaseRef.current !== tr.phase) {
      if (tr.phase === "returning") {
        // Détecter l'itération de M0 (slot.galleryIdx === 0) la plus proche du centre écran
        let closestSlot = centerSlotIdx;
        let minDistance = Infinity;

        pool.forEach((slot, s) => {
          if (slot.galleryIdx === 0) {
            const m = meshRefs.current[s];
            if (m) {
              const curCoord = isPortrait ? m.position.x : m.position.y;
              const dist = Math.abs(curCoord - screenCenterCoord);
              if (dist < minDistance) {
                minDistance = dist;
                closestSlot = s;
              }
            }
          }
        });

        exitSlotRef.current = closestSlot;
        const chosenMesh = meshRefs.current[closestSlot];
        if (chosenMesh) {
          exitStartPosRef.current = {
            x: chosenMesh.position.x,
            y: chosenMesh.position.y,
          };
          exitStartRotRef.current = chosenMesh.rotation.z;
          exitStartScaleRef.current = {
            w: chosenMesh.scale.x,
            h: chosenMesh.scale.y,
          };
        } else {
          exitStartPosRef.current = {
            x: principalPoint.x,
            y: principalPoint.y,
          };
          exitStartRotRef.current = 0;
          exitStartScaleRef.current = {
            w: principalPoint.width,
            h: principalPoint.height,
          };
        }
      } else {
        exitSlotRef.current = centerSlotIdx;
      }
      prevScrollYRef.current = scrollOffset;
      lastPhaseRef.current = tr.phase;
    } else if (delta > 0) {
      deltaScroll = (scrollOffset - prevScrollYRef.current) / delta;
      prevScrollYRef.current = scrollOffset;
    }

    const camCfg = debug.current.camera;
    const isBlurActive = camCfg.motionBlur ?? true;
    let targetBlur = 0;
    if (isBlurActive && (tr.phase === "playing" || tr.phase === "isolated")) {
      const speed = Math.abs(deltaScroll);
      const refCardDim = isPortrait
        ? Math.max(100, uniqueWidths[0] ?? maxW)
        : Math.max(100, uniqueHeights[0] ?? maxH);
      const normSpeed = speed / refCardDim;
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

    // M0 part de la tuile de la mosaïque, sans jamais dépasser maxW ou maxH
    const mainStartW = Math.min(maxW, principalPoint.width * frame.tileScale);
    const mainStartH = Math.min(maxH, principalPoint.height * frame.tileScale);

    pool.forEach((slot, s) => {
      const mesh = meshRefs.current[s];
      if (!mesh) return;

      // Pendant la phase returning, isMain désigne l'itération la plus proche de M0
      const isMain = tr.phase === "returning"
        ? s === exitSlotRef.current
        : s === centerSlotIdx;

      // Pendant la phase returning, masquer immédiatement toute autre itération de M0
      // pour garantir qu'un SEUL média M0 n'est visible et retourne sur sa tuile d'origine.
      if (tr.phase === "returning" && slot.galleryIdx === 0 && !isMain) {
        mesh.visible = false;
        const mat = mesh.material as MeshBasicMaterial | undefined;
        if (mat) mat.opacity = 0;
        return;
      }

      // M0 est toujours visible dès t = 0 dans SecondaryGalleryPlanes.
      // Les cartes secondaires ne s'affichent qu'au déploiement de la colonne.
      mesh.visible = true;
      const offset = slot.relativeIdx;

      let primaryPos = isPortrait
        ? restingPos[s] - scrollOffset
        : restingPos[s] + scrollOffset;

      if (!isMain && frame.slide !== 0) {
        primaryPos += offset > 0 ? -frame.slide : frame.slide;
      }

      // À l'entrée, les cartes secondaires ne se déploient que dans le sens d'arrivée
      const gated =
        tr.phase === "playing" && offset < 0 && (
          isPortrait
            ? restingPos[s] - scrollOffset >= boundLimit
            : restingPos[s] + scrollOffset <= boundLimit
        );

      if (pool.length > 1 && totalPoolSpan > 100) {
        primaryPos = wrapPeriodic(primaryPos, totalPoolSpan, boundLimit);
      }

      // ── Incurvation en arc et rotation de la roue ───────────────────────────
      const deltaFromCenter = primaryPos - screenCenterCoord;
      const normCoord = Math.max(-2, Math.min(2, deltaFromCenter / Math.max(1, visibleHalfCoord)));

      // Arc :
      // En paysage : translation X vers l'intérieur (gauche si curve < 0)
      // En portrait : translation Y vers le centre de la page en bas
      const arcCurve = isPortrait
        ? (cfg.portraitArcCurvature ?? 50)
        : (cfg.arcCurvature ?? 140);
      const arcShift = -arcCurve * Math.max(0, 1 - normCoord * normCoord * 0.7);

      const arcAngleDeg = cfg.arcRotation ?? (isPortrait ? 8 : 12);
      const rotZ = isPortrait
        ? normCoord * ((arcAngleDeg * Math.PI) / 180)
        : normCoord * ((arcAngleDeg * Math.PI) / 180);

      // M0 ne s'incurve et ne tourne que lorsque la roue est réellement en mouvement (scroll ou navigation libre).
      // Pendant la confirmation de lock, l'expansion hero et le temps de pause, il reste parfaitement droit et centré.
      const wheelActive = frame.scroll > 0.001 || tr.columnScrollY !== 0 || tr.phase === "isolated";
      const curveAmount = isMain
        ? (tr.phase === "returning" ? frame.reveal : (wheelActive ? Math.min(1, frame.scroll * 5) : 0))
        : 1;

      let posX = isPortrait ? primaryPos : (principalPoint.x + arcShift * curveAmount);
      let posY = isPortrait ? (principalPoint.y + arcShift * curveAmount) : primaryPos;

      // Pendant la phase de retour (exit), l'itération la plus proche de M0 rejoint
      // de façon continue et fluide sa tuile d'origine sur la mosaïque, sans aucun saut ni spin.
      if (isMain && tr.phase === "returning") {
        const rev = frame.reveal; // 1 -> 0
        const startX = exitStartPosRef.current.x;
        const startY = exitStartPosRef.current.y;
        posX = principalPoint.x + (startX - principalPoint.x) * rev;
        posY = principalPoint.y + (startY - principalPoint.y) * rev;
      }

      const rotToApply = isMain && tr.phase === "returning"
        ? exitStartRotRef.current * frame.reveal
        : rotZ * curveAmount;
      mesh.position.set(posX, posY, isMain ? 0.01 : 0);
      mesh.rotation.set(0, 0, rotToApply);
      mesh.renderOrder = isMain ? 10 : 5;

      const curItemIdx = slot.galleryIdx % K;
      const targetW = uniqueWidths[curItemIdx];
      const targetH = uniqueHeights[curItemIdx];

      // M0 :
      // - À l'aller : taille de tuile → taille de colonne/ligne, piloté par la piste `reveal`.
      // - Au retour : taille actuelle sur la wheel → taille de la tuile sur la mosaïque, piloté par `reveal` (1 -> 0).
      let drawW = targetW;
      let drawH = targetH;
      if (isMain) {
        if (tr.phase === "returning") {
          const startW = exitStartScaleRef.current.w;
          const startH = exitStartScaleRef.current.h;
          drawW = principalPoint.width + (startW - principalPoint.width) * frame.reveal;
          drawH = principalPoint.height + (startH - principalPoint.height) * frame.reveal;
        } else {
          drawW = mainStartW + (targetW - mainStartW) * frame.reveal;
          drawH = mainStartH + (targetH - mainStartH) * frame.reveal;
        }
      }
      mesh.scale.set(drawW, drawH, 1);

      // Fondu doux aux extrémités de l'écran
      const fadeZone = Math.max(100, (isPortrait ? drawW : drawH) * 0.35);
      const cardMin = isPortrait ? posX - drawW * 0.5 : posY - drawH * 0.5;
      const cardMax = isPortrait ? posX + drawW * 0.5 : posY + drawH * 0.5;
      let edgeFade = 1;
      if (cardMin < screenMin + fadeZone) {
        edgeFade = Math.max(0, Math.min(1, (cardMax - screenMin) / fadeZone));
      } else if (cardMax > screenMax - fadeZone) {
        edgeFade = Math.max(0, Math.min(1, (screenMax - cardMin) / fadeZone));
      }

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        const uniforms = uniformsOf<PlaneUniforms>(mat);
        if (uniforms) {
          if (uniforms.uMotionBlur) uniforms.uMotionBlur.value = currentMotionBlur;
          if (uniforms.uMotionBlurDir) uniforms.uMotionBlurDir.value.set(isPortrait ? 1 : 0, isPortrait ? 0 : 1);
        }
        if (gated) {
          mat.opacity = 0;
        } else if (isMain) {
          // Pendant playing et returning, M0 est le média focalisé et reste toujours 100% opaque sans fondu d'arête
          mat.opacity = (tr.phase === "playing" || tr.phase === "returning") ? 1 : edgeFade;
        } else {
          mat.opacity = frame.columnOpacity * edgeFade;
        }
      }
    });

    // ── Système magnétique de snap au centre (Focus mode) ───────────────────
    if (tr.phase === "isolated" && cfg.snapEnabled) {
      const scrollDiff = Math.abs(tr.targetColumnScrollY - lastTargetScrollYRef.current);

      if (scrollDiff > 0.5) {
        // L'utilisateur scroll manuellement (roulette ou drag) : on coupe tout snap en cours
        isSnappingRef.current = false;
        tr.isSnapping = false;
        quietTimeRef.current = 0;
        lastTargetScrollYRef.current = tr.targetColumnScrollY;
      } else if (isSnappingRef.current) {
        // Snap en cours : maintient la référence à jour et vérifie la convergence
        lastTargetScrollYRef.current = tr.targetColumnScrollY;
        const remaining = Math.abs(tr.columnScrollY - tr.targetColumnScrollY);
        if (remaining < 0.5) {
          isSnappingRef.current = false;
          tr.isSnapping = false;
          quietTimeRef.current = 0;
        }
      } else {
        quietTimeRef.current += delta;
        lastTargetScrollYRef.current = tr.targetColumnScrollY;

        const snapDelay = cfg.snapDelay ?? 0.14;
        const currentSpeed = Math.abs(tr.columnScrollY - tr.targetColumnScrollY);
        if (quietTimeRef.current >= snapDelay && currentSpeed < 4) {
          // Trouver le média le plus proche du centre (screenCenterX en portrait, screenCenterY en paysage)
          let closestOffset = Infinity;
          pool.forEach((_, s) => {
            const m = meshRefs.current[s];
            if (!m) return;
            const dist = isPortrait
              ? m.position.x - screenCenterCoord
              : m.position.y - screenCenterCoord;
            if (Math.abs(dist) < Math.abs(closestOffset)) {
              closestOffset = dist;
            }
          });

          if (
            Math.abs(closestOffset) > 1.0 &&
            Math.abs(closestOffset) < oneCycleSpan * 0.5
          ) {
            // Déclenchement EN UN SEUL À-COUP
            if (isPortrait) {
              tr.targetColumnScrollY += closestOffset;
            } else {
              tr.targetColumnScrollY -= closestOffset;
            }
            lastTargetScrollYRef.current = tr.targetColumnScrollY;
            isSnappingRef.current = true;
            tr.isSnapping = true;
          }
        }
      }
    } else {
      quietTimeRef.current = 0;
      isSnappingRef.current = false;
      tr.isSnapping = false;
      lastTargetScrollYRef.current = tr.targetColumnScrollY;
    }
  });

  if (!principalPoint || pool.length === 0) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {pool.map((item, idx) => {
        const isCenter = idx === centerSlotIdx;
        const fallbackTex =
          item.kind === "video"
            ? (sharedVideoTextures.get(item.url)?.texture ?? null)
            : (sharedImageTextures.get(item.url) ?? null);

        return (
          <GallerySlotPlane
            key={isCenter ? "main-slot-m0" : item.key}
            url={item.url}
            kind={item.kind}
            x={principalPoint.x}
            y={principalPoint.y}
            width={principalPoint.width}
            height={principalPoint.height}
            debug={debug}
            isMain={isCenter}
            fallbackTexture={fallbackTex}
            meshRef={(mesh) => {
              meshRefs.current[idx] = mesh;
            }}
          />
        );
      })}
    </group>
  );
}
