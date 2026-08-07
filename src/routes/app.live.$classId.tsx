import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useLiveSession } from "@/contexts/LiveSessionContext";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/app/live/$classId")({
  component: LiveClassEntrypoint,
});

/**
 * This route component now acts merely as an entry point.
 * The actual video call UI and Agora connection are handled by `<GlobalLiveRoom />` in `__root.tsx`.
 * This allows the call to persist across route navigations when minimized.
 */
function LiveClassEntrypoint() {
  const { classId } = Route.useParams();
  const { data: profile, isLoading } = useUser();
  const liveSession = useLiveSession();
  const hasInitialized = useRef(false);

  /* Read through a ref so this effect does NOT depend on the live-session
     object. The context hands back a fresh object on every state change, so
     depending on it made this effect re-run whenever anything about the
     session changed — including the moment the user pressed Leave. It would
     then see isActive === false and start the session straight back up, so
     Leave appeared to do nothing until the route had finished unmounting.
     That is why it always took two clicks. */
  const liveSessionRef = useRef(liveSession);
  liveSessionRef.current = liveSession;

  useEffect(() => {
    if (isLoading || !profile || hasInitialized.current) return;

    const session = liveSessionRef.current;

    // Marked as handled in EVERY path. Previously a session that was already
    // running and NOT minimized matched neither branch, so this stayed false
    // and the effect remained armed to restart the call.
    hasInitialized.current = true;

    if (session.isActive && session.channelId === classId) {
      if (session.isMinimized) session.restore();
      return; // already running — leave it alone
    }

    session.startSession(classId, profile.username || "You", profile.avatar_url || null);
  }, [classId, profile, isLoading]);

  // The actual UI is rendered by <GlobalLiveRoom /> which overlays the entire app.
  return (
    <div className="min-h-screen bg-[#0A0A0C] flex flex-col items-center justify-center gap-4">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full w-1/3 rounded-full bg-[#cc208f] animate-progress" />
      </div>
    </div>
  );
}
