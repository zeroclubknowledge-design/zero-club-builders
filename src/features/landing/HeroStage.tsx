import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";

/**
 * The front door.
 *
 * Built from a spec written for a different product, so what was taken is the
 * composition — one viewport, a moving field behind everything, a proof row,
 * the headline, a subhead, one call to action, and a strip of counted numbers
 * along the bottom. The words are the landing page's own and unchanged; only
 * the presentation moved. What was left behind is everything that was not
 * true of Zero Club: a hero video on a stranger's CDN, "Trusted by 2000+
 * Enterprises" over Microsoft, Amazon and Google logos, and metrics about
 * inference latency.
 *
 * The numbers here are read from the database. A landing page that states a
 * figure it cannot substantiate is the one thing on a product that is
 * definitionally not worth building.
 */

type Stats = { builders: number; clubs: number; bootcamps: number; projects: number };

const PLACEHOLDER: Stats = { builders: 0, clubs: 0, bootcamps: 0, projects: 0 };

export function HeroStage({ referralCode }: { referralCode?: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.rpc("get_landing_stats");
        if (!cancelled && data) setStats(data as Stats);
      } catch {
        /* The page reads perfectly well without them. */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const shown = stats || PLACEHOLDER;

  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#0b0a0d] text-white">
      <BrandField />

      <div className="relative z-10 mx-auto flex w-full max-w-[1080px] flex-1 flex-col items-center justify-center px-5 pb-8 pt-[calc(5.5rem+env(safe-area-inset-top))] text-center md:px-8">
        <ProofRow builders={shown.builders} clubs={shown.clubs} ready={Boolean(stats)} />

        {/* The wording is the landing page's own, unchanged. Three lines, so
            the progression reads as a sequence — skills, then proof, then what
            the proof opens — with the third in brand pink. Each is its own
            block and never wraps, which is what keeps the set visually even at
            any width. Only the presentation moved. */}
        <h1 className="mt-6 font-display text-[clamp(30px,7.6vw,66px)] font-semibold leading-[1.08] tracking-[-0.04em]">
          <span className="block whitespace-nowrap animate-[zc-line_0.85s_cubic-bezier(0.22,1,0.36,1)_0.12s_both]">
            Build Skills.
          </span>
          <span className="block whitespace-nowrap animate-[zc-line_0.85s_cubic-bezier(0.22,1,0.36,1)_0.24s_both]">
            Build Proof.
          </span>
          <span className="block whitespace-nowrap text-[#cc208f] animate-[zc-line_0.85s_cubic-bezier(0.22,1,0.36,1)_0.36s_both]">
            Build Opportunities.
          </span>
        </h1>

        <p className="mt-6 max-w-[min(560px,92%)] text-[clamp(15px,1.7vw,18px)] leading-[1.55] text-white/70 animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.28s_both]">
          Learn in live bootcamps, ship work in public, join serious communities —
          and turn proof of work into reputation and income.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.4s_both]">
          <Link
            to="/signup"
            search={{ ref: referralCode, club: undefined }}
            preload={false}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold tracking-tight text-black shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_0_26px_rgba(204,32,143,0.35),0_0_54px_rgba(204,32,143,0.16)] transition hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.99]"
          >
            Start building free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/signin"
            search={{ ref: referralCode, club: undefined }}
            preload={false}
            className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold tracking-tight text-white/85 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white active:scale-[0.99]"
          >
            Sign in
          </Link>
        </div>

        <p className="mt-5 text-[12.5px] text-white/45">
          Free to join · Profiles, clubs, bootcamps, wallet, and XP built in
        </p>
      </div>

      <StatsStrip stats={shown} ready={Boolean(stats)} />
    </section>
  );
}

