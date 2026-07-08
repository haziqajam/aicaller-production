"use client";

/**
 * Minimal theme handling (replaces next-themes).
 *
 * next-themes renders an inline <script> from a client component, which React
 * 19.2 warns about ("Encountered a script tag while rendering React component").
 * Instead, the no-flash theme is applied by a SERVER-rendered script in the root
 * layout (THEME_INIT_SCRIPT) before paint, and the live theme is read from the
 * `dark` class on <html> via useSyncExternalStore — the SSR-safe way to read
 * browser-only state without a hydration mismatch or a setState-in-effect.
 */
import * as React from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";

/**
 * Inline script applied (server-side) before paint so the correct theme class
 * is on <html> before React hydrates — prevents a flash. Default: dark.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var dark=t?t==='dark':true;var c=document.documentElement.classList;dark?c.add('dark'):c.remove('dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

// --- External store: the source of truth is the <html> `dark` class ----------
const listeners = new Set<() => void>();

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "dark"; // SSR default; corrected on the client after hydration
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function setThemeGlobal(theme: Theme) {
  const classes = document.documentElement.classList;
  if (theme === "dark") classes.add("dark");
  else classes.remove("dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — class is still applied */
  }
  listeners.forEach((l) => l());
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export function useTheme(): ThemeContextValue {
  const theme = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  return {
    theme,
    setTheme: setThemeGlobal,
    toggleTheme: () => setThemeGlobal(theme === "dark" ? "light" : "dark"),
  };
}

/**
 * Kept for symmetry with the previous next-themes API and to give a single
 * place to mount theme concerns. The store is module-level, so this is just a
 * pass-through today.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
