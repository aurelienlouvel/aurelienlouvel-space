import { TimelineDates } from "@/components/blocks/TimelineRow";
import {
  TimelineEntry,
  type TimelineCardRole,
} from "@/components/blocks/TimelineEntry";

export type TimelineGroupRole = {
  _id: string;
  title: string;
  contractType?: string | null;
  startDate: string | null;
  endDate: string | null;
  description?: unknown[] | null;
};

/**
 * Plusieurs postes consécutifs dans la même organisation : l'organisation une
 * seule fois (logo, nom), puis les postes empilés dessous, chacun avec son
 * titre et ses dates, reliés par un fil sous le logo. Tout le groupe est une
 * seule cible : il ouvre une carte avec chaque poste (titre, dates,
 * description) l'un sous l'autre. Un seul poste reste un `TimelineRow`. Doit
 * vivre dans une `TimelineSection`.
 */
export function TimelineGroup({
  orgName,
  logoUrl,
  websiteUrl,
  roles,
  ongoingFallback = false,
}: {
  orgName: string;
  logoUrl: string | null;
  websiteUrl?: string | null;
  roles: TimelineGroupRole[];
  ongoingFallback?: boolean;
}) {
  const cardRoles: TimelineCardRole[] = roles.map((role) => ({
    id: role._id,
    title: role.title,
    contractType: role.contractType,
    startDate: role.startDate,
    endDate: role.endDate,
    description: role.description,
  }));

  return (
    <TimelineEntry
      id={roles[0]?._id ?? orgName}
      trackTitle={orgName}
      org={{ name: orgName, logoUrl, websiteUrl }}
      roles={cardRoles}
      ongoingFallback={ongoingFallback}
      logoAside={
        <span aria-hidden="true" className="mt-2 w-px flex-1 bg-stone-200" />
      }
      className="-mx-2 px-4 py-4"
    >
      <span className="min-w-0 text-lg font-bold text-stone-900">{orgName}</span>
      <span className="mt-1 flex flex-col gap-2">
        {roles.map((role) => (
          <span key={role._id} className="flex flex-col">
            <span className="flex flex-wrap items-start justify-between gap-x-4">
              <span className="min-w-0 text-base text-stone-500">
                {role.title}
                {role.contractType && (
                  <span className="text-stone-400"> · {role.contractType}</span>
                )}
              </span>
              {role.startDate && (
                <TimelineDates
                  startDate={role.startDate}
                  endDate={role.endDate}
                  ongoingFallback={ongoingFallback}
                  placement="aside"
                />
              )}
            </span>
            {role.startDate && (
              <TimelineDates
                startDate={role.startDate}
                endDate={role.endDate}
                ongoingFallback={ongoingFallback}
                placement="below"
              />
            )}
          </span>
        ))}
      </span>
    </TimelineEntry>
  );
}
