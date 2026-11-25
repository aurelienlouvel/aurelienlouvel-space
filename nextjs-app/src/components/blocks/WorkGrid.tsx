"use client";

import { useState, useEffect } from "react";
import { motion, type Variants } from "motion/react";
import type { ProjectListItem } from "@/sanity/queries";
import { ProjectCard } from "./ProjectCard";
import { EASE_IN } from "@/lib/easings";
import { peekWorkReturn, clearWorkReturn } from "@/lib/scroll";

// ─── Layout helpers ───────────────────────────────────────────────────────────
function toColumns<T>(items: T[], n: number): T[][] {
  return Array.from({ length: n }, (_, col) =>
    items.filter((_, i) => i % n === col),
  );
}

// ─── Variants ─────────────────────────────────────────────────────────────────
//  custom = { i, n, col, row, numCols }
//
//  Intro : les cards des colonnes latérales viennent des côtés.
//  L'offset X est proportionnel à la direction de la colonne (-1 · 0 · +1) et
//  croît avec la rangée (plus les cards sont bas, plus elles viennent de loin).
//  La colonne centrale arrive du bas sans décalage horizontal.
//  Spring bouncy à l'arrivée — même ressenti que l'animation Y existante.
//
//  Outro : vague verticale vers le bas (inchangé).

type CardCustom = {
  i: number;
  n: number;
  col: number;
  row: number;
  numCols: number;
};

const norm = ({ i, n }: CardCustom) => (n > 1 ? i / (n - 1) : 0);

// Direction latérale : -1 (col gauche) · 0 (centre) · +1 (col droite)
const colDir = ({ col, numCols }: CardCustom): number => {
  if (numCols <= 1) return 0;
  return (col / (numCols - 1)) * 2 - 1;
};

// X de départ — croît linéairement avec la rangée
const X_BASE = 40; // px — décalage minimal (rangée 0)
const X_ROW  = 30; // px — boost additionnel par rangée
const xFor = (c: CardCustom): number =>
  colDir(c) * (X_BASE + c.row * X_ROW);

const LEAD     = 0.02;
const STEP_IN  = 0.028;
const STEP_OUT = 0.03;
const IN_EXP   = 0.15;
const OUT_EXP  = 0.15;
const P_DELAY  = 2;
const P_DIST   = 1.7;
const Y_IN_MIN = 40,
      Y_IN_MAX = 240; // distance verticale d'entrée (depuis le bas) — comme avant
const Y_OUT_MIN = 48,
      Y_OUT_MAX = 300;
const MAX_ROT = 5;

const rotFor = (i: number, salt = 0) => Math.sin((i + salt) * 99.13) * MAX_ROT;

const delayIn  = (c: CardCustom) =>
  LEAD + c.i * STEP_IN + IN_EXP * norm(c) ** P_DELAY;
const delayOut = (c: CardCustom) =>
  c.i * STEP_OUT + OUT_EXP * norm(c) ** P_DELAY;

const cardVariants: Variants = {
  hidden: (c: CardCustom) => ({
    opacity: 0,
    x: xFor(c),
    y: Y_IN_MIN + (Y_IN_MAX - Y_IN_MIN) * norm(c) ** P_DIST,
    rotate: rotFor(c.i),
  }),
  visible: (c: CardCustom) => ({
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    // Spring `bounce` : léger rebond CONSTANT quelle que soit la distance
    // (amplitude-indépendant) → robuste, settling propre, pas de lag de fin.
    // visualDuration = temps perçu pour atteindre la cible (un peu plus vif).
    transition: {
      type: "spring",
      visualDuration: 0.4,
      bounce: 0.32,
      delay: delayIn(c),
    },
  }),
  // Outro : vague qui descend vers le bas — inchangé.
  exit: (c: CardCustom) => ({
    opacity: 0,
    y: Y_OUT_MIN + (Y_OUT_MAX - Y_OUT_MIN) * norm(c) ** P_DIST,
    rotate: rotFor(c.i, 7),
    transition: {
      duration: 0.4,
      delay: delayOut(c),
      ease: EASE_IN,
    },
  }),
};

// ─── WorkGrid ─────────────────────────────────────────────────────────────────
export function WorkGrid({ projects }: { projects: ProjectListItem[] }) {
  // Retour depuis un projet (bouton retour) → pas d'intro : les cards sont
  // visibles dès le 1er rendu, donc le snapshot de la View Transition nav-back
  // montre la grille complète (et pas une grille vide qui se remplit après).
  // Lu une seule fois au montage (lazy init) — pas de lecture de ref pendant
  // le render. peekWorkReturn() lit un flag module posé par le bouton retour.
  const [isReturning] = useState(() => peekWorkReturn());

  const [shown, setShown] = useState(isReturning);
  useEffect(() => {
    if (isReturning) {
      clearWorkReturn();
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [isReturning]);
  const animate = shown ? "visible" : "hidden";
  const n = projects.length;

  const card = (
    p: ProjectListItem,
    globalIdx: number,
    colIdx: number,
    rowIdx: number,
    numCols: number,
  ) => (
    <motion.div
      key={p._id}
      variants={cardVariants}
      custom={{ i: globalIdx, n, col: colIdx, row: rowIdx, numCols }}
      initial={isReturning ? "visible" : "hidden"}
      animate={animate}
      exit="exit"
    >
      <ProjectCard project={p} />
    </motion.div>
  );

  return (
    <main className="p-4 pb-36 bg-white">
      {/* Mobile — 1 col (pas d'offset X) */}
      <div className="flex flex-col gap-4 md:hidden">
        {projects.map((p, i) => card(p, i, 0, i, 1))}
      </div>

      {/* Tablet — 2 cols (gauche / droite) */}
      <div className="hidden gap-4 md:flex lg:hidden">
        {toColumns(projects, 2).map((col, colIdx) => (
          <div key={colIdx} className="flex flex-1 flex-col gap-4">
            {col.map((p, rowIdx) =>
              card(p, colIdx + rowIdx * 2, colIdx, rowIdx, 2),
            )}
          </div>
        ))}
      </div>

      {/* Desktop — 3 cols (gauche · centre · droite) */}
      <div className="hidden gap-4 lg:flex">
        {toColumns(projects, 3).map((col, colIdx) => (
          <div key={colIdx} className="flex flex-1 flex-col gap-4">
            {col.map((p, rowIdx) =>
              card(p, colIdx + rowIdx * 3, colIdx, rowIdx, 3),
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
