"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import "mapbox-gl/dist/mapbox-gl.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "@/components/primitives/Icon";
import { EASE_IN_OUT, EASE_OUT } from "@/lib/easings";
import {
  Backward02Icon,
  Bicycle01Icon,
  CloudAngledRainZapIcon,
  CloudBigRainIcon,
  CloudIcon,
  CloudLittleRainIcon,
  Cards02Icon,
  FavouriteIcon,
  FilmIcon,
  Forward02Icon,
  GithubIcon,
  GitCommitIcon,
  GameController03Icon,
  Image02Icon,
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
      cardTitle: string | null;
      icon: string | null;
    }
  | {
      type: "video";
      videoUrl: string | null;
      caption: string | null;
      cardTitle: string | null;
      icon: string | null;
    }
  | {
      type: "music";
      cardTitle: string | null;
      icon: string | null;
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
      imageColors: (string | null)[];
      tagline: string | null;
    }
  | {
      type: "strava";
      cardTitle: string | null;
      icon: string | null;
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
      cardTitle: string | null;
      icon: string | null;
      repo: string | null;
      message: string | null;
      date: string | null;
      contributions: Array<{ level: number }> | null;
      totalContributions: number | null;
      url: string | null;
    }
  | {
      type: "location";
      cardTitle: string | null;
      icon: string | null;
      label: string | null;
      timezone: string | null;
      temperature: number | null;
      weatherCode: number | null;
      lat: number | null;
      lon: number | null;
    }
  | {
      type: "valorant";
      cardTitle: string | null;
      icon: string | null;
      trackerUrl: string | null;
      region: string | null;
    }
  | {
      type: "letterboxd";
      cardTitle: string | null;
      icon: string | null;
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
      cardTitle: string | null;
      icon: string | null;
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

// Shared "nothing to show yet" state — used both while a card is still
// fetching (Valorant) and when a slide genuinely has no data (empty Sanity
// field). Deliberately content-free: no icon, no label, just a neutral
// gradient, so it never looks like a broken/mislabeled card mid-stack.
function PlaceholderSlide() {
  return (
    <div className="h-full w-full bg-gradient-to-br from-stone-200 to-stone-300" />
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
    return <PlaceholderSlide />;
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
        <Icon name={slide.icon} fallback={MapPinpoint01Icon} size={15} strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">
          {slide.cardTitle || "Location"}
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

const PREVIEW_CUTOFF_SEC = 24; // Apple's clips run ~30s natively; cut in early
const TRACK_VOLUME = 0.33;
// Equal, half-second ramps. The previous 200ms/100ms pair was too quick to
// read as an actual fade, and — since fade-in was shorter than fade-out —
// the incoming track reached full volume while the outgoing one was still
// audibly present, masking its tail instead of letting it be heard fading
// down. Matching durations keep both tracks genuinely audible together for
// the whole transition instead of one drowning out the other.
const AUDIO_FADE_OUT_MS = 500;
const AUDIO_FADE_IN_MS = 500;

type MusicNav = {
  // Fixed shuffled play order — a permutation of every track index, computed
  // once and never reshuffled afterwards (see MusicCard below).
  order: number[];
  // Unbounded in both directions — indexed into `order` via `mod` so next/
  // prev can go forever either way without ever running out or reshuffling.
  pos: number;
};

// Fisher-Yates shuffle of every index 0..total-1, minus `exclude` (the
// round-seeded starting track, already placed separately — see MusicCard).
function shuffleIndices(total: number, exclude: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < total; i++) {
    if (i !== exclude) arr.push(i);
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Always-positive modulo (JS's `%` can return negative for negative `n`),
// so `pos` can go arbitrarily negative (repeated prev) and still wrap.
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// Ramps an <audio> element's volume to `target` over `ms` (one rAF step at a
// time) instead of snapping it — softens the attack when a track starts and
// the cut when it stops or hands off to the next one. Runs as a plain rAF
// loop closed over the audio element, independent of React's lifecycle, so
// an outgoing track can keep fading after its owning effect has already
// torn down (see the cleanup below) without delaying the next one.
function fadeAudioVolume(
  audio: HTMLAudioElement,
  target: number,
  ms: number,
  onDone?: () => void,
) {
  if (audio.volume === target) {
    onDone?.();
    return;
  }
  const start = audio.volume;
  const startTime = performance.now();
  const step = (now: number) => {
    // Clamp both ends: rAF's timestamp can occasionally land a hair before
    // this `startTime` sample, which would otherwise send `t` negative and
    // the volume with it — an out-of-range assignment throws on a real
    // <audio> element and silently kills the rest of the ramp.
    const t = Math.min(Math.max((now - startTime) / ms, 0), 1);
    audio.volume = start + (target - start) * t;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };
  requestAnimationFrame(step);
}

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

  // Mirrors `playing`, read (not subscribed to) from the track-loading effect
  // below so a prev/next mid-playback can resume the new track without also
  // re-running that effect on every single play/pause toggle.
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const total = slide.variants.length;

  // The whole pool is resolved once server-side; the visitor then moves
  // through it — by hand with the prev/next buttons, or automatically as
  // each track finishes (see the "ended" handling below) — in ONE fixed
  // shuffled order that's generated once and never reshuffled afterwards:
  // `order` is a permutation of every track index, `pos` just walks it
  // (wrapping via `mod`), so going forward past the end or backward past
  // the start replays the *same* order on repeat rather than rolling a new
  // one each lap. Both directions are always live, right from the first
  // render — prev at pos 0 simply wraps to the last entry of `order`.
  // The very first track still follows `round` (placed at order[0], outside
  // the shuffle), so each time this card cycles back into view (fresh
  // mount, see StoryStack's key-recycling) it opens on a different one than
  // last time — the shuffled order for the rest of the pool is also
  // re-rolled at that point, but then holds steady for the whole visit.
  const [nav, setNav] = useState<MusicNav>(() => {
    const initial = total > 0 ? (round ?? 0) % total : 0;
    const order = total > 1 ? [initial, ...shuffleIndices(total, initial)] : [initial];
    return { order, pos: 0 };
  });

  const variant =
    total > 0 ? (slide.variants[nav.order[mod(nav.pos, nav.order.length)]] ?? null) : null;
  const previewUrl = variant?.previewUrl ?? null;

  const goPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // prevent story advance
      if (total <= 1) return;
      setNav((prev) => ({ ...prev, pos: prev.pos - 1 }));
    },
    [total],
  );

  const goNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // prevent story advance
      if (total <= 1) return;
      setNav((prev) => ({ ...prev, pos: prev.pos + 1 }));
    },
    [total],
  );

  useEffect(() => {
    if (!previewUrl) return;
    const audio = new Audio(previewUrl);
    audio.volume = 0; // ramped up to TRACK_VOLUME by the fade-in below
    audioRef.current = audio;

    // Guard against "ended" firing more than once for the same track (it
    // shouldn't, but playback teardown below can race it).
    let finished = false;
    const onTrackFinished = () => {
      if (finished) return;
      finished = true;
      if (total > 1) {
        // Keep the playlist going: hand off to the next track. `playing`
        // itself is deliberately left untouched here (unlike the manual
        // pause path below) — if it's still true, the new track's own
        // effect run (see playingRef above) picks it up and auto-resumes,
        // so "play mode" carries on instead of stopping at track end. The
        // outgoing audio fades out via this effect's own cleanup, which is
        // about to run as `previewUrl` changes below.
        setAudioProgress(0);
        setNav((prev) => ({ ...prev, pos: prev.pos + 1 }));
      } else {
        // No next track to hand off to — fade this one out in place rather
        // than relying on the cleanup, since nothing else here changes
        // `previewUrl` to trigger it.
        fadeAudioVolume(audio, 0, AUDIO_FADE_OUT_MS, () => {
          audio.pause();
          audio.currentTime = 0;
        });
        setPlaying(false);
        setAudioProgress(0);
        onPlayingChange?.(false);
      }
    };
    // Cut the preview short at PREVIEW_CUTOFF_SEC rather than letting Apple's
    // clip run its full ~30s — the ring tracks progress against that cap, so
    // it lands on 100% right as playback cuts. "ended" stays wired too, as a
    // fallback for the rare clip that's naturally shorter than the cap.
    const onTimeUpdate = () => {
      setAudioProgress(Math.min(audio.currentTime / PREVIEW_CUTOFF_SEC, 1));
      if (audio.currentTime >= PREVIEW_CUTOFF_SEC) {
        onTrackFinished();
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onTrackFinished);

    // A prev/next click (manual or auto-advance-on-end above) lands here
    // with the *previous* track's audio already torn down by the cleanup
    // below. If that previous track was mid-playback, keep playing rather
    // than dropping into paused — the cleanup's setPlaying(false)/
    // onPlayingChange(false) below and these calls land in the same batch,
    // and this one runs last, so it wins.
    if (playingRef.current) {
      audio.play().catch(() => {});
      fadeAudioVolume(audio, TRACK_VOLUME, AUDIO_FADE_IN_MS);
      setPlaying(true);
      onPlayingChange?.(true);
    }

    return () => {
      // Fade the outgoing track out instead of cutting it dead. This runs
      // independently of React (a plain rAF loop on a detached Audio
      // object), so it never delays the next track's setup/fade-in above —
      // for a moment both are audible at once, old fading down as new fades
      // up.
      fadeAudioVolume(audio, 0, AUDIO_FADE_OUT_MS, () => audio.pause());
      // The track can change (round advancing, prev/next, or auto-advance)
      // without this card ever unmounting — reset playback state too, not
      // just the audio element. (Resumed again above if it turns out we
      // were playing.)
      setPlaying(false);
      setAudioProgress(0);
      onPlayingChange?.(false);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onTrackFinished);
    };
  }, [previewUrl, onPlayingChange, total]);

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // prevent story advance
      const audio = audioRef.current;
      if (!audio) return;
      if (playing) {
        fadeAudioVolume(audio, 0, AUDIO_FADE_OUT_MS, () => audio.pause());
        setPlaying(false);
        onPlayingChange?.(false);
      } else {
        audio.volume = 0; // reset each play so HMR / stale instances stay correct
        audio.currentTime = 0;
        setAudioProgress(0);
        audio.play().catch(() => {});
        fadeAudioVolume(audio, TRACK_VOLUME, AUDIO_FADE_IN_MS);
        setPlaying(true);
        onPlayingChange?.(true);
      }
    },
    [playing, onPlayingChange],
  );

  // Fallback when no track data yet
  if (!variant?.trackName) {
    return <PlaceholderSlide />;
  }

  // Shared identity for the transition below — changes exactly when the
  // track does (manual prev/next or auto-advance-on-end), never on a
  // play/pause toggle of the same track.
  const trackKey = previewUrl ?? "none";

  return (
    <div className="relative h-full w-full overflow-hidden bg-white/90">
      {/* Blurred album art background — blurs out the old cover and
          defocuses back in on the new one as the track changes. */}
      <AnimatePresence initial={false}>
        {variant.artworkUrl && (
          <motion.img
            key={trackKey}
            src={variant.artworkUrl}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover"
            initial={{ filter: "blur(30px)", opacity: 0 }}
            animate={{ filter: "blur(12px)", opacity: 1 }}
            exit={{ filter: "blur(30px)", opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_IN_OUT }}
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <div className="relative flex h-full flex-col text-white">
        {/* Top row */}
        <div className="flex items-center gap-1.5 p-4">
          <Icon name={slide.icon} fallback={MusicNote01Icon} size={18} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide text-white/80">
            {slide.cardTitle || "Music"}
          </span>
        </div>

        {/* Bottom section */}
        <div className="mt-auto p-6">
          {variant.artworkUrl && (
            <div className="relative mb-3 h-16 w-16" style={{ perspective: 600 }}>
              {/* Cover art flips to reveal the new track */}
              <AnimatePresence initial={false}>
                <motion.img
                  key={trackKey}
                  src={variant.artworkUrl}
                  alt={variant.trackName}
                  className="absolute inset-0 h-16 w-16 rounded-xl object-cover shadow-lg"
                  style={{ backfaceVisibility: "hidden" }}
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: -90, opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE_IN_OUT }}
                />
              </AnimatePresence>
            </div>
          )}

          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={trackKey}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <p className="text-base font-semibold leading-tight">
                {variant.trackName}
              </p>
              <p className="mt-0.5 text-sm text-white/70">
                {variant.artistName}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-3 flex items-center gap-2.5">
            {total > 1 && (
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous track"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-opacity hover:opacity-80"
              >
                <HugeiconsIcon icon={Backward02Icon} size={14} strokeWidth={2} />
              </button>
            )}

            {variant.previewUrl && (
              <button
                type="button"
                onClick={toggle}
                className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm transition-opacity hover:opacity-80"
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

            {total > 1 && (
              <button
                type="button"
                onClick={goNext}
                aria-label="Next track"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-opacity hover:opacity-80"
              >
                <HugeiconsIcon icon={Forward02Icon} size={14} strokeWidth={2} />
              </button>
            )}
          </div>
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
    return <PlaceholderSlide />;
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
          <Icon name={slide.icon} fallback={FilmIcon} size={16} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide text-white/80">
            {slide.cardTitle || "Movies"}
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

// Rank badge colours: gold / silver / bronze podium read, falls back to a
// plain neutral chip past 3rd (shouldn't happen — the server already hands
// back only the top 3 — but the array is sliced defensively below anyway).
const BGG_RANK_STYLE = [
  "bg-amber-400 text-stone-900",
  "bg-zinc-300 text-stone-900",
  "bg-orange-700 text-white",
] as const;

function BggCard({
  slide,
}: {
  slide: Extract<StorySlide, { type: "bgg" }>;
}) {
  // The server already hands back the user's actual top 3 (ranked #1–#3, see
  // getBggEntries) — shown together as a single ranked list rather than
  // rotated one-per-round like the other card types.
  const top3 = slide.variants.slice(0, 3).filter((game) => game.gameName);

  if (top3.length === 0) {
    return <PlaceholderSlide />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-900">
      {top3[0].imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={top3[0].imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative flex h-full flex-col text-white">
        <div className="flex items-center gap-1.5 p-4">
          <Icon name={slide.icon} fallback={Cards02Icon} size={16} strokeWidth={2} />
          <span className="text-xs font-medium uppercase tracking-wide text-white/80">
            {slide.cardTitle || "Top Board Games"}
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-3 p-6">
          {top3.map((game, i) => (
            <div key={game.gameUrl ?? game.gameName} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  BGG_RANK_STYLE[i] ?? "bg-white/20 text-white"
                }`}
              >
                {i + 1}
              </span>
              {game.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={game.imageUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-lg"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">
                  {game.gameName}
                </p>
                {game.yearPublished && (
                  <p className="text-xs text-white/60">{game.yearPublished}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Fact card ──────────────────────────────────────────────────────────────

// Builds a diagonal gradient from the image's palette swatches (dominant +
// vibrant + dark-vibrant), each mixed toward stone-900 first so every stop
// stays dark enough for white text regardless of how saturated/light the
// raw swatch is — same contrast guarantee as the old single-color wash.
function factGradientBg(colors: (string | null)[]): string {
  const mixed = colors
    .filter((c): c is string => !!c)
    .map((c) => `color-mix(in srgb, ${c} 40%, var(--color-stone-900))`);
  if (mixed.length === 0) return "var(--color-stone-800)";
  if (mixed.length === 1) return mixed[0];
  const stops = mixed
    .map((c, i) => `${c} ${Math.round((i / (mixed.length - 1)) * 100)}%`)
    .join(", ");
  return `linear-gradient(135deg, ${stops})`;
}

function FactCard({
  slide,
}: {
  slide: Extract<StorySlide, { type: "fact" }>;
}) {
  if (!slide.value) {
    return <PlaceholderSlide />;
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
    const bg = factGradientBg(slide.imageColors);
    return (
      <div
        className="relative flex h-full w-full flex-col overflow-hidden text-white"
        style={{ background: bg }}
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
        <Icon name={slide.icon} fallback={WorkoutRunIcon} size={16} strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">
          {slide.cardTitle || "Activity"}
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
      if (!slide.imageUrl) return <PlaceholderSlide />;
      return (
        <div className="relative h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl}
            alt={slide.alt ?? ""}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 p-4 text-white drop-shadow">
            <Icon name={slide.icon} fallback={Image02Icon} size={15} strokeWidth={2} />
            <span className="text-xs font-medium uppercase tracking-wide text-white/80">
              {slide.cardTitle || "Photo"}
            </span>
          </div>
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
      if (!slide.videoUrl) return <PlaceholderSlide />;
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
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center gap-1.5 p-4 text-white drop-shadow">
            <Icon name={slide.icon} fallback={Video01Icon} size={15} strokeWidth={2} />
            <span className="text-xs font-medium uppercase tracking-wide text-white/80">
              {slide.cardTitle || "Video"}
            </span>
          </div>
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
      if (!slide.repo && !slide.contributions) return <PlaceholderSlide />;

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
            <Icon name={slide.icon} fallback={GithubIcon} size={16} strokeWidth={2} />
            <span className="text-xs font-medium uppercase tracking-wide text-white/80">
              {slide.cardTitle || "Code"}
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
      return <BggCard slide={slide} />;
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

  if (loading || !data) {
    return <PlaceholderSlide />;
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
        <Icon name={slide.icon} fallback={GameController03Icon} size={16} strokeWidth={2} />
        <span className="text-xs font-medium uppercase tracking-wide text-white/80">
          {slide.cardTitle || "Valorant"}
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
