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
import { refreshScrollLimit } from "@/lib/scroll";
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

/** Une seule courbe, douce et sans rebond, pour tout ce qui change de hauteur. */
const EASE = [0.32, 0.72, 0, 1] as const;
const HEIGHT: Transition = { duration: 0.4, ease: EASE };
const INSTANT: Transition = { duration: 0 };

/**
 * Une seule ligne de temps : à l'ouverture, la hauteur s'ouvre et le contenu
 * arrive presque aussitôt, en légère cascade ; à la fermeture, il s'efface
 * vite pendant que la hauteur se replie. Ce qui n'appartient qu'à la ligne
 * fermée (poste, dates, fil d'un groupe) s'efface et revient en fondu. Avec
 * `instant` (`prefers-reduced-motion`), les mêmes états sans transition.
 */
function buildVariants(instant: boolean) {
  const height = instant ? INSTANT : HEIGHT;
  const fadeOut: Transition = instant
    ? INSTANT
    : { duration: 0.15, ease: "easeOut" };
  const fadeIn: Transition = instant ? INSTANT : { duration: 0.25, ease: EASE };
  const fadeBack: Transition = instant
    ? INSTANT
    : { duration: 0.25, ease: EASE, delay: 0.12 };

  const panel: Variants = {
    closed: { height: 0, transition: height },
    open: { height: "auto", transition: height },
  };
  const content: Variants = {
    closed: { transition: { staggerChildren: 0 } },
    open: {
      transition: instant
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.03, delayChildren: 0.05 },
    },
  };
  const item: Variants = {
    closed: { opacity: 0, y: -4, transition: fadeOut },
    open: { opacity: 1, y: 0, transition: fadeIn },
  };
  // Le poste et les dates de la ligne fermée : se replient en fondu.
  const summary: Variants = {
    // `overflow` reste visible au repos pour que la ligne « it was … » des
    // dates ne soit pas coupée.
    shown: {
      height: "auto",
      opacity: 1,
      transition: { ...height, opacity: fadeBack },
      transitionEnd: { overflow: "visible" },
    },
    hidden: {
      height: 0,
      opacity: 0,
      overflow: "hidden",
      transition: { ...height, opacity: fadeOut },
    },
  };
  // Les dates à droite, le fil d'un groupe, la flèche, le nom qui change.
  const fade: Variants = {
    shown: { opacity: 1, transition: fadeBack },
    hidden: { opacity: 0, transition: fadeOut },
  };
  const fadeInOpen: Variants = {
    shown: { opacity: 1, transition: fadeIn },
    hidden: { opacity: 0, transition: fadeOut },
  };
  return { panel, content, item, summary, fade, fadeInOpen };
}
const VARIANTS = buildVariants(false);
const VARIANTS_INSTANT = buildVariants(true);

