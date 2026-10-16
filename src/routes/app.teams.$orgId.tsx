import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "@/features/workspace/Workspace";

/* One organization's workspace: /app/teams/<org id>?s=<section>&c=<channel id> */
export const Route = createFileRoute("/app/teams/$orgId")({
  validateSearch: (search: Record<string, unknown>): { s?: string; c?: string } => ({
    s: typeof search.s === "string" ? search.s : undefined,
    c: typeof search.c === "string" ? search.c : undefined,
  }),
  component: TeamWorkspace,
  head: () => ({ meta: [{ title: "Workspace — Zero Club" }] }),
});

function TeamWorkspace() {
  const { orgId } = Route.useParams();
  const { s, c } = Route.useSearch();
  return <WorkspacePage orgId={orgId} section={s} channelId={c} />;
}
