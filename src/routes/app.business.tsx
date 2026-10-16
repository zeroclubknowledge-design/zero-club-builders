import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Camera,
  Check,
  Clock,
  ExternalLink,
  Gamepad2,
  Gift,
  GraduationCap,
  Loader2,
  MessageCircle,
  Megaphone,
  Plus,
  Rocket,
  Search,
  ShieldCheck,
  Trophy,
  UserPlus,
  Users,
  X,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { uploadFile } from "@/lib/storage";
import { INTEREST_OPTIONS } from "@/lib/modes";
import {
  BUSINESS_GOALS,
  BUSINESS_INDUSTRIES,
  BUSINESS_MODES,
  BUSINESS_SIZES,
  businessModeOf,
  externalHref,
  isBusiness,
  prettyUrl,
  saveBusinessProfile,
  type BusinessProfile,
} from "@/lib/business";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { CardSelect } from "@/components/CardSelect";
import { InstitutionOnboardingDrawer } from "@/components/InstitutionOnboardingDrawer";

type Tab = "overview" | "hiring" | "talent" | "sponsor" | "team" | "page";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hiring", label: "Hiring" },
  { id: "talent", label: "Talent" },
  { id: "sponsor", label: "Sponsor & reach" },
  { id: "team", label: "Team training" },
  { id: "page", label: "Company page" },
];

export const Route = createFileRoute("/app/business")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab; apply?: number } => ({
    tab: TABS.some((t) => t.id === search.tab) ? (search.tab as Tab) : undefined,
    apply: Number(search.apply) === 1 ? 1 : undefined,
  }),
  component: BusinessHub,
  head: () => ({ meta: [{ title: "Business Hub — Zero Club" }] }),
});

type Workspace = {
  profile: { id: string; username: string; full_name: string; avatar_url: string | null; banner_url: string | null; business_mode: string };
  business: BusinessProfile | null;
  hub: { status: string; institution_name: string; review_note: string | null; trial_ends_at: string | null; active_until: string | null } | null;
  stats: Record<string, number>;
};

