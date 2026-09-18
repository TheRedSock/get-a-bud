export const THEME_STORAGE_KEY = "get-a-bud-theme";

export type Theme = "light" | "dark";

export function resolveTheme(
  stored: string | null,
  prefersDark: boolean,
): Theme {
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return prefersDark ? "dark" : "light";
}

/** Runs before first paint so SSR html does not need a hardcoded `.dark` class. */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var u=t==="dark"||(t!=="light"&&!t&&d);document.documentElement.classList.toggle("dark",u);if(t==="light"||t==="dark")document.cookie=k+"="+t+";path=/;max-age=31536000;SameSite=Lax"}catch(e){}})();`;

export function readThemeFromStorage(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return resolveTheme(stored, prefersDark);
}

export function readThemeFromDocument(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function readThemeFromCookie(stored: string | undefined): Theme | null {
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return null;
}

export function writeThemeCookie(theme: Theme) {
  document.cookie = `${THEME_STORAGE_KEY}=${theme};path=/;max-age=31536000;SameSite=Lax`;
}
