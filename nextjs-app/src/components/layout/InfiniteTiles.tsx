"use client";

import { useRef, useEffect, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import { GridCard } from "./GridCard";
import { CARD_W, STACK_LAYER_COUNT, _videoDimsCache } from "@/lib/artifact-utils";
import type { TileLayout } from "@/lib/play-tile-layout";
import type { SelectedInstance } from "@/lib/play-types";
import { GridBackground } from "./GridBackground";
import { CameraController } from "./CameraController";
import { PanelPositioner } from "./PanelPositioner";

// ─── Infinite tile neighbourhood (3 × 3 = 9 groups) ─────────────────────────
//  Thin prop surface — everything that used to be individually prop-drilled
//  (selectTarget, zoomTarget, worldPos/halfW/halfH, panelX/Y, paramsRef,
//  cameraStateRef, rippleRef, panDeltaRef, dragMovedRef, hasGalleryRef) now
//  lives in the shared PlayRuntime; GridBackground/CameraController/
//  PanelPositioner/GridCard each pull what they need straight from
//  usePlayStore(). Only the values that genuinely come from OUTSIDE the R3F
//  tree (the tile layout itself, video textures, which instance is selected,
//  the select callback, and the rare React-state flags) still arrive as props.
export function InfiniteTiles({
  tile,
  videoTextures,
  selected,
  onSelect,
  active,
  running,
  introKey,
  isMobile,
}: {
  tile: TileLayout;
  videoTextures: Map<string, THREE.VideoTexture>;
  selected: SelectedInstance;
  onSelect: (
    item: ArtifactCanvasItem,
    point: [number, number],
    halfW: number,
    halfH: number,
    groupIdx: number,
    itemIdx: number,
  ) => void;
  active: boolean;
  running: boolean;
  introKey: number;
  isMobile: boolean;
}) {
  const { camera } = useThree();
  const { TILE_W, TILE_H, items, positions } = tile;

  const groupRefs = useRef<(THREE.Group | null)[]>(Array(9).fill(null));
  const prevTile = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        groupRefs.current[k]?.position.set(dx * TILE_W, dy * TILE_H, 0);
        k++;
      }
    }
    prevTile.current = { x: 0, y: 0 };
  }, [TILE_W, TILE_H]);

  useFrame(() => {
    // Ne pas repositionner les tuiles pendant un focus — évite que la copie
    // sélectionnée saute hors écran et soit remplacée par une copie dimmée.
    if (selected) return;
    const tx = Math.round(camera.position.x / TILE_W);
    const ty = Math.round(camera.position.y / TILE_H);
    if (tx === prevTile.current.x && ty === prevTile.current.y) return;
    prevTile.current = { x: tx, y: ty };
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        groupRefs.current[k]?.position.set(
          (tx + dx) * TILE_W,
          (ty + dy) * TILE_H,
          0,
        );
        k++;
      }
    }
  });

  return (
    <>
      <GridBackground />
      <CameraController active={active} running={running} introKey={introKey} />
      <PanelPositioner isMobile={isMobile} />
      {Array.from({ length: 9 }, (_, k) => {
        const dx = (k % 3) - 1;
        const dy = Math.floor(k / 3) - 1;
        return (
          <group
            key={k}
            ref={(el) => {
              groupRefs.current[k] = el;
            }}
            position={[dx * TILE_W, dy * TILE_H, 0]}
          >
            {items.map(({ item, key, scale, cardH }, i) => (
              <Suspense key={key} fallback={null}>
                <GridCard
                  artifact={item}
                  worldPos={positions[i] ?? [0, 0]}
                  isSelected={
                    selected !== null &&
                    selected.groupIdx === k &&
                    selected.itemIdx === i
                  }
                  cardScale={scale}
                  cardH={cardH}
                  onSelect={(point) =>
                    onSelect(
                      item,
                      point,
                      (CARD_W * scale) / 2,
                      (cardH * scale) / 2,
                      k,
                      i,
                    )
                  }
                  videoTexture={videoTextures.get(item._id)}
                  stackVideoTextures={item.gallery
                    ?.slice(1, 1 + STACK_LAYER_COUNT)
                    .map((_, gi) => videoTextures.get(`${item._id}:${gi + 1}`))}
                  // Reference height (at CARD_W, pre-cardScale — same convention
                  // as getCardHeight()) for stack-layer videos whose ratio has
                  // been runtime-detected — see usePlayVideoTextures.ts. undefined
                  // until detected; GridCard.tsx falls back to 16:9 meanwhile.
                  stackVideoRefHeights={item.gallery
                    ?.slice(1, 1 + STACK_LAYER_COUNT)
                    .map((_, gi) => _videoDimsCache.get(`${item._id}:${gi + 1}`))}
                />
              </Suspense>
            ))}
          </group>
        );
      })}
    </>
  );
}
