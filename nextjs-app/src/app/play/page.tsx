import { client } from "@/sanity/client";
import { playArtifactsQuery, type PlayArtifact } from "@/sanity/queries";
import { PlayMount } from "@/components/play/PlayHost";

export const revalidate = 60;

export default async function PlayPage() {
  const artifacts = await client.fetch<PlayArtifact[]>(playArtifactsQuery);
  // La scène 3D vit dans le layout (cf. PlayHost) : la page ne fait que lui passer les données.
  return <PlayMount artifacts={artifacts} />;
}
