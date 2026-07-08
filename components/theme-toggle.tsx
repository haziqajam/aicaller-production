"use client";

import { useTheme } from "@/components/theme-provider";
import { SunIcon, MoonIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md",
        "text-muted-foreground",
        "transition-colors duration-150",
        "hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "active:scale-95",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      {isDark ? (
        <SunIcon className="size-4" aria-hidden />
      ) : (
        <MoonIcon className="size-4" aria-hidden />
      )}
    </button>
  );
}
