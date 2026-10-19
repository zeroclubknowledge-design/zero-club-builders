import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ZeroDraught } from "@/features/games/draught/ZeroDraught";
export const Route = createFileRoute("/app/games/draught")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { room?: string; code?: string; mode?: "solo" } => ({
    room:
      typeof search.room === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(search.room)
        ? search.room
        : undefined,
    code:
      typeof search.code === "string" && /^[a-f0-9]{12}$/i.test(search.code)
        ? search.code.toUpperCase()
        : undefined,
    mode: search.mode === "solo" ? "solo" : undefined,
  }),
  component: DraughtPage,
});
function DraughtPage() {
  const { room, code, mode } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <ZeroDraught
      roomId={room}
      code={code}
      mode={mode}
      onNavigate={(room, mode) =>
        void navigate({ to: "/app/games/draught", search: { room, mode, code: undefined } })
      }
      onBack={() => void navigate({ to: "/app/games" })}
    />
  );
}
