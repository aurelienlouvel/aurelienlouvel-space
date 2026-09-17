/**
 * Ratios (largeur / hauteur) des assets Sanity de type `file` (png/gif/mp4/webm) :
 * Sanity ne stocke PAS leurs dimensions (`metadata.dimensions` est null pour les
 * fichiers, contrairement aux assets `image`). On fige donc ici les ratios
 * mesurés — ce qui couvre images ET vidéos. Partagé par les thumbnails de
 * `/work` (`ProjectCard`) et par les artifacts tout-vidéo de `/play`
 * (cf. `artifact-media.ts`) : même problème, même table plutôt que d'en
 * inventer une deuxième.
 *
 * Keyé par ref d'asset : si un thumbnail change, sa ref change → le lookup
 * retombe proprement sur DEFAULT (jamais un ratio FAUX).
 *
 * ⟳ Régénérer après ajout/changement de média : mesurer les dimensions
 *   réelles (`new Image()`/`<video>` en console navigateur, ou `ffprobe
 *   -select_streams v:0 -show_entries stream=width,height <url>` pour une
 *   vidéo) et reporter les ratios ci-dessous.
 */
export const THUMBNAIL_RATIOS: Record<string, number> = {
  "file-12837bc3884b239c6072117e9b9b08e664c51363-png": 1.3333,
  "file-2af8af6af51e6189b3b1374b2a9a948d6b219220-gif": 1.3333,
  "file-3c999aefccb81b4193e0394636e12894295745bb-png": 0.9922,
  "file-261f9d5a71ca58cb5265fdec6a115b9d43c2e8fa-png": 1.28,
  "file-73d1fe87d72cdf82aafb11974d6bbffceb357656-png": 1,
  "file-2402d54d41a5ed53d652dd729d415a5916403bd3-png": 1.5988,
  "file-3186db0c93a05a82bc2b8d24392b7447b6c57023-png": 1.4629,
  "file-79f53bb733295b40bc49f458aa80da93a941cd35-mp4": 1.7778,
  "file-6029ddaf9577969c12b19ab76ab9a0678a025230-webm": 1,
  "file-9e5a258e608cbeeede1c7d75cddabd84e487e594-png": 1.1378,
  "file-e7c7dae0ab1c2ad174300918b7513249574b2c10-png": 1.4629,
  "file-e6190bf19735fc6ed86ce3b3807dcdbbcf509800-png": 0.9309,
  "file-2f12032e4711880e8d304c7bedcc67aa215707f8-webm": 1.0667,
  "file-9c4990b25a3ef1d5d55ac948322542ed933c47bc-png": 0.9922,
  "file-c8b3d584bcd25fd5d1565664a21cdf8020477472-webm": 1,
  "file-9767bb7722bb5161c36923f0fb66b773b3555118-webm": 1.2,
  // Artifacts /play tout-vidéo (cf. `artifact-media.ts`) — mesurés via ffprobe.
  "file-c433f2eec59a07339702521f9e6619c77ceb775a-mp4": 1.5, // beuleu-shooter.js, 1620×1080
  "file-5cada71ae139c967ce0e98354999825228ffa23b-mp4": 1, // cadillac.blend, 960×960
  "file-4b3f84736bc6ceb3786f3dc12015bad933079fab-webm": 0.46, // unlock.app, 804×1748 (portrait)
  "file-defbff963e967b97ead0c795ffafe7aeb3e2c6c9-mp4": 1.5, // #efface, 1620×1080
};

/** Fallback pour un thumbnail non mesuré (nouveau média) — paysage doux. */
export const DEFAULT_THUMBNAIL_RATIO = 4 / 3;

export function thumbnailRatio(ref: string | null | undefined): number {
  if (!ref) return DEFAULT_THUMBNAIL_RATIO;
  return THUMBNAIL_RATIOS[ref] ?? DEFAULT_THUMBNAIL_RATIO;
}
