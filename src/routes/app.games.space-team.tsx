import { SpaceFlight } from "@/features/games/v2/SpaceFlight";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/share";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { type SpaceFlightFrame } from "@/features/games/v2/ZeroSpace";

export const Route = createFileRoute("/app/games/space-team")({
  validateSearch: (search: Record<string, unknown>) => ({
    room: typeof search.room === "string" && /^[a-f0-9]{32}$/i.test(search.room) ? search.room.toLowerCase() : undefined,
  }),
  component: SpaceTeam,
});

type Pilot = SpaceFlightFrame & { id: string; name: string; finished: boolean; reserveSent: boolean; reserveReceived: boolean };
type Room = { code: string; you: string; status: "waiting" | "playing" | "finished"; score: number; pilots: Pilot[] };

async function roomAction(action: string, code?: string, frame?: SpaceFlightFrame, finished = false): Promise<Room> {
  const { data, error } = await supabase.rpc("zero_space_team", {
    p_action: action, p_code: code ?? null, p_score: frame?.score ?? 0,
    p_fuel: frame?.fuel ?? 1, p_x: frame?.x ?? 0.5, p_y: frame?.y ?? 0.5, p_finished: finished,
  });
  if (error) throw error;
  return data as Room;
}

function SpaceTeam() {
  const { data: profile, isLoading: profileLoading } = useUser();
  const { room: invite } = Route.useSearch();
  const [room, setRoom] = useState<Room>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exited, setExited] = useState(false);
  const frame = useRef<SpaceFlightFrame | undefined>(undefined);
  const finished = useRef(false);
  const teammate = useRef<Pilot | null>(null);
  const code = room?.code;
  const status = room?.status;

  const enter = async () => {
    setBusy(true);
    setError("");
    try { setRoom(await roomAction(invite ? "join" : "create", invite)); }
    catch (e) { setError((e as Error).message || "Couldn't open the room."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!code || status === "finished" || exited) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const sync = async () => {
      try {
        const next = await roomAction("sync", code, frame.current, finished.current);
        if (active) {
          teammate.current = next.pilots.find(p => p.id !== next.you) ?? null;
          setRoom(next);
          setError("");
        }
      } catch {
        if (active) setError("Reconnecting to your teammate…");
      } finally {
        if (active) timer = setTimeout(sync, 650);
      }
    };
    void sync();
    return () => { active = false; clearTimeout(timer); };
  }, [code, status, exited]);

  const leave = async () => {
    if (!code) return;
    setBusy(true);
    try {
      await roomAction("sync", code, frame.current, true);
      setExited(true);
    } catch { setError("Couldn't leave the room yet. Try again."); }
    finally { setBusy(false); }
  };

  const sendReserve = async () => {
    if (!code || busy || finished.current) return;
    setBusy(true);
    try {
      setRoom(await roomAction("reserve", code));
      toast.success("Reserve sent to your wingmate");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't send the reserve.");
    } finally { setBusy(false); }
  };

  const me = room?.pilots.find(p => p.id === room.you);
  const partner = room?.pilots.find(p => p.id !== room.you);
  const playing = !exited && status === "playing";
  const done = exited || status === "finished";

  return <main className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#140a21] text-white">
    <header className="relative z-10 flex items-center justify-between bg-[#140a21]/85 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="font-display text-xl font-bold">Zero Space · Co-op</h1>
      {room && !done ? <button onClick={() => void leave()} disabled={busy} className="rounded-full bg-white/10 px-4 py-2 text-sm">Leave</button> : <Link to="/app/games" search={{ game: undefined }} className="rounded-full bg-white/10 px-4 py-2 text-sm">Back</Link>}
    </header>
    {playing ? <><div className="pointer-events-none relative z-10 bg-[#140a21]/85 px-4 pb-3 text-sm">
      <p className="font-bold text-[#ff8ccc]">Team score · {(room?.score ?? 0).toLocaleString()}</p>
      <p className="mt-1 text-white/80">{me?.finished ? "You're out of the run" : "You're flying"} · {partner?.finished ? `${partner.name} is out` : `${partner?.name || "Teammate"} · ${Math.round((partner?.fuel ?? 1) * 100)}% fuel`}</p>
      {me?.finished && !partner?.finished && <p>Your teammate is still adding to the team score.</p>}
      {me && !me.finished && partner && !partner.finished && !me.reserveSent && (
        <button disabled={busy || partner.fuel > 0.65} onClick={() => void sendReserve()} className="pointer-events-auto mt-2 rounded-full bg-[#61dbff]/20 px-3 py-1.5 text-xs font-semibold text-[#a6edff] disabled:opacity-50">
          {partner.fuel > 0.65 ? "Reserve ready · send below 65% fuel" : "Send reserve · +50% fuel"}
        </button>
      )}
      {error && <p role="status">{error}</p>}
    </div>
    <SpaceFlight cooperative teammate={teammate} reserveReceived={me?.reserveReceived} onLeave={leave} onFrame={next => { if (!finished.current) frame.current = next; }} onGameOver={result => {
      if (frame.current) frame.current = { ...frame.current, score: result.score };
      finished.current = true;
    }} />
    </> : <div className="relative m-auto w-full max-w-md px-6 text-center">
      <h2 className="font-display text-3xl font-bold">{done ? (exited ? "You left the room" : "Team run complete") : room ? "Waiting for your wingmate" : "Fly with a friend"}</h2>
      <p className="mt-3 text-white/70">{done ? (exited ? "Your teammate can keep flying." : `${room?.score.toLocaleString()} team points`) : "Share one score. Keep flying as long as either pilot is still active."}</p>
      {status === "finished" && !exited && room && (
        <ul className="mt-5 space-y-2 text-left">
          {room.pilots.map(pilot => <li key={pilot.id} className="flex justify-between gap-3 rounded-xl bg-white/10 px-4 py-3">
            <span>{pilot.name}{pilot.id === room.you ? " (you)" : ""}</span>
            <span className="shrink-0 font-semibold tabular-nums">{pilot.score.toLocaleString()} pts</span>
          </li>)}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-[#ffb8d9]">{error}</p>}
      {!done && (room ? <button onClick={() => void copyToClipboard(`${window.location.origin}/app/games/space-team?room=${room.code}`, "Invite link copied")} className="mt-6 rounded-full bg-[#ff8ccc] px-6 py-3 font-bold text-[#140a21]">Copy invite link</button> : !profile && !profileLoading ? <Link to="/signin" search={{ ref: undefined, club: undefined }} onClick={() => {
        if (invite) try { sessionStorage.setItem("zc-space-team-invite", invite); } catch { /* storage unavailable */ }
      }} className="mt-6 inline-block rounded-full bg-[#ff8ccc] px-6 py-3 font-bold text-[#140a21]">Sign in to play</Link> : <button onClick={() => void enter()} disabled={busy || profileLoading} className="mt-6 rounded-full bg-[#ff8ccc] px-6 py-3 font-bold text-[#140a21]">{busy ? "Connecting…" : invite ? "Join team run" : "Create a room"}</button>)}
    </div>}
  </main>;
}
