import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { PartnerMarquee } from "./PartnerMarquee";

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

export function HeroStage({ referralCode }: { referralCode?: string }) {
  /*
   * Counted live, and kept current.
   *
   * A one-shot fetch would have frozen these at whatever they were when the
   * tab opened. They refresh on an interval and whenever the tab is focused
   * again, so a page left open on a second monitor is not quietly showing
   * yesterday's numbers — and a new signup appears without a reload.
   */
  const { data: stats, isError } = useQuery({
    queryKey: ["landing-stats"],
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await supabase.rpc("get_landing_stats");
      if (error) throw error;
      return data as Stats;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: 1,
  });

  /*
   * No invented numbers.
   *
   * This used to fall back to a PLACEHOLDER of all zeros whenever the query
   * had not answered — including when get_landing_stats does not exist, which
   * is exactly what happened. The strip then told every first-time visitor
   * "0 Builders · 0 Clubs · 0 Bootcamps · 0 Projects shipped", which reads as
   * a dead platform. A real zero and a failed request are not the same claim,
   * and only one of them is ours to make.
   *
   * So: undefined while loading (the strip holds its space and shows nothing),
   * and hidden outright on error. A missing strip costs a little polish. A
   * strip of zeros costs the visitor's belief that anyone is here.
   */

  return (
    /* min-h rather than h: the composition wants one screen, but a short
       laptop window should scroll rather than crush the stats into the
       headline. */
    /* Shorter section, so the headline sits nearer the header.
       The gap under the header was not padding — it was slack. The content is
       centred inside the section, so at 88svh there was a screenful of height
       to centre within and the headline drifted to the middle of it. Taking
       the section down to ~76svh removes the slack itself, which pulls the
       whole composition up without moving anything relative to anything else.

       Plain block comment, not {braced}: this sits between `return (` and the
       root element, which is expression position — a braced comment there is a
       second expression and the file stops compiling. */
    <section className="relative flex min-h-[68svh] flex-col overflow-hidden bg-[#f4f2ef] text-[#171717] dark:bg-[#0b0a0d] dark:text-white md:min-h-[74svh]">
      <BrandField />

      {/* Positioned, not centred.
       *
       * Centring inside the leftover space was the root of both problems here.
       * It meant the headline moved whenever anything below it changed height,
       * and it forced me to reserve a block of empty space to hold it still —
       * which then showed as a void under the partner row. Laying the content
       * out from the top instead fixes both at once: nothing below can move
       * the headline, so nothing has to be reserved.
       *
       * The top padding has to CLEAR the header, which is 4rem tall and fixed.
       * It was 3.25rem — 12px less than the header itself — which is why the
       * headline was sitting right up against it. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col items-center px-4 pb-10 pt-[calc(4rem+2.5rem+env(safe-area-inset-top))] text-center md:px-8">
        {/* The wording is the landing page's own, unchanged. Three lines, so
            the progression reads as a sequence — skills, then proof, then what
            the proof opens — with the third in brand pink. Each is its own
            block and never wraps, which is what keeps the set visually even at
            any width. Only the presentation moved. */}
        {/* Bigger again, and no top margin.
            The floor rises with the viewport rather than by breakpoint, so the
            three lines stay proportional at every width. The mt-5 is gone: the
            container's own top padding already clears the header, and the
            margin was stacking on top of it. */}
        <h1 className="font-display text-[clamp(46px,10.6vw,104px)] font-semibold leading-[1.02] tracking-[-0.045em]">
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

        <p className="mt-5 max-w-[min(560px,92%)] text-[clamp(15px,1.7vw,18px)] leading-[1.55] text-[#4d4f55] dark:text-white/70 animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.28s_both]">
          Learn in live bootcamps, ship work in public, join serious communities —
          and turn proof of work into reputation and income.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.4s_both]">
          <Link
            to="/signup"
            search={{ ref: referralCode, club: undefined }}
            preload={false}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#171717] px-7 text-[15px] font-semibold tracking-tight text-white shadow-[0_10px_30px_-12px_rgba(204,32,143,0.6)] transition hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.99] dark:bg-white dark:text-black dark:shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_0_26px_rgba(204,32,143,0.35),0_0_54px_rgba(204,32,143,0.16)]"
          >
            Start building free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/signin"
            search={{ ref: referralCode, club: undefined }}
            preload={false}
            className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold tracking-tight text-[#303236] ring-1 ring-[#171717]/15 transition hover:bg-white active:scale-[0.99] dark:text-white/85 dark:ring-white/20 dark:hover:bg-white/10 dark:hover:text-white"
          >
            Sign in
          </Link>
        </div>

        <p className="mt-4 text-[12.5px] text-[#666a70] dark:text-white/45">
          Free to join · Profiles, clubs, bootcamps, wallet, and XP built in
        </p>

        <PartnerMarquee />
      </div>

      {/* No reserved height any more.
       *
       * The 168px placeholder existed only to stop the centred headline from
       * moving when this strip failed to load. Nothing is centred now, so the
       * strip can come and go freely — and when it does not load there is no
       * empty block left behind under the partner row. */}
      {!isError && <StatsStrip stats={stats} />}
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
    /* Same composition, two palettes. On a light page the same blooms would
       be invisible at these opacities, so they are stronger and the veil at
       the bottom fades to the light background instead of near-black. */
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#f4f2ef] dark:bg-[#0b0a0d]">
      <div className="absolute -left-[20%] -top-[30%] h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(circle,rgba(204,32,143,0.22)_0%,rgba(204,32,143,0.08)_38%,transparent_66%)] dark:bg-[radial-gradient(circle,rgba(204,32,143,0.30)_0%,rgba(204,32,143,0.10)_38%,transparent_66%)] blur-[40px] animate-[zc-drift-a_26s_ease-in-out_infinite]" />
      {/* Was rgba(120,60,200) — a blue-violet roughly 55° off the brand hue,
          so the second bloom was quietly a different colour from the first.
          A deeper magenta gives the same tonal separation from lightness
          instead, and keeps the whole field in one family. */}
      <div className="absolute -bottom-[35%] -right-[15%] h-[62vmax] w-[62vmax] rounded-full bg-[radial-gradient(circle,rgba(163,26,118,0.18)_0%,rgba(163,26,118,0.06)_42%,transparent_70%)] dark:bg-[radial-gradient(circle,rgba(163,26,118,0.28)_0%,rgba(163,26,118,0.09)_42%,transparent_70%)] blur-[50px] animate-[zc-drift-b_32s_ease-in-out_infinite]" />
      <div className="absolute left-[45%] top-[35%] h-[40vmax] w-[40vmax] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.55)_0%,transparent_65%)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.05)_0%,transparent_65%)] blur-[30px] animate-[zc-drift-a_38s_ease-in-out_infinite_reverse]" />
      {/* Grain. Without it the blurs band into visible steps on 6-bit panels,
          which is most budget Android phones. */}
      <div className="zc-grain absolute inset-0 opacity-[0.07] dark:opacity-[0.16]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#f4f2ef]/40 via-transparent to-[#f4f2ef] dark:from-[#0b0a0d]/40 dark:to-[#0b0a0d]" />
      {/* The horizon. Sits above the fade so it is the last thing painted:
          a wide, shallow arc of brand light along the bottom edge, which makes
          the hero read as lit from below rather than decorated. It is the
          reference's most recognisable move and the one that carries the
          whole style downward into the sections that follow. */}
      <div className="zc-horizon" />
    </div>
  );
}

