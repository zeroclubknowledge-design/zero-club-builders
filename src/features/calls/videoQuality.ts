/** A clear camera source, with a modest secondary stream for small tiles. */
export const CALL_CAMERA_CONFIG = {
  encoderConfig: { width: 1280, height: 720, frameRate: 30, bitrateMin: 600, bitrateMax: 1800 },
  optimizationMode: "balanced" as const,
};
export const CALL_LOW_STREAM = { width: 640, height: 360, framerate: 15, bitrate: 400 };

/** Never downgrade a whole group just because the fifth participant joins. */
export function groupVideoStream({
  screen,
  minimized,
  presentation,
  cameraIndex,
  speaking,
}: {
  screen: boolean;
  minimized: boolean;
  presentation: boolean;
  cameraIndex: number;
  speaking: boolean;
}): 0 | 1 {
  if (minimized) return 1;
  if (screen) return 0;
  if (presentation) return 1; // Camera strip is only 170px wide while presenting.
  return speaking || cameraIndex < 4 ? 0 : 1;
}

/** Require sustained network reports; never recover above the person's choice. */
export function cameraQualityStep<T extends string>(
  order: readonly T[],
  current: T,
  preferred: T,
  poorReports: number,
  goodReports: number,
): T | null {
  const index = order.indexOf(current),
    target = order.indexOf(preferred);
  if (index < 0 || target < 0) return null;
  if (poorReports >= 3 && index > 0) return order[index - 1];
  if (goodReports >= 10 && index < target) return order[index + 1];
  return null;
}
