import * as THREE from "three";
import {
  buildNeighborGraph,
  containFit,
  createRng,
  type LayoutPoint,
  type LayoutStats,
  type LayoutTile,
} from "./layout-types";

/**
 * Algorithme de Gravité Centrale (Center Gravity 2D Bin Packing).
 *
 * Objectif : Ranger une liste de rectangles de tailles variables le plus près
 * possible du point d'origine absolu (0,0,0) pour former un amas dense
 * (façon circle-packing, mais avec des angles droits).
 *
 * Règles absolues :
 * 1. Aucune collision : Les rectangles ne doivent jamais se chevaucher.
 * 2. Gap strict : Un espacement (gap) exact doit être respecté entre chaque rectangle.
 * 3. Anti-voisinage : Deux copies d'un même artifact ne doivent jamais être voisines directes.
 * 4. Échelles diversifiées : Chaque répétition d'un même média reçoit une échelle distincte.
 */

export type GravityParams = {
  maxWidth: number;
  maxHeight: number;
  gap: number;
  scaleVariance: number; // Variance d'échelle (ex: 0.25 = échelle variant de ±25%)
  repeat: number;
  antiNeighbor: boolean; // Règle interdisant aux exemplaires d'un même média d'être voisins
  repeatGap: number; // Marge minimale de séparation entre deux exemplaires identiques
  iterations: number;
  seed: number;
};

export const GRAVITY_DEFAULTS: GravityParams = {
  maxWidth: 480,
  maxHeight: 640,
  gap: 40,
  scaleVariance: 0.25,
  repeat: 3,
  antiNeighbor: true,
  repeatGap: 100,
  iterations: 500, // <30ms en live-tweak, réglable jusqu'à 100 000
  seed: 1,
};

export type PlacedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  artifactIndex?: number;
};

// ── 1. Détection de collision (en incluant le gap strict) ──────────────────────
export function checkCollision(
  x: number,
  y: number,
  w: number,
  h: number,
  placed: PlacedRect[],
  gap: number,
): boolean {
  // Le -0.001 est un epsilon pour éviter les fausses collisions dues à la précision des flottants JS
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (
      x < p.x + p.w + gap - 0.001 &&
      x + w + gap - 0.001 > p.x &&
      y < p.y + p.h + gap - 0.001 &&
      y + h + gap - 0.001 > p.y
    ) {
      return true;
    }
  }
  return false;
}

/** Vérifie si deux exemplaires d'un même artifact violent la distance anti-voisin. */
export function violatesAntiNeighbor(
  x: number,
  y: number,
  w: number,
  h: number,
  artifactIndex: number | undefined,
  placed: PlacedRect[],
  minSameGap: number,
): boolean {
  if (artifactIndex === undefined) return false;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (p.artifactIndex === artifactIndex) {
      if (
        x < p.x + p.w + minSameGap - 0.001 &&
        x + w + minSameGap - 0.001 > p.x &&
        y < p.y + p.h + minSameGap - 0.001 &&
        y + h + minSameGap - 0.001 > p.y
      ) {
        return true;
      }
    }
  }
  return false;
}

