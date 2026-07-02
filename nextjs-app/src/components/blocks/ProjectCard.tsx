"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { fileRefToUrl, isVideoRef } from "@/lib/sanity-utils";
import { thumbnailRatio } from "@/lib/thumbnail-ratios";
import type { ProjectListItem } from "@/sanity/queries";
import { getScrollY, WORK_SCROLL_KEY } from "@/lib/scroll";

interface ProjectCardProps {
  project: ProjectListItem;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const mediaUrl = fileRefToUrl(project.thumbnailRef);
  const isVideo = isVideoRef(project.thumbnailRef);
  const ratio = thumbnailRatio(project.thumbnailRef);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const video = videoRef.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(video);
    return () => obs.disconnect();
  }, [isVideo]);

  return (
    <Link
      href={`/work/${project.slug}`}
      className="group relative block transition-transform duration-300 hover:scale-[0.97]"
      transitionTypes={['nav-forward']}
      onClick={() => sessionStorage.setItem(WORK_SCROLL_KEY, String(getScrollY()))}
    >
      {/* Ratio réservé (bg-muted gris) avant chargement → zéro layout shift,
          scroll/animations robustes. Le média remplit la boîte (object-cover ;
          ratio = ratio natif mesuré, donc aucun crop). */}
      <div
        className="relative overflow-hidden rounded-xl bg-muted"
        style={{ aspectRatio: ratio }}
      >
        {mediaUrl && isVideo ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="none"
          />
        ) : mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={project.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : null}

        {/* Hover devices — bottom bar, revealed on hover */}
        <div className="hidden [@media(hover:hover)]:flex absolute inset-x-0 bottom-0 items-center gap-1.5 overflow-hidden p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="min-w-0 inline-flex items-center overflow-hidden rounded-lg border border-zinc-100 bg-white px-2.5 py-2 text-sm text-zinc-800">
            <span className="truncate">{project.title}</span>
          </span>
          {project.organisation && (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-100 bg-white px-2.5 py-2 text-sm text-zinc-800">
              {project.organisation.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={project.organisation.logoUrl}
                  alt=""
                  className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
                />
              )}
              <span className="max-w-[100px] truncate">{project.organisation.name}</span>
            </span>
          )}
        </div>
      </div>

      {/* No-hover devices — org top-right, title bottom-left, always visible */}
      {project.organisation && (
        <div className="[@media(hover:hover)]:hidden absolute top-0 right-0 p-2 w-max max-w-[50%]">
          <span className="flex w-full items-center gap-1 overflow-hidden rounded-lg border border-zinc-100 bg-white px-2 py-1.5 text-xs text-zinc-800">
            {project.organisation.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.organisation.logoUrl}
                alt=""
                className="h-3 w-3 shrink-0 rounded-sm object-contain"
              />
            )}
            <span className="truncate">{project.organisation.name}</span>
          </span>
        </div>
      )}
      <div className="[@media(hover:hover)]:hidden absolute bottom-0 left-0 p-2 w-max max-w-[80%]">
        <span className="flex w-full items-center overflow-hidden rounded-lg border border-zinc-100 bg-white px-2 py-1.5 text-sm text-zinc-800">
          <span className="truncate">{project.title}</span>
        </span>
      </div>
    </Link>
  );
}
