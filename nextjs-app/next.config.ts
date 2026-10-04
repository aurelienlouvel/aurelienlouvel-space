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
        // Production = la landing seule : toute page autre que la racine y
        // renvoie, les routes WIP (/work, /play, /info, /api) ne sont pas
        // exposées. `_next`, `_vercel` et les fichiers (extension) restent
        // servis.
        source: "/:path((?!_next/|_vercel/|.*\\..*).+)",
        destination: "/",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // Le staging (preprod.ore.today) est public (on le partage) mais ne
        // doit pas être indexé. Conditionné au domaine : la règle peut suivre
        // le code jusqu'à `production` sans effet. Pas de robots.txt
        // `Disallow` : il empêcherait les robots de lire ce noindex.
        source: "/:path*",
        has: [{ type: "host", value: "^preprod\\.ore\\.today$" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
