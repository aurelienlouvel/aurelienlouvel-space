import type { NextConfig } from "next";
import { withMotionStudio } from "motion-studio/next";

// `satisfies` plutôt qu'une annotation : le type attendu par `withMotionStudio` n'accepte pas `NextConfig`
// tel quel (son `turbopack` n'a pas de signature d'index), mais les clés restent vérifiées par Next.
const nextConfig = {
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
} satisfies NextConfig;

// Motion Studio (éditeur d'animations) : le wrapper ne s'active que sous `next dev`, les builds et
// `next start` restent intacts. Il se complète du serveur Studio, à lancer à côté du serveur de dev :
// `pnpm exec motion-studio serve` (http://localhost:5200).
export default withMotionStudio(nextConfig);
