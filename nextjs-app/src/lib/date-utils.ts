function parseDate(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2] ?? 1);
}

export function formatDateRange(
  start: string,
  end: string | null,
  ongoingFallback = false,
): string {
  const startLabel = formatMonth(start);
  if (!end && !ongoingFallback) return startLabel;
  const endLabel = end ? formatMonth(end) : "now";
  if (startLabel === endLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
}

export function formatMonth(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split("-");
  return new Date(Number(yearStr), Number(monthStr) - 1, 1).toLocaleDateString(
    "en-US",
    { month: "short", year: "numeric" },
  );
}

export function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// For date-only strings (e.g. "2024-03-15") — parses as local time so it
// never shifts a day off in negative-UTC-offset timezones like new Date() would.
export function formatDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function calcDuration(start: string, end: string | null): string {
  const startDate = parseDate(start);
  const endDate = end ? parseDate(end) : new Date();
  const days = Math.round(
    (endDate.getTime() - startDate.getTime()) / 86_400_000,
  );

  if (days < 7) {
    const d = Math.max(1, days);
    return `${d} day${d !== 1 ? "s" : ""}`;
  }
  if (days < 30) {
    const w = Math.max(1, Math.round(days / 7));
    return `${w} week${w !== 1 ? "s" : ""}`;
  }
  if (days < 365) {
    const m = Math.max(1, Math.round(days / 30));
    return `${m} month${m !== 1 ? "s" : ""}`;
  }
  const years = Math.floor(days / 365);
  const rem = Math.round((days % 365) / 30);
  if (rem === 0) return `${years} yr${years !== 1 ? "s" : ""}`;
  return `${years}y ${rem}m`;
}
