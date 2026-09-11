import * as THREE from "three";

// ─── Canvas-generated card textures ───────────────────────────────────────────
//  Two small procedural alpha maps shared by GridCard.tsx and GalleryStack.tsx:
//  a rounded-rect mask every media plane uses, and a corner-bracket stroke used
//  by GridCard's hover/selection decoration. Both are pure functions of their
//  size (+ radius, for brackets) — cached by that key so the 9 toroidal tile
//  copies (and every gallery loop-copy) share one canvas/texture instead of
//  regenerating it per instance.
const SS = 3; // supersampling factor — smooth anti-aliased edges

// ─── Rounded-corner alpha mask ────────────────────────────────────────────────
const CARD_RADIUS = 24;
// Keyed by "w_h" (not just h) — every call site used to pass a constant
// reference w (CARD_W), so caching by h alone was safe; the gallery's items
// vary w per item too (row layout: fixed height, variable width), so an
// h-only key would collide two different-aspect items onto the same cached
// mask and stretch its rounded corners.
const _alphaCache = new Map<string, THREE.Texture>();

export function getRoundedAlpha(w: number, h: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = `${Math.round(w)}_${Math.round(h)}`;
  if (_alphaCache.has(key)) return _alphaCache.get(key)!;

  const canvas = document.createElement("canvas");
  canvas.width  = w * SS;
  canvas.height = h * SS;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SS, SS);

  const r = CARD_RADIUS;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter       = THREE.LinearFilter;
  tex.magFilter       = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _alphaCache.set(key, tex);
  return tex;
}

// ─── Corner-bracket stroke ────────────────────────────────────────────────────
//  Four L-shaped corner brackets (tool-UI style) drawn as a stroke alpha map —
//  see GridCard.tsx's CornerBrackets for how the arm length (ARM) and stroke
//  thickness (TH) relate to the canvas size this bakes.
const ARM = 28; // arm length in world units — must match CornerBrackets' ARM
const TH  = 2.0; // stroke thickness — must match CornerBrackets' TH

// Cache keyed by "cw_ch_radius" to handle different card proportions + the
// live-tunable bracketRadius debug slider.
const _bracketCache = new Map<string, THREE.Texture>();

export function getBracketTexture(cw: number, ch: number, radius: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = `${Math.round(cw)}_${Math.round(ch)}_${radius}`;
  if (_bracketCache.has(key)) return _bracketCache.get(key)!;

  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(cw) * SS;
  canvas.height = Math.round(ch) * SS;
  const ctx     = canvas.getContext("2d")!;
  ctx.scale(SS, SS);

  ctx.fillStyle = "#000000";  // transparent in alphaMap
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = "#ffffff"; // opaque in alphaMap
  ctx.lineWidth   = TH;
  ctx.lineCap     = "square";  // clean arm ends

  // Inset half-stroke so lines stay fully within canvas bounds
  const o = TH / 2;

  // Four L-brackets with a softly rounded bend — minimal, tool-UI style
  ctx.beginPath(); ctx.moveTo(ARM, o);       ctx.arcTo(o,    o,    o,    ARM,    radius); ctx.lineTo(o,    ARM);    ctx.stroke(); // TL
  ctx.beginPath(); ctx.moveTo(cw-ARM, o);    ctx.arcTo(cw-o, o,    cw-o, ARM,    radius); ctx.lineTo(cw-o, ARM);    ctx.stroke(); // TR
  ctx.beginPath(); ctx.moveTo(ARM, ch-o);    ctx.arcTo(o,    ch-o, o,    ch-ARM, radius); ctx.lineTo(o,    ch-ARM); ctx.stroke(); // BL
  ctx.beginPath(); ctx.moveTo(cw-ARM, ch-o); ctx.arcTo(cw-o, ch-o, cw-o, ch-ARM, radius); ctx.lineTo(cw-o, ch-ARM); ctx.stroke(); // BR

  const tex = new THREE.CanvasTexture(canvas);
  // Mesh is routinely shown minified (scaled down from the max-gap bake size
  // toward OFF_NEAR/OFF_FOCUS, further shrunk at low camera zoom) — mipmaps
  // keep the curved stroke crisp instead of shimmering/blurring at a distance.
  tex.minFilter       = THREE.LinearMipmapLinearFilter;
  tex.magFilter       = THREE.LinearFilter;
  tex.generateMipmaps = true;
  _bracketCache.set(key, tex);
  return tex;
}
