"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ProjectBarData = {
  title: string;
  redirectUrl: string | null;
  // Overrides the default "back → /work" navigation (e.g. /play's focus mode
  // just wants to deselect in place, not leave the canvas).
  onBack?: () => void;
};

type ActionBarContextType = {
  mode: "nav" | "project";
  projectData: ProjectBarData | null;
  setProject: (data: ProjectBarData) => void;
  clearProject: () => void;
};

const ActionBarContext = createContext<ActionBarContextType | null>(null);

export function ActionBarProvider({ children }: { children: React.ReactNode }) {
  const [projectData, setProjectData] = useState<ProjectBarData | null>(null);

  // Stable identity: without useCallback, a new function is created on every
  // provider render, which breaks any consumer effect that lists clearProject
  // as a dependency (setProject → re-render → new clearProject → effect sees
  // a changed dep → cleanup calls clearProject → re-render → ... infinite loop).
  const clearProject = useCallback(() => setProjectData(null), []);

  const value = useMemo<ActionBarContextType>(
    () => ({
      mode: projectData ? "project" : "nav",
      projectData,
      setProject: setProjectData,
      clearProject,
    }),
    [projectData, clearProject],
  );

  return (
    <ActionBarContext.Provider value={value}>
      {children}
    </ActionBarContext.Provider>
  );
}

export function useActionBar() {
  const ctx = useContext(ActionBarContext);
  if (!ctx) throw new Error("useActionBar must be used within ActionBarProvider");
  return ctx;
}
