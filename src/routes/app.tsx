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
  MoreHorizontal,
  SlidersHorizontal,
  LifeBuoy,
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
  Building2,
  UserPlus,
  LogIn,
  LogOut,
  ShieldCheck,
  ClipboardList,
  Lock,
  X,
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
import {
  IconHome, IconLearn, IconClubs, IconWallet, IconMessages, IconGames,
  IconProfile, IconGem, IconBookmark, IconNotes, IconCompass, IconMetrics,
  IconPresentation, IconInstitution, IconStore,
  IconBell, IconRocket, IconSpark, IconShield, IconMenu,
} from "@/components/icons";
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
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";
import { directMessagePreview } from "@/lib/directMessage";
import { IncomingNotificationCard } from "@/components/IncomingNotificationCard";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const tabs = [
  { to: "/app/", label: "Feed", Icon: IconHome, exact: true },
  { to: "/app/bootcamps", label: "Learn", Icon: IconLearn },
  { to: "/app/clubs", label: "Clubs", Icon: IconClubs },
  // Not a destination — opens the menu card. Kept in this list so it keeps the
  // same slot, size and spacing as the tabs either side of it.
  { to: null, label: "Menu", Icon: IconMenu },
  { to: "/app/chat", label: "Messages", Icon: IconMessages },
];

/**
 * What lives on the menu card.
 *
 * These are all destinations you go to occasionally and deliberately, rather
 * than the four you move between constantly. Everything here is hidden from
 * the sidebar on mobile so the same link never appears in two places at once.
 */
