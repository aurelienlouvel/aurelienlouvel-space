"use client";

import {
  createContext,
  useContext,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Accordion } from "@base-ui/react/accordion";
import { PortableText } from "@portabletext/react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import posthog from "posthog-js";
import { portableComponents } from "@/components/blocks/TextBlock";
import { cn } from "@/lib/utils";

/** Le nom de la section, pour l'événement PostHog `info_entry_expanded`. */
const SectionContext = createContext<string>("info");

/**
 * Une section de la timeline (Experience, Education…) : un accordéon (Base UI,
 * la primitive des composants shadcn `base-*`) où une seule ligne est ouverte
 * à la fois. Échap referme la ligne ouverte et rend le focus à son bouton,
 * même quand le focus était dans le panneau (sur le lien du site).
 */
export function TimelineAccordion({
  section,
  className,
  children,
}: {
  section: string;
  className?: string;
  children: ReactNode;
}) {
  const [value, setValue] = useState<string[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || value.length === 0) return;
    event.stopPropagation();
    event.currentTarget
      .querySelector<HTMLButtonElement>("button[data-panel-open]")
      ?.focus();
    setValue([]);
  }

  return (
    <SectionContext.Provider value={section}>
      <Accordion.Root
        value={value}
        onValueChange={(next) => setValue(next as string[])}
        onKeyDown={onKeyDown}
        className={className}
      >
        {children}
      </Accordion.Root>
    </SectionContext.Provider>
  );
}

/** Un Portable Text vide (`null`, `[]`) ne mérite pas de panneau. */
export function hasDescription(description: unknown[] | null | undefined) {
  return Array.isArray(description) && description.length > 0;
}

function websiteLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "Website";
  }
}

/**
 * Une entrée dépliable. Le bouton (`trigger`) porte `aria-expanded` et
 * `aria-controls` (posés par Base UI) ; le panneau contient la description
 * puis le lien vers le site. Sans description ni site, rien à déplier :
 * l'entrée reste une ligne statique, sans bouton.
 */
export function TimelineEntry({
  value,
  trackTitle,
  description,
  websiteUrl,
  className,
  panelClassName,
  children,
}: {
  value: string;
  trackTitle: string;
  description?: unknown[] | null;
  websiteUrl?: string | null;
  /** Classes du cadre (fond au survol, arrondi, marges). */
  className?: string;
  /** Classes du contenu du panneau (retrait pour s'aligner sur le texte). */
  panelClassName?: string;
  children: ReactNode;
}) {
  const section = useContext(SectionContext);
  const reduceMotion = useReducedMotion();
  const withDescription = hasDescription(description);

  if (!withDescription && !websiteUrl) {
    return (
      <div className={className}>
        <div className="flex gap-4">{children}</div>
      </div>
    );
  }

  return (
    <Accordion.Item
      value={value}
      onOpenChange={(open) => {
        if (open) {
          posthog.capture("info_entry_expanded", { section, title: trackTitle });
        }
      }}
      className={cn(
        "group/entry transition-all duration-300 hover:bg-stone-50 data-[open]:bg-stone-50",
        "not-data-[open]:hover:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:scale-100",
        className,
      )}
    >
      <Accordion.Header render={<div />}>
        <Accordion.Trigger className="flex w-full cursor-pointer gap-4 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-stone-300">
          {children}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={16}
            strokeWidth={2}
            aria-hidden
            className="shrink-0 self-center text-stone-400 transition-transform duration-300 group-hover/entry:text-stone-600 group-data-[open]/entry:rotate-180 motion-reduce:transition-none"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel
        className={cn(
          "h-(--accordion-panel-height) overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0",
          "motion-reduce:transition-none",
        )}
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          className={cn("flex flex-col gap-3 pt-3", panelClassName)}
        >
          {withDescription && (
            <div className="text-base leading-relaxed text-stone-600 [&_p+p]:mt-3 [&_strong]:font-semibold [&_strong]:text-stone-800">
              <PortableText
                value={
                  description as Parameters<typeof PortableText>[0]["value"]
                }
                components={portableComponents}
              />
            </div>
          )}
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => posthog.capture("organization_website_clicked")}
              className="inline-flex w-fit items-center gap-1 rounded-lg text-sm font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 transition-colors duration-150 hover:text-stone-800 hover:decoration-stone-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-300"
            >
              {websiteLabel(websiteUrl)}
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} />
            </a>
          )}
        </motion.div>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
