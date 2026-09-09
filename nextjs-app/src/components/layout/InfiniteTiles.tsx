"use client";

import { useRef, useEffect, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "motion/react";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import { ArtifactMesh } from "./ArtifactMesh";
import { CARD_W } from "@/lib/artifact-utils";
import type { Params } from "@/lib/play-params";
import type { TileLayout } from "@/lib/play-tile-layout";
import type {
  SelectedInstance,
  CameraState,
  RippleState,
} from "@/lib/play-types";
import { GridBackground } from "./GridBackground";
import { CameraController } from "./CameraController";
import { PanelPositioner } from "./PanelPositioner";

// ─── Infinite tile neighbourhood (3 × 3 = 9 groups) ─────────────────────────
export function InfiniteTiles({
  tile,
  videoTextures,
  selected,
  onSelect,
  selectTarget,
  zoomTarget,
  worldPosRef,
  halfWRef,
  halfHRef,
  panelX,
  panelY,
  paramsRef,
  cameraStateRef,
  rippleRef,
  panDeltaRef,
  dragMovedRef,
  hasGalleryRef,
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
  selectTarget: React.MutableRefObject<{ x: number; y: number } | null>;
  zoomTarget: React.MutableRefObject<number>;
  worldPosRef: React.MutableRefObject<[number, number] | null>;
  halfWRef: React.MutableRefObject<number>;
  halfHRef: React.MutableRefObject<number>;
  panelX: MotionValue<number>;
  panelY: MotionValue<number>;
  paramsRef: React.MutableRefObject<Params>;
  cameraStateRef: React.MutableRefObject<CameraState>;
  rippleRef: React.MutableRefObject<RippleState | null>;
  panDeltaRef: React.MutableRefObject<{ x: number; y: number }>;
  dragMovedRef: React.MutableRefObject<boolean>;
  hasGalleryRef: React.MutableRefObject<boolean>;
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
      <GridBackground
        paramsRef={paramsRef}
        cameraStateRef={cameraStateRef}
        rippleRef={rippleRef}
      />
      <CameraController
        selectTarget={selectTarget}
        zoomTarget={zoomTarget}
        panDeltaRef={panDeltaRef}
        dragMovedRef={dragMovedRef}
        hasGalleryRef={hasGalleryRef}
        active={active}
        running={running}
        introKey={introKey}
      />
      <PanelPositioner
        worldPosRef={worldPosRef}
        halfWRef={halfWRef}
        halfHRef={halfHRef}
        panelX={panelX}
        panelY={panelY}
        paramsRef={paramsRef}
        isMobile={isMobile}
      />
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
                <ArtifactMesh
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
                  paramsRef={paramsRef}
                />
              </Suspense>
            ))}
          </group>
        );
      })}
    </>
  );
}
