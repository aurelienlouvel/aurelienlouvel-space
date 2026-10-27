"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PlayDebugRef, PlayRuntimeRef } from "./PlayCanvas";

/** Point actif de la flèche dans default.svg (32px) : la pointe. */
const HOTSPOT = { x: 4, y: 2 };
const SOURCE_SIZE = 32;

/** Fenêtre (ms) sur laquelle la vitesse du pointeur est mesurée : assez courte pour ne pas retarder l'inclinaison. */
const VELOCITY_WINDOW_MS = 50;
/** Écart minimal (ms) entre les deux extrémités de la fenêtre : évite un pic quand deux événements arrivent ensemble. */
const MIN_SPAN_MS = 8;
/** Sous cette vitesse (px/s) le pointeur compte pour immobile : pas de tremblement à l'arrêt. */
const DEAD_ZONE = 30;
/** Pas (s) du ressort d'inclinaison : intégration stable quelle que soit la fréquence d'affichage. */
const SPRING_STEP = 1 / 240;

/**
 * Le curseur de /play : la flèche par défaut du site, dessinée par le composant
 * (le CSS ne sait ni la pivoter ni la redimensionner en continu).
 *
 * - s'incline selon la vitesse du pointeur (vers la droite → horaire), puis
 *   revient droite dès qu'il s'arrête ;
 * - grossit au survol d'un artifact, rétrécit pendant le clic.
 *
 * Il est rendu dans <body> et non dans la surface de /play : cette surface est
 * un contexte d'empilement (`fixed`), donc rien de ce qu'elle contient, pas même
 * un z-index énorme, ne passerait devant la barre de navigation.
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
    let seen = false;
    let overUi = false;
    let pressed = false;
    let tilt = 0;
    let tiltRate = 0;
    let scale = 1;
    // Positions des derniers événements du pointeur, pour mesurer sa vitesse.
    const trail: { t: number; x: number; y: number }[] = [];

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      seen = true;
      overUi = e.target instanceof Element && Boolean(e.target.closest("#leva__root"));
      trail.push({ t: e.timeStamp, x, y });
    }
    function onDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button === 0) pressed = true;
    }
    function onUp() {
      pressed = false;
    }
    function onLeave() {
      seen = false;
      trail.length = 0;
    }

    function tick(now: number) {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const cfg = debug.current.cursor;
      const root = document.documentElement;

      // Curseur natif masqué tant que le personnalisé est actif et visible.
      const custom = cfg.enabled && seen && !overUi;
      if (custom !== root.hasAttribute("data-play-cursor")) {
        root.toggleAttribute("data-play-cursor", custom);
      }

      // Vitesse du pointeur (px/s) sur les dernières 50 ms, mesurée entre
      // événements : elle tombe à 0 dès que le pointeur s'arrête, sans traîne.
      while (trail.length > 0 && now - trail[0].t > VELOCITY_WINDOW_MS) trail.shift();
      let vx = 0;
      let vy = 0;
      if (trail.length > 1) {
        const from = trail[0];
        const to = trail[trail.length - 1];
        const span = Math.max(MIN_SPAN_MS, Math.max(now, to.t) - from.t) / 1000;
        vx = (to.x - from.x) / span;
        vy = (to.y - from.y) / span;
      }

      // Inclinaison cible : la flèche est tirée par sa pointe, son corps traîne
      // derrière. Horizontale dominante ; descendre l'incline vers la gauche
      // (`tiltVertical` négatif). La réponse sature (tanh) : un geste normal
      // incline nettement sans jamais dépasser l'angle max.
      let drive = vx + cfg.tiltVertical * vy;
      drive = Math.sign(drive) * Math.max(0, Math.abs(drive) - DEAD_ZONE);
      const targetTilt = cfg.rotate * Math.tanh(drive / Math.max(50, cfg.tiltSpeedRef));

      // Ressort amorti vers la cible, par pas fixes : suit le geste dans la
      // foulée au lieu de le rattraper (cf. `tiltFrequency` et `tiltDamping`).
      if (seen) {
        const w = cfg.tiltFrequency;
        const damping = 2 * cfg.tiltDamping * w;
        for (let left = dt; left > 1e-6; left -= SPRING_STEP) {
          const h = Math.min(SPRING_STEP, left);
          tiltRate += (w * w * (targetTilt - tilt) - damping * tiltRate) * h;
          tilt += tiltRate * h;
        }
      } else {
        tilt = 0;
        tiltRate = 0;
      }

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

  if (typeof document === "undefined") return null;
  return createPortal(
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
    </div>,
    document.body,
  );
}
