import type { Metadata } from "next";
import localFont from "next/font/local";
import { unstable_cache } from "next/cache";
import "./globals.css";
import { ActionBar } from "@/components/nav/ActionBar";
import { ActionBarProvider } from "@/contexts/ActionBarContext";
import { ScrollInit } from "@/components/ScrollInit";
import { PlayCanvas } from "@/components/layout/PlayCanvas";
import { BodyTheme } from "@/components/BodyTheme";
import { client } from "@/sanity/client";
import {
  artifactsCanvasQuery,
  type ArtifactCanvasItem,
} from "@/sanity/queries";

const neueMontreal = localFont({
  src: "./fonts/PPNeueMontreal-Variable.ttf",
  variable: "--font-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "oré ˖ ࣪⊹) product designer",
  description: "aurélien louvel's internet space",
};

const getCachedArtifacts = unstable_cache(
  async (): Promise<ArtifactCanvasItem[]> =>
    client.fetch<ArtifactCanvasItem[]>(artifactsCanvasQuery),
  ["play-artifacts"],
  { revalidate: 300 },
);

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const artifacts = await getCachedArtifacts().catch(
    () => [] as ArtifactCanvasItem[],
  );

  return (
    <html lang="en" className={`${neueMontreal.variable} antialiased`}>
      <body className="min-h-dvh bg-white text-foreground">
        <BodyTheme />
        <ActionBarProvider>
          <PlayCanvas artifacts={artifacts} />
          <ScrollInit />
          {children}
          <ActionBar />
        </ActionBarProvider>
      </body>
    </html>
  );
}
