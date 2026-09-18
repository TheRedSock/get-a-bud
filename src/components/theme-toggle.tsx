"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDesign } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useDesign();
  const isDark = theme === "dark";

  return (
    <Button
      aria-label="Toggle theme"
      size="icon"
      variant="outline"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )
      ) : (
        <span className="inline-block size-4" aria-hidden />
      )}
    </Button>
  );
}
