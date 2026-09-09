import type { ArtifactCanvasItem } from "@/sanity/queries";

// ─── Single-instance selection ────────────────────────────────────────────────
export type SelectedInstance = {
  artifact: ArtifactCanvasItem;
  groupIdx: number;
  itemIdx: number;
} | null;

// ─── Camera / ripple ref shapes ────────────────────────────────────────────────
//  Written every frame by GridBackground (camera state) and by the Canvas's
//  native onPointerDown handler (ripple), read by GridBackground's useFrame —
//  same "signal from outside the R3F tree via a ref" idiom as selectTargetRef.
export type CameraState = {
  zoom: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type RippleState = { x: number; y: number; startTime: number };
