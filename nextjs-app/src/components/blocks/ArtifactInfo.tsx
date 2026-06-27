"use client";

import type { ArtifactCanvasItem } from "@/sanity/queries";
import { Tag } from "@/components/primitives/Tag";
import { formatMonth } from "@/lib/date-utils";

export function ArtifactInfo({ artifact }: { artifact: ArtifactCanvasItem }) {
  const dateLabel = artifact.startDate
    ? `${formatMonth(artifact.startDate)}${artifact.endDate ? ` → ${formatMonth(artifact.endDate)}` : " → now"}`
    : null;

  return (
    <div className="w-64 flex flex-col gap-2">
      <h3 className="leading-snug font-mono">{artifact.title}</h3>

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
    </div>
  );
}
