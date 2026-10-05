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
  async headers() {
    return [
      {
        // Le staging (staging.aurelienlouvel.space) est public (on le partage)
        // mais ne doit pas être indexé. Conditionné au domaine : la règle peut
        // suivre le code jusqu'à `production` sans effet. Pas de robots.txt
        // `Disallow` : il empêcherait les robots de lire ce noindex.
        source: "/:path*",
        has: [{ type: "host", value: "^staging\\.aurelienlouvel\\.space$" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
