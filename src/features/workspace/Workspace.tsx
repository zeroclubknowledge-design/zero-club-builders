/**
 * A team workspace — the organization as its people see it.
 *
 * Laid out like a team chat app: the organization's own rail on the left
 * (home, announcements, meetings, programmes, communities, staff, people and
 * channels), the open section on the right. On a phone the rail is the home
 * screen and each section opens full-screen with a back arrow.
 *
 * Roles (checked again on the server for every action):
 *   owner  the organization account itself — runs everything
 *   admin  manages channels, meetings and announcements, sees member dossiers
 *   staff  ("Teaching staff" for tech hubs) posts announcements, hosts meetings
 *   member reads, chats, joins meetings and programmes
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  GraduationCap,
  Hash,
  Loader2,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  Paperclip,
  FileText,
  Plus,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "@/components/icons/glyphs";
import { IconClubs, IconHome } from "@/components/icons/nav";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { LinkifiedText } from "@/components/LinkifiedText";
import { MentionField } from "@/components/MentionField";
import { supabase } from "@/lib/supabase";
import { ChatMediaGrid, type ChatVisual } from "@/components/ChatMediaGrid";
import { ImageLightbox } from "@/components/ImageLightbox";
import { decodeChatMedia, encodeChatMedia, getChatMediaType } from "@/hooks/useVoiceRecorder";
import { compressImage } from "@/lib/imageCompression";
import { UPLOAD_LIMIT_MB, tooLargeMessage } from "@/lib/storage";
import { MemberDossier } from "./MemberDossier";
import {
  ROLE_LABEL,
  staffLabel,
  workspaceApi,
  type Workspace,
  type WorkspaceMeeting,
  type WorkspaceMessage,
  type WorkspacePerson,
} from "./api";

import { confirmCard } from "@/components/ConfirmCard";
export type WorkspaceSection =
  | "home"
  | "announcements"
  | "channel"
  | "meetings"
  | "programmes"
  | "communities"
  | "staff"
  | "people";

const PINK = "#c3217e";
/* Same encoding as direct, group and club chats: text, then the marker and the files. */
const MEDIA = "$$MEDIA$$";
const MAX_FILES = 6;

function splitMessage(content: string) {
  const [text, mediaPart] = String(content || "").split(MEDIA);
  const media = mediaPart ? mediaPart.split(",").filter(Boolean).map(decodeChatMedia) : [];
  return {
    text: (text || "").trim(),
    visuals: media.filter((m) => m.type === "image" || m.type === "video") as (ChatVisual & { name?: string })[],
    files: media.filter((m) => m.type !== "image" && m.type !== "video"),
  };
}

