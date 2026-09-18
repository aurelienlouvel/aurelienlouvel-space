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

  // Préparation du pool d'items : M0 au sommet (slot 0), puis M1, M2... strictement en-dessous
  const { pool, cycleCount, uniqueCount } = useMemo(() => {
    if (!principalPoint) {
      return { pool: [], cycleCount: 0, uniqueCount: 0 };
    }

    const secondaryItems =
      gallery && gallery.length > 1 ? gallery.slice(1) : [];

    const slots: PoolSlot[] = [];

    // Cas 1 : Artifact à média unique (pas d'items secondaires)
    // On répète M0 pour former la colonne et permettre le rouleau 777
    if (secondaryItems.length === 0) {
      const isVideo = primaryMedia.kind === "video";
      const repeats = isVideo ? 9 : 18;
      for (let r = 0; r < repeats; r++) {
        slots.push({
          key: r === 0 ? "slot-0-main" : `slot-single-${r}`,
          url: primaryMedia.url,
          kind: primaryMedia.kind,
          ratio: Math.max(0.2, primaryMedia.ratio),
          galleryIdx: 0,
          relativeIdx: r,
        });
      }
      return { pool: slots, cycleCount: repeats, uniqueCount: 1 };
    }

    // Cas 2 : Artifact multi-médias
    // On structure en cycles périodiques stricts : [M0, M1, ..., Mn]
    const n = secondaryItems.length;
    const uCount = n + 1; // M0 + M1...Mn
    // Nombre de cycles pour avoir au moins 18 items, arrondi à un multiple de 3
    const baseCycles = Math.max(2, Math.ceil(18 / uCount));
    const cycles = Math.ceil(baseCycles / 3) * 3;

    for (let c = 0; c < cycles; c++) {
      // 1. M0 au début de chaque cycle
      slots.push({
        key: c === 0 ? "slot-0-main" : `slot-${c}-main-repeat`,
        url: primaryMedia.url,
        kind: primaryMedia.kind,
        ratio: Math.max(0.2, primaryMedia.ratio),
        galleryIdx: 0,
        relativeIdx: slots.length,
      });

      // 2. Éléments secondaires M1, M2, ... Mn
      for (let k = 0; k < n; k++) {
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

        slots.push({
          key: `slot-${c}-${k + 1}`,
          url,
          kind: isVideo ? "video" : "image",
          ratio: Math.max(0.2, ratio),
          galleryIdx: k + 1,
          relativeIdx: slots.length,
        });
      }
    }

    return { pool: slots, cycleCount: cycles, uniqueCount: uCount };
  }, [gallery, principalPoint, primaryMedia]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !principalPoint || pool.length === 0) return;

    const tr = runtime.current.transition;
    const isBursting = tr.phase === "burst";
    const isReeling = tr.phase === "reel";
    const isDezooming = tr.phase === "dezoom";
    const isIsolated = tr.phase === "isolated";
    const isReturning = tr.phase === "returning";

    if (!isBursting && !isReeling && !isDezooming && !isIsolated && !isReturning) {
      group.visible = false;
      return;
    }

    group.visible = true;

    let progress = 1;
    if (isBursting) {
      progress = tr.easedBurstProgress;
    } else if (isReeling || isDezooming || isIsolated) {
      progress = 1;
    } else if (isReturning) {
      const returnProg = tr.easedReturnProgress ?? 0;
      progress = Math.max(0, 1 - returnProg);
    }

    const currentZoom = Math.max(0.01, camera.zoom);
    const effectiveGap = debug.current.transition.mediaGap ?? gap;
    const burstSlideOffset = debug.current.transition.burstSlideOffset ?? 400;
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

    // Calcul des hauteurs/largeurs de chaque slot et d'un cycle complet
    const slotHeights: number[] = new Array(pool.length);
    const slotWidths: number[] = new Array(pool.length);

    for (let j = 0; j < pool.length; j++) {
      const r = pool[j].ratio;
      if (isDesktop) {
        slotWidths[j] = baseColWidth;
        slotHeights[j] = baseColWidth / r;
      } else {
        slotHeights[j] = baseColHeight;
        slotWidths[j] = baseColHeight * r;
      }
    }

    let oneCycleHeight = 0;
    const activeCycleLen = Math.max(1, uniqueCount);
    for (let j = 0; j < activeCycleLen && j < pool.length; j++) {
      oneCycleHeight += slotHeights[j] + effectiveGap;
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

    // ── Animation et défilement ─────────────────────────────────────────────
    let scrollY = 0;
    if (isReeling) {
      const reelLoops = debug.current.transition.reelLoops ?? 3;
      scrollY = reelLoops * oneCycleHeight * (tr.easedReelProgress ?? 0);
    } else if (isDezooming || isIsolated || isReturning) {
      scrollY = tr.columnScrollY;
    }

    const halfH = (size.height / currentZoom) * 0.5;
    const anchorY = principalPoint.y;

    // Décalage d'apparition lors du burst / disparition lors du return
    const slideOffsetDistance = isBursting
      ? (1 - progress) * burstSlideOffset
      : isReturning
        ? (1 - progress) * exitSlideOffset
        : 0;

    pool.forEach((_item, j) => {
      const mesh = meshRefs.current[j];
      if (!mesh) return;

      const isMain = j === 0;

      let y = restingY[j] + scrollY;
      if (!isMain && (isBursting || isReturning)) {
        // Glissement vers le haut depuis le bas à l'entrée, vers le bas à la sortie
        y -= slideOffsetDistance;
      }

      // Bouclage infini modulaire en mode reel, dezoom et isolé
      if (pool.length > 1 && totalPoolSpan > 100) {
        if (isReeling || isDezooming || isIsolated) {
          const topLimit = halfH + Math.max(300, slotHeights[0]);
          y = anchorY + wrapPeriodic(y - anchorY, totalPoolSpan, topLimit);
        }
      }

      mesh.position.set(principalPoint.x, y, 0);

      // Échelle du mesh
      if (isMain) {
        if (isBursting || isReturning) {
          // M0 : transition fluide entre la taille mosaïque et la taille colonne
          const startW = principalPoint.width * (debug.current.transition.selectScale || 1.0);
          const startH = principalPoint.height * (debug.current.transition.selectScale || 1.0);
          const curW = startW + (slotWidths[j] - startW) * progress;
          const curH = startH + (slotHeights[j] - startH) * progress;
          mesh.scale.set(curW, curH, 1);
        } else {
          mesh.scale.set(slotWidths[j], slotHeights[j], 1);
        }
      } else {
        mesh.scale.set(slotWidths[j], slotHeights[j], 1);
      }

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        if (isMain) {
          mat.opacity = 1; // M0 reste toujours visible à 100%
        } else {
          mat.opacity = progress; // Les secondaires s'estompent à l'entrée et à la sortie
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
