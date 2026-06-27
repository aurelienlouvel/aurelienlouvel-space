"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import LocomotiveScroll from "locomotive-scroll";
import {
  registerScroll,
  unregisterScroll,
  jumpTo,
  jumpToTop,
  WORK_SCROLL_KEY,
} from "@/lib/scroll";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Container de scroll fixe (viewport-sized) pour les pages avec View Transition.
 *
 * Le `view-transition-name` (posé par le <ViewTransition> parent) atterrit sur
 * ce container `fixed inset-0` → son snapshot fait TOUJOURS la taille du
 * viewport, peu importe le scroll interne. La VT (drawer / recede) est donc
 * propre même quand on a déjà scrollé dans la page.
 *
 * PageShell possède Lenis (scopé au container) ET applique le scroll initial
 * juste après l'avoir créé, dans un LAYOUT effect → ça s'exécute avant le
 * snapshot de la View Transition (donc le snapshot est à la bonne position) et
 * après l'enregistrement de Lenis (donc les sauts ciblent le bon container).
 *
 * `restore` :
 *  - "top"  → ouvre en haut (page projet)
 *  - "work" → restaure la position sauvegardée au clic (retour sur la grille)
 */
export function PageShell({
  children,
  restore,
}: {
  children: React.ReactNode;
  restore?: "top" | "work";
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    const loco = new LocomotiveScroll({
      lenisOptions: {
        wrapper,
        content,
        lerp: 0.1,
        duration: 1.2,
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      },
    });
    registerScroll(loco, wrapper);

    let raf = 0;
    if (restore === "top") {
      wrapper.scrollTop = 0;
      jumpToTop();
    } else if (restore === "work") {
      const raw = sessionStorage.getItem(WORK_SCROLL_KEY);
      if (raw) {
        sessionStorage.removeItem(WORK_SCROLL_KEY);
        const y = Number(raw);
        if (Number.isFinite(y) && y > 0) {
          wrapper.scrollTop = y;
          jumpTo(y);
          // Ré-applique tant que la cible n'est pas atteinte (Lenis se cale /
          // mise en page qui se stabilise), borné à 800ms.
          const start = performance.now();
          const reapply = () => {
            wrapper.scrollTop = y;
            jumpTo(y);
            const max = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
            const reached = wrapper.scrollTop >= Math.min(y, max) - 1;
            if ((!reached || max < y) && performance.now() - start < 800) {
              raf = requestAnimationFrame(reapply);
            }
          };
          raf = requestAnimationFrame(reapply);
        }
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      unregisterScroll(loco);
      loco.destroy();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="page-shell fixed inset-0 overflow-y-auto overscroll-contain"
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
