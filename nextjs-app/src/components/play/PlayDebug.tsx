"use client";

import { useRef, useEffect, useState, type RefObject } from "react";
import { Leva } from "leva";
import { toast } from "sonner";
import {
  type PlayDebugRef,
  type PlayDebugState,
  type PlayRuntimeState,
} from "./PlayCanvas";
import type { LayoutStats } from "./layout-types";
import { AnimationTab } from "./debug/AnimationTab";
import { CanvasTab } from "./debug/CanvasTab";
import { FrameInspector } from "./debug/FrameInspector";
import { GlobalTab } from "./debug/GlobalTab";
import { MediaTab } from "./debug/MediaTab";
import { StyleTab } from "./debug/StyleTab";
import { TimelineBar } from "./debug/TimelineBar";

const STORAGE_KEY = "play-debug-v35";
const TAB_STORAGE_KEY = "play-debug-tab-v2";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type DebugTab = "global" | "media" | "canvas" | "style" | "animation";

const TABS: { id: DebugTab; label: string }[] = [
  { id: "global", label: "global" },
  { id: "media", label: "media" },
  { id: "canvas", label: "canvas" },
  { id: "style", label: "style" },
  { id: "animation", label: "animation" },
];

const TAB_KEYWORDS: Record<DebugTab, string[]> = {
  global: ["camera", "zoom", "pan", "inertia", "friction", "dezoom", "motion", "blur", "fisheye", "cursor", "curseur", "trail", "trainee", "rotate", "inclinaison"],
  media: ["media", "width", "height", "scale", "variance", "radius", "border", "corner", "smoothing", "rotation", "range"],
  canvas: ["canvas", "layout", "gap", "repeat", "aspect", "seed", "iterations", "background", "points", "dots", "parallax", "ombre", "shadow", "decalage", "etalement", "soulevement"],
  style: ["style", "prism", "vague", "wave", "glow", "lumiere", "irisation", "opacite", "eclats", "shard", "pixels", "degrade", "panel", "lentille", "aplat", "flat", "carres", "taille", "blanc", "gris", "gray", "radius", "arrondi", "coins", "densite", "nombre", "pastille", "play", "nav", "couleurs", "page"],
  animation: ["animation", "survol", "hover", "ouverture", "transition", "approche", "burst", "attente", "cascade", "layers", "retour", "carte", "deck", "traction", "rejouer", "detail", "panneau", "easing", "duration"],
};

function loadSavedTab(): DebugTab {
  if (typeof window === "undefined") return "animation";
  try {
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY) as DebugTab | null;
    if (saved && TABS.some((t) => t.id === saved)) return saved;
  } catch {
    // fallback
  }
  return "animation";
}

function restore(state: PlayDebugState) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof stored !== "object" || stored === null) return;

  const saved = stored as Record<string, unknown>;
  const groups = Object.entries(
    state as unknown as Record<string, Record<string, unknown>>,
  );
  for (const [name, group] of groups) {
    if (name === "studio") continue; // Session only
    const savedGroup = saved[name];
    if (typeof savedGroup !== "object" || savedGroup === null) continue;
    for (const [key, fallback] of Object.entries(group)) {
      const value = (savedGroup as Record<string, unknown>)[key];
      if (typeof value !== typeof fallback) continue;
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      if (typeof value === "string" && key === "color" && !HEX_COLOR.test(value))
        continue;
      group[key] = value;
    }
  }
  if (state.gravity && typeof state.gravity.iterations === "number") {
    if (state.gravity.iterations > 600 || state.gravity.iterations < 20) {
      state.gravity.iterations = 120;
    }
  }
}

