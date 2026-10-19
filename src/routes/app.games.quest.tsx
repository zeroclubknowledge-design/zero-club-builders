import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ZeroQuest } from "@/features/games/quest/ZeroQuest";

export const Route = createFileRoute("/app/games/quest")({
  validateSearch: (search: Record<string, unknown>): { room?: string; code?: string } => ({
    room:
      typeof search.room === "string" && /^[a-f0-9-]{36}$/i.test(search.room)
        ? search.room
        : undefined,
    code:
      typeof search.code === "string" && /^[a-f0-9]{12}$/i.test(search.code)
        ? search.code.toUpperCase()
        : undefined,
  }),
  component: QuestPage,
});

function QuestPage() {
  const { room, code } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <ZeroQuest
      roomId={room}
      inviteCode={code}
      onRoom={(id) =>
        void navigate({ to: "/app/games/quest", search: { room: id, code: undefined } })
      }
      onBack={() => void navigate({ to: "/app/games" })}
    />
  );
}
