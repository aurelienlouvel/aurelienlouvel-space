import { formatDateTime } from "@/lib/date-utils";
import { XMLParser } from "fast-xml-parser";

type StatsHuntersActivity = {
  id: number;
  name: string;
  avg: number;
  moving_time: number;
  distance: number;
  average_heartrate: number;
  total_elevation_gain: number;
  type: string;
  date: string;
  lat: number;
  lng: number;
};

// `/api/activities/lines` returns each activity's real Strava route as a
// Google/Leaflet-encoded polyline (precision 5) — the same format StatsHunters'
// own frontend decodes with `L.PolylineUtil.decode`.
type StatsHuntersLine = {
  id: number;
  data: string;
};

export type StravaActivityEntry = {
  activityName: string;
  activityType: string;
  speedKmh: number;
  distanceKm: number;
  durationMin: number;
  bpm: number | null;
  elevationM: number;
  date: string;
  // Real GPS route, decoded from StatsHunters' polyline endpoint and
  // simplified — used to draw a route-shaped line backdrop on the card.
  path: { lat: number; lng: number }[];
  // Reverse-geocoded "City, Country" label, e.g. "Paris, France".
  city: string | null;
};

type NominatimResult = {
  lat: string;
  lon: string;
  // [south, north, west, east] as strings
  boundingbox?: string[];
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    country?: string;
  };
};

// Standard encoded-polyline decoder (Google's algorithm, precision 5).
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const factor = 1e5;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: { lat: number; lng: number }[] = [];
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

function perpendicularDistance(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dx = b.lat - a.lat;
  const dy = b.lng - a.lng;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.lat - a.lat, p.lng - a.lng);
  }
  const t =
    ((p.lat - a.lat) * dx + (p.lng - a.lng) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p.lat - (a.lat + t * dx), p.lng - (a.lng + t * dy));
}

