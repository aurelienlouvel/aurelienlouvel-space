"use client";

import { useState, useMemo } from "react";
import type { Params } from "@/lib/play-params";

export function ImportSettingsModal({
  isOpen,
  onClose,
  currentParams,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentParams: Params;
  onApply: (params: Partial<Params>) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<Partial<Params> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const parseAndPreview = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !parsed.params ||
        typeof parsed.params !== "object"
      ) {
        setError(
          "Invalid format. Expected: { version: 1, timestamp: ..., params: {...} }",
        );
        setImported(null);
        setSelected(new Set());
        return;
      }
      const params = parsed.params as Partial<Params>;
      setImported(params);
      setSelected(new Set(Object.keys(params)));
      setError(null);
    } catch {
      setError("Invalid JSON");
      setImported(null);
      setSelected(new Set());
    }
  };

  const handleImport = () => {
    if (!imported) return;
    const toApply: Partial<Params> = {};
    for (const key of selected) {
      if (key in imported) {
        toApply[key as keyof Params] = imported[key as keyof Params];
      }
    }
    onApply(toApply);
    onClose();
    setInput("");
    setImported(null);
    setSelected(new Set());
  };

  const currentParamsDisplay = useMemo(() => {
    const result: Record<string, string> = {};
    if (imported) {
      for (const key of Object.keys(imported)) {
        const val = currentParams[key as keyof Params];
        result[key] = val?.toString() || "–";
      }
    }
    return result;
  }, [imported, currentParams]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[210] bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 shadow-lg max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Import Settings</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Paste JSON:</label>
          <textarea
            value={input}
            onChange={(e) => parseAndPreview(e.target.value)}
            placeholder='{ "version": 1, "timestamp": "...", "params": {...} }'
            className="w-full h-32 p-2 border border-gray-300 rounded font-mono text-xs"
          />
        </div>

        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}

        {imported && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Select settings to import:
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Object.entries(imported).map(([key, value]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={(e) => {
                      const newSelected = new Set(selected);
                      if (e.target.checked) {
                        newSelected.add(key);
                      } else {
                        newSelected.delete(key);
                      }
                      setSelected(newSelected);
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-medium">{key}</div>
                    <div className="text-xs text-gray-600">
                      current: {currentParamsDisplay[key]}
                    </div>
                    <div className="text-xs text-blue-600">
                      imported: {value?.toString() || "–"}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!imported || selected.size === 0}
            className="flex-1 px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
