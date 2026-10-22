import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

const PREFIX = "zc:unfinished:v1:";

export function draftKey(userId: string | undefined | null, ...context: string[]) {
  return userId ? PREFIX + [userId, ...context].map(encodeURIComponent).join(":") : null;
}

export function readDraft<T>(key: string | null, fallback: T): T {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const saved = JSON.parse(raw);
    return saved && Object.prototype.hasOwnProperty.call(saved, "value") ? saved.value as T : fallback;
  } catch { return fallback; }
}

export function storedDraftOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const session = JSON.parse(localStorage.getItem(key) || "null");
      const id = session?.user?.id || session?.currentSession?.user?.id;
      if (typeof id === "string") return id;
    }
  } catch { /* No readable session. */ }
  return null;
}

export function writeDraft<T>(key: string | null, value: T) {
  if (!key || typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify({ value, updatedAt: Date.now() })); }
  catch { /* Storage may be unavailable; typing must still work. */ }
}

export function removeDraft(key: string | null) {
  if (!key || typeof window === "undefined") return;
  try { localStorage.removeItem(key); } catch { /* Storage unavailable. */ }
}

export function clearDraftGroup(key: string | null) {
  if (!key || typeof window === "undefined") return;
  try {
    Object.keys(localStorage).filter(k => k === key || k.startsWith(key + ":")).forEach(k => localStorage.removeItem(k));
  } catch { /* Storage unavailable. */ }
}

/** Write at the keystroke, rather than waiting for unload (Android can kill
 * the process without firing it). Each account and conversation has its own key. */
export function usePersistentDraft<T>(key: string | null, initial: T) {
  const initialRef = useRef(initial);
  const [stored, setStored] = useState(() => ({ key, value: readDraft(key, initial) }));
  const current = useRef(stored);
  if (current.current.key !== key) {
    const fallback = current.current.key === null && key ? current.current.value : initialRef.current;
    current.current = { key, value: readDraft(key, fallback) };
  }
  const value = current.current.value;

  useEffect(() => {
    if (stored.key !== key) {
      if (stored.key === null && key && JSON.stringify(current.current.value) !== JSON.stringify(initialRef.current)) writeDraft(key, current.current.value);
      setStored(current.current);
    }
  }, [key, stored.key]);

  const setValue = useCallback((update: SetStateAction<T>) => {
    const previous = current.current.key === key ? current.current.value : readDraft(key, initialRef.current);
    const next = typeof update === "function" ? (update as (value: T) => T)(previous) : update;
    current.current = { key, value: next };
    // Empty values remove completed drafts instead of resurrecting them later.
    if (JSON.stringify(next) === JSON.stringify(initialRef.current)) removeDraft(key);
    else writeDraft(key, next);
    setStored(current.current);
  }, [key]);

  const clear = useCallback(() => {
    removeDraft(key);
    current.current = { key, value: initialRef.current };
    setStored(current.current);
  }, [key]);

  return [value, setValue, clear] as const;
}
