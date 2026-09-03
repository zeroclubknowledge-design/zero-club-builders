import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, LayoutGrid, Rocket, ShieldCheck, User } from "lucide-react";
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

const NAV = [
  { to: "/", label: "My work", icon: LayoutGrid, exact: true },
  { to: "/ambassadors", label: "Ambassadors", icon: Compass, exact: false },
  { to: "/join", label: "My profile", icon: Rocket, exact: false },
] as const;

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
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
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
            <span className="font-display text-[17px] font-bold text-ink">ZeroStart</span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                  isActive(item.to, item.exact)
                    ? "bg-ink/[0.06] text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                  isActive("/admin", false) ? "bg-ink/[0.06] text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Review
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
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
                className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink transition hover:opacity-90"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pb-16">{children}</main>

      {/* Phone nav. Same data as above, so a link can never exist in one and
          not the other. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl sm:hidden">
        <div className="flex items-stretch">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                  active ? "text-accent" : "text-ink-faint"
                }`}
                style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
              >
                <Icon className="h-5 w-5" />
                {item.label}
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
