import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: "/files/87awwrcu/**",
      },
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: "/images/87awwrcu/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        // Prod = la landing seule : toute page autre que la racine y renvoie,
        // les routes WIP (/work, /play, /info, /api) ne sont pas exposées.
        // `_next`, `_vercel` et les fichiers (extension) restent servis.
        source: "/:path((?!_next/|_vercel/|.*\\..*).+)",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
