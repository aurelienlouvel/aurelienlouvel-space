import { client } from "@/sanity/client";
import { playArtifactsQuery, type PlayArtifact } from "@/sanity/queries";
import { PlayCanvas } from "@/components/play/PlayCanvas";

export const revalidate = 60;

export default async function PlayPage() {
  const artifacts = await client.fetch<PlayArtifact[]>(playArtifactsQuery);
  return <PlayCanvas artifacts={artifacts} />;
}
