"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  scrambleFontsForLength,
  scrambleRotationsForLength,
} from "@/lib/scramble-fonts";
import { cn } from "@/lib/utils";

// Delay step between each letter's swap, so the word ripples letter-by-letter
// instead of flipping all at once.
const STAGGER = 0.028;
const ENTER_TRANSITION = { duration: 0.3, ease: "backOut" } as const;
const EXIT_TRANSITION = { duration: 0.14, ease: "easeIn" } as const;

interface ScrambleTextProps {
  text: string;
  /** When true, letters render in their scrambled fonts instead of the site font. */
  active: boolean;
  className?: string;
}

/**
 * Renders `text` letter-by-letter. Each letter is assigned a font (and a
 * small tilt) from the scramble pool once (stable for the component's
 * lifetime, in the pool's fixed order), then shown whenever `active`.
 *
 * The visible letters are an absolutely-positioned overlay on top of an
 * invisible reference copy (same text, site font, site size) that sits in
 * normal flow. Layout size is driven only by that reference, so swapping
 * fonts — whose glyphs are wider/narrower/taller than the site font, and
 * rendered bigger — can never resize the surrounding nav pill.
 *
 * Toggling `active` swaps each letter for a differently-fonted twin rather
 * than restyling it in place: keying each letter on its font state and
 * letting AnimatePresence handle the swap gives every letter its own
 * scale-and-rotate-out/in, staggered by index for a ripple effect, with a
 * "backOut" overshoot on the way in.
 */
export function ScrambleText({ text, active, className }: ScrambleTextProps) {
  const letters = text.split("");
  const fonts = useMemo(() => scrambleFontsForLength(text.length), [text]);
  const rotations = useMemo(
    () => scrambleRotationsForLength(text.length),
    [text],
  );

  return (
    <span className={cn("relative inline-block", className)}>
      <span className="invisible" aria-hidden="true">
        {text}
      </span>
      <span className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {letters.map((char, i) => (
            <motion.span
              key={`${i}-${active ? "scr" : "plain"}`}
              className={cn(
                "inline-block",
                active ? [fonts[i], "text-xl"] : undefined,
              )}
              initial={{ scale: 0, rotate: 0 }}
              animate={{
                scale: 1,
                rotate: active ? rotations[i] : 0,
                transition: { ...ENTER_TRANSITION, delay: i * STAGGER },
              }}
              exit={{
                scale: 0,
                rotate: 0,
                transition: { ...EXIT_TRANSITION, delay: i * STAGGER },
              }}
            >
              {char}
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
    </span>
  );
}
