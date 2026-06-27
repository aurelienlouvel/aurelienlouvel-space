import { NextRequest, NextResponse } from "next/server";

type MatchData = {
  result: "victory" | "defeat" | "draw";
  score: string | null;
  mapName: string | null;
  mapSplashUrl: string | null;
  agentName: string | null;
  agentIconUrl: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  acs: number | null;
  hsPercent: number | null;
  rank: string | null;
  rankIconUrl: string | null;
  startedAt: string | null;
};

// Fill map splash + agent square icon from the open valorant-api.com (no key).
async function enrichVisuals(mapName: string | null, agentName: string | null) {
  let mapSplashUrl: string | null = null;
  let agentIconUrl: string | null = null;

  if (mapName) {
    try {
      const r = await fetch("https://valorant-api.com/v1/maps");
      if (r.ok) {
        const j = await r.json();
        const e = (j.data as Array<{ displayName: string; splash: string }>)?.find(
          (mp) => mp.displayName.toLowerCase() === mapName.toLowerCase(),
        );
        if (e) mapSplashUrl = e.splash;
      }
    } catch { /* best-effort */ }
  }

  if (agentName) {
    try {
      const r = await fetch(
        "https://valorant-api.com/v1/agents?isPlayableCharacter=true",
      );
      if (r.ok) {
        const j = await r.json();
        const e = (
          j.data as Array<{ displayName: string; displayIcon: string }>
        )?.find((a) => a.displayName.toLowerCase() === agentName.toLowerCase());
        if (e) agentIconUrl = e.displayIcon;
      }
    } catch { /* best-effort */ }
  }

  return { mapSplashUrl, agentIconUrl };
}

// ─── Henrik Dev API (api.henrikdev.xyz) — v4 matchlist format ───────────────
const HENRIK_REGIONS = new Set(["eu", "na", "ap", "kr", "latam", "br"]);

async function fromHenrik(
  name: string,
  tag: string,
  region: string,
  key: string,
): Promise<MatchData | null> {
  const res = await fetch(
    `https://api.henrikdev.xyz/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=competitive&size=1`,
    { headers: { Authorization: key }, next: { revalidate: 300 } },
  );
  if (!res.ok) return null;
  const json = await res.json();

  const matches = Array.isArray(json.data) ? json.data : [];
  const m = matches[0] as Record<string, unknown> | undefined;
  if (!m) return null;

  const metadata = (m.metadata ?? {}) as Record<string, unknown>;
  const mapMeta = (metadata.map ?? {}) as Record<string, unknown>;
  const players = (m.players ?? []) as Array<Record<string, unknown>>;
  const teams = (m.teams ?? []) as Array<Record<string, unknown>>;

  const player =
    players.find(
      (p) => typeof p.name === "string" && p.name.toLowerCase() === name.toLowerCase(),
    ) ?? players[0];
  if (!player) return null;

  const team = teams.find((t) => t.team_id === player.team_id);
  const hasWon = team?.won === true;
  const rounds = (team?.rounds ?? {}) as Record<string, unknown>;
  const roundsWon = typeof rounds.won === "number" ? rounds.won : null;
  const roundsLost = typeof rounds.lost === "number" ? rounds.lost : null;
  const isDraw =
    roundsWon != null && roundsLost != null && roundsWon === roundsLost;

  const stats = (player.stats ?? {}) as Record<string, unknown>;
  const agent = (player.agent ?? {}) as Record<string, unknown>;
  const tier = (player.tier ?? {}) as Record<string, unknown>;
  const agentName = typeof agent.name === "string" ? agent.name : null;
  const mapName = typeof mapMeta.name === "string" ? mapMeta.name : null;
  const visuals = await enrichVisuals(mapName, agentName);

  const kills = typeof stats.kills === "number" ? stats.kills : null;
  const deaths = typeof stats.deaths === "number" ? stats.deaths : null;
  const assists = typeof stats.assists === "number" ? stats.assists : null;
  const score = typeof stats.score === "number" ? stats.score : null;
  const headshots = typeof stats.headshots === "number" ? stats.headshots : null;
  const bodyshots = typeof stats.bodyshots === "number" ? stats.bodyshots : null;
  const legshots = typeof stats.legshots === "number" ? stats.legshots : null;

  const totalShots = (headshots ?? 0) + (bodyshots ?? 0) + (legshots ?? 0);
  const hsPercent =
    totalShots > 0 && headshots != null
      ? Math.round((headshots / totalShots) * 100)
      : null;
  const totalRounds = (roundsWon ?? 0) + (roundsLost ?? 0);
  const acs = totalRounds > 0 && score != null ? Math.round(score / totalRounds) : null;

  return {
    result: isDraw ? "draw" : hasWon ? "victory" : "defeat",
    score: roundsWon != null && roundsLost != null ? `${roundsWon}-${roundsLost}` : null,
    mapName,
    mapSplashUrl: visuals.mapSplashUrl,
    agentName,
    agentIconUrl: visuals.agentIconUrl,
    kills,
    deaths,
    assists,
    acs,
    hsPercent,
    rank: typeof tier.name === "string" ? tier.name : null,
    rankIconUrl:
      typeof tier.id === "number"
        ? `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${tier.id}/largeicon.png`
        : null,
    startedAt: typeof metadata.started_at === "string" ? metadata.started_at : null,
  };
}

export async function GET(request: NextRequest) {
  const trackerUrl = request.nextUrl.searchParams.get("trackerUrl");
  if (!trackerUrl) return NextResponse.json(null);

  const regionParam = (request.nextUrl.searchParams.get("region") ?? "eu").toLowerCase();
  const region = HENRIK_REGIONS.has(regionParam) ? regionParam : "eu";

  const henrikKey = process.env.VALORANT_API_KEY;
  if (!henrikKey) return NextResponse.json(null, { status: 503 });

  // Decode the full trackerUrl until stable — path separators must be literal /
  // before the regex runs (handles URLSearchParams double-encoding: %2F, %2523…)
  let decodedTrackerUrl = trackerUrl;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(decodedTrackerUrl);
      if (decoded === decodedTrackerUrl) break;
      decodedTrackerUrl = decoded;
    } catch { break; }
  }

  // # is NOT excluded: it's the name/tag separator in riot IDs (e.g. oré#369)
  const idMatch = decodedTrackerUrl.match(/profile\/riot\/([^/?]+)/);
  if (!idMatch) return NextResponse.json(null);
  const riotId = idMatch[1]; // already fully decoded
  const hashIdx = riotId.lastIndexOf("#");
  if (hashIdx === -1) return NextResponse.json(null);
  const name = riotId.slice(0, hashIdx);
  const tag = riotId.slice(hashIdx + 1);

  try {
    const data = await fromHenrik(name, tag, region, henrikKey);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
