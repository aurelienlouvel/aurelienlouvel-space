"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { PlayRuntimeRef } from "./PlayCanvas";
import { snapshotFrame } from "./theatre-timeline";

/**
 * Barre minimale du mode `#keyframes`, à la place du panneau de debug.
 *
 * Poser des keyframes, régler les easings et lire/scruber se fait depuis le
 * transport natif de Theatre — il ne reste que deux actions côté appli :
 * rejouer la transition depuis le début, et graver l'état courant sur les
 * pistes déjà séquencées (cf. `snapshotFrame`).
 */
export function KeyframeEditorHud({
  runtime,
  onRestart,
}: {
  runtime: PlayRuntimeRef;
  onRestart: () => void;
}) {
  const [justSaved, setJustSaved] = useState(false);

  function handleSnapshot() {
    if (!snapshotFrame(runtime.current.transition.frame)) return;
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1200);
  }

  return (
    <div className="fixed top-4 left-4 z-[9999] flex w-72 flex-col gap-2 rounded-2xl border border-border bg-white/95 p-3 text-zinc-950 shadow-lg backdrop-blur">
      <p className="text-xs font-medium text-zinc-500">Éditeur de keyframes</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
        >
          Restart
        </button>
        <button
          type="button"
          onClick={handleSnapshot}
          className={cn(
            "flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            justSaved
              ? "bg-emerald-500 text-white"
              : "bg-zinc-950 text-white hover:bg-zinc-800",
          )}
        >
          {justSaved ? "Saved" : "Snapshot"}
        </button>
      </div>
      <p className="text-xs leading-snug text-zinc-500">
        Clic droit sur une piste dans Theatre → <strong>Sequence</strong>, pose
        des keyframes, lis depuis son transport. Snapshot grave l&apos;état
        courant sur les pistes déjà séquencées, à la position de lecture.
      </p>
    </div>
  );
}
