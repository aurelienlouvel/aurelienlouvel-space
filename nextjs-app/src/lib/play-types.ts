import type { ArtifactCanvasItem } from "@/sanity/queries";

// ─── Single-instance selection ────────────────────────────────────────────────
//  Regular React state (lives in InfiniteCanvas) — drives render-time decisions
//  (which grid instance pops/raycast-disables, the ActionBar/panel JSX), unlike
//  everything in PlayStoreContext.tsx which is mutated imperatively and never
//  triggers a re-render.
export type SelectedInstance = {
  artifact: ArtifactCanvasItem;
  groupIdx: number;
  itemIdx: number;
} | null;
