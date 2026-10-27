"use client";

import { useRef, type RefObject } from "react";
import { useFrame, type RootState } from "@react-three/fiber";
import { HugeiconsIcon } from "@hugeicons/react";
import { Layers01Icon } from "@hugeicons/core-free-icons";
import type { OrthographicCamera } from "three";
import { dampTowards } from "./damp";
import type { LayoutPoint } from "./layout-types";
import type {
  PlayDebugRef,
  PlayDebugState,
  PlayRuntimeRef,
  PlayRuntimeState,
} from "./PlayCanvas";
import { restRotation } from "./rest-rotation";

/** Taille du texte de la pastille (px) avant le réglage `countScale`. */
const BASE_FONT_PX = 13;
/** Marge minimale (px) entre la pastille et le bord de l'écran. */
const SCREEN_MARGIN = 8;
/** Sous cette opacité, l'ancienne pastille a fini de s'effacer : la suivante prend sa place. */
const SWITCH_BELOW = 0.12;
/** Écart (unités monde) sous lequel deux survols visent la même copie de la même carte. */
const SAME_CARD_EPS = 2;

/**
 * Les deux nœuds que le pilote déplace à chaque frame. Le DOM (la pastille) et le
 * pilote (dans le Canvas) ne partagent pas de renderer : ils se retrouvent par ces refs,
 * créées par le parent commun.
 */
type PillRef = RefObject<HTMLDivElement | null>;
type LabelRef = RefObject<HTMLSpanElement | null>;

/**
 * La pastille : le nombre de médias de l'artifact survolé. Elle ne contient aucun état
 * React : position, opacité et texte sont écrits par `HoverCountDriver`, dans la même
 * frame que la scène, donc sans retard sur la caméra.
 *
 * À plat, comme le reste de la DA : fond blanc, filet, ni ombre ni flou.
 */
