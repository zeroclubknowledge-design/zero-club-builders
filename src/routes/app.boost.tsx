import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowUpRight, BarChart3, CalendarDays, Check, Coins, Eye, Heart, LayoutGrid, Loader2,
  Pause, Play, Rocket, Sparkles, UserPlus, Users, Wallet, Zap,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useGoBack } from "@/hooks/useGoBack";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { toPlainText } from "@/lib/contentPreview";
import { SponsoredPostCard } from "@/features/boost/SponsoredPostCard";
import {
  BOOST_LAUNCH_XP, BOOST_REWARD_XP, BOOST_REWARD_ZP, GOALS, boostQuote, createBoost, getMyBoosts, pauseBoost, stopBoost,
  type BoostGoal, type BoostPayment, type MyBoost,
} from "@/features/boost/api";

export const Route = createFileRoute("/app/boost")({
  validateSearch: (search: Record<string, unknown>) => ({
    post: typeof search.post === "string" ? search.post : undefined,
    tab: search.tab === "mine" ? ("mine" as const) : undefined,
  }),
  component: BoostPage,
});

const BUDGETS = [1000, 2500, 5000, 10000, 25000];
const DAYS = [1, 3, 7, 14, 30];
const GOAL_ICONS: Record<BoostGoal, typeof Heart> = { engage: Heart, follow: UserPlus, visit: ArrowUpRight };

