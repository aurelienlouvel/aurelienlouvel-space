"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { timeAgo } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

/**
 * Enveloppe une date affichée : au survol (ou au focus), une petite ligne
 * « it was 3 years ago » se déplie dessous.
 *
 * `date` est la date de référence du calcul — la fin du projet si elle existe,
 * sinon le début (alors « started … »). `floating` détache la ligne du flux
 * (position absolue sous la date) pour les emplacements où elle ferait
 * sauter la mise en page.
 */
export function DateAgo({
  children,
  date,
  ongoing = false,
  floating = false,
  align = "left",
  className,
}: {
  children: ReactNode;
  date: string;
  ongoing?: boolean;
  floating?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ago = timeAgo(date);
  const label = ongoing ? `started ${ago}` : `it was ${ago}`;

  return (
    <span
      className={cn("relative inline-flex flex-col", className)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence initial={false}>
        {open && (
          <motion.span
            initial={{ opacity: 0, height: floating ? "auto" : 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: floating ? "auto" : 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "overflow-hidden whitespace-nowrap text-xs font-medium text-stone-400",
              floating &&
                cn(
                  "pointer-events-none absolute top-full z-20 pt-0.5",
                  align === "right" ? "right-0" : "left-0",
                ),
            )}
          >
            ({label})
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
