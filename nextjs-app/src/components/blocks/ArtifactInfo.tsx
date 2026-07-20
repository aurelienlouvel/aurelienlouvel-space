"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { UserMultipleIcon, ChevronLeft, ChevronRight } from "@hugeicons/core-free-icons";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import { Tag } from "@/components/primitives/Tag";
import { MatesBlock } from "@/components/blocks/MatesBlock";
import { formatMonth } from "@/lib/date-utils";

export function ArtifactInfo({
  artifact,
  mediaIndex = 0,
  onMediaChange,
}: {
  artifact: ArtifactCanvasItem;
  mediaIndex?: number;
  onMediaChange?: (index: number) => void;
}) {
  const dateLabel = artifact.startDate
    ? `${formatMonth(artifact.startDate)}${artifact.endDate ? ` → ${formatMonth(artifact.endDate)}` : " → now"}`
    : null;

  const accent = artifact.firstMedia?.paletteDominant ?? null;
  const hasStack = artifact.galleryCount > 1;

  return (
    <div className="relative isolate w-64">
      {accent && (
        <div
          className="absolute -inset-6 -z-10 rounded-[2rem] opacity-50 blur-2xl"
          style={{ background: accent }}
          aria-hidden
        />
      )}

      {/* Pile — two flat cards peeking out behind, no count, just "there's more" */}
      {hasStack && (
        <>
          <div
            className="absolute inset-0 z-0 translate-x-3 translate-y-3 rounded-3xl border border-border/60 bg-white opacity-60 shadow-md"
            aria-hidden
          />
          <div
            className="absolute inset-0 z-[1] translate-x-1.5 translate-y-1.5 rounded-3xl border border-border/60 bg-white opacity-80 shadow-md"
            aria-hidden
          />
        </>
      )}

      <div
        className="relative z-10 flex flex-col gap-2 rounded-3xl border border-border/60 p-4 shadow-md backdrop-blur-2xl"
        style={{
          background: accent
            ? `radial-gradient(circle at 12% -10%, ${accent}73, transparent 65%), white`
            : "white",
        }}
      >
        <h3 className="flex items-center gap-2 leading-snug font-mono">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: accent ?? "var(--color-stone-300)" }}
            aria-hidden
          />
          {artifact.title}
        </h3>

        {dateLabel && (
          <p className="text-md text-stone-400 font-medium">{dateLabel}</p>
        )}

        {artifact.description && (
          <p className="text-base text-stone-500 leading-relaxed line-clamp-5 font-mono">
            {artifact.description}
          </p>
        )}

        {artifact.tags && artifact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {artifact.tags.map((tag) => (
              <Tag key={tag._id} name={tag.name} color={tag.color} icon={tag.icon} />
            ))}
          </div>
        )}

        {artifact.mates && artifact.mates.length > 0 && (
          <div className="mt-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-400 mb-2">
              <HugeiconsIcon icon={UserMultipleIcon} size={12} strokeWidth={2} />
              mates
            </div>
            <MatesBlock mates={artifact.mates} />
          </div>
        )}

        {hasStack && (
          <div className="mt-3 flex items-center justify-center gap-2 text-stone-400">
            <button
              onClick={() => {
                const prev = (mediaIndex - 1 + artifact.galleryCount) % artifact.galleryCount;
                onMediaChange?.(prev);
              }}
              className="p-1 hover:text-stone-600 transition-colors"
              aria-label="Previous media"
            >
              <HugeiconsIcon icon={ChevronLeft} size={16} strokeWidth={2} />
            </button>
            <span className="text-xs font-mono">
              {mediaIndex + 1} / {artifact.galleryCount}
            </span>
            <button
              onClick={() => {
                const next = (mediaIndex + 1) % artifact.galleryCount;
                onMediaChange?.(next);
              }}
              className="p-1 hover:text-stone-600 transition-colors"
              aria-label="Next media"
            >
              <HugeiconsIcon icon={ChevronRight} size={16} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
