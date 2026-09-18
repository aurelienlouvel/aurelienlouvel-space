"use client";

import { useRef, useMemo, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import type { ArtifactGalleryItem } from "@/sanity/queries";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";
import { ArtifactPlane } from "./ArtifactPlane";
import { buildImageUrl } from "@/lib/sanity-image";
import { fileRefToUrl } from "@/lib/sanity-utils";

type SecondaryGalleryPlanesProps = {
  gallery: ArtifactGalleryItem[];
  principalPoint: { x: number; y: number; width: number; height: number } | null;
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
  relativeIdx: number; // distance par rapport au centre (0 = centre M0, négatif = au-dessus, positif = en-dessous)
};

export function SecondaryGalleryPlanes({
  gallery,
  principalPoint,
  runtime,
  debug,
  gap = 32,
}: SecondaryGalleryPlanesProps) {
  const { size, camera } = useThree();
  const groupRef = useRef<Group>(null);
  const meshRefs = useRef<(Mesh | null)[]>([]);

  // Détection responsive : desktop (>= 1024px et paysage) vs mobile
  const isDesktop = size.width >= 1024 && size.width >= size.height;

  // Préparation du pool d'items infinis
  const { pool, centerIndex, cycleCount } = useMemo(() => {
    if (!gallery || gallery.length === 0 || !principalPoint) {
      return { pool: [], centerIndex: -1, cycleCount: 0 };
    }

    const n = gallery.length;
    // On répète pour avoir au moins 14-16 items dans le pool afin de couvrir largement la hauteur d'écran
    const repeats = Math.max(3, Math.ceil(15 / n));
    const totalSlots = n * repeats;
    const center = Math.floor(totalSlots / 2);

    const slots: PoolSlot[] = [];

    for (let j = 0; j < totalSlots; j++) {
      const rel = j - center;
      // Index dans la galerie en boucle continue
      const gIdx = ((rel % n) + n) % n;
      const item = gallery[gIdx];

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

      slots.push({
        key: `slot-${j}-${gIdx}`,
        url,
        kind: isVideo ? "video" : "image",
        ratio: Math.max(0.2, ratio),
        galleryIdx: gIdx,
        relativeIdx: rel,
      });
    }

    return { pool: slots, centerIndex: center, cycleCount: repeats };
  }, [gallery, principalPoint]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !principalPoint || pool.length === 0) return;

    const tr = runtime.current.transition;
    const isBursting = tr.phase === "burst";
    const isIsolated = tr.phase === "isolated";
    const isReturning = tr.phase === "returning";

    if (!isBursting && !isIsolated && !isReturning) {
      group.visible = false;
      return;
    }

    group.visible = true;

    let progress = 1;
    if (isBursting) {
      progress = tr.easedBurstProgress;
    } else if (isIsolated) {
      progress = 1;
    } else if (isReturning) {
      const returnDelay = Math.max(0, debug.current.transition.repulseReturnDelay);
      if (tr.returnTimer < returnDelay) {
        progress = 1;
      } else {
        const returnT = Math.min(1, (tr.returnTimer - returnDelay) / 0.35);
        progress = Math.max(0, 1 - returnT);
      }
    }

    const currentZoom = Math.max(0.01, camera.zoom);

    // ── Dimensions responsive ───────────────────────────────────────────────
    // Desktop : largeur = 24% de la largeur d'écran (tous les médias ont la même width)
    // Mobile  : hauteur = 48% de la hauteur d'écran (tous les médias ont la même height)
    const desktopWidthRatio = debug.current.transition.desktopMediaWidthRatio ?? 0.24;
    const mobileHeightRatio = debug.current.transition.mobileMediaHeightRatio ?? 0.48;

    let baseColWidth = 0;
    let baseColHeight = 0;

    if (isDesktop) {
      baseColWidth = (size.width * desktopWidthRatio) / currentZoom;
    } else {
      baseColHeight = (size.height * mobileHeightRatio) / currentZoom;
    }

    // Calcul des hauteurs de chaque slot et de la hauteur d'un cycle complet
    const slotHeights: number[] = new Array(pool.length);
    const slotWidths: number[] = new Array(pool.length);

    let oneCycleHeight = 0;
    const n = gallery.length;

    for (let j = 0; j < pool.length; j++) {
      const r = pool[j].ratio;
      if (isDesktop) {
        slotWidths[j] = baseColWidth;
        slotHeights[j] = baseColWidth / r;
      } else {
        slotHeights[j] = baseColHeight;
        slotWidths[j] = baseColHeight * r;
      }
      if (j < n) {
        oneCycleHeight += slotHeights[j] + gap;
      }
    }

    const totalPoolSpan = oneCycleHeight * cycleCount;

    // Calcul des positions de repos (restingY) relatives à principalPoint.y (slot centerIndex)
    const restingY: number[] = new Array(pool.length);
    restingY[centerIndex] = principalPoint.y;

    // Items en-dessous du centre (rel > 0) : s'empilent vers le bas
    for (let j = centerIndex + 1; j < pool.length; j++) {
      const prevY = restingY[j - 1];
      const prevH = slotHeights[j - 1];
      const curH = slotHeights[j];
      restingY[j] = prevY - prevH * 0.5 - gap - curH * 0.5;
    }

    // Items au-dessus du centre (rel < 0) : s'empilent vers le haut
    for (let j = centerIndex - 1; j >= 0; j--) {
      const nextY = restingY[j + 1];
      const nextH = slotHeights[j + 1];
      const curH = slotHeights[j];
      restingY[j] = nextY + nextH * 0.5 + gap + curH * 0.5;
    }

    // ── Animation et défilement infini ──────────────────────────────────────
    const scrollY = isIsolated ? tr.columnScrollY : 0;
    const halfH = (size.height / currentZoom) * 0.5;
    const anchorY = principalPoint.y;

    // Décalage d'apparition lors du burst
    const slideOffsetDistance = (1 - progress) * 320;

    pool.forEach((item, j) => {
      const mesh = meshRefs.current[j];
      if (!mesh) return;

      const isCenter = j === centerIndex;

      // Position Y de départ + glissement + scroll
      let slideDir = 0;
      if (!isCenter) {
        slideDir = item.relativeIdx < 0 ? 1 : -1; // au-dessus glisse depuis le haut, en-dessous depuis le bas
      }
      let y = restingY[j] + slideDir * slideOffsetDistance + scrollY;

      // Bouclage infini régulier sans rupture
      if (totalPoolSpan > 100) {
        while (y - anchorY > halfH + 300) {
          y -= totalPoolSpan;
        }
        while (y - anchorY < -halfH - 300 - totalPoolSpan * 0.5) {
          y += totalPoolSpan;
        }
      }

      mesh.position.set(principalPoint.x, y, 0);

      // Échelle du mesh
      if (isCenter && isBursting) {
        // Au centre (M0), transition fluide depuis la taille dans la grille vers la taille finale
        const startW = principalPoint.width * debug.current.transition.selectScale;
        const startH = principalPoint.height * debug.current.transition.selectScale;
        const curW = startW + (slotWidths[j] - startW) * progress;
        const curH = startH + (slotHeights[j] - startH) * progress;
        mesh.scale.set(curW, curH, 1);
      } else {
        mesh.scale.set(slotWidths[j], slotHeights[j], 1);
      }

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        if (isCenter) {
          mat.opacity = isReturning ? progress : 1;
        } else {
          mat.opacity = progress;
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
        <Suspense key={item.key} fallback={null}>
          <ArtifactPlane
            url={item.url}
            kind={item.kind}
            x={principalPoint.x}
            y={principalPoint.y}
            width={principalPoint.width}
            height={principalPoint.height}
            debug={debug}
            meshRef={(mesh) => {
              meshRefs.current[idx] = mesh;
            }}
            onHoverChange={() => {}}
            onSelect={() => {}}
          />
        </Suspense>
      ))}
    </group>
  );
}
