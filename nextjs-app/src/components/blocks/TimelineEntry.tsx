"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PortableText } from "@portabletext/react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import posthog from "posthog-js";
import { portableComponents } from "@/components/blocks/TextBlock";
import { LogoTile } from "@/components/blocks/LogoTile";
import { Separator } from "@/components/ui/Separator";
import { formatDateRange } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

/** Une section de la timeline : son nom (PostHog) et l'entrée ouverte (une seule à la fois). */
const SectionContext = createContext<{
  section: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}>({ section: "info", openId: null, setOpenId: () => {} });

/** Une section de la timeline (Experience, Education…) : une seule entrée ouverte à la fois. */
export function TimelineSection({
  section,
  className,
  children,
}: {
  section: string;
  className?: string;
  children: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <SectionContext.Provider value={{ section, openId, setOpenId }}>
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
  /** Absent quand l'en-tête porte déjà le titre (entrée sans organisation). */
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

/** Le logo d'une entrée. */
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

/** Une seule courbe, douce et sans rebond, pour tout ce qui change de taille. */
const EASE = [0.22, 1, 0.36, 1] as const;
const HEIGHT: Transition = { duration: 0.48, ease: EASE };

/**
 * Hauteur qui s'ouvre puis contenu qui apparaît ; à la fermeture, le contenu
 * part d'abord, puis la hauteur se replie.
 */
const panelVariants: Variants = {
  closed: { height: 0, transition: { ...HEIGHT, delay: 0.1 } },
  open: { height: "auto", transition: HEIGHT },
};
const contentVariants: Variants = {
  closed: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.14, ease: "easeOut" },
  },
  open: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: EASE, delay: 0.12 },
  },
};
/** Ce qui n'appartient qu'à la ligne fermée (poste, dates, fil du groupe). */
const summaryVariants: Variants = {
  // Revient en même temps que le panneau se replie ; `overflow` reste visible
  // au repos pour que la ligne « it was … » des dates ne soit pas coupée.
  shown: {
    height: "auto",
    opacity: 1,
    transition: {
      ...HEIGHT,
      delay: 0.1,
      opacity: { duration: 0.3, ease: EASE, delay: 0.25 },
    },
    transitionEnd: { overflow: "visible" },
  },
  hidden: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
    transition: { ...HEIGHT, opacity: { duration: 0.14 } },
  },
};

/** `prefers-reduced-motion` : les mêmes états, sans transition. */
function instant(variants: Variants): Variants {
  return Object.fromEntries(
    Object.entries(variants).map(([name, target]) => [
      name,
      { ...(target as object), transition: { duration: 0 } },
    ]),
  );
}
const INSTANT = {
  panel: instant(panelVariants),
  content: instant(contentVariants),
  summary: instant(summaryVariants),
};

/**
 * Une entrée de la timeline (une ligne, ou un groupe de postes dans la même
 * organisation). Au clic, elle se déplie sur place et devient une carte
 * surélevée (fond blanc, ombre douce), un peu plus large que la ligne :
 *
 * - en-tête : le logo et le nom de la ligne restent où ils sont ; avec un site,
 *   logo + nom + flèche deviennent le lien (nouvel onglet) ;
 * - un séparateur ;
 * - chaque poste : titre, dates, description, l'un sous l'autre.
 *
 * Un bouton disclosure (`aria-expanded`, `aria-controls`) couvre l'en-tête ;
 * Échap ou un clic hors de la carte la referme. Une seule entrée ouverte par
 * section. Avec `prefers-reduced-motion`, pas d'animation de hauteur.
 */
