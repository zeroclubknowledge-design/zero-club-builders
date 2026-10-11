import { Link, useRouterState } from "@tanstack/react-router";
import { Megaphone, ShieldCheck, Trophy, User, type LucideIcon } from "./icons/glyphs";
import { IconHome, IconProfile, IconWallet } from "./icons/nav";
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
  { to: "/join", label: "Profile", icon: IconProfile, exact: false },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, profile, isAdmin, signOut } = useAuth();
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
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:h-16 sm:px-6">
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

          <nav className="hidden flex-1 items-center gap-1 sm:flex">
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
              <Link to="/admin" aria-label="Admin" className="grid h-10 w-10 place-items-center rounded-full text-ink-muted active:scale-95 sm:hidden">
                <ShieldCheck className="h-[20px] w-[20px]" />
              </Link>
            )}
            {zp !== null && <ZpBadge amount={zp} className="hidden sm:inline-flex" />}
            {session ? (
              <button
                onClick={signOut}
                className="flex items-center gap-2 rounded-full bg-ink/[0.05] px-3 py-1.5 text-[12px] font-semibold text-ink-muted transition hover:text-ink"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}
                Sign out
              </button>
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

      <main className="mx-auto max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-16 sm:pt-6">{children}</main>

      {/* Phone nav: Zero Club's floating tab bar. Same data as above, so a
          link can never exist in one and not the other. */}
      <nav className="fixed bottom-[calc(max(10px,env(safe-area-inset-bottom)))] left-1/2 z-40 w-[calc(100%-20px)] max-w-md -translate-x-1/2 sm:hidden">
        <div className="grid grid-cols-5 gap-1 rounded-xl border border-line bg-bg/95 p-1.5 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg transition active:scale-95 ${
                  active ? "bg-ink/[0.12] text-ink" : "text-ink-muted"
                }`}
              >
                <span className={`transition-transform ${active ? "-translate-y-px scale-110" : ""}`}>
                  <Icon className="h-[20px] w-[20px]" active={active} />
                </span>
                <span className="text-[9px] font-semibold leading-none tracking-tight">{item.label}</span>
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
