import { useSyncExternalStore } from "react";

/**
 * "Press Enter to send" — one setting for every chat (clubs, direct messages).
 *
 * Saved on this device. Until someone chooses, it is ON for computers (a real
 * keyboard, where Enter-to-send is what people expect) and OFF for phones,
 * where Enter on the on-screen keyboard is usually a new line.
 * Shift+Enter always makes a new line; Ctrl/Cmd+Enter always sends.
 */
const KEY = "zc:enter-to-send";
const EVENT = "zc:chat-prefs";

function deviceDefault() {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}

export function getEnterToSend(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "1") return true;
    if (saved === "0") return false;
  } catch {
    /* storage blocked: fall back to the device default */
  }
  return deviceDefault();
}

export function setEnterToSend(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useEnterToSend(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getEnterToSend, () => false);
  return [value, setEnterToSend];
}

type KeyLike = { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; nativeEvent?: { isComposing?: boolean } };

/** Should this key press send the message? */
export function isSendKey(event: KeyLike, enterToSend: boolean) {
  if (event.key !== "Enter" || event.nativeEvent?.isComposing) return false;
  if (event.ctrlKey || event.metaKey) return true;
  return enterToSend && !event.shiftKey && !event.altKey;
}
