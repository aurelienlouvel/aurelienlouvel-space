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
import { CardShadow } from "./CardShadow";
import {
  attachUniforms,
  CARD_TILT_GLSL,
  clampRadius,
  CORNER_SMOOTHING,
  GLSL_SQUIRCLE,
  FRAME_DEFINES,
  GLSL_PIXEL_WIDTH,
  uniformsOf,
} from "./rounded-frame";
import { layerOpacityAt, ringDepth, ringSizeFor } from "./deck-ring";
import { STACK_DEPTH_MAX } from "./transition-presets";
import { rewindLandMix } from "./transition-timeline";

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
  /** Rang du média dans `uniqueMedia` (≠ `galleryIdx` quand un média sans url a été écarté). */
  mediaIdx: number;
};

type PlaneUniforms = {
  uSize: IUniform<Vector2>;
  uRadius: IUniform<number>;
  uCornerSmooth: IUniform<number>;
  uCardTilt: IUniform<Vector2>;
  uMotionBlur: IUniform<number>;
  uMotionBlurDir: IUniform<Vector2>;
  uDissolve: IUniform<number>;
  uDissolveDir: IUniform<Vector2>;
  uDissolveCols: IUniform<number>;
  uDissolvePixel: IUniform<number>;
  uDissolveIrid: IUniform<number>;
  uDissolveBias: IUniform<number>;
  uDissolveTime: IUniform<number>;
  uSaturation: IUniform<number>;
};

const ROUNDING_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;
uniform float uMotionBlur;
uniform vec2 uMotionBlurDir;
// Cartes en retrait dans la pile : 1 = couleurs d'origine, 0 = noir et blanc.
uniform float uSaturation;

// Désagrégation d'une carte tirée : des zones carrées de tailles variées qui se
// pixellisent (une couleur unie par zone), puis disparaissent, le bord qui mène d'abord.
uniform float uDissolve;
uniform vec2 uDissolveDir;
uniform float uDissolveCols;
uniform float uDissolvePixel;
uniform float uDissolveIrid;
uniform float uDissolveBias;
uniform float uDissolveTime;

float dhash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

${GLSL_PIXEL_WIDTH}

${GLSL_SQUIRCLE}
`;

const MOTION_BLUR_MAP = /* glsl */ `
#ifdef USE_MAP
  vec2 dissolveUv = vMapUv;
  float dissolveG = 0.0;
  float dissolveSeed = 0.0;
  if (uDissolve > 0.003) {
    // Grille grossière de cases carrées à l'écran (le nombre de lignes suit le format
    // de la carte), subdivisée au hasard (1×, 2×, 4×) : des carrés de tailles variées.
    float cols = max(2.0, uDissolveCols);
    vec2 cg = vec2(cols, cols * uSize.y / uSize.x);
    vec2 cid = floor(vUv * cg);
    float h0 = dhash(cid);
    float sub = h0 < 0.34 ? 1.0 : (h0 < 0.7 ? 2.0 : 4.0);
    vec2 fg = cg * sub;
    vec2 fid = floor(vUv * fg);
    dissolveSeed = dhash(fid + cid * 3.7);
    // Le bord qui mène (côté de la visée) part en premier.
    float along = dot(vUv - 0.5, uDissolveDir) + 0.5;
    float thr = mix(dissolveSeed, 1.0 - along, uDissolveBias);
    dissolveG = smoothstep(thr - 0.02, thr + 0.16, uDissolve);
    // Pixellisation : les zones qui partent se calent sur le centre de leur cellule.
    vec2 center = (fid + 0.5) / fg;
    dissolveUv = vMapUv + (center - vUv) * uDissolvePixel * dissolveG;
  }
  vec4 sampledDiffuseColor = texture2D( map, dissolveUv );
  if (dissolveG > 0.0) {
    vec3 spec = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + dissolveSeed + uDissolveTime * 0.1));
    sampledDiffuseColor.rgb = mix(
      sampledDiffuseColor.rgb,
      sampledDiffuseColor.rgb * (0.65 + 0.7 * spec) + 0.06 * spec,
      clamp(dissolveG * 1.4, 0.0, 1.0) * uDissolveIrid
    );
    sampledDiffuseColor.a *= 1.0 - dissolveG;
  }
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
  if (uSaturation < 0.999) {
    float satLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    sampledDiffuseColor.rgb = mix(vec3(satLuma), sampledDiffuseColor.rgb, max(uSaturation, 0.0));
  }
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
    uCornerSmooth: CORNER_SMOOTHING,
    uCardTilt: { value: new Vector2(0, 0) },
    uMotionBlur: { value: 0 },
    uMotionBlurDir: { value: new Vector2(0, 1) },
    uDissolve: { value: 0 },
    uDissolveDir: { value: new Vector2(0, 1) },
    uDissolveCols: { value: 5 },
    uDissolvePixel: { value: 1 },
    uDissolveIrid: { value: 0 },
    uDissolveBias: { value: 0.45 },
    uDissolveTime: { value: 0 },
    uSaturation: { value: 1 },
  } satisfies PlaneUniforms);
  parameters.fragmentShader = parameters.fragmentShader
    .replace("#include <common>", `#include <common>\n${ROUNDING_PARS}`)
    .replace(
      "#include <map_fragment>",
      MOTION_BLUR_MAP,
    );
  // Inclinaison 3D selon la souris : même warp de perspective locale que la
  // tuile de la mosaïque (cf. CARD_TILT_GLSL).
  parameters.vertexShader = parameters.vertexShader
    .replace("#include <common>", `#include <common>\n${CARD_TILT_GLSL}`)
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\ntransformed = applyCardTilt(transformed, uCardTilt);",
    );
}

