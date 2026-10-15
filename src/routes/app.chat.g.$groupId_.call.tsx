import { createFileRoute } from "@tanstack/react-router";
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
  useEffect(() => {
    start(groupId, video);
  }, [groupId, video, start]);
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
