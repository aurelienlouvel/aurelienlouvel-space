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
  decorationsQuery,
  type Decorations,
} from "@/sanity/queries";

const neueMontreal = localFont({
  src: "./fonts/PPNeueMontreal-Variable.ttf",
  variable: "--font-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "oré ˖ ࣪⊹) product designer",
  description: "aurélien louvel's internet space",
  icons: {
    // Supplementary animated favicon, additive to the file-convention icons
    // (favicon.ico, icon.png, icon.svg) which don't support animation. Must
    // go through the `icons` metadata field — not a hand-rolled <link> in
    // the JSX tree — because only this path is resolved into real <head>
    // HTML at SSR time; a plain <link> here only ends up in the RSC flight
    // payload and never reaches the actual server-rendered head. GIF (not
    // webp — browsers don't treat webp as a valid favicon format at all,
    // even statically) animates in Firefox always, and in Chrome/Edge while
    // the tab is active; Safari shows the first frame only.
    icon: [{ url: "/favicon.gif", type: "image/gif", sizes: "512x512" }],
  },
};

const getCachedArtifacts = unstable_cache(
  async (): Promise<ArtifactCanvasItem[]> =>
    client.fetch<ArtifactCanvasItem[]>(artifactsCanvasQuery),
  ["play-artifacts"],
  { revalidate: 300 },
);

const getCachedDecorations = unstable_cache(
  async (): Promise<Decorations | null> =>
    client.fetch<Decorations | null>(decorationsQuery),
  ["play-decorations"],
  { revalidate: 300 },
);

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [artifacts, decorations] = await Promise.all([
    getCachedArtifacts().catch(() => [] as ArtifactCanvasItem[]),
    getCachedDecorations().catch(() => null),
  ]);

  const customDoodles = (decorations?.doodles ?? []).flatMap((d) =>
    d.url
      ? [{ url: d.url, aspect: d.width && d.height ? d.height / d.width : 1 }]
      : [],
  );

  return (
    <html lang="en" className={`${neueMontreal.variable} antialiased`}>
      <body className="min-h-dvh bg-white text-foreground">
        <BodyTheme />
        <ActionBarProvider>
          <PlayCanvas artifacts={artifacts} customDoodles={customDoodles} />
          <ScrollInit />
          {children}
          <ActionBar />
        </ActionBarProvider>
      </body>
    </html>
  );
}
