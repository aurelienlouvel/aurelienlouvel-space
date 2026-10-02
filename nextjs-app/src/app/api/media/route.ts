import { projectId } from "@/sanity/env";

/**
 * Proxy same-origin des médias Sanity pour le canvas /play.
 *
 * Three.js charge les textures (images et vidéos) en mode CORS depuis le
 * navigateur. Quand la CDN de Sanity répond 403 à ces requêtes directes
 * (« Could not load … » sur toute la mosaïque), on les fait passer par le
 * serveur : le navigateur parle à son propre domaine — plus de CORS, plus de
 * dépendance à l'origine de la page — et le serveur va chercher l'asset.
 *
 * Sécurité : uniquement les assets de CE projet sur cdn.sanity.io, jamais
 * une URL arbitraire (pas de proxy ouvert). Les assets Sanity sont adressés
 * par contenu, donc cache immuable d'un an en cas de succès.
 */

export const dynamic = "force-dynamic";

const HOST = "cdn.sanity.io";
const ALLOWED_PREFIXES = [`/images/${projectId}/`, `/files/${projectId}/`];

// Seuls ces en-têtes de la réponse amont sont relayés (vidéo : ranges).
const FORWARDED = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u");
  if (!raw) return new Response("Missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (
    target.protocol !== "https:" ||
    target.hostname !== HOST ||
    !ALLOWED_PREFIXES.some((p) => target.pathname.startsWith(p))
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstreamHeaders: Record<string, string> = {
    Accept: request.headers.get("accept") ?? "*/*",
    "Accept-Encoding": "identity",
  };
  const range = request.headers.get("range");
  if (range) upstreamHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers: upstreamHeaders, cache: "no-store" });
  } catch {
    return new Response("Upstream unreachable", { status: 502 });
  }

  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set(
    "Cache-Control",
    upstream.ok
      ? "public, max-age=31536000, immutable"
      : "no-store",
  );

  return new Response(upstream.body, { status: upstream.status, headers });
}
