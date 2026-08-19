import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  BellRing,
  Check,
  Clock3,
  Copy,
  Crown,
  Gamepad2,
  Gift,
  Link2,
  Loader2,
  LockKeyhole,
  Medal,
  MoreHorizontal,
  Play,
  Radio,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { SudokuRaceBoard } from "@/features/games/SudokuRaceBoard";
import { WordsRaceBoard } from "@/features/games/WordsRaceBoard";
import {
  formatGameTime,
  getGameName,
  profileName,
  secondsUntil,
  type ZeroGameCompetition,
  type ZeroGamePlayer,
  type ZeroGamePresence,
  type ZeroGameReward,
} from "@/features/games/zeroGames";
import { toast } from "sonner";

export const Route = createFileRoute("/app/games/$id")({
  component: ZeroGameCompetitionPage,
});

const competitionSelect = `
  *,
  creator:profiles!zero_game_competitions_creator_id_fkey(id, username, full_name, avatar_url),
  winner:profiles!zero_game_competitions_winner_id_fkey(id, username, full_name, avatar_url)
`;

async function loadCompetition(id: string, profileId?: string) {
  const [{ data: competition, error: competitionError }, { data: players, error: playersError }, { data: reward }] = await Promise.all([
    supabase.from("zero_game_competitions").select(competitionSelect).eq("id", id).single(),
    supabase
      .from("zero_game_players")
      .select("*, profile:profiles!zero_game_players_profile_id_fkey(id, username, full_name, avatar_url)")
      .eq("competition_id", id)
      .order("joined_at", { ascending: true }),
    profileId
      ? supabase.from("zero_game_rewards").select("*").eq("competition_id", id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (competitionError) throw competitionError;
  if (playersError) throw playersError;
  return {
    competition: competition as unknown as ZeroGameCompetition,
    players: (players || []) as unknown as ZeroGamePlayer[],
    reward: reward as unknown as ZeroGameReward | null,
  };
}

function ZeroGameCompetitionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  const { format } = useWalletCurrency();
  const [now, setNow] = useState(Date.now());
  const [working, setWorking] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [buzzCooldowns, setBuzzCooldowns] = useState<Record<string, number>>({});
  const expiryRequested = useRef(false);
  const lastProgress = useRef(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["zero-game", id, profile?.id],
    queryFn: () => loadCompetition(id, profile?.id),
    enabled: Boolean(id && profile?.id),
    refetchInterval: 20_000,
  });

  const { data: presenceRows = [], isSuccess: presenceReady } = useQuery({
    queryKey: ["zero-game-presence", id],
    queryFn: async () => {
      const { data: presence, error: presenceError } = await supabase
        .from("zero_game_presence")
        .select("competition_id, profile_id, last_seen_at")
        .eq("competition_id", id);
      if (presenceError) throw presenceError;
      return (presence || []) as ZeroGamePresence[];
    },
    enabled: Boolean(id && profile?.id && data?.competition),
    refetchInterval: 5_000,
    retry: false,
    staleTime: 2_000,
  });

  const competition = data?.competition;
  const players = data?.players || [];
  const reward = data?.reward;
  const currentPlayer = players.find((player) => player.profile_id === profile?.id);
  const isHost = competition?.creator_id === profile?.id;
  const isJoined = Boolean(currentPlayer);
  const isReady = currentPlayer?.status === "ready" || currentPlayer?.status === "playing" || currentPlayer?.status === "finished";
  const everyPlayerReady = players.length >= 2 && players.every((player) => player.status === "ready" || player.status === "playing" || player.status === "finished");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`zero-game:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "zero_game_competitions", filter: `id=eq.${id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["zero-game", id] });
        void queryClient.invalidateQueries({ queryKey: ["zero-games"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "zero_game_players", filter: `competition_id=eq.${id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["zero-game", id] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, queryClient]);

  useEffect(() => {
    if (!id || !currentPlayer?.id || !competition || competition.status === "completed" || competition.status === "cancelled") return;

    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("heartbeat_zero_game_player", { p_competition_id: id }).then(({ error: heartbeatError }) => {
        if (!heartbeatError) void queryClient.invalidateQueries({ queryKey: ["zero-game-presence", id] });
      });
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 8_000);
    const onVisibilityChange = () => heartbeat();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", heartbeat);
    };
  }, [competition, currentPlayer?.id, id, queryClient]);

  const countdown = competition?.started_at ? Math.max(0, Math.ceil((new Date(competition.started_at).getTime() - now) / 1000)) : 0;
  const elapsed = competition?.started_at ? Math.max(0, Math.floor((now - new Date(competition.started_at).getTime()) / 1000)) : 0;
  const timeRemaining = competition ? Math.max(0, competition.duration_seconds - elapsed) : 0;
  const phase = useMemo(() => {
    if (!competition) return "loading";
    if (competition.status === "completed") return "results";
    if (competition.status === "cancelled") return "cancelled";
    if (competition.status === "open") return "lobby";
    if (competition.started_at && new Date(competition.started_at).getTime() > now) return "countdown";
    return "playing";
  }, [competition, now]);
  const liveProfileIds = useMemo(() => new Set(
    presenceRows
      .filter((presence) => new Date(presence.last_seen_at).getTime() >= now - 20_000)
      .map((presence) => presence.profile_id),
  ), [now, presenceRows]);

  useEffect(() => {
    if (phase !== "playing" || timeRemaining > 0 || expiryRequested.current || !competition) return;
    expiryRequested.current = true;
    void supabase.rpc("expire_zero_game_competition", { p_competition_id: competition.id }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["zero-game", competition.id] });
    });
  }, [competition, phase, queryClient, timeRemaining]);

  const runAction = async (key: string, action: () => PromiseLike<{ error: any }>, success?: string) => {
    setWorking(key);
    try {
      const { error: actionError } = await action();
      if (actionError) throw actionError;
      if (success) toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ["zero-game", id] });
      return true;
    } catch (actionError: any) {
      toast.error(actionError.message || "Could not complete that action");
      return false;
    } finally {
      setWorking(null);
    }
  };

  const join = () => runAction("join", () => supabase.rpc("join_zero_game_competition", { p_competition_id: id }), "You joined the race");
  const toggleReady = () => runAction("ready", () => supabase.rpc("set_zero_game_ready", { p_competition_id: id, p_ready: !isReady }), isReady ? "You are no longer ready" : "You are ready");
  const startRace = () => runAction("start", () => supabase.rpc("start_zero_game_competition", { p_competition_id: id }), "Race countdown started");
  const cancelRace = async () => {
    await runAction("cancel", () => supabase.rpc("cancel_zero_game_competition", { p_competition_id: id }), "Competition cancelled and secured funds returned");
    await queryClient.invalidateQueries({ queryKey: ["zero-game-reward-allowance", profile?.id] });
  };
  const messagePlayer = (profileId: string) => {
    if (!profileId || profileId === profile?.id) return;
    navigate({ to: `/app/chat/${profileId}` });
  };
  const removePlayer = (player: ZeroGamePlayer) => {
    const name = profileName(player.profile);
    if (!window.confirm(`Remove ${name} from this competition? Their seat will become available again.`)) return;
    void runAction(
      `remove:${player.profile_id}`,
      () => supabase.rpc("remove_absent_zero_game_player", {
        p_competition_id: id,
        p_profile_id: player.profile_id,
      }),
      `${name} was removed and their seat is open`,
    );
  };
  const buzzPlayer = async (player: ZeroGamePlayer) => {
    const sent = await runAction(
      `buzz:${player.profile_id}`,
      () => supabase.rpc("buzz_zero_game_player", {
        p_competition_id: id,
        p_recipient_id: player.profile_id,
      }),
      `${profileName(player.profile)} was buzzed`,
    );
    if (sent) setBuzzCooldowns((current) => ({ ...current, [player.profile_id]: Date.now() + 45_000 }));
  };

  const competitionShareDetails = () => {
    if (!competition) return { url: "", rewardText: "", text: "" };
    const url = `${window.location.origin}/app/games/${competition.id}`;
    const rewardText = competition.reward_type === "cash"
      ? `${format(competition.prize_amount)} secured cash prize`
      : competition.offer_label || "a verified Zero Club winner offer";
    const text = `Join ${competition.title} on Zero Games. Entry is free. Winner reward: ${rewardText}. First correct finish wins.`;
    return { url, rewardText, text };
  };

  const share = async () => {
    if (!competition) return;
    const { url, text } = competitionShareDetails();
    try {
      if (navigator.share) await navigator.share({ title: competition.title, text, url });
      else { await navigator.clipboard.writeText(`${text}\n\n${url}`); toast.success("Reward invitation copied"); }
    } catch (shareError: any) {
      if (shareError?.name !== "AbortError") toast.error("Could not share this competition");
    }
  };

  const shareToFeed = async () => {
    if (!competition || !profile) return;
    setWorking("feed");
    try {
      const { url, rewardText } = competitionShareDetails();
      const { error: postError } = await supabase.from("posts").insert([{
        author_id: profile.id,
        content: `🎮 ${competition.title}\n\nJoin my ${getGameName(competition.game_type)} competition. Entry is free.\n\n🏆 Winner reward: ${rewardText}\nFirst correct finish wins.\n\n${url}`,
        media_urls: [],
        is_build_post: false,
      }]);
      if (postError) throw postError;
      toast.success("Competition shared to your Feed");
      setMoreOpen(false);
    } catch (postError: any) {
      toast.error(postError.message || "Could not share to the Feed");
    } finally {
      setWorking(null);
    }
  };

  const updateProgress = (progress: number) => {
    if (progress - lastProgress.current < 5 && progress < 100) return;
    lastProgress.current = progress;
    void supabase.rpc("update_zero_game_progress", { p_competition_id: id, p_progress: progress });
  };

  const submitResult = async (submission: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const { data: result, error: submitError } = await supabase.rpc("submit_zero_game_result", {
        p_competition_id: id,
        p_submission: submission,
      });
      if (submitError) throw submitError;
      if (result?.winner) toast.success("You finished first");
      else if (result?.finished) toast.info("The race already has a winner");
      else toast.error("That solution is not correct yet");
      await queryClient.invalidateQueries({ queryKey: ["zero-game", id] });
    } catch (submitError: any) {
      toast.error(submitError.message || "Could not check your result");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (error || !competition) return <div className="grid min-h-screen place-items-center bg-background px-5"><div className="max-w-md rounded-md border border-destructive/20 bg-card p-6 text-center"><Gamepad2 className="mx-auto h-6 w-6 text-muted-foreground" /><h1 className="mt-3 text-[16px] font-semibold">Competition unavailable</h1><p className="mt-1 text-[12px] text-muted-foreground">This link may have expired or Zero Games still needs its database update.</p><Link to="/app/games" className="mt-5 inline-flex h-10 items-center rounded-md bg-foreground px-4 text-[11px] font-semibold text-background">Back to Zero Games</Link></div></div>;

  if (phase === "playing") {
    return (
      <RaceScreen
        competition={competition}
        players={players}
        currentProfileId={profile?.id}
        timeRemaining={timeRemaining}
        submitting={submitting}
        onProgress={updateProgress}
        onSubmit={submitResult}
        onLeave={() => navigate({ to: "/app/games" })}
        onMessage={messagePlayer}
      />
    );
  }

  if (phase === "countdown") {
    return <CountdownScreen competition={competition} countdown={countdown} players={players} currentProfileId={profile?.id} onMessage={messagePlayer} />;
  }

  if (phase === "results" || phase === "cancelled") {
    return <ResultsScreen competition={competition} players={players} reward={reward || null} profileId={profile?.id} format={format} onRedeemed={() => queryClient.invalidateQueries({ queryKey: ["zero-game", id] })} />;
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <header className="sticky top-0 z-40 border-b border-border bg-background/96 px-4 py-3 backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3">
          <button onClick={() => navigate({ to: "/app/games" })} className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">{getGameName(competition.game_type)}</p><h1 className="truncate text-[17px] font-semibold tracking-tight">Competition lobby</h1></div>
          <button onClick={share} className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card"><Share2 className="h-4 w-4 fill-current" /></button>
          <button onClick={() => setMoreOpen(true)} className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card"><MoreHorizontal className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1080px] gap-6 px-4 py-5 md:grid-cols-[minmax(0,1fr)_330px] md:px-7 md:py-8">
        <div>
          <section className="border-b border-border pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Open</span>
              <span className="rounded-sm bg-foreground/[0.055] px-2 py-1 text-[9px] font-semibold capitalize text-muted-foreground">{competition.difficulty}</span>
              {competition.profession && <span className="rounded-sm bg-foreground/[0.055] px-2 py-1 text-[9px] font-semibold text-muted-foreground">{competition.profession}</span>}
            </div>
            <h2 className="mt-4 max-w-2xl text-[clamp(25px,6vw,38px)] font-semibold leading-tight tracking-tight">{competition.title}</h2>
            <div className="mt-5 flex items-center gap-3">
              <button type="button" onClick={() => messagePlayer(competition.creator_id)} disabled={isHost} className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default" aria-label={isHost ? "You are the host" : `Message ${profileName(competition.creator)}`}>
                <Avatar profile={competition.creator} size="md" />
                <span><span className="block text-[11px] text-muted-foreground">Hosted by</span><span className="block text-[13px] font-semibold">{profileName(competition.creator)}</span></span>
              </button>
              {isHost && <span className="rounded-sm bg-primary/10 px-2 py-1 text-[9px] font-semibold text-primary">You are hosting</span>}
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-primary">Waiting room</p><h3 className="mt-1 text-[16px] font-semibold">Players</h3></div><span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{players.length}/{competition.max_players}</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {players.map((player, index) => <PlayerLobbyCard key={player.id} player={player} hostId={competition.creator_id} currentProfileId={profile?.id} index={index} isHost={isHost} isLive={liveProfileIds.has(player.profile_id)} presenceReady={presenceReady} canBuzz={Boolean(isHost || isJoined)} buzzing={working === `buzz:${player.profile_id}`} buzzCooling={(buzzCooldowns[player.profile_id] || 0) > now} removing={working === `remove:${player.profile_id}`} onMessage={messagePlayer} onBuzz={buzzPlayer} onRemove={removePlayer} />)}
              {Array.from({ length: Math.max(0, Math.min(4, competition.max_players - players.length)) }, (_, index) => <div key={`empty-${index}`} className="flex h-[66px] items-center gap-3 rounded-md border border-dashed border-border px-3 text-muted-foreground"><span className="grid h-9 w-9 place-items-center rounded-full bg-muted"><UserPlus className="h-4 w-4" /></span><span className="text-[10.5px] font-medium">Open player spot</span></div>)}
            </div>
          </section>
        </div>

        <aside className="md:sticky md:top-24 md:self-start">
          <div className="rounded-md border border-border bg-card p-5">
            <div className={`flex items-start gap-3 rounded-md p-3 ${competition.reward_type === "cash" ? "bg-emerald-500/[0.07]" : "bg-primary/[0.055]"}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${competition.reward_type === "cash" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"}`}>{competition.reward_type === "cash" ? <Banknote className="h-[18px] w-[18px] fill-current" /> : <Gift className="h-[18px] w-[18px] fill-current" />}</span>
              <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Winner reward</p><p className="mt-1 text-[12px] font-semibold leading-5">{competition.reward_type === "cash" ? format(competition.prize_amount) : competition.offer_label}</p>{competition.reward_type === "cash" && <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-3 w-3 fill-current" />Prize secured by Zero Club</p>}</div>
            </div>
            <div className="mt-4 divide-y divide-border border-y border-border text-[11px]"><LobbyRow Icon={Clock3} label="Starts" value={new Date(competition.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} /><LobbyRow Icon={Users} label="Players" value={`${players.length} of ${competition.max_players}`} /><LobbyRow Icon={Radio} label="Duration" value={`${Math.round(competition.duration_seconds / 60)} minutes`} /><LobbyRow Icon={Link2} label="Access" value={competition.visibility === "link" ? "Link only" : competition.visibility === "followers" ? "Followers" : "Public"} /></div>

            {!isJoined && !isHost && <button onClick={join} disabled={working === "join"} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground text-[12px] font-semibold text-background disabled:opacity-50">{working === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 fill-current" />}Join free</button>}
            {isJoined && !isHost && <button onClick={toggleReady} disabled={working === "ready"} className={`mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md text-[12px] font-semibold ${isReady ? "border border-primary bg-primary/[0.07] text-primary" : "bg-foreground text-background"}`}>{working === "ready" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}{isReady ? "Ready" : "I am ready"}</button>}
            {isHost && <button onClick={startRace} disabled={working === "start" || !everyPlayerReady} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground text-[12px] font-semibold text-background disabled:cursor-not-allowed disabled:opacity-35">{working === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}Start race</button>}
            {isHost && !everyPlayerReady && <p className="mt-2 text-center text-[9.5px] text-muted-foreground">At least two players must be ready.</p>}
            <button onClick={share} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border text-[11px] font-semibold"><Share2 className="h-4 w-4 fill-current" />Invite players</button>
          </div>
        </aside>
      </main>

      {moreOpen && <ActionOverlay onClose={() => setMoreOpen(false)} isHost={isHost} working={working} onFeed={shareToFeed} onCopy={async () => { const { text, url } = competitionShareDetails(); await navigator.clipboard.writeText(`${text}\n\n${url}`); toast.success("Reward invitation copied"); setMoreOpen(false); }} onCancel={cancelRace} />}
    </div>
  );
}

function RaceScreen({ competition, players, currentProfileId, timeRemaining, submitting, onProgress, onSubmit, onLeave, onMessage }: any) {
  return (
    <div className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-40 border-b border-border bg-background/96 px-3 py-2.5 backdrop-blur-xl sm:px-5">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          <button onClick={onLeave} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-card"><X className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-primary">Live race</p><h1 className="truncate text-[14px] font-semibold tracking-tight">{competition.title}</h1></div>
          <div className={`flex h-10 min-w-[78px] items-center justify-center gap-1.5 rounded-md px-3 font-mono text-[16px] font-semibold tabular-nums ${timeRemaining <= 30 ? "bg-destructive/10 text-destructive" : "bg-foreground text-background"}`}><Clock3 className="h-4 w-4" />{formatGameTime(timeRemaining)}</div>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1180px] gap-5 px-3 py-4 sm:px-5 md:py-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0">
          {competition.game_type === "sudoku" ? (
            <SudokuRaceBoard puzzle={competition.puzzle.puzzle || ""} submitting={submitting} disabled={timeRemaining <= 0} onProgress={onProgress} onSubmit={(solution) => onSubmit({ solution })} />
          ) : (
            <WordsRaceBoard letters={competition.puzzle.letters || []} words={competition.puzzle.words || []} size={competition.puzzle.size || 12} submitting={submitting} disabled={timeRemaining <= 0} onProgress={onProgress} onSubmit={(found) => onSubmit({ found })} />
          )}
        </section>
        <aside className="order-first lg:order-none lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible">
            {players.map((player: ZeroGamePlayer, index: number) => <PlayerProgress key={player.id} player={player} rank={index + 1} active={player.profile_id === currentProfileId} onMessage={onMessage} />)}
          </div>
        </aside>
      </main>
    </div>
  );
}

function CountdownScreen({ competition, countdown, players, currentProfileId, onMessage }: { competition: ZeroGameCompetition; countdown: number; players: ZeroGamePlayer[]; currentProfileId?: string; onMessage: (profileId: string) => void }) {
  const display = countdown <= 10 ? countdown || "GO" : formatGameTime(countdown);
  return <div className="grid min-h-screen place-items-center bg-[#171217] px-5 text-white"><div className="w-full max-w-lg text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-primary text-primary-foreground"><Gamepad2 className="h-7 w-7 fill-current" /></div><p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{getGameName(competition.game_type)}</p><h1 className="mt-2 text-[24px] font-semibold tracking-tight">{competition.title}</h1><div className="mx-auto mt-10 grid h-32 w-32 place-items-center rounded-full border border-white/15 bg-white/[0.045] font-mono text-[42px] font-semibold tabular-nums text-[#f28fd0] shadow-[0_0_55px_-18px_rgba(204,32,143,0.8)]">{display}</div><div className="mx-auto mt-10 flex max-w-sm justify-center -space-x-2">{players.slice(0, 8).map((player) => <button key={player.id} type="button" onClick={() => onMessage(player.profile_id)} disabled={player.profile_id === currentProfileId} className="rounded-full disabled:cursor-default" aria-label={player.profile_id === currentProfileId ? "You" : `Message ${profileName(player.profile)}`}><Avatar profile={player.profile} size="sm" ring /></button>)}</div><p className="mt-4 text-[11px] text-white/45">{players.length} players connected</p></div></div>;
}

function ResultsScreen({ competition, players, reward, profileId, format, onRedeemed }: any) {
  const [redeeming, setRedeeming] = useState(false);
  const winner = competition.winner || players.find((player: ZeroGamePlayer) => player.profile_id === competition.winner_id)?.profile;
  const isWinner = competition.winner_id === profileId;
  const winnerPlayer = players.find((player: ZeroGamePlayer) => player.profile_id === competition.winner_id);
  const redeem = async () => {
    if (!reward) return;
    setRedeeming(true);
    const { error } = await supabase.rpc("redeem_zero_game_offer", { p_reward_id: reward.id });
    if (error) toast.error(error.message); else { toast.success("Offer marked as redeemed"); await onRedeemed(); }
    setRedeeming(false);
  };
  if (competition.status === "cancelled") return <div className="grid min-h-screen place-items-center bg-background px-5"><div className="max-w-md text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-muted"><X className="h-6 w-6 text-muted-foreground" /></div><h1 className="mt-5 text-[22px] font-semibold">Competition closed</h1><p className="mt-2 text-[12px] leading-5 text-muted-foreground">No winner was confirmed. Any secured prize has been returned to the host.</p><Link to="/app/games" className="mt-6 inline-flex h-10 items-center rounded-md bg-foreground px-5 text-[11px] font-semibold text-background">Back to Zero Games</Link></div></div>;
  return <div className="min-h-screen bg-background px-4 py-[calc(1.25rem+env(safe-area-inset-top))] md:grid md:place-items-center md:p-8"><div className="mx-auto w-full max-w-[680px] overflow-hidden rounded-md border border-border bg-card"><div className="bg-[#171217] px-5 py-9 text-center text-white sm:px-8"><div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-[#ffcf00] text-black"><Trophy className="h-7 w-7 fill-current" /></div><p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#f28fd0]">Race complete</p><h1 className="mt-2 text-[24px] font-semibold tracking-tight">{isWinner ? "You finished first" : `${profileName(winner)} finished first`}</h1><p className="mt-2 text-[11px] text-white/50">{competition.title}</p></div><div className="p-5 sm:p-7"><div className="flex items-center gap-3 rounded-md border border-border bg-background p-4"><Avatar profile={winner} size="lg" /><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold">{profileName(winner)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Winner · {winnerPlayer ? `${Math.max(1, Math.round(winnerPlayer.score / 1000))} score` : "First correct finish"}</p></div><Crown className="h-5 w-5 fill-[#ffcf00] text-[#ffcf00]" /></div>{isWinner && <div className="mt-4 rounded-md border border-primary/20 bg-primary/[0.045] p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">{competition.reward_type === "cash" ? <Banknote className="h-5 w-5 fill-current" /> : <Gift className="h-5 w-5 fill-current" />}</span><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-primary">Your reward</p><p className="mt-1 text-[13px] font-semibold">{competition.reward_type === "cash" ? format(competition.prize_amount) : competition.offer_label}</p>{competition.reward_type === "cash" ? <p className="mt-1 text-[10px] text-muted-foreground">Transferred automatically to your Zero Club Wallet.</p> : reward && <><p className="mt-2 font-mono text-[12px] font-semibold tracking-[0.08em]">{reward.redemption_code}</p><p className="mt-1 text-[9.5px] text-muted-foreground">Valid until {new Date(reward.expires_at).toLocaleDateString()}</p></>}</div></div>{reward?.reward_type === "offer" && reward.status === "unlocked" && <button onClick={redeem} disabled={redeeming} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground text-[11px] font-semibold text-background">{redeeming && <Loader2 className="h-4 w-4 animate-spin" />}Redeem offer</button>}</div>}<div className="mt-5 grid grid-cols-2 gap-2"><Link to="/app/games" className="grid h-11 place-items-center rounded-md border border-border text-[11px] font-semibold">Zero Games</Link><Link to="/app/games/create" search={{ game: competition.game_type }} className="grid h-11 place-items-center rounded-md bg-foreground text-[11px] font-semibold text-background">Create another</Link></div></div></div></div>;
}

function PlayerLobbyCard({ player, hostId, currentProfileId, index, isHost, isLive, presenceReady, canBuzz, buzzing, buzzCooling, removing, onMessage, onBuzz, onRemove }: { player: ZeroGamePlayer; hostId: string; currentProfileId?: string; index: number; isHost: boolean; isLive: boolean; presenceReady: boolean; canBuzz: boolean; buzzing: boolean; buzzCooling: boolean; removing: boolean; onMessage: (profileId: string) => void; onBuzz: (player: ZeroGamePlayer) => void; onRemove: (player: ZeroGamePlayer) => void }) {
  const ready = player.status !== "joined";
  const isCurrentPlayer = player.profile_id === currentProfileId;
  const canRemove = isHost && player.profile_id !== hostId && presenceReady && !isLive;
  const canSendBuzz = canBuzz && !isCurrentPlayer && presenceReady && !isLive;
  return (
    <div className="flex min-h-[72px] items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      <button type="button" onClick={() => onMessage(player.profile_id)} disabled={isCurrentPlayer} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default" aria-label={isCurrentPlayer ? "You" : `Message ${profileName(player.profile)}`}>
        <span className="relative shrink-0">
          <Avatar profile={player.profile} size="sm" />
          <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${isLive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5"><span className="truncate text-[11.5px] font-semibold">{isCurrentPlayer ? "You" : profileName(player.profile)}</span>{player.profile_id === hostId && <Crown className="h-3.5 w-3.5 fill-[#ffcf00] text-[#ffcf00]" />}</span>
          <span className="mt-0.5 block text-[9px] text-muted-foreground">Player {index + 1} · {presenceReady ? (isLive ? "Live" : "Away") : "Checking seat"}</span>
        </span>
      </button>
      <span className={`inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold ${ready ? "text-emerald-600" : "text-muted-foreground"}`}>{ready && <Check className="h-3 w-3" strokeWidth={3} />}{ready ? "Ready" : "Waiting"}</span>
      {canSendBuzz && <button type="button" onClick={() => onBuzz(player)} disabled={buzzing || buzzCooling} className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-400/15 text-amber-700 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-300" title={buzzCooling ? "Buzz sent. Try again shortly" : `Buzz ${profileName(player.profile)}`} aria-label={`Buzz ${profileName(player.profile)} to join the game`}>{buzzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5 fill-current" />}</button>}
      {canRemove && <button type="button" onClick={() => onRemove(player)} disabled={removing} className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-destructive/8 text-destructive transition hover:bg-destructive/15 disabled:opacity-50" title={`Remove ${profileName(player.profile)}`} aria-label={`Remove ${profileName(player.profile)} from competition`}>{removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5 fill-current" />}</button>}
    </div>
  );
}

function PlayerProgress({ player, rank, active, onMessage }: { player: ZeroGamePlayer; rank: number; active: boolean; onMessage: (profileId: string) => void }) {
  return <div className={`min-w-[190px] rounded-md border p-3 lg:min-w-0 ${active ? "border-primary bg-primary/[0.045]" : "border-border bg-card"}`}><div className="flex items-center gap-2.5"><span className="grid h-6 w-6 place-items-center rounded-sm bg-foreground/[0.06] text-[9px] font-semibold tabular-nums">{rank}</span><button type="button" onClick={() => onMessage(player.profile_id)} disabled={active} className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default" aria-label={active ? "You" : `Message ${profileName(player.profile)}`}><Avatar profile={player.profile} size="xs" /><span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold">{active ? "You" : profileName(player.profile)}</span></button><span className="text-[9px] font-semibold tabular-nums text-muted-foreground">{player.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${player.progress}%` }} /></div></div>;
}

function LobbyRow({ Icon, label, value }: any) {
  return <div className="flex items-start justify-between gap-4 py-3"><span className="flex items-center gap-2 text-muted-foreground"><Icon className="mt-px h-3.5 w-3.5" />{label}</span><span className="max-w-[180px] text-right font-semibold leading-4">{value}</span></div>;
}

function Avatar({ profile, size, ring = false }: { profile?: any; size: "xs" | "sm" | "md" | "lg"; ring?: boolean }) {
  const classes = { xs: "h-7 w-7 text-[9px]", sm: "h-9 w-9 text-[10px]", md: "h-10 w-10 text-[11px]", lg: "h-12 w-12 text-[13px]" }[size];
  return profile?.avatar_url ? <img src={profile.avatar_url} alt="" className={`${classes} shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-[#171217]" : "ring-1 ring-border"}`} /> : <span className={`${classes} grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground ${ring ? "ring-2 ring-[#171217]" : ""}`}>{profileName(profile).charAt(0).toUpperCase()}</span>;
}

function ActionOverlay({ onClose, isHost, working, onFeed, onCopy, onCancel }: any) {
  return <div className="fixed inset-0 z-[100] bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}><div className="absolute inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] mx-auto max-w-md rounded-md border border-border bg-background p-3 shadow-2xl md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:w-[390px] md:-translate-x-1/2 md:-translate-y-1/2" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between px-1 pb-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-primary">Competition</p><h2 className="text-[16px] font-semibold">Share and manage</h2></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md bg-muted"><X className="h-4 w-4" /></button></div><button onClick={onFeed} disabled={working === "feed"} className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-muted"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground"><Send className="h-4 w-4 fill-current" /></span><span><span className="block text-[12px] font-semibold">Share to Feed</span><span className="text-[9.5px] text-muted-foreground">Invite builders across Zero Club</span></span></button><button onClick={onCopy} className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-muted"><span className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background"><Copy className="h-4 w-4" /></span><span><span className="block text-[12px] font-semibold">Copy invitation link</span><span className="text-[9.5px] text-muted-foreground">Send it anywhere</span></span></button>{isHost && <button onClick={onCancel} disabled={working === "cancel"} className="mt-2 flex h-11 w-full items-center justify-center rounded-md bg-destructive/8 text-[11px] font-semibold text-destructive hover:bg-destructive/12">Cancel competition</button>}</div></div>;
}
