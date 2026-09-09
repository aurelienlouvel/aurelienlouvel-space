"use client";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "motion/react";
import type { Params } from "@/lib/play-params";

// ─── Panel positioner ─────────────────────────────────────────────────────────
export function PanelPositioner({
  worldPosRef,
  halfWRef,
  halfHRef,
  panelX,
  panelY,
  paramsRef,
  isMobile,
}: {
  worldPosRef: React.MutableRefObject<[number, number] | null>;
  halfWRef: React.MutableRefObject<number>;
  halfHRef: React.MutableRefObject<number>;
  panelX: MotionValue<number>;
  panelY: MotionValue<number>;
  paramsRef: React.MutableRefObject<Params>;
  isMobile: boolean;
}) {
  const { camera, size } = useThree();

  useFrame(() => {
    const wp = worldPosRef.current;
    if (!wp) return;
    const cam = camera as THREE.OrthographicCamera;
    const sx = (wp[0] - cam.position.x) * cam.zoom + size.width / 2;
    const sy = -(wp[1] - cam.position.y) * cam.zoom + size.height / 2;
    const halfW = halfWRef.current * cam.zoom;
    const halfH = halfHRef.current * cam.zoom;
    const gap = paramsRef.current.gapPanel;
    if (isMobile) {
      // panel sous la card, aligné sur son bord gauche
      panelX.set(sx - halfW);
      panelY.set(sy + halfH + gap);
    } else {
      // panel à droite de la card, aligné en haut
      panelX.set(sx + halfW + gap);
      panelY.set(sy - halfH);
    }
  });

  return null;
}
