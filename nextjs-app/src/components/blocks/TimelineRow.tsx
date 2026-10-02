import { LogoTile } from "@/components/blocks/LogoTile";
import { formatDateRange } from "@/lib/date-utils";
import { DateAgo } from "@/components/blocks/DateAgo";
import { cn } from "@/lib/utils";

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
  const content = (
    <>
      <LogoTile
        name={orgName ?? title}
        logoUrl={logoUrl}
        className="h-10 w-10 rounded-xl text-base"
      />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-x-4">
          <span className="min-w-0 text-lg font-bold text-stone-900">
            {orgName ?? title}
          </span>
          {startDate && (
            <DateAgo
              date={endDate ?? startDate}
              ongoing={!endDate}
              floating
              align="right"
              className="hidden shrink-0 sm:inline-flex"
            >
              <span className="whitespace-nowrap text-sm font-medium text-stone-600">
                {formatDateRange(startDate, endDate, ongoingFallback)}
              </span>
            </DateAgo>
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
          <DateAgo
            date={endDate ?? startDate}
            ongoing={!endDate}
            className="mt-0.5 sm:hidden"
          >
            <span className="text-sm font-medium text-stone-500">
              {formatDateRange(startDate, endDate, ongoingFallback)}
            </span>
          </DateAgo>
        )}
      </div>
    </>
  );

  const rowClassName = cn(
    "flex gap-4 rounded-2xl px-4 py-4 -mx-2 transition-all duration-300",
    websiteUrl && "hover:scale-[0.985] hover:bg-stone-50",
  );

  if (websiteUrl) {
    return (
      <a
        href={websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClassName}
      >
        {content}
      </a>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}
