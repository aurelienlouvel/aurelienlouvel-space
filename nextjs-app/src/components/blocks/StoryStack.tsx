"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_IN, EASE_OUT } from "@/lib/easings";
import { PlaceholderSlide, SlideContent, type StorySlide } from "./StoryCard";

export type { StorySlide };

const STORY_DURATION = 12; // seconds
const TICK_MS = 100;

// Remembers which card was showing, so navigating away (e.g. to /work) and
// back lands on the same one instead of restarting at the first card. A
// plain module variable, not sessionStorage — same trick as scroll.ts's
// `workReturn`: it only has to survive a client-side route change within
// this page load, and is always 0 on a fresh/hard-reloaded page, same as
// the server's own render, so there's zero risk of it ever disagreeing with
// the server-rendered first paint.
let savedStep = 0;

// Remembers each story's last-resolved slide content, keyed by its index in
// the stories array. InfoPage hands StoryStack a brand new promise per story
// on every visit — including a client-side nav back from e.g. /work — so
// without this, landing back on a slide whose story does real work (BGG,
// Strava, GitHub, a Maps lookup...) means re-suspending on that fetch and
// staring at PlaceholderSlide's gray box again, sometimes for several
// seconds. Slide 0 never showed this (a photo slide resolves with nothing to
// await), which is why it only became visible once savedStep above started
// landing on other slide types. A cached entry paints immediately instead —
// see ResolvedSlide below — and gets refreshed in the background once the
// fresh promise actually settles, so content still catches up to real
// changes by the next time this story comes around, just never blocks this
// paint on it.
const slideCache = new Map<number, StorySlide>();

const POS_BACK = { x: 30, y: -12, scale: 0.92, rotate: 3, opacity: 1 };

// Starting point for the very first "back" card only: same spot/size/rotation
// as the front card, just already behind it in z-order — so it's fully
// hidden until it springs out to POS_BACK, reading as "slides out from
// behind card 1" on first paint. Never reused afterwards (later back cards
// mount already in place via `initial={false}`, see the map below).
const REVEAL_FROM_BEHIND = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, zIndex: 10 };

// Per-variant transitions: spring enter (bouncy), fast ease exit
const FRONT_VARIANTS = {
  back: {
    ...POS_BACK,
    zIndex: 10,
    // Only ever actually plays for the initial reveal above — every other
    // time a card animates to "back" it's already sitting at these values
    // (initial === animate), so there's nothing to interpolate and this is
    // a no-op.
    transition: {
      type: "spring" as const,
      stiffness: 280,
      damping: 20,
    },
  },
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

// Unwraps one slide's own data promise via `use()`, inside its own Suspense
// boundary (see the two call sites below) — so a slow story (e.g. a Music
// card scraping a long playlist) only ever blocks *its own* slot's content.
// The card itself (the motion.div wrapper) mounts and animates immediately
// regardless; only what's inside it swaps from the placeholder once this
// resolves.
function ResolvedSlide({
  promise,
  storyIndex,
  round,
  onMusicPlaying,
  isFront = true,
}: {
  promise: Promise<StorySlide>;
  storyIndex: number;
  round?: number;
  onMusicPlaying?: (playing: boolean) => void;
  isFront?: boolean;
}) {
  // A cached slide from earlier this session paints immediately, skipping
  // Suspense entirely — `use()` supports being called conditionally like
  // this (unlike other Hooks), precisely for cases like this one. Only
  // actually suspend on the fresh promise when there's nothing cached yet.
  const cached = slideCache.get(storyIndex);
  const slide = cached ?? use(promise);

  // Keep the cache fresh once the real promise settles, so a stale cached
  // slide never lingers past the story's next real update — just never
  // blocks *this* paint on it.
  useEffect(() => {
    let cancelled = false;
    promise.then((resolved) => {
      if (!cancelled) slideCache.set(storyIndex, resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [promise, storyIndex]);

  return (
    <SlideContent
      slide={slide}
      round={round}
      onMusicPlaying={onMusicPlaying}
      isFront={isFront}
    />
  );
}

export function StoryStack({
  slidePromises,
}: {
  slidePromises: Promise<StorySlide>[];
}) {
  const [step, setStep] = useState(savedStep);
  const [musicPaused, setMusicPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0); // ms
  const [tabHidden, setTabHidden] = useState(false);
  // Slide count is known synchronously (it's just the promise array's
  // length) — unlike each slide's actual content, nothing here waits on any
  // story's data to resolve, which is what lets the two-card stack (and the
  // back-card reveal animation below) start immediately on page load.
  const total = slidePromises.length;
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

  // Keep the module-level savedStep mirror in sync, so it's there to read
  // (via useState's initializer above) if this component unmounts — leaving
  // the page — and remounts later.
  useEffect(() => {
    savedStep = step;
  }, [step]);

  // Freeze the countdown while the tab/window is hidden — switching browser
  // tabs, minimizing, switching to another app — the same way it already
  // freezes for musicPaused below, so a story never silently advances (or
  // several stories deep) while nobody's actually watching it, and coming
  // back lands on the same card it left on.
  useEffect(() => {
    const onVisibilityChange = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Tick every 100ms when running
  useEffect(() => {
    if (!hasMultiple || musicPaused || tabHidden) return;
    const id = setInterval(() => {
      setElapsed((e) => e + TICK_MS);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [step, hasMultiple, musicPaused, tabHidden]);

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
          <Suspense fallback={<PlaceholderSlide />}>
            <ResolvedSlide promise={slidePromises[0]} storyIndex={0} isFront />
          </Suspense>
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
      <AnimatePresence>
        {[step, step + 1].map((slotStep) => {
          const isFront = slotStep === step;
          // True only for the very first back card (step is still 0, i.e.
          // before any advance() has run) — every later fresh back mount
          // keeps the instant pop-in below.
          const isInitialReveal = !isFront && step === 0;
          return (
            <motion.div
              key={slotStep}
              initial={isInitialReveal ? REVEAL_FROM_BEHIND : false}
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
              <Suspense fallback={<PlaceholderSlide />}>
                <ResolvedSlide
                  promise={slidePromises[slotStep % total]}
                  storyIndex={slotStep % total}
                  round={Math.floor(slotStep / total)}
                  onMusicPlaying={isFront ? setMusicPaused : undefined}
                  isFront={isFront}
                />
              </Suspense>
              {isFront && <CountdownRing progress={progress} />}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
