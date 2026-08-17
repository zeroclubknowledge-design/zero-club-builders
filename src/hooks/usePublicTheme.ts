import { useCallback, useEffect, useState } from "react";

/**
 * Light/dark for the signed-out pages — landing, sign in, sign up, docs,
 * explore.
 *
 * The choice is applied BEFORE first paint by the inline script in
 * __root.tsx, which reads the same key. That matters for two reasons:
 *
 *   • Applying it from an effect meant the page painted with the member's app
 *     theme and then visibly flipped to the public one.
 *   • That flip was a mutation of <html> during hydration, which can make
 *     React abandon hydration and re-render the whole tree — seen as the page
 *     opening and then going blank.
 *
 * So this hook does not touch the DOM on mount. It only reads what the script
 * already decided, and writes when somebody actually presses the switch.
 *
 * The key is deliberately separate from the app's `darkMode`: a visitor trying
 * the dark landing page is not changing how a member's app looks.
 */

const KEY = "zc_public_theme";
const LIGHT_THEME_COLOR = "#f4f2ef";
const DARK_THEME_COLOR = "#100e13";

function updateBrowserThemeColor(dark: boolean) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}

/** Kept in step with the allowlist in the __root.tsx inline script. */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/docs" ||
    pathname === "/signin" ||
    pathname === "/signup" ||
    pathname.startsWith("/explore/")
  );
}

function applyAppTheme() {
  try {
    const root = document.documentElement;
    root.classList.remove("dark", "dim", "lights-out", "premium");
    const mode = localStorage.getItem("darkMode") || "off";
    const theme = localStorage.getItem("darkTheme") || "lights-out";
    if (mode === "premium") return;
    const isDark =
      mode === "on" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      root.classList.add("dark");
      root.classList.add(theme);
    }
    updateBrowserThemeColor(isDark);
  } catch {
    /* nothing sensible to do */
  }
}

export function usePublicTheme() {
  // The server cannot read localStorage, so both the server and the browser's
  // hydration render begin from the same value. After hydration we only sync
  // the switch state from the class the pre-paint script already applied; the
  // page theme itself never needs to flip.
  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const initialDark = document.documentElement.classList.contains("dark");
    setDark(initialDark);
    setThemeReady(true);
    updateBrowserThemeColor(initialDark);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    const root = document.documentElement;
    if (root.classList.contains("dark") !== dark) {
      root.classList.toggle("dark", dark);
    }
    updateBrowserThemeColor(dark);
  }, [dark, themeReady]);

  // Leaving the public pages hands the document back to the member's own
  // theme, deterministically, rather than to whatever it happened to be.
  useEffect(() => {
    return () => {
      if (!isPublicPath(window.location.pathname)) applyAppTheme();
    };
  }, []);

  const toggle = useCallback(() => {
    setDark((value) => {
      const next = !value;
      try {
        localStorage.setItem(KEY, next ? "dark" : "light");
      } catch {
        /* storage unavailable — it just will not persist */
      }
      return next;
    });
  }, []);

  return { dark, toggle };
}
