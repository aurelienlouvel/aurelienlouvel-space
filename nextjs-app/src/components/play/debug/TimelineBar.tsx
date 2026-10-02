"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayDebugRef, PlayRuntimeState } from "../PlayCanvas";
import { currentStage, stageBounds, STAGE_LABELS, type StageId } from "../transition-timeline";

// ── Barre de timeline ───────────────────────────────────────────

const SEGMENT_COLORS: Record<string, string> = {
  approach: "bg-sky-500/70",
  burst: "bg-orange-500/70",
  wave: "bg-violet-500/70",
  cascade: "bg-teal-500/70",
  panel: "bg-emerald-500/70",
};

type TimelineSnapshot = {
  stage: StageId;
  t: number;
  holding: boolean;
  rewinding: boolean;
  scrubbing: boolean;
  burstStart: number;
  hold: number;
  passEnd: number;
  panelStart: number;
  end: number;
};

const EMPTY_SNAPSHOT: TimelineSnapshot = {
  stage: "idle",
  t: 0,
  holding: false,
  rewinding: false,
  scrubbing: false,
  burstStart: 0,
  hold: 0,
  passEnd: 0,
  panelStart: 0,
  end: 1,
};

/** Le debug écrit dans le ref partagé que lisent les `useFrame` : mutation voulue. */
function setScrub(state: PlayDebugRef, progress: number) {
  state.current.studio.scrubMode = true;
  state.current.studio.scrubProgress = Math.min(1, Math.max(0, progress));
}

function releaseScrub(state: PlayDebugRef) {
  state.current.studio.scrubMode = false;
}

/**
 * Étape courante et tête de lecture de la timeline d'entrée. Un clic ou un
 * glissé sur la barre fige la timeline à cet instant (scrub) ; « Release »
 * rend la main à l'horloge.
 */
export function TimelineBar({
  state,
  runtime,
}: {
  state: PlayDebugRef;
  runtime?: RefObject<PlayRuntimeState>;
}) {
  const [snap, setSnap] = useState<TimelineSnapshot>(EMPTY_SNAPSHOT);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let handle = 0;
    let last = 0;
    function tick(now: number) {
      if (now - last > 50) {
        last = now;
        const rc = runtime?.current;
        if (rc) {
          const cfg = state.current.transition;
          const tr = rc.transition;
          const bounds = stageBounds(cfg);
          const next: TimelineSnapshot = {
            stage: currentStage(cfg, tr),
            t: Math.round(tr.t * 50) / 50,
            holding: tr.holding,
            rewinding: tr.rewinding,
            scrubbing: state.current.studio.scrubMode,
            ...bounds,
          };
          setSnap((prev) =>
            (Object.keys(next) as (keyof TimelineSnapshot)[]).every((k) => prev[k] === next[k])
              ? prev
              : next,
          );
        }
      }
      handle = requestAnimationFrame(tick);
    }
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [state, runtime]);

  const end = Math.max(0.05, snap.end);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / end) * 100))}%`;
  const segments: { id: string; from: number; to: number }[] = [
    { id: "approach", from: 0, to: snap.burstStart },
    { id: "burst", from: snap.burstStart, to: snap.hold },
    { id: "wave", from: snap.hold, to: snap.passEnd },
    { id: "cascade", from: snap.passEnd, to: snap.panelStart },
    { id: "panel", from: snap.panelStart, to: snap.end },
  ];
  const active = snap.stage !== "idle" && snap.stage !== "returning" && snap.stage !== "detail";

  function scrubTo(clientX: number) {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setScrub(state, (clientX - rect.left) / Math.max(1, rect.width));
  }

  return (
    <div className="px-2 py-2 border-b border-white/10 bg-[#161616] font-mono text-[11px] text-white/80">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold text-white">
          {snap.rewinding ? "◀ Rewind · " : ""}
          {STAGE_LABELS[snap.stage]}
        </span>
        <span className="text-white/40">
          {active ? `t=${snap.t.toFixed(2)}s / ${snap.end.toFixed(2)}s` : "—"}
        </span>
      </div>
      <div
        ref={barRef}
        className="relative h-5 rounded bg-white/5 overflow-hidden cursor-ew-resize touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons) scrubTo(e.clientX);
        }}
      >
        {segments.map((s) => (
          <div
            key={s.id}
            className={`absolute inset-y-0 border-r border-black/40 ${SEGMENT_COLORS[s.id]}`}
            style={{ left: pct(s.from), width: `calc(${pct(s.to)} - ${pct(s.from)})` }}
            title={s.id}
          />
        ))}
        {/* Point d'attente : la timeline s'y fige tant que le pack n'est pas prêt. */}
        <div
          className={`absolute inset-y-0 w-0.5 bg-amber-300 ${snap.holding ? "animate-pulse" : "opacity-60"}`}
          style={{ left: pct(snap.hold) }}
          title="Point d'attente (chargement)"
        />
        {active && (
          <div
            className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_white]"
            style={{ left: pct(snap.t) }}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5 text-white/40">
        <span>
          <span className="text-amber-300">▎</span> attente chargement
        </span>
        {snap.scrubbing ? (
          <button
            className="px-2 py-0.5 rounded border border-white/20 text-white/80 hover:bg-white/10"
            onClick={() => releaseScrub(state)}
          >
            Release scrub
          </button>
        ) : (
          <span>cliquer la barre = scrub</span>
        )}
      </div>
    </div>
  );
}

