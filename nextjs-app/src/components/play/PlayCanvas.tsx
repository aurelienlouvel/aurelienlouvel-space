"use client";

import { Suspense, useMemo, useRef, useState, type RefObject } from "react";
import dynamic from "next/dynamic";
import { Canvas, useFrame } from "@react-three/fiber";
import { buildImageUrl } from "@/lib/sanity-image";
import type { PlayArtifact } from "@/sanity/queries";
import { ArtifactPlane } from "./ArtifactPlane";
import { FocusIndicator } from "./FocusIndicator";

/**
 * État mutable du canvas : tweakpane écrit dedans, les `useFrame` le lisent et
 * l'appliquent à la scène. Rien ne passe par `useState`, donc aucun re-render
 * React par frame.
 *
 * Il voyage dans une `RefObject` plutôt qu'en valeur nue : c'est ce qui permet
 * aux enfants de ne le lire qu'en dehors du rendu, là où muter est légitime.
 */
export type PlayDebugState = {
  plane: { x: number; y: number; width: number; radius: number };
  brackets: {
    padding: number;
    radius: number;
    angle: number;
    arm: number;
    thickness: number;
    color: string;
  };
  camera: { x: number; y: number; zoom: number };
};

export type PlayDebugRef = RefObject<PlayDebugState>;

/**
 * Plane à l'ouverture. La caméra étant orthographique à zoom 1, une unité monde
 * vaut un pixel CSS : 480 unités = 480 px à l'écran.
 *
 * Le plane est remonté au-dessus du centre : l'`ActionBar` est ancrée en bas de
 * la fenêtre, et l'image se poserait sinon dessus.
 */
const PLANE_WIDTH = 480;
const PLANE_RADIUS = 32;
const PLANE_Y = 48;

/**
 * Brackets à l'ouverture. L'angle est l'ouverture de l'arc de coin, en degrés :
 * à 90° il couvre tout le coin et les bras longent les bords de l'image ; en
 * deçà l'arc se raccourcit et les bras, qui lui restent tangents, s'écartent
 * d'autant.
 */
const BRACKET_PADDING = 20;
const BRACKET_RADIUS = 48;
const BRACKET_ANGLE = 90;
const BRACKET_ARM = 8;
const BRACKET_THICKNESS = 4;

/**
 * En littéral : three ne sait pas parser `oklch()`, et une CSS variable n'a de
 * toute façon pas de sens dans le canvas. Ce gris est proche du `zinc-400` de
 * Tailwind sans en venir — la palette v4 est en oklch, et le `zinc-400`
 * installé rasterise à `#9f9fa9`.
 */
const BRACKET_COLOR = "#a1a1aa";

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
    plane: { x: 0, y: PLANE_Y, width: PLANE_WIDTH, radius: PLANE_RADIUS },
    brackets: {
      padding: BRACKET_PADDING,
      radius: BRACKET_RADIUS,
      angle: BRACKET_ANGLE,
      arm: BRACKET_ARM,
      thickness: BRACKET_THICKNESS,
      color: BRACKET_COLOR,
    },
    camera: { x: 0, y: 0, zoom: 1 },
  });

  // Le survol vit en state React, pas dans `debug` : il change sur événement,
  // jamais par frame, donc un re-render par entrée/sortie ne coûte rien.
  const [hovered, setHovered] = useState(false);

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
          <>
            <Suspense fallback={null}>
              <ArtifactPlane
                url={source.url}
                ratio={source.ratio}
                debug={debug}
                onHoverChange={setHovered}
              />
            </Suspense>
            {/* Hors du Suspense : l'indicateur n'attend aucune texture, et il
                ne peut de toute façon pas être survolé avant le plane. */}
            <FocusIndicator
              ratio={source.ratio}
              debug={debug}
              active={hovered}
            />
          </>
        )}
      </Canvas>
      {PlayDebug && <PlayDebug state={debug} />}
    </div>
  );
}
