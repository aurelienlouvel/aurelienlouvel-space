import type { CSSProperties } from "react";
import type { ToolGroupItem, ToolItem } from "@/sanity/queries";
import { ToolPill } from "@/components/blocks/ToolPill";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

// Les logos d'un groupe, sur deux rangées : autant de colonnes que la moitié
// des outils (4 au plus en mobile, pour tenir dans l'écran).
function ToolGrid({ tools }: { tools: ToolItem[] }) {
  const cols = Math.ceil(tools.length / 2);
  return (
    <div
      style={{ "--tool-cols": cols } as CSSProperties}
      className={cn(
        "grid w-fit place-items-center gap-x-4 gap-y-4 sm:gap-x-6 sm:gap-y-5",
        cols >= 4
          ? "grid-cols-4"
          : "grid-cols-[repeat(var(--tool-cols),minmax(0,1fr))]",
        "sm:grid-cols-[repeat(var(--tool-cols),minmax(0,1fr))]",
      )}
    >
      {tools.map((tool) => (
        <ToolPill key={tool._id} tool={tool} />
      ))}
    </div>
  );
}

/** Un groupe large (plus de deux colonnes) prend toute la ligne en mobile. */
function isWide(count: number) {
  return Math.ceil(count / 2) > 2;
}

/**
 * La section Tools : des petits groupes (couleur de fond, nom en petit centré
 * en bas du cadre, en Geist Mono) dans l'ordre du Studio. Les outils rangés
 * dans aucun groupe suivent, sans fond ni nom.
 *
 * - Desktop : les groupes s'enchaînent sur des lignes, avec une largeur
 *   minimum pour que les petits groupes ne soient pas étriqués ; ceux d'une
 *   même ligne ont la même hauteur.
 * - Mobile : une grille de deux colonnes ; un groupe large prend toute la
 *   ligne, deux petits groupes se partagent une ligne.
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
      <div className="grid grid-flow-row-dense grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-stretch sm:gap-4">
        {filled.map((group) => {
          const groupTools = group.tools ?? [];
          return (
            <figure
              key={group._id}
              className={cn(
                "flex min-w-0 flex-col items-center justify-between gap-4 rounded-3xl p-5 pb-4 sm:min-w-36",
                isWide(groupTools.length) && "col-span-2",
                group.color ? `bg-${group.color}-50` : "bg-stone-50",
              )}
            >
              <ToolGrid tools={groupTools} />
              <figcaption
                className={cn(
                  "font-mono text-xs",
                  group.color ? `text-${group.color}-700` : "text-stone-500",
                )}
              >
                {group.name}
              </figcaption>
            </figure>
          );
        })}
        {loose.length > 0 && (
          <div
            className={cn(
              "col-span-2 flex justify-center sm:justify-start",
              filled.length > 0 && "p-5",
            )}
          >
            <ToolGrid tools={loose} />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