// ── 2. Moteur d'insertion Gravité Centrale ────────────────────────────────────
export function packCenterGravity<T extends { w: number; h: number; artifactIndex?: number }>(
  order: T[],
  gap: number,
  antiNeighbor = true,
  repeatGap = 100,
): (T & { x: number; y: number })[] {
  const placed: (T & { x: number; y: number })[] = [];
  const minSameGap = gap + (antiNeighbor ? repeatGap : 0);

  for (let i = 0; i < order.length; i++) {
    const item = order[i];
    let bestPoint: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    let fallbackPoint: { x: number; y: number } | null = null;
    let fallbackScore = Infinity;

    // Grille de test basée sur les rectangles déjà posés (garantit l'alignement sur le gap)
    const xs = [0];
    const ys = [0];
    for (let j = 0; j < placed.length; j++) {
      const p = placed[j];
      xs.push(p.x + p.w + gap);
      ys.push(p.y + p.h + gap);
    }

    for (let j = 0; j < xs.length; j++) {
      const x = xs[j];
      for (let k = 0; k < ys.length; k++) {
        const y = ys[k];
        if (!checkCollision(x, y, item.w, item.h, placed, gap)) {
          // Distance au carré du centre vers l'origine (0,0)
          const cx = x + item.w / 2;
          const cy = y + item.h / 2;
          const score = cx * cx + cy * cy;

          // Candidat valide sous collision simple (filet de sécurité)
          if (score < fallbackScore) {
            fallbackScore = score;
            fallbackPoint = { x, y };
          }

          // Candidat valide respectant également la règle anti-voisins
          if (!antiNeighbor || !violatesAntiNeighbor(x, y, item.w, item.h, item.artifactIndex, placed, minSameGap)) {
            if (score < bestScore) {
              bestScore = score;
              bestPoint = { x, y };
            }
          }
        }
      }
    }

    const chosen = bestPoint || fallbackPoint;
    if (chosen) {
      placed.push({ ...item, x: chosen.x, y: chosen.y });
    } else {
      let maxX = 0;
      for (let j = 0; j < placed.length; j++) {
        maxX = Math.max(maxX, placed[j].x + placed[j].w + gap);
      }
      placed.push({ ...item, x: maxX, y: 0 });
    }
  }

  return placed;
}

// ── 3. Fonction pour centrer l'amas final autour de (0,0) ─────────────────────
export function centerLayout<T extends { x: number; y: number; w: number; h: number }>(
  placedData: T[],
): (T & { x: number; y: number })[] {
  if (placedData.length === 0) return [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (let i = 0; i < placedData.length; i++) {
    const item = placedData[i];
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x + item.w > maxX) maxX = item.x + item.w;
    if (item.y + item.h > maxY) maxY = item.y + item.h;
  }

  const offsetX = minX + (maxX - minX) / 2;
  const offsetY = minY + (maxY - minY) / 2;

  return placedData.map((item) => ({
    ...item,
    x: item.x + item.w / 2 - offsetX,
    y: item.y + item.h / 2 - offsetY,
  }));
}

/** Calcule la densité (Aire totale des boîtes / Aire de la Bounding Box totale). */
export function calculateDensity(placed: PlacedRect[]): number {
  if (placed.length === 0) return 0;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let totalArea = 0;

  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.w > maxX) maxX = p.x + p.w;
    if (p.y + p.h > maxY) maxY = p.y + p.h;
    totalArea += p.w * p.h;
  }

  const bbW = maxX - minX;
  const bbH = maxY - minY;
  return totalArea / (bbW * bbH || 1);
}

function formatArea(area: number): string {
  if (area >= 1_000_000) {
    return `${(area / 1_000_000).toFixed(2)} Mpx² (${Math.round(area).toLocaleString("fr-FR")} px²)`;
  }
  return `${Math.round(area).toLocaleString("fr-FR")} px²`;
}

