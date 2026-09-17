/**
 * Types et utilitaires partagés par les algorithmes de mise en page du
 * canvas /play (`scatter-layout.ts`, `blue-noise-layout.ts`,
 * `relaxation-layout.ts`) : la forme d'un point, celle d'une tuile complète,
 * le gabarit "contain", le graphe de plus proches voisins, l'index spatial
 * torique et le générateur pseudo-aléatoire déterministe.
 *
 * Vivait avant sous une forme plus riche, du temps où trois algorithmes
 * (scatter, masonry, cloud) se partageaient ces types et un jeu de
 * paramètres globaux (`GlobalLayoutParams`) — supprimés avec eux au profit
 * d'un seul algorithme (passé depuis par une variante en ellipse, cf.
 * historique git, puis par une grille). Ce qui reste ici n'a rien de
 * spécifique à un algorithme en particulier — `createSpatialIndex` vient
 * d'y rejoindre le lot pour la même raison : `blue-noise-layout.ts` et
 * `relaxation-layout.ts` en ont chacun besoin, sans rapport avec leur
 * stratégie de pose propre.
 */

/**
 * Nombre de voisins conservés par point, au-delà de `neighborK` : la marge
 * sert à la recherche directionnelle des flèches (cf. `PlayCanvas`) quand le
 * voisinage proche est creux dans la direction demandée.
 */
export const NEIGHBOR_CAP = 16;

export type LayoutPoint = {
  x: number;
  y: number;
  width: number;
  height: number;
  artifactIndex: number;
};

export type NeighborEntry = { index: number; dx: number; dy: number };

export type LayoutStats = {
  density: number;
  densityPercent: string;
  occupiedArea: number;
  occupiedAreaFormatted: string;
  boundingBoxArea: number;
  boundingBoxAreaFormatted: string;
  perfectCount: number;
  totalIterations: number;
  computeTimeMs: number;
  computeTimeFormatted: string;
};

export type LayoutTile = {
  points: LayoutPoint[];
  /** `neighbors[i]`, trié du plus proche au plus loin, jusqu'à `NEIGHBOR_CAP`. */
  neighbors: NeighborEntry[][];
  /** Index du point épinglé à l'origine. -1 si `points` est vide. */
  originIndex: number;
  TILE_W: number;
  TILE_H: number;
  stats?: LayoutStats;
};

/**
 * Contient `ratio` (largeur / hauteur) dans une boîte `maxWidth` ×
 * `maxHeight`, en gardant la dimension qui butte la première.
 */
export function containFit(
  ratio: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width, height };
}

/**
 * Distance minimale entre deux coordonnées séparées de `d` sur un axe de
 * période `size` : l'image la plus proche parmi toutes les répétitions
 * périodiques (cf. tuilage 3×3 dans `ArtifactGrid`) plutôt que `d` brut.
 */
export function wrappedDelta(d: number, size: number): number {
  return d - size * Math.round(d / size);
}

/**
 * Efficacité de remplissage supposée entre la surface "rectangles + demi-gap"
 * ci-dessous et la surface réellement nécessaire : aucun algorithme de ce
 * dossier ne pratique un pavage parfait (des rectangles de tailles et
 * proportions variées, posés par un processus organique plutôt qu'un
 * empileur dédié, ne peuvent de toute façon jamais paver un plan à 100%) —
 * calée empiriquement via `/tmp/play-verify-organic.ts` (mesure de l'écart
 * réel moyen au plus proche voisin, cf. historique) pour retomber autour
 * d'une petite fois `gap` plutôt que plusieurs fois comme avec l'ancienne
 * heuristique de grille au pire cas encore utilisée par
 * `blue-noise-layout.ts`. Volontairement basée sur la surface RECTANGLE
 * (`width`×`height`) et non sur un disque englobant (`hypot(width,height)/2`)
 * : ce dernier proxy, correct pour des tests de collision entre DEUX pièces
 * (cf. `minDist`), surestime largement la vraie surface occupée par une pièce
 * isolée dès qu'elle est allongée (jusqu'à 2× pour un ratio 2:1) — biais qui
 * se serait cumulé sur l'ensemble des pièces et aurait annulé une bonne part
 * du resserrement recherché ici.
 */
const CANVAS_PACKING_EFFICIENCY = 1.5;

