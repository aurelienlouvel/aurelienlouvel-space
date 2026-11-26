import type { CSSProperties } from "react";
import type { ToolGroupItem, ToolItem } from "@/sanity/queries";
import { ToolPill } from "@/components/blocks/ToolPill";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

// Les logos d'un groupe, sur deux rangées : autant de colonnes que la moitié
// des outils (sur mobile, 4 par ligne au plus pour ne pas déborder).
function ToolGrid({ tools }: { tools: ToolItem[] }) {
  const cols = Math.ceil(tools.length / 2);
  return (
    <div
      style={{ "--tool-cols": cols } as CSSProperties}
      className={cn(
        "grid w-fit place-items-center gap-x-6 gap-y-5",
        cols >= 4 ? "grid-cols-4" : "grid-cols-[repeat(var(--tool-cols),minmax(0,1fr))]",
        "sm:grid-cols-[repeat(var(--tool-cols),minmax(0,1fr))]",
      )}
    >
      {tools.map((tool) => (
        <ToolPill key={tool._id} tool={tool} />
      ))}
    </div>
  );
}

/**
 * La section Tools : des petits groupes (couleur de fond, nom en petit centré
 * en bas du cadre, en Geist Mono) dans l'ordre du Studio. Les outils rangés dans aucun groupe suivent,
 * sans fond ni nom. Sans aucun groupe, tous les outils forment une seule grille.
 */
export function ToolGroups({
  groups,
  tools,
}: {
  groups: ToolGroupItem[];
  tools: ToolItem[];
}) {
  const grouped = new Set(
    groups.flatMap((group) => (group.tools ?? []).map((tool) => tool._id)),
  );
  const loose = tools.filter((tool) => !grouped.has(tool._id));
  const filled = groups.filter((group) => (group.tools ?? []).length > 0);

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-start gap-6">
        {filled.map((group) => (
          <figure
            key={group._id}
            className={cn(
              "flex flex-col items-center gap-4 rounded-3xl p-5 pb-4",
              group.color ? `bg-${group.color}-50` : "bg-stone-50",
            )}
          >
            <ToolGrid tools={group.tools ?? []} />
            <figcaption
              className={cn(
                "font-mono text-xs",
                group.color ? `text-${group.color}-700` : "text-stone-500",
              )}
            >
              {group.name}
            </figcaption>
          </figure>
        ))}
        {loose.length > 0 && (
          <div className={cn(filled.length > 0 && "p-5")}>
            <ToolGrid tools={loose} />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