/**
 * Une entrée de la timeline (une ligne, ou un groupe de postes dans la même
 * organisation). Au clic, elle se déplie sur place, sur le fond gris du
 * survol, et pousse ce qui suit :
 *
 * - en-tête : le logo et le nom de la ligne, qui restent où ils sont ; avec un
 *   site, logo + nom + flèche deviennent le lien (nouvel onglet) ;
 * - un séparateur ;
 * - chaque poste : titre, dates, description, l'un sous l'autre.
 *
 * Un bouton disclosure (`aria-expanded`, `aria-controls`) couvre l'en-tête ;
 * Échap ou un clic hors de l'entrée la referme, par la même animation. Une
 * seule entrée ouverte par section.
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
  primary?: string;
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
  const v = reduceMotion ? VARIANTS_INSTANT : VARIANTS;
  const panelId = useId();
  // Le fond gris reste tant que le panneau n'a pas fini de se replier, quel
  // que soit le chemin de fermeture (ligne, Échap, clic dehors, autre entrée).
  const [expanded, setExpanded] = useState(open);
  if (open && !expanded) setExpanded(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Échap et clic hors de l'entrée la referment.
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

  const rowName = primary ?? org.name;
  const swapsName = rowName !== org.name;
  const link = open && org.websiteUrl ? org.websiteUrl : undefined;
  const state = open ? "hidden" : "shown";
  const visibleRoles = roles.filter(
    (role) => role.title || role.startDate || hasDescription(role.description),
  );

  return (
    <div
      ref={rootRef}
      data-open={expanded ? "" : undefined}
      className={cn(
        "group/entry relative rounded-2xl transition-[background-color,scale] duration-300",
        "hover:bg-stone-50 data-[open]:bg-stone-50",
        "not-data-[open]:hover:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:scale-100",
        className,
      )}
    >
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={trackTitle}
          onClick={toggle}
          className="absolute -inset-4 cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
        />
        {/* Le clic sur la ligne passe par ici ; le bouton porte l'état pour le clavier et les lecteurs d'écran. */}
        <div
          onClick={toggle}
          className="relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4"
        >
          {/*
           * Ouvert avec un site, logo + nom + flèche sont un seul lien. Le même
           * élément reste en place (sans `href` quand il n'y a pas de lien) :
           * `contents` laisse ses enfants dans la grille, rien ne bouge.
           */}
          <a
            href={link}
            target={link ? "_blank" : undefined}
            rel={link ? "noopener noreferrer" : undefined}
            onClick={(event) => {
              if (!link) return;
              event.stopPropagation();
              posthog.capture("organization_website_clicked");
            }}
            className="group/link contents outline-none"
          >
            <span className="row-span-2 flex flex-col items-center">
              <TimelineLogo name={org.name} logoUrl={org.logoUrl} />
              {logoAside && (
                <motion.span
                  variants={v.fade}
                  initial={false}
                  animate={state}
                  className="flex w-full flex-1 flex-col items-center"
                >
                  {logoAside}
                </motion.span>
              )}
            </span>
            <span
              className={cn(
                "col-start-2 row-start-1 flex min-w-0 items-center gap-1 self-start rounded-lg",
                link &&
                  "group-focus-visible/link:ring-2 group-focus-visible/link:ring-stone-300",
              )}
            >
              <span
                className={cn(
                  "relative min-w-0 text-lg font-bold text-stone-900 underline decoration-transparent underline-offset-4 transition-colors duration-150",
                  link && "group-hover/link:decoration-stone-300",
                )}
              >
                {/* Awards : le titre de la ligne laisse la place au nom de l'organisation. */}
                <motion.span
                  variants={swapsName ? v.fade : undefined}
                  initial={false}
                  animate={state}
                  className={cn(
                    open &&
                      swapsName &&
                      "absolute top-0 left-0 whitespace-nowrap",
                  )}
                >
                  {rowName}
                </motion.span>
                {swapsName && (
                  <motion.span
                    variants={v.fadeInOpen}
                    initial={false}
                    animate={open ? "shown" : "hidden"}
                    aria-hidden={!open}
                    className={cn(
                      !open && "absolute top-0 left-0 whitespace-nowrap",
                    )}
                  >
                    {org.name}
                  </motion.span>
                )}
              </span>
              {org.websiteUrl && (
                <motion.span
                  variants={v.fadeInOpen}
                  initial={false}
                  animate={open ? "shown" : "hidden"}
                  aria-hidden={!open}
                  className="flex shrink-0"
                >
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    size={18}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="text-stone-400 transition-colors duration-150 group-hover/link:text-stone-800"
                  />
                </motion.span>
              )}
              {link && <span className="sr-only">(opens in a new tab)</span>}
            </span>
          </a>
          {aside && (
            <motion.span
              variants={v.fade}
              initial={false}
              animate={state}
              className="col-start-3 row-start-1"
            >
              {aside}
            </motion.span>
          )}
          {summary && (
            <motion.div
              variants={v.summary}
              initial={false}
              animate={state}
              className="col-span-2 col-start-2 row-start-2"
            >
              {summary}
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          setExpanded(false);
          refreshScrollLimit();
        }}
      >
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
            onAnimationComplete={refreshScrollLimit}
            className="relative overflow-hidden"
          >
            <motion.div variants={v.content}>
              {visibleRoles.length > 0 && (
                <>
                  <motion.div variants={v.item}>
                    <Separator className="mt-4 bg-stone-200/70" />
                  </motion.div>
                  <div className="flex flex-col gap-6 pt-5 pb-1">
                    {visibleRoles.map((role) => (
                      <motion.div key={role.id} variants={v.item}>
                        <RoleBlock
                          role={role}
                          ongoingFallback={ongoingFallback}
                        />
                      </motion.div>
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
