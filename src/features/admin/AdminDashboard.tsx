import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  Ban,
  BarChart3,
  BellRing,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  FileWarning,
  GraduationCap,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Megaphone,
  MessageSquareText,
  PackageOpen,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Store,
  Trash2,
  Users,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { contentPreview, toPlainText } from "@/lib/contentPreview";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

type AdminTab = "overview" | "analytics" | "people" | "moderation" | "learning" | "quests" | "community" | "marketplace" | "commerce" | "institutions" | "ads" | "system";

type Snapshot = {
  metrics: Record<string, number>;
  users: any[];
  reports: any[];
  bootcamps: any[];
  clubs: any[];
  posts: any[];
  gigs: any[];
  store_items: any[];
  settings: any[];
  audit_logs: any[];
};

const EMPTY_SNAPSHOT: Snapshot = {
  metrics: {}, users: [], reports: [], bootcamps: [], clubs: [], posts: [], gigs: [], store_items: [], settings: [], audit_logs: [],
};

const NAV_ITEMS: { id: AdminTab; label: string; Icon: any }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
  { id: "people", label: "People", Icon: Users },
  { id: "moderation", label: "Moderation", Icon: FileWarning },
  { id: "learning", label: "Learning", Icon: GraduationCap },
  { id: "quests", label: "Quests", Icon: ListChecks },
  { id: "community", label: "Community", Icon: UsersRound },
  { id: "marketplace", label: "Marketplace", Icon: BriefcaseBusiness },
  { id: "commerce", label: "Commerce", Icon: CircleDollarSign },
  { id: "institutions", label: "Institutions", Icon: Building2 },
  { id: "ads", label: "Ads Manager", Icon: Megaphone },
  { id: "system", label: "System", Icon: Settings2 },
];

const ADS_MIGRATION_FILE = "20260730150000_create_zero_club_ads_and_analytics.sql";
const isMissingRpc = (error: any) => error?.code === "PGRST202" || /function .* does not exist|Could not find the function/i.test(error?.message || "");

const compact = (value?: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "-";
const formatTime = (value?: string) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-";

export function AdminDashboard() {
  const queryClient = useQueryClient();
  const { format } = useWalletCurrency();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [userSearch, setUserSearch] = useState("");
  const [userType, setUserType] = useState("All");

  const { data = EMPTY_SNAPSHOT, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-dashboard-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_dashboard_snapshot");
      if (error) throw error;
      return { ...EMPTY_SNAPSHOT, ...(data || {}) } as Snapshot;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, queryError: any) => {
      const missingRpc = queryError?.code === "PGRST202" || queryError?.message?.includes("get_admin_dashboard_snapshot");
      return !missingRpc && failureCount < 2;
    },
  });

  const action = useMutation({
    mutationFn: async ({ fn, args }: { fn: string; args: Record<string, any> }) => {
      const { error } = await supabase.rpc(fn, args);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      const messages: Record<string, string> = {
        admin_set_user_status: "Account status updated",
        admin_set_admin_access: "Admin access updated",
        admin_update_report: "Report updated",
        admin_update_gig_status: "Gig status updated",
        admin_update_bootcamp_status: "Bootcamp status updated",
        admin_delete_bootcamp: "Bootcamp deleted",
        admin_update_platform_setting: "Platform setting updated",
        admin_set_institution_status: "Institution updated",
        admin_create_gig: "Gig published",
        admin_delete_gig: "Gig deleted",
        admin_save_promotion: "Campaign saved",
        admin_set_promotion_status: "Campaign status updated",
        admin_delete_promotion: "Campaign deleted",
        admin_create_xp_quest: "Quest published",
        admin_update_xp_quest: "Quest updated",
        admin_delete_xp_quest: "Quest deleted",
      };
      toast.success(messages[variables.fn] || "Change saved");
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["gig-marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-institutions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-xp-quests"] });
      queryClient.invalidateQueries({ queryKey: ["quests"] });
    },
    onError: (error: any) => toast.error(error.message || "The admin action could not be completed"),
  });

  const analyticsQuery = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_analytics");
      if (error) throw error;
      return data || {};
    },
    enabled: activeTab === "analytics",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const institutionsQuery = useQuery({
    queryKey: ["admin-institutions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_institution_applications");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: activeTab === "institutions",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const promotionsQuery = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_promotions");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: activeTab === "ads",
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const questsQuery = useQuery({
    queryKey: ["admin-xp-quests"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_xp_quests");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: activeTab === "quests",
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return data.users.filter((user) => {
      if (userType !== "All" && user.account_type !== userType) return false;
      if (!query) return true;
      return `${user.full_name || ""} ${user.username || ""}`.toLowerCase().includes(query);
    });
  }, [data.users, userSearch, userType]);

  const runAction = (fn: string, args: Record<string, any>) => action.mutate({ fn, args });
  const adminSetupMissing = (error as any)?.code === "PGRST202"
    || (error as any)?.message?.includes("get_admin_dashboard_snapshot");

  if (isLoading) return <AdminLoading />;

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-soft">
          <ShieldOff className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-[18px] font-semibold">{adminSetupMissing ? "Admin database setup required" : "Admin data could not load"}</h1>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            {adminSetupMissing
              ? "The dashboard is installed, but its secure Supabase functions have not been added to this project yet."
              : "The dashboard could not reach Zero Club's admin services. Check your connection and admin access."}
          </p>
          {adminSetupMissing && (
            <div className="mt-5 rounded-lg bg-muted/70 px-4 py-3 text-left ring-1 ring-border">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Run in Supabase SQL Editor</p>
              <code className="mt-1.5 block break-all text-[11px] font-semibold text-foreground">20260729160000_create_zero_club_admin_control_center.sql</code>
            </div>
          )}
          {!adminSetupMissing && (error as any)?.message && (
            <p className="mt-4 rounded-lg bg-destructive/[0.06] px-3 py-2 text-[10px] leading-relaxed text-destructive ring-1 ring-destructive/15">
              {(error as any).message}
            </p>
          )}
          <div className="mt-5 flex items-center justify-center gap-2">
            <Link to="/app" className="rounded-lg border border-border px-4 py-2.5 text-[12px] font-semibold hover:bg-muted">Back to app</Link>
            <button onClick={() => refetch()} className="rounded-lg bg-primary px-4 py-2.5 text-[12px] font-semibold text-primary-foreground">Try again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/app" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"><ChevronLeft className="h-4 w-4" /></Link>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="h-[18px] w-[18px]" /></div>
            <div className="min-w-0"><p className="truncate text-[15px] font-semibold tracking-tight">Admin Control Center</p><p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Zero Club operations</p></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 text-[10px] font-semibold text-emerald-600 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Operational</span>
            <button onClick={() => refetch()} disabled={isFetching} title="Refresh dashboard" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1500px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="no-scrollbar hidden border-r border-border/70 px-3 py-5 lg:sticky lg:top-[61px] lg:flex lg:h-[calc(100vh-61px)] lg:flex-col lg:self-start lg:overflow-y-auto">
          <p className="px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Operations</p>
          <nav className="mt-3 space-y-1">{NAV_ITEMS.map(({ id, label, Icon }) => <AdminNavButton key={id} active={activeTab === id} label={label} Icon={Icon} onClick={() => setActiveTab(id)} badge={id === "moderation" ? data.metrics.open_reports : undefined} />)}</nav>
          <div className="mt-8 border-t border-border pt-5 lg:mt-auto"><div className="rounded-lg bg-[#171218] p-4 text-white"><HeartPulse className="h-4 w-4 text-[#f06ac3]" /><p className="mt-3 text-[12px] font-semibold">Platform pulse</p><p className="mt-1 text-[10.5px] leading-relaxed text-white/55">{compact(data.metrics.notifications_24h)} notifications delivered in the last 24 hours.</p></div></div>
        </aside>

        <main className="min-w-0 px-4 pb-12 pt-4 md:px-6 md:pt-6 xl:px-8">
          <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border lg:hidden no-scrollbar">{NAV_ITEMS.map(({ id, label, Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`relative flex h-11 shrink-0 items-center gap-1.5 px-3 text-[11px] font-semibold ${activeTab === id ? "text-foreground" : "text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}{activeTab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}</button>)}</div>

          {activeTab === "overview" && <Overview snapshot={data} format={format} onNavigate={setActiveTab} />}
          {activeTab === "analytics" && <Analytics query={analyticsQuery} format={format} />}
          {activeTab === "institutions" && <Institutions query={institutionsQuery} format={format} busy={action.isPending} runAction={runAction} />}
          {activeTab === "ads" && <AdsManager query={promotionsQuery} busy={action.isPending} runAction={runAction} />}
          {activeTab === "people" && <People users={filteredUsers} search={userSearch} setSearch={setUserSearch} type={userType} setType={setUserType} busy={action.isPending} runAction={runAction} />}
          {activeTab === "moderation" && <Moderation reports={data.reports} busy={action.isPending} runAction={runAction} />}
          {activeTab === "learning" && <Learning bootcamps={data.bootcamps} format={format} busy={action.isPending} runAction={runAction} />}
          {activeTab === "quests" && <QuestManagement query={questsQuery} busy={action.isPending} runAction={runAction} />}
          {activeTab === "community" && <Community clubs={data.clubs} posts={data.posts} />}
          {activeTab === "marketplace" && <Marketplace gigs={data.gigs} format={format} busy={action.isPending} runAction={runAction} />}
          {activeTab === "commerce" && <Commerce snapshot={data} format={format} />}
          {activeTab === "system" && <System snapshot={data} busy={action.isPending} runAction={runAction} />}
        </main>
      </div>
    </div>
  );
}

