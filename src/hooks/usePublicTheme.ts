import { useCallback, useEffect, useState } from "react";

/**
 * Light/dark for the signed-out pages — landing, sign in, sign up, docs,
 * explore.
 *
 * Two things make this its own hook rather than a toggle inside one header.
 *
 * It has to PERSIST between public pages. The first version lived in the
 * landing header and restored the document on unmount, so choosing dark and
 * then tapping Sign in landed you on a light page — the theme lasted exactly
 * as long as the component did.
 *
 * And it has to stay SEPARATE from the app's own theme. That one lives under
 * `darkMode` / `darkTheme` in localStorage and is a saved account preference.
 * A visitor trying the dark landing page is not changing how their app looks,
 * so this writes to its own key and puts the document back the way it found it
 * when they leave for /app.
 */

const KEY = "zc_public_theme";

function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" ? true : value === "light" ? false : null;
  } catch {
    return null;
  }
}

export function usePublicTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = readStored();
    if (stored !== null) return stored;
    // No choice made yet: follow whatever the document already is, so a member
    // arriving from the dark app does not get flashed a light page.
    return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    // Restored on unmount so entering /app returns to the member's own theme.
    return () => {
      root.classList.toggle("dark", had);
    };
  }, [dark]);

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
