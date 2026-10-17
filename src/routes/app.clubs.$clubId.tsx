import { createFileRoute } from "@tanstack/react-router";
import { CommunityHubPage } from "@/features/community/CommunityHub";

/* A club's home: /app/clubs/<club id>?s=<section>. Cohort chat rooms stay at /app/clubs/chat?clubId=<cohort id>. */
export const Route = createFileRoute("/app/clubs/$clubId")({
  validateSearch: (search: Record<string, unknown>): { s?: string } => ({
    s: typeof search.s === "string" ? search.s : undefined,
  }),
  component: ClubHome,
  head: () => ({ meta: [{ title: "Club — Zero Club" }] }),
});

function ClubHome() {
  const { clubId } = Route.useParams();
  const { s } = Route.useSearch();
  return <CommunityHubPage clubId={clubId} section={s} />;
}
