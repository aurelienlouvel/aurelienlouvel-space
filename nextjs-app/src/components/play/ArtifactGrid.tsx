"use client";

import { Suspense, useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Mesh } from "three";
import {
  Physics,
  RigidBody,
  CuboidCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { MediaKind } from "./artifact-media";
import type { PlayDebugRef, PlayRuntimeRef, PlayRuntimeState } from "./PlayCanvas";
import type { LayoutPoint, LayoutTile } from "./layout-types";
import { ArtifactPlane } from "./ArtifactPlane";

/**
 * 3×3 copies de la tuile virtualisée, repositionnées à la volée autour de la caméra
 * pour former une mosaïque visuellement infinie dans toutes les directions.
 */
const COPIES = 9;

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
  if (hovering) {
    rc.hovered = pointIndex;
    rc.indicatorTarget = { x: world.x, y: world.y, width, height };
  } else {
    rc.hovered = null;
    const selected = points[rc.selected];
    if (selected) {
      rc.indicatorTarget = {
        x: rc.selectedPos.x,
        y: rc.selectedPos.y,
        width: selected.width,
        height: selected.height,
      };
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
  rc.selected = pointIndex;
  rc.selectedPos = world;
  rc.camera.targetX = world.x;
  rc.camera.targetY = world.y;
  rc.camera.mode = "settle";
  rc.indicatorTarget = { x: world.x, y: world.y, width, height };
}

function applyPointerDown(
  rc: PlayRuntimeState,
  pointIndex: number,
  canonicalPos: { x: number; y: number },
) {
  rc.repulsor.active = true;
  rc.repulsor.pointIndex = pointIndex;
  rc.repulsor.x = canonicalPos.x;
  rc.repulsor.y = canonicalPos.y;
  rc.transition.holding = true;
  rc.transition.trigger = "pointer";
}

function applyPointerUp(rc: PlayRuntimeState) {
  if (rc.transition.trigger === "pointer") {
    rc.transition.holding = false;
    rc.transition.trigger = null;
  }
  if (rc.transition.progress === 0) {
    rc.repulsor.active = false;
    rc.repulsor.pointIndex = -1;
  }
}

/**
 * Exécute le pas physique Rapier et répercute les déplacements physiques
 * sur l'ensemble des 9 copies de la mosaïque infinie :
 * 1. Force de rappel élastique (ressort vers position canonique de layout)
 * 2. Répulsion physique radiale depuis l'artifact cliqué/maintenu
 * 3. Amortissement et stabilisation angulaire
 * 4. Synchronisation instantanée des 9 copies virtuelles
 */
function stepPhysicsAndMeshes(
  phys: {
    enabled: boolean;
    strength: number;
    radius: number;
    spring: number;
    damping: number;
    restitution: number;
    friction: number;
    lockRotation: boolean;
    mass: number;
  },
  rc: PlayRuntimeState,
  points: LayoutPoint[],
  rbs: (RapierRigidBody | null)[],
  meshRefs: (Mesh | null)[][],
  tileW: number,
  tileH: number,
  delta: number,
) {
  if (!phys.enabled) {
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      for (let k = 0; k < COPIES; k++) {
        const mesh = meshRefs[k]?.[i];
        if (mesh) {
          mesh.position.set(pt.x, pt.y, 0);
          mesh.rotation.z = 0;
        }
      }
    }
    return;
  }

  const dt = Math.min(delta, 0.04);
  const repulsor = rc.repulsor;
  const isRepulsing = repulsor.active || rc.transition.progress > 0;

  for (let i = 0; i < points.length; i++) {
    const rb = rbs[i];
    if (!rb) continue;
    const pt = points[i];
    const trans = rb.translation();

    // Damping linéaire dynamique
    rb.setLinearDamping(phys.damping);

    // Déplacement par rapport à la position canonique de repos
    const curDx = trans.x - pt.x;
    const curDy = trans.y - pt.y;

    // Si sélectionné, l'indicateur suit le déplacement physique
    if (i === rc.selected) {
      rc.indicatorTarget.x = rc.selectedPos.x + curDx;
      rc.indicatorTarget.y = rc.selectedPos.y + curDy;
      rc.indicatorTarget.width = pt.width;
      rc.indicatorTarget.height = pt.height;
    }

    // Répercussion du déplacement et de la rotation sur les 9 copies de la mosaïque
    let rotZ = 0;
    if (!phys.lockRotation) {
      const rot = rb.rotation();
      rotZ = 2 * Math.atan2(rot.z, rot.w);
    }

    for (let k = 0; k < COPIES; k++) {
      const mesh = meshRefs[k]?.[i];
      if (mesh) {
        mesh.position.set(pt.x + curDx, pt.y + curDy, 0);
        mesh.rotation.z = rotZ;
      }
    }

    // Si c'est la tuile cliquée/maintenue, elle reste ancrée fermement à sa place
    if (isRepulsing && i === repulsor.pointIndex) {
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      rb.setTranslation({ x: pt.x, y: pt.y, z: 0 }, true);
      continue;
    }

    // 1. Force de rappel élastique vers la position initiale dans le layout
    const pullX = pt.x - trans.x;
    const pullY = pt.y - trans.y;
    let fx = pullX * phys.spring * 60 * phys.mass;
    let fy = pullY * phys.spring * 60 * phys.mass;

    // 2. Répulsion physique radiale depuis le repulsor (avec raccord torique pour les bords)
    if (isRepulsing) {
      let rx = trans.x - repulsor.x;
      let ry = trans.y - repulsor.y;

      if (tileW > 0) {
        if (rx > tileW * 0.5) rx -= tileW;
        else if (rx < -tileW * 0.5) rx += tileW;
      }
      if (tileH > 0) {
        if (ry > tileH * 0.5) ry -= tileH;
        else if (ry < -tileH * 0.5) ry += tileH;
      }

      const dist = Math.hypot(rx, ry);

      if (dist < phys.radius && dist > 0.01) {
        const t = 1 - dist / phys.radius;
        const falloff = t * t;
        // Courbe exponentielle : commence doux, s'amplifie au fur et à mesure du maintien
        const expoFactor = 0.15 + 0.85 * rc.transition.expo;
        const forceMag = phys.strength * falloff * 50 * phys.mass * expoFactor;

        fx += (rx / dist) * forceMag;
        fy += (ry / dist) * forceMag;
      }
    }

    // 3. Application de l'impulsion physique
    rb.applyImpulse({ x: fx * dt, y: fy * dt, z: 0 }, true);

    // 4. Maintien de l'alignement en rotation
    if (phys.lockRotation) {
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    } else {
      const torqueZ = -rotZ * phys.spring * 100;
      rb.applyTorqueImpulse({ x: 0, y: 0, z: torqueZ * dt }, true);
    }
  }
}

/**
 * Rend la mosaïque infinie 3×3 combinée au moteur physique Rapier :
 * - Un système de tuilage 3×3 virtualisé garantit l'illusion d'une grille infinie
 *   au pan dans toutes les directions.
 * - 96 RigidBodies Rapier animent la physique avec colliders cubiques exacts.
 * - Le maintien du clic repousse dynamiquement les tuiles voisines.
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
  const meshRefs = useRef<(Mesh | null)[][]>(Array.from({ length: COPIES }, () => []));
  const prevTile = useRef({ x: NaN, y: NaN });
  const rigidBodiesRef = useRef<(RapierRigidBody | null)[]>([]);


  // Repositionne et stabilise les corps physiques dès que le layout est recalculé
  useEffect(() => {
    rigidBodiesRef.current.forEach((rb, i) => {
      if (!rb || !points[i]) return;
      rb.setTranslation({ x: points[i].x, y: points[i].y, z: 0 }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
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
  // 2. Simulation physique Rapier et mise à jour des positions des meshes
  useFrame((_, delta) => {
    if (
      !runtime.current.transition.holding &&
      runtime.current.transition.progress === 0 &&
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

    stepPhysicsAndMeshes(
      debug.current.physics,
      runtime.current,
      points,
      rigidBodiesRef.current,
      meshRefs.current,
      TILE_W,
      TILE_H,
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
    if (hovering && dragMoved.current) return;
    applyHover(runtime.current, points, pointIndex, world, width, height, hovering);
  }

  function handlePointerDown(
    pointIndex: number,
    world: { x: number; y: number },
    width: number,
    height: number,
  ) {
    applyPointerDown(runtime.current, pointIndex, {
      x: points[pointIndex].x,
      y: points[pointIndex].y,
    });
    applySelect(runtime.current, pointIndex, world, width, height);
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
      {/* Simulation physique Rapier (96 corps rigides avec colliders cubiques) */}
      <Suspense fallback={null}>
        <Physics gravity={[0, 0, 0]}>
          {points.map((point, i) => (
            <RigidBody
              key={`${i}-${point.artifactIndex}-${point.x}-${point.y}`}
              ref={(el) => {
                rigidBodiesRef.current[i] = el;
              }}
              position={[point.x, point.y, 0]}
              colliders={false}
              canSleep={false}
              enabledTranslations={[true, true, false]}
              enabledRotations={[false, false, !debug.current.physics.lockRotation]}
              linearDamping={debug.current.physics.damping}
              angularDamping={5}
              friction={debug.current.physics.friction}
              restitution={debug.current.physics.restitution}
            >
              <CuboidCollider
                args={[point.width * 0.5, point.height * 0.5, 5]}
                mass={debug.current.physics.mass}
              />
            </RigidBody>
          ))}
        </Physics>
      </Suspense>

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
