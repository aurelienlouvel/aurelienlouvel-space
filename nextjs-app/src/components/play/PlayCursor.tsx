"use client";

import { useEffect, useRef } from "react";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";

/** Point actif de la flèche dans default.svg (32px) : la pointe. */
const HOTSPOT = { x: 4, y: 2 };
const SOURCE_SIZE = 32;

/**
 * Le curseur de /play : la flèche par défaut du site, dessinée par le composant
 * (le CSS ne sait ni la pivoter ni la redimensionner en continu).
 *
 * - s'incline selon la direction du mouvement (vers la droite → horaire), puis
 *   revient droite quand on s'arrête ;
 * - grossit au survol d'un artifact, rétrécit pendant le clic.
 *
 * Seule la souris est concernée (le tactile n'a pas de curseur). Le curseur
 * natif est masqué via `html[data-play-cursor]` (cf. globals.css) et revient
 * sur le panneau de debug.
 */
export function PlayCursor({
  debug,
  runtime,
}: {
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const arrow = arrowRef.current;
    if (!wrap || !arrow) return;

    let raf = 0;
    let last = performance.now();
    let x = -100;
    let y = -100;
    let lastX = x;
    let lastY = y;
    let seen = false;
    let overUi = false;
    let pressed = false;
    let tilt = 0;
    let scale = 1;
    let vx = 0;
    let vy = 0;

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      seen = true;
      overUi = e.target instanceof Element && Boolean(e.target.closest("#leva__root"));
    }
    function onDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button === 0) pressed = true;
    }
    function onUp() {
      pressed = false;
    }
    function onLeave() {
      seen = false;
    }

    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cfg = debug.current.cursor;
      const root = document.documentElement;

      // Curseur natif masqué tant que le personnalisé est actif et visible.
      const custom = cfg.enabled && seen && !overUi;
      if (custom !== root.hasAttribute("data-play-cursor")) {
        root.toggleAttribute("data-play-cursor", custom);
      }

      if (dt > 0) {
        // Vitesse lissée du pointeur (px/s).
        const k = 1 - Math.exp(-dt * 20);
        vx += ((x - lastX) / dt - vx) * k;
        vy += ((y - lastY) / dt - vy) * k;
      }
      lastX = x;
      lastY = y;

      // Inclinaison : horizontale dominante, un peu de verticale ; revient à 0 à l'arrêt.
      const ref = Math.max(200, cfg.rotateSpeedRef);
      const targetTilt =
        cfg.rotate *
        Math.max(-1, Math.min(1, (vx + vy * 0.35) / ref));
      tilt += (targetTilt - tilt) * (1 - Math.exp(-dt * cfg.rotateSmooth));

      // Échelle : grossit au survol d'un artifact, rétrécit au clic.
      const rc = runtime.current;
      const hovering = rc.transition.phase === "idle" && rc.hovered !== null;
      const targetScale = pressed ? cfg.pressScale : hovering ? cfg.hoverScale : 1;
      scale += (targetScale - scale) * (1 - Math.exp(-dt * cfg.scaleSpeed));

      const unit = cfg.size / SOURCE_SIZE;
      wrap!.style.opacity = custom ? "1" : "0";
      wrap!.style.transform = `translate3d(${x - HOTSPOT.x * unit}px, ${y - HOTSPOT.y * unit}px, 0)`;
      arrow!.style.width = `${cfg.size}px`;
      arrow!.style.height = `${cfg.size}px`;
      // Pivot et échelle autour de la pointe, comme un vrai curseur.
      arrow!.style.transformOrigin = `${HOTSPOT.x * unit}px ${HOTSPOT.y * unit}px`;
      arrow!.style.transform = `rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`;

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeAttribute("data-play-cursor");
    };
  }, [debug, runtime]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[2147483000] opacity-0 will-change-transform"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={arrowRef}
        src="/cursors/default.svg"
        alt=""
        draggable={false}
        className="block max-w-none select-none"
      />
    </div>
  );
}
