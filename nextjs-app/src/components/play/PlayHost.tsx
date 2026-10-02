"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { PlayArtifact } from "@/sanity/queries";
import { PlayCanvas } from "@/components/play/PlayCanvas";

type PlayHostValue = {
  artifacts: PlayArtifact[] | null;
  setArtifacts: (artifacts: PlayArtifact[]) => void;
  /** /play est la page affichée : le canvas est visible et reçoit les gestes. */
  active: boolean;
};

const PlayHostContext = createContext<PlayHostValue | null>(null);

/**
 * Garde la scène 3D de /play en vie tant que le site est ouvert.
 *
 * Monté une fois dans le layout : le canvas n'est créé qu'à la première visite
 * de /play, puis il reste en mémoire — invisible, rendu en pause
 * (`frameloop="never"`), sans écouteurs actifs — quand on navigue ailleurs.
 * Revenir sur /play ne recrée ni le contexte WebGL ni les textures.
 *
 * Fournit aussi `data-play` sur <html>, qui active les curseurs agrandis de
 * /play (cf. globals.css) uniquement sur cette partie du site.
 */
export function PlayHostProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === "/play" || pathname.startsWith("/play/");
  const [artifacts, setArtifactsState] = useState<PlayArtifact[] | null>(null);

  // La première liste reçue suffit : la remplacer reconstruirait toute la scène.
  const value = useMemo<PlayHostValue>(
    () => ({
      artifacts,
      setArtifacts: (next) => setArtifactsState((prev) => prev ?? next),
      active,
    }),
    [artifacts, active],
  );

  useEffect(() => {
    document.documentElement.toggleAttribute("data-play", active);
    return () => document.documentElement.removeAttribute("data-play");
  }, [active]);

  return <PlayHostContext.Provider value={value}>{children}</PlayHostContext.Provider>;
}

/** La scène persistante, à placer dans le layout (sous la navigation, au-dessus des pages). */
export function PlayCanvasHost() {
  const ctx = useContext(PlayHostContext);
  if (!ctx || !ctx.artifacts) return null;
  return <PlayCanvas artifacts={ctx.artifacts} active={ctx.active} />;
}

/**
 * Rendu par la page /play : transmet les artifacts à l'hôte, qui monte (ou
 * réactive) la scène. La page elle-même n'affiche rien.
 */
export function PlayMount({ artifacts }: { artifacts: PlayArtifact[] }) {
  const ctx = useContext(PlayHostContext);
  const setArtifacts = ctx?.setArtifacts;
  useEffect(() => {
    setArtifacts?.(artifacts);
  }, [artifacts, setArtifacts]);
  return null;
}
