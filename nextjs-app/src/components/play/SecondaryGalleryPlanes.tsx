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

type PreparedItem = {
  key: string;
  url: string;
  kind: "image" | "video";
  width: number;
  height: number;
  restingY: number;
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

  // Largeur cible : exactement 1/6 de la largeur d'écran en coordonnées monde
  const visibleW = size.width / Math.max(0.01, camera.zoom);
  const targetColWidth = visibleW / 6;

  // Liste des items secondaires avec répétition pour garantir un défilement infini
  const { itemsToDisplay, totalHeight } = useMemo(() => {
    if (!gallery || gallery.length === 0 || !principalPoint) {
      return { itemsToDisplay: [], totalHeight: 0 };
    }

    // Si la galerie a 1 seul média, on le répète. Sinon on prend les médias à partir de l'index 1.
    const rawBase = gallery.length > 1 ? gallery.slice(1) : [gallery[0]];
    const repeats = Math.max(1, Math.ceil(8 / rawBase.length));
    const fullList: ArtifactGalleryItem[] = [];
    for (let r = 0; r < repeats; r++) {
      fullList.push(...rawBase);
    }

    const principalRatio = principalPoint.width / Math.max(1, principalPoint.height);
    const principalH = targetColWidth / principalRatio;
    let currentTop = principalPoint.y - principalH * 0.5;
    const prepared: PreparedItem[] = [];

    fullList.forEach((item, idx) => {
      const isVideo = item._type === "galleryVideo";
      const url = isVideo
        ? (item.videoUrl || fileRefToUrl(item.videoRef) || "")
        : (item.imageRef
            ? buildImageUrl(item.imageRef, item.imageUrl ?? null, null, null, { width: 1400 })
            : (item.imageUrl ?? ""));

      if (!url) return;

      const ratio =
        item.imageWidth && item.imageHeight
          ? item.imageWidth / item.imageHeight
          : isVideo
            ? 16 / 9
            : 1.5;

      const width = targetColWidth;
      const height = width / ratio;
      const restingY = currentTop - gap - height * 0.5;
      currentTop = restingY - height * 0.5;

      prepared.push({
        key: `${item._key || idx}-${idx}`,
        url,
        kind: isVideo ? "video" : "image",
        width,
        height,
        restingY,
      });
    });

    const computedTotalHeight = Math.abs(currentTop - (principalPoint.y - principalH * 0.5));
    return { itemsToDisplay: prepared, totalHeight: computedTotalHeight };
  }, [gallery, principalPoint, gap, targetColWidth]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

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

    // Apparition par le bas lors du burst
    const slideOffset = (1 - progress) * 350;
    const scrollY = isIsolated ? tr.columnScrollY : 0;
    const halfH = (size.height / Math.max(0.01, camera.zoom)) * 0.5;
    const anchorY = principalPoint?.y ?? 0;

    itemsToDisplay.forEach((item, idx) => {
      const mesh = meshRefs.current[idx];
      if (!mesh) return;

      let y = item.restingY - slideOffset + scrollY;

      // Bouclage infini régulier sans à-coup
      if (totalHeight > 100) {
        while (y - anchorY > halfH + 200) {
          y -= totalHeight;
        }
        while (y - anchorY < -halfH - 200 - totalHeight * 0.5) {
          y += totalHeight;
        }
      }

      mesh.position.set(
        principalPoint?.x ?? 0,
        y,
        0,
      );
      mesh.scale.set(item.width, item.height, 1);

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        mat.opacity = progress;
      }
    });
  });

  if (!principalPoint || itemsToDisplay.length === 0) {
    return null;
  }

  return (
    <group ref={groupRef} visible={false}>
      {itemsToDisplay.map((item, idx) => (
        <Suspense key={item.key} fallback={null}>
          <ArtifactPlane
            url={item.url}
            kind={item.kind}
            x={principalPoint.x}
            y={item.restingY}
            width={item.width}
            height={item.height}
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
