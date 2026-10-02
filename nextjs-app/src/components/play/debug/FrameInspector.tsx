"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayDebugRef, PlayRuntimeState } from "../PlayCanvas";

type Channel = {
  id: string;
  label: string;
  group: "Survol" | "Ouverture" | "Carte suivante";
  /** Bornes d'affichage de la jauge. */
  min: number;
  max: number;
  read: (rc: PlayRuntimeState, cfg: PlayDebugRef["current"]) => number;
};

const CHANNELS: Channel[] = [
  { id: "hov", label: "hover", group: "Survol", min: 0, max: 1, read: (rc) => rc.hoverInfo.hov },
  { id: "hovWave", label: "hover wave", group: "Survol", min: 0, max: 1, read: (rc) => rc.hoverInfo.wave },

  { id: "zoom", label: "zoom", group: "Ouverture", min: 0.5, max: 3, read: (rc) => rc.transition.frame.zoom },
  {
    id: "scatter",
    label: "burst (distance)",
    group: "Ouverture",
    min: 0,
    max: 1,
    read: (rc, cfg) => rc.transition.frame.scatter / Math.max(1, cfg.transition.scatterDistance),
  },
  { id: "mosaic", label: "mosaique (opacite)", group: "Ouverture", min: 0, max: 1, read: (rc) => rc.transition.frame.mosaicOpacity },
  { id: "fx", label: "eclats (intensite)", group: "Ouverture", min: 0, max: 2, read: (rc) => rc.transition.frame.fx },
  { id: "wave", label: "vague", group: "Ouverture", min: 0, max: 1, read: (rc) => rc.transition.frame.waveProgress },
  { id: "scale", label: "tuile (echelle)", group: "Ouverture", min: 0.9, max: 1.4, read: (rc) => rc.transition.frame.tileScale },
  { id: "roll", label: "tuile (rotation)", group: "Ouverture", min: -0.3, max: 0.3, read: (rc) => rc.transition.frame.tileRoll },
  { id: "rest", label: "rotation repos", group: "Ouverture", min: 0, max: 1, read: (rc) => rc.transition.frame.rest },
  { id: "reveal", label: "ouverture de la carte", group: "Ouverture", min: 0, max: 1, read: (rc) => rc.transition.frame.reveal },
  { id: "layers", label: "layers (opacite)", group: "Ouverture", min: 0, max: 1, read: (rc) => rc.transition.frame.columnOpacity },

  { id: "pullRaw", label: "traction (geste)", group: "Carte suivante", min: -1, max: 1, read: (rc) => rc.transition.deckPullRaw },
  { id: "pullShown", label: "traction (carte)", group: "Carte suivante", min: -1, max: 1, read: (rc) => rc.transition.deckPullShown },
  { id: "deckFx", label: "eclats (carte)", group: "Carte suivante", min: 0, max: 1, read: (rc) => rc.transition.deckFx.intensity },
  { id: "col", label: "position du deck", group: "Carte suivante", min: -3, max: 3, read: (rc) => rc.transition.columnScrollY },
];

const HISTORY = 96;

/** Tracé SVG (viewBox 100×18) de l'historique d'une grandeur. */
function sparkPath(h: number[], ch: Channel): string {
  if (h.length < 2) return "";
  const span = Math.max(1e-6, ch.max - ch.min);
  return h
    .map((v, i) => {
      const x = (i / (HISTORY - 1)) * 100;
      const y = 18 - Math.max(0, Math.min(1, (v - ch.min) / span)) * 16 - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
const GROUPS = ["Survol", "Ouverture", "Carte suivante"] as const;

/**
 * Inspecteur : les grandeurs qui pilotent l'animation, en direct. Chaque ligne
 * montre sa valeur, une jauge et son historique des ~4 dernières secondes —
 * on voit exactement ce qui se passe pendant le survol, l'ouverture d'un
 * artifact et le passage à la carte suivante (idéal avec la vitesse 0.1×).
 */
export function FrameInspector({
  state,
  runtime,
}: {
  state: PlayDebugRef;
  runtime?: RefObject<PlayRuntimeState>;
}) {
  const history = useRef<Record<string, number[]>>({});
  // Instantané affiché : valeur courante et tracé de l'historique de chaque grandeur.
  const [rows, setRows] = useState<Record<string, { v: number; path: string }>>({});
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ Survol: true, Ouverture: true, "Carte suivante": true });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let handle = 0;
    let last = 0;
    function tick(now: number) {
      if (now - last > 42 && !pausedRef.current) {
        last = now;
        const rc = runtime?.current;
        if (rc) {
          const next: Record<string, { v: number; path: string }> = {};
          for (const ch of CHANNELS) {
            const v = ch.read(rc, state.current);
            const h = (history.current[ch.id] ??= []);
            h.push(v);
            if (h.length > HISTORY) h.shift();
            next[ch.id] = { v, path: sparkPath(h, ch) };
          }
          setRows(next);
        }
      }
      handle = requestAnimationFrame(tick);
    }
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [runtime, state]);

  return (
    <div className="border-b border-white/10 bg-[#141414] px-2 py-2 font-mono text-[10px] text-white/70">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-white">Inspecteur</span>
        <span className="flex gap-1">
          <button
            className="rounded border border-white/15 px-1.5 py-0.5 hover:bg-white/10"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "Reprendre" : "Pause"}
          </button>
          <button
            className="rounded border border-white/15 px-1.5 py-0.5 hover:bg-white/10"
            onClick={() => {
              history.current = {};
              setRows({});
            }}
          >
            Effacer
          </button>
        </span>
      </div>
      {GROUPS.map((group) => (
        <div key={group} className="mb-1">
          <button
            className="flex w-full items-center gap-1 py-0.5 text-left text-white/50 hover:text-white"
            onClick={() => setOpen((o) => ({ ...o, [group]: !o[group] }))}
          >
            <span>{open[group] ? "▾" : "▸"}</span>
            <span>{group}</span>
          </button>
          {open[group] &&
            CHANNELS.filter((c) => c.group === group).map((ch) => {
              const row = rows[ch.id];
              const v = row?.v ?? 0;
              const norm = Math.max(0, Math.min(1, (v - ch.min) / Math.max(1e-6, ch.max - ch.min)));
              const active = Math.abs(v - (ch.min < 0 ? 0 : ch.min)) > 0.002;
              return (
                <div key={ch.id} className="grid grid-cols-[84px_1fr_44px] items-center gap-2 py-px">
                  <span className={active ? "text-white" : "text-white/40"}>{ch.label}</span>
                  <span className="relative block h-[18px]">
                    <span className="absolute inset-x-0 bottom-0 h-[2px] rounded bg-white/10" />
                    <span
                      className="absolute bottom-0 left-0 h-[2px] rounded bg-sky-400/80"
                      style={{ width: `${norm * 100}%` }}
                    />
                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 18" preserveAspectRatio="none">
                      <polyline
                        points={row?.path ?? ""}
                        fill="none"
                        stroke={active ? "rgb(167 139 250)" : "rgb(255 255 255 / 0.25)"}
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </span>
                  <span className="text-right tabular-nums text-white/80">{v.toFixed(3)}</span>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