// Ramer-Douglas-Peucker: thins a raw GPS trace to its structurally meaningful
// points before the card smooths it with Catmull-Rom — otherwise every bit
// of GPS jitter would show up as visible wobble in the smoothed line.
// epsilon ~0.00008deg is roughly 9m at these latitudes.
function simplifyPath(
  points: { lat: number; lng: number }[],
  epsilon: number,
): { lat: number; lng: number }[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

// Reverse-geocodes an activity's start point to a "City, Country" label via
// the same Nominatim API getMapData already uses for forward geocoding
// below. zoom=10 targets city/town-level results (vs. e.g. 18 for a
// building). Coordinates are rounded to ~100m so nearby/repeated routes
// share a cache entry instead of each hitting Nominatim individually.
// `municipality` is checked before `city`/`town`/`village`: small communes
// swallowed into a bigger agglomeration (e.g. Vouillé within Niort) tag the
// specific hamlet as `village` and the recognizable parent as
// `municipality` — for a location label the parent reads better.
async function reverseGeocodeCity(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}&format=json&addressdetails=1&zoom=10`,
      {
        next: { revalidate: 86400 },
        headers: { "User-Agent": "ore-portfolio/1.0" },
      },
    );
    if (!res.ok) return null;
    const place: NominatimResult = await res.json();
    const city =
      place.address?.municipality ??
      place.address?.city ??
      place.address?.town ??
      place.address?.village ??
      null;
    const country = place.address?.country ?? null;
    if (!city) return country;
    return country ? `${city}, ${country}` : city;
  } catch {
    return null;
  }
}

export async function getStravaActivities(
  shareUrl: string | null,
  count = 3,
): Promise<StravaActivityEntry[]> {
  if (!shareUrl) return [];
  // Accept a full StatsHunters share link and extract the hash
  const match = shareUrl.match(/share\/([a-zA-Z0-9]+)/);
  const shareHash = match?.[1] ?? null;
  if (!shareHash) return [];
  try {
    const sessionRes = await fetch(
      `https://www.statshunters.com/share/${shareHash}`,
      { next: { revalidate: 300 } },
    );
    const setCookies: string[] =
      (
        sessionRes.headers as Headers & { getSetCookie?(): string[] }
      ).getSetCookie?.() ?? [];
    const cookies: Record<string, string> = {};
    for (const header of setCookies) {
      const [nameValue] = header.split(";");
      const eqIdx = nameValue.indexOf("=");
      if (eqIdx > -1) {
        cookies[nameValue.slice(0, eqIdx).trim()] = nameValue
          .slice(eqIdx + 1)
          .trim();
      }
    }
    const xsrfToken = decodeURIComponent(cookies["XSRF-TOKEN"] ?? "");
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const headers = {
      "X-Requested-With": "XMLHttpRequest",
      "X-XSRF-TOKEN": xsrfToken,
      Accept: "application/json",
      Cookie: cookieStr,
    };
    const [apiRes, linesRes] = await Promise.all([
      fetch(
        `https://www.statshunters.com/share/${shareHash}/api/activities?page=1`,
        { cache: "no-store", headers },
      ),
      fetch(
        `https://www.statshunters.com/share/${shareHash}/api/activities/lines?page=1`,
        { cache: "no-store", headers },
      ),
    ]);
    if (!apiRes.ok) return [];
    const data = await apiRes.json();
    const activities: StatsHuntersActivity[] = data.activities ?? [];
    if (activities.length === 0) return [];
    // API returns oldest→newest — take the last `count` and reverse so the
    // most recent activity shows first (round 0).
    const latest = activities.slice(-count).reverse();

    // Real GPS polylines, keyed by activity id. Best-effort: if this
    // endpoint fails, activities still render without a route backdrop.
    // Only decode/simplify the ones we're actually going to show.
    const pathById = new Map<number, { lat: number; lng: number }[]>();
    if (linesRes.ok) {
      const linesData = await linesRes.json();
      const lines: StatsHuntersLine[] = linesData.activities ?? [];
      const latestIds = new Set(latest.map((a) => a.id));
      for (const line of lines) {
        if (!latestIds.has(line.id)) continue;
        pathById.set(line.id, simplifyPath(decodePolyline(line.data), 0.00008));
      }
    }

    // City per activity, from the start lat/lng StatsHunters already
    // returns (no need to touch the polyline for this). Sequential, not
    // Promise.all'd — Nominatim's usage policy asks for max ~1 req/s, and
    // this only runs on background ISR revalidation, not per page view.
    const cityById = new Map<number, string | null>();
    for (const a of latest) {
      cityById.set(a.id, await reverseGeocodeCity(a.lat, a.lng));
    }

    return latest.map((a) => ({
      activityName: a.name,
      activityType: a.type,
      speedKmh: Math.round(a.avg * 10) / 10,
      distanceKm: Math.round(a.distance / 100) / 10,
      durationMin: Math.round(a.moving_time / 60),
      bpm: a.average_heartrate > 0 ? Math.round(a.average_heartrate) : null,
      elevationM: Math.round(a.total_elevation_gain),
      // Full datetime (StatsHunters returns "YYYY-MM-DD HH:MM:SS")
      date: a.date.replace(" ", "T"),
      path: pathById.get(a.id) ?? [],
      city: cityById.get(a.id) ?? null,
    }));
  } catch {
    return [];
  }
}

type GitHubRepo = {
  name: string;
  full_name: string;
  pushed_at: string;
  fork: boolean;
};

type GitHubCommit = {
  commit: {
    message: string;
    author: { date: string };
  };
};

type ForecastResult = {
  current?: { temperature_2m?: number; weather_code?: number };
  timezone?: string;
};

