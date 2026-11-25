import {
  TimelineDates,
  TimelineLogo,
  TimelineShell,
} from "@/components/blocks/TimelineRow";

export type TimelineGroupRole = {
  _id: string;
  title: string;
  contractType?: string | null;
  startDate: string | null;
  endDate: string | null;
};

/**
 * Plusieurs postes consécutifs dans la même organisation : l'organisation une
 * seule fois (logo, nom, lien), puis les postes empilés dessous, chacun avec
 * son titre et ses dates, reliés par un fil sous le logo. Un seul poste reste
 * un `TimelineRow`.
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
  return (
    <TimelineShell websiteUrl={websiteUrl}>
      <div className="flex flex-col items-center">
        <TimelineLogo name={orgName} logoUrl={logoUrl} />
        <span aria-hidden="true" className="mt-2 w-px flex-1 bg-stone-200" />
      </div>
      <div className="flex flex-1 flex-col">
        <span className="min-w-0 text-lg font-bold text-stone-900">
          {orgName}
        </span>
        <ul className="mt-1 flex flex-col gap-3">
          {roles.map((role) => (
            <li key={role._id} className="flex flex-col">
              <div className="flex flex-wrap items-start justify-between gap-x-4">
                <span className="min-w-0 text-base text-stone-500">
                  {role.title}
                  {role.contractType && (
                    <span className="text-stone-400">
                      {" "}
                      · {role.contractType}
                    </span>
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
              </div>
              {role.startDate && (
                <TimelineDates
                  startDate={role.startDate}
                  endDate={role.endDate}
                  ongoingFallback={ongoingFallback}
                  placement="below"
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </TimelineShell>
  );
}
