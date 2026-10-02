"use client";

import { useCallback, useEffect, useState } from "react";

/** Côté visé d'un pixel, en px : la grille s'adapte à l'écran pour rester carrée. */
const TARGET_CELL = 56;
/** Durée de l'explosion finale avant de démonter le loader (ms). */
const OUT_DURATION_MS = 1000;

type Grid = { cols: number; rows: number };
type Phase = "loading" | "out" | "gone";

/** Bruit déterministe 0..1 : mêmes pixels à chaque rendu, sans Math.random. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Chargement de /play : un champ de pixels translucides en dégradé multicolore
 * qui se remplit au rythme du chargement réel (`loaded` / `total`), du coin bas
 * gauche vers le coin haut droit, puis éclate vers le canvas quand tout est prêt.
 *
 * HTML + CSS + un peu de JS, pas de WebGL : les animations ne touchent que
 * transform/opacity (cf. `.px-cell` dans `globals.css`), donc elles restent
 * fluides pendant que le thread principal décode les textures.
 *
 * `<Canvas>` ne monte qu'une fois `isReady` vrai côté `PlayCanvas` : pas de
 * pop-in progressif des artifacts, l'un des choix actés avec l'utilisateur.
 */
export function PlayLoader({
  loaded,
  total,
  isReady = false,
}: {
  loaded: number;
  total: number;
  isReady?: boolean;
}) {
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const [grid, setGrid] = useState<Grid | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  // Mesure unique de l'écran à la création du nœud (callback ref : pas d'effet).
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setGrid((prev) =>
      prev ?? {
        cols: Math.max(4, Math.round(width / TARGET_CELL)),
        rows: Math.max(4, Math.round(height / TARGET_CELL)),
      },
    );
  }, []);

  // Tout est prêt : les pixels éclatent, puis le loader se démonte.
  if (isReady && phase === "loading") setPhase("out");

  useEffect(() => {
    if (phase !== "out") return;
    const id = setTimeout(() => setPhase("gone"), OUT_DURATION_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;

  const out = phase === "out";
  const progress = out ? 1 : percent / 100;

  return (
    <div ref={measure} className="pointer-events-none fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-white transition-opacity duration-500 ease-out"
        style={{ opacity: out ? 0 : 1, transitionDelay: out ? "0.3s" : "0s" }}
      />

      {grid && (
        <div
          className="absolute inset-0 grid gap-[0.125rem] p-[0.125rem]"
          style={{
            gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: grid.cols * grid.rows }, (_, i) => {
            const col = i % grid.cols;
            const row = Math.floor(i / grid.cols);
            const noise = hash01(i);
            // Front de remplissage : du coin bas gauche au coin haut droit, déchiré par du bruit.
            const diag =
              (col / Math.max(1, grid.cols - 1) +
                (grid.rows - 1 - row) / Math.max(1, grid.rows - 1)) /
              2;
            const threshold = Math.min(1, diag * 0.88 + noise * 0.12);
            const on = progress >= threshold;
            const hue = Math.round(
              (190 + (col / grid.cols) * 260 + (row / grid.rows) * 100) % 360,
            );
            return (
              <span
                key={i}
                className="px-cell"
                data-on={on && !out ? "" : undefined}
                data-out={out && on ? "" : undefined}
                data-twinkle={!on && noise > 0.82 ? "" : undefined}
                style={{
                  background: `linear-gradient(135deg, hsl(${hue} 95% 72% / 0.75), hsl(${(hue + 55) % 360} 95% 66% / 0.5))`,
                  ["--px-a" as string]: (0.38 + noise * 0.42).toFixed(2),
                  ["--px-delay" as string]: `${out ? (threshold * 0.45).toFixed(2) : (noise * 0.25).toFixed(2)}s`,
                }}
              />
            );
          })}
        </div>
      )}

      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
        style={{ opacity: out ? 0 : 1 }}
      >
        <span className="px-glitch-text rounded-md bg-white/70 px-3 py-1 text-sm font-medium tabular-nums text-zinc-900 backdrop-blur-[2px]">
          {percent}%
        </span>
      </div>
    </div>
  );
}
