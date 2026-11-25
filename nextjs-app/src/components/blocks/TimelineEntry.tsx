"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import { PortableText } from "@portabletext/react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import posthog from "posthog-js";
import { portableComponents } from "@/components/blocks/TextBlock";
import { LogoTile } from "@/components/blocks/LogoTile";
import { Separator } from "@/components/ui/Separator";
import { formatDateRange } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

/** Le nom de la section, pour l'événement PostHog `info_entry_expanded`. */
const SectionContext = createContext<string>("info");

/** Une section de la timeline (Experience, Education…) : donne son nom aux entrées. */
export function TimelineSection({
  section,
  className,
  children,
}: {
  section: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SectionContext.Provider value={section}>
      <div className={className}>{children}</div>
    </SectionContext.Provider>
  );
}

export type TimelineCardOrg = {
  name: string;
  logoUrl: string | null;
  websiteUrl?: string | null;
};

export type TimelineCardRole = {
  id: string;
  /** Absent quand l'en-tête de la carte porte déjà le titre (entrée sans organisation). */
  title?: string | null;
  contractType?: string | null;
  startDate: string | null;
  endDate: string | null;
  description?: unknown[] | null;
};

/** Un Portable Text vide (`null`, `[]`) n'a rien à montrer. */
function hasDescription(description: unknown[] | null | undefined) {
  return Array.isArray(description) && description.length > 0;
}

/** Le logo d'une entrée, dans la ligne comme dans la carte. */
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

const LAYOUT_TRANSITION: Transition = {
  type: "spring",
  bounce: 0.12,
  duration: 0.5,
};

/**
 * Une entrée de la timeline (une ligne, ou un groupe de postes dans la même
 * organisation) : toute la ligne est un bouton qui ouvre une carte centrée
 * par-dessus la page. La carte naît de la ligne (transition d'élément partagé
 * `layoutId`, le logo compris) ; avec `prefers-reduced-motion`, simple fondu.
 *
 * Base UI `Dialog` (la primitive du Dialog shadcn `base-*`) gère le reste :
 * `role="dialog"` + `aria-modal`, nommée par le nom de l'organisation, focus
 * piégé dans la carte, Échap et clic sur le fond pour fermer, focus rendu à la
 * ligne, défilement de la page bloqué.
 *
 * Carte : en-tête (logo, nom, flèche ; lien vers le site s'il existe), un
 * séparateur, puis chaque poste (titre, dates, description) l'un sous l'autre.
 */
export function TimelineEntry({
  id,
  trackTitle,
  org,
  roles,
  ongoingFallback = false,
  logoAside,
  className,
  children,
}: {
  id: string;
  /** Le titre envoyé à PostHog (`info_entry_expanded`). */
  trackTitle: string;
  org: TimelineCardOrg;
  roles: TimelineCardRole[];
  ongoingFallback?: boolean;
  /** Sous le logo de la ligne (le fil d'un groupe). */
  logoAside?: ReactNode;
  /** Classes du bouton (marges, espacement). */
  className?: string;
  children: ReactNode;
}) {
  const section = useContext(SectionContext);
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  const cardId = reduceMotion ? undefined : `timeline-card-${id}`;
  const logoId = reduceMotion ? undefined : `timeline-logo-${id}`;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          posthog.capture("info_entry_expanded", { section, title: trackTitle });
        }
      }}
    >
      <Dialog.Trigger
        className={cn(
          "group/entry relative flex w-full cursor-pointer gap-4 rounded-2xl text-left outline-none",
          "transition-transform duration-300 hover:scale-[0.985] focus-visible:ring-2 focus-visible:ring-stone-300",
          "motion-reduce:transition-none motion-reduce:hover:scale-100",
          className,
        )}
      >
        {/* Le fond de la ligne : c'est lui qui devient la carte. */}
        {!open && (
          <motion.span
            aria-hidden="true"
            layoutId={cardId}
            transition={LAYOUT_TRANSITION}
            className="absolute inset-0 rounded-2xl bg-transparent transition-colors duration-300 group-hover/entry:bg-stone-50"
          />
        )}
        <span className="relative flex flex-col items-center">
          {open ? (
            <span aria-hidden="true" className="block h-10 w-10" />
          ) : (
            <motion.span
              layoutId={logoId}
              transition={LAYOUT_TRANSITION}
              className="block"
            >
              <TimelineLogo name={org.name} logoUrl={org.logoUrl} />
            </motion.span>
          )}
          {logoAside}
        </span>
        <span className="relative flex min-w-0 flex-1 flex-col">{children}</span>
      </Dialog.Trigger>

      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                />
              }
              className="fixed inset-0 z-60 bg-stone-900/25 backdrop-blur-xs"
            />
            <Dialog.Viewport className="fixed inset-0 z-60 flex items-center justify-center p-4 sm:p-8">
              <Dialog.Popup
                // Base UI rend le reste de la page inerte sans poser `aria-modal`.
                aria-modal="true"
                render={
                  <motion.div
                    layoutId={cardId}
                    transition={LAYOUT_TRANSITION}
                    initial={reduceMotion ? { opacity: 0 } : undefined}
                    animate={reduceMotion ? { opacity: 1 } : undefined}
                    exit={reduceMotion ? { opacity: 0 } : undefined}
                  />
                }
                className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none"
              >
                <TimelineCard
                  org={org}
                  roles={roles}
                  ongoingFallback={ongoingFallback}
                  logoId={logoId}
                />
              </Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Le texte de la carte apparaît une fois qu'elle a pris sa place, et part en premier. */
