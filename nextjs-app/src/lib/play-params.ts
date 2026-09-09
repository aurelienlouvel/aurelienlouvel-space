// ─── Tunable params ────────────────────────────────────────────────────────────
//
//  All knobs live in one object.  Tweakpane (dev only) writes directly to a
//  MutableRefObject<Params> — zero React re-renders for real-time sliders.
//  Layout params (cols / gaps / jitter / scale) call onLayoutChange() → tileVersion++
//  → buildTile recomputes.  Camera / visual params are read every frame from the ref.
//
export type Params = {
  // ── Tile layout (change → tile rebuild) ─────────────────────────────────────
  cols: number; // grid columns
  gapX: number; // extra px between cols  (cell_w = CARD_W + gapX)
  gapY: number; // extra px between rows  (cell_h = CARD_H + gapY)
  colStagger: number; // random vertical offset per column (px)
  jitterX: number; // ±px random horizontal nudge per item
  jitterY: number; // ±px random vertical nudge per item
  colRhythm: number; // 0–1 : golden-angle column-width oscillation (destructures the grid)
  minPerTile: number; // min slot count per tile
  scaleMin: number; // smallest card scale
  scaleMax: number; // largest  card scale
  // ── Camera (live — no rebuild) ───────────────────────────────────────────────
  camOffsetX: number; // camera shifts right on focus (card left, panel fits right)
  focusVCenter: number; // vertical position of focused item (0=top · 0.5=center · 1=bottom)
  focusZoomIntensity: number; // 0–1, scales how much the focus box zooms in
  // ── Card decoration (live — read every frame) ────────────────────────────────
  rotMax: number; // max card tilt, degrees (idle — straightens to 0 on focus, never animated otherwise)
  bracketRadius: number; // corner-bracket bend rounding, world units
  // ── Info panel (live) ────────────────────────────────────────────────────────
  gapPanel: number; // px gap between card right edge and info panel
  // ── Background dots (live — uniform update in useFrame) ──────────────────────
  gridCell: number; // world-space dot grid cell size
  dotRadius: number; // dot radius in world units
  // ── Ripple (live — uniform update in useFrame) ───────────────────────────────
  rippleSpeed: number; // ring expansion speed, world units/s
  rippleDuration: number; // ring lifetime, seconds
  ripplePixel: number; // pixel-art quantization size, world units
  rippleWidth: number; // ring thickness, world units
};

export const DEFAULT_PARAMS: Params = {
  cols: 4,
  gapX: 380,
  gapY: 220, // masonry : écart vertical CONSTANT entre cards (sur hauteurs réelles)
  colStagger: 200,
  jitterX: 30,
  jitterY: 90, // variation verticale ORGANIQUE en plus (toujours ≥ 0)
  colRhythm: 0.5,
  minPerTile: 40,
  scaleMin: 0.8,
  scaleMax: 1.15,
  camOffsetX: 220,
  focusVCenter: 0.5,
  focusZoomIntensity: 1,
  rotMax: 2, // ±~2°
  bracketRadius: 16,
  gapPanel: 80,
  gridCell: 64,
  dotRadius: 2.0,
  rippleSpeed: 120,
  rippleDuration: 0.18,
  ripplePixel: 4,
  rippleWidth: 3,
};

// ─── Responsive layout ─────────────────────────────────────────────────────────
//  Mobile (≤768px) : grille verticale (1 colonne) — feed qu'on scrolle de haut
//  en bas. Desktop : masonry multi-colonnes (defaults ci-dessus).
export const MOBILE_BREAKPOINT = 768;
const MOBILE_LAYOUT: Partial<Params> = {
  cols: 1,
  gapX: 210,
  gapY: 165,
  colStagger: 0,
  jitterX: 20,
  jitterY: 70,
  scaleMin: 0.8,
  scaleMax: 1.0,
};
const LAYOUT_KEYS = [
  "cols",
  "gapX",
  "gapY",
  "colStagger",
  "jitterX",
  "jitterY",
  "colRhythm",
  "scaleMin",
  "scaleMax",
] as const;

// ─── Saved param overrides (localStorage) ──────────────────────────────────────
//  "save as default" in the debug pane persists the tuned Params here — read
//  once at module load so both the initial paramsRef and every later
//  applyResponsiveLayout() call (breakpoint crossings) honour it.
//  Exposed via getSavedParamOverrides()/saveParamOverrides()/clearParamOverrides()
//  instead of a raw exported `let` — DebugPane (a different module) needs to
//  write this, and ESM only allows a module to reassign its own bindings.
const PARAMS_STORAGE_KEY = "ore-play-params";
let _savedParamOverrides: Partial<Params> = {};
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(PARAMS_STORAGE_KEY);
    if (raw) _savedParamOverrides = JSON.parse(raw);
  } catch {
    _savedParamOverrides = {};
  }
}

export function getSavedParamOverrides(): Partial<Params> {
  return _savedParamOverrides;
}

export function saveParamOverrides(p: Params): void {
  _savedParamOverrides = { ...p };
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(_savedParamOverrides));
  } catch { /* best-effort */ }
}

export function clearParamOverrides(): void {
  _savedParamOverrides = {};
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PARAMS_STORAGE_KEY);
  } catch { /* best-effort */ }
}

export function applyResponsiveLayout(p: Params, mobile: boolean) {
  const src = mobile
    ? { ...DEFAULT_PARAMS, ...MOBILE_LAYOUT, ..._savedParamOverrides }
    : { ...DEFAULT_PARAMS, ..._savedParamOverrides };
  for (const k of LAYOUT_KEYS) p[k] = src[k];
}
