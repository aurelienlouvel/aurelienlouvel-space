"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@/components/primitives/Icon";
import {
  Bicycle01Icon,
  CloudAngledRainZapIcon,
  CloudBigRainIcon,
  CloudIcon,
  CloudLittleRainIcon,
  Cards02Icon,
  FavouriteIcon,
  FilmIcon,
  GithubIcon,
  GitCommitIcon,
  GameController03Icon,
  Image02Icon,
  InformationCircleIcon,
  MapPinpoint01Icon,
  MusicNote01Icon,
  RainIcon,
  Route01Icon,
  SnowIcon,
  StarIcon,
  StopWatchIcon,
  Sun01Icon,
  SunCloud01Icon,
  SwimmingIcon,
  Video01Icon,
  WalkingIcon,
  WorkoutRunIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";

export type StorySlide =
  | {
      type: "photo";
      imageUrl: string | null;
      alt: string | null;
      caption: string | null;
    }
  | { type: "video"; videoUrl: string | null; caption: string | null }
  | {
      type: "music";
      variants: {
        url: string;
        artworkUrl: string | null;
        trackName: string | null;
        artistName: string | null;
        previewUrl: string | null;
      }[];
    }
  | {
      type: "fact";
      icon: string | null;
      label: string | null;
      value: string | null;
      imageUrl: string | null;
      imageColor: string | null;
      tagline: string | null;
    }
  | {
      type: "strava";
      variants: {
        activityName: string | null;
        activityType: string | null;
        speedKmh: number | null;
        distanceKm: number | null;
        durationSec: number | null;
        bpm: number | null;
        elevationM: number | null;
        date: string | null;
        path: { lat: number; lng: number }[];
        city: string | null;
      }[];
    }
  | {
      type: "github";
      repo: string | null;
      message: string | null;
      date: string | null;
      contributions: Array<{ level: number }> | null;
      totalContributions: number | null;
      url: string | null;
    }
  | {
      type: "location";
      label: string | null;
      timezone: string | null;
      temperature: number | null;
      weatherCode: number | null;
      lat: number | null;
      lon: number | null;
    }
  | {
      type: "valorant";
      trackerUrl: string | null;
      region: string | null;
    }
  | {
      type: "letterboxd";
      variants: {
        filmTitle: string | null;
        filmYear: string | null;
        date: string | null;
        rating: number | null;
        posterUrl: string | null;
        filmUrl: string | null;
      }[];
    }
  | {
      type: "bgg";
      variants: {
        gameName: string | null;
        yearPublished: string | null;
        rating: number | null;
        imageUrl: string | null;
        gameUrl: string | null;
      }[];
    };

// GitHub contribution levels (dark theme greens)
const GH_LEVELS = [
  "rgba(255,255,255,0.06)",
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353",
];

// ─── Map config ──────────────────────────────────────────────────────────────

// GL JS (3D / custom styles) requires a PUBLIC token (pk.*); secret sk.* tokens
// are rejected by GL JS, so we fall back to the static image when one is set.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAPBOX_IS_PUBLIC = MAPBOX_TOKEN.startsWith("pk.");
const MAPBOX_STYLE =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE ??
  "mapbox://styles/aurelien-louvel/cmquvfo9v001v01qqgqp8685a";
const MAP_ZOOM = 10;
// Centre fixe sur Paris, légèrement décalé à droite
const PARIS_CENTER: [number, number] = [2.37, 48.859];

function formatPace(speedKmh: number): string {
  const pace = 60 / speedKmh;
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// "22m 10s" (or "1h 05m 10s" past an hour) — short labeled units.
function formatDuration(totalSec: number | null): string {
  if (totalSec == null) return "—";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = s.toString().padStart(2, "0");
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  return `${m}m ${ss}s`;
}

function getActivityIcon(type: string | null) {
  const t = type?.toLowerCase() ?? "";
  if (t === "ride" || t === "virtualride" || t === "ebikeride")
    return Bicycle01Icon;
  if (t === "swim") return SwimmingIcon;
  if (t === "walk" || t === "hike") return WalkingIcon;
  return WorkoutRunIcon;
}

function getWeatherIcon(
  code: number | null,
): Parameters<typeof HugeiconsIcon>[0]["icon"] {
  if (code == null || code === 0) return Sun01Icon;
  if (code <= 2) return SunCloud01Icon;
  if (code <= 48) return CloudIcon;
  if (code <= 57) return CloudLittleRainIcon;
  if (code <= 67) return RainIcon;
  if (code <= 77) return SnowIcon;
  if (code <= 82) return CloudBigRainIcon;
  if (code <= 86) return SnowIcon;
  return CloudAngledRainZapIcon;
}

// ─── Shared primitives ─────────────────────────────────────────────────────────

function PlaceholderSlide({
  icon,
  label,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  label: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-stone-50">
      <HugeiconsIcon
        icon={icon}
        size={28}
        strokeWidth={1.5}
        className="text-stone-300"
      />
      <span className="text-xs font-medium text-stone-400">{label}</span>
    </div>
  );
}

function CardShell({
  bg,
  top,
  children,
}: {
  bg: string;
  top: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`relative flex h-full w-full flex-col text-white ${bg}`}>
      <div className="flex items-center gap-1.5 p-4">{top}</div>
      <div className="mt-auto p-6">{children}</div>
    </div>
  );
}

// ───  Maps card ───────────────────────────────────────────────────────────

function LocationCard({
  slide,
}: {
  slide: Extract<StorySlide, { type: "location" }>;
}) {
  const [now, setNow] = useState(() => new Date());
  const [pinPos, setPinPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (slide.lat == null || slide.lon == null) {
    return <PlaceholderSlide icon={MapPinpoint01Icon} label="carte à venir" />;
  }

  const timeStr = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(slide.timezone ? { timeZone: slide.timezone } : {}),
  }).format(now);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#e8e8e8]">
      {/* Carte centrée sur Paris, pin positionné par map.project() */}
      <MapboxBackground
        lat={slide.lat}
        lon={slide.lon}
        onPinPosition={setPinPos}
      />

      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/60 to-transparent" />

      {/* Pin exactement à l'adresse selon map.project() */}
      {pinPos && (
        <span
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: pinPos.x, top: pinPos.y }}
        >
          <span className="absolute h-10 w-10 animate-slow-ping rounded-full bg-[#007AFF]/25" />
          <span className="relative block h-4 w-4 rounded-full bg-[#007AFF] shadow-lg ring-[3px] ring-white" />
        </span>
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 p-4 text-white drop-shadow">
        <HugeiconsIcon icon={MapPinpoint01Icon} size={15} strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">
          Location
        </span>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 p-4 pb-5">
        <div
          className="flex items-center gap-1 text-white/75 drop-shadow"
          suppressHydrationWarning
        >
          <HugeiconsIcon
            icon={getWeatherIcon(slide.weatherCode)}
            size={12}
            strokeWidth={2}
          />
          {slide.temperature != null && (
            <span className="text-xs">{Math.round(slide.temperature)}°</span>
          )}
          <span className="px-0.5 text-white/40">·</span>
          <span className="text-xs">{timeStr}</span>
        </div>
        {slide.label && (
          <p className="mt-0.5 text-lg font-semibold leading-tight text-white drop-shadow">
            {slide.label}
          </p>
        )}
      </div>
    </div>
  );
}

