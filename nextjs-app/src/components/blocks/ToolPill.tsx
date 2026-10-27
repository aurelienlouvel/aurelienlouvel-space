"use client";

import posthog from "posthog-js";
import type { Profile } from "@/sanity/queries";
import { ToolIcon } from "@/components/blocks/ToolIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";

type ToolItem = NonNullable<Profile["tools"]>[number];

export function ToolPill({ tool }: { tool: ToolItem }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          tool.url ? (
            <a
              href={tool.url}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                posthog.capture("tool_link_clicked", {
                  is_referral: Boolean(tool.referral),
                })
              }
            />
          ) : (
            <div />
          )
        }
      >
        <div className="transition-transform duration-150 hover:rotate-2 hover:scale-110">
          <ToolIcon name={tool.name} logoUrl={tool.logoUrl} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={10}>
        {tool.name}
      </TooltipContent>
    </Tooltip>
  );
}