function BoostPage() {
  const { post: postParam, tab: tabParam } = Route.useSearch();
  const goBack = useGoBack("/app");
  const { data: me } = useUser();
  const [tab, setTab] = useState<"new" | "mine">(tabParam === "mine" ? "mine" : "new");

  const myBoosts = useQuery({ queryKey: ["my-boosts", me?.id], enabled: Boolean(me?.id), queryFn: getMyBoosts });
  const running = (myBoosts.data || []).filter((b) => !b.settled_at && (b.status === "active" || b.status === "paused")).length;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-canvas md:relative md:inset-auto md:z-0 md:min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[1040px] items-center gap-2 px-2 sm:px-4">
          <button onClick={goBack} aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-full tap hover:bg-foreground/[0.05]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Boost</h1>
          <div className="flex rounded-full bg-foreground/[0.05] p-1 text-[13px] font-semibold" role="tablist">
            {(["new", "mine"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`rounded-full px-3.5 py-1.5 transition ${tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {value === "new" ? "New boost" : `My boosts${running ? ` · ${running}` : ""}`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="zc-page-width mx-auto w-full max-w-[1040px] flex-1 px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 md:pb-10">
        {tab === "new"
          ? <NewBoost initialPost={postParam} onLaunched={() => { setTab("mine"); void myBoosts.refetch(); }} />
          : <MyBoosts query={myBoosts} onNew={() => setTab("new")} />}
      </main>
    </div>
  );
}

/* ─────────────────────────── New boost ─────────────────────────── */

function NewBoost({ initialPost, onLaunched }: { initialPost?: string; onLaunched: () => void }) {
  const { data: me } = useUser();
  const queryClient = useQueryClient();
  const { format } = useWalletCurrency();
  const [postId, setPostId] = useState<string | undefined>(initialPost);
  const [picking, setPicking] = useState(!initialPost);
  const [goal, setGoal] = useState<BoostGoal>("engage");
  const [url, setUrl] = useState("");
  const [budget, setBudget] = useState(2500);
  const [custom, setCustom] = useState("");
  const [days, setDays] = useState(7);
  const [feed, setFeed] = useState(true);
  const [clubs, setClubs] = useState(true);
  const [payWith, setPayWith] = useState<BoostPayment>("wallet");
  const [launching, setLaunching] = useState(false);

  const myPosts = useQuery({
    queryKey: ["boost-my-posts", me?.id],
    enabled: Boolean(me?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, content, media_urls, created_at, likes_count, comments_count, is_build_post")
        .eq("author_id", me!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
  });
  const post = (myPosts.data || []).find((p: any) => p.id === postId);
  useEffect(() => { if (initialPost && myPosts.isSuccess && !post) setPicking(true); }, [initialPost, myPosts.isSuccess, post]);

  const amount = custom ? Math.max(0, Math.floor(Number(custom) || 0)) : budget;
  const quote = useMemo(() => boostQuote(amount), [amount]);
  const walletBalance = Number(me?.coins) || 0;
  const zpBalance = Number(me?.zp) || 0;
  const budgetOk = amount >= 500 && amount <= 500000;
  const canAfford = payWith === "wallet" ? walletBalance >= amount : zpBalance >= quote.zpCost;
  const urlOk = goal !== "visit" || /^https?:\/\/\S+\.\S+/i.test(url.trim());
  const ready = Boolean(post) && budgetOk && canAfford && urlOk && (feed || clubs);

  const launch = async () => {
    if (!post || !ready || launching) return;
    setLaunching(true);
    try {
      const result = await createBoost({ postId: post.id, goal, budget: amount, days, paidWith: payWith, targetUrl: goal === "visit" ? url.trim() : null, feed, clubs });
      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      toast.success("Your post is boosted", { description: `It now shows as Sponsored. Up to ${result.max_actions.toLocaleString()} people can earn for supporting it. You earned ${BOOST_LAUNCH_XP} XP.` });
      onLaunched();
    } catch (error: any) {
      toast.error(error?.message || "Could not start this boost");
    } finally {
      setLaunching(false);
    }
  };

  const previewItem = post ? {
    boost_id: "preview",
    goal,
    target_url: url || null,
    reward_zp: BOOST_REWARD_ZP,
    reward_xp: BOOST_REWARD_XP,
    post: { ...post, media_urls: post.media_urls || [] },
    author: { id: me?.id || "", username: me?.username || null, full_name: me?.full_name || null, avatar_url: me?.avatar_url || null },
    viewer: { following: false, liked: false, commented: false, clicked: false },
  } : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="space-y-4">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl bg-[#140a12] p-5 text-white sm:p-6">
          <div aria-hidden className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#cc208f]/40 blur-3xl" />
          <div aria-hidden className="absolute -bottom-28 left-10 h-56 w-56 rounded-full bg-[#7a1e66]/50 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 ring-1 ring-white/15">
              <Rocket className="h-3.5 w-3.5 text-[#ff7ac8]" /> Boost
            </span>
            <h2 className="mt-3 max-w-[520px] font-display text-[26px] font-bold leading-[1.12] tracking-[-0.02em] sm:text-[32px]">
              Put your work in front of the whole club.
            </h2>
            <p className="mt-2 max-w-[520px] text-[14px] leading-relaxed text-white/70">
              Your post shows as <span className="font-semibold text-white">Sponsored</span> in the feed and in clubs. Members who back it earn ZP and XP — so people actually engage, not just scroll past.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { Icon: Eye, title: "Seen more", body: "Shown between posts and in club chats" },
                { Icon: Coins, title: "Members earn", body: `${BOOST_REWARD_ZP} ZP + ${BOOST_REWARD_XP} XP for supporting you` },
                { Icon: Zap, title: "You earn too", body: `+${BOOST_LAUNCH_XP} XP, and unused budget comes back` },
              ].map(({ Icon, title, body }) => (
                <div key={title} className="rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-[#ff7ac8]" />
                  <p className="mt-1.5 text-[13.5px] font-semibold">{title}</p>
                  <p className="text-[12px] leading-snug text-white/60">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 1. Post */}
        <Step n={1} title="Choose a post" action={post && !picking ? <button onClick={() => setPicking(true)} className="text-[13px] font-semibold text-[#cc208f]">Change</button> : null}>
          {picking || !post ? (
            myPosts.isLoading ? (
              <div className="grid h-24 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (myPosts.data || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <p className="text-[14px] font-semibold">You haven't posted yet</p>
                <p className="mt-1 text-[13px] text-muted-foreground">Share something first, then come back to boost it.</p>
                <Link to="/app/compose" className="mt-3 inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">Create a post</Link>
              </div>
            ) : (
              <div className="grid max-h-[340px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {(myPosts.data || []).map((p: any) => {
                  const img = (p.media_urls || []).find((u: string) => u && !/\.(mp4|mov|webm|m4v)|video/i.test(u));
                  const on = p.id === postId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setPostId(p.id); setPicking(false); }}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${on ? "border-[#cc208f] bg-[#cc208f]/[0.05]" : "border-border hover:border-foreground/20"}`}
                    >
                      {img ? <img src={img} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-foreground/[0.05]"><Sparkles className="h-4 w-4 text-muted-foreground" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[13.5px] font-medium leading-snug">{toPlainText(p.content || "") || "Photo post"}</span>
                        <span className="mt-1 block text-[11.5px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString()} · {p.likes_count || 0} likes · {p.comments_count || 0} comments</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <p className="line-clamp-2 rounded-xl bg-foreground/[0.03] px-3 py-2.5 text-[14px] text-foreground/85">{toPlainText(post.content || "") || "Photo post"}</p>
          )}
        </Step>

        {/* 2. Goal */}
        <Step n={2} title="What should people do?">
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(GOALS) as BoostGoal[]).map((value) => {
              const Icon = GOAL_ICONS[value];
              const on = goal === value;
              return (
                <button
                  key={value}
                  onClick={() => setGoal(value)}
                  className={`rounded-xl border p-3.5 text-left transition ${on ? "border-[#cc208f] bg-[#cc208f]/[0.05] shadow-[0_10px_24px_-18px_rgba(204,32,143,0.8)]" : "border-border hover:border-foreground/20"}`}
                >
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? "bg-[#cc208f] text-white" : "bg-foreground/[0.05] text-foreground"}`}><Icon className="h-[18px] w-[18px]" /></span>
                  <span className="mt-2 block text-[14px] font-semibold">{GOALS[value].title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{GOALS[value].detail}</span>
                </button>
              );
            })}
          </div>
          {goal === "visit" && (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Link people should visit</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-site.com"
                inputMode="url"
                className={`h-11 w-full rounded-xl border bg-background px-3.5 text-[15px] outline-none transition focus:border-[#cc208f] ${url && !urlOk ? "border-red-400" : "border-border"}`}
              />
            </label>
          )}
        </Step>

        {/* 3. Budget & time */}
        <Step n={3} title="Budget and duration">
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((value) => (
              <Chip key={value} on={!custom && budget === value} onClick={() => { setCustom(""); setBudget(value); }}>{format(value)}</Chip>
            ))}
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Custom ₦"
              inputMode="numeric"
              className={`h-10 w-[120px] rounded-full border px-4 text-[14px] font-semibold outline-none transition focus:border-[#cc208f] ${custom ? "border-[#cc208f] bg-[#cc208f]/[0.05]" : "border-border bg-background"}`}
            />
          </div>
          {!budgetOk && <p className="mt-2 text-[12.5px] text-red-500">Budgets run from ₦500 to ₦500,000.</p>}
          <p className="mb-2 mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"><CalendarDays className="h-4 w-4" /> Runs for</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((value) => (
              <Chip key={value} on={days === value} onClick={() => setDays(value)}>{value === 1 ? "1 day" : `${value} days`}</Chip>
            ))}
          </div>
        </Step>

        {/* 4. Where */}
        <Step n={4} title="Where it shows">
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle on={feed} onClick={() => setFeed((v) => !v)} Icon={LayoutGrid} title="Home feed" body="Between posts on Discover" />
            <Toggle on={clubs} onClick={() => setClubs((v) => !v)} Icon={Users} title="Clubs" body="Now and then in club Discussions" />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">Sponsored posts appear at intervals, never back to back, and never to you.</p>
        </Step>

        {/* 5. Pay */}
        <Step n={5} title="Pay with">
          <div className="grid gap-2 sm:grid-cols-2">
            <PayOption on={payWith === "wallet"} onClick={() => setPayWith("wallet")} Icon={Wallet} title="Wallet" price={format(amount)} balance={`Balance ${format(walletBalance)}`} short={walletBalance < amount} />
            <PayOption on={payWith === "zp"} onClick={() => setPayWith("zp")} Icon={Coins} title="Zero Points" price={`${quote.zpCost.toLocaleString()} ZP`} balance={`Balance ${zpBalance.toLocaleString()} ZP`} short={zpBalance < quote.zpCost} />
          </div>
          {!canAfford && budgetOk && (
            <p className="mt-2 text-[12.5px] text-red-500">
              Not enough {payWith === "wallet" ? "wallet balance" : "ZP"} for this budget.{" "}
              {payWith === "wallet" && <Link to="/app/wallet/add-money" className="font-semibold underline">Add money</Link>}
            </p>
          )}
        </Step>
      </div>

      {/* Summary + preview */}
      <aside className="space-y-3 lg:sticky lg:top-[72px]">
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Summary</p>
          </div>
          <dl className="space-y-2.5 px-4 py-3.5 text-[13.5px]">
            <Row label="Budget" value={budgetOk ? format(amount) : "—"} strong />
            <Row label="Reach (30%)" value={budgetOk ? format(quote.reach) : "—"} />
            <Row label="Rewards for members (70%)" value={budgetOk ? format(quote.pool) : "—"} />
            <Row label="People who can earn" value={budgetOk ? `Up to ${quote.maxActions.toLocaleString()}` : "—"} />
            <Row label="Each earns" value={`${BOOST_REWARD_ZP} ZP + ${BOOST_REWARD_XP} XP`} />
            <Row label="You earn" value={`+${BOOST_LAUNCH_XP} XP`} />
            <Row label="Runs" value={`${days} ${days === 1 ? "day" : "days"}`} />
          </dl>
          <p className="border-t border-border/60 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            Rewards nobody claims are returned to your {payWith === "wallet" ? "wallet" : "ZP balance"} when the boost ends or you stop it.
          </p>
          <div className="hidden px-4 pb-4 lg:block">
            <LaunchButton ready={ready} launching={launching} onClick={launch} label={payWith === "wallet" ? `Boost for ${format(amount)}` : `Boost for ${quote.zpCost.toLocaleString()} ZP`} />
          </div>
        </section>

        {previewItem && (
          <section>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">How members will see it</p>
            <div className="pointer-events-none">
              <SponsoredPostCard item={previewItem as any} compact preview />
            </div>
          </section>
        )}
      </aside>

      {/* Phones: launch button pinned to the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        <LaunchButton ready={ready} launching={launching} onClick={launch} label={payWith === "wallet" ? `Boost for ${format(amount)}` : `Boost for ${quote.zpCost.toLocaleString()} ZP`} />
      </div>
    </div>
  );
}

function Step({ n, title, action, children }: { n: number; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-[12px] font-bold text-background">{n}</span>
        <h3 className="flex-1 text-[15.5px] font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`h-10 rounded-full border px-4 text-[14px] font-semibold transition active:scale-95 ${on ? "border-[#cc208f] bg-[#cc208f] text-white" : "border-border bg-background hover:border-foreground/25"}`}>
      {children}
    </button>
  );
}

function Toggle({ on, onClick, Icon, title, body }: { on: boolean; onClick: () => void; Icon: typeof Users; title: string; body: string }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${on ? "border-[#cc208f] bg-[#cc208f]/[0.05]" : "border-border"}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? "bg-[#cc208f] text-white" : "bg-foreground/[0.05]"}`}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{body}</span>
      </span>
      <span className={`grid h-5 w-5 place-items-center rounded-full border ${on ? "border-[#cc208f] bg-[#cc208f] text-white" : "border-border"}`}>{on && <Check className="h-3 w-3" />}</span>
    </button>
  );
}

function PayOption({ on, onClick, Icon, title, price, balance, short }: { on: boolean; onClick: () => void; Icon: typeof Wallet; title: string; price: string; balance: string; short: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${on ? "border-[#cc208f] bg-[#cc208f]/[0.05]" : "border-border"}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? "bg-[#cc208f] text-white" : "bg-foreground/[0.05]"}`}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className={`block text-[12px] ${short ? "text-red-500" : "text-muted-foreground"}`}>{balance}</span>
      </span>
      <span className="text-[14px] font-bold tabular-nums">{price}</span>
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-[15px] font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function LaunchButton({ ready, launching, onClick, label }: { ready: boolean; launching: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={!ready || launching}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#cc208f] to-[#e0458f] text-[15px] font-bold text-white shadow-[0_14px_30px_-14px_rgba(204,32,143,0.9)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
    >
      {launching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
      {label}
    </button>
  );
}

/* ─────────────────────────── My boosts ─────────────────────────── */

function MyBoosts({ query, onNew }: { query: { data?: MyBoost[]; isLoading: boolean; refetch: () => unknown }; onNew: () => void }) {
  const { format } = useWalletCurrency();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const boosts = query.data || [];

  const act = async (id: string, run: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await run();
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      await query.refetch();
    } catch (error: any) {
      toast.error(error?.message || "That didn't work");
    } finally {
      setBusyId(null);
    }
  };

  if (query.isLoading) return <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!boosts.length) {
    return (
      <div className="mx-auto max-w-[460px] rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><Rocket className="h-7 w-7" /></span>
        <h2 className="mt-4 font-display text-[20px] font-semibold">No boosts yet</h2>
        <p className="mt-1.5 text-[14px] text-muted-foreground">Boost a post to reach the whole club and reward people who back your work.</p>
        <button onClick={onNew} className="mt-5 h-11 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">Boost a post</button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {boosts.map((b) => {
        const live = !b.settled_at && b.status === "active";
        const paused = !b.settled_at && b.status === "paused";
        const progress = Math.min(100, Math.round((b.actions_count / Math.max(1, b.max_actions)) * 100));
        const daysLeft = Math.max(0, Math.ceil((new Date(b.ends_at).getTime() - Date.now()) / 86400000));
        const statusLabel = live ? "Running" : paused ? "Paused" : b.status === "removed" ? "Removed by Zero Club" : b.status === "stopped" ? "Stopped" : "Finished";
        const img = (b.post?.media_urls || []).find((u) => u && !/\.(mp4|mov|webm|m4v)|video/i.test(u));
        return (
          <article key={b.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-start gap-3 p-4">
              {img ? <img src={img} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-foreground/[0.05]"><Sparkles className="h-5 w-5 text-muted-foreground" /></span>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live ? "bg-emerald-500/15 text-emerald-600" : paused ? "bg-amber-500/15 text-amber-600" : "bg-foreground/[0.06] text-muted-foreground"}`}>{statusLabel}</span>
                  <span className="text-[12px] text-muted-foreground">{GOALS[b.goal].title}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[14px] font-medium leading-snug">{toPlainText(b.post?.content || "") || "Photo post"}</p>
              </div>
            </div>

            <div className="px-4">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-semibold">{b.actions_count.toLocaleString()} of {b.max_actions.toLocaleString()} rewarded</span>
                <span className="text-muted-foreground">{live || paused ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : new Date(b.ends_at).toLocaleDateString()}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#cc208f] to-[#ff7ac8]" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 border-y border-border/60 text-center">
              <Stat Icon={Eye} label="Views" value={b.impressions} />
              <Stat Icon={BarChart3} label={b.goal === "visit" ? "Link clicks" : "Clicks"} value={b.clicks} />
              <Stat Icon={Users} label="Supporters" value={b.actions_count} />
            </div>

            <div className="flex flex-wrap items-center gap-2 p-3">
              <span className="mr-auto px-1 text-[12px] text-muted-foreground">
                {b.paid_with === "wallet" ? format(b.budget_naira) : `${(b.budget_naira * 10).toLocaleString()} ZP`}
                {b.settled_at && b.refunded_naira > 0 ? ` · ${b.paid_with === "wallet" ? format(b.refunded_naira) : `${(b.refunded_naira * 10).toLocaleString()} ZP`} returned` : ""}
              </span>
              <Link to="/app/post/$id" params={{ id: b.post_id }} className="h-9 rounded-full border border-border px-3 text-[12.5px] font-semibold leading-9">View post</Link>
              {(live || paused) && (
                <>
                  <button disabled={busyId === b.id} onClick={() => void act(b.id, () => pauseBoost(b.id, live), live ? "Boost paused" : "Boost resumed")} className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12.5px] font-semibold disabled:opacity-50">
                    {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{live ? "Pause" : "Resume"}
                  </button>
                  <button
                    disabled={busyId === b.id}
                    onClick={() => { if (confirm("Stop this boost? Unclaimed rewards will be returned to you.")) void act(b.id, () => stopBoost(b.id), "Boost stopped. Unused budget returned."); }}
                    className="h-9 rounded-full bg-foreground px-3 text-[12.5px] font-semibold text-background disabled:opacity-50"
                  >
                    Stop
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Stat({ Icon, label, value }: { Icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="py-2.5">
      <Icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
      <p className="mt-1 text-[15px] font-bold tabular-nums">{Number(value || 0).toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
