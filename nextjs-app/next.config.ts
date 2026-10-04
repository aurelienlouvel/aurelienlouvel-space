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
        // Le staging (staging.oré.space) est public (on le partage) mais ne
        // doit pas être indexé. Conditionné au domaine : la règle peut suivre
        // le code jusqu'à `production` sans effet. Le Host arrive en punycode
        // (oré → xn--or-cja). `preprod.ore.today`, l'ancien domaine du staging,
        // sera à retirer une fois qu'il redirige. Pas de robots.txt
        // `Disallow` : il empêcherait les robots de lire ce noindex.
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "^(staging\\.xn--or-cja\\.space|preprod\\.ore\\.today)$",
          },
        ],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
