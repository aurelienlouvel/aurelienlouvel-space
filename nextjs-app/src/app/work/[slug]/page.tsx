import { ViewTransition } from "react";
import { notFound } from "next/navigation";
import { client } from "@/sanity/client";
import {
  projectDetailQuery,
  allProjectSlugsQuery,
  type ProjectDetail,
} from "@/sanity/queries";
import { fileRefToUrl, isVideoRef } from "@/lib/sanity-utils";
import { formatMonth, calcDuration } from "@/lib/date-utils";
import { Tag } from "@/components/primitives/Tag";
import { RoleBlock } from "@/components/blocks/RoleBlock";
import { ProjectMediaBlock } from "@/components/blocks/ProjectMediaBlock";
import { MatesBlock } from "@/components/blocks/MatesBlock";
import { ContentRenderer } from "@/components/blocks/ContentRenderer";
import { ProjectPageClient } from "@/components/layout/ProjectPageClient";
import { PageShell } from "@/components/layout/PageShell";
import { HugeiconsIcon } from "@hugeicons/react";
import { Separator } from "@/components/ui/Separator";
import {
  UserMultipleIcon,
  Calendar02Icon,
  Clock04Icon,
} from "@hugeicons/core-free-icons";

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs =
    await client.fetch<Array<{ slug: string }>>(allProjectSlugsQuery);
  return slugs.map((s) => ({ slug: s.slug }));
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await client.fetch<ProjectDetail | null>(projectDetailQuery, {
    slug,
  });

  if (!project) notFound();

  const mediaUrl = fileRefToUrl(project.thumbnailRef);
  const isVideo = isVideoRef(project.thumbnailRef);

  return (
    <ViewTransition
      enter={{ "nav-forward": "view-transition-enter-fwd", default: "none" }}
      exit={{ "nav-back": "view-transition-exit-back", default: "none" }}
      default="none"
    >
      <PageShell restore="top">
        <main className="w-full bg-white rounded-t-2xl">
          <div className="mx-auto max-w-5xl pt-4 sm:pt-16 sm:pb-64">
            <ProjectPageClient
              title={project.title}
              redirectUrl={project.redirectUrl}
            />

            <div className="px-4 sm:px-16 py-8 sm:py-12">
              <h1 className="max-w-[820px] text-pretty mb-8 text-4xl sm:text-6xl px-1 sm:px-0">{project.title}</h1>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-2">
                {/* Organisation */}
                {project.organisation && (
                  <div className="flex items-center gap-2 flex-nowrap">
                    {project.organisation.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={project.organisation.logoUrl}
                        alt=""
                        className="h-6 w-6 rounded-sm object-contain flex-shrink-0"
                      />
                    )}
                    <span className="text-md font-medium text-stone-700 whitespace-nowrap">
                      {project.organisation.name}
                    </span>
                  </div>
                )}

                {/* Tags — colored */}
                {project.tags && project.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <Tag
                        key={tag._id}
                        name={tag.name}
                        color={tag.color}
                        icon={tag.icon}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {mediaUrl && (
              <ProjectMediaBlock
                url={mediaUrl}
                isVideo={isVideo}
                title={project.title}
              />
            )}

            <div className="px-6 sm:px-16 py-8 sm:py-12 flex flex-wrap gap-8 sm:gap-12">
              {/* Role */}
              {project.roles && project.roles.length > 0 && (
                <RoleBlock roles={project.roles} />
              )}

              {/* Mates */}
              {project.mates && project.mates.length > 0 && (
                <div className="shrink-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-400 mb-2">
                    <HugeiconsIcon
                      icon={UserMultipleIcon}
                      size={12}
                      strokeWidth={2}
                    />
                    mates
                  </div>
                  <MatesBlock mates={project.mates} />
                </div>
              )}

              {/* Timeline */}
              {project.startDate && (
                <div className="shrink-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-400 mb-3">
                    <HugeiconsIcon
                      icon={Calendar02Icon}
                      size={12}
                      strokeWidth={2}
                    />
                    timeline
                  </div>
                  <p className="text-lg font-semibold text-stone-700 whitespace-nowrap">
                    {(() => {
                      const start = formatMonth(project.startDate!);
                      const end = project.endDate
                        ? formatMonth(project.endDate)
                        : "Present";
                      if (start === end) return start;
                      return (
                        <>
                          {start}
                          <span className="px-2 font-semibold text-stone-400">
                            →
                          </span>
                          {end}
                        </>
                      );
                    })()}
                  </p>
                </div>
              )}

              {/* Duration */}
              {project.startDate && (
                <div className="shrink-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-400 mb-3">
                    <HugeiconsIcon
                      icon={Clock04Icon}
                      size={12}
                      strokeWidth={2}
                    />
                    duration
                  </div>
                  <p className="text-lg font-semibold text-stone-700 whitespace-nowrap">
                    {calcDuration(project.startDate, project.endDate)}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="mt-4">
              <ContentRenderer content={project.content} />
            </div>
          </div>
        </main>
      </PageShell>
    </ViewTransition>
  );
}
