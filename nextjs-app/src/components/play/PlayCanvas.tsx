"use client";

import { Suspense, useMemo, useRef, type RefObject } from "react";
import dynamic from "next/dynamic";
import { Canvas, useFrame } from "@react-three/fiber";
import { buildImageUrl } from "@/lib/sanity-image";
import type { PlayArtifact } from "@/sanity/queries";
import { ArtifactPlane } from "./ArtifactPlane";

/**
 * État mutable du canvas : tweakpane écrit dedans, les `useFrame` le lisent et
 * l'appliquent à la scène. Rien ne passe par `useState`, donc aucun re-render
 * React par frame.
 *
 * Il voyage dans une `RefObject` plutôt qu'en valeur nue : c'est ce qui permet
 * aux enfants de ne le lire qu'en dehors du rendu, là où muter est légitime.
 */
export type PlayDebugState = {
  plane: { x: number; y: number; width: number };
  camera: { x: number; y: number; zoom: number };
};

export type PlayDebugRef = RefObject<PlayDebugState>;

/**
 * Largeur du plane à l'ouverture. La caméra étant orthographique à zoom 1,
 * une unité monde vaut un pixel CSS : 640 unités = 640 px à l'écran.
 */
const PLANE_WIDTH = 640;

/** Texture tirée au double de la largeur du plane, pour les écrans retina. */
const TEXTURE_WIDTH = PLANE_WIDTH * 2;

/**
 * Tweakpane reste hors du bundle de prod (la condition est statiquement
 * éliminée au build) et hors du SSR (`ssr: false`, il touche au `document`).
 */
const PlayDebug =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("./PlayDebug").then((m) => m.PlayDebug), {
        ssr: false,
      })
    : null;

/**
 * Applique l'état debug à la caméra, une fois par frame.
 *
 * La caméra est prise sur l'état passé à `useFrame` plutôt que via `useThree` :
 * c'est le même objet, mais il arrive en argument de callback, donc le muter
 * n'est pas le détournement d'une valeur retournée par un hook.
 */
function CameraRig({ debug }: { debug: PlayDebugRef }) {
  useFrame((state) => {
    const { camera } = state;
    const target = debug.current.camera;
    camera.position.x = target.x;
    camera.position.y = target.y;
    // Seul le zoom invalide la matrice de projection — ne la recalcule que
    // lorsqu'il bouge vraiment.
    if (camera.zoom !== target.zoom) {
      camera.zoom = target.zoom;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

export function PlayCanvas({ artifact }: { artifact: PlayArtifact | null }) {
  const debug = useRef<PlayDebugState>({
    plane: { x: 0, y: 0, width: PLANE_WIDTH },
    camera: { x: 0, y: 0, zoom: 1 },
  });

  const ref = artifact?.image?.ref ?? null;
  const width = artifact?.image?.width ?? null;
  const height = artifact?.image?.height ?? null;

  const source = useMemo(() => {
    if (!ref || !width || !height) return null;
    return {
      url: buildImageUrl(ref, null, null, null, { width: TEXTURE_WIDTH }),
      ratio: width / height,
    };
  }, [ref, width, height]);

  return (
    <div className="fixed inset-0 bg-white">
      <Canvas
        // `flat` coupe le tone mapping ACES appliqué par défaut : on veut
        // l'image telle qu'elle est, pas une version gradée.
        flat
        orthographic
        dpr={[1, 2]}
        camera={{ position: [0, 0, 100], zoom: 1, near: 0.1, far: 1000 }}
      >
        <CameraRig debug={debug} />
        {source && (
          <Suspense fallback={null}>
            <ArtifactPlane
              url={source.url}
              ratio={source.ratio}
              debug={debug}
            />
          </Suspense>
        )}
      </Canvas>
      {PlayDebug && <PlayDebug state={debug} />}
    </div>
  );
}
