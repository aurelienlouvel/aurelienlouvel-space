import type { ArtifactCanvasItem } from "@/sanity/queries";

// ─── Card dimensions ──────────────────────────────────────────────────────────
// CARD_W is fixed; CARD_H is the grid-spacing reference (not per-card height).
// Per-card height is computed by getCardHeight() from actual media dimensions.
export const CARD_W     = 340;
export const CARD_H     = 250; // grid reference / default fallback
export const MIN_CARD_H = 100; // allow very wide content
export const MAX_CARD_H = 700; // allow up to 9:16 portrait (604 px < 700)

// ─── Runtime video dimension cache ───────────────────────────────────────────
// Sanity ne stocke pas les métadonnées des vidéos (dimensions).
// On détecte le ratio au runtime via loadedmetadata et on le met en cache ici.
// Map : artifactId → cardH calculée à partir de videoWidth/videoHeight.
export const _videoDimsCache = new Map<string, number>();

/**
 * Hauteur réelle d'une card d'après les dimensions de son média.
 * - Images  : utilise imageWidth / imageHeight de Sanity (asset metadata)
 * - Vidéos  : utilise _videoDimsCache si disponible, sinon 16:9 par défaut
 * Clampée dans [MIN_CARD_H, MAX_CARD_H].
 */
export function getCardHeight(artifact: ArtifactCanvasItem): number {
  const m = artifact.firstMedia;
  if (m?._type === "galleryImage" && m.imageWidth && m.imageHeight && m.imageWidth > 0) {
    const h = Math.round(CARD_W * m.imageHeight / m.imageWidth);
    return Math.max(MIN_CARD_H, Math.min(MAX_CARD_H, h));
  }
  if (m?._type === "galleryVideo") {
    const cached = _videoDimsCache.get(artifact._id);
    if (cached) return cached; // ratio détecté au runtime
    return Math.round(CARD_W * 9 / 16); // 191 px — fallback 16:9 en attendant
  }
  return CARD_H;
}

// ─── Intro animation state (module-level — survives remounts / soft-navs) ──────
export const introState = {
  version:   0,
  startTime: -Infinity as number,
};

export function triggerIntro(): void {
  introState.version  += 1;
  introState.startTime = typeof performance !== "undefined" ? performance.now() : 0;
}

// ─── Outro animation state ────────────────────────────────────────────────────
export const OUTRO_DURATION    = 450; // ms — total card fade-out time
export const OUTRO_STAGGER_MAX = 120; // ms — max extra delay between cards

export const outroState = {
  version:   0,
  startTime: -Infinity as number,
};

export function triggerOutro(): void {
  outroState.version  += 1;
  outroState.startTime = typeof performance !== "undefined" ? performance.now() : 0;
}

// ─── Focus dim state ──────────────────────────────────────────────────────────
// When a card is focused, all other cards fade toward fully transparent (see
// ArtifactMesh.tsx's useCardAnimation hook for the actual formula).
// hasGallery/scrollOffset/scrollPeriod bridge the in-canvas gallery stack
// (ArtifactMesh.tsx's GalleryStack) with CameraController's wheel/drag
// handlers (InfiniteCanvas.tsx) — same "module-level mutable state read every
// frame" idiom as isActive, just for the focused artifact's own scroll.
// scrollOffset accumulates unclamped (raw wheel/drag delta) — GalleryStack
// wraps it modulo scrollPeriod itself, so the gallery loops infinitely
// instead of stopping at the first/last item.
export const focusState = {
  isActive: false,
  hasGallery: false,
  scrollOffset: 0,
  scrollPeriod: 0,
};

// ─── Selection pop scale ──────────────────────────────────────────────────────
// Scale bump applied to a card's mesh when it becomes the focused item (see
// ArtifactMesh.tsx's MeshBody). InfiniteCanvas.tsx's focus-zoom-box math
// multiplies the same factor into the target box so the camera zoom accounts
// for the mesh's actual popped size — keep both in sync via this constant.
export const SELECTION_POP_SCALE = 1.12;

// ─── Gallery reveal animation ───────────────────────────────────────────────
// Tuning for the stacked media BEYOND the clicked item (index 0) in
// ArtifactMesh.tsx's GalleryStack: a small staggered fade+scale-in when an
// artifact is selected, and a matching fade-out when it's deselected. Item 0
// keeps its own existing pop treatment and is never touched by this.
// The animation clock itself is a ref local to each GalleryStack instance
// (not module state here) — a shared clock would let a fast deselect-A /
// select-B (both galleries) reset A's timer while it's still playing its
// exit fade, snapping its items back to "revealing" instead of continuing
// to hide. See GalleryStack's revealStart ref.
export const GALLERY_REVEAL_STAGGER  = 55;  // ms between each item's start
export const GALLERY_REVEAL_DURATION = 340; // ms — per-item fade+scale-in
export const GALLERY_HIDE_DURATION   = 240; // ms — per-item fade-out on deselect
