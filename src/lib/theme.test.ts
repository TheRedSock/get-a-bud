import { describe, expect, it } from "vitest";

import { readThemeFromCookie, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("prefers an explicit stored theme", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to system preference when nothing is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });
});

describe("readThemeFromCookie", () => {
  it("returns null when the cookie is missing or invalid", () => {
    expect(readThemeFromCookie(undefined)).toBeNull();
    expect(readThemeFromCookie("sepia")).toBeNull();
  });

  it("returns stored light or dark", () => {
    expect(readThemeFromCookie("light")).toBe("light");
    expect(readThemeFromCookie("dark")).toBe("dark");
  });
});