export async function getLatestCommit(username: string | null) {
  if (!username) return null;
  try {
    // Find the most recently pushed (non-fork) public repo
    const reposRes = await fetch(
      `https://api.github.com/users/${username}/repos?sort=pushed&per_page=10`,
      {
        next: { revalidate: 60 },
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!reposRes.ok) return null;
    const repos: GitHubRepo[] = await reposRes.json();
    const repo = repos.find((r) => !r.fork) ?? repos[0];
    if (!repo) return null;

    // Latest commit on that repo's default branch
    const commitsRes = await fetch(
      `https://api.github.com/repos/${repo.full_name}/commits?per_page=1`,
      {
        next: { revalidate: 60 },
        headers: { Accept: "application/vnd.github+json" },
      },
    );
    if (!commitsRes.ok) return null;
    const commits: GitHubCommit[] = await commitsRes.json();
    const latest = commits[0];
    if (!latest) return null;

    return {
      repo: repo.name,
      message: latest.commit.message.split("\n")[0],
      date: formatDateTime(latest.commit.author.date),
    };
  } catch {
    return null;
  }
}

export async function getMapData(address: string | null) {
  if (!address) return null;
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`,
      {
        next: { revalidate: 86400 },
        headers: { "User-Agent": "ore-portfolio/1.0" },
      },
    );
    if (!geoRes.ok) return null;
    const geo: NominatimResult[] = await geoRes.json();
    const place = geo?.[0];
    if (!place) return null;

    const latitude = parseFloat(place.lat);
    const longitude = parseFloat(place.lon);
    const city =
      place.address?.city ??
      place.address?.town ??
      place.address?.village ??
      place.address?.municipality ??
      null;
    const country = place.address?.country ?? null;

    // Map now uses a static image — keep these for backwards compat with the type.
    let temperature: number | null = null;
    let weatherCode: number | null = null;
    let timezone: string | null = null;
    try {
      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`,
        { next: { revalidate: 1800 } },
      );
      if (wxRes.ok) {
        const wx: ForecastResult = await wxRes.json();
        temperature = wx.current?.temperature_2m ?? null;
        weatherCode = wx.current?.weather_code ?? null;
        timezone = wx.timezone ?? null;
      }
    } catch {
      // weather is best-effort
    }

    return {
      lat: latitude,
      lon: longitude,
      label: city && country ? `${city}, ${country}` : (country ?? null),
      timezone,
      temperature,
      weatherCode,
    };
  } catch {
    return null;
  }
}

type ContributionDay = { date: string; count: number; level: number };

export async function getGitHubContributions(username: string | null) {
  if (!username) return null;
  try {
    const res = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${username}?y=last`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const data: {
      total?: Record<string, number>;
      contributions?: ContributionDay[];
    } = await res.json();
    const all = data.contributions ?? [];
    if (all.length === 0) return null;
    // Keep the most recent 8 weeks of weekdays only (Mon–Fri)
    const WEEKS = 8;
    const weekdays = all.filter((d) => {
      const day = new Date(d.date + "T00:00:00").getDay();
      return day >= 1 && day <= 5;
    });
    const recent = weekdays.slice(-WEEKS * 5);
    const total = recent.reduce((sum, d) => sum + d.count, 0);
    return {
      days: recent.map((d) => ({ level: d.level })),
      total,
    };
  } catch {
    return null;
  }
}

type ItunesTrack = {
  wrapperType?: string;
  kind?: string;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

export async function getAppleMusicData(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // ?i= param = track inside an album URL; fallback to last path segment for /song/ URLs
    const trackIdStr =
      parsed.searchParams.get("i") ??
      parsed.pathname.split("/").filter(Boolean).pop();
    const trackId = Number(trackIdStr);
    if (!trackId || isNaN(trackId)) return null;

    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${trackId}&entity=song`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const track: ItunesTrack | undefined = (data.results ?? []).find(
      (r: ItunesTrack) => r.wrapperType === "track" || r.kind === "song",
    );
    if (!track) return null;
    return {
      artworkUrl:
        track.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
      trackName: track.trackName ?? null,
      artistName: track.artistName ?? null,
      previewUrl: track.previewUrl ?? null,
    };
  } catch {
    return null;
  }
}

export type AppleMusicTrack = {
  url: string;
  artworkUrl: string | null;
  trackName: string | null;
  artistName: string | null;
  previewUrl: string | null;
};

type AppleMusicSection = {
  id?: string;
  items?: { contentDescriptor?: { url?: string } }[];
};

