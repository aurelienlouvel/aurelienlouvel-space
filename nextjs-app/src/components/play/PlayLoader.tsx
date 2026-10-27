"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { daHash, daIrid } from "@/lib/da";

/** Durée du fondu final avant de démonter le loader (ms), un peu plus que sa transition. */
const OUT_DURATION_MS = 800;

/** Pas de la grille (px) ; le côté d'un pixel (2rem, `.ld-cell`) en occupe 80 %. */
const PITCH = 40;
/** Part des cases qui portent un pixel ; les autres restent blanches. */
const SHARE = 0.5;
/**
 * Bornes de la force propre d'un pixel (son opacité à son maximum, avant le gain des reflets) :
 * à peine plus que le champ de la pastille « play », dont les pixels sont quatre fois plus petits.
 */
const MIN_ALPHA = 0.05;
const MAX_ALPHA = 0.11;
/** Part de la largeur de la vague qui vient de la rangée : un front à peine penché. */
const SLANT = 0.12;
/** Les tours de palette (reflets de la vague de survol des cartes) de la gauche à la droite, puis du haut au bas. */
const HUE_ACROSS = 0.8;
const HUE_DOWN = 0.3;
/** Écart de teinte (en tours) d'un pixel à l'autre : la grille ne dessine pas un dégradé trop lisse. */
const HUE_JITTER = 0.08;

/** `hue` : le reflet irisé du pixel, que `--ld-irid` mêle ou non au gris. */
type Cell = { key: number; col: number; row: number; x: number; a: number; hue: string };

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

/** Colonnes et rangées qui recouvrent la fenêtre (0 côté serveur : rien n'y est rendu). */
function useViewportGrid() {
  const cols = useSyncExternalStore(
    subscribeResize,
    () => Math.ceil(window.innerWidth / PITCH),
    () => 0,
  );
  const rows = useSyncExternalStore(
    subscribeResize,
    () => Math.ceil(window.innerHeight / PITCH),
    () => 0,
  );
  return { cols, rows };
}

/**
 * Chargement de /play : fond blanc et, sur toute la page, le champ de pixels irisés de la
 * pastille « play » de la nav que balaie sa vague de survol, à l'échelle de la page. Une
 * vague va de la gauche vers la droite, puis une autre, jusqu'à ce que tout soit prêt
 * (`isReady`) : le loader s'efface alors par fondu et se démonte. Pas de barre, pas de
 * pourcentage. HTML + CSS : transform/opacity seulement (`ld-wave` dans `globals.css`),
 * donc fluide même quand le thread principal décode les textures.
 *
 * Chaque pixel est un tirage de sa case (rangée, colonne) : agrandir la fenêtre en ajoute
 * sans redistribuer les autres. Sa teinte, elle, suit sa place dans la page : la vague
 * allume un dégradé qui va du rouge au bleu, comme les reflets de la vague des cartes.
 */
export function PlayLoader({ isReady = false }: { isReady?: boolean }) {
  const { cols, rows } = useViewportGrid();
  const [phase, setPhase] = useState<"loading" | "out" | "gone">("loading");

  const cells = useMemo(() => {
    const list: Cell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (daHash(r * 131 + c * 7.3) >= SHARE) continue;
        const across = c / Math.max(1, cols - 1);
        const down = r / Math.max(1, rows - 1);
        list.push({
          key: r * 1000 + c,
          col: c + 1,
          row: r + 1,
          x: Math.round((across * (1 - SLANT) + down * SLANT) * 1000) / 1000,
          a: Math.round((MIN_ALPHA + daHash(r * 17.3 + c * 3.1 + 5) * (MAX_ALPHA - MIN_ALPHA)) * 1000) / 1000,
          hue: daIrid(across * HUE_ACROSS + down * HUE_DOWN + (daHash(r * 5.7 + c * 2.3 + 9) - 0.5) * HUE_JITTER),
        });
      }
    }
    return list;
  }, [cols, rows]);

  // Tout est prêt : le loader s'efface, puis se démonte.
  if (isReady && phase === "loading") setPhase("out");

  useEffect(() => {
    if (phase !== "out") return;
    const id = setTimeout(() => setPhase("gone"), OUT_DURATION_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 bg-white transition-opacity duration-700 ease-out"
      style={{ opacity: phase === "out" ? 0 : 1 }}
    >
      <div
        className="grid size-full place-items-center"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {cells.map((c) => (
          <span
            key={c.key}
            className="ld-cell"
            style={{
              gridColumn: c.col,
              gridRow: c.row,
              ["--x" as string]: c.x,
              ["--a" as string]: c.a,
              ["--c" as string]: c.hue,
            }}
          />
        ))}
      </div>
    </div>
  );
}
