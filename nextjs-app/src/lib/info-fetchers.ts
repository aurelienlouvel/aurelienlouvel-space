import { formatDateTime } from "@/lib/date-utils";

type StatsHuntersActivity = {
  name: string;
  avg: number;
  moving_time: number;
  distance: number;
  average_heartrate: number;
  total_elevation_gain: number;
  type: string;
  date: string;
};

export async function getStravaActivity(shareUrl: string | null) {
  if (!shareUrl) return null;
  // Accept a full StatsHunters share link and extract the hash
  const match = shareUrl.match(/share\/([a-zA-Z0-9]+)/);
  const shareHash = match?.[1] ?? null;
  if (!shareHash) return null;
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

    const apiRes = await fetch(
      `https://www.statshunters.com/share/${shareHash}/api/activities?page=1`,
      {
        cache: "no-store",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-XSRF-TOKEN": xsrfToken,
          Accept: "application/json",
          Cookie: cookieStr,
        },
      },
    );
    if (!apiRes.ok) return null;
    const data = await apiRes.json();
    const activities: StatsHuntersActivity[] = data.activities ?? [];
    if (activities.length === 0) return null;
    const latest = activities[activities.length - 1];
    return {
      activityName: latest.name,
      activityType: latest.type,
      speedKmh: Math.round(latest.avg * 10) / 10,
      distanceKm: Math.round(latest.distance / 100) / 10,
      durationMin: Math.round(latest.moving_time / 60),
      bpm:
        latest.average_heartrate > 0
          ? Math.round(latest.average_heartrate)
          : null,
      elevationM: Math.round(latest.total_elevation_gain),
      // Full datetime (StatsHunters returns "YYYY-MM-DD HH:MM:SS")
      date: latest.date.replace(" ", "T"),
    };
  } catch {
    return null;
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
