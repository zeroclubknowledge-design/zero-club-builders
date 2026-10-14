import { Link, useRouterState } from "@tanstack/react-router";
import { Megaphone, ShieldCheck, Trophy, type LucideIcon } from "./icons/glyphs";
import { IconHome, IconWallet } from "./icons/nav";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getZpBalance } from "@/lib/api";
import { config } from "@/lib/config";
import { ZpBadge } from "./ui/primitives";

/**
 * One shell for every screen: a top bar on desktop, a tab bar on phones.
 *
 * The nav is defined once as data rather than twice as markup, so the two
 * layouts cannot drift apart — which is exactly what happens when a phone bar
 * and a desktop bar each list their own links.
 */

type TabIcon = (p: { className?: string; active?: boolean }) => React.ReactElement;

/* Glyph icons go solid through a fill- class, the nav icons through `active`
   — wrap the glyphs so every tab takes the same prop, as in Zero Club. */
const glyphTab = (Glyph: LucideIcon): TabIcon =>
  function GlyphTab({ className = "", active }) {
    return <Glyph className={active ? `${className} fill-current` : className} />;
  };

const NAV: readonly { to: string; label: string; icon: TabIcon; exact: boolean }[] = [
  { to: "/", label: "Home", icon: IconHome, exact: true },
  { to: "/campaigns", label: "Campaigns", icon: glyphTab(Megaphone), exact: false },
  { to: "/earnings", label: "Earnings", icon: IconWallet, exact: false },
  { to: "/leaderboard", label: "Leaders", icon: glyphTab(Trophy), exact: false },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, profile, isAdmin } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [zp, setZp] = useState<number | null>(null);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) { setZp(null); return; }
    let alive = true;
    getZpBalance(uid).then((v) => { if (alive) setZp(v); }).catch(() => {});
    return () => { alive = false; };
    // Re-read on navigation: approving a test elsewhere changes this number,
    // and a stale balance in the header is worse than no balance.
  }, [session?.user?.id, path]);

  const isActive = (to: string, exact: boolean) =>
    exact ? path === to : path.startsWith(to);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6 md:h-16">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            {/* The real Zero mark, not a letter in a box. It is transparent and
                already the brand pink, so it needs no plate behind it — a tinted
                square would only mute it against the dark header. */}
            <img
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
            />
            <span className="font-display text-[17px]/[18px] font-bold tracking-tight text-ink">ZeroStart</span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                  isActive(item.to, item.exact)
                    ? "bg-ink/[0.08] text-ink"
                    : "text-ink-muted hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                  isActive("/admin", false) ? "bg-ink/[0.08] text-ink" : "text-ink-muted hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Admin
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {isAdmin && (
              <Link to="/admin" aria-label="Admin" className="grid h-10 w-10 place-items-center rounded-full text-ink-muted active:scale-95 md:hidden">
                <ShieldCheck className="h-[20px] w-[20px]" />
              </Link>
            )}
            {zp !== null && <ZpBadge amount={zp} className="hidden md:inline-flex" />}
            {session ? (
              <Link
                to="/profile"
                aria-label="Your ambassador profile"
                className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-ink/[0.06] ring-2 transition active:scale-95 ${
                  isActive("/profile", false) ? "ring-accent" : "ring-transparent hover:ring-line"
                }`}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[15px] font-bold uppercase text-ink">
                    {(profile?.full_name || profile?.username || "?").charAt(0)}
                  </span>
                )}
              </Link>
            ) : (
              <Link
                to="/signin"
                className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-ink transition hover:bg-accent-hover active:scale-[0.98]"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-16 sm:pt-6">{children}</main>

      {/* Phone nav: Zero Club's floating tab bar, class for class (src/routes/app.tsx
          BottomNav). Same data as the desktop nav, so a link can never exist in one
          and not the other. */}
      <nav
        data-zc-bottom-nav
        className="fixed bottom-[calc(max(10px,env(safe-area-inset-bottom)))] left-1/2 z-40 w-[calc(100%-20px)] -translate-x-1/2 md:hidden"
      >
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-bg/95 p-1.5 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg transition-all duration-200 active:scale-95 ${
                  active
                    ? "bg-primary/[0.12] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "text-ink-muted hover:bg-ink/[0.04] hover:text-ink"
                }`}
              >
                <Icon
                  className={`h-[20px] w-[20px] shrink-0 transition-transform duration-300 ease-out ${active ? "-translate-y-px scale-110" : ""}`}
                  active={active}
                />
                <span className="max-w-full truncate px-0.5 text-[9px] font-semibold leading-none tracking-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** A single place to send people to Zero Club, so the URL is never inlined. */
export const zeroClubHref = (path = "") => `${config.zeroClubUrl}${path}`;
