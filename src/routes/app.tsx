import { createFileRoute, Outlet, Link, useNavigate, useLocation, useRouter } from "@tanstack/react-router";
import {
  MoreHorizontal,
  Zap,
  Palette,
  Check,
  Rocket,
  Activity,
  Users,
  LayoutGrid,
  BarChart3,
  Settings,
  ChevronLeft,
  UserPlus,
  LogIn,
  LogOut,
  ShieldCheck,
  ClipboardList,
  Calendar,
  Lock,
  Search,
} from "@/components/icons/glyphs";
import React, { useState, useEffect, useRef } from "react";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { IconHome, IconLearn, IconClubs, IconWallet, IconMessages, IconGames, IconGem, IconBookmark, IconNotes, IconCompass, IconMetrics, IconPresentation, IconInstitution, IconStore, IconBell, IconRocket, IconSpark, IconShield, IconPost } from "@/components/icons/nav";
import { supabase } from "@/lib/supabase";
import {
  prepareAddAccount,
  logoutCurrentAccount,
  getSavedAccounts,
  switchAccount,
} from "@/lib/multiAccount";
import { getCachedSession } from "@/lib/auth";
import { NOIR_THEME, getNoirAccess, startNoirTrial } from "@/lib/noirTheme";
import { useUser } from "@/hooks/useUser";
import { useTrackNavigationDepth } from "@/hooks/useGoBack";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import { useIdlePreload } from "@/hooks/useIdlePreload";
import { isGuestReadablePath } from "@/lib/guestAccess";
import { toast } from "sonner";
import { getFirstName, displayName, getLevelFromXp } from "@/lib/utils";
import { directMessagePreview } from "@/lib/directMessage";
import { IncomingNotificationCard } from "@/components/IncomingNotificationCard";
import { PushPrompt } from "@/components/PushPrompt";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { MODES, modeOf, needsOnboarding } from "@/lib/modes";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

/* The tab bar. Post is not a destination — it opens the create sheet on the
   feed — so it has no route of its own. */
const tabs = [
  { to: "/app/", label: "Home", Icon: IconHome, exact: true },
  { to: "/app/bootcamps", label: "Learn", Icon: IconLearn },
  { to: null, label: "Post", Icon: IconPost },
  { to: "/app/clubs", label: "Clubs", Icon: IconClubs },
  { to: "/app/notifications", label: "Alerts", Icon: IconBell },
];

const PAGE_TITLES: Record<string, string> = {
  "/app": "Feed",
  "/app/bootcamps": "Bootcamps",
  "/app/clubs": "Clubs",
  "/app/wallet": "Wallet",
  "/app/chat": "Messages",
  "/app/games": "Zero Games",
  "/app/games/solo": "Solo Game",
  "/app/premium": "Premium",
  "/app/creator": "Creator Workspace",
  "/app/bookmarks": "Bookmarks",
  "/app/tutor-studio": "Tutor Studio",
  "/app/notifications": "Notifications",
  "/app/quests": "Opportunities",
  "/app/metrics": "Metrics",
  "/app/notes": "ZeroNotes",
  "/app/drafts": "Drafts",
  "/app/store": "Zero Store",
  "/app/zero-ai": "Zero AI",
  "/app/zerohub": "ZeroHub",
  "/app/admin": "Admin Control Center",
};

const formatCompactNumber = (value?: number | null) => {
  const number = value || 0;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return number.toLocaleString();
};

const INSTITUTION_SIDEBAR_TABS = [
  { key: "overview", label: "Overview", Icon: Activity },
  { key: "tutors", label: "Tutors", Icon: Users },
  { key: "bootcamps", label: "Bootcamps", Icon: LayoutGrid },
  { key: "operations", label: "Operations", Icon: Calendar },
  { key: "zero-forms", label: "Zero Forms", Icon: ClipboardList },
  { key: "analytics", label: "Analytics", Icon: BarChart3 },
  { key: "settings", label: "Settings", Icon: Settings },
] as const;

/* Accounts drawer — 44px avatar and the trailing "selected" dot. */
function AccountAvatar({ url, initial }: { url?: string | null; initial: string }) {
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="grid h-full w-full place-items-center font-display text-[16px] font-semibold text-muted-foreground">{initial}</div>
      )}
    </div>
  );
}

