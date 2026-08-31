import { useCallback, useEffect, useRef, useState } from "react";

/**
 * State that survives the page being reloaded underneath the user.
 *
 * This exists because of a specific, repeatable failure. On a phone, switching
 * apps — to the mail app for a sign-in code, or to the product being tested —
 * routinely gets the browser tab evicted from memory. Coming back reloads the
 * page from scratch. Anything held only in React state is gone, and the person
 * is returned to the beginning of whatever they were doing.
 *
 * Both places that hurt are places we *tell* people to leave the tab: "check
 * your email for the code", and "open the product". Asking someone to leave
 * and then discarding their work when they return is our bug, not theirs.
 *
 * Stored values expire. A half-finished sign-in resumed a week later would
 * restore a code screen whose code died an hour after it was sent, which is
 * worse than starting over because it looks like it should work.
 */

const SIX_HOURS = 6 * 60 * 60 * 1000;

interface Envelope<T> { v: T; at: number }

/* localStorage throws in Safari private browsing and when a quota is full.
   Failing to remember something is a small loss; crashing the sign-in screen
   over it is not acceptable, so every access is guarded. */
export function readSticky<T>(key: string, ttlMs: number = SIX_HOURS): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || typeof parsed.at !== "number") return undefined;
    if (Date.now() - parsed.at > ttlMs) {
      localStorage.removeItem(key);
      return undefined;
    }
    return parsed.v;
  } catch {
    return undefined;
  }
}

export function writeSticky<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: value, at: Date.now() } satisfies Envelope<T>));
  } catch {
    /* Out of quota or storage disabled. Nothing useful to do. */
  }
}

export function useStickyState<T>(
  key: string,
  initial: T,
  ttlMs: number = SIX_HOURS
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  // Read once, during the first render, so the restored value is on screen
  // immediately rather than flashing the empty version first.
  const [value, setValue] = useState<T>(() => readSticky<T>(key, ttlMs) ?? initial);

  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    writeSticky(keyRef.current, value);
  }, [value]);

  const clear = useCallback(() => {
    try { localStorage.removeItem(keyRef.current); } catch { /* see above */ }
  }, []);

  return [value, setValue, clear];
}

/** Forget a stored value without having to mount the hook for it. */
export function clearSticky(key: string) {
  try { localStorage.removeItem(key); } catch { /* see above */ }
}
