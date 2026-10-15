/*
 * Timestamps for the Messages list, the way chat apps show them:
 *   today            → 9:31 PM
 *   yesterday        → Yesterday
 *   earlier this week → Monday
 *   this year        → 12 Oct
 *   older            → 12/10/2025
 */
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function chatListTime(value?: string | number | Date | null, now: Date = new Date()): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString([], { weekday: "long" });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { day: "numeric", month: "short" });
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** The full date and time, for a long-press / hover title. */
export function chatFullTime(value?: string | number | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
