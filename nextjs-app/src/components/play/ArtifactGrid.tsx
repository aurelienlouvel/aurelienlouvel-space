"use client";

import { Suspense, useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Mesh, type MeshBasicMaterial } from "three";
import type { MediaKind } from "./artifact-media";
import { dampTowards } from "./damp";
import {
  applyPointerDown,
  applyPointerUp,
  type PhysicsParams,
  type PlayDebugRef,
  type PlayRuntimeRef,
  type PlayRuntimeState,
} from "./PlayCanvas";
import type { TransitionConfig } from "./transition-presets";
import type { LayoutPoint, LayoutTile } from "./layout-types";
import { ArtifactPlane } from "./ArtifactPlane";

/**
 * 3×3 copies de la tuile virtualisée, repositionnées à la volée autour de la caméra
 * pour former une mosaïque visuellement infinie dans toutes les directions.
 */
const COPIES = 9;

/** Modifie le curseur sur le body et le canvas pour un support cross-browser complet */
export function setAppCursor(cursor: "pointer" | "auto" | "default" | "grabbing") {
  if (typeof document !== "undefined") {
    if (document.body.style.cursor !== cursor) {
      document.body.style.cursor = cursor;
    }
    const canvas = document.querySelector("canvas");
    if (canvas && canvas.style.cursor !== cursor) {
      canvas.style.cursor = cursor;
    }
  }
}

/**
 * Applique un changement de survol à l'état runtime déjà déréférencé (`rc`
 * n'est pas une ref/prop, fonction top-level pour respecter `react-hooks/immutability`).
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
  if (rc.transition.phase !== "idle") {
    setAppCursor("auto");
    return;
  }
  if (hovering) {
    rc.hovered = pointIndex;
    rc.selected = pointIndex;
    rc.selectedPos = world;
    rc.indicatorTarget = { x: world.x, y: world.y, width, height };
    setAppCursor("pointer");
  } else {
    if (rc.hovered === pointIndex) {
      rc.hovered = null;
      setAppCursor("auto");
    }
  }
}

/** Cf. `applyHover` — enregistre la sélection d'un artifact. */
function applySelect(
  rc: PlayRuntimeState,
  pointIndex: number,
  world: { x: number; y: number },
  width: number,
  height: number,
) {
  if (rc.transition.phase !== "idle" && rc.transition.phase !== "selecting") return;
  rc.selected = pointIndex;
  rc.selectedPos = world;
  rc.camera.targetX = world.x;
  rc.camera.targetY = world.y;
  rc.camera.mode = "settle";
  rc.indicatorTarget = { x: world.x, y: world.y, width, height };
}

/**
 * Calcule et applique le déplacement cinématique uniforme sur la mosaïque :
 * 1. Sélection maintenue (Hold) :
 *    - L'artifact sélectionné grossit légèrement (selectScale) sans se déplacer.
 *    - TOUS les autres artifacts s'écartent avec la MÊME amplitude scalaire le long
 *      de leur vecteur radial unitaire en coordonnées monde depuis le centre de la cible.
 *    - Conséquence géométrique : l'espacement relatif entre les artifacts voisins reste
 *      strictement identique, sans aucune collision ni glissement.
 * 2. Explosion (Burst) :
 *    - Onde centrifuge uniforme repoussant tous les médias hors du champ de vision.
 * 3. Repos / Retour au canvas :
 *    - Dès que le maintien cesse ou que le mode isolé est quitté, le déplacement s'amortit
 *      directement et proprement vers 0 (position canonique de repos), sans inertie chaotique.
 */
