import { defineQuery } from "next-sanity";

export const projectsListQuery = defineQuery(`
  *[_type == "project"] | order(orderRank) {
    _id,
    title,
    "slug": slug.current,
    "thumbnailRef": thumbnail.asset._ref,
    "tags": tags[]->{ _id, name, color, icon },
    "organisation": organisation->{ name, "logoUrl": logo.asset->url + "?w=96&q=90&auto=format" }
  }
`);

export type ProjectListItem = {
  _id: string;
  title: string;
  slug: string;
  thumbnailRef: string | null;
  tags: Array<{
    _id: string;
    name: string;
    color: string | null;
    icon: string | null;
  }> | null;
  organisation: { name: string; logoUrl: string | null } | null;
};

const contentBlockFields = `
  _type,
  _key,
  body,
  "items": items[] {
    _key,
    mediaType,
    "imageUrl": image.asset->url,
    "imageRef": image.asset._ref,
    "imageAlt": image.alt,
    "imageWidth": image.asset->metadata.dimensions.width,
    "imageHeight": image.asset->metadata.dimensions.height,
    "imageHotspot": image.hotspot,
    "imageCrop": image.crop,
    "videoFileUrl": videoFile.asset->url,
    videoUrl,
    caption,
    embedProvider,
    embedUrl,
    icon,
    value,
    unit,
    title,
    description,
    color
  },
  quote,
  author,
  authorRole,
  "avatarUrl": avatar.asset->url + "?w=72&q=80&auto=format",
  variant,
  title,
  provider,
  url,
  caption
`;

export const projectDetailQuery = defineQuery(`
  *[_type == "project" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    "thumbnailRef": thumbnail.asset._ref,
    "organisation": organisation->{ name, "logoUrl": logo.asset->url + "?w=96&q=90&auto=format" },
    startDate,
    endDate,
    "tags": tags[]->{ _id, name, color, icon },
    "roles": roles[]->{ _id, name, color, icon },
    "mates": contributors[defined(person)] {
      _key,
      "person": person->{ _id, firstName, lastName, "avatarUrl": avatar.asset->url + "?w=72&q=80&auto=format", linkedinUrl },
      "roles": roles[]->{ _id, name, color, icon }
    },
    redirectUrl,
    "content": content[] {
      _key,
      title,
      icon,
      "blocks": blocks[] {
        ${contentBlockFields}
      }
    }
  }
`);

export type BlockText = {
  _type: "blockText";
  _key: string;
  body: unknown[] | null;
};

export type MediaItem = {
  _key: string;
  mediaType: "image" | "video" | "embed" | null;
  imageUrl: string | null;
  imageRef: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageHotspot: { x: number; y: number; width: number; height: number } | null;
  imageCrop: { top: number; bottom: number; left: number; right: number } | null;
  videoFileUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  embedProvider: "figma" | "youtube" | "vimeo" | "lottie" | "codesandbox" | "other" | null;
  embedUrl: string | null;
};

export type BlockMedia = {
  _type: "blockMedia";
  _key: string;
  items: MediaItem[] | null;
};

export type CardItem = {
  _key: string;
  icon: string | null;
  value: string | null;
  unit: string | null;
  title: string | null;
  description: unknown[] | null; // portable text (bold/italic)
  color: string | null;
};

export type BlockCard = {
  _type: "blockCard";
  _key: string;
  items: CardItem[] | null;
  caption: string | null;
};

export type BlockQuote = {
  _type: "blockQuote";
  _key: string;
  quote: string;
  author: string | null;
  authorRole: string | null;
  avatarUrl: string | null;
};

export type BlockCallout = {
  _type: "blockCallout";
  _key: string;
  variant: "insight" | "warning" | "tip" | "result" | null;
  title: string | null;
  body: string | null;
};

export type BlockIntegration = {
  _type: "blockIntegration";
  _key: string;
  provider: "figma" | "youtube" | "vimeo" | "lottie" | "codesandbox" | "other" | null;
  url: string | null;
  caption: string | null;
};

export type Block =
  | BlockText
  | BlockMedia
  | BlockCard
  | BlockQuote
  | BlockCallout
  | BlockIntegration;

export type ContentSection = {
  _key: string;
  title: string;
  icon: string | null;
  blocks: Block[] | null;
};

export type ProjectDetail = {
  _id: string;
  title: string;
  slug: string;
  thumbnailRef: string | null;
  organisation: { name: string; logoUrl: string | null } | null;
  startDate: string | null;
  endDate: string | null;
  tags: Array<{ _id: string; name: string; color: string | null; icon: string | null }> | null;
  roles: Array<{ _id: string; name: string; color: string | null; icon: string | null }> | null;
  mates: Array<{
    _key: string;
    person: {
      _id: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      linkedinUrl: string | null;
    };
    roles: Array<{ _id: string; name: string; color: string | null; icon: string | null }> | null;
  }> | null;
  redirectUrl: string | null;
  content: ContentSection[] | null;
};

export const allProjectSlugsQuery = defineQuery(`
  *[_type == "project"] { "slug": slug.current }
`);

// ─── Artifacts (Play page canvas) ─────────────────────────────────────────────