const MENU_ITEMS = [
  { to: "/app/quests", label: "Opportunities", note: "Gigs, briefs and open calls", Icon: IconRocket },
  { to: "/app/store", label: "Zero Store", note: "Buy from builders", Icon: IconStore },
  { to: "/app/zerohub", label: "ZeroHub", note: "Explore the network", Icon: IconCompass },
  { to: "/app/notes", label: "ZeroNotes", note: "Your notes and drafts", Icon: IconNotes },
  { to: "/app/games", label: "Games", note: "Play and earn ZP", Icon: IconGames },
  { to: "/app/zero-ai", label: "Zero AI", note: "Ask, draft, summarise", Icon: IconSpark },
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
  { key: "zero-forms", label: "Zero Forms", Icon: ClipboardList },
  { key: "analytics", label: "Analytics", Icon: BarChart3 },
  { key: "settings", label: "Settings", Icon: Settings },
] as const;

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

  return (
    <div
      className="flex h-full flex-col p-4"
      onClick={(e) => {
        // Close sidebar if user clicked a link (navigation)
        const target = e.target as HTMLElement;
        if (target.closest("a")) {
          if (onNavigate) onNavigate();
          else onClose?.();
        }
      }}
    >
      <div className="mb-4 flex h-11 shrink-0 items-center justify-between border-b border-border/60 px-1 pb-3">
        <Link to="/app" className="flex items-center gap-2.5" aria-label="Zero Club feed">
          <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
          <span className="font-display text-[17px] font-semibold tracking-tight text-foreground">
            Zero <span className="text-primary">Club</span>
          </span>
        </Link>
        <span className="rounded-full bg-primary/[0.08] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
          Workspace
        </span>
      </div>

      <div className="flex shrink-0 items-start justify-between rounded-lg border border-border/60 bg-card p-3.5 shadow-[0_10px_30px_-26px_rgba(0,0,0,0.4)]">
        <Link to="/app/profile" className="group block min-w-0 flex-1 transition active:opacity-70">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center font-semibold text-primary-foreground">
              {profile?.username?.substring(0, 1).toUpperCase() || "U"}
            </div>
          )}
          <div className="mt-2.5 min-w-0">
            <div
              className="h-5 w-32 bg-foreground/[0.04] rounded animate-pulse mb-1"
              style={{ display: profile?.username ? "none" : "block" }}
            />
            <h2
              className="truncate font-display text-[15px] font-semibold tracking-tight group-hover:text-primary transition-colors"
              style={{ display: profile?.username ? "block" : "none" }}
            >
              {profile?.full_name || profile?.username || "Builder"}
            </h2>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <p className="truncate text-[12px] text-muted-foreground">
                {profile?.username ? `@${profile.username}` : "Fetching identity..."}
              </p>
              {profile?.xp !== undefined && (
                <span className="flex items-center gap-0.5 rounded-full bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/15 tabular-nums animate-in fade-in duration-500">
                  <Zap className="h-2.5 w-2.5" /> {formatCompactNumber(profile.xp)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-2.5 flex min-w-0 w-full flex-wrap gap-x-3 gap-y-1 text-[11px]">
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
            <button className="mt-0.5 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-95">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="z-[100] mx-auto max-w-lg border-border bg-background p-0 focus:ring-0">
            <div className="border-b border-border px-4 pb-3 pt-1 text-left sm:px-5 sm:pb-4 sm:pt-5">
              <p className="text-[10px] font-semibold uppercase text-primary">Zero Club identity</p>
              <h2 className="mt-1 text-[21px] font-semibold tracking-tight text-foreground">Accounts</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">Switch profiles or start another Zero Club identity.</p>
            </div>
            <div className="flex max-h-[72vh] flex-col gap-3 overflow-y-auto p-5">
              {accounts.length === 0 && profile && (
                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.045] p-3">
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
                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${isActive ? "border-primary/20 bg-primary/[0.045]" : "border-border hover:bg-muted"}`}
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
                onClick={() => prepareAddAccount("/signup?add_account=true")}
                className="mt-2 flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3.5 text-left hover:bg-muted"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><UserPlus className="h-4 w-4" /></span><span><span className="block text-[13px] font-semibold">Create a new account</span><span className="mt-0.5 block text-[10.5px] text-muted-foreground">Keep this account saved and make another profile</span></span>
              </button>
              <button
                onClick={() => prepareAddAccount()}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3.5 text-left hover:bg-muted"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-foreground"><LogIn className="h-4 w-4" /></span><span><span className="block text-[13px] font-semibold">Add an existing account</span><span className="mt-0.5 block text-[10.5px] text-muted-foreground">Sign in and add it to the account switcher</span></span>
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
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 py-3.5 text-[13px] font-semibold text-destructive hover:bg-destructive/15 tap"
              >
                <LogOut className="h-4 w-4" /> Log out of Zero Club
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="-mr-2 mt-4 flex flex-1 flex-col overflow-y-auto pr-2 no-scrollbar">
        {isInstitutionStudio ? (
          /* ── Digital Hub sidebar: replaces regular nav when on institution-studio ── */
          <div className="flex flex-col flex-1">
            <div className="flex items-center gap-2 px-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-primary/8 ring-1 ring-primary/15 text-primary flex items-center justify-center">
                <Building2 className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Digital Hub</p>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
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
                    className={`group flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[15px] font-medium tracking-tight tap transition-colors ${
                      isActive
                        ? "bg-foreground/[0.05] text-foreground [&_svg]:text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                    }`}
                  >
                    <Icon className={`h-[20px] w-[20px] transition-colors ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`} strokeWidth={1.75} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto pb-2">
              <Link
                to="/app"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] tap transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back to app</span>
              </Link>
            </div>
          </div>
        ) : (
          /* ── Regular app sidebar nav ── */
          <nav className="flex flex-1 flex-col gap-1">
            {[
              // Desktop-only: mirror the mobile bottom nav (hidden on md+)
              { Icon: IconHome, label: "Home", to: "/app", desktopOnly: true, exact: true },
              { Icon: IconBell, label: "Notifications", to: "/app/notifications", desktopOnly: true, badge: unreadNotificationsCount },
              { Icon: IconMessages, label: "Messages", to: "/app/chat", desktopOnly: true, badge: unreadMessagesCount },
              { Icon: IconProfile, label: "Profile", to: "/app/profile" },
              { Icon: IconClubs, label: "Clubs", to: "/app/clubs", learnerDesktopOnly: isLearnerAccount },
              { Icon: IconGames, label: "Zero Games", to: "/app/games", desktopOnly: true },
              { Icon: IconGem, label: "Go PRO", to: "/app/premium" },
              ...(String(profile?.tier || "").toLowerCase() === "creator"
                ? [{ Icon: IconClubs, label: "Creator Workspace", to: "/app/creator" }]
                : []),
              { Icon: IconStore, label: "My Store", to: "/app/my-store" },
              { Icon: IconWallet, label: "Wallet", to: "/app/wallet" },
              { Icon: IconBookmark, label: "Bookmarks", to: "/app/bookmarks" },
              { Icon: IconMetrics, label: "Metrics", to: "/app/metrics" },
              // desktopOnly: these five live on the mobile menu card instead,
              // so listing them here as well would repeat them. Desktop has no
              // bottom nav and therefore no menu card, so it keeps them.
              { Icon: IconRocket, label: "Opportunities", to: "/app/quests", desktopOnly: true },
              { Icon: IconNotes, label: "ZeroNotes", to: "/app/notes", desktopOnly: true },
              { Icon: IconCompass, label: "ZeroHub", to: "/app/zerohub", desktopOnly: true },
              { Icon: IconSpark, label: "Zero AI", to: "/app/zero-ai", desktopOnly: true },
              ...(profile?.account_type === "Tutor"
                ? [{ Icon: IconPresentation, label: "Tutor Studio", to: "/app/tutor-studio" }]
                : []),
              ...(profile?.account_type === "Institution"
                ? [{ Icon: IconInstitution, label: "Digital Hub", to: "/app/institution-studio" }]
                : []),
              ...(profile?.is_admin
                ? [{ Icon: IconShield, label: "Admin Control Center", to: "/app/admin" }]
                : []),
            ].map((item: any) => (
              <Link
                key={item.label}
                to={item.to}
                activeOptions={{ exact: !!item.exact }}
                activeProps={{ className: "bg-primary/[0.08] !font-semibold !text-foreground" }}
                className={`group ${item.desktopOnly || item.learnerDesktopOnly ? "hidden md:flex" : "flex"} items-center gap-3.5 rounded-lg px-3 py-3.5 text-[17px] font-medium tracking-tight text-muted-foreground tap transition-colors hover:bg-foreground/[0.04] hover:text-foreground active:scale-[0.98] md:py-2.5 md:text-[15px]`}
              >
                {({ isActive }: { isActive: boolean }) => (
                  <>
                    <item.Icon
                      active={isActive}
                      className={`h-[22.5px] w-[22.5px] shrink-0 transition-all duration-200 md:h-[20px] md:w-[20px] ${isActive ? "scale-110 text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="ml-auto grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            ))}
          </nav>
        )}

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
  onOpenMenu: () => void;
  menuOpen: boolean;
};

function BottomNav({ pathname, visible, isChat, isDetail, unreadCount, onOpenMenu, menuOpen }: BottomNavProps) {
  return (
    <nav
      data-zc-bottom-nav
      className={`fixed bottom-[max(10px,env(safe-area-inset-bottom))] left-1/2 ${
        // Above the menu backdrop while the card is open, so the nav stays
        // sharp and the Menu tab can be tapped again to close.
        menuOpen ? "z-[90]" : "z-50"
      } w-[calc(100%-20px)] max-w-md -translate-x-1/2 transition-all duration-300 md:hidden ${
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
            ? menuOpen
            : t.exact
            ? normalize(pathname) === normalize(t.to)
            : pathname.startsWith(t.to);

          const tabClass = `relative flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg tap transition-all duration-200 active:scale-95 ${
            active
              ? "bg-primary/[0.12] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
          }`;

          // The menu slot is a button, not a link: it opens a card rather than
          // navigating anywhere.
          if (!t.to) {
            return (
              <button
                key={t.label}
                type="button"
                onClick={onOpenMenu}
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                className={tabClass}
              >
                <t.Icon
                  className={`h-[20px] w-[20px] shrink-0 transition-transform duration-300 ease-out ${active ? "-translate-y-px scale-110" : ""}`}
                  active={active}
                />
                <span className="max-w-full truncate px-0.5 text-[9px] font-semibold leading-none tracking-tight">
                  {t.label}
                </span>
              </button>
            );
          }

          return (
            <Link
              key={t.to}
              to={t.to}
              className={tabClass}
            >
              <t.Icon
                className={`h-[20px] w-[20px] shrink-0 transition-transform duration-300 ease-out ${active ? "-translate-y-px scale-110" : ""}`}
                active={active}
              />
              <span className="max-w-full truncate px-0.5 text-[9px] font-semibold leading-none tracking-tight">
                {t.label}
              </span>
              {t.label === "Messages" && unreadCount > 0 && (
                <span className="absolute right-2 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
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
  const isAdmin = Boolean(profile?.is_admin);
  const isTutor = role === "Tutor" || role === "Institution";
  const isInstitution = role === "Institution";
  const isCreator = String(profile?.tier || "").toLowerCase() === "creator";

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
          <img src="/logo.png" alt="" className="h-10 w-10 object-contain" />
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
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);
  const [session, setSession] = useState<any>(getInitialSession);
  const [loading, setLoading] = useState(!getInitialSession());
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarClosing, setIsSidebarClosing] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const sidebarCloseTimer = useRef<number | null>(null);
  const menuCloseTimer = useRef<number | null>(null);

  const closeSidebarImmediately = () => {
    if (sidebarCloseTimer.current !== null) window.clearTimeout(sidebarCloseTimer.current);
    sidebarCloseTimer.current = null;
    setIsSidebarOpen(false);
    setIsSidebarClosing(false);
  };

  const closeMenuImmediately = () => {
    if (menuCloseTimer.current !== null) window.clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = null;
    setIsMenuOpen(false);
    setIsMenuClosing(false);
  };

  const handleCloseSidebar = () => {
    if (sidebarCloseTimer.current !== null) window.clearTimeout(sidebarCloseTimer.current);
    setIsSidebarClosing(true);
    sidebarCloseTimer.current = window.setTimeout(() => {
      closeSidebarImmediately();
    }, 450);
  };

  const handleCloseMenu = () => {
    if (menuCloseTimer.current !== null) window.clearTimeout(menuCloseTimer.current);
    setIsMenuClosing(true);
    menuCloseTimer.current = window.setTimeout(() => {
      closeMenuImmediately();
    }, 260);
  };

  // Any navigation closes the card. Without this it would still be sitting
  // there, over the page it just sent you to.
  useEffect(() => {
    closeSidebarImmediately();
    closeMenuImmediately();
  }, [pathname]);

  useEffect(() => () => {
    if (sidebarCloseTimer.current !== null) window.clearTimeout(sidebarCloseTimer.current);
    if (menuCloseTimer.current !== null) window.clearTimeout(menuCloseTimer.current);
  }, []);

  // The card is a layer over the page, so the hardware back button should
  // dismiss it rather than leaving the app — this is running inside a TWA.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  useEffect(() => {
    const handleOpenSidebar = () => setIsSidebarOpen(true);
    window.addEventListener("open-sidebar", handleOpenSidebar);
    return () => window.removeEventListener("open-sidebar", handleOpenSidebar);
  }, []);

  const { data: profile, isLoading: profileLoading } = useUser();

  useEffect(() => {
    if (!profile || profile.is_admin || profile.account_status !== "suspended") return;
    toast.error("This account has been suspended. Contact Zero Club support for help.");
    supabase.auth.signOut();
  }, [profile]);

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
  const isGameDetail = pathname.startsWith("/app/games/");
  const isDetail = pathname.includes("/detail") || isPostDetail || isGameDetail;
  const isInstitutionStudio = pathname.startsWith("/app/institution-studio");
  const isAdminStudio = pathname.startsWith("/app/admin");
  const isWideWorkspace = isInstitutionStudio || isAdminStudio;
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
      {/* Desktop Sidebar (Left Column) — hidden on admin routes, which have their own sidebar */}
      <div className={`sticky top-0 z-40 h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-[#f8f7f5] no-scrollbar dark:bg-background ${isAdminStudio ? "hidden" : "hidden md:flex"}`}>
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
            className="fixed left-1/2 top-0 z-50 flex h-[calc(66px+env(safe-area-inset-top))] w-full max-w-md -translate-x-1/2 translate-y-0 items-center justify-between border-b border-border bg-background px-5 pt-[env(safe-area-inset-top)] md:sticky md:left-0 md:h-[66px] md:max-w-full md:translate-x-0 md:pt-0"
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

            <div className="flex flex-1 items-center justify-center gap-2.5 md:justify-start">
              {isFeed ? (
                <>
                  <img src="/logo.png" alt="Zero Club" className="h-8 w-auto object-contain" />
                  <span className="hidden font-display text-[17px] font-semibold tracking-tight md:inline">Feed</span>
                </>
              ) : (
                <h1 className="font-display text-[17px] font-semibold tracking-tight">{getPageTitle}</h1>
              )}
            </div>

            <div className="flex w-10 items-center justify-end">
              <Link
                to="/app/notifications"
                className={`grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap transition-colors hover:bg-foreground/[0.04] relative ${pathname.startsWith("/app/notifications") ? "bg-primary/[0.1] text-primary ring-primary/30" : "text-foreground"}`}
              >
                <IconBell className="h-[18px] w-[18px]" active={pathname.startsWith("/app/notifications")} />
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
              className={`fixed inset-0 z-[70] bg-black/50 ${isSidebarClosing ? "animate-out fade-out duration-500 ease-in-out fill-mode-forwards" : "animate-in fade-in duration-500 ease-out"}`}
              onClick={handleCloseSidebar}
            />
            {/* Floating sidebar panel */}
            <div
              className={`fixed bottom-3 left-3 top-3 z-[80] flex w-[min(440px,calc(100vw-72px))] flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_24px_70px_-24px_rgba(0,0,0,0.65)] ${isSidebarClosing ? "animate-out fade-out slide-out-to-left-full duration-500 ease-in-out fill-mode-forwards" : "animate-in fade-in slide-in-from-left-full duration-500 ease-out"}`}
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

        {/* ── Menu card (mobile) ──
            Opened from the Menu slot in the bottom nav. Mobile only, because
            the bottom nav itself is mobile only — on desktop these same
            destinations stay in the sidebar. */}
        {(isMenuOpen || isMenuClosing) && (
          <div className="md:hidden">
            <div
              className={`fixed inset-0 z-[70] bg-black/45 ${isMenuClosing ? "animate-out fade-out duration-250 ease-in fill-mode-forwards" : "animate-in fade-in duration-250 ease-out"}`}
              onClick={handleCloseMenu}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              // Sits above the bottom nav rather than over it, so the Menu tab
              // stays visible and lit while the card is open — and tapping it
              // again closes the card.
              className={`fixed inset-x-3 bottom-[calc(max(10px,env(safe-area-inset-bottom))+74px)] z-[80] overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)] ${isMenuClosing ? "animate-out fade-out slide-out-to-bottom-4 duration-250 ease-in fill-mode-forwards" : "animate-in fade-in slide-in-from-bottom-4 duration-250 ease-out"}`}
            >
              <div className="flex items-center justify-between px-5 pb-1 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Menu
                </p>
                <button
                  onClick={handleCloseMenu}
                  aria-label="Close menu"
                  className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground tap hover:bg-foreground/[0.05] hover:text-foreground"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 px-3 pb-4 pt-2">
                {MENU_ITEMS.map((item) => {
                  const active = pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={closeMenuImmediately}
                      className={`flex min-w-0 flex-col gap-2.5 rounded-xl p-3.5 tap transition-colors ${
                        active
                          ? "bg-primary/[0.1] ring-1 ring-primary/20"
                          : "bg-foreground/[0.03] hover:bg-foreground/[0.06]"
                      }`}
                    >
                      <item.Icon
                        active={active}
                        className={`h-[21px] w-[21px] shrink-0 ${active ? "text-primary" : "text-foreground"}`}
                      />
                      <div className="min-w-0">
                        <div className={`truncate text-[13.5px] font-semibold tracking-tight ${active ? "text-primary" : "text-foreground"}`}>
                          {item.label}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{item.note}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Theme Selection Sheet */}
        <Drawer open={isThemeOpen} onOpenChange={setIsThemeOpen}>
          <DrawerContent className="border-none bg-background px-4 pb-4 pt-1 focus:ring-0 sm:p-6">
            <h2 className="mb-1 text-[17px] font-semibold tracking-tight sm:text-[22px]">Display</h2>
            <p className="text-[13px] text-muted-foreground mb-6">Choose how Zero Club looks to you.</p>

            <div className="space-y-1">
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
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 tap transition-colors ${opt.active ? "bg-primary/[0.06] ring-1 ring-primary/20" : "hover:bg-foreground/[0.03]"}`}
                >
                  {/* A colour chip, because the names alone do not tell you what
                      you are choosing — least of all this new one. */}
                  <span className={`h-9 w-9 shrink-0 rounded-lg ring-1 ring-border ${opt.swatch}`} />

                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold tracking-tight">{opt.label}</span>
                      {opt.badge && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.08em] ${opt.locked ? "bg-foreground/10 text-muted-foreground" : "bg-[#cc208f]/15 text-[#cc208f]"}`}>
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{opt.desc}</div>
                  </div>

                  {opt.locked ? (
                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${opt.active ? "bg-primary" : "ring-1 ring-border"}`}>
                      {opt.active && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <p className="mt-6 border-t hairline pt-4 text-[11px] leading-relaxed text-muted-foreground">
              Standard uses the Zero Club editorial palette. Dark variants are personal display options.
              Rose Noir is free for a month on this device, then included with any paid membership.
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
          className={`zc-desktop-content ${!hideHeader ? "pt-[calc(66px+env(safe-area-inset-top))] md:pt-0" : "pt-[env(safe-area-inset-top)]"} pb-0`}
        >
          <Outlet />
        </div>

        {!isAdminStudio && (
          <BottomNav
            pathname={pathname}
            visible={visible}
            isChat={isChat}
            isDetail={isDetail}
            unreadCount={unreadMessagesCount}
            onOpenMenu={() => (isMenuOpen ? handleCloseMenu() : setIsMenuOpen(true))}
            menuOpen={isMenuOpen && !isMenuClosing}
          />
        )}
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
