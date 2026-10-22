import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/app/games/solo")({
  validateSearch: (search: Record<string, unknown>) => ({ game: String(search.game || "draught") }),
  beforeLoad: () => {
    throw redirect({
      to: "/app/games/draught",
      search: { mode: "solo", room: undefined, code: undefined },
    });
  },
});
