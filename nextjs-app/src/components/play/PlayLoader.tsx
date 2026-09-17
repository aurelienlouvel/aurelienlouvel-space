"use client";

import { AnimatePresence, motion } from "motion/react";

/**
 * Recouvre le canvas tant que les thumbnails ne sont pas toutes en cache HTTP
 * (cf. le préchargement DOM dans `PlayCanvas`). La barre suit une progression
 * réelle (`loaded` / `total`), pas une durée fixe simulée — contrairement à
 * l'ancienne `LoadingBar` (avant suppression, cf. historique git), qui
 * animait un temps arbitraire sans lien avec le chargement effectif.
 *
 * `<Canvas>` ne monte qu'une fois `loading` devenu faux côté `PlayCanvas` :
 * pas de pop-in progressif des artifacts, l'un des choix actés avec
 * l'utilisateur pour cette mise en scène.
 */
export function PlayLoader({
  loaded,
  total,
  isReady = false,
}: {
  loaded: number;
  total: number;
  isReady?: boolean;
}) {
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <AnimatePresence>
      {!isReady && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-white pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-[3px] w-16 overflow-hidden rounded-full bg-stone-200">
              <motion.div
                className="h-full rounded-full bg-stone-400"
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
            <span className="text-xs tabular-nums text-stone-400">{percent}%</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
