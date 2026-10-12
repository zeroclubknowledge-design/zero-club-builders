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
export type DarkTheme = "lights-out" | "dim" | "rose-noir";

const CACHE_KEY = "zs-theme";
const VARIANTS: DarkTheme[] = ["lights-out", "dim", "rose-noir"];
const THEME_COLOR: Record<DarkTheme, string> = { "lights-out": "#000000", dim: "#202633", "rose-noir": "#0a0409" };

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
  const nextTheme: DarkTheme = VARIANTS.includes(theme as DarkTheme) ? (theme as DarkTheme) : "lights-out";
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
