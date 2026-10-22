import { createFileRoute } from "@tanstack/react-router";
import { WordsReview } from "@/features/games/words/WordsRounds";

export const Route = createFileRoute("/app/games/words/review")({
  component: WordsReview,
});
