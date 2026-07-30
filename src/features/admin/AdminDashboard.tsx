import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  Ban,
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
  Loader2,
  MessageSquareText,
  PackageOpen,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Store,
  Users,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

type AdminTab = "overview" | "people" | "moderation" | "learning" | "community" | "marketplace" | "commerce" | "system";

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
  { id: "people", label: "People", Icon: Users },
  { id: "moderation", label: "Moderation", Icon: FileWarning },
  { id: "learning", label: "Learning", Icon: GraduationCap },
  { id: "community", label: "Community", Icon: UsersRound },
  { id: "marketplace", label: "Marketplace", Icon: BriefcaseBusiness },
  { id: "commerce", label: "Commerce", Icon: CircleDollarSign },
  { id: "system", label: "System", Icon: Settings2 },
];

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
        admin_update_platform_setting: "Platform setting updated",
      };
      toast.success(messages[variables.fn] || "Change saved");
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["gig-marketplace"] });
    },
    onError: (error: any) => toast.error(error.message || "The admin action could not be completed"),
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
        <aside className="hidden min-h-[calc(100vh-64px)] border-r border-border/70 px-3 py-5 lg:block">
          <p className="px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Operations</p>
          <nav className="mt-3 space-y-1">{NAV_ITEMS.map(({ id, label, Icon }) => <AdminNavButton key={id} active={activeTab === id} label={label} Icon={Icon} onClick={() => setActiveTab(id)} badge={id === "moderation" ? data.metrics.open_reports : undefined} />)}</nav>
          <div className="mt-8 border-t border-border pt-5"><div className="rounded-lg bg-[#171218] p-4 text-white"><HeartPulse className="h-4 w-4 text-[#f06ac3]" /><p className="mt-3 text-[12px] font-semibold">Platform pulse</p><p className="mt-1 text-[10.5px] leading-relaxed text-white/55">{compact(data.metrics.notifications_24h)} notifications delivered in the last 24 hours.</p></div></div>
        </aside>

        <main className="min-w-0 px-4 pb-12 pt-4 md:px-6 md:pt-6 xl:px-8">
          <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border lg:hidden no-scrollbar">{NAV_ITEMS.map(({ id, label, Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`relative flex h-11 shrink-0 items-center gap-1.5 px-3 text-[11px] font-semibold ${activeTab === id ? "text-foreground" : "text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}{activeTab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}</button>)}</div>

          {activeTab === "overview" && <Overview snapshot={data} format={format} onNavigate={setActiveTab} />}
          {activeTab === "people" && <People users={filteredUsers} search={userSearch} setSearch={setUserSearch} type={userType} setType={setUserType} busy={action.isPending} runAction={runAction} />}
          {activeTab === "moderation" && <Moderation reports={data.reports} busy={action.isPending} runAction={runAction} />}
          {activeTab === "learning" && <Learning bootcamps={data.bootcamps} format={format} busy={action.isPending} runAction={runAction} />}
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

