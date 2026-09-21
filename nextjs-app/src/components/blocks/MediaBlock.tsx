"use client";

import { useRef, useState, useEffect } from "react";
import type { BlockMedia, MediaItem } from "@/sanity/queries";
import { buildImageUrl, hotspotToObjectPosition } from "@/lib/sanity-image";
import { Slider } from "@/components/ui/Slider";
import { cn } from "@/lib/utils";

// ─── Gap (px) ─────────────────────────────────────────────────────────────────
const GAP = 16;

// ─── Hook : largeur du container ──────────────────────────────────────────────
function useContainerWidth(ref: React.RefObject<HTMLDivElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

// ─── Ratio natif (fallback 16/9 pour vidéos sans métadonnées) ─────────────────
function nativeRatio(item: MediaItem): number {
  if (item.imageWidth && item.imageHeight)
    return item.imageWidth / item.imageHeight;
  return 16 / 9;
}

// ─── Embed URL helper ──────────────────────────────────────────────────────────
function getEmbedUrl(url: string): string | null {
  const yt = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
  );
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

// ─── Rendu d'un item individuel (image ou vidéo) ──────────────────────────────
function MediaCell({
  item,
  height,
}: {
  item: MediaItem;
  /** Hauteur explicite en px pour les layouts 2/3 items */
  height?: number;
}) {
  const containerStyle: React.CSSProperties = height ? { height } : {};

  if (item.mediaType === "video") {
    const embedUrl = item.videoUrl ? getEmbedUrl(item.videoUrl) : null;
    return (
      <figure>
        {embedUrl ? (
          <div
            className="relative overflow-hidden rounded-2xl"
            style={
              height ? containerStyle : { aspectRatio: "16/9", height: "auto" }
            }
          >
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : item.videoFileUrl ? (
          <video
            src={item.videoFileUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full rounded-2xl"
            style={containerStyle}
          />
        ) : null}
        {item.caption && (
          <figcaption className="mt-4 text-sm text-stone-600 text-center px-1">
            {item.caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (!item.imageUrl && !item.imageRef) return null;
  return (
    <figure>
      <div className="overflow-hidden rounded-2xl" style={containerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageRef ? buildImageUrl(item.imageRef, item.imageUrl, item.imageHotspot, item.imageCrop, { width: 1600 }) : (item.imageUrl ?? "")}
          alt={item.imageAlt ?? ""}
          className="w-full h-full object-cover block"
          style={{ objectPosition: hotspotToObjectPosition(item.imageHotspot) }}
        />
      </div>
      {item.caption && (
        <figcaption className="mt-2 text-sm text-stone-600 text-center px-1">
          {item.caption}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Layout 1 image — pleine largeur, ratio CSS ────────────────────────────
function SingleLayout({ item }: { item: MediaItem }) {
  if (item.mediaType === "video") {
    const embedUrl = item.videoUrl ? getEmbedUrl(item.videoUrl) : null;
    return (
      <figure>
        {embedUrl ? (
          <div className="relative aspect-video overflow-hidden rounded-2xl">
            <iframe
              src={embedUrl}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : item.videoFileUrl ? (
          <video
            src={item.videoFileUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full rounded-2xl"
          />
        ) : null}
        {item.caption && (
          <figcaption className="mt-4 text-sm text-stone-600 text-center px-1">
            {item.caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (!item.imageUrl && !item.imageRef) return null;
  return (
    <figure>
      <div className="overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageRef ? buildImageUrl(item.imageRef, item.imageUrl, item.imageHotspot, item.imageCrop, { width: 1600 }) : (item.imageUrl ?? "")}
          alt={item.imageAlt ?? ""}
          className="w-full block"
          style={{ objectPosition: hotspotToObjectPosition(item.imageHotspot) }}
        />
      </div>
      {item.caption && (
        <figcaption className="mt-2 text-sm text-stone-600 text-center px-1">
          {item.caption}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Embed item (Figma, YouTube, Vimeo, etc.) ─────────────────────────────
function EmbedCell({ item }: { item: MediaItem }) {
  const isFigma = item.embedProvider === "figma";

  // Slider de défilement : une iframe Figma est cross-origin, impossible de la
  // scroller depuis la page. On la rend `factor` fois plus large que sa fenêtre
  // (Figma ajuste donc la maquette à ce viewport, elle s'affiche plus grande) et
  // le slider la translate en CSS pour en révéler les tranches.
  const scrollable = isFigma && item.embedScrollable === true;
  const factor = scrollable
    ? Math.min(Math.max(item.embedScrollFactor ?? 3, 1.5), 10)
    : 1;

  const [p, setP] = useState(0); // 0..100, la valeur du slider
  const boxRef = useRef<HTMLDivElement>(null as unknown as HTMLDivElement);
  const boxW = useContainerWidth(boxRef);
  const offset = (p / 100) * (factor - 1) * boxW;

  if (!item.embedUrl || !item.embedProvider) return null;
  const provider = item.embedProvider;

  let src: string | null = null;
  switch (provider) {
    case "figma": {
      const isProto = item.embedUrl.includes("/proto/");
      const params = new URLSearchParams({
        embed_host: "share",
        url: item.embedUrl,
      });
      params.set("hide-ui", "1");
      if (isProto) params.set("scaling", "scale-down-width");
      src = `https://www.figma.com/embed?${params.toString()}`;
      break;
    }
    case "youtube": {
      const m = item.embedUrl.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
      );
      src = m ? `https://www.youtube.com/embed/${m[1]}` : null;
      break;
    }
    case "vimeo": {
      const m = item.embedUrl.match(/vimeo\.com\/(\d+)/);
      src = m ? `https://player.vimeo.com/video/${m[1]}` : null;
      break;
    }
    case "codesandbox":
      src = item.embedUrl.replace("/s/", "/embed/");
      break;
  }

  return (
    <figure>
      {src ? (
        <>
          <div
            ref={boxRef}
            className="relative aspect-video overflow-hidden rounded-4xl border border-border"
          >
            <iframe
              src={src}
              className={cn(
                "absolute inset-0",
                // Sans ça la souris pan le canvas Figma et désynchronise le
                // slider ; bonus : la molette redevient celle de la page.
                scrollable && "pointer-events-none will-change-transform",
              )}
              style={{
                // Course exacte : offset max = (factor - 1) × boxW, donc à 100 %
                // on cadre pile le bord droit de la maquette.
                width: `${factor * 100}%`,
                // Les +48px masquent la barre du bas de Figma (inchangé).
                height: isFigma ? "calc(100% + 48px)" : "100%",
                transform: scrollable
                  ? `translate3d(${-offset}px, 0, 0)`
                  : undefined,
              }}
              allow="fullscreen"
              allowFullScreen
              loading="lazy"
            />
          </div>
          {scrollable && (
            // data-lenis-prevent : /work/[slug] tourne sous LocomotiveScroll,
            // qui capterait un drag tactile sur la piste pour scroller la page.
            <div className="mx-auto mt-6 w-48" data-lenis-prevent>
              <Slider
                value={p}
                onValueChange={setP}
                min={0}
                max={100}
                step={1}
                largeStep={10}
                aria-label="Faire défiler la maquette"
              />
            </div>
          )}
        </>
      ) : (
        <a
          href={item.embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-sm text-stone-500 underline underline-offset-2"
        >
          {provider} ↗
        </a>
      )}
      {item.caption && (
        <figcaption className="mt-2 text-sm text-stone-600 text-center px-1">
          {item.caption}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Layout 2 images — côte à côte, même hauteur ─────────────────────────────
//
//  Contraintes :
//    ① w1 + GAP + w2 = W
//    ② w1/r1 = w2/r2   (même hauteur)
//
//  Solution :
//    w2 = (W - GAP) × r2 / (r1 + r2)
//    w1 = W - GAP - w2
//    h  = w1 / r1
//
function DuoLayout({ items, W }: { items: [MediaItem, MediaItem]; W: number }) {
  const r1 = nativeRatio(items[0]);
  const r2 = nativeRatio(items[1]);
  const w2 = ((W - GAP) * r2) / (r1 + r2);
  const w1 = W - GAP - w2;
  const h = w1 / r1;

  return (
    <div className="flex" style={{ gap: GAP }}>
      <div style={{ width: w1, flexShrink: 0 }}>
        <MediaCell item={items[0]} height={h} />
      </div>
      <div style={{ width: w2, flexShrink: 0 }}>
        <MediaCell item={items[1]} height={h} />
      </div>
    </div>
  );
}

// ─── Layout 3 images — gauche + 2 droite empilées ─────────────────────────────
//
//  Contraintes :
//    ① wL + GAP + wR = W
//    ② wL/rL = wR/rT + GAP + wR/rB   (hauteur gauche = hauteur droite totale)
//
//  Solution :
//    wR = ( (W-GAP)/rL - GAP ) / ( 1/rL + 1/rT + 1/rB )
//    wL = W - GAP - wR
//
function TrioLayout({
  items,
  W,
}: {
  items: [MediaItem, MediaItem, MediaItem];
  W: number;
}) {
  const rL = nativeRatio(items[0]);
  const rT = nativeRatio(items[1]);
  const rB = nativeRatio(items[2]);

  const wR = ((W - GAP) / rL - GAP) / (1 / rL + 1 / rT + 1 / rB);
  const wL = W - GAP - wR;

  // Garde-fou : si les ratios sont trop extrêmes, fallback grille
  if (wR <= 0 || wL <= 0) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => (
          <MediaCell key={item._key} item={item} />
        ))}
      </div>
    );
  }

  const hL = wL / rL;
  const hT = wR / rT;
  const hB = wR / rB;

  return (
    <div className="flex" style={{ gap: GAP }}>
      {/* Image gauche */}
      <div style={{ width: wL, flexShrink: 0 }}>
        <MediaCell item={items[0]} height={hL} />
      </div>
      {/* Colonne droite */}
      <div
        className="flex flex-col"
        style={{ gap: GAP, width: wR, flexShrink: 0 }}
      >
        <MediaCell item={items[1]} height={hT} />
        <MediaCell item={items[2]} height={hB} />
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────
export function MediaBlock({ block }: { block: BlockMedia }) {
  const ref = useRef<HTMLDivElement>(null as unknown as HTMLDivElement);
  const W = useContainerWidth(ref);
  const items = block.items ?? [];

  // If any item is an embed, render all items individually (no justified math)
  const hasEmbeds = items.some((item) => item.mediaType === "embed");

  return (
    <div ref={ref} className="w-full">
      {items.length === 0 ? null : hasEmbeds ? (
        <div className="flex flex-col gap-4">
          {items.map((item) =>
            item.mediaType === "embed" ? (
              <EmbedCell key={item._key} item={item} />
            ) : (
              <SingleLayout key={item._key} item={item} />
            ),
          )}
        </div>
      ) : items.length === 1 ? (
        // 1 item — pas besoin de W, CSS pur
        <SingleLayout item={items[0]} />
      ) : !W ? (
        // Placeholder SSR en attendant la mesure du container
        <div className="min-h-48" />
      ) : items.length === 2 ? (
        <DuoLayout items={items as [MediaItem, MediaItem]} W={W} />
      ) : items.length === 3 ? (
        <TrioLayout items={items as [MediaItem, MediaItem, MediaItem]} W={W} />
      ) : (
        // 4+ items — grille simple
        <div className="grid grid-cols-2 gap-4">
          {items.map((item) => (
            <MediaCell key={item._key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
