import { useRef, useState } from "react";
import * as THREE from "three";
import { SELECTION_POP_SCALE } from "@/lib/artifact-utils";
import { damp, dampRef } from "@/lib/damp";
import { usePlayStore, isFocusPhase } from "@/contexts/PlayStoreContext";

// ─── Shared card animation — hover/selection spring, focus dim, idle tilt ──────
//  MeshBody and PlaceholderMesh drive their mesh from the exact same per-frame
//  math (spring toward a hover/selection scale, repli when another card is
//  focused, idle tilt that straightens on selection) — only their JSX differs
//  (textured plane vs solid color). This hook owns that shared math; each
//  caller invokes tick(isSelected) explicitly inside its own useFrame (no
//  implicit subscription) and layers its own concerns on top of the returned
//  values (MeshBody: intro/outro opacity + scaleBoost).

// Léger grossissement au survol (non cumulatif avec la sélection)
const HOVER_SCALE = 1.03;

// ─── Spring speeds ────────────────────────────────────────────────────────────
//  Numériquement égales aujourd'hui mais conceptuellement distinctes (scale vs
//  rotation) — les garder séparées évite de recréer le couplage accidentel qui
//  a causé le bug de PlaceholderMesh (voir plan 4.3/4.4). SELECTION_SPRING est
//  aussi réutilisée par GalleryStack pour son propre pop de groupe — même
//  famille d'anim que selAnim ci-dessous.
export const SELECTION_SPRING = 0.12;
const ROTATION_SPRING = 0.12;

// ─── Focus dim config ─────────────────────────────────────────────────────────
//  Quand un item est sélectionné, les autres cards se replient : scale ↓ +
//  fondu d'opacité (pas de rotation), et deviennent non-cliquables (raycast
//  toggle left to the caller — see DEFAULT_RAYCAST/NOOP_RAYCAST in
//  GridCard.tsx).
const DIM_LERP = 0.12; // vitesse du repli (lerp/frame)
export const DIM_SCALE = 0.22; // réduction d'échelle au repli (→ 78 %)

export function useCardAnimation() {
  const store = usePlayStore();
  const meshRef  = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const selAnim = useRef(1);
  const dimAnim = useRef(0);
  const rotAnim = useRef<number | null>(null);
  // Inclinaison permanente façon "épinglée au mur" — fixe, ne bouge jamais en
  // idle (même en zoom/sélection tant que non sélectionnée) ; ratio stable
  // ∈ [-0.5, 0.5], tiré une fois par card.
  const [rotSeed] = useState(() => Math.random() - 0.5);

  // Appelée explicitement dans le useFrame de chaque composant — pas de
  // souscription implicite. Retourne les 3 ingrédients bruts ; chaque
  // caller assemble sa propre formule finale d'opacity/scale/visible avec.
  function tick(isSelected: boolean): { scale: number; dimAmount: number; dimmed: boolean } {
    // ── Selection spring (hover gives the same slight bump when not selected) ──
    const selTarget = isSelected ? SELECTION_POP_SCALE : hovered ? HOVER_SCALE : 1;
    dampRef(selAnim, selTarget, SELECTION_SPRING);

    // ── Focus dim : les autres cards se replient quand un item est focus ──────
    const dimmed = isFocusPhase(store.camera.phase) && !isSelected;
    if (isSelected) {
      dimAnim.current = 0; // snap : la card sélectionnée ne doit jamais être dimmée
    } else {
      dampRef(dimAnim, dimmed ? 1 : 0, DIM_LERP);
      if (dimAnim.current < 0.001) dimAnim.current = 0;
    }

    // Tilt : fixe en idle (lu en live depuis rotMax, slider debug). En focus,
    // se redresse à 0° (média bien droit) — anime en douceur entre les deux,
    // même vitesse que le pop de sélection.
    if (groupRef.current) {
      const maxRad  = (store.params.rotMax * Math.PI) / 180;
      const idleRot = rotSeed * 2 * maxRad;
      if (rotAnim.current === null) rotAnim.current = idleRot;
      const rotTarget = isSelected ? 0 : idleRot;
      rotAnim.current = damp(rotAnim.current, rotTarget, ROTATION_SPRING);
      groupRef.current.rotation.z = rotAnim.current;
    }

    return { scale: selAnim.current, dimAmount: dimAnim.current, dimmed };
  }

  return { meshRef, groupRef, hovered, setHovered, tick };
}
