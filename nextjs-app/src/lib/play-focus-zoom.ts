// ─── Adaptive focus zoom ───────────────────────────────────────────────────────
//  Desktop : le média focus mesure une fraction fixe de la largeur d'écran
//  (focusWidthFrac), centrée horizontalement sur focusCenterFrac (règle des
//  tiers par défaut — 1/3 — le panel occupe le reste à droite, voir
//  InfiniteCanvas.tsx's handleSelect pour le calcul de targetX correspondant).
//  Mobile : la card remplit toute la largeur de l'écran, en haut (panel dessous).
export const FOCUS_MIN_ZOOM = 0.85;
export const FOCUS_MAX_ZOOM = 12; // généreux — une card courte/paysage a besoin de
                                   // beaucoup de zoom pour remplir toute la hauteur

export function computeFocusZoom(
  worldW: number,
  worldH: number,
  vw: number,
  vh: number,
  mobile: boolean,
  intensity: number,
  widthFrac: number,
) {
  if (!mobile) {
    // Largeur cible fixe — le zoom en découle directement, pas de box-fit
    // hauteur/panel (le panel ne réserve plus d'espace dans ce calcul).
    const z = (widthFrac * vw) / worldW;
    return Math.max(FOCUS_MIN_ZOOM, Math.min(FOCUS_MAX_ZOOM, z));
  }
  // Mobile : la card remplit toute la largeur de l'écran (panel dessous) —
  // hauteur bornée par intensity, garde-fou pour les médias très hauts.
  const h = vh * 0.85 * intensity;
  const z = Math.min(h / worldH, vw / worldW);
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
