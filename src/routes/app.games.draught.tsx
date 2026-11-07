import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ZeroDraught } from "@/features/games/draught/ZeroDraught";
export const Route = createFileRoute("/app/games/draught")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { room?: string; code?: string; mode?: "solo"; competition?: string } => ({
    competition:
      typeof search.competition === "string" && /^[a-f0-9-]{36}$/i.test(search.competition)
        ? search.competition
        : undefined,
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
  const { room, code, mode, competition } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (!competition) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const sync = async () => {
      try {
        await supabase.rpc("zero_draught_competition", {
          p_action: "sync",
          p_id: competition,
          p_payload: {},
        });
      } finally {
        if (alive) timer = setTimeout(sync, 3000);
      }
    };
    void sync();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [competition]);
  return (
    <ZeroDraught
      onCompetition={
        competition
          ? () =>
              void navigate({ to: "/app/games/draught-competitions", search: { id: competition } })
          : undefined
      }
      roomId={room}
      code={code}
      mode={mode}
      onNavigate={(room, mode) =>
        void navigate({
          to: "/app/games/draught",
          search: { room, mode, code: undefined, competition },
        })
      }
      onBack={() => void navigate({ to: "/app/games" })}
    />
  );
}
