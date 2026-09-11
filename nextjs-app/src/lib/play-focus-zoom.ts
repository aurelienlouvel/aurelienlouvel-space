// ─── Adaptive focus zoom ───────────────────────────────────────────────────────
//  One box-fit function used by both desktop and mobile — the caller (currently
//  InfiniteCanvas's handleSelect) supplies the target box for its own device:
//    Desktop : fixed width fraction of the viewport (boxW), unconstrained
//              height (boxH = Infinity) — the media's width alone drives the
//              zoom, the panel takes the remaining space to the right.
//    Mobile  : full viewport width (boxW = vw) AND a height cap (boxH),
//              whichever constraint binds first wins — the panel sits below.
export const FOCUS_MIN_ZOOM = 0.85;
export const FOCUS_MAX_ZOOM = 12; // généreux — une card courte/paysage a besoin de
                                   // beaucoup de zoom pour remplir toute la hauteur

/**
 * Largest zoom that fits a worldW×worldH media inside a boxW×boxH box. Pass
 * boxH = Infinity for an unconstrained dimension (desktop's width-only fit).
 */
export function computeFocusZoom(
  worldW: number,
  worldH: number,
  boxW: number,
  boxH: number,
): number {
  const z = Math.min(boxW / worldW, boxH / worldH);
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
