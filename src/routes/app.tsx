import {
  useLoaderData,
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  MoreHorizontal,
  SlidersHorizontal,
  LifeBuoy,
  Zap,
  Palette,
  Check,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import {
  prepareAddAccount,
  logoutCurrentAccount,
  getSavedAccounts,
  switchAccount,
} from "@/lib/multiAccount";
import { getCachedSession } from "@/lib/auth";
import { useUser } from "@/hooks/useUser";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const BrandIcon = ({ src, className = "" }: { src: string; className?: string }) => {
  let scaleClass = "";
  if (src.includes("communities")) {
    scaleClass = "scale-[1.5]";
  } else if (src.includes("builder-feed") || src.includes("proof-")) {
    scaleClass = "scale-[1.2]";
  }

  return <img src={src} alt="" className={`object-contain ${scaleClass} ${className}`} />;
};

const tabs = [
  { to: "/app/", label: "Feed", iconSrc: "/landing-feed-taskbar-icon-brand.png", exact: true },
  { to: "/app/bootcamps", label: "Learn", iconSrc: "/landing-learning-icon-brand.png" },
  { to: "/app/clubs", label: "Clubs", iconSrc: "/logo.png" },
  { to: "/app/wallet", label: "Wallet", iconSrc: "/landing-wallet-icon-brand.png" },
  { to: "/app/chat", label: "Messages", iconSrc: "/landing-communities-icon-brand.png" },
];

const PAGE_TITLES: Record<string, string> = {
  "/app": "Feed",
  "/app/bootcamps": "Bootcamps",
  "/app/clubs": "Clubs",
  "/app/wallet": "Wallet",
  "/app/chat": "Messages",
  "/app/premium": "Premium",
  "/app/bookmarks": "Bookmarks",
  "/app/tutor-studio": "Tutor Studio",
  "/app/notifications": "Notifications",
  "/app/quests": "Quests",
  "/app/notes": "ZeroNotes",
};

const formatCompactNumber = (value?: number | null) => {
  const number = value || 0;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return number.toLocaleString();
};

function SidebarContent({
  profile,
  onOpenTheme,
  onClose,
}: {
  profile: any;
  onOpenTheme: () => void;
  onClose?: () => void;
}) {
  const [accounts, setAccounts] = React.useState<any[]>([]);

  React.useEffect(() => {
    setAccounts(getSavedAccounts());
  }, []);

  return (
    <div
      className="flex h-full flex-col p-5"
      onClick={(e) => {
        // Close sidebar if user clicked a link (navigation)
        const target = e.target as HTMLElement;
        if (target.closest("a")) {
          onClose?.();
        }
      }}
    >
      <div className="flex items-start justify-between shrink-0">
        <Link to="/app/profile" className="group block transition active:opacity-70">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="h-9 w-9 rounded-full object-cover border border-white/10"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-white">
              {profile?.username?.substring(0, 1).toUpperCase() || "U"}
            </div>
          )}
          <div className="mt-3">
            <div
              className="h-5 w-32 bg-foreground/[0.04] rounded animate-pulse mb-1"
              style={{ display: profile?.username ? "none" : "block" }}
            />
            <h2
              className="font-display text-[17px] font-semibold tracking-tight group-hover:text-primary transition-colors"
              style={{ display: profile?.username ? "block" : "none" }}
            >
              {profile?.full_name || profile?.username || "Builder"}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[13px] text-muted-foreground">
                {profile?.username ? `@${profile.username}` : "Fetching identity..."}
              </p>
              {profile?.xp !== undefined && (
                <span className="flex items-center gap-0.5 rounded-full bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/15 tabular-nums animate-in fade-in duration-500">
                  <Zap className="h-2.5 w-2.5" /> {formatCompactNumber(profile.xp)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] min-w-0 w-full">
            <div className="flex gap-1 items-center shrink-0 min-w-0">
              <span className="font-semibold text-foreground tabular-nums">{profile?.following_count || 0}</span>
              <span className="text-muted-foreground">Following</span>
            </div>
            <div className="flex gap-1 items-center shrink-0 min-w-0">
              <span className="font-semibold text-foreground tabular-nums">{profile?.followers_count || 0}</span>
              <span className="text-muted-foreground">Followers</span>
            </div>
          </div>
        </Link>
        <Drawer>
          <DrawerTrigger asChild>
            <button className="grid h-8 w-8 place-items-center rounded-full border border-border transition active:scale-95 mt-1">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="z-[100] border-t-border bg-background/95 backdrop-blur-xl p-6 border-none focus:ring-0">
            <div className="text-left mb-6">
              <h2 className="text-2xl font-bold text-foreground">Accounts</h2>
            </div>
            <div className="flex flex-col gap-4">
              {accounts.length === 0 && profile && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-accent/10">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-muted">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">
                          {profile?.username?.charAt(0).toUpperCase() || "U"}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">
                        {profile?.full_name || profile?.username || "Zero Builder"}
                      </span>
                      <span className="text-xs text-muted-foreground">{getFirstName(profile)}</span>
                    </div>
                  </div>
                  <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center text-white">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                </div>
              )}
              {accounts.map((acc) => {
                const isActive = acc.id === profile?.id;
                return (
                  <div
                    key={acc.id}
                    className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${isActive ? "bg-accent/10" : "hover:bg-accent/20"}`}
                    onClick={async () => {
                      if (!isActive) {
                        await switchAccount(acc);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full overflow-hidden bg-muted">
                        {acc.avatar_url ? (
                          <img src={acc.avatar_url} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">
                            {acc.username?.charAt(0).toUpperCase() || "U"}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">
                          {acc.full_name || acc.username || "Zero Builder"}
                        </span>
                        <span className="text-xs text-muted-foreground">{getFirstName(acc)}</span>
                      </div>
                    </div>
                    {isActive && (
                      <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => {
                  prepareAddAccount();
                  window.location.href = "/signup";
                }}
                className="w-full py-3.5 rounded-full ring-1 ring-border bg-transparent text-sm font-semibold tracking-tight text-foreground hover:bg-foreground/[0.04] tap mt-2"
              >
                Create a new account
              </button>
              <button
                onClick={() => {
                  prepareAddAccount();
                }}
                className="w-full py-3.5 rounded-full ring-1 ring-border bg-transparent text-sm font-semibold tracking-tight text-foreground hover:bg-foreground/[0.04] tap"
              >
                Add an existing account
              </button>

              <button
                onClick={async () => {
                  if (profile) {
                    await logoutCurrentAccount(profile.id);
                  } else {
                    await supabase.auth.signOut();
                    window.location.href = "/signin";
                  }
                }}
                className="w-full py-3.5 rounded-full bg-destructive/8 text-destructive text-sm font-semibold tracking-tight hover:bg-destructive/15 tap mt-2"
              >
                Log out
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="overflow-y-auto pr-2 -mr-2 mt-6 flex-1 no-scrollbar flex flex-col">
        <nav className="flex flex-col gap-1.5 flex-1">
          {[
            {
              iconSrc: "/landing-builder-feed-icon-brand.png",
              label: "Profile",
              to: "/app/profile",
            },
            { iconSrc: "/landing-wallet-icon-brand.png", label: "Membership", to: "/app/premium" },
            { iconSrc: "/logo.png", label: "Clubs", to: "/app/clubs" },
            {
              iconSrc: "/landing-proof-builders-icon-brand.png",
              label: "Bookmarks",
              to: "/app/bookmarks",
            },
            { iconSrc: "/landing-learning-icon-brand.png", label: "ZeroNotes", to: "/app/notes" },
            {
              iconSrc: "/landing-proof-teams-icon-brand.png",
              label: "ZeroHub",
              to: "/app/zerohub",
            },
            { iconSrc: "/landing-bootcamp-icon.svg", label: "Bootcamps", to: "/app/bootcamps" },
            ...(profile?.account_type === "Tutor" || profile?.account_type === "Institution"
              ? [
                  {
                    iconSrc: "/landing-proof-tutors-icon-brand.png",
                    label: "Tutor Studio",
                    to: "/app/tutor-studio",
                  },
                ]
              : []),
            ...(profile?.account_type === "Institution"
              ? [
                  {
                    iconSrc: "/landing-proof-institutions-icon-brand.png",
                    label: "Institution Hub",
                    to: "/app/institution-studio",
                  },
                ]
              : []),
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="flex items-center gap-4 rounded-xl px-3 py-2.5 text-[15px] font-medium tracking-tight tap hover:bg-foreground/[0.04]"
            >
              <BrandIcon src={item.iconSrc} className="h-[22px] w-[22px] opacity-80" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto pb-2 pt-2">
          <Accordion type="single" collapsible className="w-full border-none">
            <AccordionItem value="settings" className="border-none">
              <AccordionTrigger className="px-2.5 py-3 text-[13px] font-bold hover:no-underline text-muted-foreground">
                Settings & Support
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-1 pb-2">
                <Link
                  to="/app/settings"
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition active:bg-accent/50"
                >
                  <SlidersHorizontal className="h-[18px] w-[18px] opacity-80" />
                  <span>Settings and privacy</span>
                </Link>
                <button className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition active:bg-accent/50">
                  <LifeBuoy className="h-[18px] w-[18px] opacity-80" />
                  <span>Help Center</span>
                </button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <button
            onClick={onOpenTheme}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-[13px] font-bold text-muted-foreground transition active:bg-accent/50"
          >
            <Palette className="h-[18px] w-[18px] opacity-80" />
            <span>Display Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type BottomNavProps = {
  pathname: string;
  visible: boolean;
  isChat: boolean;
  isDetail: boolean;
  unreadCount: number;
};

function BottomNav({ pathname, visible, isChat, isDetail, unreadCount }: BottomNavProps) {
  return (
    <nav
      className={`fixed bottom-4 left-1/2 z-50 w-[95%] max-w-sm -translate-x-1/2 transition-all duration-300 md:hidden ${
        visible &&
        !isDetail &&
        !pathname.includes("/app/live") &&
        !pathname.includes("/app/notes") &&
        (!isChat || pathname === "/app/chat" || pathname === "/app/chat/")
          ? "translate-y-0 opacity-100"
          : "translate-y-[150%] opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-between gap-1 rounded-full bg-card/95 backdrop-blur-xl ring-1 ring-border p-1.5 shadow-lift">
        {tabs.map((t) => {
          const normalize = (p: string) => p.replace(/\/$/, "");
          const active = t.exact
            ? normalize(pathname) === normalize(t.to)
            : pathname.startsWith(t.to);

          if (active) {
            return (
              <Link
                key={t.to}
                to={t.to}
                className="relative flex h-11 w-auto shrink-0 items-center justify-center gap-2 rounded-full bg-foreground text-background px-4 tap"
              >
                <BrandIcon
                  src={t.iconSrc}
                  className="h-[22px] w-[22px] shrink-0 [filter:brightness(0)_invert(1)]"
                />
                <span className="font-semibold text-[12px] tracking-tight whitespace-nowrap">
                  {t.label}
                </span>
                {t.label === "Messages" && unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary text-primary-foreground px-1 text-[9px] font-bold ring-2 ring-card">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          }

          return (
            <Link
              key={t.to}
              to={t.to}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full tap hover:bg-foreground/5"
            >
              <BrandIcon src={t.iconSrc} className="h-[22px] w-[22px] opacity-70" />
              {t.label === "Messages" && unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-card">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type DesktopWorkspaceRailProps = {
  profile: any;
  pathname: string;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
};

function DesktopWorkspaceRail({
  profile,
  pathname,
  unreadMessagesCount,
  unreadNotificationsCount,
}: DesktopWorkspaceRailProps) {
  const role = profile?.account_type || "Learner";
  const isTutor = role === "Tutor" || role === "Institution";
  const isInstitution = role === "Institution";

  const primaryActions = isInstitution
    ? [
        {
          label: "Institution Hub",
          to: "/app/institution-studio",
          iconSrc: "/landing-proof-institutions-icon-brand.png",
        },
        {
          label: "Tutor Studio",
          to: "/app/tutor-studio",
          iconSrc: "/landing-proof-tutors-icon-brand.png",
        },
        {
          label: "Organization bootcamps",
          to: "/app/institution-studio",
          iconSrc: "/landing-bootcamp-icon.svg",
        },
      ]
    : isTutor
      ? [
          {
            label: "Tutor Studio",
            to: "/app/tutor-studio",
            iconSrc: "/landing-proof-tutors-icon-brand.png",
          },
          {
            label: "Create bootcamp",
            to: "/app/tutor-studio/create",
            iconSrc: "/landing-bootcamp-icon.svg",
          },
          { label: "Wallet", to: "/app/wallet", iconSrc: "/landing-wallet-icon-brand.png" },
        ]
      : [
          { label: "Ship work", to: "/app/ship", iconSrc: "/landing-feed-taskbar-icon-brand.png" },
          {
            label: "Find bootcamps",
            to: "/app/bootcamps",
            iconSrc: "/landing-learning-icon-brand.png",
          },
          {
            label: "Create note",
            to: "/app/notes/create",
            iconSrc: "/landing-learning-icon-brand.png",
          },
        ];

  const proofItems = [
    {
      label: "XP",
      value: formatCompactNumber(profile?.xp),
      iconSrc: "/landing-proof-builders-icon-brand.png",
    },
    {
      label: "Wallet",
      value: formatCompactNumber(profile?.coins),
      iconSrc: "/landing-wallet-icon-brand.png",
    },
    {
      label: "Messages",
      value: formatCompactNumber(unreadMessagesCount),
      iconSrc: "/landing-communities-icon-brand.png",
    },
  ];

  const workspaceNotes = isInstitution
    ? ["Tutor visibility", "Cohort outcomes", "Credentials and reporting"]
    : isTutor
      ? ["Bootcamp curriculum", "Learner progress", "Creator earnings"]
      : ["Proof of work", "Learning progress", "Reputation signals"];

  return (
    <aside className="hidden xl:flex h-screen w-[336px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/40 bg-background/75 px-5 py-5 no-scrollbar">
      <div className="rounded-2xl ring-1 ring-border bg-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Desktop workspace
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-foreground">{role}</h2>
          </div>
          <img src="/logo.png" alt="" className="h-10 w-10 object-contain" />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Zero Club connects learning, proof, reputation, and earning into one operating workspace.
        </p>
      </div>

      <div className="rounded-2xl ring-1 ring-border bg-card p-4 shadow-soft">
        <div className="grid grid-cols-3 gap-2">
          {proofItems.map((item) => (
            <div
              key={item.label}
              className="rounded-xl ring-1 ring-border bg-background/60 px-3 py-3 text-center"
            >
              <img src={item.iconSrc} alt="" className="mx-auto h-7 w-7 object-contain" />
              <div className="mt-2 text-lg font-bold leading-none text-foreground">
                {item.value}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl ring-1 ring-border bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Primary actions</h3>
          {unreadNotificationsCount > 0 && (
            <Link
              to="/app/notifications"
              className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary"
            >
              {unreadNotificationsCount} new
            </Link>
          )}
        </div>
        <div className="grid gap-2">
          {primaryActions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="flex items-center gap-3 rounded-xl ring-1 ring-border bg-background/60 px-3 py-3 text-sm font-semibold tracking-tight transition-colors hover:ring-primary/30 hover:bg-primary/5"
            >
              <img src={action.iconSrc} alt="" className="h-7 w-7 object-contain" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl ring-1 ring-border bg-card p-4 shadow-soft">
        <h3 className="text-sm font-bold text-foreground">What this workspace tracks</h3>
        <div className="mt-3 grid gap-2">
          {workspaceNotes.map((note) => (
            <div key={note} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>{note}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl ring-1 ring-primary/20 bg-primary/[0.04] p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          Current section
        </p>
        <p className="mt-2 text-sm font-semibold text-foreground">
          {pathname.replace("/app", "Zero Club") || "Zero Club"}
        </p>
      </div>
    </aside>
  );
}

const getInitialSession = () => {
  if (typeof window === "undefined") return null;
  const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  if (key) {
    try {
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
    } catch (e) {}
  }
  return null;
};

function AppLayout() {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);
  const [session, setSession] = useState<any>(getInitialSession);
  const [loading, setLoading] = useState(!getInitialSession());
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarClosing, setIsSidebarClosing] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const handleCloseSidebar = () => {
    setIsSidebarClosing(true);
    setTimeout(() => {
      setIsSidebarOpen(false);
      setIsSidebarClosing(false);
    }, 450);
  };

  useEffect(() => {
    const handleOpenSidebar = () => setIsSidebarOpen(true);
    window.addEventListener("open-sidebar", handleOpenSidebar);
    return () => window.removeEventListener("open-sidebar", handleOpenSidebar);
  }, []);

  const { data: profile, isLoading: profileLoading } = useUser();

  useEffect(() => {
    // Basic presence update - redirected from here to chat if club param exists
  }, [location.pathname, navigate]);

  useEffect(() => {
    let unreadBadgeCount = 0;

    const updatePresenceAndBadges = async () => {
      const {
        data: { session },
      } = await getCachedSession();
      if (session) {
        // 1. Update presence
        await supabase
          .from("profiles")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", session.user.id);

        // Self-heal: Mark any already accepted/declined club requests as read in the DB
        try {
          await supabase
            .from("messages")
            .update({ is_read: true })
            .eq("receiver_id", session.user.id)
            .eq("is_read", false)
            .like("content", "CLUB_REQUEST:%accepted");

          await supabase
            .from("messages")
            .update({ is_read: true })
            .eq("receiver_id", session.user.id)
            .eq("is_read", false)
            .like("content", "CLUB_REQUEST:%declined");
        } catch (e) {
          console.error("Database self-heal error:", e);
        }

        // 2. Get unread private messages
        const { count: pmCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", session.user.id)
          .eq("is_read", false)
          .not("content", "like", "CLUB_REQUEST:%");

        let totalUnread = pmCount || 0;

        // 3. Get unread club messages
        try {
          // Get joined clubs
          const { data: joinedClubs } = await supabase
            .from("club_members")
            .select("club_id")
            .eq("profile_id", session.user.id);

          if (joinedClubs && joinedClubs.length > 0) {
            const clubIds = joinedClubs.map((c) => c.club_id);
            // Get messages in last 24h
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentClubMsgs } = await supabase
              .from("club_messages")
              .select("club_id, created_at, profile_id")
              .in("club_id", clubIds)
              .gte("created_at", yesterday);

            if (recentClubMsgs) {
              const unreadClubCount = recentClubMsgs.filter((msg) => {
                if (msg.profile_id === session.user.id) return false;
                const lastReadStr =
                  typeof window !== "undefined"
                    ? localStorage.getItem(`last_club_read_${msg.club_id}`)
                    : null;
                const lastRead = lastReadStr ? new Date(lastReadStr).getTime() : 0;
                return new Date(msg.created_at).getTime() > lastRead;
              }).length;
              totalUnread += unreadClubCount;
            }
          }
        } catch (e) {
          console.error("Error fetching club unread", e);
        }

        setUnreadMessagesCount(pmCount || 0);

        // 4. Get unread notifications
        try {
          const { count: notifCount } = await supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("recipient_id", session.user.id)
            .eq("is_read", false);
          setUnreadNotificationsCount(notifCount || 0);
          totalUnread += notifCount || 0;
        } catch (e) {
          console.error("Error fetching notifications unread", e);
        }

        // 5. Update App Badge
        if (typeof navigator !== "undefined" && "setAppBadge" in navigator) {
          if (totalUnread > 0) {
            (navigator as any).setAppBadge(totalUnread).catch(console.error);
          } else {
            (navigator as any).clearAppBadge().catch(console.error);
          }
        }
      }
    };

    updatePresenceAndBadges();
    const interval = setInterval(updatePresenceAndBadges, 30000); // Check every 30 seconds

    // Subscribe to realtime messages to instantly trigger badge update
    let pmSub: any, clubSub: any;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        pmSub = supabase
          .channel("badge_pms")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "messages" },
            async (payload) => {
              const message = payload.new as {
                receiver_id?: string;
                sender_id?: string;
                content?: string;
              };
              if (
                message &&
                (message.receiver_id === session.user.id || message.sender_id === session.user.id)
              ) {
                updatePresenceAndBadges();

                // Trigger a high-fidelity toast notification for new incoming unseen DMs
                if (
                  payload.eventType === "INSERT" &&
                  message.receiver_id === session.user.id &&
                  !window.location.pathname.includes(`/app/chat/${message.sender_id}`)
                ) {
                  try {
                    const { data: sender } = await supabase
                      .from("profiles")
                      .select("username, full_name, avatar_url")
                      .eq("id", message.sender_id)
                      .single();

                    const senderName = sender?.full_name || sender?.username || "Someone";
                    const avatarUrl = sender?.avatar_url;
                    const content = message.content || "";
                    const isRequest = content.startsWith("CLUB_REQUEST:");

                    let displayContent = content;
                    if (isRequest) {
                      const parts = content.split(":");
                      const clubName = parts[2] || "Club";
                      displayContent = `🔒 Requested to join your club: ${clubName}`;
                    } else if (content.includes("$$MEDIA$$")) {
                      const textPart = content.split("$$MEDIA$$")[0].trim();
                      if (textPart) {
                        displayContent = textPart;
                      } else {
                        const urls = content.split("$$MEDIA$$")[1] || "";
                        const firstUrl = urls.split(",")[0]?.toLowerCase() || "";
                        if (
                          firstUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp)/i) ||
                          firstUrl.includes("image")
                        )
                          displayContent = "📷 Sent you a picture";
                        else if (
                          firstUrl.match(/\.(mp4|webm|ogg|mov)/i) ||
                          firstUrl.includes("video")
                        )
                          displayContent = "🎥 Sent you a video";
                        else if (
                          firstUrl.match(/\.(mp3|wav|m4a|aac)/i) ||
                          firstUrl.includes("audio")
                        )
                          displayContent = "🎵 Sent you a voice note";
                        else displayContent = "📎 Sent you an attachment";
                      }
                    }

                    const preview =
                      displayContent.length > 60
                        ? displayContent.slice(0, 60) + "..."
                        : displayContent;

                    toast(senderName, {
                      description: preview,
                      icon: avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={senderName}
                          className="h-8 w-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
                          {senderName.substring(0, 1)}
                        </div>
                      ),
                      action: {
                        label: "Reply",
                        onClick: () =>
                          router.navigate({
                            to: "/app/chat/$id",
                            params: { id: message.sender_id || "" },
                          }),
                      },
                    });
                  } catch (e) {
                    console.error("Error showing new message notification", e);
                  }
                }
              }
            },
          )
          .subscribe();

        clubSub = supabase
          .channel("badge_club_msgs")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "club_messages" },
            (payload) => {
              if (payload.new.profile_id !== session.user.id) updatePresenceAndBadges();
            },
          )
          .subscribe();
      }
    });

    return () => {
      clearInterval(interval);
      if (pmSub) supabase.removeChannel(pmSub);
      if (clubSub) supabase.removeChannel(clubSub);
    };
  }, []);
  const router = useRouter();

  // Theme State
  const [darkMode, setDarkMode] = useState<"on" | "off" | "system" | "premium">("off");
  const [darkTheme, setDarkTheme] = useState<"dim" | "lights-out">("lights-out");
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedDarkMode = localStorage.getItem("darkMode") as
        | "on"
        | "off"
        | "system"
        | "premium";
      const storedDarkTheme = localStorage.getItem("darkTheme") as "dim" | "lights-out";

      if (storedDarkMode) setDarkMode(storedDarkMode === "premium" ? "off" : storedDarkMode);
      if (storedDarkTheme) setDarkTheme(storedDarkTheme);
      setThemeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;

    const root = window.document.documentElement;

    const applyTheme = () => {
      root.classList.remove("dark", "dim", "lights-out", "premium");

      if (darkMode !== "premium") {
        const isDark =
          darkMode === "on" ||
          (darkMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) {
          root.classList.add("dark");
          root.classList.add(darkTheme);
        }
      }
    };

    applyTheme();

    if (darkMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    localStorage.setItem("darkMode", darkMode);
    localStorage.setItem("darkTheme", darkTheme);
  }, [darkMode, darkTheme, themeLoaded]);

  useEffect(() => {
    let mounted = true;

    // Safety fallback: if session doesn't resolve in 4s, unblock UI
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return;
        if (error) console.error("getSession error:", error);

        setSession(session);
        setLoading(false);

        if (!session) {
          const search = new URLSearchParams(window.location.search);
          router.navigate({
            to: "/signup",
            search: {
              ref: search.get("ref") || "",
              club: search.get("club") || "",
            },
          });
        }
      })
      .catch((e) => {
        if (!mounted) return;
        console.error("getSession exception:", e);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setSession(session);
      setLoading(false);
      if (event === "SIGNED_OUT") {
        const search = new URLSearchParams(window.location.search);
        router.navigate({
          to: "/signup",
          search: {
            ref: search.get("ref") || "",
            club: search.get("club") || "",
          },
        });
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router]);

  // 2. Handle Club Invites from URL
  useEffect(() => {
    if (!session) return;
    const search = new URLSearchParams(location.search);
    const clubId = search.get("club");
    if (clubId) {
      // Check if already a member
      supabase
        .from("club_members")
        .select("id")
        .eq("club_id", clubId)
        .eq("profile_id", session.user.id)
        .single()
        .then(({ data: member }) => {
          if (!member) {
            // Join the club
            return supabase.from("club_members").insert({
              club_id: clubId,
              profile_id: session.user.id,
              role: "Member",
            });
          }
        })
        .then(() => {
          // Redirect to club chat with rules flag
          router.navigate({
            to: "/app/clubs/chat",
            search: { showRules: "true", clubId: clubId },
          });
        });
    }
  }, [session, location.search, router]);

  // Redundant profile query removed, now using useUser hook at top

  const getPageTitle = React.useMemo(() => {
    const path = pathname.toLowerCase();
    const match = Object.entries(PAGE_TITLES).find(([route]) => path.startsWith(route));
    return match ? match[1] : "Zero Club";
  }, [pathname]);

  const isFeed = pathname === "/app" || pathname === "/app/";
  const isChat = pathname.includes("/chat");
  const isChatInbox = pathname === "/app/chat" || pathname === "/app/chat/";
  const isPostDetail = pathname.startsWith("/app/post/");
  const isDetail = pathname.includes("/detail") || isPostDetail;
  const hideHeader = !isFeed;

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollPos = window.scrollY;
      const diff = currentScrollPos - lastScrollY;

      if (Math.abs(diff) > 10) {
        if (currentScrollPos > 80 && diff > 0) {
          setVisible((v) => (v ? false : v));
        } else {
          setVisible((v) => (v ? v : true));
        }
        lastScrollY = currentScrollPos;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <img src="/logo.png" alt="Zero Club" className="h-10 w-auto opacity-90" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="zc-app-shell mx-auto min-h-screen w-full bg-background md:flex md:max-w-none md:justify-center">
      {/* Desktop Sidebar (Left Column) */}
      <div className="hidden md:flex flex-col w-[292px] shrink-0 sticky top-0 h-screen border-r border-border/40 bg-background z-40 overflow-y-auto no-scrollbar">
        <SidebarContent profile={profile} onOpenTheme={() => setIsThemeOpen(true)} />
      </div>

      {/* Main Center Column */}
      <div className="zc-app-main w-full max-w-md mx-auto md:mx-0 md:max-w-none flex-1 flex flex-col relative min-h-screen md:border-r border-border/10">
        {!hideHeader && (
          <header
            className={`fixed top-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 md:sticky md:left-0 md:translate-x-0 md:max-w-full flex items-center justify-between bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline px-5 pb-3.5 pt-[calc(1rem+env(safe-area-inset-top))] transition-transform duration-300 ease-out-expo ${
              visible ? "translate-y-0" : "-translate-y-full"
            }`}
          >
            <div className="flex w-10 items-center md:hidden">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-border tap"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-primary flex items-center justify-center text-[10px] font-semibold text-white uppercase">
                    {profile?.username?.substring(0, 1) || "U"}
                  </div>
                )}
              </button>
            </div>

            <div className="flex-1 flex justify-center">
              {isFeed ? (
                <img src="/logo.png" alt="Zero Club" className="h-8 w-auto object-contain" />
              ) : (
                <h1 className="font-display text-[17px] font-semibold tracking-tight">{getPageTitle}</h1>
              )}
            </div>

            <div className="flex w-10 items-center justify-end">
              <Link
                to="/app/notifications"
                className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04] text-foreground relative"
              >
                <BellRing className="h-[18px] w-[18px]" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                )}
              </Link>
            </div>
          </header>
        )}

        {/* Custom Floating Capsule Sidebar */}
        {(isSidebarOpen || isSidebarClosing) && (
          <>
            {/* Blurred overlay - closes sidebar on click */}
            <div
              className={`fixed inset-0 z-[70] bg-black/50 backdrop-blur-md ${isSidebarClosing ? "animate-out fade-out duration-500 ease-in-out fill-mode-forwards" : "animate-in fade-in duration-500 ease-out"}`}
              onClick={handleCloseSidebar}
            />
            {/* Floating sidebar panel */}
            <div
              className={`fixed left-3 top-4 z-[80] w-[280px] h-[calc(100dvh-110px)] flex flex-col rounded-[32px] border border-border/40 bg-card/95 backdrop-blur-xl shadow-[0_8px_60px_rgba(0,0,0,0.4)] overflow-hidden ${isSidebarClosing ? "animate-out fade-out slide-out-to-left-full duration-500 ease-in-out fill-mode-forwards" : "animate-in fade-in slide-in-from-left-full duration-500 ease-out"}`}
            >
              <SidebarContent
                profile={profile}
                onClose={handleCloseSidebar}
                onOpenTheme={() => {
                  setIsSidebarOpen(false);
                  setIsSidebarClosing(false);
                  setIsThemeOpen(true);
                }}
              />
            </div>
          </>
        )}

        {/* Theme Selection Sheet */}
        <Drawer open={isThemeOpen} onOpenChange={setIsThemeOpen}>
          <DrawerContent className="border-none bg-background p-6 focus:ring-0">
            <h2 className="text-[22px] font-semibold tracking-tight mb-1">Display</h2>
            <p className="text-[13px] text-muted-foreground mb-6">Choose how Zero Club looks to you.</p>

            <div className="space-y-1">
              {[
                { key: "standard", label: "Standard", desc: "Warm ivory, editorial", active: darkMode === "off", onClick: () => setDarkMode("off") },
                { key: "black", label: "Black", desc: "Lights out — pure contrast", active: darkMode === "on" && darkTheme === "lights-out", onClick: () => { setDarkMode("on"); setDarkTheme("lights-out"); } },
                { key: "dim", label: "Dim", desc: "Softer dark for evenings", active: darkMode === "on" && darkTheme === "dim", onClick: () => { setDarkMode("on"); setDarkTheme("dim"); } },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={opt.onClick}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 tap transition-colors ${opt.active ? "bg-primary/[0.06] ring-1 ring-primary/20" : "hover:bg-foreground/[0.03]"}`}
                >
                  <div className="text-left">
                    <div className="text-[15px] font-semibold tracking-tight">{opt.label}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                  <div className={`h-5 w-5 rounded-full grid place-items-center transition-colors ${opt.active ? "bg-primary" : "ring-1 ring-border"}`}>
                    {opt.active && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                  </div>
                </button>
              ))}
            </div>

            <p className="mt-6 border-t hairline pt-4 text-[11px] leading-relaxed text-muted-foreground">
              Standard uses the Zero Club editorial palette. Dark variants are personal display options.
            </p>

            <button
              onClick={() => setIsThemeOpen(false)}
              className="mt-8 w-full rounded-full bg-foreground py-3.5 font-semibold tracking-tight text-background tap"
            >
              Done
            </button>
          </DrawerContent>
        </Drawer>

        <div
          className={`zc-desktop-content ${!hideHeader ? "pt-[calc(72px+env(safe-area-inset-top))] md:pt-0" : "pt-[env(safe-area-inset-top)]"} ${(!isChat || isChatInbox) && !isDetail && !pathname.includes("/app/notes") ? "pb-24 md:pb-0" : "pb-0"}`}
        >
          <Outlet />
        </div>

        <BottomNav
          pathname={pathname}
          visible={visible}
          isChat={isChat}
          isDetail={isDetail}
          unreadCount={unreadMessagesCount}
        />
      </div>
      <DesktopWorkspaceRail
        profile={profile}
        pathname={pathname}
        unreadMessagesCount={unreadMessagesCount}
        unreadNotificationsCount={unreadNotificationsCount}
      />
    </div>
  );
}
