const FILE_REF_RE = /^file-([a-f0-9]+)-(\w+)$/;

export function fileRefToUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const match = ref.match(FILE_REF_RE);
  if (!match) return null;
  return `https://cdn.sanity.io/files/87awwrcu/production/${match[1]}.${match[2]}`;
}

/**
 * URL same-origin (via `/api/media`) d'un média Sanity, pour les chargements en
 * mode CORS du canvas /play (textures three.js). Les URLs qui ne sont pas des
 * assets Sanity (vidéo externe, chemin relatif) sont renvoyées telles quelles.
 */
export function playMediaUrl(url: string): string {
  if (!url || !url.startsWith("https://cdn.sanity.io/")) return url;
  return `/api/media?u=${encodeURIComponent(url)}`;
}

const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "ogg", "avi"]);

export function isVideoRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  const match = ref.match(FILE_REF_RE);
  if (!match) return false;
  return VIDEO_EXTS.has(match[2].toLowerCase());
}