/** Photos, videos and files attached to a workspace message. */
function MessageMedia({ content, onOpen }: { content: string; onOpen: (urls: string[], index: number, types: ("image" | "video")[], caption?: string) => void }) {
  const { text, visuals, files } = splitMessage(content);
  if (!visuals.length && !files.length) return null;
  return (
    <div className="mt-1.5 max-w-[420px] space-y-1.5">
      {visuals.length > 0 && (
        <ChatMediaGrid items={visuals} mine={false} onOpen={(i) => onOpen(visuals.map((v) => v.url), i, visuals.map((v) => v.type), text || undefined)} />
      )}
      {files.map((f, i) => (
        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:border-foreground/25">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#c3217e]/10 text-[#c3217e]"><FileText className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">{f.name || "Attachment"}</span>
            <span className="block text-[11.5px] uppercase text-muted-foreground">{(f.name?.split(".").pop() || f.type).slice(0, 6)} · Open</span>
          </span>
        </a>
      ))}
    </div>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────── */

function Avatar({ url, name, size = 36, square }: { url?: string | null; name?: string | null; size?: number; square?: boolean }) {
  return url ? (
    <img src={url} alt="" className={`shrink-0 object-cover ${square ? "rounded-[10px]" : "rounded-full"}`} style={{ width: size, height: size }} />
  ) : (
    <span
      className={`grid shrink-0 place-items-center bg-[#c3217e]/12 font-semibold text-[#c3217e] ${square ? "rounded-[10px]" : "rounded-full"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const meetingWhen = (m: WorkspaceMeeting) => {
  const s = new Date(m.starts_at);
  const e = new Date(s.getTime() + m.duration_min * 60_000);
  return `${s.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};
const isLink = (s?: string | null) => Boolean(s && /^https?:\/\//i.test(s.trim()));
const lastSeen = (iso?: string | null) => {
  if (!iso) return null;
  const mins = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (mins < 5) return "Active now";
  if (mins < 60) return `Active ${Math.round(mins)}m ago`;
  if (mins < 60 * 24) return `Active ${Math.round(mins / 60)}h ago`;
  return `Active ${Math.round(mins / 1440)}d ago`;
};

function RoleChip({ role, kind }: { role: WorkspacePerson["role"]; kind: string | null }) {
  const tone =
    role === "owner"
      ? "bg-foreground text-background"
      : role === "admin"
        ? "bg-[#c3217e] text-white"
        : role === "staff"
          ? "bg-[#c3217e]/12 text-[#c3217e]"
          : "bg-foreground/[0.06] text-muted-foreground";
  return <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${tone}`}>{ROLE_LABEL(role, kind)}</span>;
}

function SectionHeader({ title, sub, onBack, action, icon }: { title: string; sub?: string | null; onBack?: () => void; action?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-2 border-b border-border bg-background/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:px-6">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.05] md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      {icon && <span className="hidden text-muted-foreground md:block">{icon}</span>}
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
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#c3217e]/10 text-[#c3217e]">{icon}</span>
      <p className="mt-4 font-display text-[17px] font-semibold">{title}</p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border px-4 text-[13.5px] font-semibold transition hover:bg-foreground/[0.04] active:scale-[0.98] disabled:opacity-50";

/* ── the page ─────────────────────────────────────────────────────────── */

export function WorkspacePage({ orgId, section, channelId }: { orgId: string; section?: string; channelId?: string }) {
  const navigate = useNavigate();
  const ws = useQuery({ queryKey: ["workspace", orgId], queryFn: () => workspaceApi.get(orgId), retry: false });
  const people = useQuery({ queryKey: ["workspace-people", orgId], queryFn: () => workspaceApi.people(orgId), enabled: ws.isSuccess, staleTime: 60_000 });

  const go = (s?: WorkspaceSection, c?: string) =>
    navigate({ to: "/app/teams/$orgId", params: { orgId }, search: (s ? { s, ...(c ? { c } : {}) } : {}) as never, replace: Boolean(s) });

  const active: WorkspaceSection = ((section as WorkspaceSection) || "home") as WorkspaceSection;
  const openOnPhone = Boolean(section);

  if (ws.isLoading) {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }
  if (ws.error || !ws.data) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-foreground/[0.06]"><Building2 className="h-6 w-6 text-muted-foreground" /></span>
          <p className="font-display text-[18px] font-semibold">This workspace isn't open to you</p>
          <p className="max-w-[320px] text-[13.5px] text-muted-foreground">Accept the organization's invitation in Teams first, or ask them to add you again.</p>
          <Link to="/app/teams" className={btnPrimary}>Go to Teams</Link>
        </div>
      </Shell>
    );
  }

  const w = ws.data;
  const announcements = w.channels.find((c) => c.kind === "announcements");
  const currentChannel =
    active === "announcements" ? announcements : active === "channel" ? w.channels.find((c) => c.id === channelId) || w.channels.find((c) => c.kind === "channel") : undefined;

  const content = (() => {
    const back = () => go();
    switch (active) {
      case "announcements":
      case "channel":
        return currentChannel ? (
          <ChannelView key={currentChannel.id} w={w} channel={currentChannel} people={people.data || []} onBack={back} />
        ) : (
          <Empty icon={<Hash className="h-6 w-6" />} title="Channel not found" body="It may have been archived." />
        );
      case "meetings":
        return <MeetingsView w={w} onBack={back} />;
      case "programmes":
        return <ProgrammesView w={w} onBack={back} />;
      case "communities":
        return <CommunitiesView w={w} onBack={back} />;
      case "staff":
        return <PeopleView w={w} people={people.data} loading={people.isLoading} onBack={back} staffOnly />;
      case "people":
        return <PeopleView w={w} people={people.data} loading={people.isLoading} onBack={back} />;
      default:
        return <HomeView w={w} go={go} onBack={back} />;
    }
  })();

  return (
    <Shell>
      <aside className={`${openOnPhone ? "hidden" : "flex"} min-h-0 w-full flex-col md:flex md:w-[268px] md:shrink-0 md:border-r md:border-border`}>
        <WorkspaceNav w={w} active={active} channelId={currentChannel?.id} go={go} />
      </aside>
      <main className={`${openOnPhone ? "flex" : "hidden"} @container min-h-0 min-w-0 flex-1 flex-col md:flex`}>{content}</main>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="zc-chat-panel fixed inset-0 z-[60] flex bg-background md:left-[var(--zc-sidebar-w,280px)] md:border-l md:border-border/60"
      style={{ height: "100dvh" }}
    >
      {children}
    </div>
  );
}

/* ── left rail ─────────────────────────────────────────────────────────── */

function WorkspaceNav({ w, active, channelId, go }: { w: Workspace; active: WorkspaceSection; channelId?: string; go: (s?: WorkspaceSection, c?: string) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [newChannel, setNewChannel] = useState(false);
  const canManage = w.me.role === "owner" || w.me.role === "admin";
  const announcements = w.channels.find((c) => c.kind === "announcements");
  const channels = w.channels.filter((c) => c.kind === "channel");
  const kind = w.org.kind;

  const leave = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      await workspaceApi.removeMember(w.org.id, data.user!.id);
    },
    onSuccess: () => {
      toast.success(`You left ${w.org.name}`);
      void queryClient.invalidateQueries({ queryKey: ["my-teams"] });
      navigate({ to: "/app/teams" });
    },
    onError: (e: any) => toast.error(e?.message || "Could not leave"),
  });

  const item = (key: WorkspaceSection, label: string, icon: ReactNode, opts: { badge?: number; channel?: string } = {}) => {
    const on = active === key && (!opts.channel || opts.channel === channelId);
    return (
      <button
        key={`${key}-${opts.channel || ""}`}
        type="button"
        onClick={() => go(key, opts.channel)}
        className={`group flex h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] transition md:h-9 md:text-[14px] ${
          on ? "bg-[#c3217e] font-semibold text-white" : "font-medium text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground"
        }`}
      >
        <span className={`shrink-0 ${on ? "text-white" : "text-muted-foreground group-hover:text-foreground"}`}>{icon}</span>
        <span className={`min-w-0 flex-1 truncate ${opts.badge ? "font-semibold text-foreground" : ""} ${on ? "!text-white" : ""}`}>{label}</span>
        {Boolean(opts.badge) && (
          <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${on ? "bg-white text-[#c3217e]" : "bg-[#c3217e] text-white"}`}>
            {opts.badge! > 99 ? "99+" : opts.badge}
          </span>
        )}
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground md:hidden ${on ? "hidden" : ""}`} />
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Org header */}
      <div className="relative shrink-0 overflow-hidden border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${PINK}, transparent 60%)` }} />
        <div className="relative flex items-center gap-1 px-2 pt-2 md:hidden">
          <Link to="/app/teams" aria-label="All teams" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="text-[13px] font-semibold text-muted-foreground">Teams</span>
        </div>
        <div className="relative flex items-center gap-3 px-4 pb-4 pt-2 md:pt-4">
          <Avatar url={w.org.avatar_url} name={w.org.name} size={44} square />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16.5px] font-semibold leading-tight">{w.org.name}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {kind === "institutional" ? "Tech hub" : "Company"} · {w.counts.members + 1} people
            </p>
            <p className="mt-1.5"><RoleChip role={w.me.role} kind={kind} /></p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3 no-scrollbar">
        {item("home", "Home", <IconHome className="h-[18px] w-[18px]" />)}
        {announcements && item("announcements", "Announcements", <Megaphone className="h-[18px] w-[18px]" />, { badge: announcements.unread, channel: announcements.id })}
        {item("meetings", "Meetings", <Calendar className="h-[18px] w-[18px]" />, { badge: w.meetings.filter((m) => !m.my_response).length })}
        {item("programmes", "Programmes", <GraduationCap className="h-[18px] w-[18px]" />)}
        {item("communities", "Communities", <IconClubs className="h-[18px] w-[18px]" />)}
        {item("staff", staffLabel(kind), <BadgeCheck className="h-[18px] w-[18px]" />)}
        {item("people", "People", <Users className="h-[18px] w-[18px]" />, canManage && w.counts.invited ? {} : {})}

        <div className="flex items-center justify-between px-3 pb-1 pt-5">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Channels</p>
          {canManage && (
            <button type="button" onClick={() => setNewChannel(true)} aria-label="Add a channel" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        {channels.map((c) => item("channel", c.name, <Hash className="h-[18px] w-[18px]" />, { badge: c.unread, channel: c.id }))}
      </nav>

      <div className="shrink-0 border-t border-border px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {w.me.role === "owner" ? (
          <Link to={(kind === "institutional" ? "/app/institution-studio" : "/app/business") as never} className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">
            <Building2 className="h-[18px] w-[18px]" /> {kind === "institutional" ? "Digital Hub" : "Business Hub"}
          </Link>
        ) : (
          <button
            type="button"
            onClick={async () => {
              if ((await confirmCard(`Leave ${w.org.name}? You'll lose access to its channels, meetings and programmes.`))) leave.mutate();
            }}
            className="flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-rose-600"
          >
            <LogOut className="h-[18px] w-[18px]" /> Leave workspace
          </button>
        )}
      </div>

      <NewChannelDrawer open={newChannel} onOpenChange={setNewChannel} orgId={w.org.id} onCreated={(id) => go("channel", id)} />
    </div>
  );
}

