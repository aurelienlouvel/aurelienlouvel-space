"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import type { ArtifactCanvasItem } from "@/sanity/queries";
import { InfiniteCanvas } from "@/components/layout/InfiniteCanvas";
import { triggerOutro, OUTRO_DURATION, OUTRO_STAGGER_MAX } from "@/lib/artifact-utils";
import { EASE_IN_OUT_CSS } from "@/lib/easings";

// Crossfade de sortie — voile blanc + cards fondent ensemble, révélant la page.
const FADE_OUT_MS = 470;
// Fade-in d'entrée — masque la frame résiduelle de la visite précédente
// (cards à zoom 1) le temps que l'intro three (reset opacity 0 + dezoom) prenne.
const FADE_IN_MS  = 280;
// Le canvas reste monté le temps de l'outro three + du crossfade de sortie.
const EXIT_TOTAL  = Math.max(OUTRO_DURATION + OUTRO_STAGGER_MAX, FADE_OUT_MS) + 60;
// Délai d'entrée : court, pour réduire l'écran vide entre la page sortante et
// le canvas. Le fade-in (expo.inOut, lent au départ) reste transparent au début
// → la vague d'outro de la page reste visible dessous, puis le canvas prend le relais.
const ENTER_DELAY = 260;

// Module-level — survives navigations, flips to true on first /play visit
let _everMounted = false;

/**
 * Monté dans le root layout — persistant, jamais démonté.
 *
 * - Premier passage sur /play : monte le canvas après 360 ms (fin de la
 *   transition de route sortante) puis fade-in (FADE_IN_MS).
 * - Entrée /play (revisites) : fade-in après ENTER_DELAY.
 * - Sortie /play : outro des cards + crossfade opacity → 0, puis masqué.
 */
export function PlayCanvas({ artifacts }: { artifacts: ArtifactCanvasItem[] }) {
  const pathname = usePathname();
  const isPlay   = pathname === "/play";

  const [mounted, setMounted] = useState(_everMounted);
  const [active,  setActive]  = useState(isPlay && _everMounted);
  const [running, setRunning] = useState(isPlay && _everMounted);
  const [visible, setVisible] = useState(isPlay && _everMounted);
  const [opacity, setOpacity] = useState(isPlay && _everMounted ? 1 : 0);
  const [fading,  setFading]  = useState(false);
  const [fadeMs,  setFadeMs]  = useState(FADE_OUT_MS);
  const [fadeEase, setFadeEase] = useState<string>(EASE_IN_OUT_CSS);

  const prevIsPlay = useRef(isPlay);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // ── Premier montage sur /play ────────────────────────────────────────────
    if (isPlay && !_everMounted) {
      timerRef.current = setTimeout(() => {
        _everMounted = true;
        setMounted(true);
        setRunning(true);
        setFading(true);
        setFadeMs(FADE_IN_MS);
        setFadeEase(EASE_IN_OUT_CSS);
        setVisible(true);
        setActive(true);
        setOpacity(1);
      }, 360); // fin de la transition de route sortante
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }

    // ── Revisites : entrée / sortie ──────────────────────────────────────────
    const wasPlay = prevIsPlay.current;
    prevIsPlay.current = isPlay;

    if (isPlay && !wasPlay) {
      // Entrée /play
      setRunning(true);
      timerRef.current = setTimeout(() => {
        setFading(true);
        setFadeMs(FADE_IN_MS);
        setFadeEase(EASE_IN_OUT_CSS);
        setVisible(true);
        setActive(true);
        setOpacity(1);
      }, ENTER_DELAY);
    } else if (!isPlay && wasPlay) {
      // Sortie /play
      triggerOutro();
      setActive(false);
      setRunning(true);
      setVisible(true);
      setFading(true);
      setFadeMs(FADE_OUT_MS);
      setFadeEase(EASE_IN_OUT_CSS);
      setOpacity(0);
      timerRef.current = setTimeout(() => {
        setRunning(false);
        setVisible(false);
      }, EXIT_TOTAL);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlay]);

  if (!mounted) return null;

  return (
    <div
      data-lenis-prevent
      style={{
        position:      "fixed",
        inset:         0,
        opacity,
        transition:    fading ? `opacity ${fadeMs}ms ${fadeEase}` : "none",
        visibility:    visible ? "visible" : "hidden",
        pointerEvents: active  ? "auto"    : "none",
        zIndex:        visible ? 0         : -1,
      }}
    >
      <InfiniteCanvas artifacts={artifacts} active={active} running={running} />
    </div>
  );
}