// Apple Music's newer alphanumeric playlist ids (pl.xxxxx) aren't supported
// by the iTunes Lookup API that getAppleMusicData uses — only single
// track/album ids are. Instead, scrape the playlist's own page: it embeds
// the full track listing as JSON in a `serialized-server-data` script tag,
// split into sections by row type, with the tracks under the section whose
// id starts with "track-list". Each item's contentDescriptor.url is a
// normal track URL, so it's resolved for full detail (artwork, preview URL —
// not present in this scrape) via the existing getAppleMusicData.
export async function getAppleMusicPlaylistTracks(
  url: string | null,
  count = 3,
): Promise<AppleMusicTrack[]> {
  if (!url) return [];
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(
      /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/,
    );
    if (!match) return [];

    const parsed = JSON.parse(match[1]) as {
      data?: Array<{ data?: { sections?: AppleMusicSection[] } }>;
    };
    const sections = parsed.data?.[0]?.data?.sections ?? [];
    const trackSection = sections.find((s) => s.id?.startsWith("track-list"));
    const trackUrls = (trackSection?.items ?? [])
      .map((item) => item.contentDescriptor?.url)
      .filter((u): u is string => !!u);
    if (trackUrls.length === 0) return [];

    // Pick `count` distinct random tracks
    const picked = [...trackUrls]
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    const resolved = await Promise.all(picked.map((u) => getAppleMusicData(u)));
    const tracks: AppleMusicTrack[] = [];
    picked.forEach((trackUrl, i) => {
      const data = resolved[i];
      if (data) tracks.push({ url: trackUrl, ...data });
    });
    return tracks;
  } catch {
    return [];
  }
}

const letterboxdParser = new XMLParser();

function extractLetterboxdPoster(descriptionHtml: string): string | null {
  const match = descriptionHtml.match(/<img[^>]+src="([^"]+)"/);
  return match?.[1] ?? null;
}

export type LetterboxdEntry = {
  filmTitle: string;
  filmYear: string | null;
  watchedDate: string | null;
  rating: number | null;
  posterUrl: string | null;
  filmUrl: string | null;
};

export async function getLetterboxdEntries(
  username: string | null,
  count = 3,
): Promise<LetterboxdEntry[]> {
  if (!username) return [];
  try {
    const res = await fetch(
      `https://letterboxd.com/${encodeURIComponent(username)}/rss/`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];

    const xml = await res.text();
    const feed = letterboxdParser.parse(xml) as Record<string, unknown>;
    const channel = (feed.rss as Record<string, unknown> | undefined)
      ?.channel as Record<string, unknown> | undefined;
    const rawItems = channel?.item;
    const items = (
      Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []
    ) as Array<Record<string, unknown>>;

    // RSS is already newest-first — the first `count` entries are the last
    // `count` films watched.
    const entries = items
      .filter((item) => item["letterboxd:filmTitle"])
      .slice(0, count);

    return entries.map((entry) => {
      const filmTitle = String(entry["letterboxd:filmTitle"]);
      const filmYear =
        entry["letterboxd:filmYear"] != null
          ? String(entry["letterboxd:filmYear"])
          : null;
      const watchedDate =
        entry["letterboxd:watchedDate"] != null
          ? String(entry["letterboxd:watchedDate"])
          : null;
      const rating =
        entry["letterboxd:memberRating"] != null
          ? Number(entry["letterboxd:memberRating"])
          : null;
      const posterUrl = extractLetterboxdPoster(
        String(entry.description ?? ""),
      );
      const filmUrl = entry.link != null ? String(entry.link) : null;

      return { filmTitle, filmYear, watchedDate, rating, posterUrl, filmUrl };
    });
  } catch {
    return [];
  }
}

const bggParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

type BggTopItem = {
  "@_rank"?: string;
  "@_id"?: string;
  "@_name"?: string;
};

type BggCollectionItem = {
  "@_objectid"?: string;
  name?: string | { "#text"?: string };
  yearpublished?: string | number;
  image?: string;
  thumbnail?: string;
  stats?: { rating?: { "@_value"?: string } };
};

// In-process cache for the user's full collection XML, keyed by username.
// The collection endpoint queues a fresh export the first time it's asked
// for a given user (body is a <message> instead of <items> while it's
// processing), so this is fetched — and retried — once per hour, shared
// across every random top-10 pick, rather than re-risking that queue on
// every single pick's own id filter.
const bggCollectionCache = new Map<string, { xml: string; expires: number }>();

