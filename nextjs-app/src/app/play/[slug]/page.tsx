import { notFound } from "next/navigation";
import { client } from "@/sanity/client";
import {
  playArtifactsQuery,
  allArtifactSlugsQuery,
  type PlayArtifact,
} from "@/sanity/queries";
import { PlayCanvas } from "@/components/play/PlayCanvas";

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await client.fetch<Array<{ slug: string }>>(
    allArtifactSlugsQuery,
  );
  return slugs.map((s) => ({ slug: s.slug }));
}

export default async function PlaySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artifacts = await client.fetch<PlayArtifact[]>(playArtifactsQuery);
  const exists = artifacts.some((a) => a.slug === slug);
  if (!exists) notFound();

  return <PlayCanvas artifacts={artifacts} initialSlug={slug} />;
}
