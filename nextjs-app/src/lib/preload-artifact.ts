"use client";

import type { ArtifactDetail } from "@/sanity/queries";
import { buildImageUrl } from "./sanity-image";
import { fileRefToUrl } from "./sanity-utils";

const artifactPromiseCache = new Map<string, Promise<ArtifactDetail | null>>();
const artifactDataCache = new Map<string, ArtifactDetail>();
const preloadedElements = new Set<HTMLImageElement | HTMLVideoElement>();

/**
 * Preload all artifact data, images, and videos in the background
 * as soon as the user starts holding on an artifact in /play.
 */
export function preloadArtifact(
  slug: string,
): Promise<ArtifactDetail | null> {
  if (!slug) return Promise.resolve(null);

  // Return existing promise if already requested
  const existing = artifactPromiseCache.get(slug);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data: ArtifactDetail = await res.json();
      artifactDataCache.set(slug, data);

      // Preload gallery media assets into browser cache & three.js texture cache
      if (Array.isArray(data.gallery)) {
        for (const item of data.gallery) {
          if (item._type === "galleryImage" && item.imageRef) {
            const url = buildImageUrl(item.imageRef, item.imageUrl ?? null, null, null, {
              width: 1400,
            });
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = url;
            preloadedElements.add(img);
          } else if (item._type === "galleryVideo") {
            const videoUrl = item.videoUrl || fileRefToUrl(item.videoRef);
            if (videoUrl) {
              const video = document.createElement("video");
              video.crossOrigin = "anonymous";
              video.preload = "auto";
              video.src = videoUrl;
              video.load();
              preloadedElements.add(video);
            }
          }
        }
      }

      // Preload contributor avatars
      if (Array.isArray(data.contributors)) {
        for (const c of data.contributors) {
          if (c.person?.avatarUrl) {
            const img = new Image();
            img.src = c.person.avatarUrl;
            preloadedElements.add(img);
          }
        }
      }

      return data;
    } catch (err) {
      console.warn(`[preloadArtifact] Failed to preload artifact "${slug}":`, err);
      return null;
    }
  })();

  artifactPromiseCache.set(slug, promise);
  return promise;
}

export function getCachedArtifact(slug: string): ArtifactDetail | null {
  return artifactDataCache.get(slug) ?? null;
}
