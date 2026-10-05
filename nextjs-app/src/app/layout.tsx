import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ActionBar } from "@/components/nav/ActionBar";
import { ActionBarProvider } from "@/contexts/ActionBarContext";
import { ScrollInit } from "@/components/ScrollInit";
import { BodyTheme } from "@/components/BodyTheme";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import { PlayCanvasHost, PlayHostProvider } from "@/components/play/PlayHost";

const neueMontreal = localFont({
  src: "./fonts/PPNeueMontreal-Variable.ttf",
  variable: "--font-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  // The apex is the primary domain (www and the old domains redirect to it):
  // link previews (opengraph-image.png) must cite it, not the host Next would
  // otherwise guess from Vercel's env vars.
  metadataBase: new URL("https://aurelienlouvel.space"),
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${neueMontreal.variable} antialiased`}>
      <body className="min-h-dvh bg-white text-foreground">
        <BodyTheme />
        <AnimatedTitle />
        <ActionBarProvider>
          <PlayHostProvider>
            <ScrollInit />
            {children}
            {/* Scène 3D de /play : montée une seule fois, gardée en vie entre les pages. */}
            <PlayCanvasHost />
            <ActionBar />
          </PlayHostProvider>
        </ActionBarProvider>
      </body>
    </html>
  );
}
