import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import i18n from "./i18n";
import { safeGet, safeSet } from "./api";

type Theme = "light" | "dark" | "contrast";
type Prefs = {
  theme: Theme; setTheme: (t: Theme) => void;
  size: number; setSize: (n: number) => void;
  lang: string; setLang: (l: string) => void;
};
const Ctx = createContext<Prefs | null>(null);
const ls = typeof localStorage !== "undefined" ? localStorage : undefined;

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeS] = useState<Theme>((safeGet(ls, "is_theme") as Theme) || "light");
  const [size, setSizeS] = useState<number>(Number(safeGet(ls, "is_size")) || 100);
  const [lang, setLangS] = useState<string>(i18n.language || "en");

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.style.setProperty("--root-size", `${16 * size / 100}px`); }, [size]);
  useEffect(() => {
    // Motion switches off automatically on slow devices (C4)
    const cores = (navigator as any).hardwareConcurrency || 4;
    const mem = (navigator as any).deviceMemory || 4;
    if (cores <= 2 || mem <= 1) document.documentElement.classList.add("reduce-motion");
  }, []);

  const value: Prefs = {
    theme, size, lang,
    setTheme: (t) => { setThemeS(t); safeSet(ls, "is_theme", t); },
    setSize: (n) => { setSizeS(n); safeSet(ls, "is_size", String(n)); },
    setLang: (l) => { setLangS(l); i18n.changeLanguage(l); safeSet(ls, "is_lang", l); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("PrefsProvider missing");
  return c;
}

/** Admin pages default to the dark theme in the evening, but only if the user never chose one. */
export function useAdminTheme() {
  const p = usePrefs();
  useEffect(() => {
    if (!safeGet(ls, "is_theme")) {
      const h = new Date().getHours();
      if (h >= 19 || h < 6) document.documentElement.dataset.theme = "dark";
      return () => { document.documentElement.dataset.theme = p.theme; };
    }
  }, []);
}
