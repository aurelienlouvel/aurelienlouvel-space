"use client";

import { LogoTile } from "@/components/blocks/LogoTile";
import { formatDateRange } from "@/lib/date-utils";
import { DateAgo } from "@/components/blocks/DateAgo";
import { TimelineEntry } from "@/components/blocks/TimelineAccordion";

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

/** Le cadre d'une ligne de la timeline (fond au survol, arrondi, marges). */
const TIMELINE_ROW_CLASS = "-mx-2 rounded-2xl px-4 py-4";

/**
 * Une ligne de la timeline. Au clic, elle se déplie sur place pour montrer la
 * description et le lien vers le site de l'organisation (voir `TimelineEntry`) ;
 * elle doit vivre dans un `TimelineAccordion`.
 */
export function TimelineRow({
  id,
  orgName,
  logoUrl,
  websiteUrl,
  title,
  contractType,
  startDate,
  endDate,
  ongoingFallback = false,
  description,
}: {
  id: string;
  orgName: string | null;
  logoUrl: string | null;
  websiteUrl?: string | null;
  title: string;
  contractType?: string | null;
  startDate: string | null;
  endDate: string | null;
  ongoingFallback?: boolean;
  description?: unknown[] | null;
}) {
  return (
    <TimelineEntry
      value={id}
      trackTitle={orgName ? `${orgName} · ${title}` : title}
      description={description}
      websiteUrl={websiteUrl}
      className={TIMELINE_ROW_CLASS}
      panelClassName="pl-14"
    >
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
    </TimelineEntry>
  );
}
