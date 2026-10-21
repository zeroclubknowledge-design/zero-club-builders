import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "@/components/icons/glyphs";
import { useGroupCall } from "@/features/groups/GroupCallContext";

/*
 * Entry point for a group call. The call itself is drawn by <GroupCallHost />
 * at the root, so it keeps running when minimised and you move around the app.
 */
export const Route = createFileRoute("/app/chat/g/$groupId_/call")({
  validateSearch: (search: Record<string, unknown>) => ({ video: search.video === true || search.video === "true" || search.video === 1 }),
  component: GroupCallEntry,
});

function GroupCallEntry() {
  const { groupId } = Route.useParams();
  const { video } = Route.useSearch();
  const { start } = useGroupCall();
  const navigate = useNavigate();
  useEffect(() => {
    /* Opened cold (from a ring or a notification) the call would be the only
       page in the app's history, so the phone's back button closed the app
       and the call with it. Put the group behind it first; back then lands
       there, with the call minimised. */
    if (isFirstPage()) {
      void navigate({ to: "/app/chat/g/$groupId", params: { groupId }, replace: true }).then(() =>
        navigate({ to: "/app/chat/g/$groupId/call", params: { groupId }, search: { video } }),
      );
      return;
    }
    start(groupId, video);
  }, [groupId, video, start]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** True when this is the first page the app has shown in this tab (TanStack keeps the position in history.state). */
function isFirstPage() {
  const index = (window.history.state as Record<string, unknown> | null)?.__TSR_index;
  return typeof index !== "number" || index === 0;
}

