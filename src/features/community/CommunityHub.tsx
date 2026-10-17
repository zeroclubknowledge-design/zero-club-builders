import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Camera,
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "@/components/icons/glyphs";
import { IconHome } from "@/components/icons/nav";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ChatMediaGrid, type ChatVisual } from "@/components/ChatMediaGrid";
import { ImageLightbox } from "@/components/ImageLightbox";
import { UsernamePicker } from "@/components/UsernamePicker";
import { decodeChatMedia, encodeChatMedia, getChatMediaType } from "@/hooks/useVoiceRecorder";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { compressImage } from "@/lib/imageCompression";
import { supabase } from "@/lib/supabase";

/*
 * A club is a community. Its home works like a Teams workspace — Home,
 * Announcements, Meetings, Cohorts, Members, Teaching staff — and the chat
 * rooms (General, Assignments, Quiz, Q&A…) live inside each cohort.
 *
 * Who may do what is decided in the database (club_hub, join_club,
 * join_club_cohort, create_club_cohort, set_community_staff…); this screen
 * only shows what the server says.
 */

export type HubSection = "home" | "announcements" | "meetings" | "cohorts" | "members" | "staff" | "settings";

type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
type Cohort = {
  id: string; name: string; skill: string | null; description: string | null; banner_url: string | null; logo_url: string | null;
  join_mode: "open" | "approval" | "bootcamp" | "invite"; bootcamp_id: string | null; bootcamp_title: string | null; bootcamp_price: number | null;
  status: string; members: number; my_status: "member" | "pending" | null; created_at: string;
};
type Meeting = { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; meeting_url: string | null; status: string; cohort_id: string | null; cohort_name: string | null };
type Announcement = { id: string; body: string; pinned: boolean; created_at: string; edited_at: string | null; author: Person };
type Hub = {
  redirect_cohort?: boolean; parent_club_id?: string;
  club: { id: string; name: string; description: string | null; category: string | null; banner_url: string | null; logo_url: string | null; rules: string | null;
    is_private: boolean | null; requires_approval: boolean | null; subscription_fee: number | null; access_free: boolean | null; creator_id: string; entry_fee: number };
  owner: Person | null;
  me: { member: boolean; admin: boolean; role: string | null; is_owner: boolean; requested: boolean };
  counts: { members: number; cohorts: number; staff: number };
  cohorts: Cohort[];
  staff: (Person & { headline: string | null; is_owner: boolean; role: string })[];
  meetings: Meeting[];
  announcements: Announcement[];
  requests: { id: string; cohort_id: string; cohort_name: string; message: string | null; created_at: string; profile: Person }[];
};

const PINK = "#cc208f";
const MEDIA = "$$MEDIA$$";
const rpc = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name as never, (args || {}) as never);
  if (error) throw error;
  return data as T;
};
const btnPrimary = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50";
const btnGhost = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border px-4 text-[13.5px] font-semibold transition hover:bg-foreground/[0.04] active:scale-[0.98] disabled:opacity-50";
const field = "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40";
const area = "w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40";
const label = "mb-1.5 block text-[12.5px] font-semibold text-muted-foreground";
const nameOf = (p?: Partial<Person> | null) => p?.full_name?.trim() || p?.username || "Member";

