"use client";

import { motion, AnimatePresence } from "motion/react";

// ─── Loading bar ──────────────────────────────────────────────────────────────
//
//  Full-screen overlay that masks the Three.js WebGL init freeze.
//  Shows on first visit only — revisits have everything cached so no freeze.
//  Bar animates from 0 → 100 % over ~1.2 s, then the overlay fades out.
//
export function LoadingBar({ loading }: { loading: boolean }) {
  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          key="loading-bar"
          className="fixed inset-0 z-[90] bg-stone-50 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="w-16 h-[3px] rounded-full bg-stone-200 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-stone-400"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.2, ease: [0.05, 0.55, 0.85, 1.0] }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
