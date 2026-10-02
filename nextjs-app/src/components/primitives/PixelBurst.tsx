"use client";

import { useState } from "react";

// Palette pop : pastels saturés, lisibles sur le fond clair de la barre.
const PIXEL_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#fb7185",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#818cf8",
] as const;

// Tailles volontairement inégales (rem) : un vrai nuage de pixels, pas une grille.
const PIXEL_SIZES = [0.1875, 0.25, 0.3125, 0.4375, 0.5625] as const;
const PIXEL_COUNT = 11;

type Pixel = {
  id: number;
  left: number;
  top: number;
  size: number;
  color: string;
  delay: number;
  drift: number;
};

function pick<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function makePixels(): Pixel[] {
  return Array.from({ length: PIXEL_COUNT }, (_, id) => ({
    id,
    // Déborde un peu du lien (-12 % … 112 %) pour que ça pétille autour du texte.
    left: -12 + Math.random() * 124,
    top: -30 + Math.random() * 160,
    size: pick(PIXEL_SIZES),
    color: pick(PIXEL_COLORS),
    delay: Math.random() * 0.22,
    drift: (Math.random() - 0.5) * 0.9,
  }));
}

/**
 * Nuage de pixels multicolores qui apparaît au survol de son parent
 * (`relative`). Chaque survol retire de nouveaux pixels : position, taille,
 * couleur et délai sont aléatoires, tirés dans le handler d'événement (jamais
 * au rendu) pour rester identique entre serveur et client.
 */
export function PixelBurst({ active }: { active: boolean }) {
  const [state, setState] = useState<{ wasActive: boolean; pixels: Pixel[] }>({
    wasActive: false,
    pixels: [],
  });

  // Nouveau survol → nouveau tirage (ajustement d'état pendant le rendu, motif
  // React recommandé pour dériver un état d'une prop).
  if (active !== state.wasActive) {
    setState({ wasActive: active, pixels: active ? makePixels() : state.pixels });
  }

  if (!active) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      {state.pixels.map((p) => (
        <span
          key={p.id}
          className="px-burst absolute"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}rem`,
            height: `${p.size}rem`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            ["--px-drift" as string]: `${p.drift}rem`,
          }}
        />
      ))}
    </span>
  );
}