function Avatar({ url, name, size = 36, square }: { url?: string | null; name?: string | null; size?: number; square?: boolean }) {
  return url ? (
    <img src={url} alt="" className={`shrink-0 object-cover ${square ? "rounded-[12px]" : "rounded-full"}`} style={{ width: size, height: size }} />
  ) : (
    <span className={`grid shrink-0 place-items-center bg-[#cc208f]/12 font-semibold text-[#cc208f] ${square ? "rounded-[12px]" : "rounded-full"}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function SectionHeader({ title, sub, onBack, action }: { title: string; sub?: string | null; onBack?: () => void; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-2 border-b border-border bg-background/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:px-6">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.05] md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1 py-2">
        <h2 className="truncate font-display text-[17px] font-semibold leading-tight">{title}</h2>
        {sub && <p className="truncate text-[12.5px] text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[420px] px-6 py-16 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]">{icon}</span>
      <p className="mt-4 font-display text-[17px] font-semibold">{title}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-display text-[15.5px] font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Sheet({ open, onOpenChange, title, body, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body?: string; children: ReactNode }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent overlayClassName="z-[10090]" className="z-[10100] mx-auto max-h-[92dvh] max-w-lg border-none bg-background">
        <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <h3 className="font-display text-[19px] font-semibold">{title}</h3>
          {body && <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>}
          <div className="mt-4">{children}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const whenOf = (m: Meeting) => {
  const s = new Date(m.starts_at);
  const end = m.ends_at ? new Date(m.ends_at) : null;
  return `${s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${end ? ` – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;
};
const meetingEnd = (m: Meeting) => (m.ends_at ? new Date(m.ends_at).getTime() : new Date(m.starts_at).getTime() + 2 * 3_600_000);

/* ── page ─────────────────────────────────────────────────────────────── */

export function CommunityHubPage({ clubId, section }: { clubId: string; section?: string }) {
  const navigate = useNavigate();
  const hub = useQuery({ queryKey: ["club-hub", clubId], queryFn: () => rpc<Hub>("club_hub", { p_club: clubId }), retry: false });
  const go = (s?: HubSection) => navigate({ to: "/app/clubs/$clubId", params: { clubId }, search: (s ? { s } : {}) as never, replace: Boolean(s) });
  const active = ((section as HubSection) || "home") as HubSection;
  const openOnPhone = Boolean(section);

  if (hub.isLoading) {
    return <Shell><div className="grid flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></Shell>;
  }
  const h = hub.data;
  if (h?.redirect_cohort) {
    // A cohort id ended up here: open its chat rooms instead.
    void navigate({ to: "/app/clubs/chat", search: { clubId } as never, replace: true });
    return <Shell><div className="grid flex-1 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></Shell>;
  }
  if (hub.error || !h) {
    return (
      <Shell>
        <Empty icon={<Users className="h-6 w-6" />} title="This club couldn't be opened" body="It may have been removed, or your connection dropped." action={<Link to="/app/clubs" className={btnPrimary}>All clubs</Link>} />
      </Shell>
    );
  }

  const back = () => go();
  const content = (() => {
    switch (active) {
      case "announcements": return <AnnouncementsView h={h} onBack={back} />;
      case "meetings": return <MeetingsView h={h} onBack={back} />;
      case "cohorts": return <CohortsView h={h} onBack={back} />;
      case "members": return <MembersView h={h} onBack={back} />;
      case "staff": return <StaffView h={h} onBack={back} />;
      case "settings": return h.me.is_owner ? <SettingsView h={h} onBack={back} /> : <HomeView h={h} go={go} onBack={back} />;
      default: return <HomeView h={h} go={go} onBack={back} />;
    }
  })();

  return (
    <Shell>
      <aside className={`${openOnPhone ? "hidden" : "flex"} min-h-0 w-full flex-col md:flex md:w-[268px] md:shrink-0 md:border-r md:border-border`}>
        <HubNav h={h} active={active} go={go} />
      </aside>
      <main className={`${openOnPhone ? "flex" : "hidden"} @container min-h-0 min-w-0 flex-1 flex-col md:flex`}>{content}</main>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="zc-chat-panel fixed inset-0 z-[60] flex bg-background md:left-[var(--zc-sidebar-w,280px)] md:border-l md:border-border/60" style={{ height: "100dvh" }}>
      {children}
    </div>
  );
}

/* ── left rail ────────────────────────────────────────────────────────── */

function HubNav({ h, active, go }: { h: Hub; active: HubSection; go: (s?: HubSection) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const myCohorts = h.cohorts.filter((c) => c.my_status === "member");
  const upcoming = h.meetings.filter((m) => m.status !== "cancelled" && meetingEnd(m) > Date.now()).length;

  const leave = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      const me = data.user!.id;
      const ids = [h.club.id, ...h.cohorts.map((c) => c.id)];
      const { error } = await supabase.from("club_members").delete().eq("profile_id", me).in("club_id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`You left ${h.club.name}`);
      void queryClient.invalidateQueries({ queryKey: ["clubs_data"] });
      navigate({ to: "/app/clubs" });
    },
    onError: (e: any) => toast.error(e?.message || "Could not leave"),
  });

  const share = async () => {
    const url = `${window.location.origin}/club/${h.club.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: h.club.name, url }); return; }
    } catch { /* dismissed */ }
    await navigator.clipboard.writeText(url);
    toast.success("Club link copied");
  };

  const item = (key: HubSection, text: string, icon: ReactNode, badge?: number) => {
    const on = active === key;
    return (
      <button key={key} type="button" onClick={() => go(key)}
        className={`group flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] transition md:h-9 md:text-[14px] ${on ? "bg-[#cc208f] font-semibold text-white" : "font-medium text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground"}`}>
        <span className={`shrink-0 ${on ? "text-white" : "text-muted-foreground group-hover:text-foreground"}`}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{text}</span>
        {Boolean(badge) && <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${on ? "bg-white text-[#cc208f]" : "bg-[#cc208f] text-white"}`}>{badge! > 99 ? "99+" : badge}</span>}
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground md:hidden ${on ? "hidden" : ""}`} />
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0 overflow-hidden border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${PINK}, transparent 60%)` }} />
        <div className="relative flex items-center gap-1 px-2 pt-2">
          <Link to="/app/clubs" aria-label="All clubs" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="flex-1 text-[13px] font-semibold text-muted-foreground">Clubs</span>
          <button type="button" onClick={() => void share()} aria-label="Share club" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]"><Share2 className="h-[18px] w-[18px]" /></button>
        </div>
        <div className="relative flex items-center gap-3 px-4 pb-4 pt-1">
          <Avatar url={h.club.logo_url || h.club.banner_url} name={h.club.name} size={44} square />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16.5px] font-semibold leading-tight">{h.club.name}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">Community · {h.counts.members.toLocaleString()} {h.counts.members === 1 ? "member" : "members"}</p>
            <p className="mt-1.5">
              <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold ${h.me.is_owner ? "bg-foreground text-background" : h.me.admin ? "bg-[#cc208f] text-white" : h.me.member ? "bg-foreground/[0.06] text-muted-foreground" : "bg-[#cc208f]/12 text-[#cc208f]"}`}>
                {h.me.is_owner ? "Owner" : h.me.admin ? "Teaching staff" : h.me.member ? "Member" : "Not joined yet"}
              </span>
            </p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3 no-scrollbar">
        {item("home", "Home", <IconHome className="h-[18px] w-[18px]" />)}
        {item("announcements", "Announcements", <Megaphone className="h-[18px] w-[18px]" />)}
        {item("meetings", "Meetings", <Calendar className="h-[18px] w-[18px]" />, h.me.member ? upcoming : 0)}
        {item("cohorts", "Cohorts", <GraduationCap className="h-[18px] w-[18px]" />, h.me.admin ? h.requests.length : 0)}
        {item("staff", "Teaching staff", <BadgeCheck className="h-[18px] w-[18px]" />)}
        {item("members", "Members", <Users className="h-[18px] w-[18px]" />)}
        {h.me.is_owner && item("settings", "Settings", <Settings className="h-[18px] w-[18px]" />)}

        {myCohorts.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your cohorts</p>
            {myCohorts.map((c) => (
              <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id } as never}
                className="group flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground md:h-9 md:text-[14px]">
                <Avatar url={c.logo_url || c.banner_url} name={c.name} size={22} square />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </>
        )}
      </nav>

      {h.me.member && !h.me.is_owner && (
        <div className="shrink-0 border-t border-border px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => { if (confirm(`Leave ${h.club.name}? You'll also leave its cohorts.`)) leave.mutate(); }}
            className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-rose-600">
            <LogOut className="h-[18px] w-[18px]" /> Leave club
          </button>
        </div>
      )}
    </div>
  );
}

/* ── join the community ───────────────────────────────────────────────── */

