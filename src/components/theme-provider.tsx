"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readThemeFromDocument,
  THEME_STORAGE_KEY,
  writeThemeCookie,
  type Theme,
} from "@/lib/theme";

type DesignContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** False until client theme has been read (avoids SSR/client icon mismatches). */
  mounted: boolean;
};

const DesignContext = createContext<DesignContextValue | null>(null);

export function ThemeProvider({
  children,
  initialTheme = "dark",
}: {
  children: ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [mounted, setMounted] = useState(false);

  // Hydration correction: must synchronously read actual DOM theme class after
  // hydration to prevent flash of wrong theme. This is the documented pattern
  // for useLayoutEffect-based SSR mismatch fixes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    setThemeState(readThemeFromDocument());
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useLayoutEffect(() => {
    if (!mounted) {
      return;
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme, mounted]);

  const value = useMemo<DesignContextValue>(
    () => ({
      theme,
      mounted,
      setTheme(nextTheme) {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        writeThemeCookie(nextTheme);
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
        setThemeState(nextTheme);
      },
    }),
    [theme, mounted],
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
