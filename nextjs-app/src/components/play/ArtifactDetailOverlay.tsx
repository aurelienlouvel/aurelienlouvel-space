"use client";

import { useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, Calendar02Icon } from "@hugeicons/core-free-icons";
import type { ArtifactDetail, Mate } from "@/sanity/queries";
import { Tag } from "@/components/primitives/Tag";
import { MatesBlock } from "@/components/blocks/MatesBlock";
import { formatDateRange } from "@/lib/date-utils";
import { useActionBar } from "@/contexts/ActionBarContext";
import { InfiniteMediaColumn, MediaItem, MEDIA_GAP_PX } from "./InfiniteMediaColumn";

export function ArtifactDetailOverlay({
  artifact,
  onClose,
}: {
  artifact: ArtifactDetail;
  onClose: () => void;
}) {
  const { setProject, clearProject } = useActionBar();

  // Sync with floating action bar
  useEffect(() => {
    setProject({
      title: artifact.title,
      redirectUrl: null,
      onBack: onClose,
    });
    return () => clearProject();
  }, [artifact.title, onClose, setProject, clearProject]);

  // Escape key closes detail view
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const dateRange =
    artifact.startDate
      ? formatDateRange(artifact.startDate, artifact.endDate ?? null)
      : null;

  // Principal media is the first gallery item
  const principalMedia = artifact.gallery?.[0] ?? null;

  // Medias under the principal media
  const secondaryMedias = useMemo(() => {
    if (!artifact.gallery || artifact.gallery.length === 0) return [];
    if (artifact.gallery.length > 1) {
      return artifact.gallery.slice(1);
    }
    // Single media fallback: cycle gallery so infinite lerp scroll still operates
    return artifact.gallery;
  }, [artifact.gallery]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-20 pointer-events-auto bg-white/95 backdrop-blur-md overflow-y-auto"
      data-lenis-prevent
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-16 min-h-screen">
        {/* Responsive layout:
            Desktop: Row layout (Medias on Left, Infos on Right)
            Mobile: Column layout (Infos on Top, Medias on Bottom)
        */}
        <div className="flex flex-col-reverse lg:flex-row items-start gap-12 lg:gap-16">
          {/* ── Medias Column (Left on Desktop, Bottom on Mobile) ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="w-full lg:w-[58%] lg:max-w-2xl shrink-0 flex flex-col"
            style={{ gap: `${MEDIA_GAP_PX}px` }}
          >
            {/* Principal Media */}
            {principalMedia && (
              <div className="w-full">
                <MediaItem
                  item={principalMedia}
                  title={artifact.title}
                  index={0}
                  priority
                />
              </div>
            )}

            {/* Medias displayed just under the principal media, defiling as infinite list */}
            {secondaryMedias.length > 0 && (
              <div className="w-full">
                <InfiniteMediaColumn
                  gallery={secondaryMedias}
                  title={artifact.title}
                />
              </div>
            )}
          </motion.div>

          {/* ── Infos Section (Right on Desktop, Top on Mobile) ── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="w-full lg:w-[42%] lg:sticky lg:top-24 self-start flex flex-col pt-2 lg:pt-4"
          >
            {/* Back button */}
            <div className="mb-6">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-950 transition-colors cursor-pointer group"
              >
                <motion.span
                  whileHover={{ x: -3 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 group-hover:bg-zinc-200 transition-colors"
                >
                  <HugeiconsIcon
                    icon={ArrowLeft02Icon}
                    size={15}
                    strokeWidth={2}
                  />
                </motion.span>
                <span>back to canvas</span>
              </button>
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-950 mb-6 text-balance">
              {artifact.title}
            </h1>

            {/* Tags */}
            {artifact.tags && artifact.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {artifact.tags.map((tag) => (
                  <Tag
                    key={tag._id}
                    name={tag.name}
                    color={tag.color}
                    icon={tag.icon}
                  />
                ))}
              </div>
            )}

            {/* Date */}
            {dateRange && (
              <div className="flex items-center gap-2 text-sm text-zinc-500 font-medium mb-6">
                <HugeiconsIcon icon={Calendar02Icon} size={16} strokeWidth={2} />
                <span>{dateRange}</span>
              </div>
            )}

            {/* Description */}
            {artifact.description && (
              <div className="text-base sm:text-lg text-zinc-600 leading-relaxed whitespace-pre-line mb-8">
                {artifact.description}
              </div>
            )}

            {/* Collaborators / Mates */}
            {artifact.contributors && artifact.contributors.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-zinc-100 mb-8">
                <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
                  Collaborators
                </span>
                <MatesBlock mates={artifact.contributors as unknown as Mate[]} />
              </div>
            )}

            {/* Roles */}
            {artifact.roles && artifact.roles.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
                  Roles
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {artifact.roles.map((r) => (
                    <span
                      key={r._id}
                      className="px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-100 text-zinc-700"
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
