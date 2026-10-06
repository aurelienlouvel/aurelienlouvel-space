"use client";

import { useEffect, useState } from "react";
import { daGradientAt, daHash } from "@/lib/da";

/** Durée de l'envol final avant de démonter le loader (ms). */
const OUT_DURATION_MS = 900;
const PIXEL_COUNT = 36;
const BAR_CELLS = 14;

/** Côté d'un pixel et pas de la grille qui les aligne (rem). */
const SQUARE = 0.75;
const PITCH = 1.75;
/** Étendue de la grille autour du centre, en cases : les pixels s'y répartissent en cloche. */
const GRID_COLS = 24;
const GRID_ROWS = 16;

type Phase = "loading" | "out" | "gone";

type Pixel = {
  /** Coin haut gauche, en rem depuis le centre de l'écran. */
  x: number;
  y: number;
  color: string;
  alpha: number;
  threshold: number;
  twinkle: number;
  delay: number;
  ox: string;
  oy: string;
};

const BAR_COLORS = Array.from({ length: BAR_CELLS }, (_, i) => daGradientAt(i / (BAR_CELLS - 1)));

// Nuage clairsemé de carrés identiques, calés sur une grille, plus dense vers le centre.
// La barre de progression occupe le milieu : ses cases sont exclues, et une case de la
// grille ne porte jamais deux pixels.
const PIXELS: Pixel[] = (() => {
  const bell = (a: number, b: number, c: number) => (a + b + c) / 3 - 0.5;
  const taken = new Set<string>();
  const pixels: Pixel[] = [];
  for (let i = 0; pixels.length < PIXEL_COUNT && i < PIXEL_COUNT * 12; i++) {
    const cx = Math.round(bell(daHash(i * 1.3), daHash(i * 2.9), daHash(i * 4.1)) * 2 * GRID_COLS);
    const cy = Math.round(bell(daHash(i * 5.7), daHash(i * 6.1), daHash(i * 7.3)) * 2 * GRID_ROWS);
    if (Math.abs(cx) <= 4 && Math.abs(cy) <= 1) continue;
    const key = `${cx},${cy}`;
    if (taken.has(key)) continue;
    taken.add(key);
    pixels.push({
      x: Math.round((cx * PITCH - SQUARE / 2) * 1000) / 1000,
      y: Math.round((cy * PITCH - SQUARE / 2) * 1000) / 1000,
      // Voisins, ils se suivent dans le spectre : le dégradé se lit en diagonale.
      color: daGradientAt(0.5 + (cx / GRID_COLS + cy / GRID_ROWS) * 0.75),
      alpha: 0.75 + daHash(i * 13.7) * 0.25,
      // Ordre d'apparition mélangé : les pixels surgissent partout, pas en balayage.
      threshold: (pixels.length + daHash(i * 17.1) * 0.9) / PIXEL_COUNT,
      twinkle: 2.8 + daHash(i * 19.3) * 3,
      delay: daHash(i * 23.9) * 0.3,
      ox: `${(cx * PITCH * 1.5).toFixed(1)}rem`,
      oy: `${(cy * PITCH * 1.5).toFixed(1)}rem`,
    });
  }
  return pixels;
})();

/**
 * Chargement de /play : fond blanc, un nuage de petits carrés unis (la DA « Pixels »)
 * qui surgissent au fil du chargement réel (`loaded` / `total`) et scintillent entre
 * leur couleur et le blanc, et une barre de cellules carrées au centre, dont les
 * couleurs forment un dégradé. Quand tout est prêt, les carrés s'envolent vers
 * l'extérieur par paliers, puis le loader se démonte. HTML + CSS : transform/opacity
 * seulement, donc fluide même quand le thread principal décode les textures.
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

  // Tout est prêt : les carrés s'envolent, puis le loader se démonte.
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

      {PIXELS.map((p, i) => {
        const on = progress >= p.threshold;
        return (
          <span
            key={i}
            className="ld-pixel absolute"
            data-on={on && !out ? "" : undefined}
            data-out={out && on ? "" : undefined}
            style={{
              left: `calc(50% + ${p.x}rem)`,
              top: `calc(50% + ${p.y}rem)`,
              width: `${SQUARE}rem`,
              height: `${SQUARE}rem`,
              backgroundColor: p.color,
              ["--da-a" as string]: p.alpha.toFixed(2),
              ["--da-delay" as string]: `${p.delay.toFixed(2)}s`,
              ["--da-tw" as string]: `${p.twinkle.toFixed(2)}s`,
              ["--ox" as string]: p.ox,
              ["--oy" as string]: p.oy,
            }}
          />
        );
      })}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-300"
        style={{ opacity: out ? 0 : 1 }}
      >
        <div className="flex gap-1">
          {BAR_COLORS.map((color, i) => (
            <span
              key={i}
              className="ld-cell block size-2"
              data-on={i < lit ? "" : undefined}
              style={{ backgroundColor: i < lit ? color : "#eef1f8" }}
            />
          ))}
        </div>
        <span className="text-xs tabular-nums text-zinc-400">{percent}%</span>
      </div>
    </div>
  );
}
