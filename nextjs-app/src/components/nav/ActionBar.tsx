"use client";

import { useState, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MessageMultiple02Icon,
  ArrowLeft02Icon,
  CursorMagicSelection04Icon,
} from "@hugeicons/core-free-icons";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { useActionBar } from "@/contexts/ActionBarContext";
import { markWorkReturn } from "@/lib/scroll";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/work", label: "work" },
  { href: "/play", label: "play" },
  { href: "/info", label: "info" },
] as const;

const sep = (
  <span className="mx-3 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
);

const TOAST_COLORS = [
  { bg: "bg-sky-50", text: "text-sky-500" },
  { bg: "bg-violet-50", text: "text-violet-500" },
  { bg: "bg-rose-50", text: "text-rose-500" },
  { bg: "bg-amber-50", text: "text-amber-500" },
  { bg: "bg-emerald-50", text: "text-emerald-500" },
  { bg: "bg-pink-50", text: "text-pink-500" },
  { bg: "bg-indigo-50", text: "text-indigo-500" },
] as const;

type ToastState = {
  id: number;
  color: (typeof TOAST_COLORS)[number];
  rotate: number;
};

export function ActionBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, projectData } = useActionBar();

  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRotateRef = useRef<number>(2);

  const barRef = useRef<HTMLDivElement>(null);
  const widthMv = useMotionValue<number | string>("auto");
  const initialized = useRef(false);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const saved = el.style.width;
    el.style.width = "max-content";
    const natural = el.offsetWidth;
    el.style.width = saved;

    if (!initialized.current) {
      initialized.current = true;
      widthMv.set(natural);
      return;
    }

    animate(widthMv, natural, {
      type: "spring",
      stiffness: 320,
      damping: 28,
      mass: 1,
    });
  }, [mode, projectData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = () => {
    navigator.clipboard.writeText("louvel.aurelien.pro@gmail.com");
    if (timerRef.current) clearTimeout(timerRef.current);
    const rotate = lastRotateRef.current === -2 ? 2 : -2;
    lastRotateRef.current = rotate;
    const color = TOAST_COLORS[Math.floor(Math.random() * TOAST_COLORS.length)];
    setToast({ id: Date.now(), color, rotate });
    timerRef.current = setTimeout(() => setToast(null), 1100);
  };

  return (
    <div
      className="fixed bottom-12 inset-x-0 z-50 flex justify-center pointer-events-none px-6"
      style={{ viewTransitionName: "action-bar" }}
    >
      <div className="pointer-events-auto">
        <motion.div
          ref={barRef}
          style={{ width: widthMv }}
          className="relative h-16 rounded-3xl border border-border/60 bg-white shadow-md backdrop-blur-2xl"
        >
          {mode === "nav" ? (
            <div className="flex h-full items-center px-2 whitespace-nowrap">
              <Link
                href="/work"
                className="flex h-11 shrink-0 items-center pl-3"
              >
                {/* width/height explicites → la largeur est réservée AVANT le
                    chargement (aspect-ratio 640/240), donc la mesure de largeur
                    de la barre inclut le logo ; shrink-0 → jamais écrasé à 0. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="oré"
                  width={640}
                  height={240}
                  className="h-5 w-auto shrink-0"
                />
              </Link>

              {sep}

              <nav className="flex items-center" aria-label="Main">
                {NAV_LINKS.map(({ href, label }) => {
                  const isActive = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex h-11 items-center rounded-xl px-3 text-base transition-colors",
                        isActive
                          ? "bg-zinc-50 text-zinc-950 "
                          : "text-zinc-600 hover:text-zinc-950",
                      )}
                      style={
                        isActive
                          ? {
                              fontWeight: 580,
                              fontVariationSettings: "'wght' 580",
                            }
                          : undefined
                      }
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>

              <div className="hidden sm:flex items-center">
                {sep}

                <div className="relative">
                  <AnimatePresence>
                    {toast !== null && (
                      <motion.span
                        key={toast.id}
                        className={cn(
                          "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs",
                          toast.color.bg,
                          toast.color.text,
                        )}
                        initial={{ opacity: 0, y: 40, rotate: toast.rotate }}
                        animate={{ opacity: 1, y: -8, rotate: toast.rotate }}
                        exit={{
                          opacity: 0,
                          y: -20,
                          x: toast.rotate > 0 ? 10 : -10,
                          rotate: toast.rotate,
                          transition: { duration: 0.26, ease: "easeOut" },
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 460,
                          damping: 28,
                        }}
                      >
                        email copied ;)
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <motion.button
                    onClick={handleCopy}
                    className="flex h-10 items-center gap-1.5 rounded-xl bg-sky-50 px-3 text-base font-medium text-sky-500 cursor-pointer"
                    whileHover={{ scale: 0.95, rotate: -1.5 }}
                    whileTap={{ scale: 0.87, rotate: -2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <HugeiconsIcon
                      icon={MessageMultiple02Icon}
                      size={15}
                      strokeWidth={2}
                    />
                    let&apos;s chat
                  </motion.button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center px-2 whitespace-nowrap">
              <motion.button
                onClick={() => {
                  markWorkReturn();
                  router.push("/work", {
                    scroll: false,
                    transitionTypes: ["nav-back"],
                  });
                }}
                aria-label="Go back"
                className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-zinc-600 cursor-pointer"
                whileHover={{ scale: 0.93 }}
                whileTap={{ scale: 0.87 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <HugeiconsIcon
                  icon={ArrowLeft02Icon}
                  size={16}
                  strokeWidth={2}
                />
              </motion.button>

              {projectData?.title && (
                <span className="whitespace-nowrap px-3 text-base font-medium text-zinc-950">
                  {projectData.title}
                </span>
              )}

              {projectData?.redirectUrl && (
                <>
                  {sep}
                  <motion.a
                    href={projectData.redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-sky-50 px-3 text-base font-medium text-sky-500"
                    whileHover={{ scale: 0.95, rotate: -1.5 }}
                    whileTap={{ scale: 0.87, rotate: -2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <HugeiconsIcon
                      icon={CursorMagicSelection04Icon}
                      size={15}
                      strokeWidth={2}
                    />
                    visit
                  </motion.a>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
