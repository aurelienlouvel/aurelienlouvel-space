"use client";

import { useRef, useState, useEffect, useLayoutEffect } from "react";
import {
  type Params,
  DEFAULT_PARAMS,
  MOBILE_BREAKPOINT,
  applyResponsiveLayout,
  saveParamOverrides,
  clearParamOverrides,
} from "@/lib/play-params";
import { gapStats } from "@/lib/play-tile-layout";
import { ImportSettingsModal } from "./ImportSettingsModal";

// ─── Debug pane (dev only) ────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== "production";

function useDebugHashVisibility(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkHash = () => setVisible(window.location.hash === "#debug");
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  return visible;
}

export function DebugPane({
  paramsRef,
  onLayoutChange,
}: {
  paramsRef: React.MutableRefObject<Params>;
  onLayoutChange: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const debugVisible = useDebugHashVisibility();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [currentParamsSnapshot, setCurrentParamsSnapshot] = useState<Params>(
    {} as Params,
  );

  useLayoutEffect(() => {
    setCurrentParamsSnapshot({ ...paramsRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async () => {
    const data = {
      version: 1,
      timestamp: new Date().toISOString(),
      params: paramsRef.current,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch {
      alert("Failed to copy to clipboard");
    }
  };

  const handleImport = (newParams: Partial<Params>) => {
    Object.assign(paramsRef.current, newParams);
    saveParamOverrides(paramsRef.current);
    onLayoutChange();
  };

  useEffect(() => {
    if (!IS_DEV || !containerRef.current || !debugVisible) return;

    let disposed = false;
    let disposeFn: (() => void) | null = null;

    import("tweakpane").then(({ Pane }) => {
      if (disposed || !containerRef.current) return;

      const pane = new Pane({
        container: containerRef.current,
        title: "Canvas debug",
      });
      disposeFn = () => pane.dispose();

      const q = paramsRef.current;

      // ── Save / reset ─────────────────────────────────────────────────────────
      pane.addButton({ title: "💾 Save as default" }).on("click", () => {
        saveParamOverrides(paramsRef.current);
      });
      pane.addButton({ title: "↺ Reset to defaults" }).on("click", () => {
        clearParamOverrides();
        Object.assign(paramsRef.current, DEFAULT_PARAMS);
        const mobile = window.matchMedia(
          `(max-width: ${MOBILE_BREAKPOINT}px)`,
        ).matches;
        applyResponsiveLayout(paramsRef.current, mobile);
        pane.refresh();
        onLayoutChange();
      });

      // ── Settings (export/import) ───────────────────────────────────────────────
      const settings = pane.addFolder({ title: "Settings", expanded: false });
      settings.addButton({ title: "📋 Export" }).on("click", handleExport);
      settings.addButton({ title: "📥 Import" }).on("click", () => {
        setImportModalOpen(true);
      });

      // ── Layout ──────────────────────────────────────────────────────────────
      const layout = pane.addFolder({ title: "Layout", expanded: true });
      layout
        .addBinding(q, "cols", { label: "columns", min: 2, max: 8, step: 1 })
        .on("change", onLayoutChange);
      layout
        .addBinding(q, "gapX", { label: "gap X", min: 50, max: 700, step: 10 })
        .on("change", onLayoutChange);
      layout
        .addBinding(q, "gapY", { label: "gap Y", min: 50, max: 600, step: 10 })
        .on("change", onLayoutChange);
      layout
        .addBinding(q, "colStagger", {
          label: "stagger",
          min: 0,
          max: 500,
          step: 10,
        })
        .on("change", onLayoutChange);
      layout
        .addBinding(q, "jitterX", {
          label: "jitter X",
          min: 0,
          max: 250,
          step: 5,
        })
        .on("change", onLayoutChange);
      layout
        .addBinding(q, "jitterY", {
          label: "jitter Y",
          min: 0,
          max: 250,
          step: 5,
        })
        .on("change", onLayoutChange);
      layout
        .addBinding(q, "colRhythm", {
          label: "col rhythm",
          min: 0,
          max: 1,
          step: 0.05,
        })
        .on("change", onLayoutChange);

      // ── Gap stats (read-only monitors) ──────────────────────────────────────
      const stats = gapStats(q);
      const statsFolder = pane.addFolder({
        title: "Gap stats (px)",
        expanded: false,
      });
      statsFolder.addBinding(stats, "minGapX", {
        label: "min X",
        readonly: true,
      });
      statsFolder.addBinding(stats, "maxGapX", {
        label: "max X",
        readonly: true,
      });
      statsFolder.addBinding(stats, "minGapY", {
        label: "min Y",
        readonly: true,
      });
      statsFolder.addBinding(stats, "maxGapY", {
        label: "max Y",
        readonly: true,
      });
      layout.on("change", () => {
        Object.assign(stats, gapStats(paramsRef.current));
        pane.refresh();
      });

      // ── Card sizes ──────────────────────────────────────────────────────────
      const cards = pane.addFolder({ title: "Card sizes", expanded: false });
      cards
        .addBinding(q, "scaleMin", {
          label: "scale min",
          min: 0.3,
          max: 1.0,
          step: 0.05,
        })
        .on("change", onLayoutChange);
      cards
        .addBinding(q, "scaleMax", {
          label: "scale max",
          min: 1.0,
          max: 2.0,
          step: 0.05,
        })
        .on("change", onLayoutChange);
      cards.addBinding(q, "bracketRadius", {
        label: "bracket round",
        min: 8,
        max: 32,
        step: 1,
      });

      // ── Rotation (live — no rebuild) ─────────────────────────────────────────
      const rotation = pane.addFolder({ title: "Rotation", expanded: false });
      rotation.addBinding(q, "rotMax", {
        label: "card tilt (°)",
        min: 0,
        max: 15,
        step: 0.5,
      });

      // ── Camera ──────────────────────────────────────────────────────────────
      const cam = pane.addFolder({ title: "Camera", expanded: false });
      cam.addBinding(q, "focusWidthFrac", {
        label: "focus width %",
        min: 0.1,
        max: 0.6,
        step: 0.01,
      });
      cam.addBinding(q, "focusCenterFrac", {
        label: "focus center %",
        min: 0.1,
        max: 0.9,
        step: 0.01,
      });
      cam.addBinding(q, "focusVCenter", {
        label: "v-center (0↑ · 1↓)",
        min: 0.1,
        max: 0.9,
        step: 0.01,
      });
      cam.addBinding(q, "focusZoomIntensity", {
        label: "focus zoom",
        min: 0.3,
        max: 1.0,
        step: 0.05,
      });

      // ── Info panel ──────────────────────────────────────────────────────────
      const panel = pane.addFolder({ title: "Info panel", expanded: false });
      panel.addBinding(q, "gapPanel", {
        label: "gap",
        min: 8,
        max: 100,
        step: 4,
      });
      panel.addBinding(q, "panelVAnchor", {
        label: "v-anchor (0↓ · 1↑)",
        min: 0,
        max: 1,
        step: 0.01,
      });

      // ── Dots ────────────────────────────────────────────────────────────────
      const dots = pane.addFolder({ title: "Dots", expanded: false });
      dots.addBinding(q, "gridCell", {
        label: "spacing",
        min: 20,
        max: 200,
        step: 5,
      });
      dots.addBinding(q, "dotRadius", {
        label: "radius",
        min: 0.5,
        max: 6.0,
        step: 0.1,
      });

      // ── Ripple (live — no rebuild, read every frame in GridBackground) ──────
      const ripple = pane.addFolder({ title: "Ripple", expanded: false });
      ripple.addBinding(q, "rippleSpeed", {
        label: "speed",
        min: 30,
        max: 300,
        step: 10,
      });
      ripple.addBinding(q, "rippleDuration", {
        label: "duration (s)",
        min: 0.05,
        max: 0.3,
        step: 0.01,
      });
      ripple.addBinding(q, "ripplePixel", {
        label: "pixel size",
        min: 2,
        max: 10,
        step: 1,
      });
      ripple.addBinding(q, "rippleWidth", {
        label: "ring width",
        min: 2,
        max: 10,
        step: 1,
      });
    });

    return () => {
      disposed = true;
      disposeFn?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugVisible]);

  if (!IS_DEV) return null;
  return (
    <>
      <div
        ref={containerRef}
        className={`fixed top-4 left-4 z-[200] pointer-events-auto ${
          !debugVisible ? "hidden" : ""
        }`}
      />
      <ImportSettingsModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        currentParams={currentParamsSnapshot}
        onApply={handleImport}
      />
    </>
  );
}
