import { client } from "@/sanity/client";
import { playArtifactQuery, type PlayArtifact } from "@/sanity/queries";
import { PlayCanvas } from "@/components/play/PlayCanvas";

export const revalidate = 60;

export default async function PlayPage() {
  const artifact = await client.fetch<PlayArtifact | null>(playArtifactQuery);
  return <PlayCanvas artifact={artifact} />;
}
