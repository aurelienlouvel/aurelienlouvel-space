"use client";

import { useEffect, useRef, type RefObject } from "react";
import { button, buttonGroup, folder, useControls } from "leva";
import type { PlayDebugRef, PlayRuntimeState } from "../PlayCanvas";
import { STACK_DEPTH_MAX } from "../transition-presets";
import { easingControl, num, toggle, trackControls } from "./controls";

type RuntimeRef = RefObject<PlayRuntimeState> | undefined;

/** Les écritures dans le runtime vivent hors du composant : mutation voulue (ref lue par les useFrame). */
function applyFreeze(runtime: RuntimeRef, freeze: { on: boolean; value: number }) {
  const rc = runtime?.current;
  if (rc) rc.transition.deckFreeze = freeze.on ? freeze.value : null;
}

/** Simule un geste complet vers la carte suivante, la carte partant vers le haut (vue détail uniquement ; le deck ne recule pas). */
function stepCard(runtime: RuntimeRef) {
  const rc = runtime?.current;
  if (!rc || rc.transition.phase !== "isolated") return;
  rc.transition.deckLockUntil = 0;
  rc.transition.deckPullVec.x = 0;
  rc.transition.deckPullVec.y = 1.001;
  rc.transition.deckInputAt = performance.now();
}

/** Force le survol de la carte sélectionnée pendant `ms`. */
function replayHover(runtime: RuntimeRef, ms: number) {
  const rc = runtime?.current;
  if (rc) rc.debugHoverUntil = performance.now() + ms;
}

function releaseFreeze(runtime: RuntimeRef) {
  const rc = runtime?.current;
  if (rc) rc.transition.deckFreeze = null;
}

/**
 * Animation : le survol d'une carte, la transition vers un artifact et le
 * passage à la carte suivante — avec de quoi les rejouer (boutons, vitesse,
 * traction maintenue) ; la visualisation détaillée est l'inspecteur au-dessus.
 */