function roundCornersCacheKey() {
  return "play-secondary-planes-motion-blur-tilt-dissolve-flat-tilt-square-saturation";
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
// Chargements en cours, par url : les cartes du deck qui montrent le même média (la pile boucle
// sur un ou deux médias) s'abonnent au même chargement au lieu d'en lancer un chacune.
const pendingImageLoads = new Map<string, ((texture: Texture) => void)[]>();
let globalTextureLoader: TextureLoader | null = null;

/** Texture déjà chargée d'un média (image ou vidéo), pour les effets qui la reprennent en morceaux. */
export function getSharedTexture(url: string, kind: "image" | "video"): Texture | null {
  if (!url) return null;
  return kind === "video"
    ? (sharedVideoTextures.get(url)?.texture ?? null)
    : (sharedImageTextures.get(url) ?? null);
}

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

  const waiting = pendingImageLoads.get(url);
  if (waiting) {
    if (onLoad) waiting.push(onLoad);
    return null;
  }
  const listeners = onLoad ? [onLoad] : [];
  pendingImageLoads.set(url, listeners);

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
      pendingImageLoads.delete(url);
      listeners.forEach((listener) => listener(tex));
    },
    undefined,
    () => {
      // Ignoré silencieusement pour ne pas bloquer le rendu ; un prochain appel réessaiera
      pendingImageLoads.delete(url);
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
        // Empilement au seul `renderOrder` (posé frame par frame sur le mesh) :
        // à la profondeur, deux cartes inclinées voisines se découperaient.
        depthTest={false}
        depthWrite={false}
        defines={FRAME_DEFINES}
        onBeforeCompile={roundCorners}
        customProgramCacheKey={roundCornersCacheKey}
      />
      <CardShadow debug={debug} />
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

  // Préparation du pool d'items : le média principal (M0) occupe la case centrale (centerSlotIdx),
  // celle de la carte du dessus à l'ouverture.
  const { pool, uniqueCount, centerSlotIdx, uniqueMedia } = useMemo(() => {
    if (!principalPoint) {
      return { pool: [], uniqueCount: 0, centerSlotIdx: 0, uniqueMedia: [] };
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

    // Anneau de cartes (cf. `deck-ring.ts`) : la case s montre toujours le média `s mod K`, et le deck
    // les parcourt en boucle, donc la pile garde ses layers même avec un ou deux médias.
    const K = uMedia.length;
    const ringSize = ringSizeFor(K);

    const slots: PoolSlot[] = [];
    for (let s = 0; s < ringSize; s++) {
      const mediaIdx = s % K;
      const m = uMedia[mediaIdx];
      slots.push({
        key: `slot-${s}-g${m.galleryIdx}`,
        url: m.url,
        kind: m.kind,
        ratio: m.ratio,
        galleryIdx: m.galleryIdx,
        mediaIdx,
      });
    }

    return {
      pool: slots,
      uniqueCount: K,
      centerSlotIdx: 0,
      uniqueMedia: uMedia,
    };
  }, [gallery, principalPoint, primaryMedia]);

  const lastPhaseRef = useRef<string>("idle");
  const onFocusMediaRef = useRef(onFocusMedia);
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    onFocusMediaRef.current = onFocusMedia;
  }, [onFocusMedia]);
  const tiltRef = useRef({ x: 0, y: 0 });
  const exitStartRef = useRef({ x: 0, y: 0, w: 0, h: 0, op: 1 });
  // Retour : part (1 → 0) des cartes de la pile qui s'effacent derrière la gardée.
  // Elle ne fait que baisser, pour qu'un second Échap ne les fasse pas réapparaître.
  const layerFadeRef = useRef(1);

  // Entrées de poids partagées avec le dégradé du panneau (mutées en place).
  const weightEntries = useMemo(
    () => uniqueMedia.map((m) => ({ url: m.url, kind: m.kind, w: 0 })),
    [uniqueMedia],
  );
  useEffect(() => {
    if (weightsRef) weightsRef.current = weightEntries;
  }, [weightsRef, weightEntries]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !principalPoint || pool.length === 0) return;

    const tr = runtime.current.transition;
    const frame = tr.frame;
    // Aucune carte ne se décompose tant que la boucle ci-dessous ne l'a pas décidé.
    tr.deckFx.intensity = 0;
    // Retour : le film d'ouverture se rejoue à l'envers, et seule la carte du dessus rentre.
    const rewinding = tr.rewinding === true && tr.phase === "playing";
    if (!rewinding) {
      tr.keepOther = false;
      layerFadeRef.current = 1;
    }

    // Pile masquée : la rotation repart de zéro, la prochaine ouverture ne reprend pas l'ancienne.
    const hide = () => {
      group.visible = false;
      tiltRef.current.x = 0;
      tiltRef.current.y = 0;
    };
    if (tr.phase !== "playing" && tr.phase !== "isolated" && tr.phase !== "returning") {
      hide();
      return;
    }
    // Avant le reveal, la tuile reste affichée par ArtifactGrid : pas de doublon.
    if (tr.phase === "playing" && frame.reveal < 0.001) {
      hide();
      return;
    }
    // Entrée annulée avant le réveil : la tuile de la mosaïque n'a jamais été remplacée.
    if (tr.phase === "returning" && tr.returnFrom && tr.returnFrom.reveal < 0.001) {
      hide();
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
    const ringSize = pool.length;
    // Au retour, la carte gardée est celle que le deck visait ; sinon, c'est celle de la tuile (case
    // centrale). Une seule case est « principale » : la pile peut montrer le même média plusieurs fois.
    const keptSlot = rewinding
      ? ((Math.round(tr.rewindFromDeck) % ringSize) + ringSize) % ringSize
      : centerSlotIdx;
    const keptI = pool[keptSlot]?.mediaIdx ?? 0;
    tr.keepOther = rewinding && keptI !== 0;
    if (rewinding) {
      layerFadeRef.current = Math.max(
        0,
        layerFadeRef.current - delta / Math.max(0.02, cfg.rewindLayerFade ?? 0.25),
      );
    }
    const layerFade = layerFadeRef.current * layerFadeRef.current * (3 - 2 * layerFadeRef.current);
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
        const m0 = meshRefs.current[keptSlot];
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
    const depthMax = Math.min(STACK_DEPTH_MAX, Math.max(0, cfg.stackDepth ?? 2));
    const stackOpacity = cfg.stackOpacity ?? 0.55;
    const stackFalloff = cfg.stackOpacityFalloff ?? 0.55;
    const stackSaturation = Math.min(1, Math.max(0, cfg.stackSaturation ?? 1));
    // Tous les médias sont alignés par le BAS : une carte moins haute que la
    // première laisse quand même voir son bord inférieur, sous la pile.
    const baseBottom = principalPoint.y - heights[0] / 2;
    // Traction du deck : la carte du dessus monte, résistante, avant de basculer.
    const pullShown = tr.phase === "isolated" ? tr.deckPullShown : 0;
    const liftWorld = (cfg.deckLift ?? 70) / curZoom;
    let fxBest = 0;
    // Plus petite profondeur |d| vue : la carte du dessus est celle à moins d'un demi-pas.
    let topD = 0.5;

    // ── Visée : où la carte part ────────────────────────────────────────────
    // Le geste donne le côté (haut, bas, gauche ou droite : la direction de la traction affichée) ;
    // le curseur ne fait que courber la trajectoire vers lui, de `deckAimMix` (0 = droit devant).
    // Au drag la carte suit le doigt, sans courbe. Mise à jour pendant la traction seulement : la
    // carte garde son cap quand on relâche, et `deckAimCommit` fige celui du changement.
    const spinRad = ((cfg.deckSpin ?? 12) * Math.PI) / 180;
    const dissolveAmount = Math.min(1, Math.max(0, cfg.deckDissolveAmount ?? 0.9));
    const throwWorld = (cfg.deckThrow ?? 180) / curZoom;
    const leaveFrom = Math.min(1, Math.max(0, tr.deckLeaveFrom));
    const ptr = runtime.current.pointer;
    const cardSX = (principalPoint.x - camera.position.x) * curZoom + size.width / 2;
    const cardSY = size.height / 2 - (principalPoint.y - camera.position.y) * curZoom;
    if (tr.phase === "isolated" && !tr.rewinding && pullShown > 0.003) {
      const shownVec = tr.deckShownVec;
      const gx = shownVec.x / pullShown;
      const gy = shownVec.y / pullShown;
      let mx = gx;
      let my = gy;
      if (!tr.deckDragging) {
        // Le curseur vu depuis le centre de la carte (monde : y vers le haut) ; seule sa part
        // perpendiculaire au geste courbe la trajectoire, jamais de quoi la faire reculer.
        let ux = ptr.x - cardSX;
        let uy = -(ptr.y - cardSY);
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul;
        uy /= ul;
        const along = ux * gx + uy * gy;
        const mixAim = Math.min(1, Math.max(0, cfg.deckAimMix ?? 0.8));
        mx += (ux - along * gx) * mixAim;
        my += (uy - along * gy) * mixAim;
      }
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml;
      my /= ml;
      // Tout près du repos, la carte ne bouge presque pas : la visée suit le geste d'un coup (un
      // changement de sens passe par là), puis se lisse à mesure que la carte s'éloigne.
      const smooth = 1 - Math.exp(-delta * 14);
      const ak = smooth + (1 - smooth) * Math.max(0, 1 - pullShown / 0.06);
      tr.deckAim.x += (mx - tr.deckAim.x) * ak;
      tr.deckAim.y += (my - tr.deckAim.y) * ak;
    }

    // ── Rotation 3D de la pile selon la souris ──────────────────────────────
    // Toute la pile est un groupe qui pivote autour du centre de la carte du dessus : le côté du
    // curseur recule (`deckTilt` négatif = l'inverse). Les layers sont espacés en profondeur
    // (`stackDepthZ`), donc la rotation les décale les uns par rapport aux autres : c'est la parallaxe.
    // Chaque carte reçoit aussi la même inclinaison dans son shader (`uCardTilt`), qui lui donne sa
    // perspective, car la caméra est orthographique. Le pointeur n'est lu qu'une fois vu, et la pile
    // se remet à plat pendant le retour.
    const tiltOn = tr.phase === "isolated" && !tr.rewinding && ptr.seen;
    const tiltRad = ((cfg.deckTilt ?? 0) * Math.PI) / 180;
    const nx = Math.max(-1, Math.min(1, (ptr.x - cardSX) / Math.max(1, size.width / 2)));
    const ny = Math.max(-1, Math.min(1, -(ptr.y - cardSY) / Math.max(1, size.height / 2)));
    const tk = 1 - Math.exp(-delta * (cfg.deckTiltSmooth ?? 8));
    tiltRef.current.x += ((tiltOn ? -ny * tiltRad : 0) - tiltRef.current.x) * tk;
    tiltRef.current.y += ((tiltOn ? nx * tiltRad : 0) - tiltRef.current.y) * tk;
    // Même ordre que le warp du shader (X puis Y) : le groupe et les cartes tournent dans le même sens.
    if (group.rotation.order !== "YXZ") group.rotation.order = "YXZ";
    group.rotation.set(tiltRef.current.x, tiltRef.current.y, 0);
    // Écart en z entre deux layers : défini en px écran, borné pour que six layers restent dans le
    // frustum (far = 1000 depuis z = 100).
    const zGap = Math.min(140, Math.max(0, cfg.stackDepthZ ?? 80) / curZoom);
    const warpGain = Math.max(0, cfg.stackPerspective ?? 1);

    // La carte prend la place de la tuile à l'image près : elle part de sa taille
    // réelle à l'écran, jamais plafonnée par `maxW` / `maxH`. Le plafond ne valait
    // que pour une des deux cotes (la tuile zoomée dépasse `maxW` bien avant `maxH`),
    // et la carte arrivait étroite et haute, écrasée d'un tiers au moment du
    // remplacement. Le plafond s'applique à l'arrivée (`targetW` / `targetH`) :
    // `reveal` y conduit la carte.
    const mainStartW = principalPoint.width * frame.tileScale;
    const mainStartH = principalPoint.height * frame.tileScale;

    // Un média peut occuper plusieurs cases : son poids est le plus fort des siennes.
    weightEntries.forEach((entry) => {
      entry.w = 0;
    });

    pool.forEach((slot, s) => {
      const mesh = meshRefs.current[s];
      if (!mesh) return;
      const i = slot.mediaIdx;
      const isMain = s === keptSlot;

      // Profondeur signée sur l'anneau : 0 = carte du dessus, >0 = derrière, <0 = partie. L'anneau
      // est assez grand pour que la case qui boucle (de −ringSize/2 à +ringSize/2) soit invisible.
      const d = ringDepth(s, deckPos, ringSize);

      const returning = tr.phase === "returning";
      const targetW = widths[i];
      const targetH = heights[i];

      let posX = principalPoint.x;
      let posY = principalPoint.y;
      let drawW = targetW;
      let drawH = targetH;
      let opacity = 1;
      let shade = 1;
      let roll = 0;
      let twistX = 0;
      let twistY = 0;
      let dissolve = 0;
      let dissolveX = 0;
      let dissolveY = 1;
      let weight = Math.max(0, 1 - Math.abs(d));

      // Pendant la traction, les layers remontent vers la carte du dessus.
      const dv = d > 0.0001 && pullShown > 0 ? Math.max(0, d - pullShown * 0.4) : d;

      if (d >= 0) {
        const sc = Math.pow(stackScale, dv);
        drawW = targetW * sc;
        drawH = targetH * sc;
        // Chaque layer s'enfonce de `peek` sous celui du dessus, bord bas aligné.
        posY = baseBottom - peek * dv + drawH / 2;
        // Opacité : 1 pour la carte du dessus, `stackOpacity` pour le premier
        // layer, puis `stackOpacityFalloff` à chaque layer suivant.
        opacity = layerOpacityAt(dv, depthMax, stackOpacity, stackFalloff);
        shade = 1 - 0.06 * Math.min(dv, 3);
      } else if (d > -1) {
        const u = -d;
        // La carte qui part ne glisse plus : elle se désagrège sur place, en éclats.
        drawW = targetW * (1 + 0.03 * u);
        drawH = targetH * (1 + 0.03 * u);
        posY = baseBottom + drawH / 2;
        opacity = Math.pow(1 - u, cfg.deckDissolve ?? 1.6);
      } else {
        opacity = 0;
        weight = 0;
      }

      if (isMain && !returning && tr.phase === "playing") {
        // Réveil : taille de tuile → taille de carte, sans fondu.
        let startW = mainStartW;
        let startH = mainStartH;
        if (i !== 0) {
          // Retour d'une carte qui n'est pas le média de la tuile : elle garde son
          // ratio, inscrite dans la tuile (jamais étirée), puis se fond dans la tuile.
          const fit = Math.min(mainStartW / targetW, mainStartH / targetH);
          startW = targetW * fit;
          startH = targetH * fit;
        }
        drawW = startW + (targetW - startW) * frame.reveal;
        drawH = startH + (targetH - startH) * frame.reveal;
        // Les cartes du deck sont alignées par le bas : celle-ci rejoint le centre de la tuile.
        posY = principalPoint.y + (baseBottom + targetH / 2 - principalPoint.y) * frame.reveal;
        opacity = i !== 0 ? rewindLandMix(frame.reveal) : 1;
      } else if (!isMain && tr.phase === "playing") {
        if (rewinding) {
          // Retour : le reste de la pile s'efface sur place, avant que la carte gardée ne bouge.
          opacity *= layerFade;
        } else {
          // Cascade : les layers sortent l'un après l'autre de derrière la carte
          // du dessus, en glissant vers le bas jusqu'à leur place.
          const p = frame.columnOpacity * (depthMax + 1);
          const cin = Math.max(0, Math.min(1, p - (Math.max(1, d) - 1)));
          const eased = 1 - Math.pow(1 - cin, 3);
          opacity *= cin;
          posY += peek * Math.max(0, d) * (1 - eased);
        }
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

      const weightHere = returning ? 0 : weight * (tr.phase === "playing" ? frame.columnOpacity || 1 : 1);
      weightEntries[i].w = Math.max(weightEntries[i].w, weightHere);

      // Carte du dessus : l'origine des pixels de fond. Prise avant la traction, pour que
      // les pixels ne suivent pas la carte qu'on tire.
      if (!rewinding && !returning && Math.abs(d) < topD) {
        topD = Math.abs(d);
        const top = tr.deckTop;
        top.cx = posX;
        top.cy = posY;
        top.w = drawW;
        top.h = drawH;
        top.url = slot.url;
        top.kind = slot.kind;
      }

      if (tr.phase === "isolated") {
        // Traction : la carte du dessus monte d'autant plus qu'elle est proche du premier plan.
        const near = Math.max(0, 1 - Math.abs(d));
        const leaving = d > -1 && d < 0;
        if (leaving) {
          // Carte qui part (ou qui revient, en rewind) : de la course de traction qu'elle avait
          // (`deckLeaveFrom` : celle qu'on voyait au changement, 0 au clavier au repos) à la
          // distance de lancer, dans le cap figé au changement.
          const u = -d;
          const reach = liftWorld * leaveFrom * (1 - u) + throwWorld * u;
          const aim = tr.deckAimCommit;
          posX += aim.x * reach;
          posY += aim.y * reach;
          roll += aim.x * spinRad * u;
          // La désagrégation poursuit celle de la traction jusqu'à la disparition.
          dissolve = Math.min(1, dissolveAmount * leaveFrom * (1 - u) + 1.05 * u);
          dissolveX = aim.x;
          dissolveY = aim.y;
        } else {
          // Traction : la carte monte vers sa visée, et s'incline vers elle.
          const mag = Math.abs(pullShown) * liftWorld * near;
          posX += tr.deckAim.x * mag;
          posY += tr.deckAim.y * mag;
          roll += tr.deckAim.x * spinRad * Math.abs(pullShown) * near;
          // Plus la carte monte, plus elle se disperse ; elle se recompose si on relâche.
          dissolve = Math.abs(pullShown) * dissolveAmount * near;
          dissolveX = tr.deckAim.x;
          dissolveY = tr.deckAim.y;
        }
        // Éclats : un frémissement pendant la traction, puis la désagrégation
        // complète au passage (pic au milieu du départ / de l'arrivée de la carte).
        const passing = d > -1 && d < -0.0001 ? Math.pow(Math.sin(Math.PI * -d), 0.8) : 0;
        const shimmer = Math.abs(pullShown) * (cfg.deckShimmer ?? 0.5) * near;
        const fx = Math.max(passing, shimmer);
        if (fx > fxBest) {
          fxBest = fx;
          const f = tr.deckFx;
          f.intensity = fx;
          // Les éclats partent d'autant plus loin que la carte est désagrégée.
          f.spread = Math.max(0.25, Math.min(1, dissolve * 1.1));
          f.cx = posX;
          f.cy = posY;
          f.w = drawW;
          f.h = drawH;
          f.url = slot.url;
          f.kind = slot.kind;
        }
      }

      // La torsion de l'ouverture n'est pas coupée au boom : elle s'éteint doucement
      // (`twistSettle`) et la carte qui prend la place de la tuile la reprend telle quelle.
      if (isMain && (returning || tr.phase === "playing")) {
        roll += frame.tileRoll;
        twistX = frame.tileTiltX;
        twistY = frame.tileTiltY;
      }

      const visible = opacity > 0.002;
      mesh.visible = visible;
      if (!visible) return;

      // Chaque layer recule de `zGap` (continu pendant la traction, comme son échelle et son décalage) ;
      // la carte qui part reste devant. L'empilement visible reste celui de `renderOrder`.
      mesh.position.set(posX, posY, 0.01 - (d >= 0 ? Math.min(dv, STACK_DEPTH_MAX + 1) * zGap : 0));
      mesh.rotation.set(0, 0, roll);
      mesh.renderOrder = isMain && returning ? 200 : Math.round(100 - d * 10);
      mesh.scale.set(drawW, drawH, 1);

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        const uniforms = uniformsOf<PlaneUniforms>(mat);
        if (uniforms?.uMotionBlur) uniforms.uMotionBlur.value = 0;
        // Perspective de la carte (`stackPerspective`), avec en plus une inclinaison propre aux layers
        // profonds (`deckTiltLayerGain`, 0 par défaut : ils suivent le groupe, rigides).
        const layerGain = warpGain * (1 + (cfg.deckTiltLayerGain ?? 0) * Math.max(0, dv));
        uniforms?.uCardTilt.value.set(tiltRef.current.x * layerGain + twistX, tiltRef.current.y * layerGain + twistY);
        if (uniforms) {
          uniforms.uDissolve.value = dissolve;
          uniforms.uDissolveDir.value.set(dissolveX, dissolveY);
          uniforms.uDissolveCols.value = cfg.deckCellCols ?? 5;
          uniforms.uDissolvePixel.value = cfg.deckCellPixel ?? 1;
          uniforms.uDissolveIrid.value = cfg.deckCellIrid ?? 0;
          uniforms.uDissolveBias.value = cfg.deckCellBias ?? 0.45;
          uniforms.uDissolveTime.value = (performance.now() / 1000) % 1000;
          // Pack ouvert : seule la carte du dessus garde ses couleurs, celles des layers qui
          // s'enfoncent derrière s'éteignent avec la profondeur (`dv` : continue pendant la traction).
          uniforms.uSaturation.value = d >= 0 ? 1 + (stackSaturation - 1) * Math.min(1, dv) : 1;
        }
        mat.opacity = opacity;
        mat.color.setScalar(shade);
      }

      if (weight > 0.05 && !returning && !rewinding && !notifiedRef.current.has(slot.url)) {
        notifiedRef.current.add(slot.url);
        onFocusMediaRef.current?.({ url: slot.url, kind: slot.kind });
      }
    });
  });

  if (!principalPoint || pool.length === 0) {
    return null;
  }

  // Deux groupes imbriqués : l'extérieur pivote autour du centre de la carte du dessus, l'intérieur
  // ramène l'origine au monde. Les cartes gardent donc leurs coordonnées monde, et la rotation de la
  // pile les fait tourner autour de ce point (`deckTop`, `deckFx` et les autres restent en monde).
  return (
    <group ref={groupRef} position={[principalPoint.x, principalPoint.y, 0]}>
      <group position={[-principalPoint.x, -principalPoint.y, 0]}>
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
    </group>
  );
}