// Mapbox GL background — centred on Paris. Custom/3D styles need a public
// (pk.*) token; with a secret/missing token we fall back to the static image.
function MapboxBackground({
  lat,
  lon,
  onPinPosition,
}: {
  lat: number;
  lon: number;
  onPinPosition?: (pos: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept fresh every render so the map-init effect below can stay scoped to
  // [lat, lon] (an inline onPinPosition from the parent must not re-init the map).
  const onPinPositionRef = useRef(onPinPosition);
  useEffect(() => {
    onPinPositionRef.current = onPinPosition;
  });

  useEffect(() => {
    if (!ref.current || !MAPBOX_IS_PUBLIC) return;

    let map: import("mapbox-gl").Map | null = null;
    let cancelled = false;

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !ref.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: ref.current,
        style: MAPBOX_STYLE,
        center: PARIS_CENTER,
        zoom: MAP_ZOOM,
        interactive: false,
        attributionControl: false,
      });
      // Strip the Mapbox logo + attribution chrome
      const stripChrome = () =>
        ref.current
          ?.querySelectorAll(
            ".mapboxgl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-right",
          )
          .forEach((el) => el.remove());
      stripChrome();
      map.on("load", () => {
        stripChrome();
        if (!map || cancelled) return;
        const point = map.project([lon, lat]);
        onPinPositionRef.current?.({ x: point.x, y: point.y });
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon]);

  if (!MAPBOX_IS_PUBLIC) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/paris-map.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[45%_30%]"
      />
    );
  }

  return <div ref={ref} className="absolute inset-0 h-full w-full" />;
}

