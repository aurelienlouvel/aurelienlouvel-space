"use client";

import posthog from "posthog-js";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FigmaIcon,
  GithubIcon,
  LinkedinIcon,
} from "@hugeicons/core-free-icons";
import type { ProfileSocial, SocialPlatform } from "@/sanity/queries";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";

const PLATFORMS: Record<
  SocialPlatform,
  { label: string; icon: typeof LinkedinIcon }
> = {
  linkedin: { label: "LinkedIn", icon: LinkedinIcon },
  github: { label: "GitHub", icon: GithubIcon },
  figma: { label: "Figma Community", icon: FigmaIcon },
};

// Sibling of ToolPill: same tooltip and hover tilt, with a HugeIcon in place
// of the tool logo.
export function SocialPill({ social }: { social: ProfileSocial }) {
  const { label, icon } = PLATFORMS[social.platform];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={social.url}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            onClick={() =>
              posthog.capture("social_link_clicked", {
                platform: social.platform,
              })
            }
          />
        }
      >
        <div className="flex h-7 w-7 items-center justify-center text-stone-700 transition-transform duration-150 hover:rotate-2 hover:scale-110">
          <HugeiconsIcon icon={icon} size={24} strokeWidth={1.5} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
