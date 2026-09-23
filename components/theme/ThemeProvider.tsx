"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "pinpoint-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggle: () => {},
});

function applyTheme(t: Theme) {
  const c = document.documentElement.classList;
  c.toggle("light", t === "light");
  c.toggle("dark", t === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The inline script in layout.tsx already applied the stored theme; read it back.
  const [theme, setThemeState] = useState<Theme>("dark");

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode / storage disabled: theme still applies for this session */
    }
  }, []);

  useEffect(() => {
    // `?theme=light|dark` in the URL overrides the stored choice (handy for sharing / testing).
    let fromUrl: string | null = null;
    try {
      fromUrl = new URLSearchParams(window.location.search).get("theme");
    } catch {
      /* ignore */
    }
    if (fromUrl === "light" || fromUrl === "dark") {
      setTheme(fromUrl);
      return;
    }
    setThemeState(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, [setTheme]);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
