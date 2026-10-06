"use client";

import { folder, useControls } from "leva";
import type { PlayDebugRef } from "../PlayCanvas";
import { num, toggle } from "./controls";

/** Global : la caméra (zoom, déplacement, inertie, dézoom) et le curseur. */
export function GlobalTab({ state }: { state: PlayDebugRef }) {
  const cam = state.current.camera;
  const pan = state.current.pan;
  const cursor = state.current.cursor;

  useControls("Global", () => ({
    Camera: folder({
      zoom: num(cam, "zoom", { label: "Zoom de base", min: 0.2, max: 2, step: 0.05 }),
      "Deplacement": folder(
        {
          followSpeed: num(cam, "followSpeed", { label: "Suivi du geste (raideur)", min: 4, max: 60, step: 1 }),
          settleSpeed: num(cam, "settleSpeed", { label: "Recentrage (fleches, selection)", min: 1, max: 30, step: 0.5 }),
          wheelSpeed: num(cam, "wheelSpeed", { label: "Vitesse de la molette", min: 0.2, max: 3, step: 0.05 }),
          dragThreshold: num(pan, "dragThreshold", { label: "Seuil de drag (px)", min: 1, max: 20, step: 1 }),
          velocityWindowMs: num(pan, "velocityWindowMs", { label: "Fenetre de vitesse (ms)", min: 20, max: 200, step: 10 }),
          friction: num(pan, "friction", { label: "Friction de l inertie", min: -14, max: -0.5, step: 0.25 }),
        },
        { collapsed: false },
      ),
      "Dezoom en mouvement": folder(
        {
          speedDezoom: num(cam, "speedDezoom", { label: "Dezoom max (0.2 = -20 pct)", min: 0, max: 0.6, step: 0.01 }),
          speedDezoomRef: num(cam, "speedDezoomRef", { label: "Vitesse pour dezoom complet (px/s)", min: 400, max: 5000, step: 50 }),
          speedDezoomAttack: num(cam, "speedDezoomAttack", { label: "Attaque (haut = instantane)", min: 4, max: 200, step: 1 }),
          dezoomAnchor: toggle(cam, "dezoomAnchor", "Zoom ancre sous le pointeur"),
        },
        { collapsed: false },
      ),
      "Motion blur": folder(
        {
          motionBlur: toggle(cam, "motionBlur", "Activer"),
          motionBlurStrength: num(cam, "motionBlurStrength", { label: "Intensite", min: 0.1, max: 4, step: 0.1 }),
          motionBlurMax: num(cam, "motionBlurMax", { label: "Trainee max", min: 0.01, max: 0.25, step: 0.005 }),
        },
        { collapsed: true },
      ),
      Fisheye: folder(
        {
          fisheyeEnabled: toggle(state.current.fisheye, "enabled", "Activer"),
          fisheyeStrength: num(state.current.fisheye, "strength", { label: "Force", min: 0, max: 0.08, step: 0.002 }),
        },
        { collapsed: true },
      ),
    }),

    Cursor: folder({
      cursorEnabled: toggle(cursor, "enabled", "Curseur personnalise"),
      cursorSize: num(cursor, "size", { label: "Taille (px)", min: 16, max: 120, step: 1 }),
      cursorRotate: num(cursor, "rotate", { label: "Inclinaison max (deg)", min: 0, max: 80, step: 1 }),
      cursorTiltSpeedRef: num(cursor, "tiltSpeedRef", { label: "Vitesse de reference (px/s)", min: 200, max: 4000, step: 50 }),
      cursorTiltVertical: num(cursor, "tiltVertical", { label: "Part du mouvement vertical", min: -1, max: 1, step: 0.05 }),
      cursorTiltFrequency: num(cursor, "tiltFrequency", { label: "Nervosite de l inclinaison (rad/s)", min: 8, max: 90, step: 1 }),
      cursorTiltDamping: num(cursor, "tiltDamping", { label: "Amortissement (1 = sans rebond)", min: 0.3, max: 1.5, step: 0.05 }),
      cursorHoverScale: num(cursor, "hoverScale", { label: "Echelle au survol d un artifact", min: 0.5, max: 3, step: 0.01 }),
      cursorPressScale: num(cursor, "pressScale", { label: "Echelle au clic", min: 0.3, max: 1.5, step: 0.01 }),
      cursorScaleSpeed: num(cursor, "scaleSpeed", { label: "Vitesse des changements d echelle", min: 2, max: 40, step: 0.5 }),
      Trainee: folder({
        cursorTrail: num(cam, "cursorTrail", { label: "Intensite (0 = coupee)", min: 0, max: 1, step: 0.05 }),
        cursorTrailLife: num(cam, "cursorTrailLife", { label: "Longueur (ms)", min: 60, max: 1200, step: 10 }),
      }),
    }),
  }));

  return null;
}
