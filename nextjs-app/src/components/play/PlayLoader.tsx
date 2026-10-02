"use client";

import { useEffect, useState } from "react";

/** Durée de l'envol final avant de démonter le loader (ms). */
const OUT_DURATION_MS = 900;
const DOT_COUNT = 34;
const BAR_CELLS = 14;

// Bleus du verre dépoli (encre → cobalt → azur → ciel → glace) + un rare accent violet.
const DOT_COLORS = [
  "#0a0f2c",
  "#0b1a5e",
  "#1d3fd0",
  "#1d3fd0",
  "#4a8cff",
  "#4a8cff",
  "#7fb4ff",
  "#b8d6ff",
  "#7c6cff",
] as const;

/** Dégradé de la barre, de l'encre à l'azur. */
const BAR_COLORS = [
  "#0a0f2c",
  "#0b1a5e",
  "#12299a",
  "#1d3fd0",
  "#2f5fe8",
  "#4a8cff",
  "#7fb4ff",
] as const;

type Phase = "loading" | "out" | "gone";

/** Bruit déterministe 0..1 : mêmes pixels à chaque rendu, sans Math.random. */
function hash01(n: number): number {
  // Hash entier (pas de Math.sin) : identique à l'octet près sur le serveur et dans le navigateur.
  let h = Math.imul(Math.floor(n * 1000) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Dot = {
  left: number;
  top: number;
  size: number;
  color: string;
  alpha: number;
  threshold: number;
  twinkle: number;
  delay: number;
  ox: string;
  oy: string;
};

// Nuage clairsemé, plus dense vers le centre (somme de trois tirages ≈ cloche).
const DOTS: Dot[] = Array.from({ length: DOT_COUNT }, (_, i) => {
  const bell = (a: number, b: number, c: number) => (a + b + c) / 3;
  const left = Math.round((50 + (bell(hash01(i * 1.3), hash01(i * 2.9), hash01(i * 4.1)) - 0.5) * 120) * 10) / 10;
  const top = Math.round((50 + (bell(hash01(i * 5.7), hash01(i * 6.1), hash01(i * 7.3)) - 0.5) * 110) * 10) / 10;
  const sizes = [0.25, 0.375, 0.5, 0.5, 0.75, 1] as const;
  return {
    left,
    top,
    size: sizes[Math.floor(hash01(i * 8.9) * sizes.length)],
    color: DOT_COLORS[Math.floor(hash01(i * 11.3) * DOT_COLORS.length)],
    alpha: 0.35 + hash01(i * 13.7) * 0.5,
    // Ordre d'apparition mélangé : les pixels surgissent partout, pas en balayage.
    threshold: (i + hash01(i * 17.1) * 0.9) / DOT_COUNT,
    twinkle: 2.4 + hash01(i * 19.3) * 3,
    delay: hash01(i * 23.9) * 0.3,
    ox: `${((left - 50) * 0.8).toFixed(1)}vw`,
    oy: `${((top - 50) * 0.8).toFixed(1)}vh`,
  };
});

/**
 * Chargement de /play : fond blanc, quelques pixels translucides en nuances de
 * bleu qui surgissent au fil du chargement réel (`loaded` / `total`), et une
 * petite barre de pixels au centre. Quand tout est prêt, les pixels s'envolent
 * vers l'extérieur, puis le loader se démonte.
 *
 * HTML + CSS, pas de WebGL : les animations ne touchent que transform/opacity
 * (cf. `.ld-dot` dans `globals.css`), donc elles restent fluides pendant que le
 * thread principal décode les textures.
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
  const [phase, setPhase] = useState<Phase>("loading");

  // Tout est prêt : les pixels s'envolent, puis le loader se démonte.
  if (isReady && phase === "loading") setPhase("out");

  useEffect(() => {
    if (phase !== "out") return;
    const id = setTimeout(() => setPhase("gone"), OUT_DURATION_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;

  const out = phase === "out";
  const progress = out ? 1 : percent / 100;
  const lit = Math.round(progress * BAR_CELLS);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-white transition-opacity duration-500 ease-out"
        style={{ opacity: out ? 0 : 1, transitionDelay: out ? "0.35s" : "0s" }}
      />

      {DOTS.map((d, i) => {
        const on = progress >= d.threshold;
        return (
          <span
            key={i}
            className="ld-dot absolute"
            data-on={on && !out ? "" : undefined}
            data-out={out && on ? "" : undefined}
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: `${d.size}rem`,
              height: `${d.size}rem`,
              backgroundColor: d.color,
              ["--px-a" as string]: d.alpha.toFixed(2),
              ["--px-delay" as string]: `${d.delay.toFixed(2)}s`,
              ["--px-tw" as string]: `${d.twinkle.toFixed(2)}s`,
              ["--ox" as string]: d.ox,
              ["--oy" as string]: d.oy,
            }}
          />
        );
      })}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-300"
        style={{ opacity: out ? 0 : 1 }}
      >
        <div className="flex gap-1">
          {Array.from({ length: BAR_CELLS }, (_, i) => (
            <span
              key={i}
              className="ld-cell block size-2"
              data-on={i < lit ? "" : undefined}
              style={{
                backgroundColor:
                  i < lit
                    ? BAR_COLORS[Math.min(BAR_COLORS.length - 1, Math.floor((i / BAR_CELLS) * BAR_COLORS.length))]
                    : "#e6edf9",
              }}
            />
          ))}
        </div>
        <span className="px-glitch-text text-xs tabular-nums text-zinc-400">{percent}%</span>
      </div>
    </div>
  );
}
