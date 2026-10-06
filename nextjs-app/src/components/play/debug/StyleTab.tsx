"use client";

import { folder, useControls } from "leva";
import type { PlayDebugRef } from "../PlayCanvas";
import { num, shardControls, WAVE_DIRECTIONS } from "./controls";

const STYLES = ["prism"];

/**
 * Style : le rendu visuel (la « DA »). Un select choisit le style ; chaque
 * style expose ses propres réglages. Pour l'instant : « prism » (l'identifiant
 * d'origine de la DA, aujourd'hui « Pixels ») — la vague de sélection, la vague
 * blanche de survol, les éclats, les pixels de la nav et du panel.
 */
export function StyleTab({
  state,
  onPanelChange,
}: {
  state: PlayDebugRef;
  onPanelChange?: () => void;
}) {
  const style = state.current.style;
  const overlay = state.current.overlay;
  const hover = state.current.hover;
  const da = state.current.da;
  const tr = state.current.transition;

  useControls("Style", () => ({
    preset: {
      label: "Style",
      value: style.name,
      options: STYLES,
      onChange: (v: string) => {
        style.name = v;
      },
    },

    Prism: folder(
      {
        "Vague (selection)": folder({
          direction: {
            label: "Direction",
            value: overlay.direction,
            options: WAVE_DIRECTIONS,
            onChange: (v: typeof overlay.direction) => {
              overlay.direction = v;
            },
          },
          iridescence: num(overlay, "iridescence", { label: "Irisation", min: 0, max: 1, step: 0.02 }),
          glowIntensity: num(overlay, "glowIntensity", { label: "Intensite de la lumiere (glow)", min: 0, max: 3, step: 0.05 }),
          baseOpacity: num(overlay, "baseOpacity", { label: "Opacite du voile", min: 0, max: 1, step: 0.02 }),
          crestSoftness: num(overlay, "crestSoftness", { label: "Douceur de la crete", min: 0.05, max: 0.8, step: 0.01 }),
          waveAmplitude: num(overlay, "waveAmplitude", { label: "Amplitude de l onde", min: 0.01, max: 0.3, step: 0.01 }),
          waveFrequency: num(overlay, "waveFrequency", { label: "Frequence de l onde", min: 1, max: 20, step: 0.5 }),
          waveSpeed: num(overlay, "waveSpeed", { label: "Vitesse de l onde", min: 0, max: 8, step: 0.2 }),
          Lentille: folder(
            {
              zoomBlur: num(overlay, "zoomBlur", { label: "Flou de zoom", min: 0, max: 1.2, step: 0.01 }),
              zoomPunch: num(overlay, "zoomPunch", { label: "Punch de zoom", min: 0, max: 0.8, step: 0.01 }),
              bulge: num(overlay, "bulge", { label: "Bombe", min: 0, max: 2, step: 0.02 }),
              lensWidth: num(overlay, "lensWidth", { label: "Largeur", min: 0.05, max: 0.8, step: 0.01 }),
              lensTrail: num(overlay, "lensTrail", { label: "Trainee", min: 0, max: 1, step: 0.02 }),
            },
            { collapsed: true },
          ),
        }),

        "Vague de survol": folder(
          {
            hoverWaveAmp: num(hover, "waveAmp", { label: "Intensite", min: 0, max: 1.5, step: 0.05 }),
            hoverWaveWidth: num(hover, "waveWidth", { label: "Largeur de la bande", min: 0.05, max: 0.6, step: 0.01 }),
            hoverWaveDuration: num(hover, "waveDuration", { label: "Duree (s)", min: 0.25, max: 2.5, step: 0.05 }),
            hoverWaveGlow: num(hover, "waveGlow", { label: "Eclat lumineux (coeur de la bande)", min: 0, max: 2, step: 0.05 }),
            hoverWaveIrid: num(hover, "waveIrid", { label: "Irisation (0 = blanc pur)", min: 0, max: 1, step: 0.05 }),
          },
          { collapsed: true },
        ),

        "Desagregation (carte suivante)": folder(
          {
            deckDissolveAmount: num(tr, "deckDissolveAmount", { label: "Part desagregee a la traction max", min: 0, max: 1, step: 0.01 }),
            deckCellCols: num(tr, "deckCellCols", { label: "Zones (colonnes grossieres)", min: 2, max: 14, step: 1 }),
            deckCellPixel: num(tr, "deckCellPixel", { label: "Pixellisation des zones", min: 0, max: 1, step: 0.01 }),
            deckCellIrid: num(tr, "deckCellIrid", { label: "Irisation des zones", min: 0, max: 1, step: 0.01 }),
            deckCellBias: num(tr, "deckCellBias", { label: "Part du bord qui mene (1) / hasard (0)", min: 0, max: 1, step: 0.01 }),
            deckShimmer: num(tr, "deckShimmer", { label: "Eclats arraches pendant la traction", min: 0, max: 2, step: 0.05 }),
          },
          { collapsed: true },
        ),

        Eclats: folder(
          {
            fxBurstBoost: num(tr, "fxBurstBoost", { label: "Surintensite au burst", min: 0, max: 3, step: 0.05 }),
            ...shardControls(state.current.shards),
          },
          { collapsed: true },
        ),

        "Pixels et degrades": folder(
          {
            daRadius: num(da, "pixelRadius", { label: "Pixels : coins arrondis (0 carre, 0.5 rond)", min: 0, max: 0.5, step: 0.01 }),
            daNavPixels: num(da, "navPixels", { label: "Pastille play : opacite des pixels de couleur", min: 0, max: 3, step: 0.05 }),
            daNavSize: num(da, "navPixelSize", { label: "Pastille play : taille d un pixel (rem)", min: 0.25, max: 0.6, step: 0.0625 }),
            daNavGray: num(da, "navGray", { label: "Pastille play : fond gris (force)", min: 0, max: 3, step: 0.05 }),
            daNavDrift: num(da, "navDriftPeriod", { label: "Pastille play : defilement actif (s)", min: 3, max: 60, step: 1 }),
            daNavHoverDur: num(da, "navHoverDuration", { label: "Pastille play : vague au survol (s)", min: 0.3, max: 3, step: 0.05 }),
            daNavHoverSpread: num(da, "navHoverSpread", { label: "Pastille play : etalement de la vague (s)", min: 0.1, max: 2, step: 0.05 }),
            daPanelSize: num(da, "panelPixelSize", { label: "Pixels du panel (taille, rem)", min: 0.25, max: 1.5, step: 0.0625 }),
            // La densité change les pixels rendus : React doit les refaire (comme l'opacité).
            daPanelDensity: {
              ...num(da, "panelPixelDensity", { label: "Pixels du panel (nombre, 1 = grille pleine)", min: 0, max: 1, step: 0.01 }),
              onChange: (v: number) => {
                da.panelPixelDensity = v;
                onPanelChange?.();
              },
            },
            panelGlitch: {
              ...num(tr, "panelGlitch", { label: "Pixels du panel (opacite)", min: 0, max: 1, step: 0.01 }),
              onChange: (v: number) => {
                tr.panelGlitch = v;
                onPanelChange?.();
              },
            },
            daPanelSpread: num(da, "panelGradientSpread", { label: "Degrade du panel (etendue)", min: 0.4, max: 2.2, step: 0.05 }),
            daPanelIrid: num(da, "panelGradientIrid", { label: "Degrade du panel (irisation, 0 = couleurs de la page)", min: 0, max: 1, step: 0.02 }),
            panelGradientStrength: num(tr, "panelGradientStrength", { label: "Degrade du panel (intensite)", min: 0, max: 1, step: 0.01 }),
            panelGradientSpeed: num(tr, "panelGradientSpeed", { label: "Degrade du panel (vitesse)", min: 0, max: 6, step: 0.1 }),
          },
          { collapsed: true },
        ),
      },
      { render: (get) => get("Style.preset") === "prism" },
    ),
  }));

  return null;
}
