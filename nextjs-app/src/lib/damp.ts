// ─── Damp — shared exponential-lerp-toward-target helper ───────────────────────
//  Replaces the hand-rolled `x += (target - x) * factor` idiom, previously
//  reimplemented independently at every spring/lerp site across
//  useCardAnimation.ts, ArtifactMesh.tsx and CameraController.tsx — that
//  duplication is exactly what let MeshBody's and PlaceholderMesh's selection
//  springs silently diverge (see useCardAnimation.ts). Guard logic adjacent to
//  a call site (snap thresholds, early-exit branches, etc.) stays at the call
//  site — only the interpolation line itself moves here.

export function damp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

export function dampRef(
  ref: React.MutableRefObject<number>,
  target: number,
  factor: number,
): number {
  ref.current = damp(ref.current, target, factor);
  return ref.current;
}
