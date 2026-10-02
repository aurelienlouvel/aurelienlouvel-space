"use client";

import { Component, Suspense, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Mesh, type MeshBasicMaterial } from "three";
import type { MediaKind } from "./artifact-media";
import { CURSOR_GRABBING, CURSOR_POINTER } from "@/lib/cursors";
import { dampTowards } from "./damp";
import {
  startPlayback,
  type PhysicsParams,
  type PlayDebugRef,
  type PlayRuntimeRef,
  type PlayRuntimeState,
} from "./PlayCanvas";
import type { LayoutPoint, LayoutTile } from "./layout-types";
import { ArtifactPlane, type PlaneUniforms } from "./ArtifactPlane";
import { uniformsOf } from "./rounded-frame";
import type { TransitionConfig } from "./transition-presets";

/**
 * Isole un plane : si son média ne charge pas (404, CORS, réseau…), seul ce
 * plane disparaît au lieu de faire tomber toute la scène — sans ça, une seule
 * texture en erreur faisait planter /play en entier (« Could not load … »).
 */
class PlaneBoundary extends Component<
  { url?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[play] média ignoré (${this.props.url ?? "?"})`, error);
  }

  componentDidUpdate(prev: { url?: string }) {
    if (prev.url !== this.props.url && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * 3×3 copies de la tuile virtualisée, repositionnées à la volée autour de la caméra
 * pour former une mosaïque visuellement infinie dans toutes les directions.
 */
const COPIES = 9;

/**
 * Pose le curseur sur le body et le canvas. « auto » et « default » retirent
 * le style inline : c'est alors le curseur par défaut du site (globals.css).
 */
export function setAppCursor(cursor: "pointer" | "auto" | "default" | "grabbing") {
  if (typeof document === "undefined") return;
  const value =
    cursor === "pointer" ? CURSOR_POINTER : cursor === "grabbing" ? CURSOR_GRABBING : "";
  const canvas = document.querySelector("canvas");
  for (const el of [document.body, canvas]) {
    if (!el) continue;
    if (value) {
      if (el.style.cursor !== value) el.style.cursor = value;
    } else if (el.style.cursor) {
      el.style.removeProperty("cursor");
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
  isDragging?: boolean,
) {
  if (rc.transition.phase !== "idle") {
    setAppCursor("auto");
    return;
  }
  if (hovering) {
    if (isDragging) return;
    rc.hovered = pointIndex;
    rc.hoveredPos = { x: world.x, y: world.y, width, height };
    rc.indicatorTarget = { x: world.x, y: world.y, width, height };
    setAppCursor("pointer");
  } else {
    if (rc.hovered === pointIndex) {
      rc.hovered = null;
      rc.hoveredPos = null;
      if (!isDragging) {
        setAppCursor("auto");
      }
      const origPt = points[rc.selected];
      if (origPt) {
        rc.indicatorTarget = {
          x: rc.selectedPos.x,
          y: rc.selectedPos.y,
          width: origPt.width,
          height: origPt.height,
        };
      }
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
  if (rc.transition.phase !== "idle") return;
  rc.selected = pointIndex;
  rc.selectedPos = world;
  rc.hovered = null;
  rc.hoveredPos = null;
  // La caméra ne bouge pas : la tuile reste là où on a cliqué, c'est la
  // timeline qui la rejoint après le « boom ».
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
function hash01(n: number): number {
  const x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
}

function stepKinematicMeshes(
  phys: PhysicsParams,
  rc: PlayRuntimeState,
  points: LayoutPoint[],
  groupRefs: (Group | null)[],
  meshRefs: (Mesh | null)[][],
  displacementRef: { current: number },
  delta: number,
  burst: TransitionConfig,
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

  // Tout vient de la timeline : la mosaïque ne recalcule aucune progression et
  // ne connaît plus les phases. `displacementRef` ne sert qu'au repos, où le
  // retour à zéro reste amorti (il n'y a alors pas de courbe pour le décrire).
  const frame = rc.transition.frame;
  const targetIdx = rc.transition.targetIndex >= 0 ? rc.transition.targetIndex : rc.selected;
  const targetPt = targetIdx >= 0 ? points[targetIdx] : null;

  if (rc.transition.phase === "idle") {
    displacementRef.current = dampTowards(
      displacementRef.current,
      frame.scatter,
      Math.max(8, phys.damping),
      delta,
    );
    if (Math.abs(displacementRef.current) < 0.05) displacementRef.current = 0;
  } else {
    displacementRef.current = frame.scatter;
  }
  const currentD = displacementRef.current;
  const selectScaleFactor = frame.tileScale;

  // Mise à jour de la cible de l'indicateur
  if (rc.transition.phase !== "idle") {
    if (targetPt && targetIdx === rc.selected) {
      rc.indicatorTarget.x = rc.selectedPos.x;
      rc.indicatorTarget.y = rc.selectedPos.y;
      rc.indicatorTarget.width = targetPt.width * selectScaleFactor;
      rc.indicatorTarget.height = targetPt.height * selectScaleFactor;
    }
  } else {
    if (rc.hovered !== null && rc.hoveredPos) {
      rc.indicatorTarget.x = rc.hoveredPos.x;
      rc.indicatorTarget.y = rc.hoveredPos.y;
      rc.indicatorTarget.width = rc.hoveredPos.width;
      rc.indicatorTarget.height = rc.hoveredPos.height;
    } else {
      const origPt = points[rc.selected];
      if (origPt) {
        rc.indicatorTarget.x = rc.selectedPos.x;
        rc.indicatorTarget.y = rc.selectedPos.y;
        rc.indicatorTarget.width = origPt.width;
        rc.indicatorTarget.height = origPt.height;
      }
    }
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

      // Masquer la tuile de la mosaïque UNIQUEMENT quand M0 commence activement son
      // expansion dans la colonne (reveal > 0.001).
      // Pendant la phase de pause (0.6s) et la micro-animation de lock, la tuile reste
      // rigoureusement visible avec opacité 1, empêchant tout clignotement ou disparition.
      const shouldHideInMosaic =
        isTarget &&
        (rc.transition.phase === "isolated" ||
          (rc.transition.phase === "playing" && frame.reveal > 0.001) ||
          (rc.transition.phase === "returning" && frame.reveal > 0.001));

      if (shouldHideInMosaic) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      let curDx = 0;
      let curDy = 0;
      let scale = 1;

      if (isTarget) {
        scale = selectScaleFactor;
      } else if (currentD > 0.001) {
        if (dist > 0.001) {
          // Burst organique : chaque tuile a sa propre puissance et dévie un peu de la radiale.
          const tc = rc.transition.targetIndex >= 0 ? rc.transition.targetIndex : 0;
          const seed = (burst.burstSeed ?? 0) * 91.7;
          const h1 = hash01(i * 127.1 + k * 311.7 + tc * 17.3 + seed);
          const h2 = hash01(i * 269.5 + k * 183.3 + tc * 7.1 + seed);
          const pMin = burst.burstPowerMin ?? 1;
          const pMax = Math.max(pMin, burst.burstPowerMax ?? 1);
          const power = pMin + (pMax - pMin) * h1;
          const ang = (h2 - 0.5) * 2 * (burst.burstAngleJitter ?? 0);
          const cs = Math.cos(ang);
          const sn = Math.sin(ang);
          const ux = rx / dist;
          const uy = ry / dist;
          curDx = (ux * cs - uy * sn) * currentD * power;
          curDy = (ux * sn + uy * cs) * currentD * power;
        }
      }

      mesh.position.set(pt.x + curDx, pt.y + curDy, 0);
      mesh.scale.set(pt.width * scale, pt.height * scale, 1);
      // Contrairement à la bascule X/Y (aplatie par la caméra orthographique,
      // cf. ArtifactPlane.tsx), une rotation Z reste un pur tourni dans le
      // plan de l'écran : parfaitement visible telle quelle, sans warp shader.
      mesh.rotation.z = isTarget ? frame.tileRoll : 0;

      const mat = mesh.material as MeshBasicMaterial | undefined;
      if (mat) {
        // La tuile ciblée reste à opacité 1 (jamais de semi-transparence fantôme)
        const targetOpacity = isTarget ? 1 : frame.mosaicOpacity;
        if (mat.opacity !== targetOpacity) {
          mat.opacity = targetOpacity;
        }
        // Bascule 3D : un warp de perspective locale dans le shader (cf.
        // ArtifactPlane.tsx), pas une rotation Object3D — sous la caméra
        // orthographique de la scène, une rotation ne produirait qu'un
        // aplatissement symétrique, invisible et indifférent au sens du tilt.
        const uniforms = uniformsOf<PlaneUniforms>(mat);
        if (uniforms) {
          uniforms.uCardTilt.value.set(
            isTarget ? frame.tileTiltX : 0,
            isTarget ? frame.tileTiltY : 0,
          );
          // Même condition de visibilité que le dégradé (SelectProgressOverlay) :
          // la déformation n'existe que tant que la vague est à l'écran.
          const waveOn =
            isTarget &&
            rc.transition.phase === "playing" && rc.transition.selectProgress > 0.001;
          uniforms.uWaveProgress.value = waveOn ? rc.transition.selectProgress : 0;
          uniforms.uWaveExit.value = waveOn ? frame.overlayExit : 0;
          // Glitch d'ouverture : seulement sur la tuile ouverte, tant que les effets durent.
          const glitchOn = isTarget && rc.transition.phase === "playing";
          uniforms.uGlitch.value = glitchOn
            ? Math.min(1, frame.fx * burst.fxGlitch)
            : 0;
          uniforms.uTime.value = (performance.now() / 1000) % 1000;
        }
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

  // Boucle par frame :
  // 1. Tuilage 3×3 infini virtualisé autour de la caméra
  // 2. Déplacement cinématique uniforme et mise à jour des positions des meshes
  useFrame((_, delta) => {
    if (TILE_W > 0 && TILE_H > 0 && runtime.current.transition.phase === "idle") {
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
      runtime.current,
      points,
      groupRefs.current,
      meshRefs.current,
      displacementRef,
      delta,
      debug.current.transition,
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
    applyHover(
      runtime.current,
      points,
      pointIndex,
      world,
      width,
      height,
      hovering,
      dragMoved.current,
    );
  }

  /** Clic franc (pas un drag) : la timeline démarre tout de suite. */
  function handleSelect(
    pointIndex: number,
    world: { x: number; y: number },
    width: number,
    height: number,
  ) {
    const rc = runtime.current;
    if (dragMoved.current || rc.transition.phase !== "idle") return;
    applySelect(rc, pointIndex, world, width, height);
    startPlayback(rc, pointIndex);
    if (points[pointIndex]) {
      onStartSelect?.(points[pointIndex].artifactIndex, {
        ...points[pointIndex],
        x: world.x,
        y: world.y,
      });
    }
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
              <PlaneBoundary key={i} url={textureUrls[point.artifactIndex]}>
              <Suspense fallback={null}>
                <ArtifactPlane
                  url={textureUrls[point.artifactIndex]}
                  kind={mediaKinds[point.artifactIndex]}
                  x={point.x}
                  y={point.y}
                  width={point.width}
                  height={point.height}
                  debug={debug}
                  runtime={runtime}
                  meshRef={(mesh) => {
                    if (!meshRefs.current[k]) meshRefs.current[k] = [];
                    meshRefs.current[k][i] = mesh;
                  }}
                  onHoverChange={(hovering, world) =>
                    handleHover(i, world, point.width, point.height, hovering)
                  }
                  onSelect={(world) => handleSelect(i, world, point.width, point.height)}
                />
              </Suspense>
              </PlaneBoundary>
            ))}
          </group>
        );
      })}
    </>
  );
}
