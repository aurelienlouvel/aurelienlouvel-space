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

/** Une seule courbe, longue et douce, sans rebond, pour tout ce qui change de taille. */
const EASE = [0.32, 0.72, 0, 1] as const;
const GROW: Transition = { duration: 0.65, ease: EASE };
const INSTANT: Transition = { duration: 0 };

/** Le cadre de la ligne (`px-4 py-4`) et ce dont la carte dépasse une fois ouverte. */
const ROW_PADDING = 1;
const GROW_BY = 0.75;
/** L'en-tête grossit : logo de 2.5rem à 2.75rem, nom (et flèche) de 12 %. */
const LOGO_SCALE = 1.1;
const NAME_SCALE = 1.12;
const LOGO_GROWTH = 2.5 * (LOGO_SCALE - 1);

/** Les ombres ouverte et fermée ont la même forme, pour s'interpoler. */
const SHADOW_OPEN =
  "0 8px 30px -12px rgb(0 0 0 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.04)";
const SHADOW_CLOSED =
  "0 8px 30px -12px rgb(0 0 0 / 0), 0 0 0 1px rgb(0 0 0 / 0)";

/**
 * Tout suit une seule ligne de temps : la carte part du cadre de la ligne
 * (fond gris du survol, sans ombre) et grandit un peu vers l'extérieur en
 * devenant blanche ; son padding grandit d'autant, l'en-tête ne bouge pas.
 * L'intérieur s'ouvre vers le bas depuis la hauteur de la ligne (`custom`).
 * À l'ouverture, le contenu arrive en cascade ; à la fermeture, il s'efface
 * d'un coup, vite, pendant que la carte se replie. Avec `instant`
 * (`prefers-reduced-motion`), les mêmes états sans transition.
 */
function buildVariants(instant: boolean) {
  const grow = instant ? INSTANT : GROW;
  const fadeOut: Transition = instant
    ? INSTANT
    : { duration: 0.18, ease: "easeOut" };
  const fadeIn: Transition = instant ? INSTANT : { duration: 0.5, ease: EASE };

  const card: Variants = {
    closed: {
      top: "0rem",
      left: "0rem",
      right: "0rem",
      padding: `${ROW_PADDING}rem`,
      backgroundColor: "rgb(250 250 249)", // stone-50, le fond du survol
      boxShadow: SHADOW_CLOSED,
      transition: grow,
    },
    open: {
      top: `-${GROW_BY}rem`,
      left: `-${GROW_BY}rem`,
      right: `-${GROW_BY}rem`,
      padding: `${ROW_PADDING + GROW_BY}rem`,
      backgroundColor: "rgb(255 255 255)",
      boxShadow: SHADOW_OPEN,
      transition: grow,
    },
  };
  const inner: Variants = {
    closed: (rowHeight: number) => ({ height: rowHeight, transition: grow }),
    open: { height: "auto", transition: grow },
  };
  const logo: Variants = {
    closed: { scale: 1, transition: grow },
    open: { scale: LOGO_SCALE, transition: grow },
  };
  // Le nom suit le bord droit du logo qui grandit.
  const name: Variants = {
    closed: { x: "0rem", scale: 1, transition: grow },
    open: { x: `${LOGO_GROWTH}rem`, scale: NAME_SCALE, transition: grow },
  };
  // Ce que montre la ligne fermée sous le nom (poste, dates, fil d'un groupe) :
  // s'efface vite à l'ouverture, revient en fin de fermeture.
  const ghost: Variants = {
    closed: {
      opacity: 1,
      transition: instant
        ? INSTANT
        : { duration: 0.35, ease: EASE, delay: 0.25 },
    },
    open: { opacity: 0, transition: fadeOut },
  };
  // Le nom de l'en-tête quand il diffère de celui de la ligne (Awards).
  const swapIn: Variants = {
    closed: { opacity: 0, transition: fadeOut },
    open: { opacity: 1, transition: fadeIn },
  };
  const content: Variants = {
    closed: { transition: { staggerChildren: 0 } },
    open: {
      transition: instant
        ? { staggerChildren: 0 }
        : { staggerChildren: 0.04, delayChildren: 0.12 },
    },
  };
  const item: Variants = {
    closed: { opacity: 0, y: 8, transition: fadeOut },
    open: { opacity: 1, y: 0, transition: fadeIn },
  };
  return { card, inner, logo, name, ghost, swapIn, content, item };
}
const VARIANTS = buildVariants(false);
const VARIANTS_INSTANT = buildVariants(true);

