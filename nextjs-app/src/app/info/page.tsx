import { ViewTransition } from "react";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import { client } from "@/sanity/client";
import {
  profileQuery,
  experiencesQuery,
  educationQuery,
  volunteerQuery,
  sideProjectsQuery,
  awardsQuery,
  toolsQuery,
  toolGroupsQuery,
  SOCIAL_PLATFORM_ORDER,
  type Profile,
  type ProfileStory,
  type ExperienceItem,
  type EducationItem,
  type VolunteerItem,
  type SideProjectItem,
  type AwardItem,
  type ToolItem,
  type ToolGroupItem,
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
import { SocialPill } from "@/components/blocks/SocialPill";
import { TimelineGroup } from "@/components/blocks/TimelineGroup";
import { TimelineSection } from "@/components/blocks/TimelineEntry";
import { ToolGroups } from "@/components/blocks/ToolGroups";
import { StoryStack, type StorySlide } from "@/components/blocks/StoryStack";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { AnimatedItem } from "@/components/AnimatedItem";
import { ResumeDownload } from "@/components/ResumeDownload";

export const revalidate = 60;

// Regroupe les entrées CONSÉCUTIVES qui pointent vers la même organisation
// (même `_id`), dans l'ordre manuel du Studio : deux postes chez 50a qui se
// suivent forment un groupe, mais un poste ailleurs entre les deux coupe le
// groupe. Une entrée sans organisation reste toujours seule.
function groupByOrganisation<T extends { organisation: { _id: string } | null }>(
  items: T[],
): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    const orgId = item.organisation?._id;
    if (last && orgId && last[0].organisation?._id === orgId) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

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
  const [profile, experiences, sideProjects, education, volunteering, awards, tools, toolGroups] =
    await Promise.all([
      client.fetch<Profile | null>(profileQuery),
      client.fetch<ExperienceItem[]>(experiencesQuery),
      client.fetch<SideProjectItem[]>(sideProjectsQuery),
      client.fetch<EducationItem[]>(educationQuery),
      client.fetch<VolunteerItem[]>(volunteerQuery),
      client.fetch<AwardItem[]>(awardsQuery),
      client.fetch<ToolItem[]>(toolsQuery),
      client.fetch<ToolGroupItem[]>(toolGroupsQuery),
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

  // Une entrée par plateforme, dans un ordre fixe ; une plateforme sans URL
  // dans Sanity n'est simplement pas affichée.
  const socials = SOCIAL_PLATFORM_ORDER.flatMap((platform) => {
    const social = profile.socials?.find((s) => s.platform === platform);
    return social ? [social] : [];
  });
  // Côté choisi dans Sanity ; sans choix, à gauche.
  const leftSocials = socials.filter((s) => s.side !== "right");
  const rightSocials = socials.filter((s) => s.side === "right");

  return (
    <ViewTransition default="none">
      <PageShell restore="top">
        <main className="w-full rounded-t-2xl bg-white">
          <div className="mx-auto max-w-3xl px-6 pt-12 pb-36 sm:px-10 sm:pb-48 sm:pt-20">
            {/* Hero: name + bio + socials  ↔  stories */}
            <div className="grid grid-cols-1 gap-10 md:grid-cols-[3fr_2fr] md:gap-12">
              {/* Left column */}
              <AnimatedItem delay={0.04} className="flex flex-col gap-6">
                <div className="flex items-start justify-between align-items gap-4 mx-2">
                  <div>
                    <h1 className="text-lg! leading-tight! font-bold tracking-tight text-stone-900">
                      {profile.firstName} {profile.lastName}
                      <span className="ml-2 font-medium text-stone-400">
                        b. 2002
                      </span>
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

                {socials.length > 0 && (
                  <TooltipProvider>
                    <div className="flex items-center justify-between gap-4 mx-2">
                      <div className="flex flex-wrap items-center gap-4">
                        {leftSocials.map((social) => (
                          <SocialPill key={social._key} social={social} />
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-4">
                        {rightSocials.map((social) => (
                          <SocialPill key={social._key} social={social} />
                        ))}
                      </div>
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
                <TimelineSection section="experience" className="flex flex-col gap-4">
                  {groupByOrganisation(experiences).map((group, i) => {
                    const [exp] = group;
                    return (
                      <AnimatedItem key={exp._id} delay={0.12 + i * 0.05}>
                        {group.length > 1 && exp.organisation ? (
                          <TimelineGroup
                            orgName={exp.organisation.name}
                            logoUrl={exp.organisation.logoUrl}
                            websiteUrl={exp.organisation.websiteUrl}
                            roles={group.map((role) => ({
                              _id: role._id,
                              title: role.title,
                              contractType: role.contractType?.name ?? null,
                              startDate: role.startDate,
                              endDate: role.endDate,
                              description: role.description,
                            }))}
                            ongoingFallback
                          />
                        ) : (
                          <TimelineRow
                            id={exp._id}
                            description={exp.description}
                            orgName={exp.organisation?.name ?? null}
                            logoUrl={exp.organisation?.logoUrl ?? null}
                            websiteUrl={exp.organisation?.websiteUrl ?? null}
                            title={exp.title}
                            contractType={exp.contractType?.name ?? null}
                            startDate={exp.startDate}
                            endDate={exp.endDate}
                            ongoingFallback
                          />
                        )}
                      </AnimatedItem>
                    );
                  })}
                </TimelineSection>
              </section>
            )}

            {/* Side projects */}
            {sideProjects.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-8">Side projects</h4>
                </AnimatedItem>
                <TimelineSection section="side_projects" className="flex flex-col gap-4">
                  {sideProjects.map((sp, i) => (
                    <AnimatedItem key={sp._id} delay={0.12 + i * 0.05}>
                      <TimelineRow
                        id={sp._id}
                        description={sp.description}
                        orgName={sp.organisation?.name ?? null}
                        logoUrl={sp.organisation?.logoUrl ?? null}
                        websiteUrl={sp.url ?? sp.organisation?.websiteUrl ?? null}
                        title={sp.title}
                        startDate={sp.startDate}
                        endDate={sp.endDate}
                        ongoingFallback
                      />
                    </AnimatedItem>
                  ))}
                </TimelineSection>
              </section>
            )}

            {/* Education */}
            {education.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-8">Education</h4>
                </AnimatedItem>
                <TimelineSection section="education" className="flex flex-col gap-4">
                  {groupByOrganisation(education).map((group, i) => {
                    const [edu] = group;
                    return (
                      <AnimatedItem key={edu._id} delay={0.12 + i * 0.05}>
                        {group.length > 1 && edu.organisation ? (
                          <TimelineGroup
                            orgName={edu.organisation.name}
                            logoUrl={edu.organisation.logoUrl}
                            websiteUrl={edu.organisation.websiteUrl}
                            roles={group.map((programme) => ({
                              _id: programme._id,
                              title: programme.title,
                              startDate: programme.startDate,
                              endDate: programme.endDate,
                              description: programme.description,
                            }))}
                          />
                        ) : (
                          <TimelineRow
                            id={edu._id}
                            description={edu.description}
                            orgName={edu.organisation?.name ?? null}
                            logoUrl={edu.organisation?.logoUrl ?? null}
                            websiteUrl={edu.organisation?.websiteUrl ?? null}
                            title={edu.title}
                            startDate={edu.startDate}
                            endDate={edu.endDate}
                          />
                        )}
                      </AnimatedItem>
                    );
                  })}
                </TimelineSection>
              </section>
            )}

            {/* Volunteer */}
            {volunteering.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-8">Volunteer</h4>
                </AnimatedItem>
                <TimelineSection section="volunteer" className="flex flex-col gap-4">
                  {volunteering.map((vol, i) => (
                    <AnimatedItem key={vol._id} delay={0.12 + i * 0.05}>
                      <TimelineRow
                        id={vol._id}
                        description={vol.description}
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
                </TimelineSection>
              </section>
            )}

            {/* Awards */}
            {awards.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-4">Awards</h4>
                </AnimatedItem>
                <TimelineSection section="awards" className="flex flex-col gap-4">
                  {awards.map((award, i) => (
                    <AnimatedItem key={award._id} delay={0.12 + i * 0.05}>
                      <TimelineRow
                        id={award._id}
                        description={award.description}
                        orgName={award.organisation?.name ?? null}
                        logoUrl={award.organisation?.logoUrl ?? null}
                        websiteUrl={award.organisation?.websiteUrl ?? null}
                        title={award.title}
                        startDate={award.date}
                        endDate={null}
                        titleFirst
                      />
                    </AnimatedItem>
                  ))}
                </TimelineSection>
              </section>
            )}

            {/* Tools */}
            {tools.length > 0 && (
              <section className="mt-20 mx-2">
                <AnimatedItem delay={0.08}>
                  <h4 className="mb-4">Tools</h4>
                </AnimatedItem>
                <AnimatedItem delay={0.12}>
                  <ToolGroups groups={toolGroups} tools={tools} />
                </AnimatedItem>
              </section>
            )}

            {/* Resume download */}
            <AnimatedItem delay={0.08} className="mt-24 flex justify-center">
              <ResumeDownload />
            </AnimatedItem>
          </div>
        </main>
      </PageShell>
    </ViewTransition>
  );
}
