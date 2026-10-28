/**
 * ZeroStart wears the theme of the Zero Club account that is signed in.
 *
 * Zero Club writes its appearance to profiles.theme_mode ('on' | 'off' |
 * 'system') and profiles.dark_theme ('lights-out' | 'dim' | 'rose-noir').
 * We apply the same classes Zero Club uses and cache the choice so the next
 * visit paints in the right colours before the profile has loaded
 * (see the pre-paint script in index.html).
 */

export type ThemeMode = "on" | "off" | "system";
export type DarkTheme = "lights-out" | "rose-noir";

const CACHE_KEY = "zs-theme";
const VARIANTS = ["lights-out", "dim", "rose-noir", "premium"];
const THEME_COLOR: Record<DarkTheme, string> = { "lights-out": "#000000", "rose-noir": "#0a0409" };

let current: { mode: ThemeMode; theme: DarkTheme } = { mode: "off", theme: "lights-out" };
let systemQuery: MediaQueryList | null = null;

function paint() {
  const root = document.documentElement;
  root.classList.remove("dark", ...VARIANTS);
  const isDark =
    current.mode === "on" ||
    (current.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) root.classList.add("dark", current.theme);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = isDark ? THEME_COLOR[current.theme] : "#f8f7f5";
}

const onSystemChange = () => paint();

export function applyAccountTheme(mode: unknown, theme: unknown) {
  const nextMode: ThemeMode = mode === "on" || mode === "system" ? mode : "off";
  // Zero Club retired Dim; old account values now use Black in both apps.
  const nextTheme: DarkTheme = theme === "rose-noir" ? "rose-noir" : "lights-out";
  current = { mode: nextMode, theme: nextTheme };

  if (systemQuery) systemQuery.removeEventListener("change", onSystemChange);
  systemQuery = null;
  if (nextMode === "system") {
    systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemQuery.addEventListener("change", onSystemChange);
  }

  paint();
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(current)); } catch { /* storage may be blocked */ }
}

/** Signed out: back to Zero Club's default light look. */
export function resetTheme() {
  applyAccountTheme("off", "lights-out");
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/** Refresh on tab, desktop-window and back/forward-cache returns. */
export function watchAccountTheme(load: () => Promise<{ theme_mode?: unknown; dark_theme?: unknown } | null>) {
  let alive = true;
  let pending = false;
  const refresh = async () => {
    if (!alive || pending || document.visibilityState !== "visible") return;
    pending = true;
    try {
      const settings = await load();
      if (alive && settings) applyAccountTheme(settings.theme_mode, settings.dark_theme);
    } catch { /* Keep the current theme while offline. */ }
    finally { pending = false; }
  };
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  return () => {
    alive = false;
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("pageshow", refresh);
  };
}