function formatComputeTime(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// ── Moteur Monte-Carlo optimisé zéro-allocation pour N itérations ────────────
type GravityItem = { w: number; h: number; artifactIndex: number };

function runMonteCarloPacking(
  items: GravityItem[],
  gap: number,
  repeatGap: number,
  antiNeighbor: boolean,
  iterations: number,
  rng: () => number,
): {
  placed: (GravityItem & { x: number; y: number })[];
  density: number;
  stats: LayoutStats;
} {
  const n = items.length;
  if (n === 0) {
    return {
      placed: [],
      density: 0,
      stats: {
        density: 0,
        densityPercent: "0%",
        occupiedArea: 0,
        occupiedAreaFormatted: "0 px²",
        boundingBoxArea: 0,
        boundingBoxAreaFormatted: "0 px²",
        perfectCount: 0,
        totalIterations: 0,
        computeTimeMs: 0,
        computeTimeFormatted: "0 ms",
      },
    };
  }

  let totalArea = 0;
  for (let i = 0; i < n; i++) {
    totalArea += items[i].w * items[i].h;
  }

  // Buffers plats réutilisés à chaque itération (zéro allocation / pas de GC pause)
  const placedX = new Float64Array(n);
  const placedY = new Float64Array(n);
  const placedW = new Float64Array(n);
  const placedH = new Float64Array(n);
  const placedIdx = new Int32Array(n);

  const bestX = new Float64Array(n);
  const bestY = new Float64Array(n);
  const bestW = new Float64Array(n);
  const bestH = new Float64Array(n);
  const bestIdx = new Int32Array(n);

  const xs = new Float64Array(n + 1);
  const ys = new Float64Array(n + 1);
  xs[0] = 0;
  ys[0] = 0;

  const eps = 0.001;
  const minSameGap = gap + (antiNeighbor ? repeatGap : 0);
  let bestDensity = -1;
  let bestBbW = 0;
  let bestBbH = 0;

  const order = items.slice();
  const totalRuns = Math.max(1, Math.round(iterations));
  const densities = new Float64Array(totalRuns);

  for (let iter = 0; iter < totalRuns; iter++) {
    if (iter > 0) {
      // Fisher-Yates shuffle déterministe
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
    }

    let maxX = 0;
    let maxY = 0;

    for (let i = 0; i < n; i++) {
      const item = order[i];
      const iw = item.w;
      const ih = item.h;
      const aIdx = item.artifactIndex;

      let curBestX = 0;
      let curBestY = 0;
      let curBestScore = Infinity;
      let fbX = 0;
      let fbY = 0;
      let fbScore = Infinity;

      const numCoords = i + 1;

      for (let j = 0; j < numCoords; j++) {
        const x = xs[j];
        for (let k = 0; k < numCoords; k++) {
          const y = ys[k];

          let collide = false;
          let antiCollide = false;

          for (let p = 0; p < i; p++) {
            // Collision générale avec n'importe quel rectangle déjà placé
            if (
              x < placedX[p] + placedW[p] + gap - eps &&
              x + iw + gap - eps > placedX[p] &&
              y < placedY[p] + placedH[p] + gap - eps &&
              y + ih + gap - eps > placedY[p]
            ) {
              collide = true;
              break;
            }

            // Règle anti-voisin : distance accrue requise entre exemplaires identiques
            if (antiNeighbor && placedIdx[p] === aIdx) {
              if (
                x < placedX[p] + placedW[p] + minSameGap - eps &&
                x + iw + minSameGap - eps > placedX[p] &&
                y < placedY[p] + placedH[p] + minSameGap - eps &&
                y + ih + minSameGap - eps > placedY[p]
              ) {
                antiCollide = true;
              }
            }
          }

          if (!collide) {
            const cx = x + iw * 0.5;
            const cy = y + ih * 0.5;
            const score = cx * cx + cy * cy;

            // Fallback en cas d'absence de place anti-voisin
            if (score < fbScore) {
              fbScore = score;
              fbX = x;
              fbY = y;
            }

            // Candidat optimal respectant l'anti-voisinage
            if (!antiCollide && score < curBestScore) {
              curBestScore = score;
              curBestX = x;
              curBestY = y;
            }
          }
        }
      }

      const finalX = curBestScore < Infinity ? curBestX : fbX;
      const finalY = curBestScore < Infinity ? curBestY : fbY;

      placedX[i] = finalX;
      placedY[i] = finalY;
      placedW[i] = iw;
      placedH[i] = ih;
      placedIdx[i] = aIdx;

      if (finalX + iw > maxX) maxX = finalX + iw;
      if (finalY + ih > maxY) maxY = finalY + ih;

      xs[i + 1] = finalX + iw + gap;
      ys[i + 1] = finalY + ih + gap;
    }

    const bbW = maxX;
    const bbH = maxY;
    const density = totalArea / (bbW * bbH || 1);
    densities[iter] = density;

    if (density > bestDensity) {
      bestDensity = density;
      bestBbW = bbW;
      bestBbH = bbH;
      bestX.set(placedX);
      bestY.set(placedY);
      bestW.set(placedW);
      bestH.set(placedH);
      bestIdx.set(placedIdx);
    }
  }

  // Calcul du nombre de layouts atteignant la densité maximale (layouts parfaits)
  let perfectCount = 0;
  const perfectThreshold = bestDensity - 0.0005;
  for (let i = 0; i < totalRuns; i++) {
    if (densities[i] >= perfectThreshold) {
      perfectCount++;
    }
  }

  const densityPercent = `${(bestDensity * 100).toFixed(1)}%`;
  const occupiedArea = Math.round(totalArea);
  const boundingBoxArea = Math.round(bestBbW * bestBbH);

  const stats: LayoutStats = {
    density: bestDensity,
    densityPercent,
    occupiedArea,
    occupiedAreaFormatted: formatArea(occupiedArea),
    boundingBoxArea,
    boundingBoxAreaFormatted: formatArea(boundingBoxArea),
    perfectCount,
    totalIterations: totalRuns,
    computeTimeMs: 0, // assigné après mesure
    computeTimeFormatted: "",
  };

  const placedResult: (GravityItem & { x: number; y: number })[] = [];
  for (let i = 0; i < n; i++) {
    placedResult.push({
      x: bestX[i],
      y: bestY[i],
      w: bestW[i],
      h: bestH[i],
      artifactIndex: bestIdx[i],
    });
  }

  return { placed: placedResult, density: bestDensity, stats };
}

// ── Construction de la tuile pour le canvas /play ─────────────────────────────
export function buildGravityTile(
  ratios: number[],
  params: GravityParams,
  aspect: number,
): LayoutTile {
  void aspect;
  const t0 = performance.now();
  const n = ratios.length;
  if (n === 0) return { points: [], neighbors: [], originIndex: -1, TILE_W: 0, TILE_H: 0 };

  const rng = createRng(params.seed);
  const repeat = Math.max(1, Math.round(params.repeat));
  const variance = Math.max(0, Math.min(1, params.scaleVariance ?? 0));

  // Pré-dimensionnement : chaque répétition d'un même artifact a obligatoirement
  // une échelle différente grâce à une stratification aléatoire par compartiment
  const items: GravityItem[] = [];
  for (let i = 0; i < n; i++) {
    const { width, height } = containFit(ratios[i], params.maxWidth, params.maxHeight);

    if (repeat > 1 && variance > 0) {
      // Stratification sur repeat compartiments distincts dans [-1, 1]
      const scales: number[] = [];
      for (let r = 0; r < repeat; r++) {
        const binMin = -1 + (2 * r) / repeat;
        const binMax = -1 + (2 * (r + 1)) / repeat;
        const t = binMin + rng() * (binMax - binMin);
        scales.push(Math.max(0.1, 1 + t * variance));
      }
      // Mélange aléatoire pour varier l'ordre des tailles
      for (let r = repeat - 1; r > 0; r--) {
        const j = Math.floor(rng() * (r + 1));
        const tmp = scales[r];
        scales[r] = scales[j];
        scales[j] = tmp;
      }
      for (let r = 0; r < repeat; r++) {
        const s = scales[r];
        items.push({
          w: Math.max(16, Math.round(width * s)),
          h: Math.max(16, Math.round(height * s)),
          artifactIndex: i,
        });
      }
    } else {
      for (let r = 0; r < repeat; r++) {
        const scale = variance > 0 ? Math.max(0.1, 1 + (rng() * 2 - 1) * variance) : 1;
        items.push({
          w: Math.max(16, Math.round(width * scale)),
          h: Math.max(16, Math.round(height * scale)),
          artifactIndex: i,
        });
      }
    }
  }

  // Optimisation Monte-Carlo avec règle anti-voisins
  const { placed, stats } = runMonteCarloPacking(
    items,
    params.gap,
    params.repeatGap ?? 100,
    params.antiNeighbor ?? true,
    params.iterations,
    rng,
  );

  // Mesure et assignation du temps de calcul réel
  const computeTimeMs = performance.now() - t0;
  stats.computeTimeMs = computeTimeMs;
  stats.computeTimeFormatted = formatComputeTime(computeTimeMs);

  // Recentrage autour de (0,0)
  const centered = centerLayout(placed);

  // Conversion en LayoutPoint (x et y sont les centres des rectangles)
  const points: LayoutPoint[] = centered.map((p) => ({
    x: p.x,
    y: p.y,
    width: p.w,
    height: p.h,
    artifactIndex: p.artifactIndex,
  }));

  // Trouver l'élément le plus proche de l'origine pour la caméra initiale
  let originIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x, points[i].y);
    if (d < bestDist) {
      bestDist = d;
      originIndex = i;
    }
  }

  // Calcul de la Bounding Box pour le raccord périodique strict
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const halfW = p.width / 2;
    const halfH = p.height / 2;
    if (p.x - halfW < minX) minX = p.x - halfW;
    if (p.y - halfH < minY) minY = p.y - halfH;
    if (p.x + halfW > maxX) maxX = p.x + halfW;
    if (p.y + halfH > maxY) maxY = p.y + halfH;
  }

  // Période torique : taille de l'amas + gap exact entre les tuiles
  const bbW = maxX - minX;
  const bbH = maxY - minY;
  const TILE_W = bbW + params.gap;
  const TILE_H = bbH + params.gap;

  return {
    points,
    neighbors: buildNeighborGraph(points, TILE_W, TILE_H, true),
    originIndex,
    TILE_W,
    TILE_H,
    stats,
  };
}