/**
 * Dimensionne un canevas torique sur la vraie surface occupée par des pièces
 * déjà dimensionnées (`sized`), plutôt que sur un gabarit au pire cas
 * (`maxWidth`×`maxHeight` pour chacune, l'ancienne heuristique de grille
 * abandonnée depuis par les trois algorithmes organiques, cf. leur
 * historique). Cette dernière laissait systématiquement un canevas 2 à 10×
 * plus grand que nécessaire dès que `containFit` et/ou un facteur d'échelle
 * < 1 réduisaient la taille réelle sous le gabarit maximal — un canevas
 * surdimensionné laisse de la place inutilisée que rien ne répartit
 * uniformément derrière, cause directe d'un espacement hétérogène (mesuré :
 * voir le commentaire de tête de `relaxation-layout.ts`).
 *
 * Modèle : chaque pièce occupe un rectangle exclusif `(width+gap)` ×
 * `(height+gap)` (la pièce elle-même, plus un demi-`gap` de marge de chaque
 * côté) sommé sur toutes les pièces puis gonflé par
 * `CANVAS_PACKING_EFFICIENCY` pour tenir compte du fait qu'aucun algorithme
 * ici n'empile parfaitement. Utilisé par les trois algorithmes organiques
 * (`blue-noise-layout.ts`, `relaxation-layout.ts`, `lloyd-layout.ts`) : les
 * trois ont de toute façon besoin d'un filet d'agrandissement si le départ
 * s'avère trop juste (best-candidate qui ne trouve plus de marge positive,
 * répulsion/Lloyd qui ne convergent pas dans le budget d'itérations), donc
 * rien ne justifiait de garder `blue-noise-layout.ts` sur l'ancienne
 * heuristique de grille au pire cas une fois celle-ci identifiée comme cause
 * directe d'un espacement mesuré beaucoup trop large (cf. son historique).
 */
export function computeContentCanvas(
  sized: { width: number; height: number }[],
  gap: number,
  aspect: number,
): { W: number; H: number } {
  const totalArea = sized.reduce((sum, s) => sum + (s.width + gap) * (s.height + gap), 0);
  const packedArea = totalArea / CANVAS_PACKING_EFFICIENCY;
  const W = Math.sqrt(packedArea * aspect);
  const H = Math.sqrt(packedArea / aspect);
  return { W: Math.max(1, W), H: Math.max(1, H) };
}

/**
 * Graphe des k plus proches voisins de chaque point.
 *
 * `toroidal` bascule entre distance directe et distance torique
 * (`wrappedDelta`) — tous les algorithmes de ce dossier sont périodiques par
 * construction (ils se raccordent au tuilage 3×3, cf. `ArtifactGrid`), donc
 * toujours appelés avec `toroidal: true`. Seul un futur algorithme non
 * périodique aurait besoin de `false`.
 *
 * O(n²) — sans conséquence pour les quelques dizaines à centaines de points
 * d'une tuile.
 */
export function buildNeighborGraph(
  points: { x: number; y: number }[],
  tileW: number,
  tileH: number,
  toroidal: boolean,
): NeighborEntry[][] {
  function wrapped(d: number, size: number): number {
    return toroidal ? wrappedDelta(d, size) : d;
  }

  const n = points.length;
  return points.map((p, i) => {
    const entries: NeighborEntry[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = wrapped(points[j].x - p.x, tileW);
      const dy = wrapped(points[j].y - p.y, tileH);
      entries.push({ index: j, dx, dy });
    }
    entries.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
    return entries.slice(0, Math.min(NEIGHBOR_CAP, entries.length));
  });
}

export type SpatialIndex = {
  insert(index: number, x: number, y: number): void;
  /**
   * Tous les points déjà insérés dans les 9 cellules autour de `(x, y)`
   * (cellule incluse), avec leur delta torique DEPUIS `(x, y)` — jamais plus
   * loin que `cellSize` en valeur absolue sur chaque axe. Ne filtre sur
   * aucune distance : à l'appelant de décider ce qui compte comme "trop
   * proche" (cf. `minDist`, pondéré par artifact, dans `blue-noise-layout.ts`
   * et `relaxation-layout.ts`).
   */
  queryNearby(x: number, y: number): { index: number; dx: number; dy: number }[];
};

