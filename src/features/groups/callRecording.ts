/** Announce first; a failed or cancelled start must never leave a false REC flag. */
export async function startAnnouncedCallRecording({ announce, start, isCurrent }: {
  announce: (on: boolean) => Promise<void>;
  start: () => Promise<boolean>;
  isCurrent: () => boolean;
}) {
  let started = false;
  try {
    await announce(true);
    if (!isCurrent()) return false;
    started = await start();
    return started;
  } finally {
    if (!started) await announce(false).catch(() => {});
  }
}

export function callRecordingError(error: unknown) {
  const detail = error as { code?: string; message?: string };
  if (detail?.code === "PGRST202" || /could not find the function|schema cache/i.test(detail?.message || ""))
    return "Call recording is temporarily unavailable. Please ask Zero Club support to enable the latest call update.";
  return detail?.message || "Could not start recording. Please try again.";
}