function stepKinematicMeshes(
  phys: PhysicsParams,
  transition: TransitionConfig,
  rc: PlayRuntimeState,
  points: LayoutPoint[],
  groupRefs: (Group | null)[],
  meshRefs: (Mesh | null)[][],
  displacementRef: { current: number },
  delta: number,
) {
  if (!phys.enabled) {
    displacementRef.current = 0;
    for (let k = 0; k < COPIES; k++) {
      for (let i = 0; i < points.length; i++) {
        const mesh = meshRefs[k]?.[i];
        if (mesh) {
          const pt = points[i];
          mesh.position.set(pt.x, pt.y, 0);
          mesh.rotation.z = 0;
          mesh.scale.set(pt.width, pt.height, 1);
        }
      }
    }
    return;
  }

  const isSelecting = rc.transition.phase === "selecting" || rc.transition.phase === "lock";
  const isBursting = rc.transition.phase === "burst";
  const isReeling = rc.transition.phase === "reel";
  const isDezooming = rc.transition.phase === "dezoom";
  const isIsolated = rc.transition.phase === "isolated";
  const isReturning = rc.transition.phase === "returning";
  const targetIdx = rc.transition.targetIndex >= 0 ? rc.transition.targetIndex : rc.selected;
  const targetPt = targetIdx >= 0 ? points[targetIdx] : null;

  // Calcul du scalaire de déplacement cible
  let targetD = 0;
  const maxD = Math.max(0, transition.burstRepulse);

  if (isSelecting) {
    const repulseProgress = rc.transition.phase === "lock" ? 1 : rc.transition.easedSelectProgress;
    targetD = transition.selectRepulse * repulseProgress;
  } else if (isBursting) {
    targetD = transition.selectRepulse + (maxD - transition.selectRepulse) * rc.transition.easedBurstProgress;
  } else if (isReeling || isDezooming || isIsolated) {
    targetD = maxD;
  } else if (isReturning) {
    const returnDelay = Math.max(0, transition.repulseReturnDelay);
    if (rc.transition.returnTimer < returnDelay) {
      targetD = maxD;
    } else {
      targetD = 0;
    }
  } else {
    targetD = 0;
  }

  // Amortissement propre vers targetD (rapide et direct en transition, fluide au retour)
  const dampSpeed = (rc.transition.phase === "idle" || isReturning) ? Math.max(8, phys.damping) : 24;
  displacementRef.current = dampTowards(displacementRef.current, targetD, dampSpeed, delta);
  if (rc.transition.phase === "idle" && Math.abs(displacementRef.current) < 0.05) {
    displacementRef.current = 0;
  }
  const currentD = displacementRef.current;

  // Facteur d'échelle du média ciblé avec micro-punch tactile au lock
  let selectScaleFactor = 1;
  if (rc.transition.phase === "selecting") {
    selectScaleFactor = 1 + (transition.selectScale - 1) * rc.transition.easedSelectProgress;
  } else if (rc.transition.phase === "lock") {
    const lockT = rc.transition.lockProgress;
    const punch = Math.sin(lockT * Math.PI) * transition.lockScalePunch;
    selectScaleFactor = transition.selectScale + punch;
  }

  // Mise à jour de la cible de l'indicateur
  if (targetPt && targetIdx === rc.selected) {
    rc.indicatorTarget.x = rc.selectedPos.x;
    rc.indicatorTarget.y = rc.selectedPos.y;
    rc.indicatorTarget.width = targetPt.width * selectScaleFactor;
    rc.indicatorTarget.height = targetPt.height * selectScaleFactor;
  }

  const selX = rc.selectedPos.x;
  const selY = rc.selectedPos.y;

  // Répulsion radiale unifiée en coordonnées monde depuis l'artifact sélectionné
  for (let k = 0; k < COPIES; k++) {
    const group = groupRefs[k];
    const gx = group ? group.position.x : 0;
    const gy = group ? group.position.y : 0;

    for (let i = 0; i < points.length; i++) {
      const mesh = meshRefs[k]?.[i];
      if (!mesh) continue;

      const pt = points[i];
      const worldX = gx + pt.x;
      const worldY = gy + pt.y;
      const rx = worldX - selX;
      const ry = worldY - selY;
      const dist = Math.hypot(rx, ry);

      const isTarget = i === targetIdx && dist < Math.max(pt.width, pt.height) * 0.5;

      let curDx = 0;
      let curDy = 0;
      let scale = 1;

      if (isTarget) {
        scale = selectScaleFactor;
      } else if (currentD > 0.001) {
        if (dist > 0.001) {
          curDx = (rx / dist) * currentD;
          curDy = (ry / dist) * currentD;
        }
      }

      mesh.position.set(pt.x + curDx, pt.y + curDy, 0);
      mesh.rotation.z = 0;
      mesh.scale.set(pt.width * scale, pt.height * scale, 1);

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        let targetOpacity = 1;
        if (isBursting) {
          targetOpacity = Math.max(0, 1 - rc.transition.easedBurstProgress);
        } else if (isReeling || isDezooming || isIsolated) {
          targetOpacity = 0;
        } else if (isReturning) {
          const returnDelay = Math.max(0, transition.repulseReturnDelay);
          const exitDur = Math.max(0.2, transition.exitDuration ?? 0.6);
          if (rc.transition.returnTimer < returnDelay) {
            targetOpacity = 0;
          } else {
            const fadeDur = Math.max(0.1, exitDur - returnDelay);
            targetOpacity = Math.min(1, (rc.transition.returnTimer - returnDelay) / fadeDur);
          }
        }
        mat.opacity = dampTowards(mat.opacity, targetOpacity, dampSpeed, delta);
      }
    }
  }
}