function JoinCommunityCard({ h }: { h: Hub }) {
  const { format } = useWalletCurrency();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fee = Number(h.club.entry_fee || 0);
  const needsApproval = Boolean(h.club.is_private || h.club.requires_approval);
  const join = useMutation({
    mutationFn: () => rpc<any>("join_club", { p_club_id: h.club.id }),
    onSuccess: (r) => {
      if (r?.status === "insufficient_funds") {
        toast.error(`${format(Number(r.fee) || fee)} is needed to join.`, { description: `Add ${format(Number(r.shortfall) || 0)} to your wallet.`, action: { label: "Add money", onClick: () => navigate({ to: "/app/wallet/add-money" }) } });
        return;
      }
      toast.success(r?.status === "requested" ? "Request sent to the club team" : `Welcome to ${h.club.name}!`);
      void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] });
      void queryClient.invalidateQueries({ queryKey: ["clubs_data"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not join"),
  });
  if (h.me.member) return null;
  return (
    <div className="rounded-2xl border border-[#cc208f]/30 bg-[#cc208f]/[0.05] p-4 md:p-5">
      <p className="font-display text-[16px] font-semibold">{h.me.requested ? "Your request is with the club team" : `Join ${h.club.name}`}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
        {h.me.requested ? "You'll get a notification as soon as they decide." : "Members get the announcements, meetings and access to the cohorts inside this club."}
      </p>
      {!h.me.requested && (
        <button type="button" disabled={join.isPending} onClick={() => join.mutate()} className={`${btnPrimary} mt-3`}>
          {join.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {needsApproval ? "Request to join" : fee > 0 ? `Join for ${format(fee)}` : "Join club"}
        </button>
      )}
    </div>
  );
}

/* ── home ─────────────────────────────────────────────────────────────── */

function HomeView({ h, go, onBack }: { h: Hub; go: (s?: HubSection) => void; onBack: () => void }) {
  const myCohorts = h.cohorts.filter((c) => c.my_status === "member");
  const next = h.meetings.filter((m) => m.status !== "cancelled" && meetingEnd(m) > Date.now())[0];
  const latest = h.announcements[0];
  const greeting = (() => { const hr = new Date().getHours(); return hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"; })();
  const stats = [
    { label: "Members", value: h.counts.members, s: "members" as const },
    { label: "Cohorts", value: h.counts.cohorts, s: "cohorts" as const },
    { label: "Teaching staff", value: Math.max(1, h.counts.staff), s: "staff" as const },
    { label: "Upcoming meetings", value: h.meetings.filter((m) => m.status !== "cancelled" && meetingEnd(m) > Date.now()).length, s: "meetings" as const },
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Home" sub={h.club.name} onBack={onBack} />
      <div className="relative overflow-hidden">
        <div className="h-36 w-full md:h-44" style={{ background: h.club.banner_url ? undefined : `linear-gradient(135deg, #2a0b20, ${PINK} 140%)` }}>
          {h.club.banner_url && <img src={h.club.banner_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="mx-auto max-w-[920px] px-4 md:px-8">
          <div className="-mt-9"><span className="inline-block rounded-[18px] ring-4 ring-background"><Avatar url={h.club.logo_url || h.club.banner_url} name={h.club.name} size={76} square /></span></div>
          <p className="mt-3 text-[13px] font-medium text-muted-foreground">{h.me.member ? `${greeting} — welcome to` : "Community"}</p>
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">{h.club.name}</h1>
          {h.club.description && <p className="mt-1.5 max-w-[640px] whitespace-pre-line text-[14.5px] leading-relaxed text-foreground/75">{h.club.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            {h.club.category && <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 font-semibold">{h.club.category}</span>}
            {h.club.is_private && <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Private</span>}
            {h.owner && (
              <Link to="/app/profile/$id" params={{ id: h.owner.username || h.owner.id }} className="inline-flex items-center gap-1.5 font-semibold text-foreground/80">
                <Avatar url={h.owner.avatar_url} name={nameOf(h.owner)} size={20} /> {nameOf(h.owner)}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] space-y-6 px-4 pb-16 pt-6 md:px-8">
        <JoinCommunityCard h={h} />

        <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-4">
          {stats.map((s) => (
            <button key={s.label} type="button" onClick={() => go(s.s)} className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-foreground/25">
              <p className="font-display text-[26px] font-semibold tabular-nums leading-none">{s.value}</p>
              <p className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">{s.label}</p>
            </button>
          ))}
        </div>

        {h.me.admin && h.requests.length > 0 && (
          <Panel title={`Requests to join cohorts · ${h.requests.length}`} action={<button type="button" onClick={() => go("cohorts")} className="text-[13px] font-semibold text-[#cc208f]">Review</button>}>
            <p className="text-[13.5px] text-muted-foreground">{h.requests.slice(0, 3).map((r) => `${nameOf(r.profile)} → ${r.cohort_name}`).join(" · ")}{h.requests.length > 3 ? "…" : ""}</p>
          </Panel>
        )}

        <Panel title="Your cohorts" action={<button type="button" onClick={() => go("cohorts")} className="text-[13px] font-semibold text-[#cc208f]">All cohorts</button>}>
          {myCohorts.length ? (
            <div className="divide-y divide-border">
              {myCohorts.map((c) => (
                <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id } as never} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar url={c.logo_url || c.banner_url} name={c.name} size={42} square />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{[c.skill, `${c.members} members`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-[13px] font-semibold text-[#cc208f]">Open</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              {h.cohorts.length ? "You're not in a cohort yet. Pick one to get the class chat, assignments, quizzes and Q&A." : h.me.admin ? "Create the first cohort — one for each skill you teach." : "No cohorts yet. The club team will open them soon."}
            </p>
          )}
        </Panel>

        {h.me.member && (
          <div className="grid gap-4 @2xl:grid-cols-2">
            <Panel title="Next meeting" action={<button type="button" onClick={() => go("meetings")} className="text-[13px] font-semibold text-[#cc208f]">All</button>}>
              {next ? <MeetingRow h={h} m={next} compact /> : <p className="text-[13.5px] text-muted-foreground">Nothing scheduled.</p>}
            </Panel>
            <Panel title="Latest announcement" action={<button type="button" onClick={() => go("announcements")} className="text-[13px] font-semibold text-[#cc208f]">All</button>}>
              {latest ? (
                <div>
                  <p className="line-clamp-4 whitespace-pre-line text-[14px] leading-relaxed">{latest.body.split(MEDIA)[0].trim() || "Shared an attachment"}</p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">{nameOf(latest.author)} · {new Date(latest.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</p>
                </div>
              ) : <p className="text-[13.5px] text-muted-foreground">No announcements yet.</p>}
            </Panel>
          </div>
        )}

        {h.club.rules && (
          <Panel title="Club rules"><p className="whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/80">{h.club.rules}</p></Panel>
        )}
      </div>
    </div>
  );
}

/* ── announcements ────────────────────────────────────────────────────── */

function splitBody(body: string) {
  const [text, mediaPart] = String(body || "").split(MEDIA);
  const media = mediaPart ? mediaPart.split(",").filter(Boolean).map(decodeChatMedia) : [];
  return {
    text: (text || "").trim(),
    visuals: media.filter((m) => m.type === "image" || m.type === "video") as (ChatVisual & { name?: string })[],
    files: media.filter((m) => m.type !== "image" && m.type !== "video"),
  };
}

function AnnouncementsView({ h, onBack }: { h: Hub; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number; types: ("image" | "video")[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] });

  const post = async () => {
    const text = draft.trim();
    if ((!text && !files.length) || sending) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let body = text;
      if (files.length) {
        const tokens: string[] = [];
        for (const original of files) {
          const file = original.type.startsWith("image/") ? await compressImage(original) : original;
          const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
          const path = `${user!.id}/club-${h.club.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error } = await supabase.storage.from("post-media").upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
          if (error) throw error;
          tokens.push(encodeChatMedia(getChatMediaType(file), supabase.storage.from("post-media").getPublicUrl(path).data.publicUrl, original.name));
        }
        body = `${text}\n\n${MEDIA}${tokens.join(",")}`.trim();
      }
      const { error } = await supabase.from("club_announcements" as never).insert({ club_id: h.club.id, author_id: user!.id, body } as never);
      if (error) throw error;
      setDraft(""); setFiles([]);
      toast.success("Announcement posted", { description: "Every member has been notified." });
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not post");
    } finally {
      setSending(false);
    }
  };
  const pin = useMutation({
    mutationFn: async (a: Announcement) => {
      const { error } = await supabase.from("club_announcements" as never).update({ pinned: !a.pinned } as never).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });
  const remove = useMutation({
    mutationFn: (a: Announcement) => rpc("remove_club_hub_item", { p_kind: "announcement", p_id: a.id }),
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionHeader title="Announcements" sub={h.me.admin ? "Only the club team can post here" : "From the club team"} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-3 px-4 py-5 md:px-8">
          {!h.me.member ? <JoinCommunityCard h={h} /> : h.announcements.length === 0 ? (
            <Empty icon={<Megaphone className="h-6 w-6" />} title="No announcements yet" body={h.me.admin ? "Share news, timetables and wins with the whole club. Members are notified." : "Club news will appear here."} />
          ) : h.announcements.map((a) => {
            const { text, visuals, files: docs } = splitBody(a.body);
            return (
              <article key={a.id} className={`rounded-2xl border bg-card p-4 ${a.pinned ? "border-[#cc208f]/40" : "border-border"}`}>
                <div className="flex items-center gap-2.5">
                  <Avatar url={a.author?.avatar_url} name={nameOf(a.author)} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{nameOf(a.author)}</p>
                    <p className="text-[12px] text-muted-foreground">{new Date(a.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{a.pinned ? " · Pinned" : ""}</p>
                  </div>
                  {h.me.admin && (
                    <>
                      <button type="button" aria-label={a.pinned ? "Unpin" : "Pin"} onClick={() => pin.mutate(a)} className={`grid h-9 w-9 place-items-center rounded-full hover:bg-foreground/[0.05] ${a.pinned ? "text-[#cc208f]" : "text-muted-foreground"}`}><Pin className="h-4 w-4" /></button>
                      <button type="button" aria-label="Remove" onClick={() => confirm("Remove this announcement?") && remove.mutate(a)} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05]"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
                {text && <div className="mt-2.5 whitespace-pre-line text-[14.5px] leading-relaxed"><LinkifiedText text={text} /></div>}
                {visuals.length > 0 && (
                  <div className="mt-2.5 max-w-[480px]">
                    <ChatMediaGrid items={visuals} mine={false} onOpen={(i) => setViewer({ urls: visuals.map((v) => v.url), index: i, types: visuals.map((v) => v.type) })} />
                  </div>
                )}
                {docs.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="mt-2 flex max-w-[480px] items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 hover:border-foreground/25">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#cc208f]/10 text-[#cc208f]"><FileText className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{f.name || "Attachment"}</span>
                  </a>
                ))}
              </article>
            );
          })}
        </div>
      </div>
      {h.me.admin && (
        <div className="shrink-0 border-t border-border bg-background px-3 py-2.5 pb-[calc(0.6rem+env(safe-area-inset-bottom))] md:px-6">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full bg-foreground/[0.06] pl-3 pr-1 text-[12.5px] font-semibold">
                  <span className="truncate">{f.name}</span>
                  <button type="button" aria-label="Remove file" onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-foreground/[0.08]"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt" className="hidden"
              onChange={(e) => { setFiles((cur) => [...cur, ...Array.from(e.target.files || [])].slice(0, 10)); if (fileRef.current) fileRef.current.value = ""; }} />
            <button type="button" aria-label="Attach photos or files" onClick={() => fileRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05]"><Paperclip className="h-5 w-5" /></button>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder="Post an announcement to everyone…" className={`${area} max-h-40 min-h-[44px]`} />
            <button type="button" aria-label="Post" disabled={sending || (!draft.trim() && !files.length)} onClick={() => void post()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#cc208f] text-white disabled:opacity-40">
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}
      {viewer && <ImageLightbox mediaUrls={viewer.urls} initialIndex={viewer.index} mediaTypes={viewer.types} isOpen onClose={() => setViewer(null)} />}
    </div>
  );
}

/* ── meetings ─────────────────────────────────────────────────────────── */

function MeetingRow({ h, m, compact, onCancel, onRemove }: { h: Hub; m: Meeting; compact?: boolean; onCancel?: () => void; onRemove?: () => void }) {
  const navigate = useNavigate();
  const now = Date.now();
  const start = new Date(m.starts_at).getTime();
  const live = m.status !== "cancelled" && start - 15 * 60_000 <= now && now <= meetingEnd(m);
  const join = () => {
    if (m.meeting_url) window.open(m.meeting_url, "_blank", "noopener");
    else void navigate({ to: "/app/live/$classId", params: { classId: m.cohort_id || h.club.id } });
  };
  return (
    <div className="flex items-start gap-3">
      <div className="w-12 shrink-0 rounded-xl bg-foreground/[0.05] py-1.5 text-center">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">{new Date(m.starts_at).toLocaleDateString([], { month: "short" })}</p>
        <p className="text-[18px] font-bold leading-none">{new Date(m.starts_at).getDate()}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[14.5px] font-semibold leading-snug ${m.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{m.title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{whenOf(m)}{m.cohort_name ? ` · ${m.cohort_name}` : " · Whole club"}{m.status === "cancelled" ? " · Cancelled" : ""}</p>
        {!compact && m.description && <p className="mt-1 whitespace-pre-line text-[13px] text-foreground/75">{m.description}</p>}
        {!compact && (onCancel || onRemove) && (
          <div className="mt-2 flex gap-3 text-[12.5px] font-semibold text-muted-foreground">
            {onCancel && start > now && <button type="button" onClick={onCancel}>{m.status === "cancelled" ? "Restore" : "Cancel"}</button>}
            {onRemove && <button type="button" onClick={onRemove}>Remove</button>}
          </div>
        )}
      </div>
      {live && (
        <button type="button" onClick={join} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#cc208f] px-3.5 text-[13px] font-semibold text-white"><Video className="h-3.5 w-3.5" /> Join</button>
      )}
    </div>
  );
}

function MeetingsView({ h, onBack }: { h: Hub; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] });
  const cancel = useMutation({
    mutationFn: async (m: Meeting) => {
      const { error } = await supabase.from("club_meetings" as never).update({ status: m.status === "cancelled" ? "scheduled" : "cancelled" } as never).eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (m: Meeting) => rpc("remove_club_hub_item", { p_kind: "meeting", p_id: m.id }), onSuccess: refresh });
  const now = Date.now();
  const upcoming = h.meetings.filter((m) => meetingEnd(m) >= now);
  const past = h.meetings.filter((m) => meetingEnd(m) < now).reverse();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Meetings" sub="Town halls, live classes and office hours" onBack={onBack}
        action={h.me.admin ? <button type="button" onClick={() => setAdding(true)} className={btnPrimary}><Plus className="h-4 w-4" /> Schedule</button> : undefined} />
      <div className="mx-auto max-w-[760px] space-y-3 px-4 py-5 md:px-8">
        {!h.me.member ? <JoinCommunityCard h={h} /> : upcoming.length === 0 && past.length === 0 ? (
          <Empty icon={<Calendar className="h-6 w-6" />} title="No meetings yet" body={h.me.admin ? "Schedule a live session for the whole club or one cohort. Members are notified and get a Join button 15 minutes before." : "Meetings the club team schedules will appear here."} />
        ) : (
          <>
            {upcoming.map((m) => (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-4">
                <MeetingRow h={h} m={m} onCancel={h.me.admin ? () => cancel.mutate(m) : undefined} onRemove={h.me.admin ? () => confirm("Remove this meeting?") && remove.mutate(m) : undefined} />
              </div>
            ))}
            {upcoming.length === 0 && <p className="py-3 text-center text-[14px] text-muted-foreground">No upcoming meetings.</p>}
            {past.length > 0 && (
              <button type="button" onClick={() => setShowPast((v) => !v)} className="text-[13px] font-semibold text-muted-foreground">{showPast ? "Hide" : "Show"} past meetings ({past.length})</button>
            )}
            {showPast && past.map((m) => <div key={m.id} className="rounded-2xl border border-border bg-card p-4 opacity-75"><MeetingRow h={h} m={m} /></div>)}
          </>
        )}
      </div>
      {h.me.admin && <NewMeetingSheet h={h} open={adding} onOpenChange={setAdding} onSaved={refresh} />}
    </div>
  );
}

function NewMeetingSheet({ h, open, onOpenChange, onSaved }: { h: Hub; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [url, setUrl] = useState("");
  const [cohort, setCohort] = useState("");
  const [description, setDescription] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Give the meeting a title");
      if (!startsAt) throw new Error("Pick a date and time");
      if (url && !/^https?:\/\//i.test(url.trim())) throw new Error("The meeting link must start with https://");
      const { data: { user } } = await supabase.auth.getUser();
      const start = new Date(startsAt);
      const { error } = await supabase.from("club_meetings" as never).insert({
        club_id: h.club.id, cohort_id: cohort || null, title: title.trim(), description: description.trim() || null,
        starts_at: start.toISOString(), ends_at: new Date(start.getTime() + Math.max(15, Number(minutes) || 60) * 60_000).toISOString(),
        meeting_url: url.trim() || null, created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Meeting scheduled", { description: "Members have been notified." }); setTitle(""); setStartsAt(""); setUrl(""); setDescription(""); onOpenChange(false); onSaved(); },
    onError: (e: any) => toast.error(e?.message || "Could not schedule"),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Schedule a meeting" body="Leave the link empty to meet in Zero Club's own live room.">
      <div className="space-y-3">
        <div><span className={label}>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Monthly town hall" className={field} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><span className={label}>Date and time</span><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} /></div>
          <div><span className={label}>Length (minutes)</span><input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={field} /></div>
        </div>
        <div><span className={label}>Who it's for</span>
          <select value={cohort} onChange={(e) => setCohort(e.target.value)} className={field}>
            <option value="">The whole club</option>
            {h.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><span className={label}>Meeting link (optional)</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Google Meet, Zoom… or leave empty" className={field} /></div>
        <div><span className={label}>Agenda (optional)</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={area} /></div>
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className={`${btnPrimary} h-11 w-full`}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Schedule</button>
      </div>
    </Sheet>
  );
}

/* ── cohorts ──────────────────────────────────────────────────────────── */

const MODE: Record<Cohort["join_mode"], { label: string; tone: string }> = {
  open: { label: "Open to members", tone: "bg-success/10 text-success" },
  approval: { label: "Request to join", tone: "bg-[#cc208f]/10 text-[#a3186f]" },
  bootcamp: { label: "Bootcamp", tone: "bg-foreground/[0.07] text-foreground/80" },
  invite: { label: "Invite only", tone: "bg-foreground/[0.07] text-muted-foreground" },
};

function CohortsView({ h, onBack }: { h: Hub; onBack: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Cohort | null>(null);
  const [adding, setAdding] = useState<Cohort | null>(null);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] }); void queryClient.invalidateQueries({ queryKey: ["clubs_data"] }); };

  const join = useMutation({
    mutationFn: (c: Cohort) => rpc<any>("join_club_cohort", { p_cohort: c.id }).then((r) => ({ r, c })),
    onSuccess: ({ r, c }) => {
      if (r?.status === "joined" || r?.status === "member") { toast.success(`You're in ${c.name}`); refresh(); void navigate({ to: "/app/clubs/chat", search: { clubId: c.id } as never }); }
      else if (r?.status === "requested") { toast.success("Request sent", { description: "The club team will review it." }); refresh(); }
      else if (r?.status === "needs_bootcamp") { toast.message("This cohort is for the bootcamp's learners", { description: "Enrol in the bootcamp and you'll be added automatically." }); void navigate({ to: "/app/bootcamps/$id", params: { id: r.bootcamp_id } }); }
      /* You cannot be in a class without being in the community that holds it.
         Joining from here does both in one go — the fee, if there is one, is
         charged by join_club — then the cohort join is retried. */
      else if (r?.status === "join_community") {
        void rpc<any>("join_club", { p_club_id: h.club.id }).then((res) => {
          if (res?.status === "member" || res?.status === "joined" || res?.status === "already_member") {
            join.mutate(c);
            return;
          }
          if (res?.status === "insufficient_funds") {
            toast.error("Add money to your wallet to join this club", { description: "Then pick the cohort again." });
            void navigate({ to: "/app/wallet/add-money" });
            return;
          }
          toast.success("Request sent to the club team", { description: "You can pick a cohort once they approve you." });
          refresh();
        }).catch((e: any) => toast.error(e?.message || "Could not join the club"));
      }
      else if (r?.status === "invite_only") toast.message("This cohort is invite-only", { description: "Ask the club team to add you." });
    },
    onError: (e: any) => toast.error(e?.message || "Could not join"),
  });
  const decide = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => rpc("decide_club_join_request", { p_request: id, p_approve: ok }),
    onSuccess: (_d, v) => { toast.success(v.ok ? "Approved — they're in" : "Request declined"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });

  const action = (c: Cohort) => {
    if (c.my_status === "member" || h.me.admin) {
      return <Link to="/app/clubs/chat" search={{ clubId: c.id } as never} className={btnPrimary}>Open</Link>;
    }
    if (!h.me.member) return null;
    if (c.my_status === "pending") return <span className={`${btnGhost} pointer-events-none text-muted-foreground`}>Requested</span>;
    if (c.join_mode === "invite") return <span className={`${btnGhost} pointer-events-none text-muted-foreground`}><Lock className="h-3.5 w-3.5" /> Invite only</span>;
    return (
      <button type="button" disabled={join.isPending} onClick={() => join.mutate(c)} className={btnGhost}>
        {join.isPending && join.variables?.id === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {c.join_mode === "open" ? "Join" : c.join_mode === "approval" ? "Request to join" : "Get the bootcamp"}
      </button>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Cohorts" sub="Each cohort has its own class chat, assignments, quizzes and Q&A" onBack={onBack}
        action={h.me.admin ? <button type="button" onClick={() => setCreating(true)} className={btnPrimary}><Plus className="h-4 w-4" /> New cohort</button> : undefined} />
      <div className="mx-auto max-w-[920px] space-y-5 px-4 py-5 md:px-8">
        {!h.me.member && <JoinCommunityCard h={h} />}

        {h.me.admin && h.requests.length > 0 && (
          <Panel title={`Requests · ${h.requests.length}`}>
            <div className="divide-y divide-border">
              {h.requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Avatar url={r.profile.avatar_url} name={nameOf(r.profile)} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{nameOf(r.profile)} <span className="font-normal text-muted-foreground">→ {r.cohort_name}</span></p>
                    {r.message && <p className="truncate text-[12.5px] text-muted-foreground">“{r.message}”</p>}
                  </div>
                  <button type="button" onClick={() => decide.mutate({ id: r.id, ok: true })} className="inline-flex h-9 items-center gap-1 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background"><Check className="h-4 w-4" /> Approve</button>
                  <button type="button" onClick={() => decide.mutate({ id: r.id, ok: false })} className="h-9 rounded-full px-3 text-[13px] font-semibold text-muted-foreground hover:bg-foreground/[0.05]">Decline</button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {h.cohorts.length === 0 ? (
          <Empty icon={<GraduationCap className="h-6 w-6" />} title="No cohorts yet"
            body={h.me.admin ? "Create a cohort for each skill or intake — e.g. 'Product Design · Jan', 'Data Analysis'. Each one gets its own General chat, Assignments, Quizzes and Q&A." : "The club team hasn't opened a cohort yet."}
            action={h.me.admin ? <button type="button" onClick={() => setCreating(true)} className={btnPrimary}><Plus className="h-4 w-4" /> Create the first cohort</button> : undefined} />
        ) : (
          <div className="grid gap-3 @xl:grid-cols-2">
            {h.cohorts.map((c) => (
              <article key={c.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
                <div className="relative h-20" style={{ background: c.banner_url ? undefined : `linear-gradient(135deg, #2a0b20, ${PINK} 160%)` }}>
                  {c.banner_url && <img src={c.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  {c.my_status === "member" && <span className="absolute right-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold">You're in</span>}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[16px] font-semibold">{c.name}</p>
                      <p className="truncate text-[12.5px] text-muted-foreground">{[c.skill, `${c.members} ${c.members === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}</p>
                    </div>
                    {h.me.admin && (
                      <CohortMenu onEdit={() => setEditing(c)} onAdd={() => setAdding(c)} />
                    )}
                  </div>
                  {c.description && <p className="mt-2 line-clamp-2 text-[13.5px] text-foreground/75">{c.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[11.5px] font-semibold ${MODE[c.join_mode]?.tone || ""}`}>{MODE[c.join_mode]?.label || c.join_mode}</span>
                    {c.bootcamp_title && (
                      <Link to="/app/bootcamps/$id" params={{ id: c.bootcamp_id! }} className="inline-flex h-[22px] max-w-full items-center gap-1 truncate rounded-full bg-foreground/[0.05] px-2 text-[11.5px] font-semibold text-foreground/75">
                        <GraduationCap className="h-3 w-3 shrink-0" /> <span className="truncate">{c.bootcamp_title}</span>
                      </Link>
                    )}
                  </div>
                  <div className="mt-auto flex justify-end pt-3">{action(c)}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {h.me.admin && <CohortSheet h={h} open={creating} onOpenChange={setCreating} onSaved={refresh} />}
      {h.me.admin && editing && <CohortSheet h={h} cohort={editing} open onOpenChange={(o) => !o && setEditing(null)} onSaved={refresh} />}
      {h.me.admin && adding && <AddCohortMemberSheet cohort={adding} onClose={() => { setAdding(null); refresh(); }} />}
    </div>
  );
}

function CohortMenu({ onEdit, onAdd }: { onEdit: () => void; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-label="Cohort options" onClick={() => setOpen((v) => !v)} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05]"><MoreHorizontal className="h-5 w-5" /></button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl">
            <button type="button" onClick={() => { setOpen(false); onAdd(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-foreground/[0.04]"><UserPlus className="h-4 w-4" /> Add people</button>
            <button type="button" onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-foreground/[0.04]"><Pencil className="h-4 w-4" /> Edit cohort</button>
          </div>
        </>
      )}
    </div>
  );
}

function CohortSheet({ h, cohort, open, onOpenChange, onSaved }: { h: Hub; cohort?: Cohort; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(cohort?.name || "");
  const [skill, setSkill] = useState(cohort?.skill || "");
  const [description, setDescription] = useState(cohort?.description || "");
  const [mode, setMode] = useState<Cohort["join_mode"]>(cohort?.join_mode || "open");
  const [bootcamp, setBootcamp] = useState<string>(cohort?.bootcamp_id || "");
  const myBootcamps = useQuery({
    queryKey: ["my-bootcamps-for-cohort"],
    enabled: open && !cohort,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("bootcamps").select("id, title").or(`creator_id.eq.${user!.id},assigned_tutor_id.eq.${user!.id}`).order("created_at", { ascending: false });
      return (data || []) as { id: string; title: string }[];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (cohort) {
        await rpc("update_club_cohort", { p_cohort: cohort.id, p_name: name, p_skill: skill || null, p_description: description || null, p_join_mode: mode === "bootcamp" ? "open" : mode });
        return cohort.id;
      }
      return rpc<string>("create_club_cohort", {
        p_parent: h.club.id, p_name: name, p_skill: skill || null, p_description: description || null,
        p_join_mode: mode === "bootcamp" ? "open" : mode, p_bootcamp: mode === "bootcamp" ? bootcamp || null : null, p_banner: null,
      });
    },
    onSuccess: (id) => {
      toast.success(cohort ? "Cohort updated" : "Cohort created", cohort ? undefined : { description: "It has its own General chat, Assignments, Quizzes and Q&A." });
      onOpenChange(false); onSaved();
      if (!cohort) void navigate({ to: "/app/clubs/chat", search: { clubId: id } as never });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the cohort"),
  });
  const modes: { v: Cohort["join_mode"]; t: string; d: string }[] = [
    { v: "open", t: "Open", d: "Any club member can join" },
    { v: "approval", t: "Request", d: "You approve each person" },
    { v: "invite", t: "Invite only", d: "Only the team adds people" },
    { v: "bootcamp", t: "Bootcamp", d: "Learners who pay are added" },
  ];
  const locked = Boolean(cohort?.bootcamp_id);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={cohort ? "Edit cohort" : "New cohort"} body="A cohort is a class inside your club, with its own General chat, Assignments, Announcements, Quizzes and Q&A.">
      <div className="space-y-3">
        <div><span className={label}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Product Design · January" className={field} /></div>
        <div><span className={label}>Skill</span><input value={skill} onChange={(e) => setSkill(e.target.value)} maxLength={60} placeholder="e.g. UI/UX, Data Analysis" className={field} /></div>
        <div><span className={label}>About (optional)</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={600} className={area} /></div>
        <div>
          <span className={label}>Who can get in</span>
          {locked ? (
            <p className="rounded-xl bg-foreground/[0.05] px-3 py-2.5 text-[13.5px]">Linked to <b>{cohort?.bootcamp_title}</b> — learners who enrol are added automatically.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {modes.filter((m) => !cohort || m.v !== "bootcamp").map((m) => (
                <button key={m.v} type="button" onClick={() => setMode(m.v)} className={`rounded-xl border p-3 text-left ${mode === m.v ? "border-[#cc208f] bg-[#cc208f]/[0.06] ring-2 ring-[#cc208f]/15" : "border-border"}`}>
                  <span className="block text-[13.5px] font-semibold">{m.t}</span>
                  <span className="block text-[11.5px] leading-4 text-muted-foreground">{m.d}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!cohort && mode === "bootcamp" && (
          <div><span className={label}>Bootcamp</span>
            <select value={bootcamp} onChange={(e) => setBootcamp(e.target.value)} className={field}>
              <option value="">Pick a bootcamp you run</option>
              {(myBootcamps.data || []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            {!myBootcamps.isLoading && !(myBootcamps.data || []).length && <p className="mt-1 text-[12px] text-muted-foreground">You don't run a bootcamp yet. Create one in Bootcamps first.</p>}
          </div>
        )}
        <button type="button" disabled={save.isPending || name.trim().length < 2 || (!cohort && mode === "bootcamp" && !bootcamp)} onClick={() => save.mutate()} className={`${btnPrimary} h-11 w-full`}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {cohort ? "Save" : "Create cohort"}
        </button>
      </div>
    </Sheet>
  );
}

function AddCohortMemberSheet({ cohort, onClose }: { cohort: Cohort; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const add = useMutation({
    mutationFn: () => rpc<any>("add_cohort_member", { p_cohort: cohort.id, p_username: username }),
    onSuccess: (r) => { toast.success(r?.added === false ? "They're already in this cohort" : "Added — they've been notified"); setUsername(""); },
    onError: (e: any) => toast.error(e?.message || "Could not add them"),
  });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={`Add people to ${cohort.name}`} body="They're added to the club too if they weren't in it yet.">
      <div className="flex gap-2">
        <UsernamePicker value={username} onChange={setUsername} placeholder="@username" wrapperClassName="relative min-w-0 flex-1" className={field} />
        <button type="button" disabled={!username.trim() || add.isPending} onClick={() => add.mutate()} className={`${btnPrimary} h-11 shrink-0`}>{add.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Add</button>
      </div>
    </Sheet>
  );
}

/* ── members & staff ──────────────────────────────────────────────────── */

type MemberRow = { profile_id: string; role: string; joined_at: string; profiles: Person | null };

function useMembers(clubId: string) {
  return useQuery({
    queryKey: ["club-hub-members", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("club_members").select("profile_id, role, joined_at, profiles(id, username, full_name, avatar_url)").eq("club_id", clubId).order("joined_at", { ascending: true }).limit(1000);
      if (error) throw error;
      return (data || []) as unknown as MemberRow[];
    },
  });
}

function MembersView({ h, onBack }: { h: Hub; onBack: () => void }) {
  const queryClient = useQueryClient();
  const members = useMembers(h.club.id);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().replace(/^@/, "").toLowerCase();
    return (members.data || []).filter((m) => !t || `${m.profiles?.full_name || ""} ${m.profiles?.username || ""}`.toLowerCase().includes(t));
  }, [members.data, q]);
  const remove = useMutation({
    mutationFn: async (m: MemberRow) => {
      const ids = [h.club.id, ...h.cohorts.map((c) => c.id)];
      const { error } = await supabase.from("club_members").delete().eq("profile_id", m.profile_id).in("club_id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed from the club"); void queryClient.invalidateQueries({ queryKey: ["club-hub-members", h.club.id] }); void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] }); },
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });
  const staff = useMutation({
    mutationFn: (m: MemberRow) => rpc("set_community_staff", { p_club: h.club.id, p_username: m.profiles?.username, p_staff: true }),
    onSuccess: () => { toast.success("Added to the teaching staff"); void queryClient.invalidateQueries({ queryKey: ["club-hub-members", h.club.id] }); void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] }); },
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Members" sub={`${h.counts.members.toLocaleString()} in ${h.club.name}`} onBack={onBack} />
      <div className="mx-auto max-w-[760px] px-4 py-5 md:px-8">
        <label className="flex h-10 items-center gap-2 rounded-full bg-foreground/[0.05] px-3.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </label>
        {members.isLoading ? <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="mt-3 divide-y divide-border">
            {list.map((m) => {
              const isOwner = m.profile_id === h.club.creator_id;
              const isStaff = m.role === "Administrator";
              return (
                <div key={m.profile_id} className="flex items-center gap-3 py-2.5">
                  <Link to="/app/profile/$id" params={{ id: m.profiles?.username || m.profile_id }} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar url={m.profiles?.avatar_url} name={nameOf(m.profiles)} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold">{nameOf(m.profiles)}</span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">{m.profiles?.username ? `@${m.profiles.username}` : ""}{isOwner ? " · Owner" : isStaff ? " · Teaching staff" : ""}</span>
                    </span>
                  </Link>
                  {h.me.admin && !isOwner && (
                    <div className="flex shrink-0 gap-1">
                      {!isStaff && m.profiles?.username && <button type="button" onClick={() => staff.mutate(m)} className="h-8 rounded-full border border-border px-3 text-[12px] font-semibold">Make staff</button>}
                      <button type="button" aria-label="Remove" onClick={() => confirm(`Remove ${nameOf(m.profiles)} from the club and its cohorts?`) && remove.mutate(m)} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05]"><X className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {!list.length && <p className="py-8 text-center text-[14px] text-muted-foreground">No members match.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffView({ h, onBack }: { h: Hub; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const set = useMutation({
    mutationFn: ({ u, on }: { u: string; on: boolean }) => rpc("set_community_staff", { p_club: h.club.id, p_username: u, p_staff: on }),
    onSuccess: (_d, v) => { toast.success(v.on ? "Added to the teaching staff" : "Removed from the staff"); setUsername(""); void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] }); void queryClient.invalidateQueries({ queryKey: ["club-hub-members", h.club.id] }); },
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Teaching staff" sub="They run every cohort in this club" onBack={onBack} />
      <div className="mx-auto max-w-[760px] space-y-4 px-4 py-5 md:px-8">
        {h.me.admin && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[14px] font-semibold">Add a tutor or moderator</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Staff can post announcements, schedule meetings, create cohorts and manage every cohort's rooms.</p>
            <div className="mt-3 flex gap-2">
              <UsernamePicker value={username} onChange={setUsername} placeholder="@username" wrapperClassName="relative min-w-0 flex-1" className={field} />
              <button type="button" disabled={!username.trim() || set.isPending} onClick={() => set.mutate({ u: username, on: true })} className={`${btnPrimary} h-11 shrink-0`}>Add</button>
            </div>
          </div>
        )}
        <div className="grid gap-3 @xl:grid-cols-2">
          {h.staff.map((s) => (
            <div key={s.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <Link to="/app/profile/$id" params={{ id: s.username || s.id }}><Avatar url={s.avatar_url} name={nameOf(s)} size={52} /></Link>
              <div className="min-w-0 flex-1">
                <Link to="/app/profile/$id" params={{ id: s.username || s.id }} className="block truncate text-[15px] font-semibold hover:underline">{nameOf(s)}</Link>
                <p className="text-[12.5px] font-semibold text-[#cc208f]">{s.is_owner ? "Owner" : "Teaching staff"}</p>
                {s.headline && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{s.headline}</p>}
                <div className="mt-2 flex gap-3 text-[12.5px] font-semibold">
                  <Link to="/app/chat/$id" params={{ id: s.id }} className="text-foreground/80">Message</Link>
                  {h.me.admin && !s.is_owner && s.username && <button type="button" onClick={() => confirm(`Remove ${nameOf(s)} from the staff?`) && set.mutate({ u: s.username!, on: false })} className="text-muted-foreground">Remove from staff</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── settings (owner) ─────────────────────────────────────────────────── */

function SettingsView({ h, onBack }: { h: Hub; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { format } = useWalletCurrency();
  const [name, setName] = useState(h.club.name);
  const [description, setDescription] = useState(h.club.description || "");
  const [category, setCategory] = useState(h.club.category || "");
  const [rules, setRules] = useState(h.club.rules || "");
  const [logo, setLogo] = useState(h.club.logo_url || "");
  const [banner, setBanner] = useState(h.club.banner_url || "");
  const [fee, setFee] = useState(String(Number(h.club.subscription_fee || 0) || ""));
  const [free, setFree] = useState(Boolean(h.club.access_free));
  const [isPrivate, setIsPrivate] = useState(Boolean(h.club.is_private));
  const [approval, setApproval] = useState(Boolean(h.club.requires_approval));
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File, which: "logo" | "banner") => {
    setUploading(which);
    try {
      const image = await compressImage(file);
      const path = `${h.club.id}/${which}-${Date.now()}.${(image.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await supabase.storage.from("post-media").upload(path, image, { cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const url = supabase.storage.from("post-media").getPublicUrl(path).data.publicUrl;
      if (which === "logo") setLogo(url); else setBanner(url);
    } catch (e: any) {
      toast.error(e?.message || "Could not upload");
    } finally {
      setUploading(null);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (name.trim().length < 2) throw new Error("Give the club a name");
      const { error } = await supabase.from("clubs").update({ name: name.trim(), description: description.trim() || null, category: category.trim() || null, rules: rules.trim() || null, logo_url: logo || null, banner_url: banner || null } as never).eq("id", h.club.id);
      if (error) throw error;
      const { error: e1 } = await supabase.rpc("set_club_access" as never, { p_club_id: h.club.id, p_fee: Math.max(0, Number(fee) || 0), p_free: free } as never);
      if (e1) throw e1;
      if (isPrivate !== Boolean(h.club.is_private)) {
        const { error: e2 } = await supabase.rpc("set_club_privacy" as never, { p_club_id: h.club.id, p_private: isPrivate } as never);
        if (e2) throw e2;
      }
      const { error: e3 } = await supabase.rpc("set_club_admission" as never, { p_club_id: h.club.id, p_requires_approval: approval } as never);
      if (e3) throw e3;
    },
    onSuccess: () => { toast.success("Club settings saved"); void queryClient.invalidateQueries({ queryKey: ["club-hub", h.club.id] }); void queryClient.invalidateQueries({ queryKey: ["clubs_data"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  const toggle = (on: boolean, set: (v: boolean) => void, title: string, sub: string) => (
    <label className="flex items-start gap-3 rounded-xl border border-border p-3">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#cc208f]" />
      <span><span className="block text-[14px] font-semibold">{title}</span><span className="block text-[12.5px] text-muted-foreground">{sub}</span></span>
    </label>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Settings" sub="Only you, the owner, can change these" onBack={onBack}
        action={<button type="button" disabled={save.isPending || Boolean(uploading)} onClick={() => save.mutate()} className={btnPrimary}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>} />
      <div className="mx-auto max-w-[680px] space-y-4 px-4 py-5 md:px-8">
        <div className="overflow-hidden rounded-2xl border border-border">
          <button type="button" onClick={() => bannerRef.current?.click()} className="relative block h-32 w-full" style={{ background: banner ? undefined : `linear-gradient(135deg, #2a0b20, ${PINK} 140%)` }}>
            {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-semibold text-white">
              {uploading === "banner" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Banner
            </span>
          </button>
          <div className="flex items-center gap-3 p-3">
            <button type="button" onClick={() => logoRef.current?.click()} className="relative">
              <Avatar url={logo || banner} name={name} size={56} square />
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background">{uploading === "logo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}</span>
            </button>
            <p className="text-[12.5px] text-muted-foreground">Tap the banner or logo to change it.</p>
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "banner"); e.target.value = ""; }} />
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "logo"); e.target.value = ""; }} />
        </div>
        <div><span className={label}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} /></div>
        <div><span className={label}>About</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={area} /></div>
        <div><span className={label}>Category</span><input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} className={field} /></div>
        <div><span className={label}>Rules</span><textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={3} className={area} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><span className={label}>Membership fee</span><input value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" disabled={free} className={field} /></div>
          <div className="flex items-end pb-2.5 text-[12.5px] text-muted-foreground">{!free && Number(fee) > 0 ? `${format(Number(fee))} to join` : "Free to join"}</div>
        </div>
        {toggle(free, setFree, "Free entry", "Nobody pays to join, whatever the fee says.")}
        {toggle(approval, setApproval, "Approve new members", "People request to join and you decide.")}
        {toggle(isPrivate, setIsPrivate, "Private club", "Hidden from Discover; joining is by request.")}
        <Link to="/club/$id" params={{ id: h.club.id }} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#cc208f]">Public club page <ExternalLink className="h-3.5 w-3.5" /></Link>
      </div>
    </div>
  );
}
