"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { UserMultipleIcon } from "@hugeicons/core-free-icons";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import { Tag } from "@/components/primitives/Tag";
import { MatesBlock } from "@/components/blocks/MatesBlock";
import { formatMonth } from "@/lib/date-utils";

export function ArtifactInfo({ artifact }: { artifact: ArtifactCanvasItem }) {
  const dateLabel = artifact.startDate
    ? `${formatMonth(artifact.startDate)}${artifact.endDate ? ` → ${formatMonth(artifact.endDate)}` : " → now"}`
    : null;

  return (
    <div className="flex w-96 flex-col gap-2">
      <h3 className="font-mono text-5xl font-medium leading-snug">
        {artifact.title}
      </h3>

      {dateLabel && (
        <p className="text-md text-stone-400 font-medium">{dateLabel}</p>
      )}

      {artifact.description && (
        <p className="text-lg text-stone-500 leading-relaxed line-clamp-5 font-mono">
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
    </div>
  );
}
