import { useMemo, useEffect } from "react";
import * as THREE from "three";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import {
  CARD_W,
  MIN_CARD_H,
  MAX_CARD_H,
  _videoDimsCache,
} from "@/lib/artifact-utils";

// ─── Video textures — backed by module-level cache so videos survive remounts ──
//
//  On first visit: creates video elements + textures, stores in _videoCache.
//  On revisit: _videoCache already populated → instant, videos still playing.
//  No cleanup on unmount: muted 1px videos keep playing in background;
//  they're reused the moment the user comes back.
//
const _videoCache = new Map<string, THREE.VideoTexture>();

export function usePlayVideoTextures(
  artifacts: ArtifactCanvasItem[],
  onRatioDetected: () => void,
): Map<string, THREE.VideoTexture> {
  const videoTextures = useMemo(() => {
    if (typeof document === "undefined") return _videoCache;

    artifacts.forEach((a) => {
      if (_videoCache.has(a._id)) return; // already created, reuse
      const m = a.firstMedia;
      if (m?._type !== "galleryVideo" || !m.videoFileUrl) return;

      const vid = document.createElement("video");
      vid.crossOrigin = "anonymous"; // MUST be before src to avoid CORS taint
      vid.src = m.videoFileUrl;
      vid.muted = true;
      vid.autoplay = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.preload = "auto"; // texture WebGL — streaming complet nécessaire
      Object.assign(vid.style, {
        position: "fixed",
        opacity: "0",
        pointerEvents: "none",
        width: "1px",
        height: "1px",
        top: "0",
        left: "0",
      });
      document.body.appendChild(vid);
      vid.play().catch(() => {
        const retry = () => vid.play().catch(() => {});
        document.addEventListener("click", retry, { once: true });
        document.addEventListener("touchstart", retry, { once: true });
      });

      const tex = new THREE.VideoTexture(vid);
      tex.colorSpace = THREE.SRGBColorSpace;
      _videoCache.set(a._id, tex);
    });

    return _videoCache;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts.length]);

  // Détection du ratio réel des vidéos — Sanity ne stocke pas les dimensions.
  // Quand loadedmetadata est disponible, on met à jour le cache et on rebuild la tile.
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    artifacts.forEach((a) => {
      if (a.firstMedia?._type !== "galleryVideo") return;
      if (_videoDimsCache.has(a._id)) return; // déjà détecté

      const tex = _videoCache.get(a._id);
      if (!tex) return;
      const vid = tex.image as HTMLVideoElement;

      const update = () => {
        if (!vid.videoWidth || !vid.videoHeight) return;
        const h = Math.max(
          MIN_CARD_H,
          Math.min(
            MAX_CARD_H,
            Math.round((CARD_W * vid.videoHeight) / vid.videoWidth),
          ),
        );
        _videoDimsCache.set(a._id, h);
        onRatioDetected(); // reconstruit la tile avec le vrai ratio
      };

      if (vid.readyState >= 1 /* HAVE_METADATA */) {
        update();
      } else {
        vid.addEventListener("loadedmetadata", update, { once: true });
        cleanups.push(() => vid.removeEventListener("loadedmetadata", update));
      }
    });

    return () => cleanups.forEach((fn) => fn());
  }, [artifacts, onRatioDetected]);

  return videoTextures;
}
