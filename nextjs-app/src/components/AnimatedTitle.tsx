"use client";

import { useEffect } from "react";

/**
 * Anime le <title> de l'onglet façon éditeur de texte (frappe et curseur).
 * Cycle, en boucle :
 *
 *   product designer
 *   → product builder   (« designer » effacé lettre à lettre, « builder » écrit)
 *   → product designer  (« builder » effacé lettre à lettre, « designer » réécrit)
 *   → brand designer    (curseur à gauche sur « product », effacé, « brand » écrit)
 *   → product designer  (« brand » effacé lettre à lettre, « product » réécrit)
 *
 * Toujours lettre par lettre, avec un curseur visible (« _ ») qui se déplace.
 *
 * Le préfixe est lu dans le <title> rendu côté serveur (metadata de layout.tsx), qui
 * reste statique pour le SEO et les partages. L'animation ne démarre que si le titre
 * se termine par « product designer », et s'arrête si l'onglet est masqué
 * (les timers y sont bridés à 1 s) ou si `prefers-reduced-motion` est actif.
 */

const ROLE = "product designer";
const CARET = "_";

// Rythme (ms).
const T_BACKSPACE = 130;
const T_TYPE = 150;
const T_SWEEP = 110;

export function AnimatedTitle() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const base = document.title;
    if (!base.endsWith(ROLE)) return;
    const prefix = base.slice(0, -ROLE.length);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let text = ROLE;
    let caret = text.length;

    const draw = (showCaret: boolean) => {
      document.title =
        prefix +
        text.slice(0, caret) +
        (showCaret ? CARET : "") +
        text.slice(caret);
    };

    const whenVisible = () =>
      new Promise<void>((resolve) => {
        const onChange = () => {
          if (!document.hidden) {
            document.removeEventListener("visibilitychange", onChange);
            resolve();
          }
        };
        document.addEventListener("visibilitychange", onChange);
      });

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    // Onglet masqué : on fige le titre au repos et on attend son retour.
    const guard = async () => {
      if (document.hidden) {
        text = ROLE;
        caret = text.length;
        draw(false);
        await whenVisible();
      }
    };

    const step = async (ms: number) => {
      await sleep(ms);
      await guard();
    };

    const backspace = async (n: number, ms = T_BACKSPACE) => {
      for (let i = 0; i < n && !cancelled; i++) {
        text = text.slice(0, caret - 1) + text.slice(caret);
        caret--;
        draw(true);
        await step(ms);
      }
    };

    const typeStr = async (str: string, ms = T_TYPE) => {
      for (const ch of str) {
        if (cancelled) return;
        text = text.slice(0, caret) + ch + text.slice(caret);
        caret++;
        draw(true);
        await step(ms + Math.random() * 70);
      }
    };

    const moveLeft = async (n: number, ms = T_SWEEP) => {
      for (let i = 0; i < n && !cancelled; i++) {
        caret--;
        draw(true);
        await step(ms);
      }
    };

    // Curseur qui clignote pendant `ms`.
    const blink = async (ms: number) => {
      const end = Date.now() + ms;
      let on = true;
      while (!cancelled && Date.now() < end) {
        draw(on);
        await step(Math.min(500, end - Date.now()));
        on = !on;
      }
    };

    const run = async () => {
      while (!cancelled) {
        // 1. product designer (repos, sans curseur).
        text = ROLE;
        caret = text.length;
        draw(false);
        await step(3500);
        if (cancelled) return;

        // 2. product builder : « designer » effacé (product desig_), « builder » écrit.
        draw(true);
        await step(600);
        await backspace(8);
        await step(500);
        await typeStr("builder");
        await blink(2800);

        // 3. product designer : « builder » effacé lettre à lettre, « designer » réécrit.
        await backspace(7);
        await step(500);
        await typeStr("designer");
        await blink(2800);

        // 4. brand designer : curseur à gauche sur « product », effacé, « brand » écrit.
        await moveLeft(9);
        await blink(500);
        await backspace(7);
        await step(400);
        await typeStr("brand");
        await blink(2800);

        // 5. retour à product designer : « brand » effacé lettre à lettre.
        await backspace(5);
        await step(400);
        await typeStr("product");
        await blink(800);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.title = base;
    };
  }, []);

  return null;
}
