import { ViewTransition } from "react";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import { client } from "@/sanity/client";
import {
  profileQuery,
  experiencesQuery,
  educationQuery,
  volunteerQuery,
  awardsQuery,
  type Profile,
  type ProfileStory,
  type ExperienceItem,
  type EducationItem,
  type VolunteerItem,
  type AwardItem,
} from "@/sanity/queries";
import {
  getAppleMusicPlaylistTracks,
  getBggEntries,
  getLatestCommit,
  getGitHubContributions,
  getLetterboxdEntries,
  getMapData,
  getStravaActivities,
} from "@/lib/info-fetchers";
import { PageShell } from "@/components/layout/PageShell";
import { TimelineRow } from "@/components/blocks/TimelineRow";
import { ToolPill } from "@/components/blocks/ToolPill";
import { StoryStack, type StorySlide } from "@/components/blocks/StoryStack";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { AnimatedItem } from "@/components/AnimatedItem";

export const revalidate = 60;

const EMPTY_PHOTO_SLIDE: StorySlide = {
  type: "photo",
  imageUrl: null,
  alt: null,
  caption: null,
  cardTitle: null,
  icon: null,
};

// Resolves ONE story's slide data. Deliberately not awaited by its caller —
// InfoPage hands the resulting promises straight to StoryStack as-is, so each
// story's fetch (Music playlist scrape, Strava, GitHub, ...) streams into its
// own card independently via `use()` (see StoryStack.tsx) instead of every
// card sitting behind the slowest story in the list.
async function resolveStorySlide(story: ProfileStory): Promise<StorySlide> {
  switch (story._type) {
    case "storyPhoto":
      return {
        type: "photo",
        imageUrl: story.imageUrl,
        alt: story.alt,
        caption: story.caption,
        cardTitle: story.cardTitle,
        icon: story.icon,
      };
    case "storyVideo":
      return {
        type: "video",
        videoUrl: story.videoFileUrl ?? story.url,
        caption: story.caption,
        cardTitle: story.cardTitle,
        icon: story.icon,
      };
    case "storyAppleMusic": {
      const variants = await getAppleMusicPlaylistTracks(story.url);
      return {
        type: "music",
        cardTitle: story.cardTitle,
        icon: story.icon,
        variants,
      };
    }
    case "storyStrava": {
      const activities = await getStravaActivities(story.shareUrl);
      return {
        type: "strava",
        cardTitle: story.cardTitle,
        icon: story.icon,
        variants: activities.map((activity) => ({
          activityName: activity.activityName ?? null,
          activityType: activity.activityType ?? null,
          speedKmh: activity.speedKmh ?? null,
          distanceKm: activity.distanceKm ?? null,
          durationSec: activity.durationSec ?? null,
          bpm: activity.bpm ?? null,
          elevationM: activity.elevationM ?? null,
          date: activity.date ? formatDateTime(activity.date) : null,
          path: activity.path ?? [],
          city: activity.city ?? null,
        })),
      };
    }
    case "storyAppleMaps": {
      const map = await getMapData(story.address);
      return {
        type: "location",
        cardTitle: story.cardTitle,
        icon: story.icon,
        label: story.label ?? map?.label ?? story.address ?? null,
        timezone: map?.timezone ?? null,
        temperature: map?.temperature ?? null,
        weatherCode: map?.weatherCode ?? null,
        lat: map?.lat ?? null,
        lon: map?.lon ?? null,
      };
    }
    case "storyGithub": {
      const [commit, contributions] = await Promise.all([
        getLatestCommit(story.username),
        getGitHubContributions(story.username),
      ]);
      return {
        type: "github",
        cardTitle: story.cardTitle,
        icon: story.icon,
        repo: commit?.repo ?? null,
        message: commit?.message ?? null,
        date: commit?.date ?? null,
        contributions: contributions?.days ?? null,
        totalContributions: contributions?.total ?? null,
        url: story.username ? `https://github.com/${story.username}` : null,
      };
    }
    case "storyValorant":
      return {
        type: "valorant",
        cardTitle: story.cardTitle,
        icon: story.icon,
        trackerUrl: story.trackerUrl,
        region: story.region,
      };
    case "storyLetterboxd": {
      const entries = await getLetterboxdEntries(story.username);
      return {
        type: "letterboxd",
        cardTitle: story.cardTitle,
        icon: story.icon,
        variants: entries.map((entry) => ({
          filmTitle: entry.filmTitle ?? null,
          filmYear: entry.filmYear ?? null,
          date: entry.watchedDate ? formatDate(entry.watchedDate) : null,
          rating: entry.rating ?? null,
          posterUrl: entry.posterUrl ?? null,
          filmUrl: entry.filmUrl ?? null,
        })),
      };
    }
    case "storyBgg": {
      // Collage is a fixed 5-slot "pentagon" (2 3 / 1 / 4 5 — see BGG_SLOTS
      // in StoryCard.tsx). BGG's own "Top 10" is the hard ceiling on how
      // many ranked picks even exist, and not every pick actually
      // cross-references to a piece of cover art (see getBggEntries's
      // "best-effort enrichment" comment) — so this asks for the full top
      // 10, drops whichever picks came back with no art, then takes the
      // best 5 of what's left, instead of asking for exactly 5 and silently
      // showing fewer whenever one of them has none.
      const entries = await getBggEntries(story.username, 10);
      const withArt = entries.filter((entry) => entry.imageUrl).slice(0, 5);
      return {
        type: "bgg",
        cardTitle: story.cardTitle,
        icon: story.icon,
        variants: withArt.map((entry) => ({
          gameName: entry.gameName ?? null,
          yearPublished: entry.yearPublished ?? null,
          rating: entry.rating ?? null,
          imageUrl: entry.imageUrl ?? null,
          gameUrl: entry.gameUrl ?? null,
        })),
      };
    }
    case "storyFact":
      return {
        type: "fact",
        icon: story.icon,
        label: story.label,
        value: story.value,
        imageUrl: story.imageUrl,
        imageColors: [
          story.paletteDominant,
          story.paletteVibrant,
          story.paletteDarkVibrant,
        ],
        tagline: story.tagline,
      };
    default:
      // Unrecognized story type — surface the same "nothing to show" photo
      // placeholder StoryStack already falls back to elsewhere, rather than
      // null, so every story always yields a real slide promise 1:1 (no
      // post-hoc filtering, which would mean awaiting everything up front).
      return EMPTY_PHOTO_SLIDE;
  }
}