// ─── Music card ──────────────────────────────────────────────────────────

function MusicCard({
  slide,
  round,
  onPlayingChange,
}: {
  slide: Extract<StorySlide, { type: "music" }>;
  round?: number;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 3 random tracks were picked once server-side; each full loop through the
  // story stack ("round") shows the next one, cycling back to the first once
  // all have been shown.
  const variant =
    slide.variants.length > 0
      ? slide.variants[(round ?? 0) % slide.variants.length]
      : null;
  const previewUrl = variant?.previewUrl ?? null;

  useEffect(() => {
    if (!previewUrl) return;
    const audio = new Audio(previewUrl);
    audio.volume = 0.08;
    audioRef.current = audio;
    const onTimeUpdate = () => {
      setAudioProgress(Math.min(audio.currentTime / 15, 1));
      if (audio.currentTime >= 15) {
        audio.pause();
        audio.currentTime = 0;
        setPlaying(false);
        setAudioProgress(0);
        onPlayingChange?.(false);
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", () => {
      setPlaying(false);
      setAudioProgress(0);
      onPlayingChange?.(false);
    });
    return () => {
      audio.pause();
      // The track can change (round advancing) without this card ever
      // unmounting — reset playback state too, not just the audio element.
      setPlaying(false);
      setAudioProgress(0);
      onPlayingChange?.(false);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [previewUrl, onPlayingChange]);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // prevent story advance
      const audio = audioRef.current;
      if (!audio) return;
      if (playing) {
        audio.pause();
        setPlaying(false);
        onPlayingChange?.(false);
      } else {
        audio.volume = 0.08; // re-apply each play so HMR / stale instances stay correct
        audio.currentTime = 0;
        setAudioProgress(0);
        audio.play().catch(() => {});
        setPlaying(true);
        onPlayingChange?.(true);
      }
    },
    [playing, onPlayingChange],
  );

  // Fallback when no track data yet
  if (!variant?.trackName) {
    return (
      <CardShell
        bg="bg-gradient-to-br from-rose-500 to-fuchsia-600"
        top={
          <>
            <HugeiconsIcon icon={MusicNote01Icon} size={18} strokeWidth={2} />
            <span className="text-xs font-medium uppercase tracking-wide text-white/80">
              Music
            </span>
          </>
        }
      >
        <span className="text-base font-semibold">Now playing</span>
      </CardShell>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-white/90">
      {/* Blurred album art background */}
      {variant.artworkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variant.artworkUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative flex h-full flex-col text-white">
        {/* Top row */}
        <div className="flex items-center gap-1.5 p-4">
          <HugeiconsIcon icon={MusicNote01Icon} size={18} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide text-white/80">
            Music
          </span>
        </div>

        {/* Bottom section */}
        <div className="mt-auto p-6">
          {variant.artworkUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={variant.artworkUrl}
              alt={variant.trackName}
              className="mb-3 h-16 w-16 rounded-xl shadow-lg"
            />
          )}
          <p className="text-base font-semibold leading-tight">
            {variant.trackName}
          </p>
          <p className="mt-0.5 text-sm text-white/70">{variant.artistName}</p>

          {variant.previewUrl && (
            <button
              type="button"
              onClick={toggle}
              className="relative mt-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm transition-opacity hover:opacity-80"
            >
              <svg
                className="pointer-events-none absolute inset-0 -rotate-90"
                width="32"
                height="32"
                viewBox="0 0 32 32"
                aria-hidden="true"
              >
                <circle
                  cx="16"
                  cy="16"
                  r={14}
                  fill="none"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="2"
                />
                <circle
                  cx="16"
                  cy="16"
                  r={14}
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 14}
                  strokeDashoffset={2 * Math.PI * 14 * (1 - audioProgress)}
                  style={{
                    transition:
                      audioProgress > 0
                        ? "stroke-dashoffset 0.1s linear"
                        : "none",
                  }}
                />
              </svg>
              {playing ? (
                <span className="relative flex gap-[3px]">
                  <span className="h-3 w-[3px] rounded-sm bg-white" />
                  <span className="h-3 w-[3px] rounded-sm bg-white" />
                </span>
              ) : (
                <span className="relative ml-0.5 h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-white" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Letterboxd card ───────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number | null }) {
  if (rating == null) return null;

  return (
    <div className="mt-2 flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const filled = rating >= i + 1;
        const half = !filled && rating >= i + 0.5;
        return (
          <div key={i} className="relative size-3.5 shrink-0">
            <HugeiconsIcon
              icon={StarIcon}
              size={14}
              strokeWidth={1.8}
              className="absolute inset-0 text-white/40"
            />
            {/* Clip a second, filled star to a width instead of using the
                library's half-star glyph — its right lobe is an open path,
                so filling it directly paints a stray second blob rather
                than staying empty. */}
            {(filled || half) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: filled ? "100%" : "50%" }}
              >
                <HugeiconsIcon
                  icon={StarIcon}
                  size={14}
                  strokeWidth={1.8}
                  fill="currentColor"
                  className="text-amber-400"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LetterboxdCard({
  slide,
  round,
}: {
  slide: Extract<StorySlide, { type: "letterboxd" }>;
  round?: number;
}) {
  // Last 3 watched films were picked once server-side; each full loop
  // through the story stack ("round") shows the next one.
  const variant =
    slide.variants.length > 0
      ? slide.variants[(round ?? 0) % slide.variants.length]
      : null;

  if (!variant?.filmTitle) {
    return <PlaceholderSlide icon={FilmIcon} label="Movies" />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-900">
      {variant.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variant.posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative flex h-full flex-col text-white">
        <div className="flex items-center gap-1.5 p-4">
          <HugeiconsIcon icon={FilmIcon} size={16} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide text-white/80">
            Movies
          </span>
        </div>

        <div className="mt-auto p-6">
          {variant.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={variant.posterUrl}
              alt={variant.filmTitle}
              className="mb-3 aspect-[2/3] h-28 rounded-xl object-cover shadow-lg"
            />
          )}
          <p className="text-base font-semibold leading-tight">
            {variant.filmTitle}
            {variant.filmYear && (
              <span className="font-normal text-white/60">
                {" "}
                ({variant.filmYear})
              </span>
            )}
          </p>
          {variant.date && (
            <p className="mt-0.5 text-sm text-white/70">{variant.date}</p>
          )}
          <StarRating rating={variant.rating} />
        </div>
      </div>
    </div>
  );
}

// ─── BoardGameGeek card ─────────────────────────────────────────────────────

function BggCard({
  slide,
  round,
}: {
  slide: Extract<StorySlide, { type: "bgg" }>;
  round?: number;
}) {
  // 3 random Top-10 picks were made once server-side; each full loop through
  // the story stack ("round") shows the next one.
  const variant =
    slide.variants.length > 0
      ? slide.variants[(round ?? 0) % slide.variants.length]
      : null;

  if (!variant?.gameName) {
    return <PlaceholderSlide icon={Cards02Icon} label="Board Games" />;
  }

  // BGG ratings are 0–10 — rescale to the shared 5-star component.
  const rating = variant.rating != null ? variant.rating / 2 : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-900">
      {variant.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variant.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative flex h-full flex-col text-white">
        <div className="flex items-center gap-1.5 p-4">
          <HugeiconsIcon icon={Cards02Icon} size={16} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide text-white/80">
            Board Games
          </span>
        </div>

        <div className="mt-auto p-6">
          {variant.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={variant.imageUrl}
              alt={variant.gameName}
              className="mb-3 max-h-28 w-auto max-w-full rounded-xl object-contain shadow-lg"
            />
          )}
          <p className="text-base font-semibold leading-tight">
            {variant.gameName}
            {variant.yearPublished && (
              <span className="font-normal text-white/60">
                {" "}
                ({variant.yearPublished})
              </span>
            )}
          </p>
          <StarRating rating={rating} />
        </div>
      </div>
    </div>
  );
}

// ─── Fact card ──────────────────────────────────────────────────────────────

function FactCard({
  slide,
}: {
  slide: Extract<StorySlide, { type: "fact" }>;
}) {
  if (!slide.value) {
    return <PlaceholderSlide icon={InformationCircleIcon} label="Fact" />;
  }

  const topBar = (
    <>
      {slide.icon && <Icon name={slide.icon} size={18} strokeWidth={2} />}
      <span className="text-xs font-medium uppercase tracking-wide text-white/80">
        {slide.label ?? "Fact"}
      </span>
    </>
  );

  // Illustration-forward layout — a smaller product shot centered on a dark
  // backdrop tinted with its own dominant color (from Sanity's image palette
  // metadata), with the value as a caption underneath, e.g. the
  // morning-drink card. Dark bg + white text matches every other card in
  // the stack; the tint is what still ties each fact card to its photo.
  if (slide.imageUrl) {
    const darkBg = slide.imageColor
      ? `color-mix(in srgb, ${slide.imageColor} 40%, var(--color-stone-900))`
      : "var(--color-stone-800)";
    return (
      <div
        className="relative flex h-full w-full flex-col overflow-hidden text-white"
        style={{ backgroundColor: darkBg }}
      >
        <div className="flex items-center gap-1.5 p-4">{topBar}</div>

        <div className="flex flex-1 items-center justify-center px-6 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl}
            alt=""
            className="max-h-[65%] max-w-[72%] -rotate-6 object-contain drop-shadow-lg"
          />
        </div>

        <div className="px-6 pb-6">
          <span className="block text-2xl font-semibold leading-tight text-white">
            {slide.value}
          </span>
        </div>
      </div>
    );
  }

  // Typographic layout — big "wordmark" value + small tagline underneath,
  // à la type-foundry specimen pages, e.g. the favorite-font card.
  if (slide.tagline) {
    return (
      <CardShell bg="bg-gradient-to-br from-stone-700 to-stone-900" top={topBar}>
        <span className="block text-4xl font-bold leading-[1.05] tracking-tight">
          {slide.value}
        </span>
        <span className="mt-2 block text-sm text-white/55">
          {slide.tagline}
        </span>
      </CardShell>
    );
  }

  // Default — compact icon + label + value
  return (
    <CardShell bg="bg-gradient-to-br from-stone-700 to-stone-900" top={topBar}>
      <span className="text-xl font-semibold leading-tight">
        {slide.value}
      </span>
    </CardShell>
  );
}

// ─── Strava card ────────────────────────────────────────────────────────────

// Catmull-Rom → cubic Bezier, so the line curves smoothly through each GPS
// point instead of connecting them with sharp straight-line segments.
function smoothPathD(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// Ramer–Douglas–Peucker simplification: drops points that sit within
// `epsilon` of the straight line between their neighbors. Raw GPS traces are
// noisy (satellite drift, small back-and-forth jitter at turns/stops), and
// since smoothPathD's Catmull-Rom curve threads through every point it's
// given, that noise otherwise shows up as little kinks in an
// otherwise-smooth line. Thinning the point set first, then smoothing what's
// left, is what actually produces a clean/simplified-looking route.
function simplifyPath(
  points: { x: number; y: number }[],
  epsilon: number,
): { x: number; y: number }[] {
  if (points.length < 3) return points;

  const sqDistToSegment = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    const projX = a.x + clampedT * dx;
    const projY = a.y + clampedT * dy;
    return (p.x - projX) ** 2 + (p.y - projY) ** 2;
  };

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = sqDistToSegment(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (Math.sqrt(maxDist) > epsilon) {
    const left = simplifyPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPath(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

// Equirectangular local projection (x = lng·cos(avgLat), y = -lat) — accurate
// enough for a route spanning a few km, and keeps the real aspect ratio
// instead of stretching a north-south run into a square. North is up.
// Absolute scale doesn't matter: the SVG viewBox normalizes it and
// `vector-effect="non-scaling-stroke"` keeps the line width independent of
// how much that normalization stretches the coordinate system.
function projectPath(path: { lat: number; lng: number }[]): {
  points: { x: number; y: number }[];
  w: number;
  h: number;
} {
  const avgLat = path.reduce((sum, p) => sum + p.lat, 0) / path.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const projected = path.map((p) => ({ x: p.lng * cosLat, y: -p.lat }));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  return {
    points: projected.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    w,
    h,
  };
}

// Renders the activity's real GPS route — decoded and simplified from
// StatsHunters' polyline endpoint server-side (see getStravaActivities) —
// as a simplified line backdrop. `vectorEffect="non-scaling-stroke"` keeps
// the line the same pixel width regardless of the route's real-world
// extent, so a short local loop and a long point-to-point ride both get a
// clean, consistently-weighted line instead of it scaling into a thick blob
// for small routes.
//
// Fills whatever box the caller positions it in — the caller (StravaCard)
// controls where on the card that box sits; this component only handles
// projecting + drawing the route inside it. `preserveAspectRatio="meet"`
// centers the route within that box regardless of its aspect ratio, and for
// a route that's tall/narrow relative to the box (common for point-to-point
// runs) that guarantees the whole shape always fits inside it — the
// vignette mask fading toward the box's edges is then just a soft dissolve
// into the rest of the card, not a crop.
function RoutePath({ path }: { path: { lat: number; lng: number }[] }) {
  if (path.length < 2) return null;
  const { points: rawPoints, w, h } = projectPath(path);
  const points = simplifyPath(rawPoints, Math.max(w, h) * 0.03);
  const pad = Math.max(w, h) * 0.08 || 0.0002;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      style={{
        maskImage:
          "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at center, black 30%, transparent 80%)",
      }}
      aria-hidden="true"
    >
      <path
        d={smoothPathD(points)}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function StravaCard({
  slide,
  round,
}: {
  slide: Extract<StorySlide, { type: "strava" }>;
  round?: number;
}) {
  // Last 3 activities were picked once server-side; each full loop through
  // the story stack ("round") shows the next one.
  const variant =
    slide.variants.length > 0
      ? slide.variants[(round ?? 0) % slide.variants.length]
      : null;

  const pace =
    variant?.speedKmh && variant.speedKmh > 0
      ? formatPace(variant.speedKmh)
      : null;
  const actTypeIcon = getActivityIcon(variant?.activityType ?? null);

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden text-white"
      style={{
        background: `
          radial-gradient(ellipse at 88% 8%, rgba(251,146,60,0.60) 0%, transparent 55%),
          radial-gradient(ellipse at 12% 92%, rgba(249,115,22,0.34) 0%, transparent 50%),
          radial-gradient(ellipse at 52% 48%, rgba(254,215,170,0.18) 0%, transparent 48%),
          linear-gradient(150deg, #c2410c 0%, #ea580c 30%, #9a3412 66%, #5a1e0a 100%)
        `,
      }}
    >
      {/* Route backdrop: simplified line traced from the real GPS path,
          sitting center-right — behind where the main stats print below —
          and clear of the top bar rather than pinned to a corner. */}
      {variant?.path && (
        <div className="pointer-events-none absolute right-[12%] top-[16%] h-[54%] w-[68%]">
          <RoutePath path={variant.path} />
        </div>
      )}

      {/* Grain overlay for texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)' opacity='0.11'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          mixBlendMode: "overlay",
        }}
      />

      {/* Top bar: label only */}
      <div className="relative flex items-center gap-1.5 p-4">
        <HugeiconsIcon icon={WorkoutRunIcon} size={16} strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">
          Activity
        </span>
      </div>

      {/* Bottom content */}
      <div className="relative mt-auto p-6">
        <div className="mt-2 flex flex-col gap-4">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              icon={Route01Icon}
              size={15}
              strokeWidth={2}
              className="text-white/60"
            />
            <p className="text-2xl font-bold leading-none">
              {variant?.distanceKm != null
                ? `${variant.distanceKm.toFixed(1)} km`
                : "—"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              icon={StopWatchIcon}
              size={15}
              strokeWidth={2}
              className="text-white/60"
            />
            <p className="text-2xl font-bold leading-none">
              {formatDuration(variant?.durationSec ?? null)}
            </p>
          </div>
        </div>

        {(pace ?? variant?.bpm) && (
          <div className="mt-4 flex gap-4 text-white/60">
            {pace && (
              <div className="flex items-center gap-1 text-[12px]">
                <HugeiconsIcon icon={ZapIcon} size={12} strokeWidth={2} />
                <span className="font-semibold">{pace}</span>
              </div>
            )}
            {variant?.bpm != null && (
              <div className="flex items-center gap-1 text-[12px]">
                <HugeiconsIcon icon={FavouriteIcon} size={12} strokeWidth={2} />
                <span className="font-semibold">{variant.bpm}</span>
              </div>
            )}
          </div>
        )}

        {/* Activity name + date */}
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              icon={actTypeIcon}
              size={16}
              strokeWidth={2}
              className="shrink-0 text-white/60"
            />
            <p className="text-md font-bold leading-tight">
              {variant?.activityName ?? "Latest activity"}
            </p>
          </div>
          {(variant?.date ?? variant?.city) && (
            <p className="mt-0.5 text-xs text-white/60">
              {variant?.date}
              {variant?.date && variant?.city && (
                <span className="px-1 text-white/40">·</span>
              )}
              {variant?.city}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Slide content dispatcher ──────────────────────────────────────────────────

export function SlideContent({
  slide,
  round,
  onMusicPlaying,
}: {
  slide: StorySlide;
  round?: number;
  onMusicPlaying?: (playing: boolean) => void;
}) {
  switch (slide.type) {
    case "photo":
      if (!slide.imageUrl)
        return <PlaceholderSlide icon={Image02Icon} label="photo à venir" />;
      return (
        <div className="relative h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl}
            alt={slide.alt ?? ""}
            className="h-full w-full object-cover"
          />
          {slide.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-5 pt-10">
              <p className="text-sm font-medium text-white drop-shadow">
                {slide.caption}
              </p>
            </div>
          )}
        </div>
      );

    case "video":
      if (!slide.videoUrl)
        return <PlaceholderSlide icon={Video01Icon} label="vidéo à venir" />;
      return (
        <div className="relative h-full w-full">
          <video
            src={slide.videoUrl}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
          {slide.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-5 pt-10">
              <p className="text-sm font-medium text-white drop-shadow">
                {slide.caption}
              </p>
            </div>
          )}
        </div>
      );

    case "music":
      return (
        <MusicCard slide={slide} round={round} onPlayingChange={onMusicPlaying} />
      );

    case "fact":
      return <FactCard slide={slide} />;

    case "location":
      return <LocationCard slide={slide} />;

    case "strava":
      return <StravaCard slide={slide} round={round} />;

    case "github": {
      if (!slide.repo && !slide.contributions)
        return <PlaceholderSlide icon={GithubIcon} label="Code" />;

      // Chunk into columns of 5 weekdays (Mon–Fri, filtered in fetcher)
      const weeks: Array<Array<{ level: number }>> = [];
      if (slide.contributions) {
        for (let i = 0; i < slide.contributions.length; i += 5) {
          weeks.push(slide.contributions.slice(i, i + 5));
        }
      }

      return (
        <div className="relative flex h-full w-full flex-col bg-stone-900 text-white">
          {/* Top bar */}
          <div className="flex items-center gap-1.5 px-5 pt-5 pb-2">
            <HugeiconsIcon icon={GithubIcon} size={16} strokeWidth={2} />
            <span className="text-xs font-medium uppercase tracking-wide text-white/80">
              Code
            </span>
          </div>

          {/* Spacer pushes commit info down */}
          <div className="flex-1" />

          {/* Latest commit — in the lower portion of the card */}
          <div className="px-5 pb-3">
            {slide.repo && (
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-white/40">
                <HugeiconsIcon
                  icon={GitCommitIcon}
                  size={12}
                  strokeWidth={2}
                  className="shrink-0"
                />
                <span className="truncate">{slide.repo}</span>
              </div>
            )}
            {slide.message && (
              <p className="line-clamp-2 text-sm font-medium leading-snug">
                {slide.message}
              </p>
            )}
            {slide.date && (
              <span className="mt-0.5 block text-[11px] text-white/40">
                {slide.date}
              </span>
            )}
          </div>

          {/* Contribution calendar — 8 cols × 5 rows, 80% width */}
          {weeks.length > 0 && (
            <div className="px-5 pb-5">
              <div className="flex gap-[4px]" style={{ width: "80%" }}>
                {weeks.map((week, ci) => (
                  <div key={ci} className="flex flex-1 flex-col gap-[4px]">
                    {week.map((day, di) => (
                      <div
                        key={di}
                        className="aspect-square rounded-[3px]"
                        style={{
                          backgroundColor: GH_LEVELS[day.level] ?? GH_LEVELS[0],
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    case "valorant":
      return <ValorantCard slide={slide} />;

    case "letterboxd":
      return <LetterboxdCard slide={slide} round={round} />;

    case "bgg":
      return <BggCard slide={slide} round={round} />;
  }
}

// ─── Valorant card ────────────────────────────────────────────────────────────

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

async function fetchValorantMatch(
  trackerUrl: string,
  region: string | null,
): Promise<MatchData | null> {
  try {
    const params = new URLSearchParams({ trackerUrl });
    if (region) params.set("region", region);
    const res = await fetch(`/api/valorant?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as MatchData | null;
  } catch {
    return null;
  }
}

// Result → accent colour, full-card gradient & label. Draw is a neutral grey.
const RESULT_STYLE = {
  victory: {
    label: "VICTORY",
    accent: "#4ade80",
    gradient:
      "linear-gradient(to top, rgba(0,60,20,1) 0%, rgba(0,60,20,0.85) 35%, rgba(0,40,15,0.4) 65%, transparent 100%)",
  },
  defeat: {
    label: "DEFEAT",
    accent: "#f87171",
    gradient:
      "linear-gradient(to top, rgba(60,0,15,1) 0%, rgba(60,0,15,0.85) 35%, rgba(40,0,10,0.4) 65%, transparent 100%)",
  },
  draw: {
    label: "DRAW",
    accent: "#9ca3af",
    gradient:
      "linear-gradient(to top, rgba(38,38,42,1) 0%, rgba(38,38,42,0.85) 35%, rgba(28,28,31,0.4) 65%, transparent 100%)",
  },
} as const;

function ValorantCard({
  slide,
}: {
  slide: Extract<StorySlide, { type: "valorant" }>;
}) {
  const [data, setData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(!!slide.trackerUrl);

  useEffect(() => {
    if (!slide.trackerUrl) return;
    fetchValorantMatch(slide.trackerUrl, slide.region)
      .then(setData)
      .finally(() => setLoading(false));
  }, [slide.trackerUrl, slide.region]);

  if (loading) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: "#0d0d0e" }}
      >
        <span className="text-[10px] font-black tracking-[0.18em] text-red-400/60">
          VALORANT
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-2"
        style={{ background: "#0d0d0e" }}
      >
        <span className="text-[10px] font-black tracking-[0.18em] text-red-400">
          VALORANT
        </span>
        <span className="text-[10px] text-white/30">No data</span>
      </div>
    );
  }

  const r = RESULT_STYLE[data.result];

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden text-white">
      {/* Map — full opacity, no dim */}
      {data.mapSplashUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.mapSplashUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Win/loss gradient — very pronounced */}
      <div
        className="absolute inset-x-0 bottom-0 h-full"
        style={{ background: r.gradient }}
      />
      {/* Top veil */}
      <div
        className="absolute inset-x-0 top-0 h-20"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)",
        }}
      />

      {/* Top bar — same style as other cards */}
      <div className="relative flex items-center gap-1.5 px-5 pt-5 pb-2">
        <HugeiconsIcon icon={GameController03Icon} size={16} strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">
          Valorant
        </span>
      </div>

      {/* Result + map name + score */}
      <div className="relative mt-auto px-5 pb-2">
        {data.mapName && (
          <span className="mb-1 block text-[9px] font-bold tracking-[0.2em] uppercase text-white/40">
            {data.mapName}
          </span>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span
            className="block text-2xl font-black leading-none tracking-tight"
            style={{ color: r.accent }}
          >
            {r.label}
          </span>
          {data.score && (
            <span className="text-2xl font-bold text-white/80">
              {data.score.replace("-", " - ")}
            </span>
          )}
        </div>

        {data.startedAt && (
          <span className="text-sm font-semibold text-white/60">
            {new Date(data.startedAt).toLocaleDateString("fr-FR", {
              hour: "numeric",
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
      </div>

      {/* Stats row: agent icon + KDA · ACS · HS% aligned left */}
      <div className="relative mx-5 flex items-center gap-4 border-t border-white/[0.07] py-3">
        {data.agentIconUrl && (
          <div className="relative h-9 w-9 shrink-0">
            <div className="h-full w-full overflow-hidden rounded-lg border border-white/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.agentIconUrl}
                alt={data.agentName ?? ""}
                className="h-full w-full object-cover"
              />
            </div>
            {data.rankIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.rankIconUrl}
                alt={data.rank ?? ""}
                className="absolute -top-2 -right-2 h-5 w-5 object-contain drop-shadow"
              />
            )}
          </div>
        )}
        <div className="flex gap-4">
          {data.kills != null &&
            data.deaths != null &&
            data.assists != null && (
              <div>
                <span className="text-lg font-bold leading-none text-white">
                  {data.kills}/{data.deaths}/{data.assists}
                </span>
                <span className="block text-[9px] text-white/40">K/D/A</span>
              </div>
            )}
          {data.acs != null && (
            <div>
              <span className="text-lg font-bold leading-none text-white">
                {data.acs}
              </span>
              <span className="block text-[9px] text-white/40">ACS</span>
            </div>
          )}
          {data.hsPercent != null && (
            <div>
              <span className="text-lg font-bold leading-none text-white">
                {data.hsPercent}%
              </span>
              <span className="block text-[9px] text-white/40">HS</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
