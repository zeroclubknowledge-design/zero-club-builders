import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { motionSourceFor, type MotionProfile } from "@/features/profile/avatarMotion";
import { useAnimatedAvatarsPref } from "@/features/profile/avatarMotionApi";

/*
 * A profile picture that can come to life.
 *
 * Always renders the static photo first — it is the poster, the fallback and
 * what assistive tech reads. When the member has a ready animation for this
 * exact photo (and the viewer has not asked for less motion or data), a
 * muted, looping, inline video fades in over it once it is actually playing.
 * Until the picture is on screen nothing is downloaded, and it pauses when it
 * scrolls away. Any playback problem simply leaves the photo showing.
 *
 * Fills its parent, so the parent keeps its own size, shape and border.
 * Use it where the photo is shown large (profile pages, the photo viewer);
 * small avatars across the app stay static on purpose, to save bandwidth.
 */

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(reducedMotionQuery);
      mq.addEventListener?.("change", cb);
      return () => mq.removeEventListener?.("change", cb);
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => true,
  );
}
function saveDataOn() {
  if (typeof navigator === "undefined") return false;
  const c = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return Boolean(c?.saveData) || /(^|-)2g$/.test(String(c?.effectiveType || ""));
}

export function AnimatedProfileImage({
  profile,
  alt,
  className = "h-full w-full object-cover",
  fallback = null,
}: {
  profile: MotionProfile;
  alt: string;
  className?: string;
  /** Shown when there is no photo at all (e.g. initials). */
  fallback?: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const viewerPref = useAnimatedAvatarsPref();
  const motion = motionSourceFor(profile, { reducedMotion, saveData: saveDataOn(), viewerPref });
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setFailed(false);
  }, [motion]);

  // Load only when on screen; pause when it leaves.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !motion) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [motion]);

  const avatar = profile?.avatar_url;
  if (!avatar) return <>{fallback}</>;

  const showVideo = Boolean(motion) && !failed && inView;
  return (
    <span ref={wrapRef} className="relative block h-full w-full">
      <img src={avatar} alt={alt} className={className} loading="lazy" decoding="async" />
      {showVideo && (
        <video
          ref={videoRef}
          src={motion!}
          poster={avatar}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onError={() => setFailed(true)}
          onLoadedData={(e) => {
            void e.currentTarget.play().catch(() => setFailed(true));
          }}
          {...{ "webkit-playsinline": "true", "x5-playsinline": "true" }}
          className={`pointer-events-none absolute inset-0 ${className} transition-opacity duration-500 ${playing ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
