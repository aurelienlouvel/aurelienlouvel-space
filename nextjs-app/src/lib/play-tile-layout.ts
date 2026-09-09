import type { ArtifactCanvasItem } from "@/sanity/queries";
import { CARD_W, CARD_H, getCardHeight } from "./artifact-utils";
import type { Params } from "./play-params";

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Bell-ish distribution in [scaleMin, scaleMax]
export function cardScale(i: number, scaleMin: number, scaleMax: number): number {
  const r = seededRand(i * 13 + 7);
  let t: number;
  if (r < 0.12) t = 0.0;
  else if (r < 0.3) t = 0.25;
  else if (r < 0.62) t = 0.5;
  else if (r < 0.84) t = 0.75;
  else t = 1.0;
  return scaleMin + t * (scaleMax - scaleMin);
}

// ─── Tile builder ─────────────────────────────────────────────────────────────
//
//  Neighbour constraint — toroidal 8-connected coloring:
//
//    Pass 1 (byDist, centre→edge):
//      Each slot blocks artifact indices already assigned to any of its
//      8 wrap-around grid neighbours (toroidal = cross-tile seam aware).
//      Processes center-to-edge so unique artifacts land near the origin.
//
//    Pass 2 (post-process, up to 4 iterations):
//      Scan all slots; any slot still conflicting with a wrap-around neighbour
//      is reassigned to an artifact not used by ANY of its 8 neighbours.
//      Repeats until clean or max iterations reached (handles the cases
//      where both seam slots were unassigned when the other was processed).
//
export function buildTile(artifacts: ArtifactCanvasItem[], p: Params) {
  const {
    cols: COLS,
    gapX: GAP_X,
    gapY: GAP_Y,
    colStagger: COL_STAGGER,
    jitterX: JITTER_X,
    jitterY: JITTER_Y,
    colRhythm: COL_RHYTHM,
    minPerTile: MIN_PER_TILE,
    scaleMin,
    scaleMax,
  } = p;

  const n = Math.max(MIN_PER_TILE, artifacts.length);
  const rows = Math.ceil(n / COLS);

  // Golden-angle column rhythm — de-uniforms column width so the grid stops
  // reading as a repeating lattice. Bounded to [0.65, 1.35]x GAP_X at
  // colRhythm=1, always well above JITTER_X → never overlaps (see plan).
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const colGapMul = (c: number) =>
    1 + COL_RHYTHM * 0.35 * Math.sin(c * GOLDEN_ANGLE);
  const colX = [0];
  for (let c = 1; c <= COLS; c++) {
    colX[c] = colX[c - 1] + CARD_W + GAP_X * colGapMul(c - 1);
  }
  const TILE_W = colX[COLS];

  const stagger = Array.from(
    { length: COLS },
    (_, c) => seededRand(c * 97 + 13) * COL_STAGGER,
  );

  const cssPos = Array.from({ length: n }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      x: colX[col] + (seededRand(i * 7 + 1) - 0.5) * JITTER_X * 2,
      y:
        row * (CARD_H + GAP_Y) +
        stagger[col] +
        (seededRand(i * 7 + 2) - 0.5) * JITTER_Y * 2,
    };
  });

  // Positions approx. (CARD_H pour tous) — uniquement pour le tri centre→bord
  const approxCx = cssPos.reduce((s, q) => s + q.x + CARD_W / 2, 0) / n;
  const approxCy = cssPos.reduce((s, q) => s + q.y + CARD_H / 2, 0) / n;
  const approxPos: [number, number][] = cssPos.map((q) => [
    q.x + CARD_W / 2 - approxCx,
    -(q.y + CARD_H / 2 - approxCy),
  ]);

  const byDist = approxPos
    .map((pos, i) => ({ i, d: Math.hypot(pos[0], pos[1]) }))
    .sort((a, b) => a.d - b.d);

  // Seeded Fisher-Yates shuffle
  const shuffled = Array.from({ length: artifacts.length }, (_, i) => i);
  for (let j = shuffled.length - 1; j > 0; j--) {
    const k = Math.floor(seededRand(j * 31 + 11) * (j + 1));
    [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
  }

  const colOf = (i: number) => i % COLS;
  const rowOf = (i: number) => Math.floor(i / COLS);
  // Toroidal wrap — makes the tile tileable; cross-seam neighbours are visible
  const slotW = (c: number, r: number): number =>
    (((r % rows) + rows) % rows) * COLS + (((c % COLS) + COLS) % COLS);

  const allIdx = Array.from({ length: artifacts.length }, (_, k) => k);
  const assignment: number[] = new Array(n).fill(-1);

  // ── Pass 1: centre-to-edge greedy assignment ───────────────────────────────
  byDist.forEach(({ i: si }, rank) => {
    const col = colOf(si);
    const row = rowOf(si);

    const blocked = new Set<number>();
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const ni = slotW(col + dc, row + dr);
        if (ni !== si && assignment[ni] !== -1) blocked.add(assignment[ni]);
      }
    }

    const pool = allIdx.filter((k) => !blocked.has(k));
    const candidates = pool.length > 0 ? pool : allIdx;

    if (rank < artifacts.length && candidates.includes(shuffled[rank])) {
      assignment[si] = shuffled[rank];
    } else {
      assignment[si] =
        candidates[
          Math.floor(seededRand(si * 23 + rank * 11 + 5) * candidates.length)
        ];
    }
  });

  // ── Pass 2: fix remaining seam conflicts (up to 4 sweeps) ─────────────────
  for (let sweep = 0; sweep < 4; sweep++) {
    let anyFixed = false;

    for (let si = 0; si < n; si++) {
      const col = colOf(si);
      const row = rowOf(si);

      // Collect all neighbour artifacts (toroidal)
      const neighborArtifacts = new Set<number>();
      let hasConflict = false;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!dc && !dr) continue;
          const ni = slotW(col + dc, row + dr);
          if (ni === si) continue;
          const a = assignment[ni];
          neighborArtifacts.add(a);
          if (a === assignment[si]) hasConflict = true;
        }
      }

      if (!hasConflict) continue;

      const candidates = allIdx.filter((k) => !neighborArtifacts.has(k));
      if (candidates.length > 0) {
        assignment[si] =
          candidates[
            Math.floor(seededRand(si * 41 + sweep * 23 + 7) * candidates.length)
          ];
        anyFixed = true;
      }
    }

    if (!anyFixed) break;
  }

  // Hauteurs réelles par slot — connues seulement après assignation
  const slotH = Array.from({ length: n }, (_, i) =>
    getCardHeight(artifacts[assignment[i]]),
  );

  // ── Empilement masonry par colonne ──────────────────────────────────────────
  //  Chaque colonne empile ses cards avec un écart vertical ≥ GAP_Y, calculé sur
  //  les hauteurs RÉELLES → plus aucune paire trop proche, quels que soient les
  //  ratios. JITTER_Y ajoute une variation organique (toujours ≥ 0 → l'écart
  //  minimum reste homogène). TILE_H = colonne la plus haute → au raccord de
  //  tuilage l'écart est ≥ GAP_Y, jamais de chevauchement.
  const centerY = new Array<number>(n).fill(0);
  const cursor = stagger.slice(); // bord haut courant par colonne
  for (let i = 0; i < n; i++) {
    const c = i % COLS;
    centerY[i] = cursor[c] + slotH[i] / 2;
    cursor[c] += slotH[i] + GAP_Y + seededRand(i * 7 + 2) * JITTER_Y;
  }
  const TILE_H = Math.max(...cursor.map((b, c) => b - stagger[c]));

  // Centrage du pavé (origine ≈ centre de masse)
  const cx = cssPos.reduce((s, q) => s + q.x + CARD_W / 2, 0) / n;
  const cy = centerY.reduce((s, y) => s + y, 0) / n;
  const positions: [number, number][] = cssPos.map((q, i) => [
    q.x + CARD_W / 2 - cx,
    -(centerY[i] - cy),
  ]);

  const items = Array.from({ length: n }, (_, i) => ({
    item: artifacts[assignment[i]],
    key: `${artifacts[assignment[i]]._id}-${i}`,
    scale: cardScale(i, scaleMin, scaleMax),
    cardH: slotH[i],
  }));

  return { items, positions, TILE_W, TILE_H };
}

export type TileLayout = ReturnType<typeof buildTile>;

// Approximate min/max visual gap between adjacent card edges
export function gapStats(p: Params) {
  const cellW = CARD_W + p.gapX;
  return {
    minGapX: Math.round(cellW - 2 * p.jitterX - CARD_W * p.scaleMax),
    maxGapX: Math.round(cellW + 2 * p.jitterX - CARD_W * p.scaleMin),
    minGapY: Math.round(p.gapY), // masonry : écart vertical direct
    maxGapY: Math.round(p.gapY + p.jitterY), // + variation organique (≥ 0)
  };
}