function Learning({ bootcamps, format, busy, runAction }: any) { return <div><SectionHeading eyebrow="Learning operations" title="Bootcamps and delivery" detail="Monitor providers, learners, pricing, and publishing status." /><div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{bootcamps.map((bootcamp: any) => <div key={bootcamp.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_100px_120px_130px] md:items-center"><div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{bootcamp.title}</p><p className="mt-1 text-[9.5px] text-muted-foreground">@{bootcamp.creator_username || "provider"} · {bootcamp.creator_type || "Tutor"} · {bootcamp.category}</p></div><div><p className="text-[11px] font-semibold tabular-nums">{compact(bootcamp.learners)}</p><p className="text-[9px] text-muted-foreground">Learners</p></div><div><p className="text-[11px] font-semibold tabular-nums">{format(bootcamp.price)}</p><p className="text-[9px] text-muted-foreground">Price</p></div><select disabled={busy} value={bootcamp.status} onChange={(e) => runAction("admin_update_bootcamp_status", { target_bootcamp_id: bootcamp.id, new_status: e.target.value })} className="h-9 rounded-lg border border-border bg-background px-2 text-[10.5px] font-semibold outline-none"><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option></select></div>)}</div></div>; }

function Community({ clubs, posts }: any) { return <div><SectionHeading eyebrow="Community operations" title="Clubs and publishing" detail="Visibility into the spaces and conversations shaping the network." /><div className="grid gap-6 xl:grid-cols-2"><section><h2 className="mb-3 text-[13px] font-semibold">Newest clubs</h2><div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{clubs.slice(0, 15).map((club: any) => <div key={club.id} className="flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-violet-500/10 text-violet-600"><UsersRound className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{club.name}</p><p className="mt-0.5 text-[9.5px] text-muted-foreground">{club.category} · @{club.creator_username || "builder"}</p></div><div className="text-right"><p className="text-[11px] font-semibold">{compact(club.members)}</p><p className="text-[8.5px] text-muted-foreground">members</p></div></div>)}</div></section><section><h2 className="mb-3 text-[13px] font-semibold">Latest posts</h2><div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{posts.slice(0, 15).map((post: any) => <div key={post.id} className="p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold">@{post.author_username || "builder"}</p><span className="text-[9px] text-muted-foreground">{formatTime(post.created_at)}</span></div><p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-foreground/80">{post.content}</p><p className="mt-2 text-[9px] text-muted-foreground">{compact(post.likes_count)} likes · {compact(post.comments_count)} comments · {compact(post.reposts_count)} reposts</p></div>)}</div></section></div></div>; }

function Marketplace({ gigs, format, busy, runAction }: any) { return <div><SectionHeading eyebrow="Marketplace operations" title="Gigs and proposals" detail="Review institutional listings, budgets, demand, and marketplace status." /><div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{gigs.map((gig: any) => <div key={gig.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_140px_100px_120px] md:items-center"><div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{gig.title}</p><p className="mt-1 text-[9.5px] text-muted-foreground">{gig.client_name || `@${gig.client_username || "institution"}`} · {gig.category} · {gig.location_type}</p></div><div><p className="text-[10.5px] font-semibold">{format(gig.budget_min)} - {format(gig.budget_max)}</p><p className="text-[8.5px] text-muted-foreground">Budget</p></div><div><p className="text-[11px] font-semibold">{compact(gig.applications_count)}</p><p className="text-[8.5px] text-muted-foreground">Proposals</p></div><select disabled={busy} value={gig.status} onChange={(e) => runAction("admin_update_gig_status", { target_gig_id: gig.id, new_status: e.target.value })} className="h-9 rounded-lg border border-border bg-background px-2 text-[10.5px] font-semibold outline-none"><option value="open">Open</option><option value="paused">Paused</option><option value="closed">Closed</option></select></div>)}</div></div>; }

function Commerce({ snapshot, format }: { snapshot: Snapshot; format: (value: number) => string }) { const m = snapshot.metrics; return <div><SectionHeading eyebrow="Commerce operations" title="Creator economy" detail="Monitor value moving through wallets, gifts, licences, and the Zero Store." /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><MetricCard Icon={WalletCards} label="Wallet balances" value={format(m.wallet_balance)} detail="Member balances" tone="bg-sky-500/10 text-sky-600" /><MetricCard Icon={Store} label="Store listings" value={compact(m.store_items)} detail="Digital products" tone="bg-violet-500/10 text-violet-600" /><MetricCard Icon={CircleDollarSign} label="Gift value" value={format(m.gift_value)} detail={`${compact(m.gift_cards)} gift cards`} tone="bg-emerald-500/10 text-emerald-600" /><MetricCard Icon={PackageOpen} label="Licences" value={compact(m.licences)} detail="ZeroHub ownership rights" tone="bg-amber-500/10 text-amber-600" /></div><section className="mt-7 border-t border-border pt-5"><h2 className="text-[14px] font-semibold">Recent store inventory</h2><div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{snapshot.store_items.map((item) => <div key={item.id} className="flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><Store className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{item.name}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{item.category || "Digital product"} · @{item.seller_username || "creator"}</p></div><div className="text-right"><p className="text-[11px] font-semibold">{item.price_type === "Coins" ? format(item.price) : `${compact(item.price)} XP`}</p><p className="text-[8.5px] text-muted-foreground">{formatDate(item.created_at)}</p></div></div>)}</div></section></div>; }

function System({ snapshot, busy, runAction }: any) { const m = snapshot.metrics; return <div><SectionHeading eyebrow="Platform operations" title="System controls" detail="Manage availability, review rules, delivery health, and admin accountability." /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><section><h2 className="text-[14px] font-semibold">Platform settings</h2><div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{snapshot.settings.map((setting: any) => { const enabled = setting.value === true || setting.value === "true"; return <div key={setting.key} className="flex items-center gap-4 p-4"><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">{String(setting.key).replaceAll("_", " ")}</p><p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">{setting.description}</p></div><button disabled={busy} onClick={() => runAction("admin_update_platform_setting", { setting_key: setting.key, setting_value: !enabled })} className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} /></button></div>; })}</div></section><section><h2 className="text-[14px] font-semibold">Delivery health</h2><div className="mt-3 space-y-3"><HealthRow Icon={BellRing} label="Push devices" value={compact(m.push_devices)} status="Connected" /><HealthRow Icon={MessageSquareText} label="Notifications, 24h" value={compact(m.notifications_24h)} status="Delivering" /><HealthRow Icon={Activity} label="Weekly posts" value={compact(m.posts_7d)} status="Active" /></div></section></div><div className="mt-7"><AuditList logs={snapshot.audit_logs} /></div></div>; }

function HealthRow({ Icon, label, value, status }: any) { return <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600"><Icon className="h-4 w-4" /></div><div className="flex-1"><p className="text-[11px] font-semibold">{label}</p><p className="mt-0.5 text-[9px] text-emerald-600">{status}</p></div><span className="text-[14px] font-semibold tabular-nums">{value}</span></div>; }
function SmallMetric({ label, value }: any) { return <div className="rounded-lg border border-border bg-card p-3"><p className="text-[18px] font-semibold tabular-nums">{value}</p><p className="mt-1 text-[9.5px] text-muted-foreground">{label}</p></div>; }
function StatusBadge({ status }: { status?: string }) { const positive = ["active", "resolved", "open"].includes(status || ""); const warning = ["reviewing", "paused"].includes(status || ""); return <span className={`rounded-full px-2 py-1 text-[9px] font-semibold capitalize ${positive ? "bg-emerald-500/10 text-emerald-600" : warning ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600"}`}>{status || "unknown"}</span>; }
function ActionButton({ label, onClick, disabled, primary }: any) { return <button disabled={disabled} onClick={onClick} className={`rounded-lg px-3 py-2 text-[10.5px] font-semibold disabled:opacity-50 ${primary ? "bg-primary text-primary-foreground" : "border border-border bg-background hover:bg-muted"}`}>{label}</button>; }
function Avatar({ user }: { user: any }) { const name = user.full_name || user.username || "Z"; return <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">{user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center bg-primary/10 text-[11px] font-semibold text-primary">{name.charAt(0).toUpperCase()}</div>}</div>; }
function EmptyLine({ text }: { text: string }) { return <p className="py-6 text-center text-[10.5px] text-muted-foreground">{text}</p>; }
function EmptyState({ Icon, title, detail }: any) { return <div className="rounded-lg border border-border bg-card px-5 py-14 text-center"><Icon className="mx-auto h-6 w-6 text-muted-foreground" /><h3 className="mt-3 text-[14px] font-semibold">{title}</h3><p className="mt-1 text-[10.5px] text-muted-foreground">{detail}</p></div>; }
function AdminLoading() { return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background"><div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Loading control center</p></div>; }
