"use client";

import { Suspense, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import type { MediaKind } from "./artifact-media";
import type { PlayDebugRef, PlayRuntimeRef, PlayRuntimeState } from "./PlayCanvas";
import type { LayoutPoint, LayoutTile } from "./layout-types";
import { ArtifactPlane } from "./ArtifactPlane";

/**
 * 3×3 copies de la tuile, repositionnées à la volée — même mécanisme que
 * l'ancien `InfiniteTiles.tsx` (avant suppression, cf. historique git) :
 * nombre de meshes constant quelle que soit la distance de pan, rien ne
 * (dé)monte pendant le geste.
 */
const COPIES = 9;

/**
 * Applique un changement de survol à l'état runtime déjà déréférencé (`rc`
 * n'est pas une ref/prop).
 *
 * Fonction top-level plutôt que nichée dans `ArtifactGrid` : `runtime` arrive
 * en prop du composant, et `react-hooks/immutability` refuse toute mutation
 * d'un champ atteignable depuis une prop, même via un alias local
 * (`const rc = runtime.current`) et même dans un handler qui ne s'exécute
 * qu'au survol, jamais au rendu — le lint trace l'origine lexicale, pas le
 * moment d'exécution. Recevoir `rc` déjà résolu comme paramètre ordinaire
 * d'une fonction hors du composant lève l'ambiguïté. Même remède que
 * `stepCamera` dans `PlayCanvas.tsx`, et que `restore()` dans
 * `PlayDebug.tsx`.
 */
function applyHover(
  rc: PlayRuntimeState,
  points: LayoutPoint[],
  pointIndex: number,
  world: { x: number; y: number },
  width: number,
  height: number,
  hovering: boolean,
) {
  if (hovering) {
    rc.hovered = pointIndex;
    rc.indicatorTarget = { x: world.x, y: world.y, width, height };
  } else {
    rc.hovered = null;
    const selected = points[rc.selected];
    rc.indicatorTarget = {
      x: rc.selectedPos.x,
      y: rc.selectedPos.y,
      width: selected.width,
      height: selected.height,
    };
  }
}

/** Cf. `applyHover` — même raison d'être top-level. */
function applySelect(
  rc: PlayRuntimeState,
  pointIndex: number,
  world: { x: number; y: number },
  width: number,
  height: number,
) {
  rc.selected = pointIndex;
  rc.selectedPos = world;
  rc.camera.targetX = world.x;
  rc.camera.targetY = world.y;
  rc.camera.mode = "settle";
  rc.indicatorTarget = { x: world.x, y: world.y, width, height };
}

/**
 * Rend la mosaïque (une grille par tuile — cf. `PlayCanvas.tile` et
 * `scatter-layout.ts`), virtualisée par tuilage 3×3, et route le survol /
 * clic de chaque instance de plane vers `runtime`.
 *
 * L'identité d'un point est son index dans la tuile canonique, pas
 * l'artifact qu'il affiche (`repeat` > 1 répète un même artifact sur
 * plusieurs points, cf. `ScatterParams.repeat` dans `scatter-layout.ts`) —
 * cf. plan §4. `runtime.current.selected` / `.hovered` sont donc des index de
 * points.
 */
export function ArtifactGrid({
  textureUrls,
  mediaKinds,
  tile,
  debug,
  runtime,
  dragMoved,
}: {
  textureUrls: string[];
  mediaKinds: MediaKind[];
  tile: LayoutTile;
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  dragMoved: RefObject<boolean>;
}) {
  const { camera } = useThree();
  const { TILE_W, TILE_H, points } = tile;
  const groupRefs = useRef<(Group | null)[]>(Array(COPIES).fill(null));
  const prevTile = useRef({ x: NaN, y: NaN });

  useFrame(() => {
    const tx = Math.round(camera.position.x / TILE_W);
    const ty = Math.round(camera.position.y / TILE_H);
    if (tx === prevTile.current.x && ty === prevTile.current.y) return;
    prevTile.current = { x: tx, y: ty };
    let k = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        groupRefs.current[k]?.position.set((tx + dx) * TILE_W, (ty + dy) * TILE_H, 0);
        k++;
      }
    }
  });

  function handleHover(
    pointIndex: number,
    world: { x: number; y: number },
    width: number,
    height: number,
    hovering: boolean,
  ) {
    // Pendant un pan, on ignore les survols de passage : sinon les brackets
    // sautent d'un plane à l'autre à chaque fois que le drag traverse une
    // image, au lieu de rester sur la sélection. La fin d'un survol déjà en
    // cours, elle, reste traitée — sinon il resterait figé après le pan.
    if (hovering && dragMoved.current) return;
    applyHover(runtime.current, points, pointIndex, world, width, height, hovering);
  }

  function handleSelect(
    pointIndex: number,
    world: { x: number; y: number },
    width: number,
    height: number,
  ) {
    // Un drag qui se termine au-dessus d'un mesh déclenche aussi `onClick` —
    // c'est le seuil de §3 qui distingue un vrai clic d'un pan qui finit là.
    if (dragMoved.current) return;
    applySelect(runtime.current, pointIndex, world, width, height);
  }

  return (
    <>
      {Array.from({ length: COPIES }, (_, k) => {
        const dx = (k % 3) - 1;
        const dy = Math.floor(k / 3) - 1;
        return (
          <group
            key={k}
            ref={(el) => {
              groupRefs.current[k] = el;
            }}
            position={[dx * TILE_W, dy * TILE_H, 0]}
          >
            {points.map((point, i) => (
              // Une frontière par plane, pas une seule pour la grille entière :
              // une texture qui tarde (ou une URL cassée) ne doit geler que sa
              // propre carte, pas toute la mosaïque — même choix que l'ancien
              // InfiniteTiles.tsx avant sa suppression (cf. historique git).
              <Suspense key={i} fallback={null}>
                <ArtifactPlane
                  url={textureUrls[point.artifactIndex]}
                  kind={mediaKinds[point.artifactIndex]}
                  x={point.x}
                  y={point.y}
                  width={point.width}
                  height={point.height}
                  debug={debug}
                  onHoverChange={(hovering, world) =>
                    handleHover(i, world, point.width, point.height, hovering)
                  }
                  onSelect={(world) => handleSelect(i, world, point.width, point.height)}
                />
              </Suspense>
            ))}
          </group>
        );
      })}
    </>
  );
}
