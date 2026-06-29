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

export function getFirstName(profile: any): string {
  if (!profile) return "User";
  if (profile.full_name) {
    const names = profile.full_name.trim().split(/\s+/);
    if (names.length > 1) return `${names[0]}...`;
    return names[0];
  }
  return profile.username || "User";
}