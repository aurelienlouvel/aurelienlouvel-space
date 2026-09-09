// ─── Adaptive focus zoom ───────────────────────────────────────────────────────
//  Au select, le zoom fait RENTRER la card dans une boîte cible (largeur/hauteur
//  max). Desktop : la card remplit toute la hauteur de l'écran, décalée à
//  gauche (panel à droite). Mobile : la card remplit toute la largeur de
//  l'écran, en haut (panel dessous).
export const FOCUS_MIN_ZOOM = 0.85;
export const FOCUS_MAX_ZOOM = 12; // généreux — une card courte/paysage a besoin de
                                   // beaucoup de zoom pour remplir toute la hauteur
export const PANEL_WIDTH  = 256; // ArtifactInfo est en w-64 fixe
export const PANEL_MARGIN = 24; // marge de respiration avec le bord droit de l'écran

//  Boîte cible : desktop PRIORISE la hauteur (h → toute la hauteur), mobile
//  PRIORISE la largeur (wMax → toute la largeur). L'autre axe n'est qu'un
//  garde-fou pour éviter qu'un média extrême (panorama / portrait très haut)
//  ne déborde. wMax desktop réserve la place du panel — même décalage
//  camOffsetX que celui utilisé dans handleSelect pour caler la caméra.
export function focusBox(
  vw: number,
  vh: number,
  mobile: boolean,
  intensity: number,
  camOffsetX: number,
  gapPanel: number,
) {
  const box = mobile
    ? { h: vh * 0.85, wMax: vw }
    : {
        h: vh,
        wMax: Math.max(
          vw * 0.35,
          vw + 2 * camOffsetX - 2 * (gapPanel + PANEL_WIDTH + PANEL_MARGIN),
        ),
      };
  return { h: box.h * intensity, wMax: box.wMax }; // intensity ne tempère que la hauteur
}

export function computeFocusZoom(
  worldW: number,
  worldH: number,
  vw: number,
  vh: number,
  mobile: boolean,
  intensity: number,
  camOffsetX: number,
  gapPanel: number,
) {
  const { h, wMax } = focusBox(vw, vh, mobile, intensity, camOffsetX, gapPanel);
  const z = Math.min(h / worldH, wMax / worldW); // axe prioritaire vs. garde-fou
  return Math.max(FOCUS_MIN_ZOOM, Math.min(FOCUS_MAX_ZOOM, z));
}

// ─── Mobile vertical framing clamp ──────────────────────────────────────────────
//  Mobile : la card peut remplir toute la largeur de l'écran, donc être bien
//  plus haute qu'avant — on la cale près du haut avec juste assez de marge
//  pour que son bord supérieur ne sorte jamais de l'écran (sinon plus moyen d'y
//  remonter : seul un clic en dehors fait sortir du focus, le scroll ne le
//  fait plus).
export const MOBILE_VFRAC_MIN = 0.3;
export const MOBILE_VFRAC_MAX = 0.5;
export const MOBILE_VFRAC_PADDING = 0.04;

export function computeMobileVFrac(halfHScreen: number, vh: number): number {
  return Math.max(
    MOBILE_VFRAC_MIN,
    Math.min(MOBILE_VFRAC_MAX, halfHScreen / vh + MOBILE_VFRAC_PADDING),
  );
}
