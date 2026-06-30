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

  useEffect(() => {
    if (!isLoading && profile && !hasInitialized.current) {
      // If we navigate here and it's already active/minimized, restore it
      if (liveSession.isActive && liveSession.channelId === classId && liveSession.isMinimized) {
        liveSession.restore();
        hasInitialized.current = true;
      } else if (!liveSession.isActive || liveSession.channelId !== classId) {
        // Start a fresh session
        liveSession.startSession(classId, profile.username || "You", profile.avatar_url || null);
        hasInitialized.current = true;
      }
    }
  }, [classId, profile, isLoading, liveSession]);

  // The actual UI is rendered by <GlobalLiveRoom /> which overlays the entire app.
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
