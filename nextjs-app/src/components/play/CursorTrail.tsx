"use client";

import { useEffect, useRef } from "react";
import { daGradientAt, daPingPong } from "@/lib/da";
import type { PlayDebugRef } from "./PlayCanvas";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Côté du carré (px), toujours pair : il tombe pile sur la grille de 2 px. */
  size: number;
  color: string;
  born: number;
  life: number;
};

/** Distance (px) entre deux pixels de la traînée à intensité 1. */
const BASE_SPACING = 14;
const MAX_PARTICLES = 36;
/** Durée (ms) d'un aller-retour du dégradé dans la fenêtre du spectre. */
const GRADIENT_PERIOD = 8000;

/**
 * Légère traînée de pixels derrière le curseur : de petits carrés unis, sans flou,
 * dont la couleur dérive lentement le long du dégradé de la DA (ciel → lilas →
 * rose) : d'un pixel au suivant, la teinte glisse. Dessinée sur un canvas 2D qui ne
 * tourne que tant qu'il reste des particules, donc gratuit au repos. Intensité
 * réglable (0 = coupée) dans le debug, onglet global.
 */
export function CursorTrail({ debug }: { debug: PlayDebugRef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let particles: Particle[] = [];
    let raf = 0;
    let running = false;
    let lastX = NaN;
    let lastY = NaN;
    let carry = 0;
    let dpr = 1;

    function resize() {
      if (!canvas || !ctx) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function draw(now: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const alive: Particle[] = [];
      for (const p of particles) {
        const f = (now - p.born) / p.life;
        if (f >= 1) continue;
        alive.push(p);
        const dt = 1 / 60;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Le carré rétrécit en vieillissant, sans jamais quitter la grille de 2 px.
        const s = Math.max(2, Math.round((p.size * (1 - 0.4 * f)) / 2) * 2);
        const x = Math.round(p.x / 2) * 2 - s / 2;
        const y = Math.round(p.y / 2) * 2 - s / 2;
        ctx.globalAlpha = Math.pow(1 - f, 1.3) * 0.75;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, s, s);
      }
      ctx.globalAlpha = 1;
      particles = alive;
      if (particles.length > 0) {
        raf = requestAnimationFrame(draw);
      } else {
        running = false;
      }
    }

    function spawn(x: number, y: number, now: number) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      // Le dégradé va et vient dans la fenêtre du spectre ; un léger écart au hasard
      // évite que deux pixels posés au même instant soient de la même teinte.
      const along = daPingPong(now / GRADIENT_PERIOD + Math.random() * 0.04);
      particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 18 + 6,
        size: 2 * (2 + Math.floor(Math.random() * 3)),
        color: daGradientAt(along),
        born: now,
        life: (debug.current.camera.cursorTrailLife ?? 320) * (0.75 + Math.random() * 0.5),
      });
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      const amount = debug.current.camera.cursorTrail;
      if (amount <= 0.01) return;
      const now = performance.now();
      if (!Number.isNaN(lastX)) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const dist = Math.hypot(dx, dy);
        const spacing = BASE_SPACING / (0.4 + amount);
        carry += dist;
        // Un pixel tous les `spacing` px parcourus, posés le long du trajet.
        while (carry >= spacing) {
          carry -= spacing;
          const t = dist > 0 ? 1 - carry / dist : 1;
          spawn(lastX + dx * t, lastY + dy * t, now);
        }
      }
      lastX = e.clientX;
      lastY = e.clientY;
      if (!running && particles.length > 0) {
        running = true;
        raf = requestAnimationFrame(draw);
      }
    }

    function onLeave() {
      lastX = NaN;
      lastY = NaN;
      carry = 0;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("resize", resize);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [debug]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 size-full"
    />
  );
}