/** The four numbers, counted up once they are real. Undefined until then. */
function StatsStrip({ stats }: { stats?: Stats }) {
  const items = [
    { value: stats?.builders, label: "Builders" },
    { value: stats?.clubs, label: "Clubs" },
    { value: stats?.bootcamps, label: "Bootcamps" },
    { value: stats?.projects, label: "Projects shipped" },
  ];

  return (
    <div className="relative z-10 mx-auto grid w-full max-w-[860px] grid-cols-2 gap-y-6 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] md:grid-cols-4 md:px-8">
      {items.map((item, index) => (
        <div
          key={item.label}
          className="text-center animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_both]"
          style={{ animationDelay: `${0.5 + index * 0.08}s` }}
        >
          <p className="font-display text-[clamp(20px,2.4vw,28px)] font-semibold tabular-nums tracking-[-0.03em] text-[#171717] dark:text-white">
            {/* A number only once there is one. The previous version always
                rendered a figure, which is right when the answer is a real 0
                and badly wrong when there is no answer at all — it printed a
                confident zero over a failed request. The placeholder holds the
                same height so nothing shifts when the real figure lands.
                CountUp re-runs when the value changes, so a refresh animates
                to the new figure rather than snapping. */}
            {item.value === undefined
              ? <span className="inline-block h-[1em] w-10 animate-pulse rounded bg-current align-middle opacity-10" />
              : <CountUp to={item.value} delay={480 + index * 90} />}
          </p>
          <p className="mt-1 text-[clamp(11px,1.2vw,12.5px)] text-[#666a70] dark:text-white/45">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Counts once, on an easing curve, and respects reduced motion. */
function CountUp({ to, delay }: { to: number; delay: number }) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(0);
  // Where this run starts from. First paint counts up from zero; a later
  // refresh counts from what is already on screen, so 41 becoming 42 is a
  // small move rather than a full recount.
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const from = fromRef.current;

    if (reduced || to === from) {
      setValue(to);
      fromRef.current = to;
      return;
    }

    // A first count deserves the full run; a later nudge should be quick.
    const duration = from === 0 ? 1500 : 600;
    const wait = from === 0 ? delay : 0;
    let start = 0;

    const timer = setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const progress = Math.min(1, (now - start) / duration);
        // easeOutCubic: fast enough to feel responsive, settles rather than stops.
        setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame.current = requestAnimationFrame(step);
        else fromRef.current = to;
      };
      frame.current = requestAnimationFrame(step);
    }, wait);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [to, delay]);

  return <>{value.toLocaleString()}</>;
}