function AccountSelectedDot({ selected }: { selected: boolean }) {
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${selected ? "bg-[#cc208f]" : "border-[1.5px] border-foreground/20"}`}>
      {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
    </span>
  );
}

function SidebarContent({
  profile,
  onOpenTheme,
  onClose,
  onNavigate,
  isInstitutionStudio,
  unreadMessagesCount = 0,
  unreadNotificationsCount = 0,
}: {
  profile: any;
  onOpenTheme: () => void;
  onClose?: () => void;
  onNavigate?: () => void;
  isInstitutionStudio?: boolean;
  unreadMessagesCount?: number;
  unreadNotificationsCount?: number;
}) {
  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [institutionActiveTab, setInstitutionActiveTab] = React.useState("overview");
  const isLearnerAccount = String(profile?.account_type || "Learner").toLowerCase() === "learner";

  React.useEffect(() => {
    setAccounts(getSavedAccounts());
  }, []);

  // Sync institution tab active state when tab changes (from this sidebar or from mobile)
  React.useEffect(() => {
    if (!isInstitutionStudio) return;
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) setInstitutionActiveTab(tab);
    };
    window.addEventListener("institution-tab-change", handler);
    return () => window.removeEventListener("institution-tab-change", handler);
  }, [isInstitutionStudio]);

  const level = getLevelFromXp(Number(profile?.xp || 0));
  const mode = modeOf(profile);
  const role = mode ? MODES[mode].label : "Institution";

  /* Everything reachable from the shell that is not already on the tab bar.
     On mobile the tab bar carries Home, Learn, Post, Clubs and Alerts, and
     the top bar carries Messages, so those five and Messages are desktop-only
     here. Desktop has no tab bar, so it gets them all. */
  const primaryLinks: any[] = [
    { Icon: IconHome, label: "Home", to: "/app", desktopOnly: true, exact: true },
    { Icon: IconLearn, label: "Learn", to: "/app/bootcamps", desktopOnly: true },
    { Icon: IconClubs, label: "Clubs", to: "/app/clubs", desktopOnly: true },
    { Icon: IconBell, label: "Notifications", to: "/app/notifications", desktopOnly: true, badge: unreadNotificationsCount },
    { Icon: IconMessages, label: "Messages", to: "/app/chat", desktopOnly: true, badge: unreadMessagesCount },
    { Icon: IconShield, label: "Tasks", to: "/app/tasks" },
    { Icon: IconWallet, label: "Wallet", to: "/app/wallet" },
    { Icon: IconRocket, label: "Opportunities", to: "/app/quests" },
    { Icon: IconStore, label: "Zero Store", to: "/app/store" },
    { Icon: IconCompass, label: "ZeroHub", to: "/app/zerohub" },
    { Icon: IconNotes, label: "ZeroNotes", to: "/app/notes" },
    { Icon: IconGames, label: "Games", to: "/app/games" },
    { Icon: IconSpark, label: "Zero AI", to: "/app/zero-ai" },
    { Icon: IconBookmark, label: "Bookmarks", to: "/app/bookmarks" },
  ];
  const workspaceLinks: any[] = [
    { Icon: IconStore, label: "My Store", to: "/app/my-store" },
    { Icon: IconMetrics, label: "Metrics", to: "/app/metrics" },
    ...(mode === "creator" || String(profile?.tier || "").toLowerCase() === "creator"
      ? [{ Icon: IconClubs, label: "Creator Workspace", to: "/app/creator" }]
      : []),
    ...(profile?.account_type === "Tutor" ? [{ Icon: IconPresentation, label: "Tutor Studio", to: "/app/tutor-studio" }] : []),
    ...(profile?.account_type === "Institution" ? [{ Icon: IconInstitution, label: "Digital Hub", to: "/app/institution-studio" }] : []),
    ...(profile?.is_admin ? [{ Icon: IconShield, label: "Admin Control Center", to: "/app/admin" }] : []),
  ];

  const renderLink = (item: any) => (
    <Link
      key={item.label}
      to={item.to}
      activeOptions={{ exact: !!item.exact }}
      activeProps={{ className: "bg-foreground/[0.06] !font-semibold !text-foreground" }}
      className={`group ${item.desktopOnly ? "hidden md:flex" : "flex"} h-12 items-center gap-3.5 rounded-[10px] px-3 text-[16px] font-medium text-foreground/85 tap transition-colors hover:bg-foreground/[0.04] hover:text-foreground md:h-11 md:text-[15px]`}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <item.Icon active={isActive} className="h-[22px] w-[22px] shrink-0 md:h-5 md:w-5" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge > 0 && (
            <span className="ml-auto grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[12px] font-semibold tabular-nums text-accent-foreground">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );

  return (
    <div
      className="flex h-full flex-col"
      onClick={(e) => {
        // Close sidebar if user clicked a link (navigation)
        const target = e.target as HTMLElement;
        if (target.closest("a")) {
          if (onNavigate) onNavigate();
          else onClose?.();
        }
      }}
    >
      {/* Who you are, first — the same order as the profile it links to. */}
      <div className="shrink-0 border-b border-border px-5 pb-4 pt-5">
        <div className="flex items-start justify-between">
          <Link to="/app/profile" aria-label="Your profile" className="tap">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-full bg-accent/10 font-display text-[22px] font-semibold text-accent">
                {profile?.username?.substring(0, 1).toUpperCase() || "U"}
              </div>
            )}
          </Link>
        <Drawer>
          <DrawerTrigger asChild>
            <button className="mt-0.5 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-95">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="z-[100] mx-auto max-w-lg border-border bg-background p-0 focus:ring-0">
            <div className="px-5 pb-3 pt-1 text-left">
              <h2 className="font-display text-[20px] font-semibold leading-tight text-foreground">Accounts</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">Switch profiles or start another Zero Club identity.</p>
            </div>
            <div className="flex max-h-[72vh] flex-col overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="px-5 pb-1 pt-2">
                <p className="text-[13px] font-semibold text-muted-foreground">Signed in</p>
              </div>
              <div className="px-2">
                {accounts.length === 0 && profile && (
                  <div className="flex items-center gap-3 rounded-2xl px-3 py-3">
                    <AccountAvatar url={profile?.avatar_url} initial={profile?.username?.charAt(0).toUpperCase() || "U"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-foreground">{displayName(profile)}</p>
                      <p className="truncate text-[13px] text-muted-foreground">{getFirstName(profile)}</p>
                    </div>
                    <AccountSelectedDot selected />
                  </div>
                )}
                {accounts.map((acc) => {
                  const isActive = acc.id === profile?.id;
                  return (
                    <div
                      key={acc.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${isActive ? "bg-[#cc208f]/[0.06]" : "hover:bg-foreground/[0.04]"}`}
                      onClick={async () => {
                        if (!isActive) {
                          await switchAccount(acc);
                        }
                      }}
                    >
                      <AccountAvatar url={acc.avatar_url} initial={acc.username?.charAt(0).toUpperCase() || "U"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-foreground">{displayName(acc)}</p>
                        <p className="truncate text-[13px] text-muted-foreground">{getFirstName(acc)}</p>
                      </div>
                      {isActive && <AccountSelectedDot selected />}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 px-5 pb-1 pt-3">
                <p className="text-[13px] font-semibold text-muted-foreground">Add another</p>
              </div>
              <button
                onClick={() => prepareAddAccount("/signup?add_account=true")}
                className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left text-[16px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
              >
                <UserPlus className="h-[22px] w-[22px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block">Create a new account</span>
                  <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">Keep this account saved and make another profile</span>
                </span>
              </button>
              <button
                onClick={() => prepareAddAccount()}
                className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left text-[16px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
              >
                <LogIn className="h-[22px] w-[22px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block">Add an existing account</span>
                  <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">Sign in and add it to the account switcher</span>
                </span>
              </button>

              <div className="px-5 pt-4">
                <button
                  onClick={async () => {
                    if (profile) {
                      await logoutCurrentAccount(profile.id);
                    } else {
                      await supabase.auth.signOut();
                      window.location.href = "/signin";
                    }
                  }}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#e0245e]/10 text-[16px] font-semibold text-[#e0245e] transition-colors hover:bg-[#e0245e]/15 tap"
                >
                  <LogOut className="h-5 w-5" /> Log out of Zero Club
                </button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
        </div>
        <Link to="/app/profile" className="mt-3 block min-w-0">
          {profile?.username ? (
            <h2 className="truncate font-display text-[20px] font-semibold tracking-[-0.01em] text-foreground">{displayName(profile)}</h2>
          ) : (
            <div className="h-6 w-36 animate-pulse rounded bg-foreground/[0.05]" />
          )}
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {role} · Level {level}
          </p>
          <span className="mt-1.5 inline-block text-[14px] font-semibold text-accent">View profile</span>
        </Link>
        {/* One account, three modes. Switching takes you to that mode's home. */}
        <ModeSwitcher profile={profile} className="mt-3" onSwitched={onNavigate ?? onClose} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to="/app/tasks" className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 tap hover:bg-foreground/[0.06]">
            <span className="block text-[12px] text-muted-foreground">Zero Points</span>
            <span className="mt-0.5 block text-[17px] font-semibold tabular-nums text-foreground">{Number(profile?.zp || 0).toLocaleString()} ZP</span>
          </Link>
          <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || "me" }} className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 tap hover:bg-foreground/[0.06]">
            <span className="block text-[12px] text-muted-foreground">Followers</span>
            <span className="mt-0.5 block text-[17px] font-semibold tabular-nums text-foreground">{formatCompactNumber(profile?.followers_count)}</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-2 py-2 no-scrollbar">
        {isInstitutionStudio ? (
          /* ── Digital Hub sidebar: replaces regular nav when on institution-studio ── */
          <div className="flex flex-1 flex-col">
            <p className="px-3 pb-2 pt-2 text-[12px] font-semibold text-muted-foreground">Digital Hub</p>
            <nav className="flex flex-1 flex-col">
              {INSTITUTION_SIDEBAR_TABS.map(({ key, label, Icon }) => {
                const isActive = institutionActiveTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setInstitutionActiveTab(key);
                      window.dispatchEvent(new CustomEvent("institution-tab-change", { detail: key }));
                      onClose?.();
                    }}
                    className={`flex h-12 items-center gap-3.5 rounded-[10px] px-3 text-[16px] font-medium tap transition-colors md:h-11 md:text-[15px] ${
                      isActive ? "bg-foreground/[0.06] font-semibold text-foreground" : "text-foreground/85 hover:bg-foreground/[0.04]"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? "fill-current" : ""}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
            <Link to="/app" className="mt-auto flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-medium text-muted-foreground tap hover:bg-foreground/[0.04] hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
              <span>Back to app</span>
            </Link>
          </div>
        ) : (
          <nav className="flex flex-col">
            {primaryLinks.map(renderLink)}
            <div className="mx-3 my-2 h-px bg-border" />
            {workspaceLinks.map(renderLink)}
            <Link
              to="/app/premium"
              className="mx-1 mt-3 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] p-3 tap hover:bg-accent/[0.09]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-foreground">
                <IconGem active className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">Go PRO</span>
                <span className="block truncate text-[12px] text-muted-foreground">More clubs, Zero AI help, verified badge</span>
              </span>
            </Link>
          </nav>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-border px-2 py-2">
        <Link to="/app/settings" className="flex h-11 flex-1 items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-medium text-muted-foreground tap hover:bg-foreground/[0.04] hover:text-foreground">
          <Settings className="h-5 w-5" />
          <span>Settings</span>
        </Link>
        <button onClick={onOpenTheme} className="flex h-11 flex-1 items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-medium text-muted-foreground tap hover:bg-foreground/[0.04] hover:text-foreground">
          <Palette className="h-5 w-5" />
          <span>Display</span>
        </button>
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
  onPost: () => void;
};

/* The floating tab bar. Its shape, its fade on scroll and its label type are
   deliberate and fixed; only what sits in the five slots is chosen here. The
   labels keep Montserrat even though the rest of the app moved on, because the
   bar is meant to look exactly as it always has. */
const TAB_BAR_FONT = '"Montserrat", system-ui, sans-serif';

function BottomNav({ pathname, visible, isChat, isDetail, unreadCount, onPost }: BottomNavProps) {
  return (
    <nav
      data-zc-bottom-nav
      style={{ fontFamily: TAB_BAR_FONT, "--font-button": TAB_BAR_FONT } as React.CSSProperties}
      className={`fixed bottom-[max(10px,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-20px)] max-w-md -translate-x-1/2 transition-all duration-300 md:hidden ${
        visible &&
        !isDetail &&
        !pathname.includes("/app/live") &&
        !pathname.includes("/app/notes") &&
        (!isChat || pathname === "/app/chat" || pathname === "/app/chat/")
          ? "translate-y-0 opacity-100"
          : "translate-y-[150%] opacity-0 pointer-events-none"
      }`}
    >
      <div className="grid grid-cols-5 gap-1 rounded-xl border border-border/70 bg-background/95 p-1.5 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {tabs.map((t) => {
          const normalize = (p: string) => p.replace(/\/$/, "");
          const active = !t.to
            ? pathname.startsWith("/app/compose")
            : t.exact
            ? normalize(pathname) === normalize(t.to)
            : pathname.startsWith(t.to);

          const tabClass = `relative flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg tap transition-all duration-200 active:scale-95 ${
            active
              ? "bg-primary/[0.12] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
          }`;

          const inner = (
            <>
              <t.Icon
                className={`h-[20px] w-[20px] shrink-0 transition-transform duration-300 ease-out ${active ? "-translate-y-px scale-110" : ""}`}
                active={active}
              />
              <span className="max-w-full truncate px-0.5 text-[9px] font-semibold leading-none tracking-tight">
                {t.label}
              </span>
            </>
          );

          // Post opens the create sheet rather than navigating anywhere.
          if (!t.to) {
            return (
              <button key={t.label} type="button" onClick={onPost} aria-haspopup="dialog" className={tabClass}>
                {inner}
              </button>
            );
          }

          return (
            <Link key={t.to} to={t.to} className={tabClass}>
              {inner}
              {t.label === "Alerts" && unreadCount > 0 && (
                <span className="absolute right-2 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
                  {unreadCount > 99 ? "99+" : unreadCount}
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
  const isAdmin = Boolean(profile?.is_admin);
  const isTutor = role === "Tutor" || role === "Institution";
  const isInstitution = role === "Institution";
  const isCreator = String(profile?.tier || "").toLowerCase() === "creator" || profile?.active_mode === "creator";

  const primaryActions = isAdmin
    ? [
        { label: "Admin Control Center", to: "/app/admin", Icon: ShieldCheck },
        { label: "Moderation queue", to: "/app/admin", Icon: Activity },
        { label: "Platform operations", to: "/app/admin", Icon: Settings },
      ]
    : isInstitution
    ? [
        { label: "Digital Hub", to: "/app/institution-studio", Icon: IconInstitution },
        { label: "Organization bootcamps", to: "/app/institution-studio", Icon: IconLearn },
      ]
    : isTutor
      ? [
          { label: "Tutor Studio", to: "/app/tutor-studio", Icon: IconPresentation },
          { label: "Create bootcamp", to: "/app/tutor-studio/create", Icon: IconLearn },
          { label: "Wallet", to: "/app/wallet", Icon: IconWallet },
        ]
      : isCreator
        ? [
            { label: "Creator Workspace", to: "/app/creator", Icon: IconClubs },
            { label: "Manage Clubs", to: "/app/clubs", Icon: Users },
            { label: "Go PRO", to: "/app/premium", Icon: IconGem },
          ]
        : [
          { label: "Ship work", to: "/app/ship", Icon: Rocket },
          { label: "Find bootcamps", to: "/app/bootcamps", Icon: IconLearn },
          { label: "Create note", to: "/app/notes/create", Icon: IconNotes },
        ];

  const proofItems = [
    { label: "XP", value: formatCompactNumber(profile?.xp), Icon: Zap },
    { label: "Wallet", value: formatCompactNumber(profile?.coins), Icon: IconWallet },
    { label: "Messages", value: formatCompactNumber(unreadMessagesCount), Icon: IconMessages },
  ];

  const workspaceNotes = isAdmin
    ? ["Trust and safety", "Platform operations", "Revenue and growth"]
    : isInstitution
    ? ["Tutor visibility", "Cohort outcomes", "Credentials and reporting"]
    : isTutor
      ? ["Bootcamp curriculum", "Learner progress", "Creator earnings"]
      : ["Proof of work", "Learning progress", "Reputation signals"];

  return (
    <aside className="sticky top-0 hidden h-screen w-[336px] shrink-0 flex-col gap-0 overflow-y-auto border-l border-border/40 bg-background/75 px-5 py-5 xl:flex no-scrollbar">
      <div className="border-b border-border/60 px-1 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Desktop workspace
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-foreground">{isAdmin ? "Zero Club Admin" : role}</h2>
          </div>
          <img src="/logo.png" alt="" className="h-10 w-10 object-contain" loading="lazy" decoding="async" />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Zero Club connects learning, proof, reputation, and earning into one operating workspace.
        </p>
      </div>

      <div className="border-b border-border/60 py-5">
        <div className="grid grid-cols-3 gap-2">
          {proofItems.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border bg-background/60 px-3 py-3.5 text-center"
            >
              <item.Icon className="mx-auto h-[18px] w-[18px] text-muted-foreground" />
              <div className="mt-2.5 text-lg font-semibold tracking-tight leading-none text-foreground tabular-nums">
                {item.value}
              </div>
              <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-border/60 py-5">
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
              className="group flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3.5 py-3 text-sm font-semibold tracking-tight transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <action.Icon className="h-[18px] w-[18px] text-muted-foreground group-hover:text-primary transition-colors" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="border-b border-border/60 py-5">
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

      <div className="mt-5 rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
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

type AppThemeMode = "on" | "off" | "system";
type AppDarkTheme = "dim" | "lights-out" | "rose-noir";

const getStoredAppThemeMode = (): AppThemeMode => {
  if (typeof window === "undefined") return "off";
  try {
    const stored = localStorage.getItem("darkMode");
    return stored === "on" || stored === "system" ? stored : "off";
  } catch {
    return "off";
  }
};

const getStoredAppDarkTheme = (): AppDarkTheme => {
  if (typeof window === "undefined") return "lights-out";
  try {
    const stored = localStorage.getItem("darkTheme");
    return stored === "dim" || stored === "rose-noir" ? stored : "lights-out";
  } catch {
    return "lights-out";
  }
};

const DARK_THEME_COLORS: Record<AppDarkTheme, string> = {
  "lights-out": "#000000",
  dim: "#202633",
  "rose-noir": "#0a0409",
};

const applyAppDocumentTheme = (mode: AppThemeMode, theme: AppDarkTheme) => {
  const root = document.documentElement;
  root.classList.remove("dark", "dim", "lights-out", "rose-noir", "premium");

  const isDark =
    mode === "on" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    root.classList.add("dark", theme);
  }

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = isDark ? DARK_THEME_COLORS[theme] : "#f4f2ef";
};

function AppLayout() {
  const location = useLocation();
  const { pathname } = location;
  /* Shared links open for the people they were shared with.
     This used to be one hardcoded regex for published notes, so a post, a
     project, a profile and a product all bounced a first-time visitor to a
     signup form before they saw what they had been sent. The list lives in
     one place now, so a new shareable page cannot quietly miss out. */
  const isGuestReadable = isGuestReadablePath(pathname);
  const navigate = useNavigate();

  // Counts in-app navigations so every back button can tell the difference
  // between "there is a page behind this one" and "this link was opened cold".
  useTrackNavigationDepth();

  /* The layout is a single column built for portrait. The manifest no longer
     enforces that, so the shell asks for it — and the live room releases it. */
  useOrientationLock("portrait");

  /* Warm the code for the tab bar and the sidebar once the app goes quiet,
     so tapping one of them does not start with a download. */
  useIdlePreload();

  const [visible, setVisible] = useState(true);
  const [session, setSession] = useState<any>(getInitialSession);
  const [loading, setLoading] = useState(!getInitialSession());
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarClosing, setIsSidebarClosing] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const sidebarCloseTimer = useRef<number | null>(null);

  const closeSidebarImmediately = () => {
    if (sidebarCloseTimer.current !== null) window.clearTimeout(sidebarCloseTimer.current);
    sidebarCloseTimer.current = null;
    setIsSidebarOpen(false);
    setIsSidebarClosing(false);
  };

  const handleCloseSidebar = () => {
    if (sidebarCloseTimer.current !== null) window.clearTimeout(sidebarCloseTimer.current);
    setIsSidebarClosing(true);
    sidebarCloseTimer.current = window.setTimeout(() => {
      closeSidebarImmediately();
    }, 450);
  };

  // Any navigation closes the sidebar. Without this it would still be
  // sitting there, over the page it just sent you to.
  useEffect(() => {
    closeSidebarImmediately();
  }, [pathname]);

  useEffect(() => () => {
    if (sidebarCloseTimer.current !== null) window.clearTimeout(sidebarCloseTimer.current);
  }, []);

  useEffect(() => {
    const handleOpenSidebar = () => setIsSidebarOpen(true);
    window.addEventListener("open-sidebar", handleOpenSidebar);
    return () => window.removeEventListener("open-sidebar", handleOpenSidebar);
  }, []);

  const { data: profile, isLoading: profileLoading } = useUser();

  // Credit a ZeroStart ambassador when this member arrived through their
  // campaign link. The database decides whether it counts (brand-new account,
  // never self, once per person); the code is dropped after any real answer.
  useEffect(() => {
    if (!profile?.id) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem("zs_campaign_code");
    } catch {
      return;
    }
    if (!code) return;
    supabase
      .rpc("zs_attribute_signup", { p_code: code })
      .then(({ error }) => {
        if (!error) {
          try {
            localStorage.removeItem("zs_campaign_code");
          } catch {
            /* nothing to clean up */
          }
        }
      });
  }, [profile?.id]);

  useEffect(() => {
    if (!profile || profile.is_admin || profile.account_status !== "suspended") return;
    toast.error("This account has been suspended. Contact Zero Club support for help.");
    supabase.auth.signOut();
  }, [profile]);

  // A brand-new member goes through onboarding once, then comes back to
  // wherever they were headed (an invite link, a shared post).
  useEffect(() => {
    if (profileLoading || !needsOnboarding(profile)) return;
    try {
      sessionStorage.setItem("zc-after-onboarding", window.location.pathname + window.location.search);
    } catch {
      /* Without storage they simply land on their mode's home. */
    }
    navigate({ to: "/welcome", replace: true });
  }, [profile, profileLoading, navigate]);

  useEffect(() => {
    let unreadBadgeCount = 0;
    let cancelled = false;

    /*
     * The badge poll used to be the most expensive thing the app did.
     *
     * Every thirty seconds, on every screen, it made six requests and three
     * writes: touch the profile row, rewrite two sets of already-handled club
     * requests, then count messages, clubs, club messages and notifications
     * one at a time. None of it is what the person is waiting for, but all of
     * it competes with what they are — which is why the app felt heavy while
     * doing apparently nothing.
     *
     * Now it is a single call, it stops while the app is in the background,
     * and the self-heal below runs once rather than twice a minute.
     */
    const healOldClubRequests = async (userId: string) => {
      try {
        await supabase
          .from("messages")
          .update({ is_read: true })
          .eq("receiver_id", userId)
          .eq("is_read", false)
          .or("content.like.CLUB_REQUEST:%,content.eq.DISMISSED_CLUB_REQUEST");
      } catch (e) {
        console.error("Database self-heal error:", e);
      }
    };

    const countTheSlowWay = async (userId: string) => {
      const [pm, notif] = await Promise.all([
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", userId)
          .eq("is_read", false)
          .not("content", "like", "CLUB_REQUEST:%")
          .neq("content", "DISMISSED_CLUB_REQUEST"),
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("recipient_id", userId)
          .eq("is_read", false),
      ]);

      return {
        messages: pm.count || 0,
        notifications: notif.count || 0,
        club_messages: 0,
      };
    };

    const updatePresenceAndBadges = async () => {
      // Nothing to show a badge to while the app is not on screen, and a
      // request made here is one the next screen has to queue behind.
      if (typeof document !== "undefined" && document.hidden) return;

      const {
        data: { session },
      } = await getCachedSession();
      if (!session || cancelled) return;

      void healOldClubRequests(session.user.id);

      let summary: { messages: number; notifications: number; club_messages: number };

      const { data, error } = await supabase.rpc("unread_summary");
      if (!error && data) {
        const row = data as any;
        summary = {
          messages: Number(row.messages) || 0,
          notifications: Number(row.notifications) || 0,
          club_messages: Number(row.club_messages) || 0,
        };
      } else {
        // Older database, no function yet. Slower, but still correct.
        summary = await countTheSlowWay(session.user.id);
      }

      if (cancelled) return;

      setUnreadMessagesCount(summary.messages);
      setUnreadNotificationsCount(summary.notifications);

      const totalUnread = summary.messages + summary.notifications + summary.club_messages;

      if (typeof navigator !== "undefined" && "setAppBadge" in navigator) {
        if (totalUnread > 0) {
          (navigator as any).setAppBadge(totalUnread).catch(console.error);
        } else {
          (navigator as any).clearAppBadge().catch(console.error);
        }
      }
    };

    /*
     * Realtime can fire faster than the badge is worth recalculating — the
     * club listener below hears every club message on the platform, not only
     * the ones in this person's clubs. Coalescing a burst into one refresh
     * keeps a busy evening from turning into a request per message.
     */
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshBadgesSoon = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void updatePresenceAndBadges();
      }, 1500);
    };

    updatePresenceAndBadges();
    const interval = setInterval(updatePresenceAndBadges, 45000);

    // Coming back to the app should feel current straight away, rather than
    // waiting out whatever is left of the cycle.
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) void updatePresenceAndBadges();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }

    // Subscribe to realtime messages to instantly trigger badge update
    let pmSub: any, clubSub: any;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        pmSub = supabase
          .channel(`badge_pms_${session.user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "messages",
              filter: `receiver_id=eq.${session.user.id}`,
            },
            async (payload) => {
              const message = payload.new as {
                receiver_id?: string;
                sender_id?: string;
                content?: string;
              };
              if (
                message &&
                message.receiver_id === session.user.id
              ) {
                refreshBadgesSoon();

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
                    } else if (content.startsWith("FUND_LINK:")) {
                      displayContent = directMessagePreview(content);
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
                        loading="lazy" decoding="async" />
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
              if (payload.new.profile_id !== session.user.id) refreshBadgesSoon();
            },
          )
          .subscribe();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      if (pmSub) supabase.removeChannel(pmSub);
      if (clubSub) supabase.removeChannel(clubSub);
    };
  }, []);
  const router = useRouter();

  // Theme State
  const [darkMode, setDarkMode] = useState<AppThemeMode>(getStoredAppThemeMode);
  const [darkTheme, setDarkTheme] = useState<AppDarkTheme>(getStoredAppDarkTheme);

  // Recomputed each render so the countdown in the picker is never stale.
  const noirAccess = getNoirAccess(profile);

  useEffect(() => {
    applyAppDocumentTheme(darkMode, darkTheme);
    try {
      localStorage.setItem("darkMode", darkMode);
      localStorage.setItem("darkTheme", darkTheme);
    } catch {
      // Some embedded/private Chrome contexts deny storage. The selected
      // theme still applies for the current session without blanking the app.
    }

    if (darkMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyAppDocumentTheme(darkMode, darkTheme);
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [darkMode, darkTheme]);

  /*
   * Rose Noir when the free month is over and there is no membership.
   *
   * Checked here rather than only at the moment of selection, because the
   * theme is already applied by the pre-paint script from localStorage — the
   * expiry has to be noticed after the fact. Setting a different theme changes
   * the dependency, so this runs once and stops.
   */
  useEffect(() => {
    if (darkTheme !== NOIR_THEME || profileLoading || !profile) return;
    if (getNoirAccess(profile).allowed) return;

    setDarkTheme("lights-out");
    toast("Your free month of Rose Noir has ended", {
      description: "Go PRO to keep it.",
      action: { label: "Go PRO", onClick: () => navigate({ to: "/app/premium" }) },
    });
  }, [darkTheme, profile, profileLoading, navigate]);

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

        if (!session && !isGuestReadable) {
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
      if (event === "SIGNED_OUT" && !isGuestReadable) {
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
  }, [router, isGuestReadable]);

  // 2. Handle Club Invites from URL
  useEffect(() => {
    if (!session) return;
    const search = new URLSearchParams(location.search as Record<string, string>);
    const clubId = search.get("club");
    if (clubId) {
      const openInvite = async () => {
        const { data: member } = await supabase
          .from("club_members")
          .select("id")
          .eq("club_id", clubId)
          .eq("profile_id", session.user.id)
          .maybeSingle();

        if (!member) {
          /* An invite link cannot be a way round the fee. join_club charges the
             wallet where there is something to charge, and simply joins where
             there is not — the same door everyone else comes through. */
          const { data, error } = await supabase.rpc("join_club", { p_club_id: clubId });
          const result = data as any;

          if (error || result?.status === "insufficient_funds") {
            const fee = Number(result?.fee) || 0;
            toast.error(
              fee > 0 ? "This club charges to join" : error?.message || "Could not join that club",
              { description: fee > 0 ? "Top up your wallet, then open the link again." : undefined },
            );
            router.navigate({ to: "/app/clubs" });
            return;
          }
        }

        router.navigate({
          to: "/app/clubs/chat",
          search: { showRules: "true", clubId: clubId },
        });
      };

      openInvite();
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
  const isGameDetail = pathname.startsWith("/app/games/");
  const isDetail = pathname.includes("/detail") || isPostDetail || isGameDetail;
  const isInstitutionStudio = pathname.startsWith("/app/institution-studio");
  const isAdminStudio = pathname.startsWith("/app/admin");
  /*
   * Tutor Studio is a workspace, not a reading column.
   *
   * Everything under /app was being squeezed into the same 920px feed column
   * with the right-hand rail taking another ~300px, which left the curriculum
   * builder and the learner table with a few hundred pixels to work in. The
   * institution and admin studios were already excused from that for exactly
   * this reason.
   */
  const isTutorStudio = pathname.startsWith("/app/tutor-studio");
  // My Store is a seller's dashboard, laid out as a 360px sidebar next to a
  // product grid. In the reading column that left the grid about 430px wide,
  // which is narrower than one product card wants.
  const isMyStore = pathname.startsWith("/app/my-store");
  const isWideWorkspace = isInstitutionStudio || isAdminStudio || isTutorStudio || isMyStore;
  const hideHeader = !isFeed;

  /*
   * Publish the header's real height as --zc-header-h.
   *
   * Sticky sub-headers pin directly under this one, and hard-coding the number
   * in each of them is what opened the band under the feed tabs: the moment
   * the header rendered a pixel taller than the constant, scrolling posts
   * showed through the difference. Measuring means they cannot disagree.
   */
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = headerRef.current;
    if (!element) {
      // No header on this route — fall back to the value in the stylesheet.
      document.documentElement.style.removeProperty("--zc-header-h");
      return;
    }

    const publish = () => {
      const height = Math.round(element.getBoundingClientRect().height);
      if (height > 0) document.documentElement.style.setProperty("--zc-header-h", `${height}px`);
    };

    publish();
    // The header's height does not depend on the variable, so this cannot loop.
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    window.addEventListener("orientationchange", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", publish);
    };
  }, [hideHeader]);

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
        <img src="/logo.png" alt="Zero Club" className="h-10 w-auto opacity-90" loading="lazy" decoding="async" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
        </div>
      </div>
    );
  }

  if (!session) {
    return isGuestReadable ? <Outlet /> : null;
  }

  return (
    <div className="zc-app-shell mx-auto min-h-screen w-full bg-background md:flex md:max-w-none md:justify-center">
      {/* Desktop Sidebar (Left Column) — hidden on admin routes, which have their own sidebar */}
      <div className={`sticky top-0 z-40 h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-background no-scrollbar ${isAdminStudio ? "hidden" : "hidden md:flex"}`}>
        <SidebarContent
          profile={profile}
          onOpenTheme={() => setIsThemeOpen(true)}
          isInstitutionStudio={pathname.startsWith("/app/institution-studio")}
          unreadMessagesCount={unreadMessagesCount}
          unreadNotificationsCount={unreadNotificationsCount}
        />
      </div>

      {/* Main Center Column */}
      <div className={`zc-app-main w-full flex-1 flex flex-col relative min-h-screen ${isWideWorkspace ? "zc-institution-main md:max-w-none" : "max-w-md mx-auto md:mx-0 md:max-w-none md:border-r border-border/10"}`}>
        <IncomingNotificationCard
          recipientId={session.user.id}
          belowFeedHeader={!hideHeader}
          onReceived={() => setUnreadNotificationsCount((count) => count + 1)}
          onRead={() => setUnreadNotificationsCount((count) => Math.max(0, count - 1))}
        />
        {!hideHeader && (
          <header
            ref={headerRef}
            /* You, search, messages — the three things you reach for from
               every top-level page. The bell moved to the tab bar as Alerts. */
            className="fixed left-1/2 top-0 z-50 flex h-[calc(56px+env(safe-area-inset-top))] w-full max-w-md -translate-x-1/2 translate-y-0 items-center gap-3 bg-card px-4 pt-[env(safe-area-inset-top)] md:sticky md:left-0 md:h-[60px] md:max-w-full md:translate-x-0 md:pt-0"
          >
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open your menu"
              className="h-8 w-8 shrink-0 overflow-hidden rounded-full tap md:hidden"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-accent/10 text-[13px] font-semibold uppercase text-accent">
                  {profile?.username?.substring(0, 1) || "U"}
                </div>
              )}
            </button>

            <Link
              to="/app/search"
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.05] px-3 text-[14px] text-muted-foreground tap hover:bg-foreground/[0.07] md:max-w-md"
            >
              <Search className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">Search people, clubs, notes</span>
            </Link>

            <Link
              to="/app/chat"
              aria-label={unreadMessagesCount > 0 ? `Messages, ${unreadMessagesCount} unread` : "Messages"}
              className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04] md:ml-auto"
            >
              <IconMessages className="h-6 w-6" active={pathname.startsWith("/app/chat")} />
              {unreadMessagesCount > 0 && (
                <span className="absolute right-0 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold tabular-nums text-accent-foreground ring-2 ring-card">
                  {unreadMessagesCount > 99 ? "99+" : unreadMessagesCount}
                </span>
              )}
            </Link>
          </header>
        )}

        {/* Sidebar anchored flush to the left edge */}
        {(isSidebarOpen || isSidebarClosing) && (
          <>
            {/* Blurred overlay - closes sidebar on click */}
            <div
              className={`fixed inset-0 z-[70] bg-black/50 ${isSidebarClosing ? "animate-out fade-out duration-500 ease-in-out fill-mode-forwards" : "animate-in fade-in duration-500 ease-out"}`}
              onClick={handleCloseSidebar}
            />
            {/* Only the exposed right corners are rounded. */}
            <div
              className={`fixed bottom-3 left-0 top-3 z-[80] flex w-[min(452px,calc(100vw-60px))] flex-col overflow-hidden rounded-r-xl border border-l-0 border-border/70 bg-background shadow-[0_24px_70px_-24px_rgba(0,0,0,0.65)] ${isSidebarClosing ? "animate-out fade-out slide-out-to-left-full duration-500 ease-in-out fill-mode-forwards" : "animate-in fade-in slide-in-from-left-full duration-500 ease-out"}`}
            >
              <SidebarContent
                profile={profile}
                isInstitutionStudio={pathname.startsWith("/app/institution-studio")}
                unreadMessagesCount={unreadMessagesCount}
                unreadNotificationsCount={unreadNotificationsCount}
                onClose={handleCloseSidebar}
                onNavigate={closeSidebarImmediately}
                onOpenTheme={() => {
                  closeSidebarImmediately();
                  setIsThemeOpen(true);
                }}
              />
            </div>
          </>
        )}

        {/* Theme Selection Sheet */}
        <Drawer open={isThemeOpen} onOpenChange={setIsThemeOpen}>
          <DrawerContent className="border-none bg-background px-4 pb-4 pt-1 focus:ring-0 sm:p-6">
            <div className="pb-3 pt-1 text-left">
              <h2 className="font-display text-[20px] font-semibold leading-tight text-foreground">Display</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">Choose how Zero Club looks to you.</p>
            </div>

            <div className="mt-2 space-y-2.5">
              {[
                { key: "standard", label: "Standard", desc: "Warm ivory, editorial", swatch: "bg-[#f4f2ef]", active: darkMode === "off", onClick: () => setDarkMode("off") },
                { key: "black", label: "Black", desc: "Lights out — pure contrast", swatch: "bg-black", active: darkMode === "on" && darkTheme === "lights-out", onClick: () => { setDarkMode("on"); setDarkTheme("lights-out"); } },
                { key: "dim", label: "Dim", desc: "Softer dark for evenings", swatch: "bg-[#202633]", active: darkMode === "on" && darkTheme === "dim", onClick: () => { setDarkMode("on"); setDarkTheme("dim"); } },
                {
                  key: NOIR_THEME,
                  label: "Rose Noir",
                  desc: noirAccess.allowed
                    ? noirAccess.via === "premium"
                      ? "Black, lit with Zero Club pink"
                      : `Black, lit with Zero Club pink · ${noirAccess.daysLeft} ${noirAccess.daysLeft === 1 ? "day" : "days"} free`
                    : "Black, lit with Zero Club pink · members only",
                  swatch: "bg-[linear-gradient(150deg,#cc208f_0%,#3d0a2a_52%,#000000_100%)]",
                  locked: !noirAccess.allowed,
                  badge: noirAccess.via === "trial" ? "FREE MONTH" : noirAccess.via === "expired" ? "PRO" : null,
                  active: darkMode === "on" && darkTheme === NOIR_THEME,
                  onClick: () => {
                    if (!noirAccess.allowed) {
                      setIsThemeOpen(false);
                      navigate({ to: "/app/premium" });
                      return;
                    }
                    startNoirTrial();
                    setDarkMode("on");
                    setDarkTheme(NOIR_THEME);
                  },
                },
              ].map((opt: any) => (
                <button
                  key={opt.key}
                  onClick={opt.onClick}
                  className={`flex w-full items-center gap-3.5 rounded-2xl border-[1.5px] p-4 tap transition-colors ${opt.active ? "border-[#cc208f] bg-[#cc208f]/[0.06]" : "border-foreground/12 hover:bg-foreground/[0.03]"}`}
                >
                  {/* A colour chip, because the names alone do not tell you what
                      you are choosing — least of all this new one. */}
                  <span className={`h-11 w-11 shrink-0 rounded-xl border border-foreground/15 ${opt.swatch}`} />

                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">{opt.label}</span>
                      {opt.badge && (
                        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${opt.locked ? "bg-foreground/[0.06] text-muted-foreground" : "bg-[#cc208f]/10 text-[#a3186f]"}`}>
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{opt.desc}</div>
                  </div>

                  {opt.locked ? (
                    <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${opt.active ? "bg-[#cc208f]" : "border-[1.5px] border-foreground/20"}`}>
                      {opt.active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
              Standard uses the Zero Club editorial palette. Dark variants are personal display options.
              Rose Noir is free for a month on this device, then included with any paid membership.
            </p>

            <button
              onClick={() => setIsThemeOpen(false)}
              className="mt-6 h-12 w-full rounded-full bg-foreground text-[16px] font-semibold text-background tap"
            >
              Done
            </button>
          </DrawerContent>
        </Drawer>

        <div
          className={`zc-desktop-content ${!hideHeader ? "pt-[var(--zc-header-h)] md:pt-0" : "pt-[env(safe-area-inset-top)]"} pb-0`}
        >
          <Outlet />
        </div>

        {!isAdminStudio && (
          <BottomNav
            pathname={pathname}
            visible={visible}
            isChat={isChat}
            isDetail={isDetail}
            unreadCount={unreadNotificationsCount}
            onPost={() => navigate({ to: "/app", search: { create: 1 } })}
          />
        )}
        <PushPrompt userId={profile?.id} hidden={isChat || pathname.startsWith("/app/settings/notifications")} />
      </div>
      {!isWideWorkspace && (
        <DesktopWorkspaceRail
          profile={profile}
          pathname={pathname}
          unreadMessagesCount={unreadMessagesCount}
          unreadNotificationsCount={unreadNotificationsCount}
        />
      )}
    </div>
  );
}
