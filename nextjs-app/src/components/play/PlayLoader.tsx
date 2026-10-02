"use client";

import { useEffect, useState } from "react";
import { DA_SPECTRUM, daGradient, daHash } from "@/lib/da";

/** Durée de l'envol final avant de démonter le loader (ms). */
const OUT_DURATION_MS = 900;
const RECT_COUNT = 30;
const BAR_CELLS = 14;

type Phase = "loading" | "out" | "gone";

type Rect = {
  left: number;
  top: number;
  w: number;
  h: number;
  gradient: string;
  alpha: number;
  threshold: number;
  twinkle: number;
  delay: number;
  blur: number;
  ox: string;
  oy: string;
};

// Nuage clairsemé de rectangles de formats variés, plus dense vers le centre.
const RECTS: Rect[] = Array.from({ length: RECT_COUNT }, (_, i) => {
  const bell = (a: number, b: number, c: number) => (a + b + c) / 3;
  const left = Math.round((50 + (bell(daHash(i * 1.3), daHash(i * 2.9), daHash(i * 4.1)) - 0.5) * 120) * 10) / 10;
  const top = Math.round((50 + (bell(daHash(i * 5.7), daHash(i * 6.1), daHash(i * 7.3)) - 0.5) * 110) * 10) / 10;
  // Largeur log-uniforme 0.4–3.2rem, hauteur de 0.35 à 2.4× la largeur : de vrais rectangles.
  const w = 0.4 * Math.pow(8, Math.pow(daHash(i * 8.9), 1.5));
  const h = Math.max(0.3, w * (0.35 + daHash(i * 10.1) * 2.05));
  return {
    left,
    top,
    w: Math.round(w * 100) / 100,
    h: Math.round(h * 100) / 100,
    gradient: daGradient(i * 3.3),
    alpha: 0.28 + daHash(i * 13.7) * 0.34,
    // Ordre d'apparition mélangé : les rectangles surgissent partout, pas en balayage.
    threshold: (i + daHash(i * 17.1) * 0.9) / RECT_COUNT,
    twinkle: 2.8 + daHash(i * 19.3) * 3,
    delay: daHash(i * 23.9) * 0.3,
    // Les plus grands sont aussi les plus flous : une profondeur de champ.
    blur: Math.round((0.3 + (w / 3.2) * 1.6) * 10) / 10,
    ox: `${((left - 50) * 0.8).toFixed(1)}vw`,
    oy: `${((top - 50) * 0.8).toFixed(1)}vh`,
  };
});

/**
 * Chargement de /play : fond blanc, quelques rectangles de verre translucides
 * aux couleurs du spectre Prism qui surgissent au fil du chargement réel
 * (`loaded` / `total`), et une petite barre de cellules au centre. Quand tout
 * est prêt, les rectangles s'envolent vers l'extérieur, puis le loader se
 * démonte. HTML + CSS : transform/opacity seulement, donc fluide même quand le
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

  // Tout est prêt : les rectangles s'envolent, puis le loader se démonte.
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

      {RECTS.map((r, i) => {
        const on = progress >= r.threshold;
        return (
          <span
            key={i}
            className="ld-rect da-rect absolute rounded-[32%]"
            data-on={on && !out ? "" : undefined}
            data-out={out && on ? "" : undefined}
            style={{
              left: `${r.left}%`,
              top: `${r.top}%`,
              width: `${r.w}rem`,
              height: `${r.h}rem`,
              backgroundImage: r.gradient,
              ["--da-a" as string]: r.alpha.toFixed(2),
              ["--da-delay" as string]: `${r.delay.toFixed(2)}s`,
              ["--da-tw" as string]: `${r.twinkle.toFixed(2)}s`,
              ["--da-blur" as string]: `${r.blur}px`,
              ["--ox" as string]: r.ox,
              ["--oy" as string]: r.oy,
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
              className="ld-cell block h-3 w-1.5 rounded-[32%]"
              data-on={i < lit ? "" : undefined}
              style={{
                backgroundImage:
                  i < lit
                    ? `linear-gradient(180deg, ${DA_SPECTRUM[Math.floor((i / BAR_CELLS) * DA_SPECTRUM.length)]}, ${DA_SPECTRUM[Math.min(DA_SPECTRUM.length - 1, Math.floor((i / BAR_CELLS) * DA_SPECTRUM.length) + 1)]})`
                    : undefined,
                backgroundColor: i < lit ? undefined : "#eef1f8",
              }}
            />
          ))}
        </div>
        <span className="text-xs tabular-nums text-zinc-400">{percent}%</span>
      </div>
    </div>
  );
}