/**
 * Index spatial torique à cellule fixe, partagé par les deux algorithmes
 * organiques (`blue-noise-layout.ts`, `relaxation-layout.ts`) : la seule
 * requête dont ils ont besoin est "quels points déjà posés peuvent être en
 * conflit avec cette position ?", jamais une comparaison à tous les points
 * déjà posés (cf. leur commentaire de tête respectif).
 *
 * `cellSize` doit majorer toute distance minimale exigée entre deux points
 * (somme des rayons + gap, au pire) : c'est ce qui garantit qu'un point en
 * conflit potentiel avec `(x, y)` se trouve forcément dans l'une des 9
 * cellules autour d'elle, jamais plus loin — argument standard du hashing
 * spatial à cellule fixe, dès lors que la cellule majore le rayon de
 * recherche.
 */
export function createSpatialIndex(tileW: number, tileH: number, cellSize: number): SpatialIndex {
  const safeCellSize = cellSize > 0 ? cellSize : 1;
  // `floor` (jamais `ceil`), et la largeur de cellule réellement utilisée
  // ensuite est la division EXACTE `tileW / cols` — jamais `cellSize` brut.
  // Avec `ceil`, la dernière cellule de chaque axe serait plus étroite que
  // les autres dès que `tileW` n'est pas un multiple exact de `cellSize`
  // (le cas courant) : au raccord torique, un point pourtant à moins de
  // `cellSize` de la limite peut alors tomber dans une cellule que la
  // recherche 3×3 ci-dessous ne visite pas — l'argument "9 cellules autour
  // suffisent" exige une largeur de cellule constante et >= `cellSize`
  // partout, y compris à la couture. `floor` (clampé à 1) donne au contraire
  // des cellules toutes égales et toutes >= `cellSize`, quitte à en avoir
  // moins.
  const cols = Math.max(1, Math.floor(tileW / safeCellSize));
  const rows = Math.max(1, Math.floor(tileH / safeCellSize));
  const cellW = tileW / cols;
  const cellH = tileH / rows;
  const buckets = new Map<string, number[]>();
  const positions: { x: number; y: number }[] = [];

  function cellOf(x: number, y: number) {
    const cx = (((Math.floor(x / cellW) % cols) + cols) % cols);
    const cy = (((Math.floor(y / cellH) % rows) + rows) % rows);
    return { cx, cy };
  }

  return {
    insert(i, x, y) {
      positions[i] = { x, y };
      const { cx, cy } = cellOf(x, y);
      const key = `${cx},${cy}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(i);
      else buckets.set(key, [i]);
    },
    queryNearby(x, y) {
      const { cx, cy } = cellOf(x, y);
      // Dédoublonne les cellules visitées : quand `cols` ou `rows` vaut 1 ou
      // 2 (canevas plus étroit que `cellSize`, cf. plus haut), plusieurs
      // décalages `ox`/`oy` retombent sur la même cellule une fois le modulo
      // appliqué — sans ce filtre un même point déjà posé serait rendu
      // plusieurs fois, ce qui fausserait une somme de poussées (cf.
      // `relaxation-layout.ts`) même si ça ne change rien à un minimum (cf.
      // `blue-noise-layout.ts`).
      const seen = new Set<string>();
      const result: { index: number; dx: number; dy: number }[] = [];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const ncx = ((cx + ox) % cols + cols) % cols;
          const ncy = ((cy + oy) % rows + rows) % rows;
          const key = `${ncx},${ncy}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const bucket = buckets.get(key);
          if (!bucket) continue;
          for (const i of bucket) {
            const p = positions[i];
            result.push({
              index: i,
              dx: wrappedDelta(p.x - x, tileW),
              dy: wrappedDelta(p.y - y, tileH),
            });
          }
        }
      }
      return result;
    },
  };
}

/**
 * Hash bon marché mais stable par construction : deux appels avec le même
 * `n` rendent toujours la même valeur, d'une visite à l'autre. Repris du tout
 * premier `scatter-layout.ts` (avant suppression, cf. historique git — sans
 * rapport avec le fichier actuel du même nom, qui l'a réintroduit).
 */
function seededRand(n: number): number {
  const x = Math.sin(n + 1) * 10000;
  return x - Math.floor(x);
}

/**
 * Générateur séquentiel déterministe : chaque appel avance d'un cran fixe,
 * donc la séquence entière ne dépend que de `seed` — jamais de l'horloge ni
 * de l'ordre d'exécution du navigateur.
 */
export function createRng(seed: number): () => number {
  let call = 0;
  return () => seededRand(seed * 9973 + call++ * 131);
}
