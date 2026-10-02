"use client";

import { useRef, useMemo, useState, useEffect, type MutableRefObject } from "react";
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
import { fileRefToUrl, playMediaUrl } from "@/lib/sanity-utils";
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
  /** Notifié quand le média le plus proche du centre de l'écran change (wheel). */
  onFocusMedia?: (media: { url: string; kind: "image" | "video" }) => void;
  /** Poids (0..1) de chaque carte visible, mutés à chaque frame : alimente le dégradé. */
  weightsRef?: MutableRefObject<{ url: string; kind: "image" | "video"; w: number }[]>;
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

/** Élément vidéo partagé d'une url, s'il existe déjà. */
export function getSharedVideoElement(url: string): HTMLVideoElement | null {
  return sharedVideoTextures.get(url)?.video ?? null;
}

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
  onFocusMedia,
  weightsRef,
}: SecondaryGalleryPlanesProps) {
  const { size, camera } = useThree();
  const groupRef = useRef<Group>(null);
  const meshRefs = useRef<(Mesh | null)[]>([]);

  // Les vidéos partagées (mosaïque comprise) ne doivent jamais s'arrêter : au
  // montage comme au démontage (React StrictMode rejoue l'effet), on relance
  // celles qu'un cycle précédent aurait mises en pause.
  useEffect(() => {
    const resume = () =>
      sharedVideoTextures.forEach(({ video }) => {
        if (video.paused) video.play().catch(() => {});
      });
    resume();
    return resume;
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
      const url = playMediaUrl(
        isVideo
          ? (item.videoUrl || fileRefToUrl(item.videoRef) || "")
          : (item.imageRef
              ? buildImageUrl(item.imageRef, item.imageUrl ?? null, null, null, { width: 1400 })
              : (item.imageUrl ?? "")),
      );

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
    const C = 1;
    void baseCycles;
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

  const lastPhaseRef = useRef<string>("idle");
  const onFocusMediaRef = useRef(onFocusMedia);
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    onFocusMediaRef.current = onFocusMedia;
  }, [onFocusMedia]);
  const exitStartRef = useRef({ x: 0, y: 0, w: 0, h: 0, op: 1 });

  // Entrées de poids partagées avec le dégradé du panneau (mutées en place).
  const weightEntries = useMemo(
    () => uniqueMedia.map((m) => ({ url: m.url, kind: m.kind, w: 0 })),
    [uniqueMedia],
  );
  useEffect(() => {
    if (weightsRef) weightsRef.current = weightEntries;
  }, [weightsRef, weightEntries]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !principalPoint || pool.length === 0) return;

    const tr = runtime.current.transition;
    const frame = tr.frame;

    if (tr.phase !== "playing" && tr.phase !== "isolated" && tr.phase !== "returning") {
      group.visible = false;
      return;
    }
    // Avant le reveal, la tuile reste affichée par ArtifactGrid : pas de doublon.
    if (tr.phase === "playing" && frame.reveal < 0.001) {
      group.visible = false;
      return;
    }
    // Entrée annulée avant le réveil : la tuile de la mosaïque n'a jamais été remplacée.
    if (tr.phase === "returning" && tr.returnFrom && tr.returnFrom.reveal < 0.001) {
      group.visible = false;
      return;
    }
    group.visible = true;

    const isPortrait = !isDesktop;
    const cfg = debug.current.transition;

    const curZoom = Math.max(0.1, camera.zoom);
    const screenW = size.width / curZoom;
    const screenH = size.height / curZoom;

    const maxW = isDesktop
      ? screenW * (cfg.maxMediaWidthRatio ?? 0.38)
      : screenW * (cfg.desktopMediaWidthRatio ?? 0.72);
    const maxH = isDesktop
      ? screenH * (cfg.maxMediaHeightRatio ?? 0.74)
      : screenH * (cfg.mobileMediaHeightRatio ?? 0.34);

    const K = Math.max(1, uniqueCount);
    const widths: number[] = new Array(K);
    const heights: number[] = new Array(K);
    for (let m = 0; m < K; m++) {
      const itemUrl = uniqueMedia[m]?.url;
      const dynRatio = itemUrl ? sharedVideoDimensions.get(itemUrl)?.ratio : undefined;
      const r = dynRatio ?? uniqueMedia[m]?.ratio ?? 1.5;
      let w: number;
      let h: number;
      if (isPortrait) {
        h = maxH;
        w = h * r;
        if (w > maxW) {
          w = maxW;
          h = w / r;
        }
      } else {
        w = maxW;
        h = w / r;
        if (h > maxH) {
          h = maxH;
          w = h * r;
        }
      }
      widths[m] = w;
      heights[m] = h;
    }

    if (lastPhaseRef.current !== tr.phase) {
      if (tr.phase === "returning") {
        const m0 = meshRefs.current[0];
        const mat0 = m0?.material as MeshBasicMaterial | undefined;
        exitStartRef.current = m0
          ? {
              x: m0.position.x,
              y: m0.position.y,
              w: m0.scale.x,
              h: m0.scale.y,
              op: m0.visible ? (mat0?.opacity ?? 1) : 0,
            }
          : { x: principalPoint.x, y: principalPoint.y, w: principalPoint.width, h: principalPoint.height, op: 1 };
      }
      lastPhaseRef.current = tr.phase;
    }

    const deckPos = tr.columnScrollY;
    const stackScale = cfg.stackScale ?? 0.9;
    const peek = (cfg.stackPeek ?? 22) / curZoom;
    const depthMax = cfg.stackDepth ?? 3;
    const exitTravel = screenH * 0.5 * (cfg.cardExit ?? 0.7);

    const mainStartW = Math.min(maxW, principalPoint.width * frame.tileScale);
    const mainStartH = Math.min(maxH, principalPoint.height * frame.tileScale);

    pool.forEach((slot, s) => {
      const mesh = meshRefs.current[s];
      if (!mesh) return;
      const isMain = s === 0;
      const i = slot.galleryIdx % K;

      // Profondeur cyclique signée : 0 = carte du dessus, >0 = derrière, <0 = partie.
      let d = i - deckPos;
      d -= K * Math.round(d / K);

      const returning = tr.phase === "returning";
      const targetW = widths[i];
      const targetH = heights[i];

      let posX = principalPoint.x;
      let posY = principalPoint.y;
      let drawW = targetW;
      let drawH = targetH;
      let opacity = 1;
      let shade = 1;
      let weight = Math.max(0, 1 - Math.abs(d));

      if (d >= 0) {
        const sc = Math.pow(stackScale, d);
        drawW = targetW * sc;
        drawH = targetH * sc;
        posY = principalPoint.y - (targetH * (1 - sc)) / 2 - peek * d;
        opacity = Math.max(0, Math.min(1, depthMax + 0.5 - d));
        shade = 1 - 0.12 * Math.min(d, 3);
      } else if (d > -1) {
        const u = -d;
        posY = principalPoint.y + exitTravel * u * u;
        drawW = targetW * (1 + 0.04 * u);
        drawH = targetH * (1 + 0.04 * u);
        opacity = 1 - u;
      } else {
        opacity = 0;
        weight = 0;
      }

      if (isMain && !returning && tr.phase === "playing") {
        // Réveil : taille de tuile → taille de carte, sans fondu.
        drawW = mainStartW + (targetW - mainStartW) * frame.reveal;
        drawH = mainStartH + (targetH - mainStartH) * frame.reveal;
        opacity = 1;
      } else if (!isMain && tr.phase === "playing") {
        // Cascade : les cartes surgissent l'une après l'autre, de dessous.
        const p = frame.columnOpacity * (depthMax + 1);
        const cin = Math.max(0, Math.min(1, p - (Math.max(1, d) - 1)));
        opacity *= cin;
        posY -= (1 - cin) * peek * 6;
      }

      if (returning) {
        if (isMain) {
          const st = exitStartRef.current;
          const rev = frame.reveal;
          posX = principalPoint.x + (st.x - principalPoint.x) * rev;
          posY = principalPoint.y + (st.y - principalPoint.y) * rev;
          drawW = principalPoint.width + (st.w - principalPoint.width) * rev;
          drawH = principalPoint.height + (st.h - principalPoint.height) * rev;
          opacity = st.op + (1 - st.op) * (1 - rev);
          shade = 1;
        } else {
          opacity *= frame.columnOpacity;
        }
      }

      weightEntries[i].w = returning ? 0 : weight * (tr.phase === "playing" ? frame.columnOpacity || 1 : 1);

      const visible = opacity > 0.002;
      mesh.visible = visible;
      if (!visible) return;

      mesh.position.set(posX, posY, 0.01 - Math.max(0, d) * 0.001);
      mesh.rotation.set(0, 0, 0);
      mesh.renderOrder = isMain && returning ? 200 : Math.round(100 - d * 10);
      mesh.scale.set(drawW, drawH, 1);

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        const uniforms = uniformsOf<PlaneUniforms>(mat);
        if (uniforms?.uMotionBlur) uniforms.uMotionBlur.value = 0;
        mat.opacity = opacity;
        mat.color.setScalar(shade);
      }

      if (weight > 0.05 && !returning && !notifiedRef.current.has(slot.url)) {
        notifiedRef.current.add(slot.url);
        onFocusMediaRef.current?.({ url: slot.url, kind: slot.kind });
      }
    });
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