function BusinessHub() {
  const { data: me, isLoading } = useUser();
  const navigate = useNavigate();
  const { tab = "overview", apply } = Route.useSearch();
  const [hubOpen, setHubOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && me && !isBusiness(me)) navigate({ to: "/business" as never, replace: true });
  }, [me, isLoading, navigate]);
  useEffect(() => {
    if (apply === 1) setHubOpen(true);
  }, [apply]);

  const ws = useQuery({
    queryKey: ["business-workspace", me?.id],
    enabled: Boolean(me?.id) && isBusiness(me),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_business_workspace" as never);
      if (error) throw error;
      return data as unknown as Workspace;
    },
  });

  const setTab = (next: Tab) => navigate({ to: "/app/business", search: { tab: next } as never, replace: true });

  if (isLoading || !me || !isBusiness(me)) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const mode = businessModeOf(me)!;
  const business = ws.data?.business;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="relative">
        <div className="h-28 w-full overflow-hidden bg-[linear-gradient(135deg,#2a0b20,#0d0a10)] sm:h-36">
          {me.banner_url && <img src={me.banner_url} alt="" className="h-full w-full object-cover opacity-90" />}
        </div>
        <div className="mx-auto max-w-[1080px] px-4 sm:px-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-2xl bg-card ring-4 ring-background">
              {me.avatar_url ? <img src={me.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-accent/10 font-display text-[28px] font-semibold text-accent">{(me.full_name || me.username || "O").charAt(0).toUpperCase()}</div>}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="flex items-center gap-1.5 truncate font-display text-[22px] font-semibold tracking-tight">{me.full_name || me.username}</h1>
              <p className="truncate text-[13px] text-muted-foreground">
                @{me.username} · {BUSINESS_MODES[mode].label} mode{business?.industry ? ` · ${business.industry}` : ""}
              </p>
            </div>
            <div className="flex w-full items-center gap-2 pb-1 sm:w-auto">
              <ModeSwitcher profile={me} className="w-full min-w-[230px] sm:w-[260px]" />
              <Link to="/app/profile/$id" params={{ id: me.username || me.id }} className="hidden h-10 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-[13px] font-semibold hover:bg-foreground/[0.04] sm:inline-flex">
                View page <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="no-scrollbar -mx-4 mt-5 flex gap-1.5 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative shrink-0 px-3 pb-3 pt-1 text-[14px] font-semibold transition ${tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
                {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-[#cc208f]" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 pt-6 sm:px-6">
        {ws.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-foreground/[0.05]" />)}</div>
        ) : ws.error ? (
          <p className="rounded-2xl border border-border p-6 text-center text-[14px] text-muted-foreground">Couldn't load your Business Hub. Pull to refresh or try again.</p>
        ) : tab === "overview" ? (
          <Overview ws={ws.data!} onApply={() => setHubOpen(true)} onTab={setTab} />
        ) : tab === "hiring" ? (
          <Hiring orgId={me.id} />
        ) : tab === "talent" ? (
          <Talent />
        ) : tab === "sponsor" ? (
          <Sponsor orgId={me.id} />
        ) : tab === "team" ? (
          <Team />
        ) : (
          <CompanyPage me={me} business={business || null} />
        )}
      </div>

      <InstitutionOnboardingDrawer
        open={hubOpen}
        onOpenChange={(open) => {
          setHubOpen(open);
          if (!open && apply) navigate({ to: "/app/business", search: { tab } as never, replace: true });
        }}
        profile={me}
        onActivated={() => {
          setHubOpen(false);
          void ws.refetch();
        }}
      />
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────── */

function Overview({ ws, onApply, onTab }: { ws: Workspace; onApply: () => void; onTab: (t: Tab) => void }) {
  const s = ws.stats || {};
  const goals = ws.business?.goals || [];
  const allGoals = [...BUSINESS_GOALS.company, ...BUSINESS_GOALS.institutional];
  return (
    <div className="space-y-6">
      <HubStatus hub={ws.hub} mode={ws.profile.business_mode} onApply={onApply} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open roles" value={s.open_roles} hint={`${s.roles_total || 0} posted in total`} onClick={() => onTab("hiring")} />
        <Stat label="Applicants" value={s.applicants} hint={`${s.hired || 0} hired`} onClick={() => onTab("hiring")} />
        <Stat label="Team members" value={s.team} hint={s.invites ? `${s.invites} invite${s.invites === 1 ? "" : "s"} pending` : "Invite your staff"} onClick={() => onTab("team")} />
        <Stat label="Challenges sponsored" value={s.challenges} hint={`${s.posts || 0} posts on your page`} onClick={() => onTab("sponsor")} />
      </div>

      {goals.length > 0 && (
        <div>
          <h2 className="text-[15px] font-semibold">Your priorities</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {goals.map((g) => (
              <span key={g} className="rounded-full bg-[#cc208f]/10 px-3 py-1 text-[12.5px] font-semibold text-[#cc208f]">{allGoals.find((x) => x.key === g)?.label || g}</span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[15px] font-semibold">Get started</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Action to="/app/quests" search={{ post: 1 }} Icon={BriefcaseBusiness} title="Post a role or gig" body="Builders apply with their proof of work. Pay safely through escrow." />
          <Action onClick={() => onTab("talent")} Icon={Search} title="Find talent" body="Search builders by what they do and message them directly." />
          <Action to="/app/challenge/new" Icon={Trophy} title="Sponsor a challenge" body="Set a brief and prizes; the best submissions win." />
          <Action onClick={() => onTab("team")} Icon={GraduationCap} title="Train your team" body="Invite staff and assign bootcamps that fit their roles." />
          <Action to="/app/compose" Icon={Megaphone} title="Post an update" body="Share news, launches and openings with your followers." />
          <Action onClick={() => onTab("page")} Icon={Building2} title="Polish your page" body="Logo, story, industry and links people see first." />
        </div>
      </div>
    </div>
  );
}

function HubStatus({ hub, mode, onApply }: { hub: Workspace["hub"]; mode: string; onApply: () => void }) {
  if (mode === "institutional") {
    return (
      <Banner tone="ok" Icon={BadgeCheck} title="You're in Institutional mode" body="Your Digital Hub runs bootcamps, tutors and cohorts.">
        <Link to="/app/institution-studio" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">Open Digital Hub <ArrowRight className="h-3.5 w-3.5" /></Link>
      </Banner>
    );
  }
  if (!hub) {
    return (
      <Banner tone="info" Icon={Building2} title="Are you a tech hub too?" body="Apply for a Digital Hub to switch to Institutional mode and run bootcamps, tutors and cohorts. Zero Club reviews every hub.">
        <button type="button" onClick={onApply} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">Apply for a Digital Hub</button>
      </Banner>
    );
  }
  if (hub.status === "pending_review") {
    return (
      <Banner tone="wait" Icon={Clock} title="Your Digital Hub is being reviewed" body={`We're checking ${hub.institution_name}. You'll get a notification when it's approved — then switch to Institutional at the top.`}>
        <button type="button" onClick={onApply} className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] font-semibold">Edit application</button>
      </Banner>
    );
  }
  if (hub.status === "rejected") {
    return (
      <Banner tone="warn" Icon={ShieldCheck} title="Your Digital Hub wasn't approved" body={hub.review_note || "Update your details and send it again."}>
        <button type="button" onClick={onApply} className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">Update and resubmit</button>
      </Banner>
    );
  }
  return (
    <Banner tone="ok" Icon={BadgeCheck} title="Your Digital Hub is approved" body="Switch to Institutional at the top whenever you want to run programmes.">
      <span className="text-[12.5px] font-semibold text-emerald-600">Ready</span>
    </Banner>
  );
}

function Banner({ tone, Icon, title, body, children }: { tone: "ok" | "info" | "wait" | "warn"; Icon: any; title: string; body: string; children?: React.ReactNode }) {
  const ring = tone === "ok" ? "ring-emerald-500/25 bg-emerald-500/[0.06]" : tone === "wait" ? "ring-amber-500/25 bg-amber-500/[0.06]" : tone === "warn" ? "ring-rose-500/25 bg-rose-500/[0.06]" : "ring-[#cc208f]/25 bg-[#cc208f]/[0.05]";
  const ic = tone === "ok" ? "text-emerald-600" : tone === "wait" ? "text-amber-600" : tone === "warn" ? "text-rose-600" : "text-[#cc208f]";
  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-4 ring-1 sm:flex-row sm:items-center ${ring}`}>
      <Icon className={`h-6 w-6 shrink-0 ${ic}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, onClick }: { label: string; value?: number; hint?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-[#cc208f]/35">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-[26px] font-semibold tabular-nums">{Number(value || 0).toLocaleString()}</p>
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hint}</p>}
    </button>
  );
}

function Action({ to, search, onClick, Icon, title, body }: { to?: string; search?: Record<string, unknown>; onClick?: () => void; Icon: any; title: string; body: string }) {
  const inner = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]"><Icon className="h-5 w-5" /></span>
      <span className="mt-3 block text-[14.5px] font-semibold">{title}</span>
      <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">{body}</span>
    </>
  );
  const cls = "block rounded-2xl border border-border bg-card p-4 text-left transition hover:border-[#cc208f]/35 hover:shadow-sm";
  return to ? <Link to={to as never} search={search as never} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

/* ── Hiring ───────────────────────────────────────────────────────────── */

function Hiring({ orgId }: { orgId: string }) {
  const gigs = useQuery({
    queryKey: ["business-gigs", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gigs")
        .select("id, title, status, category, applications_count, budget_type, budget_min, budget_max, deadline, created_at, hired_profile_id")
        .eq("client_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  return (
    <div>
      <SectionHead title="Roles and gigs" body="Everything you've posted. Applicants come with their proof of work.">
        <Link to={"/app/quests" as never} search={{ post: 1 } as never} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#cc208f] px-4 text-[13.5px] font-semibold text-white"><Plus className="h-4 w-4" /> Post a role</Link>
      </SectionHead>
      {gigs.isLoading ? (
        <Skeleton />
      ) : !gigs.data?.length ? (
        <Empty Icon={BriefcaseBusiness} title="No roles yet" body="Post a job or a paid gig. Builders on Zero Club apply with what they've shipped." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {gigs.data.map((g: any) => (
            <Link key={g.id} to={"/app/quests" as never} search={{ gig: g.id } as never} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-foreground/[0.03]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">{g.title}</p>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {g.category || "Role"} · {g.applications_count || 0} applicant{g.applications_count === 1 ? "" : "s"}
                  {g.deadline ? ` · closes ${new Date(g.deadline).toLocaleDateString([], { day: "numeric", month: "short" })}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize ${g.status === "open" ? "bg-emerald-500/10 text-emerald-600" : "bg-foreground/[0.06] text-muted-foreground"}`}>{String(g.status || "").replace(/_/g, " ")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Talent ───────────────────────────────────────────────────────────── */

function useTalent(query: string, interest: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(t);
  }, [query]);
  return useQuery({
    queryKey: ["business-talent", debounced, interest],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_business_talent" as never, { p_query: debounced, p_interest: interest || null, p_limit: 30 } as never);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 30_000,
  });
}

function Talent() {
  const [query, setQuery] = useState("");
  const [interest, setInterest] = useState("");
  const talent = useTalent(query, interest);
  const invite = useInvite();
  return (
    <div>
      <SectionHead title="Find builders" body="Ranked by the work they've done on Zero Club. Message them, or invite them to your team." />
      <label className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-card px-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, skill, location…" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear"><X className="h-4 w-4 text-muted-foreground" /></button>}
      </label>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {["", ...INTEREST_OPTIONS].map((i) => (
          <button key={i || "all"} type="button" onClick={() => setInterest(i)} className={`h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold transition ${interest === i ? "bg-foreground text-background" : "bg-foreground/[0.05] text-muted-foreground hover:text-foreground"}`}>
            {i || "All"}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {talent.isLoading ? (
          <Skeleton />
        ) : !talent.data?.length ? (
          <Empty Icon={Users} title="No one matches yet" body="Try a broader search or another skill." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {talent.data.map((p) => (
              <PersonCard key={p.id} person={p}>
                <Link to="/app/chat/$id" params={{ id: p.id }} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border text-[13px] font-semibold hover:bg-foreground/[0.04]"><MessageCircle className="h-4 w-4" /> Message</Link>
                <button type="button" disabled={invite.isPending} onClick={() => invite.mutate(p.id)} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground text-[13px] font-semibold text-background disabled:opacity-60"><UserPlus className="h-4 w-4" /> Invite to team</button>
              </PersonCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonCard({ person, children }: { person: any; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Link to="/app/profile/$id" params={{ id: person.username || person.id }} className="flex items-start gap-3">
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">
          {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center font-semibold text-muted-foreground">{(person.full_name || person.username || "?").charAt(0).toUpperCase()}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">{person.full_name || person.username}</span>
          <span className="block truncate text-[12.5px] text-muted-foreground">@{person.username}{person.location ? ` · ${person.location}` : ""}</span>
          {person.bio && <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-foreground/80">{person.bio}</span>}
        </span>
        <span className="shrink-0 rounded-full bg-[#cc208f]/10 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-[#cc208f]">{Number(person.xp || 0).toLocaleString()} XP</span>
      </Link>
      {Array.isArray(person.interests) && person.interests.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {person.interests.slice(0, 4).map((i: string) => <span key={i} className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[11.5px] text-muted-foreground">{i}</span>)}
        </div>
      )}
      {children && <div className="mt-3 flex gap-2">{children}</div>}
    </div>
  );
}

function useInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc("invite_team_member" as never, { p_member: memberId, p_title: null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invite sent", { description: "They'll see it in their notifications." });
      void queryClient.invalidateQueries({ queryKey: ["business-team"] });
      void queryClient.invalidateQueries({ queryKey: ["business-workspace"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not send the invite"),
  });
}

/* ── Sponsor & reach ──────────────────────────────────────────────────── */

function Sponsor({ orgId }: { orgId: string }) {
  const challenges = useQuery({
    queryKey: ["business-challenges", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("challenges").select("id, title, status, prize_total, deadline, created_at").eq("owner_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  return (
    <div className="space-y-6">
      <SectionHead title="Sponsor & reach" body="Put your brand where learners already spend their time — and reward the best work." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Action to="/app/challenge/new" Icon={Trophy} title="Sponsor a challenge" body="A real brief from your company, with prizes for the winners." />
        <Action to="/app/games/create" Icon={Gamepad2} title="Host a Zero Game" body="A branded, rewarded competition people play live." />
        <Action to="/app/boost" Icon={Rocket} title="Boost a post" body="Reach more people with your launches and openings." />
        <Action to="/app/clubs" Icon={Gift} title="Club giveaways" body="Back a club and reward its most active members." />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold">Your challenges</h3>
        <div className="mt-3">
          {challenges.isLoading ? (
            <Skeleton />
          ) : !challenges.data?.length ? (
            <Empty Icon={Trophy} title="No sponsored challenges yet" body="Challenges show your company to builders through real work, not ads." />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {challenges.data.map((c: any) => (
                <Link key={c.id} to="/app/challenge/$id" params={{ id: c.id }} className="flex items-center gap-3 px-4 py-3.5 hover:bg-foreground/[0.03]">
                  <Trophy className="h-5 w-5 shrink-0 text-[#cc208f]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold">{c.title}</p>
                    <p className="text-[12.5px] text-muted-foreground">{c.deadline ? `Deadline ${new Date(c.deadline).toLocaleDateString([], { day: "numeric", month: "short" })}` : "No deadline"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11.5px] font-semibold capitalize text-muted-foreground">{String(c.status || "").replace(/_/g, " ")}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Team training ────────────────────────────────────────────────────── */

function Team() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const talent = useTalent(query, "");
  const invite = useInvite();
  const team = useQuery({
    queryKey: ["business-team"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_business_team" as never);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const bootcamps = useQuery({
    queryKey: ["business-bootcamps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bootcamps").select("id, title, starts_at").eq("visibility", true).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["business-team"] });
    void queryClient.invalidateQueries({ queryKey: ["business-workspace"] });
  };
  const assign = useMutation({
    mutationFn: async ({ member, bootcamp }: { member: string; bootcamp: string }) => {
      const { error } = await supabase.rpc("assign_team_training" as never, { p_member: member, p_bootcamp: bootcamp, p_note: null } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bootcamp assigned"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Could not assign"),
  });
  const unassign = useMutation({
    mutationFn: async ({ member, bootcamp }: { member: string; bootcamp: string }) => {
      const { error } = await supabase.rpc("unassign_team_training" as never, { p_member: member, p_bootcamp: bootcamp } as never);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (member: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("leave_or_remove_team_member" as never, { p_org: auth.user?.id, p_member: member } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed from your team"); refresh(); },
  });

  const memberIds = useMemo(() => new Set((team.data || []).map((m) => m.member_id)), [team.data]);

  return (
    <div className="space-y-6">
      <SectionHead title="Team training" body="Invite your staff, then assign bootcamps that fit their roles. They accept from their own Zero Club account." />

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[13.5px] font-semibold">Invite people</p>
        <label className="mt-2 flex h-11 items-center gap-2 rounded-xl bg-foreground/[0.04] px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or @username" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </label>
        {query.trim().length >= 2 && (
          <div className="mt-2 max-h-72 divide-y divide-border overflow-y-auto">
            {(talent.data || []).slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">{p.avatar_url && <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{p.full_name || p.username}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">@{p.username}</span>
                </span>
                {memberIds.has(p.id) ? (
                  <span className="text-[12px] font-semibold text-muted-foreground">On your team</span>
                ) : (
                  <button type="button" disabled={invite.isPending} onClick={() => invite.mutate(p.id)} className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-[12.5px] font-semibold text-background disabled:opacity-60"><UserPlus className="h-3.5 w-3.5" /> Invite</button>
                )}
              </div>
            ))}
            {talent.isLoading && <Loader2 className="mx-auto my-3 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        )}
      </div>

      {team.isLoading ? (
        <Skeleton />
      ) : !team.data?.length ? (
        <Empty Icon={GraduationCap} title="No one on your team yet" body="Invite your staff above. Once they accept, you can assign bootcamps to them." />
      ) : (
        <div className="space-y-3">
          {team.data.map((m) => (
            <div key={m.member_id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Link to="/app/profile/$id" params={{ id: m.username || m.member_id }} className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">{m.avatar_url && <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />}</Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{m.full_name || m.username}</p>
                  <p className="truncate text-[12.5px] text-muted-foreground">@{m.username}{m.title ? ` · ${m.title}` : ""}</p>
                </div>
                {m.status === "invited" ? (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-amber-600">Invite pending</span>
                ) : (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-600">Active</span>
                )}
                <button type="button" onClick={() => { if (confirm(`Remove ${m.full_name || m.username} from your team?`)) remove.mutate(m.member_id); }} aria-label="Remove" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-rose-600"><X className="h-4 w-4" /></button>
              </div>

              {m.status === "active" && (
                <div className="mt-3 border-t border-border pt-3">
                  {(m.training || []).length > 0 && (
                    <div className="mb-3 space-y-2">
                      {m.training.map((t: any) => (
                        <div key={t.bootcamp_id} className="flex items-center gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2">
                          <GraduationCap className="h-4 w-4 shrink-0 text-[#cc208f]" />
                          <Link to="/app/bootcamps/$id" params={{ id: t.bootcamp_id }} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold hover:underline">{t.title}</Link>
                          <TrainingStatus t={t} />
                          <button type="button" onClick={() => unassign.mutate({ member: m.member_id, bootcamp: t.bootcamp_id })} aria-label="Unassign" className="text-muted-foreground hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <CardSelect
                    value=""
                    label={`Assign a bootcamp to ${m.full_name || m.username}`}
                    onChange={(e) => e.target.value && assign.mutate({ member: m.member_id, bootcamp: e.target.value })}
                    className="h-10 w-full rounded-xl border border-dashed border-border bg-background px-3 text-[13px] font-semibold text-muted-foreground"
                  >
                    <option value="">+ Assign a bootcamp</option>
                    {(bootcamps.data || []).filter((b: any) => !(m.training || []).some((t: any) => t.bootcamp_id === b.id)).map((b: any) => (
                      <option key={b.id} value={b.id}>{b.title}</option>
                    ))}
                  </CardSelect>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingStatus({ t }: { t: any }) {
  const now = Date.now();
  const start = t.starts_at ? new Date(t.starts_at).getTime() : null;
  const end = t.ends_at ? new Date(t.ends_at).getTime() : null;
  if (!t.enrolled_at) return <span className="shrink-0 text-[11.5px] font-semibold text-amber-600">Not enrolled yet</span>;
  if (end && now > end) return <span className="shrink-0 text-[11.5px] font-semibold text-emerald-600">Finished</span>;
  if (start && now >= start) return <span className="shrink-0 text-[11.5px] font-semibold text-[#cc208f]">In progress</span>;
  return <span className="shrink-0 text-[11.5px] font-semibold text-muted-foreground">Enrolled</span>;
}

/* ── Company page ─────────────────────────────────────────────────────── */

function CompanyPage({ me, business }: { me: any; business: BusinessProfile | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => ({
    org_name: business?.org_name || me.full_name || "",
    tagline: business?.tagline || "",
    about: business?.about || "",
    industry: business?.industry || "",
    size: business?.size || "",
    website: business?.website || "",
    country: business?.country || "",
    city: business?.city || "",
    founded_year: business?.founded_year ? String(business.founded_year) : "",
    contact_email: business?.contact_email || "",
    contact_phone: business?.contact_phone || "",
    hiring: Boolean(business?.hiring),
  }));
  const [logo, setLogo] = useState<string>(me.avatar_url || "");
  const [banner, setBanner] = useState<string>(me.banner_url || "");
  const [busy, setBusy] = useState<"" | "logo" | "banner" | "save">("");
  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (file: File | undefined, kind: "logo" | "banner") => {
    if (!file) return;
    setBusy(kind);
    try {
      const ext = file.name.split(".").pop() || "png";
      const url = await uploadFile("profiles", file, `${me.id}/${kind === "logo" ? "avatar" : "banner"}-${me.id}-${Date.now()}.${ext}`);
      if (kind === "logo") setLogo(url);
      else setBanner(url);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    if (!form.org_name.trim()) return toast.error("Your organization needs a name.");
    if (form.founded_year && !/^\d{4}$/.test(form.founded_year)) return toast.error("Founded year should look like 2019.");
    setBusy("save");
    try {
      await saveBusinessProfile({ ...form, founded_year: form.founded_year || null, logo_url: logo, banner_url: banner });
      toast.success("Company page saved");
      void queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      void queryClient.invalidateQueries({ queryKey: ["business-workspace"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setBusy("");
    }
  };

  const field = "h-11 w-full rounded-xl border border-border bg-background px-3.5 text-[14px] outline-none focus:border-[#cc208f]/50";
  const label = "mb-1.5 block text-[12.5px] font-semibold text-muted-foreground";

  return (
    <div className="space-y-5">
      <SectionHead title="Company page" body="What people see on your profile, in search and on every role you post.">
        <Link to="/app/profile/$id" params={{ id: me.username || me.id }} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-[13px] font-semibold">Preview <ExternalLink className="h-3.5 w-3.5" /></Link>
      </SectionHead>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <label className="relative block h-32 cursor-pointer bg-[linear-gradient(135deg,#2a0b20,#0d0a10)]">
          {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white">{busy === "banner" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Cover</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(e.target.files?.[0], "banner"); e.target.value = ""; }} />
        </label>
        <div className="flex items-end gap-3 px-4 pb-4">
          <label className="relative -mt-8 h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-foreground/[0.06] ring-4 ring-card">
            {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <Camera className="m-auto mt-5 h-5 w-5 text-muted-foreground" />}
            {busy === "logo" && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="h-4 w-4 animate-spin text-white" /></span>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(e.target.files?.[0], "logo"); e.target.value = ""; }} />
          </label>
          <p className="pb-1 text-[12.5px] text-muted-foreground">Tap the logo or cover to change them.</p>
        </div>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={label}>Organization name</label><input value={form.org_name} onChange={(e) => set("org_name", e.target.value)} className={field} /></div>
        <div className="sm:col-span-2"><label className={label}>One-line description</label><input value={form.tagline} onChange={(e) => set("tagline", e.target.value.slice(0, 160))} className={field} /></div>
        <div className="sm:col-span-2"><label className={label}>About</label><textarea rows={5} value={form.about} onChange={(e) => set("about", e.target.value.slice(0, 3000))} className={`${field} h-auto resize-none py-2.5`} placeholder="What you do, who you serve, what it's like to work with you." /></div>
        <div>
          <label className={label}>Industry</label>
          <CardSelect value={form.industry} onChange={(e) => set("industry", e.target.value)} className={field} label="Industry">
            <option value="">Choose an industry</option>
            {BUSINESS_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </CardSelect>
        </div>
        <div>
          <label className={label}>Team size</label>
          <CardSelect value={form.size} onChange={(e) => set("size", e.target.value)} className={field} label="Team size">
            <option value="">Choose a size</option>
            {BUSINESS_SIZES.map((i) => <option key={i} value={i}>{i}</option>)}
          </CardSelect>
        </div>
        <div><label className={label}>Website</label><input value={form.website} onChange={(e) => set("website", e.target.value)} className={field} inputMode="url" /></div>
        <div><label className={label}>Founded</label><input value={form.founded_year} onChange={(e) => set("founded_year", e.target.value.replace(/\D/g, "").slice(0, 4))} className={field} inputMode="numeric" placeholder="2019" /></div>
        <div><label className={label}>Country</label><input value={form.country} onChange={(e) => set("country", e.target.value)} className={field} /></div>
        <div><label className={label}>City</label><input value={form.city} onChange={(e) => set("city", e.target.value)} className={field} /></div>
        <div><label className={label}>Contact email</label><input value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} className={field} type="email" /></div>
        <div><label className={label}>Contact phone</label><input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} className={field} inputMode="tel" /></div>
        <button type="button" onClick={() => set("hiring", !form.hiring)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left sm:col-span-2 ${form.hiring ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-border"}`}>
          <span>
            <span className="block text-[14px] font-semibold">We're hiring</span>
            <span className="block text-[12.5px] text-muted-foreground">Shows a "Hiring" badge on your page and links to your open roles.</span>
          </span>
          <span className={`grid h-6 w-6 place-items-center rounded-full ${form.hiring ? "bg-emerald-500 text-white" : "ring-1 ring-border"}`}>{form.hiring && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
        </button>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={busy !== ""} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#cc208f] px-6 text-[14px] font-semibold text-white disabled:opacity-60">
          {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save page
        </button>
      </div>
      {business?.website && <p className="text-right text-[12px] text-muted-foreground">Live link: <a href={externalHref(business.website)} target="_blank" rel="noreferrer" className="underline">{prettyUrl(business.website)}</a></p>}
    </div>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────── */

function SectionHead({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[20px] font-semibold tracking-tight">{title}</h2>
        {body && <p className="mt-0.5 max-w-[620px] text-[13.5px] leading-5 text-muted-foreground">{body}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-[15px] font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[420px] text-[13.5px] leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function Skeleton() {
  return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-foreground/[0.05]" />)}</div>;
}