function AdminNavButton({ active, label, Icon, onClick, badge }: any) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[12px] font-semibold transition ${active ? "bg-primary/[0.08] text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} /><span className="flex-1">{label}</span>{Number(badge) > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">{badge}</span>}</button>;
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p><h1 className="mt-1 font-display text-[22px] font-semibold tracking-tight md:text-[26px]">{title}</h1><p className="mt-1 text-[11.5px] text-muted-foreground">{detail}</p></div>{action}</div>;
}

function Overview({ snapshot, format, onNavigate }: { snapshot: Snapshot; format: (value: number) => string; onNavigate: (tab: AdminTab) => void }) {
  const m = snapshot.metrics;
  const priority = [
    { label: "Open reports", value: m.open_reports, tab: "moderation" as AdminTab, tone: "text-rose-600 bg-rose-500/10" },
    { label: "Suspended accounts", value: m.suspended_users, tab: "people" as AdminTab, tone: "text-amber-600 bg-amber-500/10" },
    { label: "Open gigs", value: m.open_gigs, tab: "marketplace" as AdminTab, tone: "text-emerald-600 bg-emerald-500/10" },
  ];
  return <div><SectionHeading eyebrow="Command overview" title="Platform at a glance" detail="Live operational signals across the Zero Club network." />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><MetricCard Icon={Users} label="Members" value={compact(m.users)} detail={`+${compact(m.new_users_30d)} in 30 days`} tone="bg-sky-500/10 text-sky-600" /><MetricCard Icon={Activity} label="Weekly posts" value={compact(m.posts_7d)} detail={`${compact(m.posts)} all time`} tone="bg-violet-500/10 text-violet-600" /><MetricCard Icon={GraduationCap} label="Enrollments" value={compact(m.enrollments)} detail={`${compact(m.bootcamps)} bootcamps`} tone="bg-emerald-500/10 text-emerald-600" /><MetricCard Icon={FileWarning} label="Open reports" value={compact(m.open_reports)} detail="Trust and safety queue" tone="bg-rose-500/10 text-rose-600" /></div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
      <section className="border-t border-border pt-5"><div className="flex items-center justify-between"><h2 className="text-[14px] font-semibold">Growth and activity</h2><span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current totals</span></div><div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3"><Pulse label="Tutors" value={m.tutors} /><Pulse label="Institutions" value={m.institutions} /><Pulse label="Clubs" value={m.clubs} /><Pulse label="Gig proposals" value={m.gig_applications} /><Pulse label="Push devices" value={m.push_devices} /><Pulse label="Wallet balances" value={format(m.wallet_balance)} /></div></section>
      <section className="border-t border-border pt-5"><h2 className="text-[14px] font-semibold">Priority queue</h2><div className="mt-3 divide-y divide-border">{priority.map((item) => <button key={item.label} onClick={() => onNavigate(item.tab)} className="flex w-full items-center gap-3 py-3 text-left"><span className={`grid h-8 w-8 place-items-center rounded-lg text-[11px] font-semibold ${item.tone}`}>{item.value || 0}</span><span className="flex-1 text-[12px] font-medium">{item.label}</span><ChevronLeft className="h-3.5 w-3.5 rotate-180 text-muted-foreground" /></button>)}</div></section>
    </div>
    <div className="mt-7 grid gap-6 xl:grid-cols-2"><RecentUsers users={snapshot.users.slice(0, 6)} /><AuditList logs={snapshot.audit_logs.slice(0, 7)} /></div>
  </div>;
}

function MetricCard({ Icon, label, value, detail, tone }: any) { return <div className="rounded-lg border border-border bg-card p-4"><div className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></div><p className="mt-4 text-[22px] font-semibold tabular-nums tracking-tight">{value}</p><p className="mt-1 text-[10px] font-semibold">{label}</p><p className="mt-0.5 text-[9.5px] text-muted-foreground">{detail}</p></div>; }
function Pulse({ label, value }: any) { return <div><p className="text-[18px] font-semibold tabular-nums">{typeof value === "number" ? compact(value) : value}</p><p className="mt-1 text-[10px] text-muted-foreground">{label}</p></div>; }

