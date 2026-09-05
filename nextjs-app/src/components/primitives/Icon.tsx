import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import * as Icons from "@hugeicons/core-free-icons";

export function Icon({
  name,
  fallback,
  size = 12,
  strokeWidth = 2,
}: {
  name?: string | null;
  // Shown when `name` is unset or doesn't resolve to a real HugeIcon export
  // — lets callers with a sensible per-card default (e.g. a Sanity-editable
  // icon field) fall back to it instead of rendering nothing.
  fallback?: IconSvgElement;
  size?: number;
  strokeWidth?: number;
}) {
  const icon =
    (name ? (Icons as Record<string, IconSvgElement>)[name] : undefined) ??
    fallback;
  if (!icon) return null;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} />;
}
