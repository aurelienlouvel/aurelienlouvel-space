import { useMemo, useEffect } from "react";
import * as THREE from "three";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import {
  CARD_W,
  MIN_CARD_H,
  MAX_CARD_H,
  STACK_LAYER_COUNT,
  _videoDimsCache,
} from "@/lib/artifact-utils";

// ─── Video textures — backed by module-level cache so videos survive remounts ──
//
//  On first visit: creates video elements + textures, stores in _videoCache.
//  On revisit: _videoCache already populated → instant, videos still playing.
//  No cleanup on unmount: muted 1px videos keep playing in background;
//  they're reused the moment the user comes back.
//
//  Keyed by artifact._id for the front/grid media, and by `${id}:${index}`
//  for gallery stack backing layers (GridCard.tsx's StackLayers, index
//  1..STACK_LAYER_COUNT) — InfiniteTiles renders 9 simultaneous tile copies
//  of every artifact, so without this shared cache a video sitting in a
//  backing-layer slot would spin up up to 9 redundant decode pipelines
//  instead of the 1 every copy actually shares here.
//
const _videoCache = new Map<string, THREE.VideoTexture>();

function createCachedVideoTexture(key: string, url: string): void {
  const vid = document.createElement("video");
  vid.crossOrigin = "anonymous"; // MUST be before src to avoid CORS taint
  vid.src = url;
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
  _videoCache.set(key, tex);
}

export function usePlayVideoTextures(
  artifacts: ArtifactCanvasItem[],
  onRatioDetected: () => void,
): Map<string, THREE.VideoTexture> {
  const videoTextures = useMemo(() => {
    if (typeof document === "undefined") return _videoCache;

    artifacts.forEach((a) => {
      const m = a.firstMedia;
      if (m?._type === "galleryVideo" && m.videoFileUrl && !_videoCache.has(a._id)) {
        createCachedVideoTexture(a._id, m.videoFileUrl);
      }
      // Stack backing layers (see StackLayers in GridCard.tsx) — same
      // slice as makeStackLayers there (gallery[1..STACK_LAYER_COUNT]).
      a.gallery?.slice(1, 1 + STACK_LAYER_COUNT).forEach((gm, i) => {
        const key = `${a._id}:${i + 1}`;
        if (gm._type === "galleryVideo" && gm.videoFileUrl && !_videoCache.has(key)) {
          createCachedVideoTexture(key, gm.videoFileUrl);
        }
      });
    });

    return _videoCache;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts.length]);

  // Détection du ratio réel des vidéos — Sanity ne stocke pas les dimensions.
  // Quand loadedmetadata est disponible, on met à jour le cache et on rebuild la tile.
  // Même détection pour le média principal ET les couches de stack (index 1+) —
  // sans ça, une couche de stack vidéo restait bloquée sur le fallback 16:9
  // pour toujours (jamais retentée), et pouvait s'afficher étirée si sa vraie
  // vidéo n'est pas 16:9. _videoDimsCache stocke toujours une hauteur de
  // référence à CARD_W (jamais la largeur réelle affichée) — voir
  // GridCard.tsx pour la remise à l'échelle par cardScale au call site.
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    const watch = (key: string, tex: THREE.VideoTexture | undefined) => {
      if (!tex || _videoDimsCache.has(key)) return; // pas encore chargée / déjà détecté
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
        _videoDimsCache.set(key, h);
        onRatioDetected(); // reconstruit la tile avec le vrai ratio
      };

      if (vid.readyState >= 1 /* HAVE_METADATA */) {
        update();
      } else {
        vid.addEventListener("loadedmetadata", update, { once: true });
        cleanups.push(() => vid.removeEventListener("loadedmetadata", update));
      }
    };

    artifacts.forEach((a) => {
      if (a.firstMedia?._type === "galleryVideo") {
        watch(a._id, _videoCache.get(a._id));
      }
      a.gallery?.slice(1, 1 + STACK_LAYER_COUNT).forEach((gm, i) => {
        if (gm._type === "galleryVideo") {
          watch(`${a._id}:${i + 1}`, _videoCache.get(`${a._id}:${i + 1}`));
        }
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [artifacts, onRatioDetected]);

  return videoTextures;
}