/**
 * Rend la mosaïque infinie 3×3 :
 * - Un système de tuilage 3×3 virtualisé garantit l'illusion d'une grille infinie
 *   au pan dans toutes les directions.
 * - Déplacement cinématique radial uniforme au clic/maintien, préservant strictement
 *   l'espacement entre artifacts voisins, sans simulation physique chaotique ni glissement.
 */
export function ArtifactGrid({
  textureUrls,
  mediaKinds,
  tile,
  debug,
  runtime,
  dragMoved,
  onStartSelect,
}: {
  textureUrls: string[];
  mediaKinds: MediaKind[];
  tile: LayoutTile;
  debug: PlayDebugRef;
  runtime: PlayRuntimeRef;
  dragMoved: RefObject<boolean>;
  onStartSelect?: (artifactIndex: number, point: LayoutPoint) => void;
}) {
  const { camera } = useThree();
  const { TILE_W, TILE_H, points } = tile;

  const groupRefs = useRef<(Group | null)[]>(Array(COPIES).fill(null));
  const meshRefs = useRef<(Mesh | null)[][]>(Array.from({ length: COPIES }, () => []));
  const prevTile = useRef({ x: NaN, y: NaN });
  const displacementRef = useRef(0);

  // Réinitialise le déplacement si le layout est recalculé
  useEffect(() => {
    displacementRef.current = 0;
  }, [points]);

  // Relâchement global du clic de répulsion / transition
  useEffect(() => {
    function onPointerUp() {
      applyPointerUp(runtime.current);
    }

    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [runtime]);

  // Boucle par frame :
  // 1. Tuilage 3×3 infini virtualisé autour de la caméra
  // 2. Déplacement cinématique uniforme et mise à jour des positions des meshes
  useFrame((_, delta) => {
    if (
      !runtime.current.transition.holding &&
      runtime.current.transition.selectProgress === 0 &&
      runtime.current.transition.phase === "idle" &&
      runtime.current.repulsor.active
    ) {
      applyPointerUp(runtime.current);
    }

    if (TILE_W > 0 && TILE_H > 0) {
      const tx = Math.round(camera.position.x / TILE_W);
      const ty = Math.round(camera.position.y / TILE_H);
      if (tx !== prevTile.current.x || ty !== prevTile.current.y) {
        prevTile.current = { x: tx, y: ty };
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            groupRefs.current[k]?.position.set((tx + dx) * TILE_W, (ty + dy) * TILE_H, 0);
            k++;
          }
        }
      }
    }

    stepKinematicMeshes(
      debug.current.physics,
      debug.current.transition,
      runtime.current,
      points,
      groupRefs.current,
      meshRefs.current,
      displacementRef,
      delta,
    );
  });

  function handleHover(
    pointIndex: number,
    world: { x: number; y: number },
    width: number,
    height: number,
    hovering: boolean,
  ) {
    if (hovering && dragMoved.current) {
      setAppCursor("grabbing");
      return;
    }
    applyHover(runtime.current, points, pointIndex, world, width, height, hovering);
  }

  function handlePointerDown(
    pointIndex: number,
    world: { x: number; y: number },
    width: number,
    height: number,
  ) {
    if (runtime.current.transition.phase !== "idle") return;
    applySelect(runtime.current, pointIndex, world, width, height);
    applyPointerDown(runtime.current, pointIndex, {
      x: world.x,
      y: world.y,
    });
    if (points[pointIndex]) {
      onStartSelect?.(points[pointIndex].artifactIndex, {
        ...points[pointIndex],
        x: world.x,
        y: world.y,
      });
    }
  }

  function handleSelect(
    pointIndex: number,
    world: { x: number; y: number },
    width: number,
    height: number,
  ) {
    if (dragMoved.current) return;
    applySelect(runtime.current, pointIndex, world, width, height);
  }

  return (
    <>
      {/* Mosaïque 3×3 virtuelle infinie */}
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
              <Suspense key={i} fallback={null}>
                <ArtifactPlane
                  url={textureUrls[point.artifactIndex]}
                  kind={mediaKinds[point.artifactIndex]}
                  x={point.x}
                  y={point.y}
                  width={point.width}
                  height={point.height}
                  debug={debug}
                  meshRef={(mesh) => {
                    if (!meshRefs.current[k]) meshRefs.current[k] = [];
                    meshRefs.current[k][i] = mesh;
                  }}
                  onHoverChange={(hovering, world) =>
                    handleHover(i, world, point.width, point.height, hovering)
                  }
                  onPointerDown={(world) => handlePointerDown(i, world, point.width, point.height)}
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