/**
 * Une entrée de la timeline (une ligne, ou un groupe de postes dans la même
 * organisation). Au clic, une carte blanche s'ouvre par-dessus la ligne,
 * grandit un peu (cadre, logo, nom) et recouvre ce qui suit, sans rien
 * pousser : la ligne garde sa place dans le flux.
 *
 * - en-tête : logo et nom à la place de ceux de la ligne ; avec un site, logo
 *   + nom + flèche sont le lien (nouvel onglet) ;
 * - un séparateur ;
 * - chaque poste : titre, dates, description, l'un sous l'autre.
 *
 * Un bouton disclosure (`aria-expanded`, `aria-controls`) couvre la ligne ;
 * Échap ou un clic hors de la carte la referme, par la même animation. Une
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
  /** La ligne en gras de la ligne (par défaut, le nom de l'organisation). */
  primary?: string;
  /** À droite de la ligne en gras (les dates). */
  aside?: ReactNode;
  /** Sous la ligne en gras (poste, dates en mobile, postes d'un groupe). */
  summary?: ReactNode;
  /** Sous le logo (le fil d'un groupe). */
  logoAside?: ReactNode;
  /** Classes du cadre (marges ; le padding doit rester `px-4 py-4`, voir `ROW_PADDING`). */
  className?: string;
}) {
  const { section, openId, setOpenId } = useContext(SectionContext);
  const open = openId === id;
  const reduceMotion = useReducedMotion();
  const v = reduceMotion ? VARIANTS_INSTANT : VARIANTS;
  const panelId = useId();
  // La carte reste au-dessus tant qu'elle n'a pas fini de se replier, quel
  // que soit le chemin de fermeture (ligne, Échap, clic dehors, autre entrée).
  const [expanded, setExpanded] = useState(open);
  if (open && !expanded) setExpanded(true);
  const [rowHeight, setRowHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
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
      setRowHeight(rowRef.current?.offsetHeight ?? 0);
      setOpenId(id);
      posthog.capture("info_entry_expanded", { section, title: trackTitle });
    }
  }

  const rowName = primary ?? org.name;
  const swapsName = rowName !== org.name;
  const visibleRoles = roles.filter(
    (role) => role.title || role.startDate || hasDescription(role.description),
  );

  const nameText = (
    <span className="text-lg font-bold text-stone-900">{org.name}</span>
  );

  return (
    <div
      ref={rootRef}
      data-open={expanded ? "" : undefined}
      className={cn(
        "group/entry relative rounded-2xl transition-[background-color,scale] duration-300",
        "hover:bg-stone-50 data-[open]:z-30 data-[open]:bg-stone-50",
        "not-data-[open]:hover:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:scale-100",
        className,
      )}
    >
      {/* La ligne : garde sa place dans le flux, recouverte par la carte ouverte. */}
      <div ref={rowRef} className="relative">
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
        <div onClick={toggle} className="relative cursor-pointer">
          <RowLayout
            logo={<TimelineLogo name={org.name} logoUrl={org.logoUrl} />}
            logoAside={logoAside}
            name={
              <span className="text-lg font-bold text-stone-900">
                {rowName}
              </span>
            }
            aside={aside}
            summary={summary}
          />
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
            key="card"
            id={panelId}
            role="region"
            aria-label={org.name}
            variants={v.card}
            initial="closed"
            animate="open"
            exit="closed"
            onAnimationComplete={refreshScrollLimit}
            // `after:` : de la place sous la carte pour la faire défiler au-dessus
            // de l'ActionBar flottante quand elle dépasse le bas de la page.
            className="absolute rounded-2xl after:pointer-events-none after:absolute after:top-full after:left-0 after:h-36 after:w-px after:content-['']"
          >
            <motion.div
              custom={rowHeight}
              variants={v.inner}
              className="relative overflow-hidden"
            >
              {/* Ce que la ligne montrait sous le nom : s'efface au lieu de disparaître d'un coup. */}
              <motion.div
                variants={v.ghost}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0"
              >
                <RowLayout
                  logo={<span className="block h-10 w-10" />}
                  logoAside={logoAside}
                  name={
                    <span
                      className={cn(
                        "text-lg font-bold text-stone-900",
                        !swapsName && "invisible",
                      )}
                    >
                      {rowName}
                    </span>
                  }
                  aside={aside}
                  summary={summary}
                />
              </motion.div>

              {/* L'en-tête de la carte, à la place exacte de celui de la ligne ; un clic la referme. */}
              <div
                onClick={toggle}
                className="relative flex cursor-pointer items-start"
              >
                <MaybeLink org={org}>
                  <motion.span
                    variants={v.logo}
                    style={{ originX: 0, originY: 0 }}
                    className="block shrink-0"
                  >
                    <TimelineLogo name={org.name} logoUrl={org.logoUrl} />
                  </motion.span>
                  <motion.span
                    variants={v.name}
                    style={{ originX: 0, originY: 0 }}
                    className="ml-4 flex items-center gap-1"
                  >
                    {swapsName ? (
                      <motion.span variants={v.swapIn}>{nameText}</motion.span>
                    ) : (
                      nameText
                    )}
                    {org.websiteUrl && (
                      <motion.span variants={v.swapIn} className="flex">
                        <HugeiconsIcon
                          icon={ArrowUpRight01Icon}
                          size={18}
                          strokeWidth={2}
                          aria-hidden="true"
                          className="shrink-0 text-stone-400 transition-colors duration-150 group-hover/link:text-stone-800"
                        />
                      </motion.span>
                    )}
                  </motion.span>
                </MaybeLink>
              </div>

              <motion.div variants={v.content}>
                {visibleRoles.length > 0 && (
                  <>
                    <motion.div variants={v.item}>
                      <Separator className="mt-5 bg-stone-100" />
                    </motion.div>
                    <div className="flex flex-col gap-7 pt-6 pb-1">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** La mise en page de la ligne fermée (aussi rejouée dans la carte, pour le fondu). */
function RowLayout({
  logo,
  logoAside,
  name,
  aside,
  summary,
}: {
  logo: ReactNode;
  logoAside?: ReactNode;
  name: ReactNode;
  aside?: ReactNode;
  summary?: ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex shrink-0 flex-col items-center">
        {logo}
        {logoAside}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-x-4">
          <span className="min-w-0">{name}</span>
          {aside}
        </div>
        {summary}
      </div>
    </div>
  );
}

/** Avec un site, l'en-tête (logo + nom + flèche) est un seul lien (nouvel onglet). */
function MaybeLink({
  org,
  children,
}: {
  org: TimelineCardOrg;
  children: ReactNode;
}) {
  if (!org.websiteUrl)
    return <div className="flex items-start">{children}</div>;
  return (
    <a
      href={org.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.stopPropagation();
        posthog.capture("organization_website_clicked");
      }}
      className="group/link -m-1 flex items-start rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
    >
      {children}
      <span className="sr-only">(opens in a new tab)</span>
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
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        {role.title && (
          <h3 className="text-lg font-semibold text-stone-900">
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
        <div className="text-[1.0625rem] leading-relaxed text-stone-600 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-stone-800">
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
