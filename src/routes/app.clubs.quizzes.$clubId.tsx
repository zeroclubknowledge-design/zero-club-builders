import { createFileRoute, redirect } from "@tanstack/react-router";

/** Quizzes now open inside the club, as a section. Old links land there. */
export const Route = createFileRoute("/app/clubs/quizzes/$clubId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/clubs/chat", search: { clubId: params.clubId, room: "quizzes" }, replace: true });
  },
});