const LEVA_THEME = {
  colors: {
    elevation1: "#141414",
    elevation2: "#1c1c1c",
    elevation3: "#262626",
    accent1: "#ffffff",
    accent2: "#888888",
    accent3: "#444444",
    highlight1: "#e0e0e0",
    highlight2: "#b0b0b0",
    highlight3: "#707070",
    vivid1: "#f5a623",
  },
  radii: {
    xs: "2px",
    sm: "4px",
    lg: "8px",
  },
  space: {
    sm: "6px",
    md: "10px",
    rowGap: "7px",
    colGap: "7px",
  },
  fonts: {
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  sizes: {
    rootWidth: "100%",
    controlWidth: "175px",
    numberInputMinWidth: "44px",
    rowHeight: "26px",
    folderTitleHeight: "24px",
  },
};

// ── Main Debug Component ────────────────────────────────────────
export function PlayDebug({
  state,
  stats,
  onLayoutChange,
  onSimulateSelect,
  onResetTransition,
  runtime,
  onTextLayoutChange,
}: {
  state: PlayDebugRef;
  stats?: LayoutStats;
  onLayoutChange: () => void;
  onSimulateSelect: () => void;
  onResetTransition: () => void;
  runtime?: RefObject<PlayRuntimeState>;
  onTextLayoutChange?: () => void;
}) {
  const initializedRef = useRef<boolean | null>(null);
  if (initializedRef.current == null) {
    restore(state.current);
    initializedRef.current = true;
  }

  const [activeTab, setActiveTab] = useState<DebugTab>(() => loadSavedTab());
  const [searchQuery, setSearchQuery] = useState("");
  const panelContentRef = useRef<HTMLDivElement>(null);

  const handleTabChange = (tab: DebugTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TAB_STORAGE_KEY, tab);
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    const container = panelContentRef.current;
    if (!container) return;

    const applyFilter = () => {
      const q = searchQuery.trim().toLowerCase();
      const rows = container.querySelectorAll<HTMLElement>(
        '[class*="StyledRow"], [class*="StyledInputRow"]',
      );
      const folders = container.querySelectorAll<HTMLElement>(
        '[class*="StyledFolder"]',
      );

      if (!q) {
        rows.forEach((r) => (r.style.display = ""));
        folders.forEach((f) => (f.style.display = ""));
        return;
      }

      folders.forEach((folder) => {
        const titleEl = folder.querySelector<HTMLElement>(
          '[class*="StyledTitle"]',
        );
        const folderTitle = titleEl?.textContent?.toLowerCase() ?? "";
        const folderMatches = folderTitle.includes(q);

        const folderRows = folder.querySelectorAll<HTMLElement>(
          '[class*="StyledRow"], [class*="StyledInputRow"]',
        );
        let anyRowVisible = false;

        folderRows.forEach((row) => {
          const text = row.textContent?.toLowerCase() ?? "";
          if (folderMatches || text.includes(q)) {
            row.style.display = "";
            anyRowVisible = true;
          } else {
            row.style.display = "none";
          }
        });

        if (folderMatches || anyRowVisible) {
          folder.style.display = "";
        } else {
          folder.style.display = "none";
        }
      });

      rows.forEach((row) => {
        if (row.closest('[class*="StyledFolder"]')) return;
        const text = row.textContent?.toLowerCase() ?? "";
        row.style.display = text.includes(q) ? "" : "none";
      });
    };

    applyFilter();
    const t1 = setTimeout(applyFilter, 50);
    const t2 = setTimeout(applyFilter, 160);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [searchQuery, activeTab]);

  const saveToLocalStorage = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.current));
      toast.success("Settings saved to localStorage");
    } catch {
      toast.error("Unable to save settings to localStorage");
    }
  };

  const resetSaved = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const copyJson = () => {
    navigator.clipboard
      .writeText(JSON.stringify(state.current, null, 2))
      .then(
        () => toast.success("Configuration copied to clipboard"),
        () => toast.error("Failed to copy configuration to clipboard"),
      );
  };

  return (
    <>
      {/* Sleek Floating Debug Panel: Header (2 lines) + Leva Controls Area */}
      <div
        id="leva__root"
        className="fixed top-3 right-3 z-[999999] flex flex-col w-[392px] max-h-[calc(100vh-24px)] pointer-events-auto select-none rounded-xl border border-white/10 bg-[#141414]/95 backdrop-blur-md shadow-2xl overflow-hidden"
      >
        {/* Line 1: 6 Segmented Tabs */}
        <div className="flex items-center gap-1 p-1.5 border-b border-white/5 bg-white/[0.02]">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const q = searchQuery.trim().toLowerCase();
            const hasMatches =
              Boolean(q) &&
              TAB_KEYWORDS[tab.id]?.some((k) => k.includes(q));
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex-1 py-1 text-[11px] font-mono rounded transition-all duration-150 capitalize text-center ${
                  isActive
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
                {hasMatches && !isActive && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Line 2: Search Input + Save & Copy Actions */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/10 bg-[#161616]">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 1114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings..."
              className="w-full h-7 pl-8 pr-6 text-xs font-mono bg-white/5 hover:bg-white/10 focus:bg-white/[0.08] text-white placeholder:text-white/30 rounded border border-white/10 focus:border-white/30 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs px-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={saveToLocalStorage}
            title="Save settings to localStorage"
            className="flex items-center gap-1 px-2.5 h-7 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded transition-all active:scale-95 shrink-0"
          >
            Save
          </button>
          <button
            onClick={resetSaved}
            title="Forget saved settings and reload with the defaults"
            className="flex items-center gap-1 px-2.5 h-7 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded transition-all active:scale-95 shrink-0"
          >
            Reset
          </button>
          <button
            onClick={copyJson}
            title="Copy JSON configuration to clipboard"
            className="flex items-center gap-1 px-2.5 h-7 text-xs font-mono text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded transition-all active:scale-95 shrink-0"
          >
            Copy
          </button>
        </div>

        {/* Animation : étape courante, tête de lecture et inspecteur des grandeurs en direct */}
        {activeTab === "animation" && (
          <>
            <TimelineBar state={state} runtime={runtime} />
            <div className="max-h-[36vh] overflow-y-auto overscroll-contain leva-custom-scroll">
              <FrameInspector state={state} runtime={runtime} />
            </div>
          </>
        )}

        {/* Leva Controls Area: takes whatever height is needed, scrolls smoothly if taller than screen */}
        <div
          ref={panelContentRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain leva-custom-scroll"
        >
          <Leva
            fill
            flat
            titleBar={false}
            theme={LEVA_THEME}
          />
        </div>
      </div>

      {activeTab === "global" && <GlobalTab state={state} />}
      {activeTab === "media" && <MediaTab state={state} onLayoutChange={onLayoutChange} />}
      {activeTab === "canvas" && (
        <CanvasTab state={state} stats={stats} onLayoutChange={onLayoutChange} />
      )}
      {activeTab === "style" && <StyleTab state={state} onPanelChange={onTextLayoutChange} />}
      {activeTab === "animation" && (
        <AnimationTab
          state={state}
          runtime={runtime}
          onSimulateSelect={onSimulateSelect}
          onResetTransition={onResetTransition}
          onTextLayoutChange={onTextLayoutChange}
        />
      )}
    </>
  );
}
