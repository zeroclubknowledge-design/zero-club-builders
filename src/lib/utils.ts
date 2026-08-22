import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getLevelFromXp(xp: number): number {
  let level = 1;
  let xpNeeded = 100;
  let xpAccumulated = 0;
  
  while (xp >= xpAccumulated + xpNeeded) {
    xpAccumulated += xpNeeded;
    level++;
    xpNeeded = level * 100;
  }
  return level;
}

export function getLevelProgress(xp: number): { currentXP: number; maxXP: number; percent: number } {
  let level = 1;
  let xpNeeded = 100;
  let xpAccumulated = 0;
  
  while (xp >= xpAccumulated + xpNeeded) {
    xpAccumulated += xpNeeded;
    level++;
    xpNeeded = level * 100;
  }
  
  const currentLevelXp = xp - xpAccumulated;
  const percent = Math.floor((currentLevelXp / xpNeeded) * 100);
  
  return { currentXP: currentLevelXp, maxXP: xpNeeded, percent };
}

/**
 * Percentages are stored as `numeric` in Postgres, so fractional discounts
 * like 66.67% are perfectly valid. Only the client was throwing the decimals
 * away, by parsing with parseInt.
 *
 * Clamped to `max` and rounded to two decimal places — enough for a third
 * (33.33) or two thirds (66.67), without letting a stray 66.6666666666 reach
 * the database where it would print badly everywhere it is shown.
 */
export function clampPercent(value: unknown, max = 90): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(max, Math.max(0, n)) * 100) / 100;
}

/**
 * Prints a percentage without trailing zeros: 66 -> "66", 66.5 -> "66.5",
 * 66.67 -> "66.67". Number#toLocaleString drops the fraction when it is zero,
 * so a whole-number discount still reads as it always did.
 */
export function formatPercent(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * What to call somebody when the app is not sure who they are.
 *
 * "Builder" was written in a dozen places as the last resort, which meant that
 * a name the app had simply not loaded yet came out looking like a real one —
 * whole rooms of people apparently called Builder. A placeholder that reads
 * like a name is worse than an obvious one: nobody can tell the difference
 * between "we don't know" and "that is their name".
 *
 * The chain below tries every field a name could actually live in, then the
 * handle, and only then admits it does not know. Whitespace-only values count
 * as missing — a full_name of " " used to win over a perfectly good username.
 */
const firstFilled = (...values: unknown[]): string => {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
};

export function displayName(profile: any, fallback = "Zero Club member"): string {
  if (!profile) return fallback;
  return (
    firstFilled(profile.full_name, profile.account_name, profile.name, profile.username) || fallback
  );
}

/** The @handle, when there is one. Never invented. */
export function profileHandle(profile: any): string {
  const username = firstFilled(profile?.username);
  return username ? `@${username}` : "";
}

export function getFirstName(profile: any): string {
  if (!profile) return "there";
  const full = firstFilled(profile.full_name, profile.account_name, profile.name);
  if (full) {
    const names = full.split(/\s+/);
    if (names.length > 1) return `${names[0]}...`;
    return names[0];
  }
  return firstFilled(profile.username) || "there";
}