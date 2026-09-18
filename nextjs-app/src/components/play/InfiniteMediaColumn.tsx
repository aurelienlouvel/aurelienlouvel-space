"use client";

import { useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react";
import Image from "next/image";
import type { ArtifactGalleryItem } from "@/sanity/queries";
import { buildImageUrl } from "@/lib/sanity-image";
import { fileRefToUrl } from "@/lib/sanity-utils";

export const MEDIA_GAP_PX = 32;
const LERP_FACTOR = 0.085;

export function MediaItem({
  item,
  title,
  index,
  priority = false,
}: {
  item: ArtifactGalleryItem;
  title: string;
  index: number;
  priority?: boolean;
}) {
  const isVideo = item._type === "galleryVideo";
  const videoUrl = item.videoUrl || fileRefToUrl(item.videoRef);
  const imageUrl = item.imageRef
    ? buildImageUrl(item.imageRef, item.imageUrl ?? null, null, null, {
        width: 1400,
        quality: 88,
      })
    : item.imageUrl;

  const aspect =
    item.imageWidth && item.imageHeight
      ? `${item.imageWidth} / ${item.imageHeight}`
      : "16 / 10";

  return (
    <div
      className="w-full relative rounded-2xl overflow-hidden bg-zinc-100 shadow-sm border border-zinc-200/50"
      style={{ aspectRatio: aspect }}
    >
      {isVideo && videoUrl ? (
        <video
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover"
        />
      ) : imageUrl ? (
        <Image
          src={imageUrl}
          alt={item.alt || `${title} — media ${index + 1}`}
          fill
          priority={priority}
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
          Media unavailable
        </div>
      )}

      {item.caption && (
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/60 to-transparent text-white text-xs">
          {item.caption}
        </div>
      )}
    </div>
  );
}

const emptySubscribe = () => () => {};

export function InfiniteMediaColumn({
  gallery,
  title,
}: {
  gallery: ArtifactGalleryItem[];
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cycleRef = useRef<HTMLDivElement>(null);

  // Repeat items to ensure a seamless infinite scroll cycle
  const { items, repeats } = useMemo(() => {
    if (!gallery || gallery.length === 0) return { items: [], repeats: 1 };
    const rep = gallery.length === 1 ? 4 : gallery.length < 3 ? 3 : 2;
    return { items: gallery, repeats: rep };
  }, [gallery]);

  const targetYRef = useRef(0);
  const currentYRef = useRef(0);
  const cycleHeightRef = useRef(0);
  const rafRef = useRef<number>(0);

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Measure one cycle height
  const updateCycleHeight = useCallback(() => {
    if (!cycleRef.current) return;
    const h = cycleRef.current.offsetHeight;
    if (h > 0) {
      cycleHeightRef.current = h;
    }
  }, []);

  useEffect(() => {
    updateCycleHeight();
    const ro = new ResizeObserver(() => updateCycleHeight());
    if (cycleRef.current) ro.observe(cycleRef.current);
    return () => ro.disconnect();
  }, [updateCycleHeight, items]);

  // Smooth lerp RAF loop with infinite modulo wrapping
  useEffect(() => {
    let active = true;

    function loop() {
      if (!active) return;
      const cycleH = cycleHeightRef.current;
      if (cycleH > 0 && containerRef.current) {
        currentYRef.current +=
          (targetYRef.current - currentYRef.current) * LERP_FACTOR;

        const normY =
          ((currentYRef.current % cycleH) + cycleH) % cycleH;

        containerRef.current.style.transform = `translate3d(0, ${-normY}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Listen to wheel anywhere on the media column or window
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      targetYRef.current += e.deltaY;
    }

    // Touch / Pointer dragging for smooth tactile interaction
    let isDragging = false;
    let startY = 0;

    function onPointerDown(e: PointerEvent) {
      isDragging = true;
      startY = e.clientY;
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDragging) return;
      const dy = startY - e.clientY;
      startY = e.clientY;
      targetYRef.current += dy * 1.5;
    }

    function onPointerUp() {
      isDragging = false;
    }

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  if (!items || items.length === 0) {
    return null;
  }

  // Fallback for SSR
  if (!isClient) {
    return (
      <div className="w-full flex flex-col" style={{ gap: `${MEDIA_GAP_PX}px` }}>
        {items.map((item, idx) => (
          <MediaItem key={item._key || idx} item={item} title={title} index={idx} />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full relative overflow-hidden pointer-events-auto h-[75vh] select-none rounded-2xl">
      {/* Container translated via transform with smooth lerp */}
      <div
        ref={containerRef}
        className="w-full flex flex-col will-change-transform cursor-grab active:cursor-grabbing"
        style={{ gap: `${MEDIA_GAP_PX}px` }}
      >
        {/* Cycle 1 (measured to get cycleHeight) */}
        <div
          ref={cycleRef}
          className="w-full flex flex-col shrink-0"
          style={{ gap: `${MEDIA_GAP_PX}px` }}
        >
          {items.map((item, idx) => (
            <MediaItem
              key={`c0-${item._key || idx}`}
              item={item}
              title={title}
              index={idx}
            />
          ))}
        </div>

        {/* Cloned cycles to allow seamless infinite wrapping */}
        {Array.from({ length: repeats }).map((_, rIdx) => (
          <div
            key={`rep-${rIdx}`}
            className="w-full flex flex-col shrink-0"
            style={{ gap: `${MEDIA_GAP_PX}px` }}
            aria-hidden="true"
          >
            {items.map((item, idx) => (
              <MediaItem
                key={`c${rIdx + 1}-${item._key || idx}`}
                item={item}
                title={title}
                index={idx}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
