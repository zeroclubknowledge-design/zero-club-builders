/*
 * Animated profile pictures — display rules. Dependency-free so it can be
 * tested on its own (scripts/avatar-motion.test.mjs).
 *
 * The hierarchy is fixed: the animation plays only when it is ready, the
 * member has it switched on, and it was made from the photo they have now.
 * In every other case — processing, failed, disabled, old photo — the static
 * photo shows. Viewers who prefer reduced motion or use data saver also get
 * the photo, unless they chose to play animations.
 */

export type MotionProfile =
  | {
      avatar_url?: string | null;
      avatar_motion_url?: string | null;
      avatar_motion_source?: string | null;
      avatar_motion_status?: string | null;
      avatar_motion_enabled?: boolean | null;
    }
  | null
  | undefined;

export type MotionEnv = {
  reducedMotion: boolean;
  saveData: boolean;
  /** The viewer's own choice in Accessibility settings, if they made one. */
  viewerPref: "on" | "off" | null;
};

export const VIEWER_PREF_KEY = "zc:animated-avatars";

export function motionSourceFor(profile: MotionProfile, env: MotionEnv): string | null {
  if (!profile) return null;
  const {
    avatar_url,
    avatar_motion_url,
    avatar_motion_source,
    avatar_motion_status,
    avatar_motion_enabled,
  } = profile;
  if (!avatar_url || !avatar_motion_url) return null;
  if (avatar_motion_enabled === false) return null;
  if (avatar_motion_status !== "ready") return null;
  if (avatar_motion_source !== avatar_url) return null;
  if (env.viewerPref === "off") return null;
  if (env.viewerPref === "on") return avatar_motion_url;
  if (env.reducedMotion || env.saveData) return null;
  return avatar_motion_url;
}

/** Plain-language status for the member's own photo. */
export function motionStatusText(
  status: string | null | undefined,
  reason?: string | null,
): string | null {
  switch (status) {
    case "pending":
    case "processing":
      return "Creating your animated profile…";
    case "ready":
      return "Animated profile ready";
    case "failed":
      return "Your profile picture was updated, but we couldn't create the animation.";
    default:
      if (reason === "unsupported_photo")
        return "This photo can't be animated. Try a clear, front-facing photo (JPG, PNG or WebP).";
      return null;
  }
}
