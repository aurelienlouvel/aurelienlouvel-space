"use client";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePlayStore } from "@/contexts/PlayStoreContext";

// ─── Panel positioner ─────────────────────────────────────────────────────────
//  Projects the focused card's world position to screen space every frame and
//  writes it into store.panel.x/y (MotionValues — InfiniteCanvas's panel JSX
//  binds directly to them, no re-render). isMobile stays a prop: it's a rare,
//  React-driven layout switch, not per-frame runtime state.
export function PanelPositioner({ isMobile }: { isMobile: boolean }) {
  const store = usePlayStore();
  const { camera, size } = useThree();

  useFrame(() => {
    const wp = store.focus.worldPos;
    if (!wp) return;
    const cam = camera as THREE.OrthographicCamera;
    const sx = (wp[0] - cam.position.x) * cam.zoom + size.width / 2;
    const sy = -(wp[1] - cam.position.y) * cam.zoom + size.height / 2;
    const halfW = store.focus.halfW * cam.zoom;
    const halfH = store.focus.halfH * cam.zoom;
    const gap = store.params.gapPanel;
    if (isMobile) {
      // panel sous la card, aligné sur son bord gauche
      store.panel.x.set(sx - halfW);
      store.panel.y.set(sy + halfH + gap);
    } else {
      // panel à droite de la card, ancré verticalement à panelVAnchor
      // fraction depuis le BAS de la card (0=bas, 1=haut) — 0.6 par défaut :
      // plus centré que l'ancien alignement strict sur le haut (panelVAnchor=1).
      store.panel.x.set(sx + halfW + gap);
      store.panel.y.set(sy + halfH * (1 - 2 * store.params.panelVAnchor));
    }
  });

  return null;
}