function RecentUsers({ users }: { users: any[] }) { return <section className="border-t border-border pt-5"><h2 className="text-[14px] font-semibold">Newest members</h2><div className="mt-3 divide-y divide-border">{users.map((user) => <div key={user.id} className="flex items-center gap-3 py-3"><Avatar user={user} /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{user.full_name || user.username}</p><p className="text-[9.5px] text-muted-foreground">@{user.username} · {user.account_type || "Learner"}</p></div><span className="text-[9.5px] text-muted-foreground">{formatDate(user.created_at)}</span></div>)}</div></section>; }
function AuditList({ logs }: { logs: any[] }) { return <section className="border-t border-border pt-5"><h2 className="text-[14px] font-semibold">Recent admin activity</h2><div className="mt-3 divide-y divide-border">{logs.length ? logs.map((log) => <div key={log.id} className="flex gap-3 py-3"><div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted"><KeyRound className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><p className="text-[11px] font-medium">{String(log.action).replaceAll("_", " ")}</p><p className="mt-0.5 text-[9.5px] text-muted-foreground">@{log.admin_username || "admin"} · {formatTime(log.created_at)}</p></div></div>) : <EmptyLine text="No admin actions recorded yet." />}</div></section>; }

function People({ users, search, setSearch, type, setType, busy, runAction }: any) {
  return <div><SectionHeading eyebrow="People operations" title="Members and access" detail="Review account health, roles, balances, and platform privileges." /><div className="mb-4 flex flex-col gap-2 sm:flex-row"><label className="relative flex h-10 flex-1 items-center rounded-lg border border-border bg-card"><Search className="ml-3 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members" className="min-w-0 flex-1 bg-transparent px-3 text-[12px] outline-none" /></label><select value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-lg border border-border bg-card px-3 text-[11px] font-medium outline-none"><option>All</option><option>Learner</option><option>Tutor</option><option>Institution</option></select></div><div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{users.map((user: any) => <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><Avatar user={user} /><div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-[12px] font-semibold">{user.full_name || user.username}{user.is_admin && <BadgeCheck className="h-3.5 w-3.5 fill-primary text-primary-foreground" />}</p><p className="mt-0.5 text-[9.5px] text-muted-foreground">@{user.username} · {user.account_type || "Learner"} · {compact(user.xp)} XP</p></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><StatusBadge status={user.account_status} /><div className="flex gap-1"><button disabled={busy} title={user.is_admin ? "Remove admin access" : "Grant admin access"} onClick={() => { if (confirm(`${user.is_admin ? "Remove" : "Grant"} Zero Club admin access for @${user.username}?`)) runAction("admin_set_admin_access", { target_user_id: user.id, enabled: !user.is_admin }); }} className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted">{user.is_admin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}</button><button disabled={busy} title={user.account_status === "suspended" ? "Reactivate account" : "Suspend account"} onClick={() => { const next = user.account_status === "suspended" ? "active" : "suspended"; if (confirm(`${next === "suspended" ? "Suspend" : "Reactivate"} @${user.username}?`)) runAction("admin_set_user_status", { target_user_id: user.id, new_status: next }); }} className={`grid h-8 w-8 place-items-center rounded-lg border ${user.account_status === "suspended" ? "border-emerald-500/20 text-emerald-600" : "border-border text-muted-foreground hover:text-destructive"}`}>{user.account_status === "suspended" ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}</button></div></div></div>)}</div></div>;
}

function Moderation({ reports, busy, runAction }: any) { const active = reports.filter((r: any) => ["open", "reviewing"].includes(r.status)); return <div><SectionHeading eyebrow="Trust and safety" title="Moderation queue" detail="Review member reports and record clear resolution outcomes." /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><SmallMetric label="Open" value={reports.filter((r: any) => r.status === "open").length} /><SmallMetric label="Reviewing" value={reports.filter((r: any) => r.status === "reviewing").length} /><SmallMetric label="Resolved" value={reports.filter((r: any) => r.status === "resolved").length} /><SmallMetric label="Dismissed" value={reports.filter((r: any) => r.status === "dismissed").length} /></div><div className="mt-5 space-y-3">{active.length ? active.map((report: any) => <div key={report.id} className="rounded-lg border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-rose-600">{report.context}</p><h3 className="mt-1 text-[13px] font-semibold">Report against @{report.reported_username || "unknown"}</h3><p className="mt-1 text-[9.5px] text-muted-foreground">Submitted by @{report.reporter_username || "member"} · {formatTime(report.created_at)}</p></div><StatusBadge status={report.status} /></div><p className="mt-4 rounded-lg bg-muted/60 p-3 text-[11.5px] leading-relaxed">{report.reason}</p><div className="mt-4 flex flex-wrap gap-2">{report.status === "open" && <ActionButton label="Start review" disabled={busy} onClick={() => runAction("admin_update_report", { target_report_id: report.id, new_status: "reviewing" })} />}<ActionButton label="Resolve" disabled={busy} onClick={() => runAction("admin_update_report", { target_report_id: report.id, new_status: "resolved" })} primary /><ActionButton label="Dismiss" disabled={busy} onClick={() => runAction("admin_update_report", { target_report_id: report.id, new_status: "dismissed" })} /></div></div>) : <EmptyState Icon={ShieldCheck} title="Moderation queue is clear" detail="New member reports will appear here." />}</div></div>; }

function Learning({ bootcamps, format, busy, runAction }: any) {
  const deleteBootcamp = (bootcamp: any) => {
    const provider = bootcamp.creator_username ? `@${bootcamp.creator_username}` : "this provider";
    const confirmed = window.confirm(
      `Permanently delete "${bootcamp.title}" by ${provider}? Its curriculum, enrollments, and temporary bootcamp club will also be removed. This cannot be undone.`,
    );
    if (!confirmed) return;

    runAction("admin_delete_bootcamp", { target_bootcamp_id: bootcamp.id });
  };

  return (
    <div>
      <SectionHeading
        eyebrow="Learning operations"
        title="Bootcamps and delivery"
        detail="Monitor providers, learners, pricing, publishing status, and remove bootcamps that breach platform standards."
      />
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {bootcamps.map((bootcamp: any) => (
          <div
            key={bootcamp.id}
            className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_100px_120px_180px] md:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold">{bootcamp.title}</p>
              <p className="mt-1 text-[9.5px] text-muted-foreground">
                @{bootcamp.creator_username || "provider"} · {bootcamp.creator_type || "Tutor"} · {bootcamp.category}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tabular-nums">{compact(bootcamp.learners)}</p>
              <p className="text-[9px] text-muted-foreground">Learners</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tabular-nums">{format(bootcamp.price)}</p>
              <p className="text-[9px] text-muted-foreground">Price</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                disabled={busy}
                value={bootcamp.status}
                onChange={(event) => runAction("admin_update_bootcamp_status", {
                  target_bootcamp_id: bootcamp.id,
                  new_status: event.target.value,
                })}
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[10.5px] font-semibold outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => deleteBootcamp(bootcamp)}
                title={`Delete ${bootcamp.title}`}
                aria-label={`Delete ${bootcamp.title}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-destructive/20 text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {bootcamps.length === 0 && (
          <div className="p-8 text-center text-[11px] text-muted-foreground">No bootcamps to manage yet.</div>
        )}
      </div>
    </div>
  );
}

function Community({ clubs, posts }: any) { return <div><SectionHeading eyebrow="Community operations" title="Clubs and publishing" detail="Visibility into the spaces and conversations shaping the network." /><div className="grid gap-6 xl:grid-cols-2"><section><h2 className="mb-3 text-[13px] font-semibold">Newest clubs</h2><div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{clubs.slice(0, 15).map((club: any) => <div key={club.id} className="flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500/10 text-violet-600"><UsersRound className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{club.name}</p><p className="mt-0.5 text-[9.5px] text-muted-foreground">{club.category} · @{club.creator_username || "builder"}</p></div><div className="text-right"><p className="text-[11px] font-semibold">{compact(club.members)}</p><p className="text-[8.5px] text-muted-foreground">members</p></div></div>)}</div></section><section><h2 className="mb-3 text-[13px] font-semibold">Latest posts</h2><div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{posts.slice(0, 15).map((post: any) => <div key={post.id} className="p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold">@{post.author_username || "builder"}</p><span className="text-[9px] text-muted-foreground">{formatTime(post.created_at)}</span></div><p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-foreground/80">{toPlainText(contentPreview(post.content))}</p><p className="mt-2 text-[9px] text-muted-foreground">{compact(post.likes_count)} likes · {compact(post.comments_count)} comments · {compact(post.reposts_count)} reposts</p></div>)}</div></section></div></div>; }

const QUEST_REQUIREMENTS = [
  { value: "login", label: "Open Zero Club" },
  { value: "post_today", label: "Publish a post today" },
  { value: "post", label: "Publish posts" },
  { value: "comment", label: "Write comments" },
  { value: "quote", label: "Quote posts" },
  { value: "ship", label: "Publish Ships" },
  { value: "follow", label: "Follow builders" },
  { value: "profile", label: "Complete profile bio" },
  { value: "enrollment", label: "Join bootcamps" },
  { value: "club", label: "Grow a club" },
] as const;

const QUEST_ICONS = ["Rocket", "Share2", "Users", "Star", "Trophy", "GraduationCap"];
const EMPTY_QUEST = {
  id: null as string | null,
  title: "",
  description: "",
  type: "daily",
  rewardXp: "100",
  criteriaType: "post_today",
  criteriaCount: "1",
  iconName: "Rocket",
  status: "draft",
  sortOrder: "0",
};

function QuestManagement({ query, busy, runAction }: { query: any; busy: boolean; runAction: (fn: string, args: Record<string, any>) => void }) {
  const { data, isLoading, error } = query;
  const [form, setForm] = useState({ ...EMPTY_QUEST });
  const [search, setSearch] = useState("");
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  if (isLoading) return <TabLoading />;
  if (error) {
    if (isMissingRpc(error)) return <MigrationNote file="20260803110000_admin_managed_xp_quests.sql" title="Quest management setup required" />;
    return <EmptyState Icon={ShieldOff} title="Quests could not load" detail={error.message || "Try refreshing."} />;
  }

  const quests = (data || []) as any[];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = quests.filter((quest) => !normalizedSearch || `${quest.title} ${quest.description} ${quest.criteria_type}`.toLowerCase().includes(normalizedSearch));
  const field = "h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary/50";
  const label = "text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

  const reset = () => setForm({ ...EMPTY_QUEST });
  const edit = (quest: any) => {
    setForm({
      id: quest.id,
      title: quest.title || "",
      description: quest.description || "",
      type: quest.type || "daily",
      rewardXp: String(quest.reward_xp || 100),
      criteriaType: quest.criteria_type || "post_today",
      criteriaCount: String(quest.criteria_count || 1),
      iconName: quest.icon_name || "Rocket",
      status: quest.status || "draft",
      sortOrder: String(quest.sort_order || 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    const reward = Number(form.rewardXp);
    const target = Number(form.criteriaCount);
    if (form.title.trim().length < 3) { toast.error("Give the Quest a clear title"); return; }
    if (form.description.trim().length < 10) { toast.error("Add a useful Quest description"); return; }
    if (!Number.isInteger(reward) || reward < 1 || reward > 10_000) { toast.error("XP reward must be between 1 and 10,000"); return; }
    if (!Number.isInteger(target) || target < 1 || target > 10_000) { toast.error("Target must be between 1 and 10,000"); return; }

    const args = {
      new_title: form.title.trim(),
      new_description: form.description.trim(),
      new_type: form.type,
      new_reward_xp: reward,
      new_criteria_type: form.criteriaType,
      new_criteria_count: target,
      new_icon_name: form.iconName,
      new_status: form.status,
      new_sort_order: Number(form.sortOrder) || 0,
    };

    if (form.id) runAction("admin_update_xp_quest", { target_quest_id: form.id, ...args });
    else runAction("admin_create_xp_quest", args);
    reset();
  };

  return (
    <div>
      <SectionHeading eyebrow="Experience operations" title="Quests" detail="Create and manage the verified activities that award XP across Zero Club." />

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="h-fit rounded-lg border border-border bg-card p-5 xl:sticky xl:top-[77px]">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-[13px] font-semibold">{form.id ? "Edit Quest" : "Post a Quest"}</h2><p className="mt-0.5 text-[9.5px] text-muted-foreground">Only completed, active Quests can award XP.</p></div>
            {form.id && <button onClick={reset} title="Close editor" className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
          </div>

          <div className="mt-4 space-y-3">
            <div><p className={label}>Title</p><input value={form.title} onChange={(event) => set("title", event.target.value)} maxLength={80} placeholder="Share a useful build update" className={`${field} mt-1.5`} /></div>
            <div><p className={label}>Description</p><textarea value={form.description} onChange={(event) => set("description", event.target.value)} maxLength={240} rows={3} placeholder="Tell members exactly what counts as completed" className={`${field} mt-1.5 h-auto resize-none py-2.5`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={label}>Frequency</p><select value={form.type} onChange={(event) => set("type", event.target.value)} className={`${field} mt-1.5`}><option value="daily">Daily</option><option value="one-time">One time</option><option value="milestone">Milestone</option></select></div>
              <div><p className={label}>Status</p><select value={form.status} onChange={(event) => set("status", event.target.value)} className={`${field} mt-1.5`}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></div>
            </div>
            <div><p className={label}>Completion requirement</p><select value={form.criteriaType} onChange={(event) => set("criteriaType", event.target.value)} className={`${field} mt-1.5`}>{QUEST_REQUIREMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={label}>Target</p><input type="number" min="1" max="10000" value={form.criteriaCount} onChange={(event) => set("criteriaCount", event.target.value)} className={`${field} mt-1.5`} /></div>
              <div><p className={label}>XP reward</p><input type="number" min="1" max="10000" value={form.rewardXp} onChange={(event) => set("rewardXp", event.target.value)} className={`${field} mt-1.5`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={label}>Icon</p><select value={form.iconName} onChange={(event) => set("iconName", event.target.value)} className={`${field} mt-1.5`}>{QUEST_ICONS.map((icon) => <option key={icon}>{icon}</option>)}</select></div>
              <div><p className={label}>Display order</p><input type="number" value={form.sortOrder} onChange={(event) => set("sortOrder", event.target.value)} className={`${field} mt-1.5`} /></div>
            </div>
            <button disabled={busy} onClick={submit} className="w-full rounded-lg bg-primary py-2.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">{form.id ? "Save Quest" : form.status === "active" ? "Publish Quest" : "Save draft"}</button>
          </div>
        </section>

        <section className="min-w-0">
          <div className="grid grid-cols-3 gap-3">
            <SmallMetric label="Active" value={quests.filter((quest) => quest.status === "active").length} />
            <SmallMetric label="Drafts" value={quests.filter((quest) => quest.status === "draft").length} />
            <SmallMetric label="Total" value={quests.length} />
          </div>
          <div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Quests" className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[11.5px] outline-none focus:border-primary/50" /></div>
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {filtered.map((quest) => (
              <div key={quest.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/[0.08] text-primary"><ListChecks className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-[12.5px] font-semibold">{quest.title}</p><StatusBadge status={quest.status} /></div>
                    <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">{quest.description}</p>
                    <p className="mt-2 text-[9.5px] text-muted-foreground"><span className="font-semibold text-foreground">+{quest.reward_xp} XP</span> · {QUEST_REQUIREMENTS.find((item) => item.value === quest.criteria_type)?.label || quest.criteria_type} × {quest.criteria_count} · {String(quest.type).replace("-", " ")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button title="Edit Quest" onClick={() => edit(quest)} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                    <button title="Delete Quest" disabled={busy} onClick={() => { if (confirm(`Delete Quest \"${quest.title}\"? Members will no longer be able to claim it.`)) runAction("admin_delete_xp_quest", { target_quest_id: quest.id }); }} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
            {!filtered.length && <EmptyLine text={quests.length ? "No Quests match your search." : "No Quests have been posted yet."} />}
          </div>
        </section>
      </div>
    </div>
  );
}

const EMPTY_GIG = { title: "", description: "", category: "Design", skills: "", budgetType: "fixed", budgetMin: "", budgetMax: "", experience: "Intermediate", location: "Remote", deadline: "", client: "" };

function Marketplace({ gigs, format, busy, runAction }: any) {
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_GIG });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const detail = useQuery({
    queryKey: ["admin-gig-detail", reviewId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_gig_detail", { target_gig_id: reviewId });
      if (error) throw error;
      return data || {};
    },
    enabled: !!reviewId,
    retry: false,
  });

  const submitGig = () => {
    if (form.title.trim().length < 5) { toast.error("Title needs at least 5 characters"); return; }
    if (form.description.trim().length < 20) { toast.error("Description needs at least 20 characters"); return; }
    const min = Number(form.budgetMin), max = Number(form.budgetMax);
    if (!(min > 0) || !(max >= min)) { toast.error("Enter a valid budget range"); return; }
    runAction("admin_create_gig", {
      new_title: form.title, new_description: form.description, new_category: form.category,
      new_skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      new_budget_type: form.budgetType, new_budget_min: min, new_budget_max: max,
      new_experience_level: form.experience, new_location_type: form.location,
      new_deadline: form.deadline || null, client_username: form.client || null,
    });
    setForm({ ...EMPTY_GIG });
    setCreating(false);
  };

  const field = "h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary/50";
  const label = "text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

  return (
    <div>
      <SectionHeading eyebrow="Marketplace operations" title="Gigs and proposals" detail="Review listings and proposals, publish new gigs, and manage marketplace status."
        action={<button onClick={() => setCreating((v) => !v)} className="rounded-lg bg-primary px-4 py-2.5 text-[11.5px] font-semibold text-primary-foreground">{creating ? "Close form" : "Post a gig"}</button>} />

      {creating && (
        <section className="mb-5 rounded-lg border border-border bg-card p-5">
          <h2 className="text-[13px] font-semibold">New gig</h2>
          <p className="mt-0.5 text-[9.5px] text-muted-foreground">Leave the client blank to post as your own admin account.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><p className={label}>Title</p><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Brand designer for a fintech launch" className={`${field} mt-1.5`} /></div>
            <div className="md:col-span-2"><p className={label}>Description</p><textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Scope, deliverables, and what success looks like" className={`${field} h-auto resize-none py-2.5 mt-1.5`} /></div>
            <div><p className={label}>Post on behalf of (username)</p><input value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="institution username" className={`${field} mt-1.5`} /></div>
            <div><p className={label}>Category</p><input value={form.category} onChange={(e) => set("category", e.target.value)} className={`${field} mt-1.5`} /></div>
            <div className="md:col-span-2"><p className={label}>Skills (comma separated)</p><input value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="Figma, Branding, Web design" className={`${field} mt-1.5`} /></div>
            <div><p className={label}>Budget type</p><select value={form.budgetType} onChange={(e) => set("budgetType", e.target.value)} className={`${field} mt-1.5`}><option value="fixed">Fixed</option><option value="hourly">Hourly</option></select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={label}>Min</p><input type="number" value={form.budgetMin} onChange={(e) => set("budgetMin", e.target.value)} className={`${field} mt-1.5`} /></div>
              <div><p className={label}>Max</p><input type="number" value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} className={`${field} mt-1.5`} /></div>
            </div>
            <div><p className={label}>Experience</p><select value={form.experience} onChange={(e) => set("experience", e.target.value)} className={`${field} mt-1.5`}><option>Entry</option><option>Intermediate</option><option>Expert</option></select></div>
            <div><p className={label}>Location</p><select value={form.location} onChange={(e) => set("location", e.target.value)} className={`${field} mt-1.5`}><option>Remote</option><option>Hybrid</option><option>On-site</option></select></div>
            <div><p className={label}>Deadline</p><input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} className={`${field} mt-1.5`} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={busy} onClick={submitGig} className="rounded-lg bg-primary px-5 py-2.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Publish gig</button>
            <button onClick={() => { setForm({ ...EMPTY_GIG }); setCreating(false); }} className="rounded-lg border border-border px-4 py-2.5 text-[11.5px] font-semibold hover:bg-muted">Cancel</button>
          </div>
        </section>
      )}

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {gigs.map((gig: any) => (
          <div key={gig.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_140px_90px_190px] md:items-center">
            <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{gig.title}</p><p className="mt-1 text-[9.5px] text-muted-foreground">{gig.client_name || `@${gig.client_username || "institution"}`} · {gig.category} · {gig.location_type}</p></div>
            <div><p className="text-[10.5px] font-semibold">{format(gig.budget_min)} - {format(gig.budget_max)}</p><p className="text-[8.5px] text-muted-foreground">Budget</p></div>
            <div><p className="text-[11px] font-semibold">{compact(gig.applications_count)}</p><p className="text-[8.5px] text-muted-foreground">Proposals</p></div>
            <div className="flex items-center gap-1.5">
              <select disabled={busy} value={gig.status} onChange={(e) => runAction("admin_update_gig_status", { target_gig_id: gig.id, new_status: e.target.value })} className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-[10.5px] font-semibold outline-none"><option value="open">Open</option><option value="paused">Paused</option><option value="closed">Closed</option></select>
              <button onClick={() => setReviewId(reviewId === gig.id ? null : gig.id)} className="rounded-lg border border-border px-3 py-2 text-[10.5px] font-semibold hover:bg-muted">{reviewId === gig.id ? "Close" : "Review"}</button>
              <button title="Delete gig" disabled={busy} onClick={() => { if (confirm(`Delete gig "${gig.title}"? This also removes its proposals.`)) runAction("admin_delete_gig", { target_gig_id: gig.id }); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {reviewId === gig.id && (
              <div className="md:col-span-4">
                {detail.isLoading ? <TabLoading /> : detail.error ? (
                  isMissingRpc(detail.error) ? <MigrationNote file="20260730180000_admin_gig_management.sql" title="Gig review setup required" /> : <EmptyLine text={(detail.error as any).message} />
                ) : (
                  <div className="mt-2 rounded-lg bg-muted/50 p-4 ring-1 ring-border">
                    <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed">{detail.data?.gig?.description}</p>
                    <p className="mt-3 text-[9.5px] text-muted-foreground">{(detail.data?.gig?.skills || []).join(" · ") || "No skills listed"}{detail.data?.gig?.deadline ? ` · Deadline ${formatDate(detail.data.gig.deadline)}` : ""} · {detail.data?.gig?.experience_level} · {detail.data?.gig?.budget_type}</p>
                    <h3 className="mt-4 text-[11.5px] font-semibold">Proposals ({(detail.data?.applications || []).length})</h3>
                    <div className="mt-2 divide-y divide-border">
                      {(detail.data?.applications || []).length ? (detail.data.applications).map((app: any) => (
                        <div key={app.id} className="py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold">@{app.applicant_username || "member"} <span className="font-normal text-muted-foreground">· {compact(app.applicant_xp)} XP</span></p>
                            <div className="flex items-center gap-2"><span className="text-[10.5px] font-semibold">{format(app.proposed_amount)}</span><StatusBadge status={app.status} /></div>
                          </div>
                          <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-foreground/80">{app.cover_note}</p>
                          <p className="mt-1.5 text-[9px] text-muted-foreground">{app.delivery_days} day delivery · {formatTime(app.created_at)}{app.portfolio_url ? " · portfolio attached" : ""}</p>
                        </div>
                      )) : <EmptyLine text="No proposals submitted yet." />}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {!gigs.length && <EmptyState Icon={BriefcaseBusiness} title="No gigs posted yet" detail="Publish the first listing with the Post a gig button." />}
      </div>
    </div>
  );
}

function Commerce({ snapshot, format }: { snapshot: Snapshot; format: (value: number) => string }) {
  const m = snapshot.metrics;
  return (
    <div>
      <SectionHeading eyebrow="Commerce operations" title="Creator economy" detail="Monitor value moving through wallets, gifts, licences, and the Zero Store." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard Icon={WalletCards} label="Wallet balances" value={format(m.wallet_balance)} detail="Member balances" tone="bg-sky-500/10 text-sky-600" />
        <MetricCard Icon={Store} label="Store listings" value={compact(m.store_items)} detail="Digital products" tone="bg-violet-500/10 text-violet-600" />
        <MetricCard Icon={CircleDollarSign} label="Gift value" value={format(m.gift_value)} detail={`${compact(m.gift_cards)} gift cards`} tone="bg-emerald-500/10 text-emerald-600" />
        <MetricCard Icon={PackageOpen} label="Licences" value={compact(m.licences)} detail="ZeroHub ownership rights" tone="bg-amber-500/10 text-amber-600" />
      </div>
      <section className="mt-7 border-t border-border pt-5">
        <h2 className="text-[14px] font-semibold">Recent store inventory</h2>
        <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {snapshot.store_items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-4">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><Store className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold">{item.name}</p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">{item.category || "Digital product"} · @{item.seller_username || "creator"}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold">{item.price_type === "Coins" ? format(item.price) : `${compact(item.price)} ZP`}</p>
                <p className="text-[8.5px] text-muted-foreground">{formatDate(item.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function System({ snapshot, busy, runAction }: any) { const m = snapshot.metrics; return <div><SectionHeading eyebrow="Platform operations" title="System controls" detail="Manage availability, review rules, delivery health, and admin accountability." /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><section><h2 className="text-[14px] font-semibold">Platform settings</h2><div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{snapshot.settings.map((setting: any) => { const enabled = setting.value === true || setting.value === "true"; return <div key={setting.key} className="flex items-center gap-4 p-4"><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">{String(setting.key).replaceAll("_", " ")}</p><p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">{setting.description}</p></div><button disabled={busy} onClick={() => runAction("admin_update_platform_setting", { setting_key: setting.key, setting_value: !enabled })} className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} /></button></div>; })}</div></section><section><h2 className="text-[14px] font-semibold">Delivery health</h2><div className="mt-3 space-y-3"><HealthRow Icon={BellRing} label="Push devices" value={compact(m.push_devices)} status="Connected" /><HealthRow Icon={MessageSquareText} label="Notifications, 24h" value={compact(m.notifications_24h)} status="Delivering" /><HealthRow Icon={Activity} label="Weekly posts" value={compact(m.posts_7d)} status="Active" /></div></section></div><div className="mt-7"><AuditList logs={snapshot.audit_logs} /></div></div>; }

function MigrationNote({ file, title }: { file: string; title: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-12 text-center">
      <ShieldOff className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-3 text-[14px] font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-[10.5px] leading-relaxed text-muted-foreground">This section needs a one-time database setup. Run the file below in the Supabase SQL Editor, then refresh.</p>
      <div className="mx-auto mt-4 max-w-md rounded-lg bg-muted/70 px-4 py-3 ring-1 ring-border"><code className="block break-all text-[11px] font-semibold">{file}</code></div>
    </div>
  );
}

function TabLoading() { return <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>; }

function TrendChart({ title, data, color, kind }: { title: string; data: any[]; color: string; kind: "area" | "bar" }) {
  const gid = `grad-${title.replaceAll(" ", "-").toLowerCase()}`;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      <p className="text-[9.5px] text-muted-foreground">Last 30 days</p>
      <div className="mt-3 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          {kind === "area" ? (
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.28} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={6} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <ChartTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Area type="monotone" dataKey="value" name={title} stroke={color} strokeWidth={2} fill={`url(#${gid})`} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.15} />
              <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={6} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <ChartTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="value" name={title} fill={color} radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Analytics({ query, format }: { query: any; format: (value: number) => string }) {
  const { data, isLoading, error, refetch } = query;
  if (isLoading) return <TabLoading />;
  if (error) {
    if (isMissingRpc(error)) return <MigrationNote file={ADS_MIGRATION_FILE} title="Analytics setup required" />;
    return <EmptyState Icon={ShieldOff} title="Analytics could not load" detail={error.message || "Try refreshing."} />;
  }
  const a = data || {};
  const m = a.membership || {};
  const e = a.engagement || {};
  const ctr = Number(e.promo_impressions) > 0 ? ((Number(e.promo_clicks) / Number(e.promo_impressions)) * 100).toFixed(1) : "0.0";
  return (
    <div>
      <SectionHeading eyebrow="Platform intelligence" title="Analytics" detail="Growth, engagement, membership mix, and campaign performance." action={<button onClick={() => refetch()} className="rounded-lg border border-border px-3 py-2 text-[10.5px] font-semibold hover:bg-muted">Refresh</button>} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard Icon={Users} label="Premium members" value={compact(Number(m.premium || 0) + Number(m.premium_plus || 0))} detail={`${compact(m.premium)} Premium · ${compact(m.premium_plus)} Premium+`} tone="bg-amber-500/10 text-amber-600" />
        <MetricCard Icon={Activity} label="Total likes" value={compact(e.total_likes)} detail={`${compact(e.total_comments)} comments · ${compact(e.total_reposts)} reposts`} tone="bg-violet-500/10 text-violet-600" />
        <MetricCard Icon={Megaphone} label="Ad impressions" value={compact(e.promo_impressions)} detail={`${compact(e.promo_clicks)} clicks · ${ctr}% CTR`} tone="bg-sky-500/10 text-sky-600" />
        <MetricCard Icon={BarChart3} label="Posts, 30 days" value={compact(e.posts_30d)} detail={`${compact(e.active_promotions)} active campaigns`} tone="bg-emerald-500/10 text-emerald-600" />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <TrendChart title="New signups" data={a.signups_daily || []} color="#cc208f" kind="area" />
        <TrendChart title="Posts published" data={a.posts_daily || []} color="#7c3aed" kind="bar" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TrendChart title="Bootcamp enrollments" data={a.enrollments_daily || []} color="#059669" kind="area" />
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-[13px] font-semibold">Membership mix</h2>
          <p className="text-[9.5px] text-muted-foreground">Accounts by role and plan</p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <Pulse label="Learners" value={m.learners} /><Pulse label="Tutors" value={m.tutors} /><Pulse label="Institutions" value={m.institutions} />
            <Pulse label="Free plan" value={m.free} /><Pulse label="Premium" value={m.premium} /><Pulse label="Premium+" value={m.premium_plus} />
          </div>
        </section>
      </div>
      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <section className="border-t border-border pt-5">
          <h2 className="text-[14px] font-semibold">Top bootcamps</h2>
          <div className="mt-3 divide-y divide-border">
            {(a.top_bootcamps || []).map((b: any) => (
              <div key={b.id} className="flex items-center gap-3 py-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"><GraduationCap className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{b.title}</p><p className="text-[9.5px] text-muted-foreground">@{b.creator_username || "provider"} · {format(b.price)}</p></div>
                <div className="text-right"><p className="text-[12px] font-semibold tabular-nums">{compact(b.learners)}</p><p className="text-[8.5px] text-muted-foreground">learners</p></div>
              </div>
            ))}
            {!(a.top_bootcamps || []).length && <EmptyLine text="No bootcamps yet." />}
          </div>
        </section>
        <section className="border-t border-border pt-5">
          <h2 className="text-[14px] font-semibold">Top posts</h2>
          <div className="mt-3 divide-y divide-border">
            {(a.top_posts || []).map((p: any) => (
              <div key={p.id} className="py-3">
                <div className="flex items-center justify-between"><p className="text-[10px] font-semibold">@{p.author_username || "builder"}</p><span className="text-[9px] text-muted-foreground">{formatDate(p.created_at)}</span></div>
                <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-foreground/80">{toPlainText(contentPreview(p.content))}</p>
                <p className="mt-1.5 text-[9px] text-muted-foreground">{compact(p.likes_count)} likes · {compact(p.comments_count)} comments</p>
              </div>
            ))}
            {!(a.top_posts || []).length && <EmptyLine text="No posts yet." />}
          </div>
        </section>
      </div>
    </div>
  );
}

function Institutions({ query, format, busy, runAction }: any) {
  const { data, isLoading, error } = query;
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) return <TabLoading />;
  if (error) {
    if (isMissingRpc(error)) return <MigrationNote file="20260730210000_institution_onboarding.sql" title="Institution onboarding setup required" />;
    return <EmptyState Icon={ShieldOff} title="Applications could not load" detail={(error as any).message || "Try refreshing."} />;
  }
  const apps = (data || []) as any[];
  const daysLeft = (iso?: string) => iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div>
      <SectionHeading eyebrow="Institution operations" title="Digital Hub applications" detail="Review onboarding requests, trials, and activations." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallMetric label="On trial" value={apps.filter((a) => a.status === "trial").length} />
        <SmallMetric label="Awaiting review" value={apps.filter((a) => a.status === "pending_review").length} />
        <SmallMetric label="Active" value={apps.filter((a) => a.status === "active").length} />
        <SmallMetric label="Total" value={apps.length} />
      </div>
      <div className="mt-5 space-y-3">
        {apps.length ? apps.map((app) => (
          <div key={app.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{app.institution_name}</p>
                <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                  {app.institution_type} · {app.city ? `${app.city}, ` : ""}{app.country} · @{app.username || "member"} · {app.organization_size === "large" ? "Large" : "Small"} organisation
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={app.status === "pending_review" ? "reviewing" : app.status} />
                <button onClick={() => setOpenId(openId === app.id ? null : app.id)} className="rounded-lg border border-border px-3 py-1.5 text-[10.5px] font-semibold hover:bg-muted">{openId === app.id ? "Close" : "Details"}</button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] text-muted-foreground">
              <span>Plan <strong className="text-foreground">{format(app.price)}</strong>/yr</span>
              <span>Wallet <strong className="text-foreground">{format(app.wallet_balance)}</strong></span>
              <span>{compact(app.learner_count)} learners · {compact(app.tutor_count)} tutors</span>
              {app.status === "trial" && <span className="text-amber-600">{daysLeft(app.trial_ends_at)} trial days left</span>}
              {app.status === "active" && app.active_until && <span className="text-emerald-600">Active until {formatDate(app.active_until)}</span>}
            </div>

            {openId === app.id && (
              <div className="mt-3 space-y-3 rounded-lg bg-muted/50 p-4 ring-1 ring-border">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Contact" value={`${app.contact_name} · ${app.contact_role}`} />
                  <Detail label="Email" value={app.contact_email} />
                  <Detail label="Phone" value={app.contact_phone || "—"} />
                  <Detail label="Website" value={app.website || "—"} />
                  <Detail label="Registration" value={app.registration_number || "—"} />
                  <Detail label="Address" value={app.address || "—"} />
                </div>
                {app.programs_planned && <Detail label="Programs planned" value={app.programs_planned} />}
                {app.goals && <Detail label="Goals" value={app.goals} />}
                {app.hear_about && <Detail label="Heard about us via" value={app.hear_about} />}
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <ActionButton label="Mark reviewing" disabled={busy} onClick={() => runAction("admin_set_institution_status", { target_application_id: app.id, new_status: "pending_review" })} />
                  <ActionButton label="Activate 12 months" primary disabled={busy} onClick={() => { if (confirm(`Activate the Digital Hub for ${app.institution_name}?`)) runAction("admin_set_institution_status", { target_application_id: app.id, new_status: "active" }); }} />
                  <ActionButton label="Expire" disabled={busy} onClick={() => runAction("admin_set_institution_status", { target_application_id: app.id, new_status: "expired" })} />
                  <ActionButton label="Reject" disabled={busy} onClick={() => { if (confirm(`Reject ${app.institution_name}?`)) runAction("admin_set_institution_status", { target_application_id: app.id, new_status: "rejected" }); }} />
                </div>
              </div>
            )}
          </div>
        )) : <EmptyState Icon={Building2} title="No applications yet" detail="Institution onboarding requests will appear here." />}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-0.5 text-[11.5px] leading-relaxed">{value}</p></div>;
}

const EMPTY_CAMPAIGN = { id: null as string | null, title: "", body: "", mediaUrl: "", targetUrl: "", cta: "Learn more", audience: "free_members", sponsor: "", startsAt: "", endsAt: "" };

function AdsManager({ query, busy, runAction }: { query: any; busy: boolean; runAction: (fn: string, args: Record<string, any>) => void }) {
  const { data, isLoading, error } = query;
  const [form, setForm] = useState({ ...EMPTY_CAMPAIGN });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (isLoading) return <TabLoading />;
  if (error) {
    if (isMissingRpc(error)) return <MigrationNote file={ADS_MIGRATION_FILE} title="Ads Manager setup required" />;
    return <EmptyState Icon={ShieldOff} title="Campaigns could not load" detail={error.message || "Try refreshing."} />;
  }
  const promotions = (data || []) as any[];

  const submit = () => {
    if (!form.title.trim()) { toast.error("Give the campaign a title"); return; }
    runAction("admin_save_promotion", {
      promotion_id: form.id,
      new_title: form.title,
      new_body: form.body || null,
      new_media_url: form.mediaUrl || null,
      new_target_url: form.targetUrl || null,
      new_cta_label: form.cta || "Learn more",
      new_audience: form.audience,
      sponsor_username: form.sponsor || null,
      new_starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      new_ends_at: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
    });
    setForm({ ...EMPTY_CAMPAIGN });
  };

  const edit = (promo: any) => setForm({
    id: promo.id, title: promo.title || "", body: promo.body || "", mediaUrl: promo.media_url || "",
    targetUrl: promo.target_url || "", cta: promo.cta_label || "Learn more", audience: promo.audience || "free_members",
    sponsor: promo.sponsor_username || "", startsAt: promo.starts_at ? promo.starts_at.slice(0, 10) : "", endsAt: promo.ends_at ? promo.ends_at.slice(0, 10) : "",
  });

  const field = "h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] outline-none focus:border-primary/50";
  const label = "text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

  return (
    <div>
      <SectionHeading eyebrow="Sponsored placements" title="Ads Manager" detail="Run campaigns for premium members and partners. New campaigns start as drafts — activate them when ready." />
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="h-fit rounded-lg border border-border bg-card p-5 xl:sticky xl:top-[77px]">
          <h2 className="text-[13px] font-semibold">{form.id ? "Edit campaign" : "New campaign"}</h2>
          <div className="mt-4 space-y-3">
            <div><p className={label}>Title</p><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Spotlight: Design Systems Bootcamp" className={`${field} mt-1.5`} /></div>
            <div><p className={label}>Message</p><textarea value={form.body} onChange={(e) => set("body", e.target.value)} rows={3} placeholder="Short pitch shown to members" className={`${field} h-auto resize-none py-2.5 mt-1.5`} /></div>
            <div><p className={label}>Sponsor username</p><input value={form.sponsor} onChange={(e) => set("sponsor", e.target.value)} placeholder="premium member being promoted" className={`${field} mt-1.5`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={label}>Image URL</p><input value={form.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)} placeholder="https://…" className={`${field} mt-1.5`} /></div>
              <div><p className={label}>Destination URL</p><input value={form.targetUrl} onChange={(e) => set("targetUrl", e.target.value)} placeholder="https://…" className={`${field} mt-1.5`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={label}>Button label</p><input value={form.cta} onChange={(e) => set("cta", e.target.value)} className={`${field} mt-1.5`} /></div>
              <div><p className={label}>Audience</p><select value={form.audience} onChange={(e) => set("audience", e.target.value)} className={`${field} mt-1.5`}><option value="free_members">Free members only</option><option value="everyone">Everyone</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className={label}>Starts</p><input type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={`${field} mt-1.5`} /></div>
              <div><p className={label}>Ends</p><input type="date" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={`${field} mt-1.5`} /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <button disabled={busy} onClick={submit} className="flex-1 rounded-lg bg-primary py-2.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">{form.id ? "Save changes" : "Create campaign"}</button>
              {form.id && <button onClick={() => setForm({ ...EMPTY_CAMPAIGN })} className="rounded-lg border border-border px-4 text-[11px] font-semibold hover:bg-muted">Cancel</button>}
            </div>
          </div>
        </section>
        <section className="min-w-0">
          <div className="grid grid-cols-3 gap-3">
            <SmallMetric label="Active" value={promotions.filter((p) => p.status === "active").length} />
            <SmallMetric label="Impressions" value={compact(promotions.reduce((sum, p) => sum + Number(p.impressions || 0), 0))} />
            <SmallMetric label="Clicks" value={compact(promotions.reduce((sum, p) => sum + Number(p.clicks || 0), 0))} />
          </div>
          <div className="mt-4 space-y-3">
            {promotions.length ? promotions.map((promo) => {
              const promoCtr = Number(promo.impressions) > 0 ? ((Number(promo.clicks) / Number(promo.impressions)) * 100).toFixed(1) : "0.0";
              return (
                <div key={promo.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{promo.title}</p>
                      <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                        {promo.sponsor_username ? `Sponsored for @${promo.sponsor_username}` : "House campaign"} · {promo.audience === "free_members" ? "Free members" : "Everyone"}
                        {promo.starts_at ? ` · ${formatDate(promo.starts_at)} → ${promo.ends_at ? formatDate(promo.ends_at) : "no end"}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={promo.status} />
                  </div>
                  {promo.body && <p className="mt-3 line-clamp-2 rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">{promo.body}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{compact(promo.impressions)}</span> impressions · <span className="font-semibold text-foreground">{compact(promo.clicks)}</span> clicks · <span className="font-semibold text-foreground">{promoCtr}%</span> CTR</p>
                    <div className="flex items-center gap-1.5">
                      <select disabled={busy} value={promo.status} onChange={(e) => runAction("admin_set_promotion_status", { target_promotion_id: promo.id, new_status: e.target.value })} className="h-8 rounded-lg border border-border bg-background px-2 text-[10.5px] font-semibold outline-none">
                        <option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
                      </select>
                      <button title="Edit campaign" onClick={() => edit(promo)} className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                      <button title="Delete campaign" disabled={busy} onClick={() => { if (confirm(`Delete campaign "${promo.title}"?`)) runAction("admin_delete_promotion", { target_promotion_id: promo.id }); }} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            }) : <EmptyState Icon={Megaphone} title="No campaigns yet" detail="Create your first sponsored placement with the form." />}
          </div>
        </section>
      </div>
    </div>
  );
}

function HealthRow({ Icon, label, value, status }: any) { return <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"><Icon className="h-4 w-4" /></div><div className="flex-1"><p className="text-[11px] font-semibold">{label}</p><p className="mt-0.5 text-[9px] text-emerald-600">{status}</p></div><span className="text-[14px] font-semibold tabular-nums">{value}</span></div>; }
function SmallMetric({ label, value }: any) { return <div className="rounded-lg border border-border bg-card p-3"><p className="text-[18px] font-semibold tabular-nums">{value}</p><p className="mt-1 text-[9.5px] text-muted-foreground">{label}</p></div>; }
function StatusBadge({ status }: { status?: string }) { const positive = ["active", "resolved", "open"].includes(status || ""); const warning = ["reviewing", "paused", "draft"].includes(status || ""); return <span className={`rounded-full px-2 py-1 text-[9px] font-semibold capitalize ${positive ? "bg-emerald-500/10 text-emerald-600" : warning ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600"}`}>{status || "unknown"}</span>; }
function ActionButton({ label, onClick, disabled, primary }: any) { return <button disabled={disabled} onClick={onClick} className={`rounded-lg px-3 py-2 text-[10.5px] font-semibold disabled:opacity-50 ${primary ? "bg-primary text-primary-foreground" : "border border-border bg-background hover:bg-muted"}`}>{label}</button>; }
function Avatar({ user }: { user: any }) { const name = user.full_name || user.username || "Z"; return <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">{user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-primary/10 text-[11px] font-semibold text-primary">{name.charAt(0).toUpperCase()}</div>}</div>; }
function EmptyLine({ text }: { text: string }) { return <p className="py-6 text-center text-[10.5px] text-muted-foreground">{text}</p>; }
function EmptyState({ Icon, title, detail }: any) { return <div className="rounded-lg border border-border bg-card px-5 py-14 text-center"><Icon className="mx-auto h-6 w-6 text-muted-foreground" /><h3 className="mt-3 text-[14px] font-semibold">{title}</h3><p className="mt-1 text-[10.5px] text-muted-foreground">{detail}</p></div>; }
function AdminLoading() { return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background"><div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Loading control center</p></div>; }
