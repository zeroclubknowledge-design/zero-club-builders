import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "@/components/icons/glyphs";
import { AccountChip } from "@/components/AccountChip";
import { zc } from "@/lib/config";

export type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };

/**
 * One shell for every signed-in screen: a glass top bar on desktop, Zero
 * Club's floating tab bar on phones. The nav is data, so the two can't drift.
 */
export function AppShell({ brand, nav, children }: { brand: ReactNode; nav: NavItem[]; children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = (item: NavItem) => (item.exact ? path === item.to : path === item.to || path.startsWith(`${item.to}/`));
  return (
    <div className="min-h-dvh bg-canvas text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-[60px] max-w-[1080px] items-center gap-5 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">{brand}</Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${active(item) ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href={zc("/app")} className="hidden h-9 items-center rounded-full border border-border px-3.5 text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground sm:inline-flex">
              Open Zero Club
            </a>
            <AccountChip />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1080px] px-4 pb-[calc(104px+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-16">{children}</main>
      <nav className="fixed bottom-[max(10px,env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-20px)] max-w-[480px] -translate-x-1/2 md:hidden">
        <div className="grid gap-1 rounded-[24px] border border-border bg-background/95 p-1.5 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.45)] backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map((item) => {
            const Icon = item.icon;
            const on = active(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={on ? "page" : undefined}
                className={`flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[20px] transition active:scale-95 ${on ? "bg-[#c3217e]/[0.12] text-[#c3217e]" : "text-muted-foreground"}`}
              >
                <Icon className={`h-[20px] w-[20px] ${on ? "scale-110" : ""}`} />
                <span className="max-w-full truncate px-0.5 text-[9.5px] font-semibold leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** The page title block every screen opens with. */
export function PageHead({ eyebrow, title, sub, action }: { eyebrow?: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#c3217e]">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
        {sub && <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