export function TimelineEntry({
  id,
  trackTitle,
  org,
  roles,
  ongoingFallback = false,
  primary,
  aside,
  summary,
  logoAside,
  className,
}: {
  id: string;
  /** Le titre envoyé à PostHog (`info_entry_expanded`). */
  trackTitle: string;
  org: TimelineCardOrg;
  roles: TimelineCardRole[];
  ongoingFallback?: boolean;
  /** La ligne en gras quand l'entrée est fermée (par défaut, le nom de l'organisation). */
  primary?: ReactNode;
  /** À droite de la ligne en gras, fermée seulement (les dates). */
  aside?: ReactNode;
  /** Sous la ligne en gras, fermée seulement (poste, dates en mobile, postes d'un groupe). */
  summary?: ReactNode;
  /** Sous le logo, fermée seulement (le fil d'un groupe). */
  logoAside?: ReactNode;
  /** Classes du cadre (marges, espacement). */
  className?: string;
}) {
  const { section, openId, setOpenId } = useContext(SectionContext);
  const open = openId === id;
  const reduceMotion = useReducedMotion();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Échap et clic hors de la carte la referment.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenId(null);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, setOpenId]);

  function toggle() {
    if (open) {
      setOpenId(null);
    } else {
      setOpenId(id);
      posthog.capture("info_entry_expanded", { section, title: trackTitle });
    }
  }

  const visibleRoles = roles.filter(
    (role) => role.title || role.startDate || hasDescription(role.description),
  );
  const v = reduceMotion
    ? INSTANT
    : {
        panel: panelVariants,
        content: contentVariants,
        summary: summaryVariants,
      };

  return (
    <div
      ref={rootRef}
      data-open={open ? "" : undefined}
      className={cn(
        "group/entry relative rounded-2xl",
        "transition-transform duration-300 not-data-[open]:hover:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:scale-100",
        open && "z-10",
        className,
      )}
    >
      {/* La surface : transparente au repos, carte surélevée et un peu plus large ouverte. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 rounded-2xl transition-[inset,background-color,box-shadow,border-radius] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          open
            ? "-inset-x-2 -inset-y-1 rounded-3xl bg-white shadow-xl ring-1 shadow-stone-900/8 ring-stone-900/5"
            : "group-hover/entry:bg-stone-50",
        )}
      />

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={trackTitle}
          onClick={toggle}
          className="absolute -inset-x-4 -inset-y-4 cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
        />
        {/* Le clic sur la ligne passe par ici ; le bouton porte l'état pour le clavier et les lecteurs d'écran. */}
        <div onClick={toggle} className="relative flex cursor-pointer gap-4">
          {!(open && org.websiteUrl) && (
            <div className="flex shrink-0 flex-col items-center">
              <TimelineLogo name={org.name} logoUrl={org.logoUrl} />
              <AnimatePresence initial={false}>
                {!open && logoAside && (
                  <motion.span
                    key="logo-aside"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    className="flex w-full flex-1 flex-col items-center"
                  >
                    {logoAside}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )}
          {open && org.websiteUrl ? (
            <OrgLink org={org} />
          ) : (
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-start justify-between gap-x-4">
                <span className="min-w-0 text-lg font-bold text-stone-900">
                  {open ? org.name : (primary ?? org.name)}
                </span>
                {!open && aside}
              </div>
              <AnimatePresence initial={false}>
                {!open && summary && (
                  <motion.div
                    key="summary"
                    variants={v.summary}
                    initial="hidden"
                    animate="shown"
                    exit="hidden"
                  >
                    {summary}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            id={panelId}
            role="region"
            aria-label={org.name}
            variants={v.panel}
            initial="closed"
            animate="open"
            exit="closed"
            className="relative overflow-hidden"
          >
            <motion.div variants={v.content}>
              {visibleRoles.length > 0 && (
                <>
                  <Separator className="mt-4 bg-stone-100" />
                  <div className="flex flex-col gap-6 pt-5 pb-1">
                    {visibleRoles.map((role) => (
                      <RoleBlock
                        key={role.id}
                        role={role}
                        ongoingFallback={ongoingFallback}
                      />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** L'en-tête ouvert : logo + nom + flèche, un seul lien vers le site (nouvel onglet). */
function OrgLink({ org }: { org: TimelineCardOrg }) {
  return (
    <a
      href={org.websiteUrl ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        posthog.capture("organization_website_clicked");
      }}
      className="group/link -m-1 flex w-fit items-center gap-4 rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
    >
      <TimelineLogo name={org.name} logoUrl={org.logoUrl} />
      <span className="flex items-center gap-1">
        <span className="text-lg font-bold text-stone-900 underline decoration-transparent underline-offset-4 transition-colors duration-150 group-hover/link:decoration-stone-300">
          {org.name}
        </span>
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          size={18}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-stone-400 transition-colors duration-150 group-hover/link:text-stone-800"
        />
        <span className="sr-only">(opens in a new tab)</span>
      </span>
    </a>
  );
}

function RoleBlock({
  role,
  ongoingFallback,
}: {
  role: TimelineCardRole;
  ongoingFallback: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
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
            {formatDateRange(role.startDate, role.endDate, ongoingFallback)}
          </span>
        )}
      </div>
      {hasDescription(role.description) && (
        <div className="text-base leading-relaxed text-stone-600 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-stone-800">
          <PortableText
            value={
              role.description as Parameters<typeof PortableText>[0]["value"]
            }
            components={portableComponents}
          />
        </div>
      )}
    </div>
  );
}
