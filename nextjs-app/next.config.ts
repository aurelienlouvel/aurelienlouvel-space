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
        // preprod.ore.today est publique (on la partage) mais ne doit pas être
        // indexée. Conditionné au domaine : la règle peut suivre le code jusqu'en
        // prod sans effet. Pas de robots.txt `Disallow` : il empêcherait les
        // robots de lire ce noindex.
        source: "/:path*",
        has: [{ type: "host", value: "^preprod\\.ore\\.today$" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
