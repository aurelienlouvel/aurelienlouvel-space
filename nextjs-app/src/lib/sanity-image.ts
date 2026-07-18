import { createImageUrlBuilder } from "@sanity/image-url";
import { projectId, dataset } from "@/sanity/env";

type Hotspot = { x: number; y: number; width: number; height: number };
type Crop = { top: number; bottom: number; left: number; right: number };

const builder = createImageUrlBuilder({ projectId, dataset });

/**
 * Retourne l'URL optimisée via le CDN Sanity :
 *  - auto("format") → WebP / AVIF selon le navigateur (gain ~40 %)
 *  - quality 85 par défaut
 *  - width optionnel pour limiter la résolution selon le contexte
 *  - crop / hotspot appliqués si fournis
 *
 * Contextes recommandés :
 *  - Canvas play  : width 680  (CARD_W 340 × 2 pour retina)
 *  - Grille work  : width 800  (3 cols, ~250px × 2 + marge)
 *  - Media bloc   : width 1600 (pleine largeur × 2 pour retina)
 */
export function buildImageUrl(
  ref: string,
  rawUrl: string | null,
  hotspot?: Hotspot | null,
  crop?: Crop | null,
  options?: { width?: number; quality?: number },
): string {
  let b = builder
    .image({
      _type: "image",
      asset: { _type: "reference", _ref: ref },
      ...(hotspot && { hotspot }),
      ...(crop    && { crop    }),
    })
    .auto("format")
    .quality(options?.quality ?? 85);

  if (options?.width) b = b.width(options.width);

  return b.url();
}

/** Convertit le hotspot Sanity en valeur CSS object-position */
export function hotspotToObjectPosition(hotspot?: Hotspot | null): string {
  if (!hotspot) return "center";
  return `${hotspot.x * 100}% ${hotspot.y * 100}%`;
}
