"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { SRGBColorSpace, type Mesh, type Texture } from "three";
import type { PlayDebugRef } from "./PlayCanvas";

/**
 * `TextureLoader` laisse `colorSpace` à `NoColorSpace` : sans ce marquage,
 * three saute la conversion sRGB → linéaire et l'image sort délavée.
 *
 * Posé via le `onLoad` de drei (appelé en layout effect, donc avant le premier
 * rendu WebGL) plutôt qu'en mutant la texture pendant le rendu React.
 */
function markAsSrgb(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
}

/**
 * Le plane texturé, au ratio réel de l'image.
 *
 * La géométrie est un carré unitaire remis à l'échelle à chaque frame : la
 * largeur du debug pane devient un simple `scale`, sans reconstruire de
 * géométrie.
 *
 * `ratio` = largeur / hauteur de l'image source.
 */
export function ArtifactPlane({
  url,
  ratio,
  debug,
}: {
  url: string;
  ratio: number;
  debug: PlayDebugRef;
}) {
  const meshRef = useRef<Mesh>(null);
  const texture = useTexture(url, markAsSrgb);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { x, y, width } = debug.current.plane;
    mesh.position.set(x, y, 0);
    mesh.scale.set(width, width / ratio, 1);
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}
