"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDesign } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useDesign();
  const isDark = theme === "dark";

  return (
    <Button
      aria-label="Toggle theme"
      size="icon"
      variant="outline"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
