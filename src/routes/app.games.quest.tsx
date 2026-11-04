import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/games/quest")({
  beforeLoad: () => { throw redirect({ to: "/app/games", search: { game: undefined } }); },
});
