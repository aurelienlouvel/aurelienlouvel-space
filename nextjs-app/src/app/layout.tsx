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
      {/* Supplementary animated favicon — file-convention icons (favicon.ico,
          icon.png, apple-icon.png) don't support animation, so this is added
          manually. React hoists it into <head> alongside them. GIF (not
          webp — browsers don't treat webp as a valid favicon format at all,
          even statically) animates in Firefox always, and in Chrome/Edge
          while the tab is active; Safari shows the first frame only. */}
      <link
        rel="icon"
        type="image/gif"
        href="/favicon.gif"
        sizes="512x512"
      />
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
