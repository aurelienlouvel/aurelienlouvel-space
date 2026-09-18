"use client";

import { useRef, useMemo, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
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
  const groupRef = useRef<Group>(null);
  const meshRefs = useRef<(Mesh | null)[]>([]);

  // Secondary items are items from index 1, or repeat index 0 if only 1 item exists
  const itemsToDisplay = useMemo(() => {
    if (!gallery || gallery.length === 0 || !principalPoint) return [];
    const rawItems = gallery.length > 1 ? gallery.slice(1) : [gallery[0]];

    let currentTop = principalPoint.y - principalPoint.height * 0.5;
    const prepared: PreparedItem[] = [];

    rawItems.forEach((item, idx) => {
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

      const width = principalPoint.width;
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

    return prepared;
  }, [gallery, principalPoint, gap]);

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

    // Secondary items slide up from the bottom (offset downwards when progress < 1)
    const slideOffset = (1 - progress) * 350;

    itemsToDisplay.forEach((item, idx) => {
      const mesh = meshRefs.current[idx];
      if (!mesh) return;

      mesh.position.set(
        principalPoint?.x ?? 0,
        item.restingY - slideOffset,
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