export default async function InfoPage() {
  const [profile, experiences, education, volunteering, awards] =
    await Promise.all([
      client.fetch<Profile | null>(profileQuery),
      client.fetch<ExperienceItem[]>(experiencesQuery),
      client.fetch<EducationItem[]>(educationQuery),
      client.fetch<VolunteerItem[]>(volunteerQuery),
      client.fetch<AwardItem[]>(awardsQuery),
    ]);

  if (!profile) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground">info — coming soon</p>
      </main>
    );
  }

  // Un promise par story, jamais awaited ici — StoryStack connaît le nombre
  // de slides tout de suite (juste la longueur du tableau) et anime la pile
  // dès le chargement de la page ; chaque carte reçoit son contenu dès que sa
  // propre promise se résout, indépendamment des autres (voir StoryStack.tsx).
  const stories = profile.stories ?? [];
  const slidePromises: Promise<StorySlide>[] =
    stories.length > 0
      ? stories.map((story) => resolveStorySlide(story))
      : [Promise.resolve(EMPTY_PHOTO_SLIDE)];

  const leftTools = profile.tools?.filter((t) => !t.referral) ?? [];
  const rightTools = profile.tools?.filter((t) => t.referral) ?? [];

  return (
    <ViewTransition default="none">
      <PageShell restore="top">
        <main className="w-full rounded-t-2xl bg-white">
          <div className="mx-auto max-w-3xl px-6 pt-12 pb-36 sm:px-10 sm:pb-48 sm:pt-20">
            {/* Hero: name + bio + tools  ↔  stories */}
            <div className="grid grid-cols-1 gap-10 md:grid-cols-[3fr_2fr] md:gap-12">
              {/* Left column */}
              <AnimatedItem delay={0.04} className="flex flex-col gap-6">
                <div className="flex items-start justify-between align-items gap-4 mx-2">
                  <div>
                    <h1 className="text-lg! leading-tight! font-bold tracking-tight text-stone-900">
                      {profile.firstName} {profile.lastName}
                    </h1>
                    {profile.jobTitle && (
                      <p className="mt-0.5 text-base text-stone-500">
                        {profile.jobTitle}
                      </p>
                    )}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo.png"
                    alt="oré"
                    className="mt-1 h-5 w-auto shrink-0"
                  />
                </div>

                {profile.bio && (
                  <div className="rounded-3xl bg-stone-50 p-6">
                    <p className="text-base leading-relaxed text-stone-600">
                      {profile.bio}
                    </p>
                  </div>
                )}

                {(leftTools.length > 0 || rightTools.length > 0) && (
                  <TooltipProvider>
                    <div className="flex flex-wrap items-center gap-4 mx-2">
                      {leftTools.map((tool) => (
                        <ToolPill key={tool._id} tool={tool} />
                      ))}
                      {rightTools.length > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-4">
                          {rightTools.map((tool) => (
                            <ToolPill key={tool._id} tool={tool} />
                          ))}
                        </div>
                      )}
                    </div>
                  </TooltipProvider>
                )}
              </AnimatedItem>

              {/* Right column — la pile anime immédiatement, chaque story streame son contenu */}
              <AnimatedItem delay={0.1}>
                <StoryStack slidePromises={slidePromises} />
              </AnimatedItem>
            </div>

            {/* Experience */}
            {experiences.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-8">Experience</h4>
                </AnimatedItem>
                <div className="flex flex-col gap-4">
                  {experiences.map((exp, i) => (
                    <AnimatedItem key={exp._id} delay={0.12 + i * 0.05}>
                      <TimelineRow
                        orgName={exp.organisation?.name ?? null}
                        logoUrl={exp.organisation?.logoUrl ?? null}
                        websiteUrl={exp.organisation?.websiteUrl ?? null}
                        title={exp.title}
                        contractType={exp.contractType?.name ?? null}
                        startDate={exp.startDate}
                        endDate={exp.endDate}
                        ongoingFallback
                      />
                    </AnimatedItem>
                  ))}
                </div>
              </section>
            )}

            {/* Education */}
            {education.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-8">Education</h4>
                </AnimatedItem>
                <div className="flex flex-col gap-4">
                  {education.map((edu, i) => (
                    <AnimatedItem key={edu._id} delay={0.12 + i * 0.05}>
                      <TimelineRow
                        orgName={edu.organisation?.name ?? null}
                        logoUrl={edu.organisation?.logoUrl ?? null}
                        websiteUrl={edu.organisation?.websiteUrl ?? null}
                        title={edu.title}
                        startDate={edu.startDate}
                        endDate={edu.endDate}
                      />
                    </AnimatedItem>
                  ))}
                </div>
              </section>
            )}

            {/* Volunteer */}
            {volunteering.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-8">Volunteer</h4>
                </AnimatedItem>
                <div className="flex flex-col gap-4">
                  {volunteering.map((vol, i) => (
                    <AnimatedItem key={vol._id} delay={0.12 + i * 0.05}>
                      <TimelineRow
                        orgName={vol.organisation?.name ?? null}
                        logoUrl={vol.organisation?.logoUrl ?? null}
                        websiteUrl={vol.organisation?.websiteUrl ?? null}
                        title={vol.title}
                        startDate={vol.startDate}
                        endDate={vol.endDate}
                        ongoingFallback
                      />
                    </AnimatedItem>
                  ))}
                </div>
              </section>
            )}

            {/* Awards */}
            {awards.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-4">Awards</h4>
                </AnimatedItem>
                <div className="flex flex-col gap-4">
                  {awards.map((award, i) => (
                    <AnimatedItem key={award._id} delay={0.12 + i * 0.05}>
                      <TimelineRow
                        orgName={award.title}
                        logoUrl={award.organisation?.logoUrl ?? null}
                        websiteUrl={award.organisation?.websiteUrl ?? null}
                        title={award.organisation?.name ?? ""}
                        startDate={award.date}
                        endDate={null}
                      />
                    </AnimatedItem>
                  ))}
                </div>
              </section>
            )}

            {/* Resume download */}
            <AnimatedItem delay={0.08} className="mt-24 flex justify-center">
              <a
                href="/aurelien-louvel-resume-en.pdf"
                download
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-base text-stone-400 transition-all -rotate-1 hover:scale-[1.04] hover:-rotate-3 hover:bg-stone-50 hover:text-stone-800"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 13 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6.5 1v8M3.5 6.5l3 3 3-3M1.5 11.5h10" />
                </svg>
                download my resume
              </a>
            </AnimatedItem>
          </div>
        </main>
      </PageShell>
    </ViewTransition>
  );
}
