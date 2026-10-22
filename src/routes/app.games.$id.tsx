import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old Zero Words race links. Zero Words has left Zero Club, so they open Zero Games. */
export const Route = createFileRoute("/app/games/$id")({
  beforeLoad: () => {
    throw redirect({ to: "/app/games", search: { game: undefined } });
  },
});
