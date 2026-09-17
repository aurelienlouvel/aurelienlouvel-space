/**
 * Résout le média d'un artifact (`PlayArtifact.media`, cf. `queries.ts`) en une
 * forme exploitable par le canvas /play : un ratio, plus soit une ref d'image
 * Sanity soit une URL de vidéo — quel que soit le type Sanity d'origine
 * (`galleryImage` ou `galleryVideo`).
 *
 * Extrait de `PlayCanvas.tsx` plutôt que laissé inline : c'est la seule pièce
 * de logique de ce composant qui ne touche ni three ni React, donc testable et
 * relisible séparément — même choix que `scatter-layout.ts`.
 */

import { fileRefToUrl } from "@/lib/sanity-utils";
import { DEFAULT_THUMBNAIL_RATIO, thumbnailRatio } from "@/lib/thumbnail-ratios";
import type { PlayArtifact } from "@/sanity/queries";

export type ResolvedMedia =
  | { kind: "image"; ref: string; ratio: number }
  | { kind: "video"; url: string; ratio: number };

/** Extrait pour que `ArtifactGrid`/`ArtifactPlane` n'aient pas à répéter l'union littérale. */
export type MediaKind = ResolvedMedia["kind"];

/**
 * `fileRefToUrl` retourne `null` pour une vidéo hébergée en externe (champ
 * `url` du schéma, pas de fichier uploadé) — on retombe alors sur `videoUrl`.
 * Le ratio d'une vidéo, lui, n'est jamais connu de Sanity (les assets de type
 * `file` n'ont pas de `metadata.dimensions`) : `thumbnailRatio` retrouve la
 * valeur mesurée à la main pour `videoRef` (même table que les thumbnails
 * vidéo de `/work`, cf. `thumbnail-ratios.ts`), et ne retombe sur le défaut
 * sitewide que pour une vidéo pas encore mesurée — jamais un ratio inventé
 * pour un artifact qui a, lui, une vraie forme à respecter.
 */
export function resolveArtifactMedia(artifact: PlayArtifact): ResolvedMedia {
  const { media } = artifact;
  if (media._type === "galleryVideo") {
    const url = fileRefToUrl(media.videoRef) ?? media.videoUrl ?? "";
    return { kind: "video", url, ratio: thumbnailRatio(media.videoRef) };
  }
  const ratio =
    media.imageWidth && media.imageHeight
      ? media.imageWidth / media.imageHeight
      : DEFAULT_THUMBNAIL_RATIO;
  return { kind: "image", ref: media.imageRef ?? "", ratio };
}