function NewChannelDrawer({ open, onOpenChange, orgId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; orgId: string; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const create = useMutation({
    mutationFn: () => workspaceApi.createChannel(orgId, name, topic),
    onSuccess: (c) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace", orgId] });
      onOpenChange(false);
      setName("");
      setTopic("");
      onCreated(c.id);
    },
    onError: (e: any) => toast.error(e?.message || "Could not add the channel"),
  });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent overlayClassName="z-[10090]" className="z-[10100] mx-auto max-w-lg border-none bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <h3 className="font-display text-[19px] font-semibold">Add a channel</h3>
        <p className="mt-1 text-[13.5px] text-muted-foreground">Channels keep conversations about one topic, team or bootcamp in one place. Everyone on the team can join in.</p>
        <label className="mt-4 block text-[12.5px] font-semibold text-muted-foreground">Name</label>
        <div className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Hash className="h-4 w-4 text-muted-foreground" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="design-team" maxLength={40} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
        </div>
        {slug && slug !== name && <p className="mt-1 text-[12px] text-muted-foreground">Saved as #{slug}</p>}
        <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground">What's it for? (optional)</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="Weekly design critiques and handoffs" className="mt-1.5 h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] outline-none" />
        <button type="button" disabled={!slug || create.isPending} onClick={() => create.mutate()} className={`${btnPrimary} mt-5 h-12 w-full text-[15px]`}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create channel"}
        </button>
      </DrawerContent>
    </Drawer>
  );
}

/* ── home ──────────────────────────────────────────────────────────────── */

