const FILE_REF_RE = /^file-([a-f0-9]+)-(\w+)$/;

export function fileRefToUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const match = ref.match(FILE_REF_RE);
  if (!match) return null;
  return `https://cdn.sanity.io/files/87awwrcu/production/${match[1]}.${match[2]}`;
}

/**
 * URL same-origin (via `/api/media`) d'une IMAGE Sanity, pour les chargements en
 * mode CORS du canvas /play (textures three.js).
 *
 * Les vidéos ne passent volontairement pas par le proxy : ce sont de gros
 * fichiers (lecture par ranges, bande passante de fonction Vercel) et un
 * `<video>` n'a pas besoin d'un détour par le serveur. Toute autre URL
 * (vidéo, externe, chemin relatif) est renvoyée telle quelle.
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
