import { createFileRoute } from "@tanstack/react-router";
import { ZeroWordsStudio } from "@/features/games/words/ZeroWordsStudio";

export const Route = createFileRoute("/app/games/words/")({
  component: ZeroWordsStudio,
});