async function fetchBggCollection(username: string, token: string) {
  const cached = bggCollectionCache.get(username);
  if (cached && cached.expires > Date.now()) return cached.xml;

  const url = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&stats=1&excludesubtype=boardgameexpansion`;
  // `cache: "no-store"` is deliberate: a 200 response carrying the "still
  // processing" message is otherwise indistinguishable from a real one to
  // Next's fetch cache, which would then keep replaying that stale body
  // for the rest of the revalidate window. Retry once after a short delay
  // instead — this endpoint is consistently ready well within it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml.includes("<message>")) {
      bggCollectionCache.set(username, { xml, expires: Date.now() + 3_600_000 });
      return xml;
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

export type BggEntry = {
  gameName: string | null;
  yearPublished: string | null;
  rating: number | null;
  imageUrl: string | null;
  gameUrl: string | null;
};

// BGG's XML API requires a registered app token as of Oct 2025 — see
// boardgamegeek.com/applications. Without BGG_API_TOKEN set, degrade to []
// (same fallback behaviour as an unset Mapbox token elsewhere in this app).
//
// Picks `count` random distinct games from the user's curated "Top 10" list
// (a native BGG profile feature — boardgamegeek.com/user/<name> — not their
// full owned collection), then cross-references each against their rated
// collection for its personal rating/cover/year (favourites aren't
// necessarily marked "owned", so this intentionally doesn't filter on own=1).
export async function getBggEntries(
  username: string | null,
  count = 3,
): Promise<BggEntry[]> {
  if (!username) return [];
  const token = process.env.BGG_API_TOKEN;
  if (!token) return [];
  try {
    const topRes = await fetch(
      `https://boardgamegeek.com/xmlapi2/user?name=${encodeURIComponent(username)}&top=1`,
      {
        next: { revalidate: 3600 },
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!topRes.ok) return [];

    const topXml = await topRes.text();
    const topData = bggParser.parse(topXml) as Record<string, unknown>;
    const user = topData.user as Record<string, unknown> | undefined;
    const top = user?.top as Record<string, unknown> | undefined;
    const rawTop = top?.item;
    const topList = (
      Array.isArray(rawTop) ? rawTop : rawTop ? [rawTop] : []
    ) as BggTopItem[];
    if (topList.length === 0) return [];

    const picks = [...topList]
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    // Best-effort enrichment — if the collection lookup fails or is still
    // queued, every pick just falls back to its top-list name below rather
    // than being discarded.
    const collXml = await fetchBggCollection(username, token);
    const collData = collXml
      ? (bggParser.parse(collXml) as Record<string, unknown>)
      : null;
    const items = collData?.items as Record<string, unknown> | undefined;
    const rawItems = items?.item;
    const list = (
      Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []
    ) as BggCollectionItem[];

    return picks.map((pick) => {
      const id = pick["@_id"];
      const fallbackName =
        pick["@_name"] != null ? String(pick["@_name"]) : null;
      const gameUrl = id ? `https://boardgamegeek.com/boardgame/${id}` : null;
      const fallback = {
        gameName: fallbackName,
        yearPublished: null,
        rating: null,
        imageUrl: null,
        gameUrl,
      };
      const item = id ? list.find((i) => i["@_objectid"] === id) : undefined;
      if (!item) return fallback;

      const rawName =
        typeof item.name === "string" ? item.name : item.name?.["#text"];
      const gameName = rawName != null ? String(rawName) : fallbackName;
      const yearPublished =
        item.yearpublished != null ? String(item.yearpublished) : null;
      const ratingRaw = item.stats?.rating?.["@_value"];
      const rating =
        ratingRaw != null && ratingRaw !== "N/A" ? Number(ratingRaw) : null;
      const imageUrl = item.image ?? item.thumbnail ?? null;

      return { gameName, yearPublished, rating, imageUrl, gameUrl };
    });
  } catch {
    return [];
  }
}
