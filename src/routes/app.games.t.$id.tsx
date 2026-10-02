import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useGoBack } from "@/hooks/useGoBack";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Calendar, Clock3, Crown, Globe, LockKeyhole, Medal, Pencil, Play, Share2, ShieldCheck, Trophy, Users, X,
} from "@/components/icons/glyphs";
import { ZeroPageLoader } from "@/components/ZeroLoader";
import { openShareSheet } from "@/components/ShareSheet";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { ZERO_GAMES } from "@/features/games/v2/catalog";
import { GameEmblem, SPLASH_CSS } from "@/features/games/v2/GameSplash";
import {
  countdown, durationLabel, joinTournament, JOIN_REFUSAL, placeLabel, prizeText, tournamentDetail,
  previewPrizeLine, tournamentPreview, updateTournament, type TournamentRow,
} from "@/features/games/v2/api";

export const Route = createFileRoute("/app/games/t/$id")({
  validateSearch: (search: Record<string, unknown>): { code?: string } => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  /*
   * Link previews. A shared tournament link is opened by a crawler that is
   * signed out and runs no JavaScript, so without this every link previewed as
   * the generic Zero Club card. The loader runs on the server and the head
   * describes the game, the tournament and its prize instead.
   */
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: async ({ params, deps }) => {
    try {
      const preview = await tournamentPreview(params.id, deps.code);
      // The invite code travels with it, so a private link's preview image
      // can show the tournament rather than a "private" card.
      return { ...preview, inviteCode: deps.code } as typeof preview & { inviteCode?: string };
    } catch {
      return null;
    }
  },
  head: ({ loaderData, params }) => {
    const preview = loaderData;
    if (!preview || !preview.found) return {};
    const game = ZERO_GAMES[preview.game_type] || ZERO_GAMES.space;
    const open = preview.locked ? null : preview;
    const title = open ? `${open.title} · ${game.name} tournament` : `A private ${game.name} tournament on Zero Games`;
    const left = open && open.status !== "ended"
      ? (() => { const d = Math.ceil((new Date(open.ends_at).getTime() - Date.now()) / 86400000); return d > 1 ? ` ${d} days left.` : " Ends today."; })()
      : "";
    const description = open
      ? `${previewPrizeLine(open)}. ${game.tagline} ${open.players} player${open.players === 1 ? "" : "s"} so far.${left} Highest Game Points wins.`
      : `${game.name}: ${game.tagline} You need the invite link to join.`;
    const invite = (loaderData as { inviteCode?: string }).inviteCode;
    const image = `https://www.zeroclubs.xyz/api/og/game/${params.id}${invite ? `?code=${encodeURIComponent(invite)}` : ""}`;
    const url = `https://www.zeroclubs.xyz/app/games/t/${params.id}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Zero Games" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:secure_url", content: image },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: TournamentPage,
});

function TournamentPage() {
  const { id } = Route.useParams();
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { format } = useWalletCurrency();
  const money = (n: number) => format(n);
  const [now, setNow] = useState(Date.now());
  const [joining, setJoining] = useState(false);
  const [editing, setEditing] = useState(false);

  const query = useQuery({
    queryKey: ["zero-tournament", id, code],
    queryFn: () => tournamentDetail(id, code),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const back = useGoBack("/app/games");

  if (query.isLoading) return <div className="grid min-h-screen place-items-center bg-canvas"><ZeroPageLoader /></div>;

  const data = query.data;
  if (!data || !data.found || data.locked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#cc208f]/10 text-[#cc208f]"><LockKeyhole className="h-6 w-6" /></span>
        <p className="mt-4 text-[17px] font-semibold">{data && data.found ? `${data.title} is private` : "Tournament not found"}</p>
        <p className="mt-1 max-w-[320px] text-[14px] text-muted-foreground">
          {data && data.found ? "Ask the host for the invite link to see the leaderboard and join." : "It may have been removed, or the link is incomplete."}
        </p>
        <Link to="/app/games" className="mt-6 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">Zero Games</Link>
      </div>
    );
  }

  const { tournament: t, joined, can_enter, me, leaderboard, awards } = data;
  const info = ZERO_GAMES[t.game_type];
  const starts = new Date(t.starts_at).getTime();
  const ends = new Date(t.ends_at).getTime();
  const status = now < starts ? "upcoming" : now >= ends ? "ended" : "live";
  const totalMins = Math.round((ends - starts) / 60000);
  const progress = status === "live" ? Math.min(100, ((now - starts) / (ends - starts)) * 100) : status === "ended" ? 100 : 0;
  const full = t.max_players !== null && t.players >= t.max_players && !joined;

  const share = () => {
    const url = `${window.location.origin}/app/games/t/${t.id}${t.visibility === "private" && t.share_code ? `?code=${t.share_code}` : ""}`;
    openShareSheet({ url, title: t.title, text: `Play ${info.name} with me in "${t.title}" on Zero Club`, heading: "Invite players" });
  };

  const join = async () => {
    setJoining(true);
    try {
      const r = await joinTournament(t.id, code);
      if (!r.ok) throw new Error(JOIN_REFUSAL[r.reason || ""] || "Couldn't join.");
      toast.success(status === "live" ? "You're in. Good luck!" : "You're in. We'll see you at the start.");
      await queryClient.invalidateQueries({ queryKey: ["zero-tournament", id] });
      void queryClient.invalidateQueries({ queryKey: ["zero-tournaments"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const play = () => navigate({ to: "/app/games/play/$game", params: { game: t.game_type }, search: { t: t.id, code } });

  return (
    <div className="min-h-screen bg-canvas pb-[calc(env(safe-area-inset-bottom)+96px)]">
      <style>{SPLASH_CSS}</style>
      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: `radial-gradient(120% 90% at 80% 0%, ${info.to}, ${info.from} 75%)` }}>
        <div className="relative mx-auto max-w-[680px] px-4 pb-6 pt-[calc(env(safe-area-inset-top)+10px)]">
          <div className="flex items-center">
            <button onClick={back} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><ArrowLeft className="h-5 w-5" /></button>
            {t.is_creator && status !== "ended" && (
              <button onClick={() => setEditing(true)} className="ml-auto flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-semibold"><Pencil className="h-4 w-4" /> Edit</button>
            )}
            <button onClick={share} className={`${t.is_creator && status !== "ended" ? "ml-2" : "ml-auto"} flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-semibold`}><Share2 className="h-4 w-4" /> Invite</button>
          </div>
          <div className="mt-5 flex items-start gap-4">
            <div className="shrink-0"><GameEmblem game={t.game_type} size={76} /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip status={status} />
                {t.sponsored && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-bold uppercase tracking-wide text-[#cc208f]"><ShieldCheck className="h-3 w-3" /> Sponsored by Zero Club</span>}
              </div>
              <h1 className="mt-2 font-display text-[24px] font-bold leading-tight tracking-[-0.02em]">{t.title}</h1>
              <p className="mt-1 text-[13px] text-white/65">{info.name} · hosted by {t.sponsored ? "Zero Club" : t.is_creator ? "you" : t.creator_name || "a member"}</p>
            </div>
          </div>
          {t.description && <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-white/75">{t.description}</p>}

          <div className="mt-5 rounded-2xl bg-white/[0.07] p-4 backdrop-blur">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  {status === "upcoming" ? "Starts in" : status === "live" ? "Ends in" : "Ended"}
                </p>
                <p className="mt-0.5 font-display text-[28px] font-bold tabular-nums leading-none">
                  {status === "upcoming" ? countdown(starts - now) : status === "live" ? countdown(ends - now) : new Date(ends).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </p>
              </div>
              <p className="text-right text-[12.5px] text-white/60">{durationLabel(totalMins)} tournament</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${progress}%`, background: info.accent }} />
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[680px] space-y-2 pt-2">
        {/* Awards */}
        {awards.length > 0 && (
          <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
            <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold"><Crown className="h-4 w-4 text-[#e3a008]" /> Winners</h2>
            <div className="mt-3 space-y-2">
              {awards.map((a) => (
                <div key={a.place} className="flex items-center gap-3 rounded-xl bg-foreground/[0.03] p-3">
                  <Avatar url={a.avatar_url} name={a.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{a.name}</p>
                    <p className="text-[12.5px] text-muted-foreground">{placeLabel(a.place)} · {a.score.toLocaleString()} pts</p>
                  </div>
                  <p className="shrink-0 text-[13px] font-bold text-[#1a7f4b]">{a.amount ? money(a.amount) : a.zp ? `${a.zp.toLocaleString()} ZP` : a.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Leaderboard */}
        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <div className="flex items-center px-4 pb-2 pt-4">
            <h2 className="font-display text-[17px] font-semibold">Leaderboard</h2>
            {status === "live" && <span className="ml-2 h-2 w-2 animate-pulse rounded-full bg-[#e0245e]" />}
            {me && <span className="ml-auto text-[12.5px] text-muted-foreground">You: {me.best_score.toLocaleString()} pts{me.rank ? ` · #${me.rank}` : ""} · {me.plays} run{me.plays === 1 ? "" : "s"}</span>}
          </div>
          {leaderboard.length === 0 ? (
            <div className="border-t border-border/60 px-5 py-10 text-center">
              <p className="text-[15px] font-semibold">No scores yet</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{status === "upcoming" ? "Scores appear here as soon as the tournament starts." : "Scores appear here the moment someone finishes a run. Be the first!"}</p>
            </div>
          ) : (
            <ol>
              {leaderboard.map((row) => {
                const mine = me && row.rank === me.rank;
                return (
                  <li key={row.profile_id} className={`flex items-center gap-3 border-t border-border/60 px-4 py-2.5 ${mine ? "bg-[#cc208f]/[0.06]" : ""}`}>
                    <span className={`w-7 shrink-0 text-center text-[14px] font-bold tabular-nums ${row.rank <= 3 ? "" : "text-muted-foreground"}`} style={row.rank <= 3 ? { color: row.rank === 1 ? "#e3a008" : row.rank === 2 ? "#8a94a3" : "#c26d3a" } : undefined}>
                      {row.rank === 1 ? <Crown className="mx-auto h-4 w-4" /> : row.rank}
                    </span>
                    <Avatar url={row.avatar_url} name={row.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{row.name}{mine ? " (you)" : ""}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{row.username ? `@${row.username} · ` : ""}{row.plays} run{row.plays === 1 ? "" : "s"}</p>
                    </div>
                    <span className="shrink-0 text-[15px] font-bold tabular-nums">{row.best_score.toLocaleString()}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        {/* Prizes */}
        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold"><Trophy className="h-4 w-4 text-[#cc208f]" /> Prizes</h2>
          {t.reward_type === "none" || !t.prizes.length ? (
            <p className="mt-2 text-[13.5px] text-muted-foreground">No prize — just the crown and the bragging rights.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {t.prizes.map((p) => (
                <div key={p.place} className="rounded-xl border border-border p-3 text-center">
                  <Medal className="mx-auto h-5 w-5" style={{ color: p.place === 1 ? "#e3a008" : p.place === 2 ? "#9aa4b2" : "#c26d3a" }} />
                  <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{placeLabel(p.place)}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13.5px] font-bold">{prizeText(p, t.reward_type, money)}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Highest Game Points when the clock runs out wins. Only your best run counts, and you can play as many runs as you like while it's live. Ties go to whoever got there first.
            {t.reward_type === "funds" || t.reward_type === "zp"
              ? t.sponsored ? " Prizes are paid by Zero Club, straight to the winners' wallets when it ends." : " Prizes are held from the host's wallet and paid automatically."
              : ""}
          </p>
        </section>

        {/* Rules */}
        <section className="grid grid-cols-2 gap-px overflow-hidden bg-border md:rounded-xl md:border md:border-border">
          <Fact Icon={Users} label="Players" value={`${t.players}${t.max_players ? ` / ${t.max_players}` : ""}`} sub={t.max_players ? (full ? "Full" : `${t.max_players - t.players} spots left`) : "Unlimited"} />
          <Fact Icon={t.visibility === "private" ? LockKeyhole : Globe} label="Access" value={t.visibility === "private" ? "Private" : "Public"} sub={t.visibility === "private" ? "Invite link only" : "Anyone can find it"} />
          <Fact Icon={ShieldCheck} label="Who can enter" value={t.eligibility === "subscribers" ? "Premium only" : "Everyone"} sub={t.eligibility === "subscribers" ? "Premium, Premium+ & Creator" : "Free and Premium"} />
          <Fact Icon={Calendar} label="Window" value={new Date(starts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} sub={`to ${new Date(ends).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`} />
        </section>

      </main>

      {t.is_creator && (
        <EditTournamentSheet
          open={editing}
          onOpenChange={setEditing}
          tournament={t}
          status={status}
          prizeSummary={t.reward_type === "none" || !t.prizes.length ? "No prize" : t.prizes.map((p) => `${placeLabel(p.place)}: ${prizeText(p, t.reward_type, money)}`).join(" · ")}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ["zero-tournament", id] })}
        />
      )}

      {/* Action bar */}
      {status !== "ended" && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-[680px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold">
                {!can_enter ? "Premium members only" : joined ? (status === "live" ? "You're in — beat your best" : "You're in") : full ? "Tournament is full" : "Join to compete"}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {status === "upcoming" ? `Opens in ${countdown(starts - now)}` : `${countdown(ends - now)} left`}
              </p>
            </div>
            {!can_enter ? (
              <Link to="/app/premium" className="flex h-11 shrink-0 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">Go Premium</Link>
            ) : joined ? (
              <button onClick={play} disabled={status !== "live"} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[14px] font-bold text-white disabled:opacity-40" style={{ background: "#cc208f" }}>
                <Play className="h-4 w-4 fill-current" /> Play
              </button>
            ) : (
              <button onClick={() => void join()} disabled={joining || full} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background disabled:opacity-40">
                {joining ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" /> : <Users className="h-4 w-4" />} Join
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Host editing. Everything players read can change — name, rules, timing,
 * player limit, access — but the game and the prize cannot: players joined on
 * those terms and the prize money is already held.
 */
function EditTournamentSheet({ open, onOpenChange, tournament: t, status, prizeSummary, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament: TournamentRow & { is_creator: boolean };
  status: "upcoming" | "live" | "ended";
  prizeSummary: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(t.title);
  const [description, setDescription] = useState(t.description || "");
  const [startsAt, setStartsAt] = useState(toLocalInput(t.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(t.ends_at));
  const [capped, setCapped] = useState(t.max_players != null);
  const [cap, setCap] = useState(String(t.max_players ?? Math.max(10, t.players)));
  const [visibility, setVisibility] = useState(t.visibility);
  const [eligibility, setEligibility] = useState(t.eligibility);
  const [saving, setSaving] = useState(false);

  // Filled from the tournament each time the sheet OPENS — not on every
  // background refresh of the page, which used to wipe what you were typing.
  const latest = useRef(t);
  latest.current = t;
  useEffect(() => {
    if (!open) return;
    const t = latest.current;
    setTitle(t.title); setDescription(t.description || ""); setStartsAt(toLocalInput(t.starts_at)); setEndsAt(toLocalInput(t.ends_at));
    setCapped(t.max_players != null); setCap(String(t.max_players ?? Math.max(10, t.players))); setVisibility(t.visibility); setEligibility(t.eligibility);
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await updateTournament(t.id, {
        title: title.trim(),
        description: description.trim(),
        ...(status === "upcoming" ? { starts_at: new Date(startsAt).toISOString() } : {}),
        ends_at: new Date(endsAt).toISOString(),
        max_players: capped ? Math.max(2, Number(cap) || 2) : null,
        visibility,
        eligibility,
      });
      toast.success("Tournament updated");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message.replace(/^.*?: /, "") || "Couldn't save the changes.");
    } finally {
      setSaving(false);
    }
  };

  const field = "h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-[#cc208f]";
  const seg = (active: boolean) => `h-9 flex-1 rounded-full text-[13px] font-semibold transition ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`;

  /*
   * A full-screen editor rather than a bottom sheet. In a swipeable sheet,
   * tapping a field on a phone raised the keyboard, the sheet was pushed and
   * resized, and it read that as a dismiss — so it closed the moment you tried
   * to type. A plain page has nothing to swipe away.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit tournament" className="fixed inset-0 z-[120] flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <button onClick={() => onOpenChange(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-semibold">Edit tournament</p>
          <p className="truncate text-[12px] text-muted-foreground">Changes show to players straight away.</p>
        </div>
      </header>
        <div className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Name</span>
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 600))} rows={3} className={`${field} h-auto resize-none py-2.5`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Starts</span>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={status !== "upcoming"} className={`${field} disabled:opacity-50`} />
                {status !== "upcoming" && <span className="mt-1 block text-[11.5px] text-muted-foreground">Already started</span>}
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Ends</span>
                <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Players</span>
              <div className="flex rounded-full bg-foreground/[0.06] p-1">
                <button type="button" onClick={() => setCapped(false)} className={seg(!capped)}>Unlimited</button>
                <button type="button" onClick={() => setCapped(true)} className={seg(capped)}>Set a limit</button>
              </div>
              {capped && (
                <input value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" className={`${field} mt-2`} placeholder={`At least ${Math.max(2, t.players)}`} />
              )}
            </div>
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Access</span>
              <div className="flex rounded-full bg-foreground/[0.06] p-1">
                <button type="button" onClick={() => setVisibility("public")} className={seg(visibility === "public")}>Public</button>
                <button type="button" onClick={() => setVisibility("private")} className={seg(visibility === "private")}>Private (link only)</button>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Who can enter</span>
              <div className="flex rounded-full bg-foreground/[0.06] p-1">
                <button type="button" onClick={() => setEligibility("everyone")} className={seg(eligibility === "everyone")}>Everyone</button>
                <button type="button" onClick={() => setEligibility("subscribers")} className={seg(eligibility === "subscribers")}>Premium only</button>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl bg-foreground/[0.04] p-3">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Prize and game are locked.</span> {prizeSummary}. {ZERO_GAMES[t.game_type].name} — players joined on these terms{t.reward_type === "funds" || t.reward_type === "zp" ? " and the prize is already held" : ""}.
              </div>
            </div>
            <button onClick={() => void save()} disabled={saving || title.trim().length < 3} className="flex h-12 w-full items-center justify-center rounded-full text-[15px] font-bold text-white disabled:opacity-50" style={{ background: "#cc208f" }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
    </div>
  );
}

function StatusChip({ status }: { status: "upcoming" | "live" | "ended" }) {
  const map = {
    live: { label: "Live now", cls: "bg-[#e0245e] text-white" },
    upcoming: { label: "Upcoming", cls: "bg-white/15 text-white" },
    ended: { label: "Ended", cls: "bg-white/10 text-white/70" },
  }[status];
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold uppercase tracking-wide ${map.cls}`}>
      {status === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {status === "upcoming" && <Clock3 className="h-3 w-3" />}
      {map.label}
    </span>
  );
}

function Fact({ Icon, label, value, sub }: { Icon: typeof Users; label: string; value: string; sub: string }) {
  return (
    <div className="bg-card p-4">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold">{value}</p>
      <p className="truncate text-[12px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" />
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#cc208f]/10 text-[14px] font-bold text-[#cc208f]">{(name || "?").charAt(0).toUpperCase()}</span>
  );
}
