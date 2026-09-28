import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Gift, Megaphone, Share2, Wallet } from "lucide-react";
import { getLeaderboard } from "@/lib/campaignApi";
import { CURRENCIES, CURRENCY_ORDER } from "@/lib/money";
import type { LeaderRow } from "@/types/campaign";

/**
 * The front door: what an ambassador does, how they get paid, and one action.
 * Also shown to signed-in people who have not set up their ambassador profile.
 */
export function Landing({ signedIn = false, applicationStatus }: { signedIn?: boolean; applicationStatus?: string }) {
  const pending = applicationStatus === "pending";
  const [top, setTop] = useState<LeaderRow[]>([]);
  useEffect(() => {
    getLeaderboard("all", 5).then((rows) => setTop(rows.filter((r) => r.results > 0))).catch(() => {});
  }, []);

  return (
    <div className="zs-rise">
      <section className="zs-hero relative overflow-hidden px-6 pb-8 pt-10 sm:px-10 sm:pb-12 sm:pt-14">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-white/85 ring-1 ring-white/15">
          <img src="/logo.png" alt="" className="h-4 w-4" /> Zero Ambassadors
        </span>
        <h1 className="mt-5 max-w-[560px] font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">
          Rep Zero Club. <span className="text-[#f28fd0]">Get paid every week.</span>
        </h1>
        <p className="mt-4 max-w-[480px] text-[15px] leading-relaxed text-white/70">
          Bring people to Zero Club and our partners — in your campus, city or community. Earn commission on
          everything the members you bring in pay, get paid weekly, and wear the Zero Club Ambassador badge.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to={signedIn ? "/join" : "/signin"}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[14.5px] font-semibold text-ink transition hover:-translate-y-0.5"
          >
            {!signedIn ? "Get started" : pending ? "View my application" : applicationStatus === "rejected" ? "Apply again" : "Apply to be an ambassador"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 text-[12px] text-white/60">
            Paid in
            {CURRENCY_ORDER.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 font-semibold text-white/85">
                <img src={CURRENCIES[c].flag} alt="" className="h-2.5 w-3.5 rounded-[2px] object-cover" /> {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Megaphone, title: "Apply & get approved", body: "Tell us where you'll represent. Once the Zero Club team approves you, start your own campaigns and share your link." },
          { icon: Share2, title: "Share your link", body: "Everyone who joins through your link is yours — you earn a share of every bootcamp, membership and purchase they pay for." },
          { icon: Wallet, title: "Get paid weekly", body: "Commission is paid into your Zero Club wallet every week, with bonuses from the Zero Club team on top." },
        ].map((step, i) => (
          <div key={step.title} className="zs-card p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                <step.icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Step {i + 1}</span>
            </div>
            <h3 className="mt-4 text-[16px] font-bold text-ink">{step.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="zs-card mt-3 flex items-center gap-4 p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok/10 text-ok">
          <Gift className="h-5 w-5" />
        </span>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">Early ambassadors earn more.</span> The first ambassadors lock in the highest commission rate for as long as they represent Zero Club — plus bonuses set by the team.
        </p>
      </section>

      {top.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Top ambassadors</h2>
          <div className="zs-card divide-y divide-line">
            {top.map((row, i) => (
              <div key={row.profile_id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-center font-display text-[14px] font-bold text-ink-faint">{i + 1}</span>
                {row.avatar_url ? (
                  <img src={row.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{row.display_name.charAt(0)}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{row.display_name}</span>
                  <span className="block truncate text-[11.5px] text-ink-faint">{row.location}</span>
                </span>
                <span className="text-[13px] font-bold text-ink">{row.results}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
