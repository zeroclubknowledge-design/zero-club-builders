import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useLiveSession } from "@/contexts/LiveSessionContext";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/live/$classId")({
  /*
   * A meeting link is the most-pasted link in the app, and it had no preview
   * of its own — so it fell through to the site-wide card and every invitation
   * arrived announced as "Zero Club, a private club for builders" with no clue
   * which class it was for.
   *
   * classId is the club, so the invitation can say whose room it is. Failing
   * softly matters here: a preview is never worth blocking the page on, and a
   * crawler that gets nothing still gets the site default.
   */
  loader: async ({ params: { classId } }) => {
    try {
      const { data } = await supabase.rpc("get_club_public", { club_id: classId });
      const club = data as any;
      return club?.found ? { name: String(club.name || ""), banner: club.banner_url || club.logo_url || null } : null;
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData?.name) return {};

    const title = `${loaderData.name} is live on Zero Club`;
    const description = "Join the room to watch, ask questions and take part.";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(loaderData.banner
          ? [
              { property: "og:image", content: String(loaderData.banner) },
              { name: "twitter:image", content: String(loaderData.banner) },
            ]
          : []),
      ],
    };
  },
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