function HomeView({ w, go, onBack }: { w: Workspace; go: (s?: WorkspaceSection, c?: string) => void; onBack: () => void }) {
  const kind = w.org.kind;
  const stats = [
    { label: "People", value: w.counts.members + 1, s: "people" as const },
    { label: staffLabel(kind), value: w.counts.staff, s: "staff" as const },
    { label: "Programmes", value: w.counts.programmes, s: "programmes" as const },
    { label: "Communities", value: w.counts.communities, s: "communities" as const },
  ];
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Home" sub={w.org.name} onBack={onBack} />
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="h-36 w-full md:h-44" style={{ background: w.org.banner_url ? undefined : `linear-gradient(135deg, #2a0b20, ${PINK} 140%)` }}>
          {w.org.banner_url && <img src={w.org.banner_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="mx-auto max-w-[920px] px-4 md:px-8">
          <div className="-mt-9 flex items-end gap-4">
            <span className="rounded-[18px] ring-4 ring-background"><Avatar url={w.org.avatar_url} name={w.org.name} size={76} square /></span>
          </div>
          <p className="mt-3 text-[13px] font-medium text-muted-foreground">{greeting} — welcome to</p>
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">{w.org.name}</h1>
          {w.org.tagline && <p className="mt-1 text-[15px] text-foreground/75">{w.org.tagline}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
            <RoleChip role={w.me.role} kind={kind} />
            {w.me.title && <span className="font-medium text-foreground/80">{w.me.title}</span>}
            {(w.org.city || w.org.country) && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[w.org.city, w.org.country].filter(Boolean).join(", ")}</span>
            )}
            {w.org.industry && <span>· {w.org.industry}</span>}
            {w.org.username && (
              <Link to="/app/profile/$id" params={{ id: w.org.username }} className="inline-flex items-center gap-1 font-semibold text-[#c3217e]">
                Organization page <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] space-y-6 px-4 pb-16 pt-6 md:px-8">
        <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-4">
          {stats.map((s) => (
            <button key={s.label} type="button" onClick={() => go(s.s)} className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-foreground/25">
              <p className="font-display text-[26px] font-semibold tabular-nums leading-none">{s.value}</p>
              <p className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">{s.label}</p>
            </button>
          ))}
        </div>

        {w.training.length > 0 && (
          <Panel title="Assigned to you" action={<button type="button" onClick={() => go("programmes")} className="text-[13px] font-semibold text-[#c3217e]">All programmes</button>}>
            <div className="divide-y divide-border">
              {w.training.map((t) => (
                <Link key={t.bootcamp_id} to="/app/bootcamps/$id" params={{ id: t.bootcamp_id }} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-foreground/[0.05]">{t.banner_url && <img src={t.banner_url} alt="" className="h-full w-full object-cover" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{t.title}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{t.note || (t.starts_at ? `Starts ${new Date(t.starts_at).toLocaleDateString()}` : "Self-paced")}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${t.enrolled ? "bg-emerald-500/10 text-emerald-600" : "bg-[#c3217e]/10 text-[#c3217e]"}`}>{t.enrolled ? "Enrolled" : "Start"}</span>
                </Link>
              ))}
            </div>
          </Panel>
        )}

        <div className="grid gap-6 @3xl:grid-cols-2">
          <Panel title="Announcements" action={<button type="button" onClick={() => go("announcements", w.channels.find((c) => c.kind === "announcements")?.id)} className="text-[13px] font-semibold text-[#c3217e]">Open</button>}>
            {w.announcements.length === 0 ? (
              <p className="text-[13.5px] text-muted-foreground">Nothing yet. Updates from {w.org.name} land here.</p>
            ) : (
              <div className="space-y-4">
                {w.announcements.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <Avatar url={a.sender.avatar_url} name={a.sender.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px]"><span className="font-semibold">{a.sender.name}</span> <span className="text-muted-foreground">· {dayOf(a.created_at)}</span></p>
                      {(() => {
                        const { text, visuals, files } = splitMessage(a.content);
                        const n = visuals.length + files.length;
                        return (
                          <>
                            {text && <div className="mt-0.5 line-clamp-3 text-[14px] leading-relaxed text-foreground/85"><LinkifiedText text={text} /></div>}
                            {n > 0 && (
                              <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground">
                                <Paperclip className="h-3.5 w-3.5" /> {n} {n === 1 ? "attachment" : "attachments"}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Coming up" action={<button type="button" onClick={() => go("meetings")} className="text-[13px] font-semibold text-[#c3217e]">All meetings</button>}>
            {w.meetings.length === 0 ? (
              <p className="text-[13.5px] text-muted-foreground">No meetings scheduled.</p>
            ) : (
              <div className="space-y-2.5">
                {w.meetings.map((m) => <MeetingRow key={m.id} m={m} orgId={w.org.id} compact />)}
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Channels">
          <div className="flex flex-wrap gap-2">
            {w.channels.filter((c) => c.kind === "channel").map((c) => (
              <button key={c.id} type="button" onClick={() => go("channel", c.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13.5px] font-semibold hover:border-foreground/30">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" /> {c.name}
                {c.unread > 0 && <span className="ml-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#c3217e] px-1 text-[10.5px] font-bold text-white">{c.unread}</span>}
              </button>
            ))}
          </div>
        </Panel>

        {w.org.about && (
          <Panel title={`About ${w.org.name}`}>
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground/80">{w.org.about}</p>
            {w.org.website && (
              <a href={w.org.website.startsWith("http") ? w.org.website : `https://${w.org.website}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#c3217e]">
                {w.org.website.replace(/^https?:\/\//, "")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Panel>
        )}
      </div>
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

/* ── channels ──────────────────────────────────────────────────────────── */

function ChannelView({ w, channel, people, onBack }: { w: Workspace; channel: Workspace["channels"][number]; people: WorkspacePerson[]; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<WorkspaceMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number; types: ("image" | "video")[]; caption?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isAnnouncements = channel.kind === "announcements";
  const canPost = !isAnnouncements || ["owner", "admin", "staff"].includes(w.me.role);
  const canModerate = w.me.role === "owner" || w.me.role === "admin";
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id || null));
  }, []);

  useEffect(() => {
    let live = true;
    setMessages(null);
    workspaceApi
      .messages(channel.id)
      .then((rows) => live && setMessages(rows))
      .catch(() => live && setMessages([]));
    void workspaceApi.markRead(channel.id).then(() => queryClient.invalidateQueries({ queryKey: ["workspace", w.org.id] }));
    const sub = supabase
      .channel(`workspace-${channel.id}`)
      .on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "workspace_messages", filter: `channel_id=eq.${channel.id}` } as never, (payload: any) => {
        const row = payload.new as WorkspaceMessage;
        setMessages((cur) => (cur && !cur.some((m) => m.id === row.id) ? [...cur, row] : cur));
        void workspaceApi.markRead(channel.id);
      })
      .on("postgres_changes" as never, { event: "UPDATE", schema: "public", table: "workspace_messages", filter: `channel_id=eq.${channel.id}` } as never, (payload: any) => {
        const row = payload.new as WorkspaceMessage;
        setMessages((cur) => (cur ? (row.removed_at ? cur.filter((m) => m.id !== row.id) : cur.map((m) => (m.id === row.id ? row : m))) : cur));
      })
      .subscribe();
    return () => {
      live = false;
      void supabase.removeChannel(sub);
    };
  }, [channel.id, w.org.id, queryClient]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => {
      if (f.size > UPLOAD_LIMIT_MB * 1024 * 1024) {
        toast.error(tooLargeMessage(f));
        return false;
      }
      return true;
    });
    setFiles((cur) => {
      const next = [...cur, ...picked];
      if (next.length > MAX_FILES) toast.error(`Up to ${MAX_FILES} files per message`);
      return next.slice(0, MAX_FILES);
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && files.length === 0) || sending || !me) return;
    setSending(true);
    try {
      let content = text;
      if (files.length) {
        const tokens: string[] = [];
        for (const original of files) {
          const file = await compressImage(original);
          const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
          const path = `${me}/workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error } = await supabase.storage.from("post-media").upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
          if (error) throw error;
          const { data } = supabase.storage.from("post-media").getPublicUrl(path);
          tokens.push(encodeChatMedia(getChatMediaType(file), data.publicUrl, original.name));
        }
        content = `${text}\n\n${MEDIA}${tokens.join(",")}`.trim();
      }
      const row = await workspaceApi.send(channel.id, content);
      setDraft("");
      setFiles([]);
      setMessages((cur) => (cur && !cur.some((m) => m.id === row.id) ? [...cur, row] : cur));
    } catch (e: any) {
      toast.error(e?.message || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await workspaceApi.remove(id);
      setMessages((cur) => (cur ? cur.filter((m) => m.id !== id) : cur));
    } catch (e: any) {
      toast.error(e?.message || "Could not remove");
    }
  };

  const mentionPeople = people
    .filter((p) => p.username && p.status === "active" && p.id !== me)
    .map((p) => ({ id: p.id, username: p.username!, full_name: p.name, avatar_url: p.avatar_url, badge: p.role === "member" ? null : ROLE_LABEL(p.role, w.org.kind) }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionHeader
        title={isAnnouncements ? "Announcements" : `# ${channel.name}`}
        sub={channel.topic || (isAnnouncements ? `Updates from ${w.org.name}` : null)}
        onBack={onBack}
        icon={isAnnouncements ? <Megaphone className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
        action={
          canModerate && !isAnnouncements && channel.name !== "general" ? (
            <button
              type="button"
              onClick={async () => {
                if (!(await confirmCard(`Archive #${channel.name}? Its messages stay saved, but it leaves the sidebar.`))) return;
                try {
                  await workspaceApi.archiveChannel(channel.id);
                  void queryClient.invalidateQueries({ queryKey: ["workspace", w.org.id] });
                  onBack();
                } catch (e: any) {
                  toast.error(e?.message || "Could not archive");
                }
              }}
              className="hidden h-9 items-center rounded-full border border-border px-3 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground md:inline-flex"
            >
              Archive
            </button>
          ) : null
        }
      />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {messages === null ? (
          <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <Empty
            icon={isAnnouncements ? <Megaphone className="h-6 w-6" /> : <Hash className="h-6 w-6" />}
            title={isAnnouncements ? "No announcements yet" : `This is the start of #${channel.name}`}
            body={isAnnouncements ? (canPost ? "Post an update and everyone on the team gets notified." : `Updates from ${w.org.name} will appear here.`) : channel.topic || "Say hello and get the conversation going."}
          />
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const grouped = !newDay && prev && prev.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
            const p = byId.get(m.sender_id);
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="rounded-full border border-border px-3 py-1 text-[11.5px] font-semibold text-muted-foreground">{dayOf(m.created_at)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className={`group relative flex gap-3 rounded-xl px-2 py-1 hover:bg-foreground/[0.03] ${grouped ? "" : "mt-2"}`}>
                  <div className="w-9 shrink-0">
                    {!grouped ? (
                      <Avatar url={p?.avatar_url} name={p?.name} size={36} square />
                    ) : (
                      <span className="hidden pt-1 text-right text-[10.5px] text-muted-foreground group-hover:block">{timeOf(m.created_at)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[14.5px] font-semibold">{p?.name || "Someone"}</span>
                        {p && p.role !== "member" && <RoleChip role={p.role} kind={w.org.kind} />}
                        <span className="text-[11.5px] text-muted-foreground">{timeOf(m.created_at)}</span>
                      </p>
                    )}
                    {splitMessage(m.content).text && (
                      <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">
                        <LinkifiedText text={splitMessage(m.content).text} />
                      </div>
                    )}
                    <MessageMedia content={m.content} onOpen={(urls, index, types, caption) => setViewer({ urls, index, types, caption })} />
                  </div>
                  {(m.sender_id === me || canModerate) && (
                    <button type="button" onClick={() => void remove(m.id)} aria-label="Remove message" className="absolute right-2 top-1 hidden h-7 w-7 place-items-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border hover:text-rose-600 group-hover:grid">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-background px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:px-6">
        {canPost && files.length > 0 && (
          <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
            {files.map((f, i) => {
              const isImage = f.type.startsWith("image/");
              return (
                <div key={`${f.name}-${i}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-card">
                  {isImage ? (
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-0.5 px-1 text-center">
                      <FileText className="h-5 w-5 text-[#c3217e]" />
                      <span className="w-full truncate text-[9.5px] font-semibold text-muted-foreground">{f.name}</span>
                    </span>
                  )}
                  <button type="button" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove" className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {canPost ? (
          <div className="flex items-end gap-1.5 rounded-[22px] border border-border bg-card px-1.5 py-1.5 focus-within:border-foreground/30">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              aria-label="Add photos, videos or files"
              title="Add photos, videos or files"
              className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40"
            >
              <Paperclip className="h-[20px] w-[20px]" />
            </button>
            <MentionField
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              people={mentionPeople}
              peopleLabel={`In ${w.org.name}`}
              rows={1}
              placeholder={isAnnouncements ? "Share an update with everyone…" : `Message #${channel.name}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.defaultPrevented) {
                  e.preventDefault();
                  void send();
                }
              }}
              className="block max-h-[140px] min-h-[42px] w-full resize-none bg-transparent px-2 py-[10px] text-[15.5px] leading-[22px] outline-none placeholder:text-muted-foreground"
            />
            <button type="button" onClick={() => void send()} disabled={(!draft.trim() && files.length === 0) || sending} aria-label="Send" className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#c3217e] text-white transition active:scale-95 disabled:opacity-40">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
            </button>
          </div>
        ) : (
          <p className="rounded-2xl bg-foreground/[0.04] px-4 py-3 text-center text-[13px] text-muted-foreground">
            Only {w.org.name}, admins and {staffLabel(w.org.kind).toLowerCase()} post announcements. Chat in <span className="font-semibold">#general</span>.
          </p>
        )}
      </div>
      {viewer && (
        <ImageLightbox mediaUrls={viewer.urls} initialIndex={viewer.index} mediaTypes={viewer.types} caption={viewer.caption} isOpen onClose={() => setViewer(null)} allowDownload />
      )}
    </div>
  );
}

/* ── meetings ──────────────────────────────────────────────────────────── */

function MeetingRow({ m, orgId, compact, onEdit }: { m: WorkspaceMeeting; orgId: string; compact?: boolean; onEdit?: (m: WorkspaceMeeting) => void }) {
  const queryClient = useQueryClient();
  const rsvp = useMutation({
    mutationFn: (r: "going" | "maybe" | "declined") => workspaceApi.rsvp(m.id, r),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-meetings", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", orgId] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });
  const cancel = useMutation({
    mutationFn: () => workspaceApi.cancelMeeting(m.id),
    onSuccess: () => {
      toast.success("Meeting cancelled");
      void queryClient.invalidateQueries({ queryKey: ["workspace-meetings", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", orgId] });
    },
  });
  const start = new Date(m.starts_at);
  const live = Date.now() >= start.getTime() - 10 * 60_000 && Date.now() <= start.getTime() + m.duration_min * 60_000;
  const past = m.upcoming === false;
  return (
    <div className={`flex gap-3 rounded-2xl border border-border p-3 ${m.cancelled ? "opacity-60" : ""} ${compact ? "bg-background" : "bg-card md:p-4"}`}>
      <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center self-start rounded-xl bg-[#c3217e]/10 text-center text-[#c3217e]">
        <span className="text-[10.5px] font-bold uppercase leading-none">{start.toLocaleDateString([], { month: "short" })}</span>
        <span className="font-display text-[20px] font-semibold leading-tight">{start.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[14.5px] font-semibold">
          <span className="truncate">{m.title}</span>
          {live && !m.cancelled && <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10.5px] font-bold text-white">LIVE</span>}
          {m.cancelled && <span className="shrink-0 rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">Cancelled</span>}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {meetingWhen(m)}</p>
        {!compact && m.location && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-muted-foreground">
            {isLink(m.location) ? <Video className="h-3.5 w-3.5 shrink-0" /> : <MapPin className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{isLink(m.location) ? m.location.replace(/^https?:\/\//, "") : m.location}</span>
          </p>
        )}
        {!compact && m.agenda && <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/80">{m.agenda}</p>}
        {!compact && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {m.host ? `Hosted by ${m.host.name}` : ""}{(m.going || 0) > 0 ? ` · ${m.going} going` : ""}{(m.maybe || 0) > 0 ? ` · ${m.maybe} maybe` : ""}
          </p>
        )}
        {!m.cancelled && !past && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {isLink(m.location) && (
              <a href={m.location!} target="_blank" rel="noopener noreferrer" className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold ${live ? "bg-emerald-500 text-white" : "bg-foreground text-background"}`}>
                <Video className="h-3.5 w-3.5" /> Join
              </a>
            )}
            {(["going", "maybe", "declined"] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={rsvp.isPending}
                onClick={() => rsvp.mutate(r)}
                className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold transition ${
                  m.my_response === r ? "bg-[#c3217e] text-white" : "border border-border text-foreground/80 hover:border-foreground/30"
                }`}
              >
                {m.my_response === r && <Check className="h-3.5 w-3.5" />}
                {r === "going" ? "Going" : r === "maybe" ? "Maybe" : "Can't go"}
              </button>
            ))}
            {!compact && m.can_manage && (
              <>
                <button type="button" onClick={() => onEdit?.(m)} className="ml-auto text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">Edit</button>
                <button type="button" onClick={async () => (await confirmCard("Cancel this meeting for everyone?")) && cancel.mutate()} className="text-[12.5px] font-semibold text-muted-foreground hover:text-rose-600">Cancel</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingsView({ w, onBack }: { w: Workspace; onBack: () => void }) {
  const meetings = useQuery({ queryKey: ["workspace-meetings", w.org.id], queryFn: () => workspaceApi.meetings(w.org.id) });
  const [editing, setEditing] = useState<WorkspaceMeeting | "new" | null>(null);
  const canSchedule = ["owner", "admin", "staff"].includes(w.me.role);
  const upcoming = (meetings.data || []).filter((m) => m.upcoming && !m.cancelled);
  const past = (meetings.data || []).filter((m) => !m.upcoming || m.cancelled);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader
        title="Meetings"
        sub={`${upcoming.length} coming up`}
        onBack={onBack}
        icon={<Calendar className="h-5 w-5" />}
        action={canSchedule && <button type="button" onClick={() => setEditing("new")} className={`${btnPrimary} h-9`}><Plus className="h-4 w-4" /> Schedule</button>}
      />
      <div className="mx-auto max-w-[820px] space-y-3 px-4 py-5 md:px-6">
        {meetings.isLoading ? (
          <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-muted-foreground" />
        ) : upcoming.length === 0 && past.length === 0 ? (
          <Empty
            icon={<Calendar className="h-6 w-6" />}
            title="No meetings yet"
            body={canSchedule ? "Schedule stand-ups, classes, office hours or reviews. Everyone on the team is notified and can RSVP." : `When ${w.org.name} schedules a meeting, it shows up here.`}
            action={canSchedule && <button type="button" onClick={() => setEditing("new")} className={btnPrimary}><Plus className="h-4 w-4" /> Schedule a meeting</button>}
          />
        ) : (
          <>
            {upcoming.map((m) => <MeetingRow key={m.id} m={m} orgId={w.org.id} onEdit={setEditing} />)}
            {past.length > 0 && (
              <>
                <p className="px-1 pt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Earlier</p>
                {past.slice(0, 20).map((m) => <MeetingRow key={m.id} m={m} orgId={w.org.id} />)}
              </>
            )}
          </>
        )}
      </div>
      <MeetingDrawer orgId={w.org.id} meeting={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function MeetingDrawer({ orgId, meeting, onClose }: { orgId: string; meeting: WorkspaceMeeting | "new" | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existing = meeting && meeting !== "new" ? meeting : null;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState("");
  const [agenda, setAgenda] = useState("");
  useEffect(() => {
    if (!meeting) return;
    const start = existing ? new Date(existing.starts_at) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
    setTitle(existing?.title || "");
    setDate(localDate(start));
    setTime(localTime(start));
    setDuration(existing?.duration_min || 30);
    setLocation(existing?.location || "");
    setAgenda(existing?.agenda || "");
  }, [meeting]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () => {
      const starts = new Date(`${date}T${time}`);
      return workspaceApi.saveMeeting(orgId, { id: existing?.id, title: title.trim(), starts_at: starts.toISOString(), duration_min: duration, location, agenda });
    },
    onSuccess: () => {
      toast.success(existing ? "Meeting updated" : "Meeting scheduled", { description: existing ? undefined : "Everyone on the team has been notified." });
      void queryClient.invalidateQueries({ queryKey: ["workspace-meetings", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", orgId] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the meeting"),
  });
  const field = "mt-1.5 h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] outline-none focus:border-foreground/30";
  return (
    <Drawer open={Boolean(meeting)} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent overlayClassName="z-[10090]" className="z-[10100] mx-auto max-h-[92dvh] max-w-lg border-none bg-background">
        <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <h3 className="font-display text-[19px] font-semibold">{existing ? "Edit meeting" : "Schedule a meeting"}</h3>
          <label className="mt-4 block text-[12.5px] font-semibold text-muted-foreground">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Weekly stand-up" className={field} />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[12.5px] font-semibold text-muted-foreground">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold text-muted-foreground">Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
            </div>
          </div>
          <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground">Length</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[15, 30, 45, 60, 90, 120].map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${duration === d ? "bg-foreground text-background" : "border border-border"}`}>
                {d < 60 ? `${d} min` : `${d / 60} hr${d > 60 ? "s" : ""}`}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground">Where (a meeting link or a place)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://meet.google.com/… or Room 2, Yaba hub" className={field} />
          <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground">Agenda (optional)</label>
          <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3} maxLength={2000} placeholder="What you'll cover" className="mt-1.5 w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] outline-none focus:border-foreground/30" />
          <button type="button" disabled={title.trim().length < 2 || !date || !time || save.isPending} onClick={() => save.mutate()} className={`${btnPrimary} mt-5 h-12 w-full text-[15px]`}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save changes" : "Schedule and notify the team"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ── programmes ────────────────────────────────────────────────────────── */

function ProgrammesView({ w, onBack }: { w: Workspace; onBack: () => void }) {
  const programmes = useQuery({ queryKey: ["workspace-programmes", w.org.id], queryFn: () => workspaceApi.programmes(w.org.id) });
  const isOwner = w.me.role === "owner";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader
        title="Programmes"
        sub={`Bootcamps and training from ${w.org.name}`}
        onBack={onBack}
        icon={<GraduationCap className="h-5 w-5" />}
        action={isOwner && <Link to={(w.org.kind === "institutional" ? "/app/institution-studio" : "/app/business") as never} search={(w.org.kind === "institutional" ? {} : { tab: "team" }) as never} className={`${btnGhost} h-9`}>Manage</Link>}
      />
      <div className="mx-auto max-w-[980px] px-4 py-5 md:px-6">
        {programmes.isLoading ? (
          <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-muted-foreground" />
        ) : !programmes.data?.length ? (
          <Empty icon={<GraduationCap className="h-6 w-6" />} title="No programmes yet" body={isOwner ? "Bootcamps your organization runs, and training you assign to the team, appear here." : `Bootcamps ${w.org.name} runs or assigns to you will appear here.`} />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
            {programmes.data.map((b: any) => (
              <Link key={b.id} to="/app/bootcamps/$id" params={{ id: b.id }} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/25">
                <div className="relative aspect-[16/9] overflow-hidden bg-foreground/[0.05]">
                  {b.banner_url ? <img src={b.banner_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <span className="grid h-full place-items-center text-[#c3217e]"><GraduationCap className="h-8 w-8" /></span>}
                  <div className="absolute left-2 top-2 flex gap-1.5">
                    {b.assigned && <span className="rounded-full bg-[#c3217e] px-2.5 py-1 text-[11px] font-bold text-white">Assigned to you</span>}
                    {b.enrolled && <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white">Enrolled</span>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  {b.category && <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#c3217e]">{b.category}</p>}
                  <p className="mt-1 line-clamp-2 text-[15.5px] font-semibold leading-snug">{b.title}</p>
                  {b.tutor && (
                    <p className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground"><Avatar url={b.tutor.avatar_url} name={b.tutor.name} size={20} /> {b.tutor.name}</p>
                  )}
                  <p className="mt-auto pt-3 text-[12px] text-muted-foreground">
                    {b.starts_at ? new Date(b.starts_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "Self-paced"}
                    {b.ends_at ? ` – ${new Date(b.ends_at).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
                    {Number(b.team_enrolled) > 0 ? ` · ${b.team_enrolled} from the team` : ""}
                    {!b.own ? " · External" : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── communities ───────────────────────────────────────────────────────── */

function CommunitiesView({ w, onBack }: { w: Workspace; onBack: () => void }) {
  const clubs = useQuery({ queryKey: ["workspace-communities", w.org.id], queryFn: () => workspaceApi.communities(w.org.id) });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader title="Communities" sub={`Clubs run by ${w.org.name}`} onBack={onBack} icon={<IconClubs className="h-5 w-5" />} />
      <div className="mx-auto max-w-[980px] px-4 py-5 md:px-6">
        {clubs.isLoading ? (
          <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-muted-foreground" />
        ) : !clubs.data?.length ? (
          <Empty icon={<IconClubs className="h-6 w-6" />} title="No communities yet" body={w.me.role === "owner" ? "Create a club from your organization account and it appears here for the whole team." : `When ${w.org.name} opens a club, you'll find it here.`} />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
            {clubs.data.map((c: any) => (
              <Link key={c.id} to={"/app/clubs/chat" as never} search={{ clubId: c.id } as never} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/25">
                <div className="h-20 bg-foreground/[0.05]" style={c.banner_url ? undefined : { background: `linear-gradient(135deg, ${PINK}33, transparent)` }}>
                  {c.banner_url && <img src={c.banner_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="-mt-6 px-4 pb-4">
                  <span className="inline-block rounded-[12px] ring-4 ring-card"><Avatar url={c.logo_url} name={c.name} size={44} square /></span>
                  <p className="mt-2 truncate text-[15.5px] font-semibold">{c.name}</p>
                  {c.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{c.description}</p>}
                  <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted-foreground">
                    <span>{c.members} members{c.is_private ? " · Private" : ""}</span>
                    <span className={`rounded-full px-2.5 py-1 font-semibold ${c.joined ? "bg-emerald-500/10 text-emerald-600" : "bg-[#c3217e]/10 text-[#c3217e]"}`}>{c.joined ? "Joined" : "Open"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── people ────────────────────────────────────────────────────────────── */

function PeopleView({ w, people, loading, onBack, staffOnly }: { w: Workspace; people?: WorkspacePerson[]; loading: boolean; onBack: () => void; staffOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const canSeeDossiers = w.me.role === "owner" || w.me.role === "admin";
  const list = (people || [])
    .filter((p) => (staffOnly ? ["owner", "admin", "staff"].includes(p.role) && p.status === "active" : true))
    .filter((p) => !q.trim() || `${p.name} ${p.username} ${p.title || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const invited = list.filter((p) => p.status === "invited");
  const active = list.filter((p) => p.status === "active");
  const title = staffOnly ? staffLabel(w.org.kind) : "People";

  const row = (p: WorkspacePerson) => {
    const clickable = canSeeDossiers && p.role !== "owner";
    const inner = (
      <>
        <span className="relative">
          <Avatar url={p.avatar_url} name={p.name} size={44} square={p.role === "owner"} />
          {lastSeen(p.last_seen_at) === "Active now" && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-card" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{p.name}</span>
            {p.role !== "member" && <RoleChip role={p.role} kind={w.org.kind} />}
          </span>
          <span className="block truncate text-[12.5px] text-muted-foreground">
            {[p.title && p.role !== "owner" ? p.title : null, p.username ? `@${p.username}` : null, p.status === "invited" ? "Invite pending" : lastSeen(p.last_seen_at)].filter(Boolean).join(" · ")}
          </span>
        </span>
        {clickable ? (
          <span className="hidden shrink-0 items-center gap-1 text-[12.5px] font-semibold text-[#c3217e] sm:inline-flex">View profile <ChevronRight className="h-4 w-4" /></span>
        ) : p.username ? (
          <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
        ) : null}
      </>
    );
    return clickable ? (
      <button key={p.id} type="button" onClick={() => setOpen(p.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-foreground/[0.03] md:px-4">{inner}</button>
    ) : (
      <Link key={p.id} to={(p.role === "owner" ? "/app/profile/$id" : "/app/chat/$id") as never} params={{ id: p.role === "owner" ? p.username || p.id : p.id } as never} className="flex items-center gap-3 px-3 py-3 transition hover:bg-foreground/[0.03] md:px-4">{inner}</Link>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <SectionHeader
        title={title}
        sub={`${active.length} ${active.length === 1 ? "person" : "people"}${canSeeDossiers && invited.length ? ` · ${invited.length} invited` : ""}`}
        onBack={onBack}
        icon={staffOnly ? <BadgeCheck className="h-5 w-5" /> : <Users className="h-5 w-5" />}
        action={w.me.role === "owner" && <button type="button" onClick={() => setAdding(true)} className={`${btnPrimary} h-9`}><UserPlus className="h-4 w-4" /> Add people</button>}
      />
      <div className="mx-auto max-w-[820px] px-4 py-5 md:px-6">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none" />
        </label>
        {canSeeDossiers && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#c3217e]/[0.07] px-3 py-2.5 text-[12.5px] leading-snug text-foreground/80">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#c3217e]" />
            Open anyone on the team for their full Zero Club record: experience, credentials, learning, shipped projects and activity.
          </p>
        )}
        {loading ? (
          <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-muted-foreground" />
        ) : list.length === 0 ? (
          <Empty icon={<Users className="h-6 w-6" />} title={staffOnly ? `No ${title.toLowerCase()} yet` : "No one here yet"} body={staffOnly ? `${w.org.name} hasn't named any ${title.toLowerCase()} yet.` : "Invite people from Zero Club to build the team."} />
        ) : (
          <>
            <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{active.map(row)}</div>
            {invited.length > 0 && (
              <>
                <p className="mt-6 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Invited</p>
                <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-dashed border-border bg-card">{invited.map(row)}</div>
              </>
            )}
          </>
        )}
      </div>
      <MemberDossier orgId={w.org.id} memberId={open} canEdit={w.me.role === "owner"} kind={w.org.kind} onClose={() => setOpen(null)} />
      {w.me.role === "owner" && <AddPeopleDrawer open={adding} onOpenChange={setAdding} orgId={w.org.id} people={people || []} />}
    </div>
  );
}

function AddPeopleDrawer({ open, onOpenChange, orgId, people }: { open: boolean; onOpenChange: (o: boolean) => void; orgId: string; people: WorkspacePerson[] }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const results = useQuery({ queryKey: ["workspace-search", debounced], queryFn: () => workspaceApi.searchPeople(debounced), enabled: debounced.replace(/^@+/, "").length >= 1 });
  const onTeam = new Set(people.map((p) => p.id));
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const invite = useMutation({
    mutationFn: (id: string) => workspaceApi.invite(id).then(() => id),
    onSuccess: (id) => {
      setSent((cur) => new Set(cur).add(id));
      toast.success("Invite sent", { description: "They'll join once they accept from Teams." });
      void queryClient.invalidateQueries({ queryKey: ["workspace-people", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["business-team"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not invite"),
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent overlayClassName="z-[10090]" className="z-[10100] mx-auto max-h-[88dvh] max-w-lg border-none bg-background">
        <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <h3 className="font-display text-[19px] font-semibold">Add people from Zero Club</h3>
          <p className="mt-1 text-[13.5px] text-muted-foreground">They get an invitation in Teams. Once they accept, they're in your workspace and you can see their full record.</p>
          <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or @username" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear"><X className="h-4 w-4 text-muted-foreground" /></button>}
          </label>
          <div className="mt-3 max-h-[52dvh] divide-y divide-border overflow-y-auto">
            {debounced.replace(/^@+/, "").length < 1 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">Start typing a name or @username.</p>
            ) : results.isLoading ? (
              <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />
            ) : !results.data?.filter((p: any) => !onTeam.has(p.id) && !sent.has(p.id)).length ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">No one new found — people already invited or on the team aren't shown.</p>
            ) : (
              results.data.filter((p: any) => !onTeam.has(p.id) && !sent.has(p.id)).map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <Avatar url={p.avatar_url} name={p.full_name || p.username} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{p.full_name || p.username}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">@{p.username}{p.account_type ? ` · ${p.account_type}` : ""}</span>
                  </span>
                  <button type="button" disabled={invite.isPending && invite.variables === p.id} onClick={() => invite.mutate(p.id)} className={`${btnPrimary} h-8 px-3 text-[12.5px]`}>
                    {invite.isPending && invite.variables === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Invite
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