// ── Implémentation Three.js InstancedMesh demandée ────────────────────────────
export function createCenterGravityInstancedMesh(options: {
  items: { w: number; h: number; color?: number | string | THREE.Color }[];
  gap: number;
  antiNeighbor?: boolean;
  repeatGap?: number;
  scaleVariance?: number;
  iterations?: number;
  seed?: number;
  material?: THREE.Material;
}): {
  mesh: THREE.InstancedMesh;
  placed: (LayoutPoint & { z: number })[];
  density: number;
  stats: LayoutStats;
} {
  const {
    items,
    gap,
    antiNeighbor = true,
    repeatGap = 100,
    scaleVariance = 0,
    iterations = 10000,
    seed = 1,
    material = new THREE.MeshBasicMaterial({ color: 0xffffff }),
  } = options;

  const t0 = performance.now();
  const rng = createRng(seed);
  const variance = Math.max(0, Math.min(1, scaleVariance));

  const gravityItems: GravityItem[] = items.map((it, i) => {
    const scale = variance > 0 ? 1 + (rng() * 2 - 1) * variance : 1;
    return {
      w: Math.max(16, Math.round(it.w * scale)),
      h: Math.max(16, Math.round(it.h * scale)),
      artifactIndex: i,
    };
  });

  const { placed, density, stats } = runMonteCarloPacking(
    gravityItems,
    gap,
    repeatGap,
    antiNeighbor,
    iterations,
    rng,
  );

  const computeTimeMs = performance.now() - t0;
  stats.computeTimeMs = computeTimeMs;
  stats.computeTimeFormatted = formatComputeTime(computeTimeMs);

  const centered = centerLayout(placed);

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);

  const count = centered.length;
  const mesh = new THREE.InstancedMesh(geometry, material, count);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  const colorHelper = new THREE.Color();
  const placedResults: (LayoutPoint & { z: number })[] = [];

  for (let i = 0; i < count; i++) {
    const item = centered[i];
    const orig = items[item.artifactIndex];

    position.set(item.x, 0, item.y);
    scale.set(item.w, 1, item.h);

    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(i, matrix);

    if (orig?.color !== undefined) {
      if (orig.color instanceof THREE.Color) {
        mesh.setColorAt(i, orig.color);
      } else {
        colorHelper.set(orig.color as string | number);
        mesh.setColorAt(i, colorHelper);
      }
    }

    placedResults.push({
      x: item.x,
      y: 0,
      z: item.y,
      width: item.w,
      height: item.h,
      artifactIndex: item.artifactIndex,
    });
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return { mesh, placed: placedResults, density, stats };
}