export const artifactsCanvasQuery = defineQuery(`
  *[_type == "artifact"] | order(orderRank) {
    _id,
    title,
    "slug": slug.current,
    description,
    "firstMedia": gallery[0] {
      _type,
      "imageUrl": image.asset->url,
      "imageRef": image.asset._ref,
      "imageWidth": image.asset->metadata.dimensions.width,
      "imageHeight": image.asset->metadata.dimensions.height,
      "imageHotspot": image.hotspot,
      "imageCrop": image.crop,
      "videoFileUrl": file.asset->url,
      "videoUrl": url
    },
    "tags": tags[]->{ _id, name, color, icon },
    startDate,
    endDate
  }
`);

export type ArtifactFirstMedia = {
  _type: "galleryImage" | "galleryVideo";
  imageUrl: string | null;
  imageRef: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageHotspot: { x: number; y: number; width: number; height: number } | null;
  imageCrop: { top: number; bottom: number; left: number; right: number } | null;
  videoFileUrl: string | null;
  videoUrl: string | null;
};

export type ArtifactCanvasItem = {
  _id: string;
  title: string;
  slug: string;
  description: string | null;
  firstMedia: ArtifactFirstMedia | null;
  tags: Array<{ _id: string; name: string; color: string | null; icon: string | null }> | null;
  startDate: string | null;
  endDate: string | null;
};

// ─── Profile (Info page) ──────────────────────────────────────────────────────

export const profileQuery = defineQuery(`
  *[_type == "profile"][0] {
    firstName,
    lastName,
    pseudo,
    jobTitle,
    bio,
    "stories": stories[] {
      _key,
      _type,
      "imageUrl": image.asset->url + "?w=900&q=85&auto=format",
      alt,
      caption,
      "videoFileUrl": file.asset->url,
      url,
      shareUrl,
      username,
      address,
      label,
      trackerUrl,
      region
    },
    "tools": tools[]->{ _id, name, "logoUrl": logo.asset->url + "?w=96&q=90&auto=format", url, referral }
  }
`);

export type ProfileStory =
  | {
      _key: string;
      _type: "storyPhoto";
      imageUrl: string | null;
      alt: string | null;
      caption: string | null;
    }
  | {
      _key: string;
      _type: "storyVideo";
      videoFileUrl: string | null;
      url: string | null;
      caption: string | null;
    }
  | {
      _key: string;
      _type: "storyAppleMusic";
      url: string | null;
    }
  | {
      _key: string;
      _type: "storyStrava";
      shareUrl: string | null;
    }
  | {
      _key: string;
      _type: "storyGithub";
      username: string | null;
    }
  | {
      _key: string;
      _type: "storyAppleMaps";
      address: string | null;
      label: string | null;
    }
  | {
      _key: string;
      _type: "storyValorant";
      trackerUrl: string | null;
      region: string | null;
    };

export type Profile = {
  firstName: string;
  lastName: string;
  pseudo: string | null;
  jobTitle: string | null;
  bio: string | null;
  stories: ProfileStory[] | null;
  tools: Array<{
    _id: string;
    name: string;
    logoUrl: string | null;
    url: string | null;
    referral: boolean | null;
  }> | null;
};

export const experiencesQuery = defineQuery(`
  *[_type == "experience"] | order(orderRank) {
    _id,
    title,
    "contractType": contractType->{ name },
    "organisation": organisation->{ name, websiteUrl, "logoUrl": logo.asset->url + "?w=96&q=90&auto=format" },
    "roles": roles[]->{ _id, name, color, icon },
    startDate,
    endDate
  }
`);

export type ExperienceItem = {
  _id: string;
  title: string;
  contractType: { name: string } | null;
  organisation: { name: string; websiteUrl: string | null; logoUrl: string | null } | null;
  roles: Array<{ _id: string; name: string; color: string | null; icon: string | null }> | null;
  startDate: string | null;
  endDate: string | null;
};

export const educationQuery = defineQuery(`
  *[_type == "education"] | order(orderRank) {
    _id,
    title,
    "organisation": organisation->{ name, websiteUrl, "logoUrl": logo.asset->url + "?w=96&q=90&auto=format" },
    startDate,
    endDate
  }
`);

export type EducationItem = {
  _id: string;
  title: string;
  organisation: { name: string; websiteUrl: string | null; logoUrl: string | null } | null;
  startDate: string | null;
  endDate: string | null;
};

export const volunteerQuery = defineQuery(`
  *[_type == "volunteer"] | order(orderRank) {
    _id,
    title,
    "organisation": organisation->{ name, websiteUrl, "logoUrl": logo.asset->url + "?w=96&q=90&auto=format" },
    startDate,
    endDate
  }
`);

export type VolunteerItem = {
  _id: string;
  title: string;
  organisation: { name: string; websiteUrl: string | null; logoUrl: string | null } | null;
  startDate: string | null;
  endDate: string | null;
};

export const awardsQuery = defineQuery(`
  *[_type == "award"] | order(orderRank) {
    _id,
    title,
    "organisation": organisation->{ name, websiteUrl, "logoUrl": logo.asset->url + "?w=96&q=90&auto=format" },
    date
  }
`);

export type AwardItem = {
  _id: string;
  title: string;
  organisation: { name: string; websiteUrl: string | null; logoUrl: string | null } | null;
  date: string | null;
};