export function AnimationTab({
  state,
  runtime,
  onSimulateSelect,
  onResetTransition,
  onTextLayoutChange,
}: {
  state: PlayDebugRef;
  runtime?: RefObject<PlayRuntimeState>;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
  onTextLayoutChange?: () => void;
}) {
  const tr = state.current.transition;
  const hover = state.current.hover;
  const studio = state.current.studio;
  const setRef = useRef<((values: Record<string, unknown>) => void) | null>(null);
  // Traction maintenue : deux contrôles (case + valeur) qui se complètent.
  const freeze = useRef({ on: false, value: 0.6 });

  const [, set] = useControls("Animation", () => ({
    Rejouer: folder({
      Ouverture: buttonGroup({
        "Play (R)": onSimulateSelect,
        "Reverse (Esc)": onResetTransition,
      }),
      "Hover replay": buttonGroup({
        "Rejouer le survol": () => replayHover(runtime, hover.waveDuration * 1000 + 700),
      }),
      "Carte suivante": buttonGroup({
        "Suivante": () => stepCard(runtime),
      }),
      playbackSpeed: {
        label: "Vitesse de lecture",
        value: studio.speed,
        options: { "0.1x": 0.1, "0.25x": 0.25, "0.5x": 0.5, "1x": 1, "2x": 2 },
        onChange: (v: number) => {
          studio.speed = v;
        },
      },
      loop: toggle(studio, "loopLock", "Boucle (L)"),
      freezeOn: {
        label: "Maintenir la traction",
        value: false,
        onChange: (v: boolean) => {
          freeze.current.on = v;
          applyFreeze(runtime, freeze.current);
        },
      },
      freezeValue: {
        label: "Traction maintenue (0 a 1)",
        value: 0.6,
        min: 0,
        max: 1,
        step: 0.01,
        onChange: (v: number) => {
          freeze.current.value = v;
          applyFreeze(runtime, freeze.current);
        },
      },
    }),

    Survol: folder(
      {
        hoverScale: num(hover, "scale", { label: "Grossissement", min: 0, max: 0.2, step: 0.005 }),
        hoverRotate: num(hover, "rotate", { label: "Rotation max (deg)", min: 0, max: 8, step: 0.1 }),
        hoverSpeed: num(hover, "speed", { label: "Vitesse", min: 2, max: 30, step: 0.5 }),
        hoverCountOpacity: num(hover, "countOpacity", { label: "Pastille medias: opacite (0 = off)", min: 0, max: 1, step: 0.05 }),
        hoverCountMin: num(hover, "countMin", { label: "Pastille medias: des N medias", min: 1, max: 5, step: 1 }),
        hoverCountInset: num(hover, "countInset", { label: "Pastille medias: retrait du coin (px)", min: 0, max: 40, step: 1 }),
        hoverCountScale: num(hover, "countScale", { label: "Pastille medias: taille (x)", min: 0.6, max: 2, step: 0.05 }),
        hoverCountSpeed: num(hover, "countSpeed", { label: "Pastille medias: vitesse", min: 2, max: 40, step: 0.5 }),
      },
      { collapsed: true },
    ),

    Ouverture: folder(
      {
        "1 Approche": folder(
          {
            ...trackControls(tr, "hero", 3, 3),
            approachZoom: num(tr, "approachZoom", { label: "Zoom approche (x base)", min: 0.5, max: 5, step: 0.05 }),
            silenceDrift: num(tr, "silenceDrift", { label: "Derive du zoom (attente)", min: 0, max: 0.3, step: 0.005 }),
          },
          { collapsed: true },
        ),
        "2 Burst": folder(
          {
            ...trackControls(tr, "scatter", 3, 3),
            scatterDistance: num(tr, "scatterDistance", { label: "Distance de base", min: 500, max: 6000, step: 50 }),
            burstPowerMin: num(tr, "burstPowerMin", { label: "Puissance min (x)", min: 0, max: 2, step: 0.05 }),
            burstPowerMax: num(tr, "burstPowerMax", { label: "Puissance max (x)", min: 0, max: 3, step: 0.05 }),
            burstAngleJitter: num(tr, "burstAngleJitter", { label: "Jitter de direction (rad)", min: 0, max: 1.5, step: 0.05 }),
            Seed: {
              value: tr.burstSeed,
              min: 0,
              max: 9999,
              step: 1,
              onChange: (v: number) => {
                tr.burstSeed = v;
              },
            },
            Reseed: button(() => {
              setRef.current?.({ Seed: Math.floor(Math.random() * 10000) });
            }),
          },
          { collapsed: true },
        ),
        "3 Attente": folder(
          {
            simulatedLoadMs: num(tr, "simulatedLoadMs", { label: "Chargement simule (ms)", min: 0, max: 10000, step: 100 }),
            packShake: num(tr, "packShake", { label: "Tortillement (rad)", min: 0, max: 0.3, step: 0.005 }),
            wiggleSpeed: num(tr, "wiggleSpeed", { label: "Vitesse du tortillement", min: 0, max: 20, step: 0.5 }),
            breathe: num(tr, "breathe", { label: "Respiration (scale)", min: 0, max: 0.1, step: 0.005 }),
            loadGrow: num(tr, "loadGrow", { label: "Grossissement max", min: 0, max: 0.4, step: 0.01 }),
            loadWaveSpeed: num(tr, "loadWaveSpeed", { label: "Vague en boucle (cycles par s)", min: 0.2, max: 3, step: 0.05 }),
          },
          { collapsed: true },
        ),
        "4 Vague": folder(
          {
            waveDuration: num(tr, "waveDuration", { label: "Duree (s)", min: 0.2, max: 3, step: 0.05 }),
            waveEasing: easingControl(tr, "waveEasing"),
            twistSettleStart: num(tr, "twistSettleStart", { label: "Fin du tortillement : debut (s apres la vague)", min: -2, max: 1, step: 0.05 }),
            twistSettle: num(tr, "twistSettle", { label: "Fin du tortillement : duree du retour a plat (s)", min: 0.05, max: 3, step: 0.05 }),
            twistSettleEasing: easingControl(tr, "twistSettleEasing", "Fin du tortillement : courbe (easeInOut = doux)"),
          },
          { collapsed: true },
        ),
        "5 Cascade et cadrage": folder(
          {
            lockScalePunch: num(tr, "lockScalePunch", { label: "Punch d arrivee : toute la pile gonfle de (0.14 = +14 %, 0 = aucun)", min: 0, max: 0.6, step: 0.005 }),
            lockPunchAttack: num(tr, "lockPunchAttack", { label: "Punch : part de la piste lock passee a monter (petit = coup sec)", min: 0.05, max: 0.6, step: 0.01 }),
            ...trackControls(tr, "lock", 2, 2),
            ...trackControls(tr, "reveal", 3, 3),
            ...trackControls(tr, "columnFade", 4, 3),
            ...trackControls(tr, "dezoom", 6, 5),
            detailZoom: num(tr, "detailZoom", { label: "Zoom final (x base)", min: 0.5, max: 4, step: 0.05 }),
            "Arrivee (recul puis zoom)": folder({
              arrivalDip: num(tr, "arrivalDip", { label: "Recul de la camera des que le pack est charge (part du zoom, 0 = aucun)", min: 0, max: 0.6, step: 0.01 }),
              arrivalStart: num(tr, "arrivalStart", { label: "Recul : retard apres le chargement (s, borne a 60 % de la fenetre)", min: 0, max: 1, step: 0.05 }),
              arrivalEasing: easingControl(tr, "arrivalEasing", "Recul : courbe (easeInOut = doux)"),
            }),
            Layers: folder({
              stackDepth: num(tr, "stackDepth", { label: "Layers visibles dessous (la pile boucle)", min: 0, max: STACK_DEPTH_MAX, step: 1 }),
              stackOpacity: num(tr, "stackOpacity", { label: "Opacite du 1er layer", min: 0, max: 1, step: 0.01 }),
              stackOpacityFalloff: num(tr, "stackOpacityFalloff", { label: "Decroissance par layer", min: 0, max: 1, step: 0.01 }),
              stackSaturation: num(tr, "stackSaturation", { label: "Saturation des layers dessous (1 = couleurs d origine)", min: 0, max: 1, step: 0.01 }),
              stackPeek: num(tr, "stackPeek", { label: "Decalage vers le bas (px)", min: 4, max: 80, step: 1 }),
              stackScale: num(tr, "stackScale", { label: "Echelle par layer", min: 0.5, max: 1, step: 0.01 }),
              stackDrop: num(tr, "stackDrop", { label: "Depart des layers a l arrivee (0 = bord bas de la carte, 1 = centres derriere elle)", min: 0, max: 1, step: 0.05 }),
            }),
          },
          { collapsed: true },
        ),
        "6 Panneau et navbar": folder(
          {
            navbarLead: num(tr, "navbarLead", { label: "Avance navbar (s)", min: 0, max: 2, step: 0.05 }),
            textLead: num(tr, "textLead", { label: "Avance side panel (s)", min: 0, max: 2, step: 0.05 }),
          },
          { collapsed: true },
        ),
        "7 Retour": folder(
          {
            rewindDuration: num(tr, "rewindDuration", { label: "Rewind : duree de l ouverture (s)", min: 0.3, max: 6, step: 0.05 }),
            rewindMode: {
              label: "Rewind : facon (clean = chaque grandeur glisse vers le repos, film = l ouverture a l envers)",
              value: tr.rewindMode,
              options: ["clean", "film"],
              onChange: (v: string) => {
                tr.rewindMode = v === "film" ? "film" : "clean";
              },
            },
            rewindEasing: easingControl(tr, "rewindEasing", "Rewind : courbe (cinematique = easeInOut)"),
            rewindStagger: num(tr, "rewindStagger", { label: "Rewind clean : decalage entre carte, camera et mosaique (0 = ensemble)", min: 0, max: 1, step: 0.05 }),
            rewindCalm: num(tr, "rewindCalm", { label: "Rewind : calme (coupe vague, torsion et eclats ; 1 = aucun)", min: 0, max: 1, step: 0.05 }),
            rewindLayerFade: num(tr, "rewindLayerFade", { label: "Rewind : disparition des cartes derriere (s)", min: 0.02, max: 1.5, step: 0.01 }),
            exit_duration: num(tr.exit, "duration", { label: "Sortie vue detail (s)", min: 0.1, max: 3, step: 0.05 }),
            exit_easing: easingControl(tr.exit, "easing", "Easing de sortie"),
            repulseReturnDelay: num(tr, "repulseReturnDelay", { label: "Retard de la mosaique (s)", min: 0, max: 1.5, step: 0.05 }),
            cameraReturnDelay: num(tr, "cameraReturnDelay", { label: "Retard de la camera (s)", min: 0, max: 1, step: 0.02 }),
          },
          { collapsed: true },
        ),
        "8 Pixels de fond": folder(
          {
            ambientPixels: num(tr, "ambientPixels", { label: "Nombre (0 = aucun)", min: 0, max: 30, step: 1 }),
            ambientOpacity: num(tr, "ambientOpacity", { label: "Opacite (discret = bas)", min: 0, max: 1, step: 0.01 }),
            ambientSize: num(tr, "ambientSize", { label: "Taille max (unites monde)", min: 6, max: 120, step: 1 }),
            ambientTravel: num(tr, "ambientTravel", { label: "Derive (unites monde)", min: 0, max: 600, step: 5 }),
            ambientSpeed: num(tr, "ambientSpeed", { label: "Vitesse (cycles par s, 0.1 = 10 s de vie)", min: 0.02, max: 1, step: 0.01 }),
            ambientFade: num(tr, "ambientFade", { label: "Apparition et changement de carte (s)", min: 0.05, max: 4, step: 0.05 }),
          },
          { collapsed: true },
        ),
      },
      { collapsed: true },
    ),

    "Carte suivante": folder(
      {
        deckPullDistance: num(tr, "deckPullDistance", { label: "Distance pour passer (px de molette)", min: 120, max: 2400, step: 10 }),
        dragPxPerCard: num(tr, "dragPxPerCard", { label: "Distance pour passer (px de drag)", min: 100, max: 1200, step: 10 }),
        deckResist: num(tr, "deckResist", { label: "Resistance (courbe)", min: 1, max: 6, step: 0.1 }),
        deckLift: num(tr, "deckLift", { label: "Course de la carte (px)", min: 0, max: 300, step: 1 }),
        deckRelease: num(tr, "deckRelease", { label: "Retour si on lache (vitesse ; 0 = la carte reste ou on l a laissee, on peut revenir en sens inverse)", min: 0, max: 30, step: 0.5 }),
        deckHold: num(tr, "deckHold", { label: "Delai avant retour (s, sans effet si la vitesse de retour est 0)", min: 0, max: 1, step: 0.01 }),
        deckAimMix: num(tr, "deckAimMix", { label: "Courbure de la trajectoire vers le curseur (0 = droit devant)", min: 0, max: 1, step: 0.01 }),
        deckInvertX: toggle(tr, "deckInvertX", "Inverser l axe horizontal (molette, drag, fleches)"),
        deckInvertY: toggle(tr, "deckInvertY", "Inverser l axe vertical (molette, drag, fleches)"),
        deckThrow: num(tr, "deckThrow", { label: "Distance de lancer (px)", min: 0, max: 600, step: 5 }),
        deckSpin: num(tr, "deckSpin", { label: "Rotation de la carte lancee (deg)", min: 0, max: 45, step: 0.5 }),
        "Rotation 3D de la pile (souris)": folder({
          deckTilt: num(tr, "deckTilt", { label: "Rotation max du groupe (deg, le cote du curseur recule ; negatif = inverse, 0 = a plat)", min: -25, max: 25, step: 0.5 }),
          deckTiltSmooth: num(tr, "deckTiltSmooth", { label: "Raideur du suivi de la souris", min: 1, max: 30, step: 0.5 }),
          stackDepthZ: num(tr, "stackDepthZ", { label: "Ecart en profondeur entre layers (px, 0 = pas de parallaxe)", min: 0, max: 120, step: 1 }),
          stackPerspective: num(tr, "stackPerspective", { label: "Perspective de chaque carte (0 = rotation sans trapeze)", min: 0, max: 1.5, step: 0.05 }),
          deckTiltLayerGain: num(tr, "deckTiltLayerGain", { label: "Inclinaison propre aux layers profonds (gain par niveau, 0 = rigides)", min: -1, max: 2, step: 0.05 }),
        }),
        deckDissolve: num(tr, "deckDissolve", { label: "Evanouissement (courbe)", min: 0.5, max: 6, step: 0.1 }),
        stepCooldown: num(tr, "stepCooldown", { label: "Verrou apres changement (s)", min: 0, max: 2, step: 0.05 }),
        detailScrollDamping: num(tr, "detailScrollDamping", { label: "Vitesse du changement", min: 2, max: 30, step: 0.5 }),
      },
      { collapsed: true },
    ),

    "Detail (colonne et panneau)": folder(
      {
        detailColumnRatio: num(tr, "detailColumnRatio", { label: "Position de la colonne (0.5 = centre)", min: 0.1, max: 1, step: 0.02 }),
        desktopMediaWidthRatio: num(tr, "desktopMediaWidthRatio", { label: "Largeur desktop (ratio)", min: 0.15, max: 0.6, step: 0.01 }),
        maxMediaWidthRatio: num(tr, "maxMediaWidthRatio", { label: "Largeur max (% ecran)", min: 0.2, max: 0.8, step: 0.01 }),
        maxMediaHeightRatio: num(tr, "maxMediaHeightRatio", { label: "Hauteur max (% ecran)", min: 0.3, max: 0.95, step: 0.01 }),
        mobileMediaHeightRatio: num(tr, "mobileMediaHeightRatio", { label: "Hauteur mobile (ratio)", min: 0.2, max: 0.8, step: 0.02 }),
        textWidth: {
          label: "Panneau : largeur (% ecran)",
          value: Math.round((tr.landscapeTextWidthRatio ?? 0.42) * 100),
          min: 20,
          max: 80,
          step: 1,
          onChange: (v: number) => {
            tr.landscapeTextWidthRatio = v / 100;
            onTextLayoutChange?.();
          },
        },
        textRight: {
          label: "Panneau : marge droite (px)",
          value: tr.landscapeTextRightOffset ?? 0,
          min: -150,
          max: 300,
          step: 5,
          onChange: (v: number) => {
            tr.landscapeTextRightOffset = v;
            onTextLayoutChange?.();
          },
        },
        textTop: {
          label: "Panneau : decalage vertical (px)",
          value: tr.landscapeTextTopOffset ?? 0,
          min: -300,
          max: 300,
          step: 5,
          onChange: (v: number) => {
            tr.landscapeTextTopOffset = v;
            onTextLayoutChange?.();
          },
        },
        textMax: {
          label: "Panneau : largeur max (px)",
          value: tr.landscapeTextMaxWidth ?? 576,
          min: 350,
          max: 1200,
          step: 10,
          onChange: (v: number) => {
            tr.landscapeTextMaxWidth = v;
            onTextLayoutChange?.();
          },
        },
      },
      { collapsed: true },
    ),
  }));

  useEffect(() => {
    // `set` est typé sur les clés racine ; Leva résout aussi celles des dossiers.
    setRef.current = set as (values: Record<string, unknown>) => void;
  }, [set]);

  // Quitter l'onglet relâche la traction maintenue.
  useEffect(() => {
    return () => releaseFreeze(runtime);
  }, [runtime]);

  return null;
}
