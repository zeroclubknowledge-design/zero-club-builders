/** Date inputs use the creator's local time, never the UTC calendar date. */
export function localBootcampDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localBootcampStart(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${localBootcampDate(value)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function bootcampSchedulePayload(start: string, end: string, originalStart?: string | null) {
  const starts = start ? new Date(start) : null;
  const ends = end ? new Date(`${end}T23:59:59.999`) : null;
  if (starts && !Number.isFinite(starts.getTime())) throw new Error("Choose a valid bootcamp start date and time.");
  if (ends && !Number.isFinite(ends.getTime())) throw new Error("Choose a valid bootcamp end date.");
  if (starts && ends && ends.getTime() < starts.getTime()) throw new Error("The bootcamp end date cannot be before its start date.");
  // Preserve seconds and milliseconds when the creator edits unrelated details.
  const unchanged = !!originalStart && start === localBootcampStart(originalStart);
  return {
    starts_at: starts ? unchanged ? new Date(originalStart!).toISOString() : starts.toISOString() : null,
    ends_at: ends ? ends.toISOString() : null,
  };
}
