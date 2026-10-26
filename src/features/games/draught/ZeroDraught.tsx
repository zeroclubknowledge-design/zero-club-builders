import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Coins, Copy, Crown, Eye, Flag, Loader2, Play, Share2, Trophy, Users } from "@/components/icons/glyphs";
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
  draughtInvite,
  draughtPing,
  draughtRoom,
  type DraughtAction,
  type DraughtPlayer,
} from "./api";
import { DraughtBoard } from "./DraughtBoard";
import { StakePicker } from "./StakePicker";
import { LiveMatches } from "./LiveMatches";
import { MatchComments } from "./MatchComments";

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#fd69be,#c3217e)] px-5 text-sm font-bold text-white shadow-[0_14px_32px_-14px_rgba(253,73,176,0.9)] transition active:scale-[0.98] disabled:opacity-40";
const gold =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(145deg,#ffe7a3,#ffca75_45%,#d99a2b)] px-5 text-sm font-bold text-[#3a2006] shadow-[0_14px_32px_-14px_rgba(255,202,117,0.9)] transition active:scale-[0.98] disabled:opacity-40";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/[0.07] px-4 text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/[0.12] active:scale-[0.98] disabled:opacity-40";
const danger =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-500 px-5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40";
const PAGE_CSS = `
@keyframes zd-floaty { 0%,100% { transform: translateY(-5px); } 50% { transform: translateY(5px); } }
@keyframes zd-rise-in { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
.zd-float { animation: zd-floaty 5s ease-in-out infinite; }
.zd-rise { animation: zd-rise-in .35s cubic-bezier(.2,.8,.2,1) both; }
`;

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
  const [stake, setStake] = useState(0);
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
  const invite = useQuery({
    queryKey: ["draught-invite", inviteCode],
    queryFn: () => draughtInvite(inviteCode),
    enabled: Boolean(profile?.id && !roomId && !mode && inviteCode.length === 12),
    retry: false,
  });
  const inviteStake = invite.data?.open ? invite.data.stake : 0;
  /* Opened a match link after the match filled up: go straight in to watch
     (or back to your own seat if you're one of the players). */
  const opened = useRef(false);
  useEffect(() => {
    const info = invite.data;
    if (!code || opened.current || !info?.room_id || info.open) return;
    if (info.player || info.watchable) {
      opened.current = true;
      if (!info.player) toast.message("This match is already being played. You're watching live.");
      onNavigate(info.room_id);
    }
  }, [code, invite.data, onNavigate]);
  const spectator = data?.viewer === "spectator";
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
      if (action === "create" || action === "join") {
        onNavigate(result.room_id);
        void client.invalidateQueries({ queryKey: ["draught-stake-info"] });
      }
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
  const mySide: Side = isSolo || spectator || data?.room.red_id === profile?.id ? 1 : -1;
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
          : spectator
            ? `${data.players.find((player) => player.id === data.room.winner)?.name || "A player"} wins`
            : "Your opponent wins";
  const roomStake = data?.room.stake || 0;
  const stakeLine =
    !isSolo && roomStake > 0 && data
      ? data.room.status === "cancelled" || (data.room.status === "finished" && !data.room.winner)
        ? `Stakes returned · ${roomStake} ZP each`
        : data.room.status === "finished"
          ? spectator
            ? `Took the ${(roomStake * 2).toLocaleString()} ZP pot`
            : data.room.winner === profile?.id
              ? `You won ${(roomStake * 2).toLocaleString()} ZP`
              : `You lost your ${roomStake} ZP stake`
          : `${((data.pot ?? roomStake) || roomStake).toLocaleString()} ZP on the line · winner takes all`
      : null;
  /* The host is on the waiting screen when their friend joins: say so at once,
     with a short chime and a buzz, instead of leaving them to notice the board change. */
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = data?.room.status || null;
    const before = lastStatus.current;
    lastStatus.current = status;
    if (before !== "waiting" || status !== "active" || spectator || data?.room.red_id !== profile?.id) return;
    const friend = data?.players.find((p) => p.id === data.room.black_id)?.name || "Your friend";
    toast.success(`${friend.split(" ")[0]} joined. You play red, so it's your move!`);
    try { navigator.vibrate?.([60, 40, 60]); } catch { /* not supported */ }
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      [660, 880].forEach((hz, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.14);
        osc.stop(ctx.currentTime + i * 0.14 + 0.24);
      });
      window.setTimeout(() => void ctx.close(), 800);
    } catch { /* sound unavailable */ }
  }, [data?.room.status, data?.room.black_id, data?.room.red_id, data?.players, spectator, profile?.id]);

  const shareWatch = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/app/games/draught?room=${roomId}`);
      toast.success("Watch link copied. Anyone on Zero Club can follow the match and comment.");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };
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

  /* ── derived for the premium layout ── */
  const opponent = mySide === 1 ? black : red;
  const meSide = mySide === 1 ? red : black;
  const piecesLeft = (s: Side) => (board ? board.filter((p) => Math.sign(p) === s).length : 12);
  const capturedBy = (s: Side) => 12 - piecesLeft((-s) as Side);
  const myTurn = !ended && turn === mySide && (isSolo || data?.room.status === "active");
  const won = isSolo ? solo.winner === 1 : data?.room.winner === profile?.id;
  const drawn = isSolo ? solo.draw : data?.room.status === "finished" && !data?.room.winner;
  const statusTitle = ended
    ? result
    : data?.room.status === "waiting"
      ? "Waiting for your friend"
      : spectator
        ? `${(turn === 1 ? red : black).name.split(" ")[0]} to move`
        : myTurn
          ? "Your move"
          : isSolo
            ? "Zero Bot is thinking…"
            : `${opponent.name.split(" ")[0]} is thinking…`;
  const statusHint = ended
    ? isSolo
      ? "Every game sharpens the next one."
      : `Result: ${data?.room.reason?.replace(/_/g, " ") || "complete"}`
    : data?.room.status === "waiting"
      ? "Share the code below. The match starts the moment they join. Red moves first."
      : spectator
        ? "You're watching live. Moves appear as they're played."
        : !myTurn
          ? "Plan your reply while you wait."
          : moves.some((m) => m.capture !== null)
            ? (isSolo ? solo.forced : data?.room.forced) != null
              ? "Keep jumping with the same piece."
              : "A capture is available. You must take it."
            : "Tap a glowing piece, then a highlighted square.";

  const DIFFS = [
    { v: 1, label: "Easy", note: "Relaxed" },
    { v: 3, label: "Balanced", note: "A fair fight" },
    { v: 4, label: "Challenging", note: "Thinks ahead" },
  ];

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#09050d] text-white">
      <style>{PAGE_CSS}</style>
      {/* Ambient glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#c3217e]/[0.18] blur-[130px]" />
        <div className="absolute -right-48 top-1/3 h-[520px] w-[520px] rounded-full bg-[#ffca75]/[0.08] blur-[130px]" />
        <div className="absolute bottom-[-200px] left-1/4 h-[460px] w-[460px] rounded-full bg-[#6a4cff]/[0.10] blur-[130px]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1240px] px-2 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+10px)] sm:px-6">
        {/* Glass header */}
        <header className="sticky top-[calc(env(safe-area-inset-top)+8px)] z-20 mb-5 flex items-center gap-3 rounded-[22px] bg-[#140a18]/70 px-2.5 py-2 ring-1 ring-white/[0.07] backdrop-blur-xl">
          <button
            onClick={roomId || mode ? () => onNavigate() : onBack}
            aria-label="Back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.07] transition hover:bg-white/[0.12]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] text-[#3a2006] shadow-[0_8px_20px_-8px_rgba(255,202,117,0.8)]" style={{ background: "linear-gradient(145deg,#ffe7a3,#ffca75 50%,#d99a2b)" }}>
            <Crown className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[17px] font-bold leading-tight tracking-tight">Zero Draught</h1>
            <p className="truncate text-[11.5px] text-white/50">
              {isSolo ? `Versus Zero Bot · ${DIFFS.find((d) => d.v === difficulty)?.label || "Balanced"}` : roomId ? (spectator ? "Watching live" : data?.room.status === "waiting" ? "Friend match · waiting" : "Friend match · live") : "Strategy · Zero Games"}
            </p>
          </div>
          {!isSolo && roomId && data?.room.status === "active" && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-300/20">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live
            </span>
          )}
        </header>

        {/* ───────────── Lobby ───────────── */}
        {!roomId && !mode && (
          <>
            <section className="grid items-center gap-8 pb-4 pt-2 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
              <div className="order-2 lg:order-1">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffca75] ring-1 ring-white/10">
                  <Crown className="h-3.5 w-3.5" /> Think ahead. Make your move.
                </p>
                <h2 className="mt-4 font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[52px]">
                  The classic,
                  <br />
                  <span className="bg-gradient-to-r from-[#fd85ca] via-[#ffca75] to-[#fd85ca] bg-clip-text text-transparent">beautifully played.</span>
                </h2>
                <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-white/60">
                  Your pieces wear your face. Outthink Zero Bot, or challenge a friend to a live match others can watch and cheer on.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="inline-flex rounded-full p-[2px]" style={{ background: "linear-gradient(135deg,#fd89cc,#9e1965)" }}>
                    <GameAvatar id={you.id} name={you.name} photo={you.photo} className="h-14 w-14 ring-2 ring-[#09050d]" />
                  </span>
                  <span className="font-display text-[13px] font-bold uppercase tracking-[0.2em] text-white/35">vs</span>
                  <span className="inline-flex rounded-full p-[2px]" style={{ background: "linear-gradient(135deg,#8b7aa8,#1c1426)" }}>
                    <GameAvatar id={bot.id} name={bot.name} className="h-14 w-14 ring-2 ring-[#09050d]" />
                  </span>
                </div>
              </div>
              {/* Tilted board preview */}
              <div className="order-1 mx-auto w-full max-w-[400px] lg:order-2" style={{ perspective: "1200px" }}>
                <div className="zd-float pointer-events-none" style={{ transform: "rotateX(22deg) rotateZ(-6deg)" }}>
                  <DraughtBoard board={initialDraught().board} moves={[]} side={1} players={{ red: you, black: bot }} disabled onMove={() => {}} />
                </div>
              </div>
            </section>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {/* Zero Bot */}
              <section className="relative overflow-hidden rounded-[28px] p-[1px]" style={{ background: "linear-gradient(150deg,rgba(253,73,176,0.5),rgba(255,255,255,0.06) 45%,rgba(255,255,255,0.03))" }}>
                <div className="relative h-full rounded-[27px] bg-[#130a17] p-5 sm:p-6">
                  <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#fd49b0]/20 blur-3xl" />
                  <div className="relative flex items-center gap-3">
                    <GameAvatar id={bot.id} name={bot.name} className="h-12 w-12" />
                    <div>
                      <h3 className="font-display text-[19px] font-bold tracking-tight">Play Zero Bot</h3>
                      <p className="text-[12.5px] text-white/50">Practise anytime · your game is saved</p>
                    </div>
                  </div>
                  <p className="relative mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Strength</p>
                  <div className="relative mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Computer strength">
                    {DIFFS.map((d) => (
                      <button
                        key={d.v}
                        type="button"
                        role="radio"
                        aria-checked={difficulty === d.v}
                        onClick={() => setDifficulty(d.v)}
                        className={`rounded-2xl px-2 py-2.5 text-left transition active:scale-[0.97] ${difficulty === d.v ? "bg-white text-[#140a1c] shadow-[0_10px_24px_-12px_rgba(255,255,255,0.6)]" : "bg-white/[0.05] text-white ring-1 ring-white/10 hover:bg-white/[0.08]"}`}
                      >
                        <span className="block text-[13px] font-bold">{d.label}</span>
                        <span className={`block text-[11px] ${difficulty === d.v ? "text-[#140a1c]/60" : "text-white/45"}`}>{d.note}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => onNavigate(undefined, "solo")} className={`${primary} relative mt-5 w-full`}>
                    <Play className="h-4 w-4 fill-current" />
                    {solo.ply || solo.forced !== null ? "Resume your game" : "Start playing"}
                  </button>
                </div>
              </section>

              {/* Friend */}
              <section className="relative overflow-hidden rounded-[28px] p-[1px]" style={{ background: "linear-gradient(150deg,rgba(255,202,117,0.45),rgba(255,255,255,0.06) 45%,rgba(255,255,255,0.03))" }}>
                <div className="relative h-full rounded-[27px] bg-[#130a17] p-5 sm:p-6">
                  <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#ffca75]/15 blur-3xl" />
                  <div className="relative flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[#ffca75]/15 text-[#ffca75] ring-1 ring-[#ffca75]/30"><Users className="h-5 w-5" /></span>
                    <div>
                      <h3 className="font-display text-[19px] font-bold tracking-tight">Challenge a friend</h3>
                      <p className="text-[12.5px] text-white/50">Live · 10 min each · others can watch</p>
                    </div>
                  </div>
                  <div className="relative"><StakePicker value={stake} onChange={setStake} /></div>
                  <button
                    disabled={busy || !profile?.id}
                    onClick={() => void act("create", stake > 0 ? { stake } : {})}
                    className={`${stake > 0 ? gold : secondary} relative mt-4 w-full`}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : stake > 0 ? <Coins className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    {stake > 0 ? `Create match · stake ${stake} ZP` : "Create a match"}
                  </button>
                  <div className="relative my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">
                    <span className="h-px flex-1 bg-white/10" /> or join with a code <span className="h-px flex-1 bg-white/10" />
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act("join", inviteStake > 0 ? { code: inviteCode, accept_stake: inviteStake } : { code: inviteCode });
                    }}
                    className="relative flex gap-2"
                  >
                    <input
                      aria-label="Draught invite code"
                      placeholder="12-character code"
                      maxLength={12}
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.replace(/[^a-f0-9]/gi, "").toUpperCase())}
                      className="min-h-11 min-w-0 flex-1 rounded-full bg-white/[0.06] px-4 font-mono text-[14px] tracking-[0.18em] text-white outline-none ring-1 ring-white/10 placeholder:tracking-normal placeholder:text-white/30 focus:ring-[#ffca75]/50"
                    />
                    <button disabled={busy || !profile?.id || inviteCode.length !== 12} className={inviteStake > 0 ? gold : secondary}>
                      {inviteStake > 0 ? `Accept ${inviteStake} ZP` : "Join"}
                    </button>
                  </form>
                  {invite.data && inviteCode.length === 12 && (
                    <div className="relative mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
                      <GameAvatar id={invite.data.host.id} name={invite.data.host.name} photo={invite.data.host.photo} className="h-9 w-9" />
                      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-white/70">
                        {!invite.data.open ? (
                          invite.data.watchable && invite.data.room_id ? (
                            <>
                              This match is already being played.{" "}
                              <button type="button" onClick={() => onNavigate(invite.data!.room_id)} className="font-semibold text-[#ffca75] underline-offset-4 hover:underline">
                                Watch it live
                              </button>
                            </>
                          ) : (
                            "This match is full or has ended."
                          )
                        ) : invite.data.stake > 0 ? (
                          <>
                            <b className="text-white">{invite.data.host.name}</b> staked <b className="text-[#ffca75]">{invite.data.stake} ZP</b>. Joining holds the same from your ZP. Winner takes {(invite.data.stake * 2).toLocaleString()} ZP.
                          </>
                        ) : (
                          <>
                            <b className="text-white">{invite.data.host.name}</b> invited you to a friendly match.
                          </>
                        )}
                      </p>
                    </div>
                  )}
                  {!profile?.id && <p className="relative mt-3 text-xs text-white/45">Sign in to play friends and save matches.</p>}
                </div>
              </section>
            </div>

            {home.error && (
              <p role="alert" className="my-4 text-sm text-white/60">{draughtError(home.error)}</p>
            )}

            <LiveMatches onWatch={(room) => onNavigate(room)} />

            {Boolean(home.data?.length) && (
              <section className="my-8">
                <h2 className="mb-3 font-display text-lg font-bold">Your matches</h2>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {home.data!.map((match) => {
                    const live = match.status === "active";
                    const waiting = match.status === "waiting";
                    const mine = match.winner === profile?.id;
                    return (
                      <button
                        key={match.id}
                        className="group flex items-center gap-3 rounded-2xl bg-white/[0.04] p-4 text-left ring-1 ring-white/[0.08] transition hover:bg-white/[0.07] hover:ring-white/[0.14] active:scale-[0.99]"
                        onClick={() => onNavigate(match.id)}
                      >
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${live ? "bg-emerald-400/15 text-emerald-300" : waiting ? "bg-[#ffca75]/15 text-[#ffca75]" : mine ? "bg-[#fd49b0]/15 text-[#fd85ca]" : "bg-white/[0.06] text-white/50"}`}>
                          {live ? <Play className="h-4 w-4 fill-current" /> : waiting ? <Users className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">Match {match.code.slice(0, 6)}</span>
                          <span className="block text-[12px] text-white/45">
                            {live ? "In progress · tap to resume" : waiting ? "Waiting for your friend" : match.status === "cancelled" ? "Closed" : !match.winner ? "Draw" : mine ? "You won" : "You lost"}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition group-hover:translate-x-0.5" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            <Rules />
          </>
        )}

        {roomId && detail.isPending && (
          <p role="status" className="flex items-center justify-center gap-2 py-24 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" /> Setting up the board…
          </p>
        )}
        {roomId && detail.error && (
          <div role="alert" className="mx-auto max-w-[460px] rounded-[24px] bg-white/[0.04] p-6 text-center ring-1 ring-white/10">
            <p className="text-white/80">{draughtError(detail.error)}</p>
            <button onClick={() => void detail.refetch()} className={`${secondary} mt-4`}>Try again</button>
          </div>
        )}

        {/* ───────────── Match ───────────── */}
        {board && (isSolo || data) && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,760px)_minmax(320px,1fr)] lg:gap-7">
            <section className="min-w-0">
              {(spectator || stakeLine) && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {spectator && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5 text-[12px] font-semibold ring-1 ring-white/10">
                      <Eye className="h-3.5 w-3.5 text-[#fe94d1]" /> Watching live
                    </span>
                  )}
                  {stakeLine && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ffca75]/12 px-3 py-1.5 text-[12px] font-bold text-[#ffca75] ring-1 ring-[#ffca75]/25">
                      <Coins className="h-3.5 w-3.5" /> {stakeLine}
                    </span>
                  )}
                </div>
              )}
              <PlayerBar
                player={opponent}
                side={(-mySide) as Side}
                clock={!isSolo ? clock(-mySide as Side) : undefined}
                active={turn === -mySide && !ended}
                captured={capturedBy((-mySide) as Side)}
                label={isSolo ? `Computer · ${DIFFS.find((d) => d.v === difficulty)?.label || "Balanced"}` : spectator ? undefined : "Opponent"}
              />
              <div className="relative my-3">
                <DraughtBoard
                  board={board}
                  moves={moves}
                  side={mySide}
                  players={{ red, black }}
                  onMove={move}
                  disabled={spectator || busy || ended || turn !== mySide || (!isSolo && data?.room.status !== "active")}
                />
                {/* Result over the board */}
                {ended && (
                  <div className="zd-rise absolute inset-0 z-10 grid place-items-center rounded-[14px] bg-[#09050d]/55 backdrop-blur-[3px] sm:rounded-[18px]">
                    <div
                      className="relative w-[min(90%,440px)] overflow-hidden rounded-[28px] p-[1.5px] sm:rounded-[30px] shadow-[0_40px_90px_-24px_rgba(0,0,0,0.95)]"
                      style={{ background: won ? "linear-gradient(150deg,rgba(255,202,117,0.85),rgba(255,255,255,0.08) 45%,rgba(253,73,176,0.55))" : "linear-gradient(150deg,rgba(255,255,255,0.22),rgba(255,255,255,0.05) 50%,rgba(255,255,255,0.14))" }}
                    >
                      <div className="relative flex flex-col items-center justify-center rounded-[26.5px] bg-[#150b19]/97 px-5 py-6 text-center sm:min-h-[360px] sm:rounded-[28.5px] sm:px-10 sm:py-10">
                        <span aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl" style={{ background: won ? "rgba(255,202,117,0.28)" : drawn ? "rgba(148,163,184,0.2)" : "rgba(108,90,133,0.3)" }} />
                        <span className="relative grid h-16 w-16 place-items-center rounded-full text-[#3a2006] shadow-[0_18px_44px_-12px_rgba(255,202,117,0.9)] sm:h-24 sm:w-24" style={{ background: won ? "linear-gradient(145deg,#ffe7a3,#ffca75 45%,#d99a2b)" : drawn ? "linear-gradient(145deg,#e2e8f0,#94a3b8)" : "linear-gradient(145deg,#6c5a85,#2b2236)" }}>
                          {won ? <Trophy className="h-8 w-8 sm:h-11 sm:w-11" /> : drawn ? <Users className="h-7 w-7 sm:h-9 sm:w-9" /> : <Flag className="h-7 w-7 text-white/80 sm:h-9 sm:w-9" />}
                        </span>
                        <h2 className="relative mt-4 text-balance font-display text-[26px] font-extrabold leading-tight tracking-tight sm:mt-5 sm:text-[36px]">{result}</h2>
                        <p className="relative mt-1.5 max-w-[320px] text-[13.5px] leading-relaxed text-white/60 sm:text-[15px]">{statusHint}</p>
                        {stakeLine && (
                          <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#ffca75]/12 px-3.5 py-1.5 text-[13px] sm:mt-4 sm:px-4 sm:py-2 sm:text-[13.5px] font-bold text-[#ffca75] ring-1 ring-[#ffca75]/25">
                            <Coins className="h-4 w-4" /> {stakeLine}
                          </p>
                        )}
                        <button className={`${primary} relative mt-5 min-h-[50px] w-full max-w-[320px] text-[15.5px] sm:mt-7 sm:min-h-[52px] sm:text-[16px]`} onClick={() => (isSolo ? setSolo(initialDraught()) : onNavigate())}>
                          {spectator ? "Back to Zero Draught" : "Play again"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <PlayerBar
                player={meSide}
                side={mySide}
                clock={!isSolo ? clock(mySide) : undefined}
                active={turn === mySide && !ended}
                captured={capturedBy(mySide)}
                label={spectator ? undefined : "You"}
              />
            </section>

            <aside className="min-w-0 space-y-4">
              <div className="overflow-hidden rounded-[26px] bg-white/[0.035] ring-1 ring-white/[0.08]">
                <div className={`flex items-center gap-3 px-5 py-4 ${myTurn ? "bg-[linear-gradient(110deg,rgba(253,73,176,0.18),transparent_70%)]" : ""}`}>
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${myTurn ? "bg-[#fd49b0] text-white shadow-[0_0_24px_-4px_rgba(253,73,176,0.9)]" : "bg-white/[0.07] text-white/60"}`}>
                    {ended ? <Trophy className="h-5 w-5" /> : myTurn ? <Play className="h-4 w-4 fill-current" /> : <Loader2 className={`h-4 w-4 ${data?.room.status === "waiting" ? "" : "animate-spin"}`} />}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-[19px] font-bold tracking-tight">{statusTitle}</h2>
                    <p className="text-[13px] leading-snug text-white/55">{statusHint}</p>
                  </div>
                </div>

                {data?.room.status === "waiting" && !ended && (
                  <div className="border-t border-white/[0.06] px-5 py-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Invite code</p>
                    <p className="mt-1.5 break-all font-mono text-[24px] font-bold tracking-[0.2em] text-[#ffca75]">{data.room.code}</p>
                    <button onClick={() => void copy()} className={`${primary} mt-3`}>
                      <Copy className="h-4 w-4" /> Copy invite link
                    </button>
                  </div>
                )}

                {!isSolo && !spectator && !ended && (
                  <p className="border-t border-white/[0.06] px-5 py-2.5 text-[11.5px] text-white/40">
                    {connection} · your clock keeps running when you leave the screen.
                  </p>
                )}

                {!ended && !spectator && (
                  <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-5 py-4">
                    <button className={secondary} onClick={() => setConfirmation(isSolo ? "restart" : "resign")} disabled={busy}>
                      <Flag className="h-4 w-4" />
                      {isSolo ? "New game" : data?.room.status === "waiting" ? "Cancel invite" : "Resign"}
                    </button>
                    {!isSolo && data?.room.status === "active" && !data.room.draw_offer && (
                      <button className={secondary} onClick={() => void act("offer_draw")} disabled={busy}>
                        Offer draw
                      </button>
                    )}
                    {!isSolo && data?.room.status === "active" && (
                      <button type="button" onClick={() => void shareWatch()} className={secondary}>
                        <Share2 className="h-4 w-4" /> Invite watchers
                      </button>
                    )}
                  </div>
                )}

                {confirmation && (
                  <div className="zd-rise border-t border-white/[0.06] bg-white/[0.03] px-5 py-4">
                    <p className="text-[14px] font-semibold">
                      {confirmation === "restart"
                        ? "Start a new game? This replaces your saved board."
                        : data?.room.status === "waiting"
                          ? "Cancel this invitation?"
                          : "Resign this match? Your opponent wins."}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={busy}
                        className={confirmation === "restart" ? primary : danger}
                        onClick={async () => {
                          if (confirmation === "restart") setSolo(initialDraught());
                          else await act("resign");
                          setConfirmation(null);
                        }}
                      >
                        {confirmation === "restart" ? "Start over" : data?.room.status === "waiting" ? "Cancel invite" : "Resign"}
                      </button>
                      <button className={secondary} onClick={() => setConfirmation(null)}>Keep playing</button>
                    </div>
                  </div>
                )}

                {!ended && data?.room.draw_offer && (
                  <div className="zd-rise border-t border-white/[0.06] bg-[#ffca75]/[0.06] px-5 py-4">
                    <p className="text-[14px] font-semibold">
                      {data.room.draw_offer === profile?.id ? "Draw offered. Waiting for your opponent." : spectator ? "A draw has been offered." : "Your opponent offers a draw."}
                    </p>
                    {data.room.draw_offer !== profile?.id && !spectator && (
                      <div className="mt-3 flex gap-2">
                        <button disabled={busy} className={gold} onClick={() => void act("accept_draw")}>Accept draw</button>
                        <button disabled={busy} className={secondary} onClick={() => void act("decline_draw")}>Decline</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isSolo && roomId && data && data.room.status !== "waiting" && (
                <MatchComments roomId={roomId} myId={profile?.id} playerIds={[data.room.red_id, data.room.black_id || ""]} />
              )}
              <Rules />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerBar({
  player,
  side,
  clock,
  active,
  captured,
  label,
}: {
  player: DraughtPlayer;
  side: Side;
  clock?: string;
  active: boolean;
  captured: number;
  label?: string;
}) {
  const red = side === 1;
  const low = clock ? Number(clock.split(":")[0]) === 0 && Number(clock.split(":")[1]) <= 30 : false;
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-[20px] px-3 py-2.5 transition ${active ? "bg-white/[0.07] ring-1 ring-white/15" : "bg-white/[0.025] ring-1 ring-white/[0.05]"}`}>
      <span
        className={`relative inline-flex shrink-0 rounded-full p-[2px] ${active ? "shadow-[0_0_22px_-4px_rgba(253,73,176,0.9)]" : ""}`}
        style={{ background: red ? "linear-gradient(135deg,#fd89cc,#9e1965)" : "linear-gradient(135deg,#8b7aa8,#1c1426)" }}
      >
        <GameAvatar id={player.id} name={player.name} photo={player.photo} className="h-10 w-10 ring-2 ring-[#09050d]" />
        {active && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-[#09050d]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold">{player.name}</p>
        <p className="flex items-center gap-1.5 text-[11.5px] text-white/45">
          {label && <span>{label}</span>}
          {label && <span>·</span>}
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: red ? "radial-gradient(circle at 35% 30%,#fd89cc,#9e1965)" : "radial-gradient(circle at 35% 30%,#6c5a85,#1c1426)" }} />
            {captured > 0 ? `${captured} captured` : red ? "Red" : "Black"}
          </span>
        </p>
      </div>
      {clock && (
        <span className={`shrink-0 rounded-xl px-3 py-1.5 font-mono text-[18px] font-bold tabular-nums ${active ? (low ? "bg-red-500/20 text-red-300" : "bg-white text-[#140a1c]") : "bg-white/[0.06] text-white/70"}`}>
          {clock}
        </span>
      )}
    </div>
  );
}

function Rules() {
  return (
    <details className="group rounded-[22px] bg-white/[0.03] ring-1 ring-white/[0.07] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[14px] font-bold">
        <Crown className="h-4 w-4 text-[#ffca75]" /> How to play
        <ChevronRight className="ml-auto h-4 w-4 text-white/40 transition group-open:rotate-90" />
      </summary>
      <ul className="space-y-2.5 px-5 pb-5 text-[13.5px] leading-relaxed text-white/60">
        <li>8×8 draughts with flying kings. Red starts.</li>
        <li>
          Ordinary pieces move diagonally forward and can capture both forwards and backwards. Kings move any
          distance along a clear diagonal. To capture, cross one opponent and land on an empty square beyond it.
          Kings cannot cross friendly pieces or two opponents in one jump.
        </li>
        <li>Captures are mandatory. Continue a chain with the same piece when another jump is available.</li>
        <li>Reach the far row to become a king. Crowning ends that turn.</li>
        <li>Win by capturing all pieces or leaving your opponent without a legal move.</li>
        <li>Three repeated positions, or 40 full moves without a capture or a man moving, produce a draw.</li>
      </ul>
    </details>
  );
}
