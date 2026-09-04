"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_IN, EASE_OUT } from "@/lib/easings";
import { SlideContent, type StorySlide } from "./StoryCard";

export type { StorySlide };

const STORY_DURATION = 12; // seconds
const TICK_MS = 100;

const POS_BACK = { x: 30, y: -12, scale: 0.92, rotate: 3, opacity: 1 };

// Per-variant transitions: spring enter (bouncy), fast ease exit
const FRONT_VARIANTS = {
  back: { ...POS_BACK, zIndex: 10 },
  front: {
    x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, zIndex: 20,
    transition: {
      type: "spring" as const,
      stiffness: 280,
      damping: 20,
      opacity: { duration: 0.18, ease: EASE_OUT },
    },
  },
  gone: {
    x: -20, y: 4, scale: 0.88, rotate: 0, opacity: 0, zIndex: 5,
    transition: { duration: 0.25, ease: EASE_IN },
  },
};

function CountdownRing({ progress }: { progress: number }) {
  const r = 6;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(progress, 1));
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-30 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
      <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90">
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
        />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.12s linear" }}
        />
      </svg>
    </div>
  );
}

export function StoryStack({ slides }: { slides: StorySlide[] }) {
  const [step, setStep] = useState(0);
  const [musicPaused, setMusicPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0); // ms
  const total = slides.length;
  const hasMultiple = total > 1;

  const advance = useCallback(() => {
    setStep((s) => s + 1);
    setMusicPaused(false);
    setElapsed(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advance();
      }
    },
    [advance],
  );

  // step only ever changes via advance(), which already resets elapsed in the
  // same batch — no separate reset effect needed.

  // Tick every 100ms when running
  useEffect(() => {
    if (!hasMultiple || musicPaused) return;
    const id = setInterval(() => {
      setElapsed((e) => e + TICK_MS);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [step, hasMultiple, musicPaused]);

  // Advance when elapsed reaches duration. advance() itself calls setState,
  // but this is a genuine reaction to the ticking timer crossing a threshold —
  // not a value derivable during render.
  useEffect(() => {
    if (hasMultiple && elapsed >= STORY_DURATION * 1000) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      advance();
    }
  }, [elapsed, hasMultiple, advance]);

  if (total === 0) return null;

  const progress = elapsed / (STORY_DURATION * 1000);

  if (!hasMultiple) {
    return (
      <div className="relative aspect-[6/7] w-full">
        <div className="absolute inset-0 overflow-hidden rounded-3xl shadow-md">
          <SlideContent slide={slides[0]} />
        </div>
      </div>
    );
  }

  // Both slots are keyed by the absolute step they represent, not by role —
  // so the slide pre-rendered in back (image decoded, map/audio already
  // initialized) is the SAME element promoted to front on the next step,
  // never a fresh mount. Only its position animates; nothing has to render
  // while the spring plays, which is what removes the "renders at the same
  // time as the anim" lag. Only key `step` (exiting) and `step + 2` (new
  // back, mounted next render) ever mount/unmount — `step + 1` just changes
  // role in place.
  return (
    <div className="relative aspect-[6/7] w-full">
      <AnimatePresence initial={false}>
        {[step, step + 1].map((slotStep) => {
          const isFront = slotStep === step;
          return (
            <motion.div
              key={slotStep}
              initial={false}
              variants={FRONT_VARIANTS}
              animate={isFront ? "front" : "back"}
              exit="gone"
              role={isFront ? "button" : undefined}
              tabIndex={isFront ? 0 : undefined}
              aria-label={isFront ? "Next story" : undefined}
              onClick={isFront ? advance : undefined}
              onKeyDown={isFront ? handleKeyDown : undefined}
              className={
                isFront
                  ? "absolute inset-0 cursor-pointer overflow-hidden rounded-3xl shadow-md outline-none"
                  : "absolute inset-0 overflow-hidden rounded-3xl shadow-md"
              }
            >
              <SlideContent
                slide={slides[slotStep % total]}
                round={Math.floor(slotStep / total)}
                onMusicPlaying={isFront ? setMusicPaused : undefined}
              />
              {isFront && <CountdownRing progress={progress} />}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
