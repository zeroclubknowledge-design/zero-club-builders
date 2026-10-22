import { createFileRoute } from "@tanstack/react-router";
import { WordsPackRound } from "@/features/games/words/WordsRounds";

export const Route = createFileRoute("/app/games/words/pack/$packId")({
  component: PackPage,
});

function PackPage() {
  const { packId } = Route.useParams();
  return <WordsPackRound key={packId} packId={packId} />;
}
