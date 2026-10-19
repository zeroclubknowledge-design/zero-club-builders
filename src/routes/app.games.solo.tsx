import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/app/games/solo")({
  validateSearch: (search: Record<string, unknown>) => ({ game: String(search.game || "draught") }),
  beforeLoad: ({ search }) => {
    if (search.game === "words")
      throw redirect({
        to: "/app/games/play/$game",
        params: { game: "words" },
        search: { t: undefined, code: undefined },
      });
    throw redirect({
      to: "/app/games/draught",
      search: { mode: "solo", room: undefined, code: undefined },
    });
  },
});
