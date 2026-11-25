"use client";

import type { ReactNode } from "react";
import posthog from "posthog-js";
import { LogoTile } from "@/components/blocks/LogoTile";
import { formatDateRange } from "@/lib/date-utils";
import { DateAgo } from "@/components/blocks/DateAgo";
import { cn } from "@/lib/utils";

/**
 * Le cadre d'une ligne (ou d'un groupe) de la timeline : un lien vers le site
 * de l'organisation quand il existe (avec l'événement PostHog), sinon un
 * simple bloc. Partagé par `TimelineRow` et `TimelineGroup`.
 */
export function TimelineShell({
  websiteUrl,
  children,
}: {
  websiteUrl?: string | null;
  children: ReactNode;
}) {
  const className = cn(
    "flex gap-4 rounded-2xl px-4 py-4 -mx-2 transition-all duration-300",
    websiteUrl && "hover:scale-[0.985] hover:bg-stone-50",
  );

  if (websiteUrl) {
    return (
      <a
        href={websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => posthog.capture("organization_website_clicked")}
        className={className}
      >
        {children}
      </a>
    );
  }

  return <div className={className}>{children}</div>;
}

export function TimelineLogo({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  return (
    <LogoTile
      name={name}
      logoUrl={logoUrl}
      className="h-10 w-10 rounded-xl text-base"
    />
  );
}

/** La plage de dates : à droite à partir de `sm`, sous le titre en mobile. */
export function TimelineDates({
  startDate,
  endDate,
  ongoingFallback = false,
  placement,
}: {
  startDate: string;
  endDate: string | null;
  ongoingFallback?: boolean;
  placement: "aside" | "below";
}) {
  const label = formatDateRange(startDate, endDate, ongoingFallback);

  if (placement === "aside") {
    return (
      <DateAgo
        date={endDate ?? startDate}
        ongoing={!endDate}
        floating
        align="right"
        className="hidden shrink-0 sm:inline-flex"
      >
        <span className="whitespace-nowrap text-sm font-medium text-stone-600">
          {label}
        </span>
      </DateAgo>
    );
  }

  return (
    <DateAgo
      date={endDate ?? startDate}
      ongoing={!endDate}
      className="mt-0.5 sm:hidden"
    >
      <span className="text-sm font-medium text-stone-500">{label}</span>
    </DateAgo>
  );
}

export function TimelineRow({
  orgName,
  logoUrl,
  websiteUrl,
  title,
  contractType,
  startDate,
  endDate,
  ongoingFallback = false,
}: {
  orgName: string | null;
  logoUrl: string | null;
  websiteUrl?: string | null;
  title: string;
  contractType?: string | null;
  startDate: string | null;
  endDate: string | null;
  ongoingFallback?: boolean;
}) {
  return (
    <TimelineShell websiteUrl={websiteUrl}>
      <TimelineLogo name={orgName ?? title} logoUrl={logoUrl} />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-x-4">
          <span className="min-w-0 text-lg font-bold text-stone-900">
            {orgName ?? title}
          </span>
          {startDate && (
            <TimelineDates
              startDate={startDate}
              endDate={endDate}
              ongoingFallback={ongoingFallback}
              placement="aside"
            />
          )}
        </div>
        {orgName && (
          <span className="text-base text-stone-500">
            {title}
            {contractType && (
              <span className="text-stone-400"> · {contractType}</span>
            )}
          </span>
        )}
        {startDate && (
          <TimelineDates
            startDate={startDate}
            endDate={endDate}
            ongoingFallback={ongoingFallback}
            placement="below"
          />
        )}
      </div>
    </TimelineShell>
  );
}
