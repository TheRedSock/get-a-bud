"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

type DesignContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const DesignContext = createContext<DesignContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedTheme = localStorage.getItem("get-a-bud-theme") as Theme | null;
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      setThemeState(storedTheme ?? (prefersDark ? "dark" : "light"));
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const value = useMemo<DesignContextValue>(
    () => ({
      theme,
      setTheme(nextTheme) {
        localStorage.setItem("get-a-bud-theme", nextTheme);
        setThemeState(nextTheme);
      },
    }),
    [theme],
  );

  return (
    <DesignContext.Provider value={value}>{children}</DesignContext.Provider>
  );
}

export function useDesign() {
  const context = useContext(DesignContext);

  if (!context) {
    throw new Error("useDesign must be used within ThemeProvider");
  }

  return context;
}