export function HoverCountPill({ pillRef, labelRef }: { pillRef: PillRef; labelRef: LabelRef }) {
  return (
    <div
      ref={pillRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-[1] flex items-center gap-[0.35em] rounded-full border border-border/60 bg-white py-[0.4em] pl-[0.6em] pr-[0.75em] text-[13px] font-medium leading-none tabular-nums text-zinc-950 opacity-0 will-change-[transform,opacity]"
    >
      <HugeiconsIcon icon={Layers01Icon} size="1.15em" strokeWidth={1.8} />
      <span ref={labelRef} />
    </div>
  );
}

type CountState = {
  /** Opacité affichée (0..1), avant le réglage `countOpacity`. */
  alpha: number;
  /** Carte étiquetée : index du point et position monde de sa copie (le même point existe en 9 copies). */
  point: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Taille de la pastille (px), mesurée quand son texte ou son réglage de taille change (0 = à mesurer). */
  pillW: number;
  pillH: number;
  /** Réglage de taille appliqué ; NaN tant que rien n'est écrit. */
  scale: number;
  /** Dernière opacité écrite, pour ne pas toucher au DOM quand elle ne change pas. */
  written: number;
};

const INITIAL_STATE: CountState = {
  alpha: 0,
  point: -1,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  pillW: 0,
  pillH: 0,
  scale: Number.NaN,
  written: -1,
};

/**
 * Pilote de la pastille, dans le Canvas : lit la carte survolée, projette son coin haut
 * droit avec la caméra de la frame et écrit le résultat dans le DOM. Monté après la
 * mosaïque, il voit donc le grossissement de survol de cette même frame.
 */
export function HoverCountDriver({
  runtime,
  debug,
  points,
  counts,
  pillRef,
  labelRef,
}: {
  runtime: PlayRuntimeRef;
  debug: PlayDebugRef;
  points: LayoutPoint[];
  /** Nombre de médias par artifact (même indexation que `LayoutPoint.artifactIndex`). */
  counts: number[];
  pillRef: PillRef;
  labelRef: LabelRef;
}) {
  const state = useRef<CountState>({ ...INITIAL_STATE });

  useFrame((rs, delta) => {
    const pill = pillRef.current;
    const label = labelRef.current;
    if (!pill || !label) return;
    stepHoverCount(state.current, pill, label, runtime.current, debug.current, points, counts, rs, delta);
  });

  return null;
}

/**
 * Une frame de la pastille. Top-level et sans ref ni prop mutée (cf. `applyHover`), pour
 * respecter `react-hooks/immutability`.
 *
 * - Elle suit la carte survolée ; quand on en survole une autre elle s'efface d'abord
 *   sur place, puis la suivante apparaît : elle ne glisse jamais d'une carte à l'autre.
 * - Quand le pointeur quitte la carte, elle reste accrochée à son coin (qui rétrécit
 *   avec la carte) le temps de s'effacer.
 * - Le debug « Rejouer le survol » l'affiche aussi, sur la carte sélectionnée.
 */
function stepHoverCount(
  st: CountState,
  root: HTMLDivElement,
  label: HTMLSpanElement,
  rc: PlayRuntimeState,
  dbg: PlayDebugState,
  points: LayoutPoint[],
  counts: number[],
  rs: RootState,
  delta: number,
) {
  const hp = dbg.hover;

  // Carte visée : seulement au repos (l'ouverture d'une carte efface le survol).
  let point = -1;
  let tx = 0;
  let ty = 0;
  let tw = 0;
  let th = 0;
  if (rc.transition.phase === "idle") {
    const selected = points[rc.selected];
    if (rc.hovered !== null && rc.hoveredPos) {
      point = rc.hovered;
      tx = rc.hoveredPos.x;
      ty = rc.hoveredPos.y;
      tw = rc.hoveredPos.width;
      th = rc.hoveredPos.height;
    } else if (selected && rc.debugHoverUntil > performance.now()) {
      point = rc.selected;
      tx = rc.selectedPos.x;
      ty = rc.selectedPos.y;
      tw = selected.width;
      th = selected.height;
    }
  }
  const artifact = point >= 0 ? points[point]?.artifactIndex : undefined;
  const count = artifact === undefined ? 0 : (counts[artifact] ?? 0);
  const wanted = hp.countOpacity > 0 && count >= Math.max(1, hp.countMin);

  if (wanted) {
    const same =
      st.point === point &&
      Math.abs(st.x - tx) < SAME_CARD_EPS &&
      Math.abs(st.y - ty) < SAME_CARD_EPS;
    if (same) {
      st.alpha = dampTowards(st.alpha, 1, hp.countSpeed, delta);
    } else if (st.alpha > SWITCH_BELOW) {
      st.alpha = dampTowards(st.alpha, 0, hp.countSpeed, delta);
    } else {
      st.point = point;
      st.x = tx;
      st.y = ty;
      st.width = tw;
      st.height = th;
      label.textContent = String(count);
      st.pillW = 0;
      st.alpha = dampTowards(st.alpha, 1, hp.countSpeed, delta);
    }
  } else {
    st.alpha = dampTowards(st.alpha, 0, hp.countSpeed, delta);
  }
  if (st.alpha < 0.002) st.alpha = 0;
  else if (st.alpha > 0.998) st.alpha = 1;

  if (st.alpha === 0) {
    if (st.written !== 0) {
      root.style.opacity = "0";
      st.written = 0;
    }
    return;
  }

  if (st.scale !== hp.countScale) {
    root.style.fontSize = `${(BASE_FONT_PX * hp.countScale).toFixed(2)}px`;
    st.scale = hp.countScale;
    st.pillW = 0;
  }
  if (st.pillW === 0) {
    const box = root.getBoundingClientRect();
    st.pillW = box.width;
    st.pillH = box.height;
  }

  // Coin haut droit de la carte à l'écran : grossie par le survol de cette frame,
  // tournée comme au repos, puis rentrée de `countInset`. La tuile du canvas mesure
  // `zoom` px par unité monde ; l'axe y monte dans le monde et descend à l'écran.
  const cam = rs.camera as OrthographicCamera;
  const zoom = cam.zoom;
  const grow = 1 + hp.scale * rc.hoverInfo.hov;
  const halfW = (st.width * grow * zoom) / 2;
  const halfH = (st.height * grow * zoom) / 2;
  const cx = (st.x - cam.position.x) * zoom + rs.size.width / 2;
  const cy = rs.size.height / 2 - (st.y - cam.position.y) * zoom;
  const rot = restRotation(st.point, dbg.plane.rotationRange);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const lx = halfW - hp.countInset;
  const ly = halfH - hp.countInset;
  let right = cx + lx * cos - ly * sin;
  let top = cy - (lx * sin + ly * cos);

  // Une carte coupée par le bord de l'écran garde sa pastille visible, au bord.
  right = Math.max(st.pillW + SCREEN_MARGIN, Math.min(right, rs.size.width - SCREEN_MARGIN));
  top = Math.max(SCREEN_MARGIN, Math.min(top, rs.size.height - st.pillH - SCREEN_MARGIN));

  // Alignée sur les pixels de l'écran : le texte reste net, y compris en mouvement.
  const dpr = window.devicePixelRatio || 1;
  const left = Math.round((right - st.pillW) * dpr) / dpr;
  top = Math.round(top * dpr) / dpr;
  root.style.transform = `translate3d(${left}px, ${top}px, 0)`;

  const opacity = st.alpha * hp.countOpacity;
  if (opacity !== st.written) {
    root.style.opacity = opacity.toFixed(3);
    st.written = opacity;
  }
}
