import { formatDateRange } from "@/lib/date-utils";
import { DateAgo } from "@/components/blocks/DateAgo";
import { TimelineEntry } from "@/components/blocks/TimelineEntry";

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

/**
 * Une ligne de la timeline. Au clic, elle ouvre une carte (voir
 * `TimelineEntry`) : l'organisation en en-tête, puis le titre, les dates et la
 * description. Doit vivre dans une `TimelineSection`.
 *
 * `titleFirst` (Awards) : la ligne met le titre en gras et l'organisation
 * dessous ; la carte garde l'organisation en en-tête et le titre dessous.
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
  titleFirst = false,
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
  titleFirst?: boolean;
}) {
  const primary = titleFirst || !orgName ? title : orgName;
  const secondary = titleFirst ? orgName : orgName ? title : null;

  return (
    <TimelineEntry
      id={id}
      trackTitle={orgName ? `${orgName} · ${title}` : title}
      org={{ name: orgName ?? title, logoUrl, websiteUrl }}
      roles={[
        {
          id,
          // Sans organisation, l'en-tête de la carte porte déjà le titre.
          title: orgName ? title : null,
          contractType,
          startDate,
          endDate,
          description,
        },
      ]}
      ongoingFallback={ongoingFallback}
      className="-mx-2 px-4 py-4"
    >
      <span className="flex flex-wrap items-start justify-between gap-x-4">
        <span className="min-w-0 text-lg font-bold text-stone-900">
          {primary}
        </span>
        {startDate && (
          <TimelineDates
            startDate={startDate}
            endDate={endDate}
            ongoingFallback={ongoingFallback}
            placement="aside"
          />
        )}
      </span>
      {secondary && (
        <span className="text-base text-stone-500">
          {secondary}
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
    </TimelineEntry>
  );
}
