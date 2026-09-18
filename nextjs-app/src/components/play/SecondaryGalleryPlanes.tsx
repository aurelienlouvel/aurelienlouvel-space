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

  // Préparation du pool d'items : M0 au sommet (slot 0), puis M1, M2... strictement en-dessous
  const { pool, cycleCount } = useMemo(() => {
    if (!gallery || gallery.length === 0 || !principalPoint) {
      return { pool: [], cycleCount: 0 };
    }

    const n = gallery.length;
    // Si 1 seul média, 1 seul slot
    const repeats = n === 1 ? 1 : Math.max(3, Math.ceil(15 / n));
    const totalSlots = n * repeats;

    const slots: PoolSlot[] = [];

    for (let j = 0; j < totalSlots; j++) {
      // Ordre strict de la galerie : 0, 1, 2, ..., n-1, 0, 1, 2...
      const gIdx = j % n;
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
        relativeIdx: j, // 0 = média principal M0, > 0 = sous M0
      });
    }

    return { pool: slots, cycleCount: repeats };
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
    const effectiveGap = debug.current.transition.mediaGap ?? gap;
    const burstSlideOffset = debug.current.transition.burstSlideOffset ?? 400;

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

    // Calcul des hauteurs/largeurs de chaque slot et d'un cycle complet
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
        oneCycleHeight += slotHeights[j] + effectiveGap;
      }
    }

    const totalPoolSpan = oneCycleHeight * cycleCount;

    // Calcul des positions de repos (restingY) :
    // Slot 0 (M0) est ancré au centre (principalPoint.y).
    // Tous les slots suivants (j >= 1) s'empilent STRICTEMENT EN-DESSOUS de M0 dans l'ordre !
    const restingY: number[] = new Array(pool.length);
    restingY[0] = principalPoint.y;

    for (let j = 1; j < pool.length; j++) {
      const prevY = restingY[j - 1];
      const prevH = slotHeights[j - 1];
      const curH = slotHeights[j];
      restingY[j] = prevY - prevH * 0.5 - effectiveGap - curH * 0.5;
    }

    // ── Animation et défilement infini ──────────────────────────────────────
    const scrollY = isIsolated ? tr.columnScrollY : 0;
    const halfH = (size.height / currentZoom) * 0.5;
    const anchorY = principalPoint.y;

    // Décalage d'apparition lors du burst : les items secondaires glissent vers le haut depuis le bas
    const slideOffsetDistance = (1 - progress) * burstSlideOffset;

    pool.forEach((_item, j) => {
      const mesh = meshRefs.current[j];
      if (!mesh) return;

      const isMain = j === 0;

      let y = restingY[j] + scrollY;
      if (!isMain && isBursting) {
        // Glissement vers le haut depuis le bas
        y -= slideOffsetDistance;
      }

      // Bouclage infini en mode isolé
      if (n > 1 && totalPoolSpan > 100 && isIsolated) {
        // Si l'item a défilé trop haut au-dessus de l'écran, il repasse en bas
        while (y - anchorY > halfH + 400) {
          y -= totalPoolSpan;
        }
        // Si l'utilisateur a défilé vers le bas (scrollY positif) et qu'un item est trop bas, il repasse en haut
        while (y - anchorY < -halfH - 400 - totalPoolSpan * 0.5 && scrollY > oneCycleHeight * 0.5) {
          y += totalPoolSpan;
        }
      }

      mesh.position.set(principalPoint.x, y, 0);

      // Échelle du mesh
      if (isMain && isBursting) {
        // M0 : transition fluide depuis sa taille dans la grille vers la taille finale en colonne
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
        if (isMain) {
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
