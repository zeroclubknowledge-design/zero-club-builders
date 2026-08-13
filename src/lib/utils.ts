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

export function getFirstName(profile: any): string {
  if (!profile) return "User";
  if (profile.full_name) {
    const names = profile.full_name.trim().split(/\s+/);
    if (names.length > 1) return `${names[0]}...`;
    return names[0];
  }
  return profile.username || "User";
}