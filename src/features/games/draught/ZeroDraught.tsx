import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Crown, Flag, Loader2, Trophy, Users } from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { draftKey, usePersistentDraft } from "@/lib/draftStorage";
import { GameAvatar } from "../GameAvatar";
import {
  chooseComputerMove,
  draughtMoves,
  initialDraught,
  moveDraught,
  type DraughtState,
  type Side,
} from "./engine";
import {
  draughtAction,
  draughtError,
  draughtHome,
  draughtPing,
  draughtRoom,
  type DraughtAction,
  type DraughtPlayer,
} from "./api";
import { DraughtBoard } from "./DraughtBoard";

import { CardSelect } from "@/components/CardSelect";
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#ff4fc3] px-5 text-sm font-bold text-[#190c20] disabled:opacity-40";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white disabled:opacity-40";

export function ZeroDraught({
  roomId,
  code,
  mode,
  onNavigate,
  onBack,
}: {
  roomId?: string;
  code?: string;
  mode?: "solo";
  onNavigate: (room?: string, mode?: "solo") => void;
  onBack: () => void;
}) {
  const { data: profile } = useUser();
  const client = useQueryClient();
  const [inviteCode, setInviteCode] = useState(code || "");
  const [difficulty, setDifficulty] = useState(3);
  const [solo, setSolo] = usePersistentDraft<DraughtState>(
    draftKey(profile?.id || "guest", "draught", "solo"),
    initialDraught(),
  );
  const [confirmation, setConfirmation] = useState<"restart" | "resign" | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false),
    requests = useRef(new Map<string, string>());
  const [now, setNow] = useState(Date.now());
  const [connection, setConnection] = useState("Connecting…");
  const home = useQuery({
    queryKey: ["draught-home", profile?.id],
    queryFn: draughtHome,
    enabled: Boolean(profile?.id && !roomId && !mode),
  });
  const detail = useQuery({
    queryKey: ["draught-room", profile?.id, roomId],
    queryFn: () => draughtRoom(roomId!),
    enabled: Boolean(profile?.id && roomId),
    refetchInterval: (query) =>
      query.state.data?.room.status === "finished" || query.state.data?.room.status === "cancelled"
        ? false
        : 3000,
    retry: 1,
  });
  const data = detail.data;
  const delta = useMemo(
    () => (data ? Date.parse(data.server_now) - Date.now() : 0),
    [data?.server_now],
  );
  useEffect(() => {
    if (code) setInviteCode(code);
  }, [code]);
  useEffect(() => {
    setConfirmation(null);
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [roomId, mode]);
  useEffect(() => {
    if (mode !== "solo" || solo.turn !== -1 || solo.winner || solo.draw) return;
    const timer = setTimeout(() => {
      const move = chooseComputerMove(solo, difficulty);
      if (move) setSolo(moveDraught(solo, move.from, move.to));
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, solo, difficulty, setSolo]);
  useEffect(() => {
    if (!roomId || !profile?.id) return;
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (!disposed) {
        clearTimeout(timer);
        timer = setTimeout(
          () => void client.invalidateQueries({ queryKey: ["draught-room", profile.id, roomId] }),
          100,
        );
      }
    };
    const channel = supabase
      .channel(`draught:${roomId}:${profile.id}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "zero_draught_rooms",
          filter: `id=eq.${roomId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (!disposed) {
          setConnection(
            status === "SUBSCRIBED" ? "Match connected" : "Reconnecting · checking for updates",
          );
          if (status === "SUBSCRIBED") refresh();
        }
      });
    const ping = () => {
      if (!document.hidden) {
        void draughtPing(roomId).catch(() => {});
        refresh();
      }
    };
    ping();
    const interval = setInterval(ping, 30_000);
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("online", ping);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("online", ping);
      void supabase.removeChannel(channel);
    };
  }, [roomId, profile?.id, client]);
  const act = async (action: DraughtAction, payload: Record<string, unknown> = {}) => {
    if (locked.current || !profile?.id) return;
    locked.current = true;
    setBusy(true);
    const key = JSON.stringify([profile.id, roomId, action, payload]);
    const request = requests.current.get(key) || crypto.randomUUID();
    requests.current.set(key, request);
    try {
      const result = await draughtAction(roomId, action, payload, request);
      requests.current.delete(key);
      if (action === "create" || action === "join") onNavigate(result.room_id);
      else await detail.refetch();
      void client.invalidateQueries({ queryKey: ["draught-home", profile.id] });
      return result;
    } catch (error) {
      toast.error(draughtError(error));
      if (roomId) void detail.refetch();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const you: DraughtPlayer = {
    id: profile?.id || "guest",
    name: profile?.full_name || profile?.username || "You",
    photo: profile?.avatar_url || null,
  };
  const bot: DraughtPlayer = { id: "zero-draught-computer", name: "Zero Bot", photo: null };
  const isSolo = mode === "solo";
  const mySide: Side = isSolo || data?.room.red_id === profile?.id ? 1 : -1;
  const red = isSolo ? you : data?.players.find((player) => player.id === data.room.red_id) || you;
  const black = isSolo
    ? bot
    : data?.players.find((player) => player.id === data.room.black_id) || {
        id: "waiting-opponent",
        name: "Waiting for your friend",
        photo: null,
      };
  const turn = isSolo ? solo.turn : data?.room.turn || 1;
  const board = isSolo ? solo.board : data?.room.board;
  const ended = isSolo
    ? Boolean(solo.winner || solo.draw)
    : data?.room.status === "finished" || data?.room.status === "cancelled";
  const moves = isSolo ? draughtMoves(solo.board, solo.turn, solo.forced) : data?.moves || [];
  const result = isSolo
    ? solo.draw
      ? "A well-played draw"
      : solo.winner === 1
        ? "You won!"
        : "Zero Bot wins"
    : data?.room.status === "cancelled"
      ? "Match closed"
      : !data?.room.winner
        ? "A well-played draw"
        : data.room.winner === profile?.id
          ? "You won!"
          : "Your opponent wins";
  const move = (from: number, to: number) => {
    if (isSolo) {
      try {
        setSolo(moveDraught(solo, from, to));
      } catch (error) {
        toast.error((error as Error).message);
      }
    } else if (data) void act("move", { from, to, version: data.room.version });
  };
  const clock = (side: Side) => {
    if (!data) return undefined;
    let ms = side === 1 ? data.room.red_ms : data.room.black_ms;
    if (data.room.status === "active" && data.room.turn === side && data.room.moved_at)
      ms -= Math.max(0, now + delta - Date.parse(data.room.moved_at));
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/app/games/draught?code=${data!.room.code}`,
      );
      toast.success("Match invite copied");
    } catch {
      toast.error(`Share this code: ${data?.room.code}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-[#0c0715] text-white"
      style={{ backgroundImage: "radial-gradient(ellipse at top right,#47223e80,transparent 65%)" }}
    >
      <div className="mx-auto w-full max-w-[1050px] px-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+12px)] sm:px-6">
        <header className="mb-5 flex items-center gap-3">
          <button
            onClick={roomId || mode ? () => onNavigate() : onBack}
            aria-label="Back"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#ff9bdd]">
              Zero Games · Strategy
            </p>
            <h1 className="font-display text-xl font-bold">Zero Draught</h1>
          </div>
          <Crown className="h-7 w-7 text-[#ffca75]" />
        </header>
        {!roomId && !mode && (
          <>
            <div className="grid gap-6 py-5 lg:grid-cols-2 lg:gap-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#ff9bdd]">
                  Think ahead. Make your move.
                </p>
                <h2 className="mt-4 font-display text-4xl font-bold leading-tight">
                  A classic game.
                  <br />
                  Your next challenge.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/60">
                  Play a thoughtful game against Zero Bot, or invite a friend for a live match. Your
                  pieces wear your avatar. Your strategy wins the board.
                </p>
                <div className="mt-6 flex items-center gap-4">
                  <GameAvatar id={you.id} name={you.name} photo={you.photo} className="h-16 w-16" />
                  <span className="text-white/40">vs</span>
                  <GameAvatar id={bot.id} name={bot.name} className="h-16 w-16" />
                </div>
              </div>
              <div className="space-y-4">
                <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <h3 className="text-lg font-bold">Single player</h3>
                  <label className="my-3 flex items-center justify-between gap-3 text-sm text-white/60">
                    Computer strength
                    <CardSelect
                      aria-label="Computer strength"
                      value={difficulty}
                      onChange={(e) => setDifficulty(Number(e.target.value))}
                      className="rounded-xl bg-[#2d1b31] p-2 text-white"
                    >
                      <option value={1}>Easy</option>
                      <option value={3}>Balanced</option>
                      <option value={4}>Challenging</option>
                    </CardSelect>
                  </label>
                  <button
                    onClick={() => onNavigate(undefined, "solo")}
                    className={`${primary} w-full`}
                  >
                    {solo.ply || solo.forced !== null ? "Resume solo game" : "Play Zero Bot"}
                  </button>
                </section>
                <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <h3 className="text-lg font-bold">Play with a friend</h3>
                  <p className="my-3 text-sm text-white/55">
                    Private match · 10 minutes per player
                  </p>
                  <button
                    disabled={busy || !profile?.id}
                    onClick={() => void act("create")}
                    className={`${secondary} w-full`}
                  >
                    <Users className="h-4 w-4" />
                    Create match
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act("join", { code: inviteCode });
                    }}
                    className="mt-4 flex gap-2"
                  >
                    <input
                      aria-label="Draught invite code"
                      placeholder="12-character invite code"
                      maxLength={12}
                      value={inviteCode}
                      onChange={(e) =>
                        setInviteCode(e.target.value.replace(/[^a-f0-9]/gi, "").toUpperCase())
                      }
                      className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-mono text-sm"
                    />
                    <button
                      disabled={busy || !profile?.id || inviteCode.length !== 12}
                      className={secondary}
                    >
                      Join
                    </button>
                  </form>
                  {!profile?.id && (
                    <p className="mt-3 text-xs text-white/45">
                      Sign in to save multiplayer matches.
                    </p>
                  )}
                </section>
              </div>
            </div>
            {home.error && (
              <p role="alert" className="my-4 text-sm text-white/60">
                {draughtError(home.error)}
              </p>
            )}
            <section className="my-6">
              <h2 className="mb-3 text-lg font-bold">Your matches</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {home.data?.map((match) => (
                  <button
                    key={match.id}
                    className={`${secondary} justify-between rounded-2xl p-4 text-left`}
                    onClick={() => onNavigate(match.id)}
                  >
                    <span>Match {match.code.slice(0, 6)}</span>
                    <span className="text-xs text-white/50">
                      {match.status === "active"
                        ? "Resume"
                        : match.status === "waiting"
                          ? "Invite a friend"
                          : "View result"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
        {roomId && detail.isPending && (
          <p role="status" className="flex items-center justify-center gap-2 py-20">
            <Loader2 className="h-5 w-5 animate-spin" />
            Opening your match…
          </p>
        )}
        {roomId && detail.error && (
          <div role="alert" className="rounded-2xl bg-white/5 p-5">
            <p>{draughtError(detail.error)}</p>
            <button onClick={() => void detail.refetch()} className={`${secondary} mt-4`}>
              Try again
            </button>
          </div>
        )}
        {board && (isSolo || data) && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,620px)_1fr]">
            <section className="min-w-0">
              <PlayerCard
                player={mySide === 1 ? black : red}
                clock={!isSolo ? clock(-mySide as Side) : undefined}
                active={turn === -mySide && !ended}
              />
              <DraughtBoard
                board={board}
                moves={moves}
                side={mySide}
                players={{ red, black }}
                onMove={move}
                disabled={
                  busy || ended || turn !== mySide || (!isSolo && data?.room.status !== "active")
                }
              />
              <PlayerCard
                player={mySide === 1 ? red : black}
                clock={!isSolo ? clock(mySide) : undefined}
                active={turn === mySide && !ended}
              />
            </section>
            <aside className="min-w-0 space-y-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                {ended ? (
                  <>
                    <Trophy className="mb-3 h-8 w-8 text-[#ffca75]" />
                    <h2 className="text-2xl font-bold">{result}</h2>
                    <p className="mt-2 text-sm text-white/50">
                      {isSolo
                        ? "Every move is a chance to learn."
                        : `Result: ${data?.room.reason?.replace(/_/g, " ") || "complete"}`}
                    </p>
                    <button
                      className={`${primary} mt-4`}
                      onClick={() => (isSolo ? setConfirmation("restart") : onNavigate())}
                    >
                      Play again
                    </button>
                  </>
                ) : data?.room.status === "waiting" ? (
                  <>
                    <h2 className="text-lg font-bold">Invite your opponent</h2>
                    <p className="my-3 break-all font-mono text-xl tracking-widest">
                      {data.room.code}
                    </p>
                    <button onClick={() => void copy()} className={primary}>
                      <Copy className="h-4 w-4" />
                      Copy invite
                    </button>
                    <p className="mt-3 text-xs text-white/45">
                      The match starts when your friend joins. Red moves first.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold">
                      {turn === mySide
                        ? "Your move"
                        : isSolo
                          ? "Zero Bot is thinking…"
                          : "Your opponent’s move"}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-white/60">
                      {turn !== mySide
                        ? "Your opponent is considering their next move."
                        : moves.some((move) => move.capture !== null)
                          ? "A capture is available. You must take a jump."
                          : "Select one of your pieces, then a highlighted destination."}
                      {turn === mySide && (isSolo ? solo.forced : data?.room.forced) != null
                        ? " Keep jumping with the same piece."
                        : ""}
                    </p>
                    {!isSolo && (
                      <p className="mt-3 text-xs text-white/40">
                        {connection}. Your clock keeps running when you leave the screen.
                      </p>
                    )}
                  </>
                )}
                {!ended && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      className={secondary}
                      onClick={() => setConfirmation(isSolo ? "restart" : "resign")}
                      disabled={busy}
                    >
                      <Flag className="h-4 w-4" />
                      {isSolo
                        ? "New game"
                        : data?.room.status === "waiting"
                          ? "Cancel invite"
                          : "Resign"}
                    </button>
                    {!isSolo && data?.room.status === "active" && !data.room.draw_offer && (
                      <button
                        className={secondary}
                        onClick={() => void act("offer_draw")}
                        disabled={busy}
                      >
                        Offer draw
                      </button>
                    )}
                  </div>
                )}
                {confirmation && (
                  <div className="mt-4 rounded-2xl bg-white/5 p-4">
                    <p className="text-sm">
                      {confirmation === "restart"
                        ? "Start a new solo game? This replaces the saved board."
                        : data?.room.status === "waiting"
                          ? "Cancel this invitation?"
                          : "Resign this match? Your opponent wins."}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={busy}
                        className={primary}
                        onClick={async () => {
                          if (confirmation === "restart") setSolo(initialDraught());
                          else await act("resign");
                          setConfirmation(null);
                        }}
                      >
                        Confirm
                      </button>
                      <button className={secondary} onClick={() => setConfirmation(null)}>
                        Keep playing
                      </button>
                    </div>
                  </div>
                )}
                {!ended && data?.room.draw_offer && (
                  <div className="mt-4 rounded-2xl bg-white/5 p-4">
                    <p className="text-sm">
                      {data.room.draw_offer === profile?.id
                        ? "Draw offered. Waiting for your opponent."
                        : "Your opponent offered a draw."}
                    </p>
                    {data.room.draw_offer !== profile?.id && (
                      <div className="mt-3 flex gap-2">
                        <button
                          disabled={busy}
                          className={primary}
                          onClick={() => void act("accept_draw")}
                        >
                          Accept draw
                        </button>
                        <button
                          disabled={busy}
                          className={secondary}
                          onClick={() => void act("decline_draw")}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Rules />
            </aside>
          </div>
        )}
        {!board && <Rules />}
      </div>
    </div>
  );
}
function PlayerCard({
  player,
  clock,
  active,
}: {
  player: DraughtPlayer;
  clock?: string;
  active: boolean;
}) {
  return (
    <div
      className={`my-3 flex min-w-0 items-center gap-3 rounded-2xl border p-3 ${active ? "border-[#ff4fc3]/60 bg-[#ff4fc3]/10" : "border-white/10 bg-white/[0.03]"}`}
    >
      <GameAvatar id={player.id} name={player.name} photo={player.photo} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{player.name}</span>
      {clock && <span className="shrink-0 font-mono text-xl font-bold tabular-nums">{clock}</span>}
    </div>
  );
}
function Rules() {
  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <summary className="cursor-pointer text-sm font-bold">How to play</summary>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/60">
        <li>8×8 draughts with flying kings. Red starts.</li>
        <li>
          Ordinary pieces move diagonally forward and can capture both forwards and backwards.
          Kings move any distance along a clear diagonal.
          To capture, cross one opponent and land on an empty square beyond it. Kings cannot
          cross friendly pieces or two opponents in one jump.
        </li>
        <li>
          Captures are mandatory. Continue a chain with the same piece when another jump is
          available.
        </li>
        <li>Reach the far row to become a king. Crowning ends that turn.</li>
        <li>Win by capturing all pieces or leaving your opponent without a legal move.</li>
        <li>
          Three repeated positions, or 40 full moves without a capture or a man moving, produce a
          draw.
        </li>
      </ul>
    </details>
  );
}