const fade = {
  layout: "position" as const,
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, delay: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

function TimelineCard({
  org,
  roles,
  ongoingFallback,
  logoId,
}: {
  org: TimelineCardOrg;
  roles: TimelineCardRole[];
  ongoingFallback: boolean;
  logoId: string | undefined;
}) {
  const header = (
    <>
      <motion.span
        layoutId={logoId}
        transition={LAYOUT_TRANSITION}
        className="block shrink-0"
      >
        <TimelineLogo name={org.name} logoUrl={org.logoUrl} />
      </motion.span>
      <motion.span {...fade} className="flex min-w-0 items-center gap-1">
        <Dialog.Title className="min-w-0 text-lg font-bold text-stone-900">
          {org.name}
        </Dialog.Title>
        {org.websiteUrl && (
          <HugeiconsIcon
            icon={ArrowUpRight01Icon}
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className="shrink-0 text-stone-400 transition-colors duration-150 group-hover/link:text-stone-800"
          />
        )}
      </motion.span>
    </>
  );

  const visibleRoles = roles.filter(
    (role) => role.title || role.startDate || hasDescription(role.description),
  );

  return (
    <>
      <div className="p-4">
        {org.websiteUrl ? (
          <a
            href={org.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => posthog.capture("organization_website_clicked")}
            className="group/link flex items-center gap-4 rounded-2xl p-2 transition-colors duration-150 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-300"
          >
            {header}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <div className="flex items-center gap-4 p-2">{header}</div>
        )}
      </div>

      {visibleRoles.length > 0 && (
        <motion.div {...fade} className="flex min-h-0 flex-col">
          <Separator className="bg-stone-100" />
          <div className="flex flex-col gap-6 overflow-y-auto p-6">
            {visibleRoles.map((role) => (
              <div key={role.id} className="flex flex-col gap-2">
                <div className="flex flex-col">
                  {role.title && (
                    <h3 className="text-base font-semibold text-stone-900">
                      {role.title}
                      {role.contractType && (
                        <span className="font-normal text-stone-400">
                          {" "}
                          · {role.contractType}
                        </span>
                      )}
                    </h3>
                  )}
                  {role.startDate && (
                    <span className="text-sm font-medium text-stone-500">
                      {formatDateRange(
                        role.startDate,
                        role.endDate,
                        ongoingFallback,
                      )}
                    </span>
                  )}
                </div>
                {hasDescription(role.description) && (
                  <div className="text-base leading-relaxed text-stone-600 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-stone-800">
                    <PortableText
                      value={
                        role.description as Parameters<
                          typeof PortableText
                        >[0]["value"]
                      }
                      components={portableComponents}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </>
  );
}
