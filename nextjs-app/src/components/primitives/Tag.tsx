import { Badge } from "@/components/ui/Badge";
import { Icon } from "./Icon";

export function Tag({
  name,
  color,
  icon,
}: {
  name: string;
  color: string | null;
  icon: string | null;
}) {
  return (
    <Badge
      className={`h-auto border-0 px-3 py-1.5 rounded-lg text-base font-medium ${color ? ` bg-${color}-100 text-${color}-950` : ""}`}
    >
      {icon && <Icon name={icon} size={14} strokeWidth={1.8} />}
      {name}
    </Badge>
  );
}
