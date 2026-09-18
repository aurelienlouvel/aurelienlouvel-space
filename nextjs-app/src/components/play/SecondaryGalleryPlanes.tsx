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
};

const ROUNDING_PARS = /* glsl */ `
uniform vec2 uSize;
uniform float uRadius;

${GLSL_PIXEL_WIDTH}

/** SDF d'un rectangle arrondi centré sur l'origine, négative à l'intérieur. */
float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}
`;

const ROUNDING_MASK = /* glsl */ `
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
  } satisfies PlaneUniforms);
  parameters.fragmentShader = parameters.fragmentShader
    .replace("#include <common>", `#include <common>\n${ROUNDING_PARS}`)
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>\n${ROUNDING_MASK}`,
    );
}

function roundCornersCacheKey() {
  return "play-artifact-rounded";
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
  const wrappedSlotsRef = useRef<boolean[]>([]);

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

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !principalPoint || pool.length === 0) return;

    const tr = runtime.current.transition;
    const isBursting = tr.phase === "burst";
    const isMainZoom = tr.phase === "mainZoom";
    const isMainHold = tr.phase === "mainHold";
    const isStackEntrance = tr.phase === "stackEntrance";
    const isSpinDezoom = tr.phase === "spinDezoom";
    const isIsolated = tr.phase === "isolated";
    const isReturning = tr.phase === "returning";

    if (
      !isBursting &&
      !isMainZoom &&
      !isMainHold &&
      !isStackEntrance &&
      !isSpinDezoom &&
      !isIsolated &&
      !isReturning
    ) {
      group.visible = false;
      return;
    }

    group.visible = true;

    let burstProgress = 1;
    if (isBursting) {
      burstProgress = tr.easedBurstProgress;
    } else if (isMainZoom || isMainHold || isStackEntrance || isSpinDezoom || isIsolated) {
      burstProgress = 1;
    } else if (isReturning) {
      const returnProg = tr.easedReturnProgress ?? 0;
      burstProgress = Math.max(0, 1 - returnProg);
    }

    const currentZoom = Math.max(0.01, camera.zoom);
    const effectiveGap = debug.current.transition.mediaGap ?? gap;
    const stackSlideOffset = debug.current.transition.stackSlideOffset ?? 350;
    const exitSlideOffset = debug.current.transition.exitSlideOffset ?? 350;

    // ── Dimensions responsive ───────────────────────────────────────────────
    // Desktop : largeur = ~34% de la largeur d'écran (avec un minimum de 380px)
    // Mobile  : hauteur = ~48% de la hauteur d'écran (avec un minimum de 260px)
    const desktopWidthRatio = debug.current.transition.desktopMediaWidthRatio ?? 0.34;
    const mobileHeightRatio = debug.current.transition.mobileMediaHeightRatio ?? 0.48;

    let baseColWidth = 0;
    let baseColHeight = 0;

    if (isDesktop) {
      const targetWidthPx = Math.max(380, size.width * desktopWidthRatio);
      baseColWidth = targetWidthPx / currentZoom;
    } else {
      const targetHeightPx = Math.max(260, size.height * mobileHeightRatio);
      baseColHeight = targetHeightPx / currentZoom;
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

    // Calcul des positions de repos restingY pour chaque slot :
    // Le slot centerSlotIdx (M0) est ancré à principalPoint.y (centre de l'écran)
    const restingY: number[] = new Array(pool.length);
    restingY[centerSlotIdx] = principalPoint.y;

    // Progression vers le bas pour les slots s > centerSlotIdx
    for (let s = centerSlotIdx + 1; s < pool.length; s++) {
      const prevSlot = pool[s - 1];
      const curSlot = pool[s];
      const prevH = uniqueHeights[prevSlot.galleryIdx % K];
      const curH = uniqueHeights[curSlot.galleryIdx % K];
      restingY[s] = restingY[s - 1] - prevH * 0.5 - effectiveGap - curH * 0.5;
    }

    // Progression vers le haut pour les slots s < centerSlotIdx
    for (let s = centerSlotIdx - 1; s >= 0; s--) {
      const nextSlot = pool[s + 1];
      const curSlot = pool[s];
      const nextH = uniqueHeights[nextSlot.galleryIdx % K];
      const curH = uniqueHeights[curSlot.galleryIdx % K];
      restingY[s] = restingY[s + 1] + nextH * 0.5 + effectiveGap + curH * 0.5;
    }

    // ── Réinitialisation de la mémoire anti-pop lors d'une nouvelle sélection
    if (tr.phase === "idle" || tr.phase === "selecting" || tr.phase === "lock" || tr.phase === "burst") {
      if (wrappedSlotsRef.current.length !== pool.length || wrappedSlotsRef.current.some(Boolean)) {
        wrappedSlotsRef.current = new Array(pool.length).fill(false);
      }
    }

    const stackM0Rise = debug.current.transition.stackM0Rise ?? 90;

    // ── Animation et défilement ─────────────────────────────────────────────
    let scrollY = 0;
    if (isSpinDezoom) {
      const reelLoops = debug.current.transition.reelLoops ?? 3;
      const spinProgress = tr.easedSpinDezoomProgress ?? 0;
      const spinDist = reelLoops * oneCycleHeight * spinProgress;
      // Continuité totale : l'ascension m0Rise acquise lors de stackEntrance
      // s'enchaîne directement dans la course du rouleau 777
      const residualRise = stackM0Rise * (1 - spinProgress);
      scrollY = spinDist + residualRise;
    } else if (isIsolated || isReturning) {
      scrollY = tr.columnScrollY;
    }

    const anchorY = principalPoint.y;
    // Seuil de sortie haute du champ visible : au-delà, le slot boucle sous l'écran
    const visibleHalfH = (size.height / Math.max(0.1, camera.zoom)) * 0.5;
    const topLimit = anchorY + Math.max(visibleHalfH + 300, oneCycleHeight * 0.75);

    pool.forEach((slot, s) => {
      const mesh = meshRefs.current[s];
      if (!mesh) return;

      const isMain = s === centerSlotIdx;
      const offset = slot.relativeIdx; // s - centerSlotIdx

      let y = restingY[s] + scrollY;

      // ── Émergence séquentielle (Temps 6) ──────────────────────────────────
      if (isStackEntrance) {
        const entranceT = tr.easedStackEntranceProgress ?? 0;
        const m0Rise = stackM0Rise * entranceT;
        const slideDist = (1 - entranceT) * stackSlideOffset;

        if (isMain) {
          // M0 commence à monter vers le haut dès que M1 entre, mais moins vite que M1
          y = restingY[centerSlotIdx] + m0Rise;
        } else if (offset >= 1) {
          // M1 (et suivants) montent depuis le bas plus rapidement pour rattraper le bon espacement
          y = restingY[s] + m0Rise - slideDist;
        } else {
          // Cartes au-dessus : restent strictement invisibles
          y = restingY[s] + m0Rise;
        }
      } else if (isReturning) {
        if (!isMain) {
          const returnProg = tr.easedReturnProgress ?? 0;
          const slideDist = returnProg * exitSlideOffset;
          if (offset > 0) {
            y -= slideDist;
          } else if (offset < 0) {
            y += slideDist;
          }
        }
      }

      // Bouclage infini périodique modulaire
      if (pool.length > 1 && totalPoolSpan > 100) {
        if (isSpinDezoom || isIsolated || isReturning) {
          const unwrappedY = y;
          // Dès qu'une carte supérieure (offset < 0) a franchi le haut et bouclé par le bas, elle est mémorisée
          if (unwrappedY > topLimit) {
            wrappedSlotsRef.current[s] = true;
          }
          y = wrapPeriodic(unwrappedY, totalPoolSpan, topLimit);
        }
      }

      // Rendu strictement 2D plat (suppression de l'arc de cercle 3D)
      mesh.position.set(principalPoint.x, y, 0);
      mesh.rotation.set(0, 0, 0);

      // Priorité de rendu : M0 au premier plan
      mesh.renderOrder = isMain ? 10 : 5;

      const curItemIdx = slot.galleryIdx % K;
      const targetW = uniqueWidths[curItemIdx];
      const targetH = uniqueHeights[curItemIdx];

      if (isMain) {
        if (isBursting || isReturning) {
          const startW = principalPoint.width * (debug.current.transition.selectScale || 1.0);
          const startH = principalPoint.height * (debug.current.transition.selectScale || 1.0);
          const curW = startW + (targetW - startW) * burstProgress;
          const curH = startH + (targetH - startH) * burstProgress;
          mesh.scale.set(curW, curH, 1);
        } else {
          mesh.scale.set(targetW, targetH, 1);
        }
      } else {
        mesh.scale.set(targetW, targetH, 1);
      }

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        if (isMain) {
          mat.opacity = 1;
        } else if (isBursting || isMainZoom || isMainHold) {
          // Pendant burst, zoom avant et pause, seule l'image principale M0 est visible
          mat.opacity = 0;
        } else if (isStackEntrance) {
          // Règle stricte anti-pop du haut : aucune carte au-dessus de M0 n'est visible !
          // Seules les cartes en-dessous de M0 (offset >= 1) émergent depuis le bas
          if (offset === 1) {
            mat.opacity = Math.min(1, (tr.easedStackEntranceProgress ?? 0) * 1.5);
          } else if (offset > 1) {
            mat.opacity = Math.max(0, Math.min(1, ((tr.easedStackEntranceProgress ?? 0) - 0.25) * 1.5));
          } else {
            mat.opacity = 0;
          }
        } else if (isSpinDezoom) {
          // Règle stricte anti-pop :
          // - Les cartes sous M0 (offset >= 0) montent et tournent
          // - Les cartes au-dessus de M0 (offset < 0) sont STRICTEMENT invisibles
          //   tant qu'elles n'ont pas bouclé par le bas de l'écran (wrappedSlotsRef)
          if (offset >= 0) {
            mat.opacity = 1;
          } else {
            mat.opacity = wrappedSlotsRef.current[s] ? 1 : 0;
          }
        } else if (isIsolated) {
          mat.opacity = 1;
        } else if (isReturning) {
          mat.opacity = Math.max(0, 1 - (tr.easedReturnProgress ?? 0));
        }
      }
    });
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