/**
 * The moving background.
 *
 * The spec called for a full-bleed video. Zero Club has no footage of its own,
 * and pointing the front door at a generated clip on somebody else's bucket is
 * how you end up serving an asset you do not control — the same mistake as the
 * link-preview image that was still coming from a lovable.app export.
 *
 * This is the same effect in CSS: brand-pink light drifting over near-black,
 * with a fine grain so the gradients do not band on cheap panels. It weighs
 * nothing, cannot 404, and does not ask a phone to decode video behind text.
 */
function BrandField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0b0a0d]">
      <div className="absolute -left-[20%] -top-[30%] h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(circle,rgba(204,32,143,0.30)_0%,rgba(204,32,143,0.10)_38%,transparent_66%)] blur-[40px] animate-[zc-drift-a_26s_ease-in-out_infinite]" />
      <div className="absolute -bottom-[35%] -right-[15%] h-[62vmax] w-[62vmax] rounded-full bg-[radial-gradient(circle,rgba(120,60,200,0.24)_0%,rgba(120,60,200,0.08)_42%,transparent_70%)] blur-[50px] animate-[zc-drift-b_32s_ease-in-out_infinite]" />
      <div className="absolute left-[45%] top-[35%] h-[40vmax] w-[40vmax] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.05)_0%,transparent_65%)] blur-[30px] animate-[zc-drift-a_38s_ease-in-out_infinite_reverse]" />
      {/* Grain. Without it the blurs band into visible steps on 6-bit panels,
          which is most budget Android phones. */}
      <div className="zc-grain absolute inset-0 opacity-[0.16]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0a0d]/40 via-transparent to-[#0b0a0d]" />
    </div>
  );
}

/** Real counts, or a neutral line until they arrive. */
function ProofRow({ builders, clubs, ready }: { builders: number; clubs: number; ready: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-1.5 pr-4 backdrop-blur-md animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.05s_both]">
      <span className="flex -space-x-2">
        {["#cc208f", "#7a3cc8", "#2f7a8b"].map((colour) => (
          <span
            key={colour}
            className="grid h-7 w-7 place-items-center rounded-full ring-2 ring-[#0b0a0d]"
            style={{ background: colour }}
          >
            <span className="h-2 w-2 rounded-full bg-white/85" />
          </span>
        ))}
      </span>
      <span className="text-[12.5px] font-medium text-white/75">
        {ready && builders > 0
          ? `${builders.toLocaleString()} builders across ${clubs.toLocaleString()} ${clubs === 1 ? "club" : "clubs"}`
          : "Built in public, by people doing the work"}
      </span>
    </div>
  );
}

/** The four numbers, counted up once they are real. */
function StatsStrip({ stats, ready }: { stats: Stats; ready: boolean }) {
  const items = [
    { value: stats.builders, label: "Builders" },
    { value: stats.clubs, label: "Clubs" },
    { value: stats.bootcamps, label: "Bootcamps" },
    { value: stats.projects, label: "Projects shipped" },
  ];

  return (
    <div className="relative z-10 mx-auto grid w-full max-w-[860px] grid-cols-2 gap-y-6 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] md:grid-cols-4 md:px-8">
      {items.map((item, index) => (
        <div
          key={item.label}
          className="text-center animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_both]"
          style={{ animationDelay: `${0.5 + index * 0.08}s` }}
        >
          <p className="font-display text-[clamp(20px,2.4vw,28px)] font-semibold tabular-nums tracking-[-0.03em] text-white">
            {ready ? <CountUp to={item.value} delay={480 + index * 90} /> : "—"}
          </p>
          <p className="mt-1 text-[clamp(11px,1.2vw,12.5px)] text-white/45">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Counts once, on an easing curve, and respects reduced motion. */
function CountUp({ to, delay }: { to: number; delay: number }) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced || to <= 0) {
      setValue(to);
      return;
    }

    const duration = 1500;
    let start = 0;
    const timer = setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const progress = Math.min(1, (now - start) / duration);
        // easeOutCubic: fast enough to feel responsive, settles rather than stops.
        setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [to, delay]);

  return <>{value.toLocaleString()}</>;
}
