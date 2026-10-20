/**
 * The rate card as visitors see it. One rate reads as a single wide card;
 * PRO tiers sit side by side (a swipeable rail on phones), with the
 * "Most popular" tier lifted and lit in the owner's accent.
 */
import type { CSSProperties } from "react";
import { ArrowUpRight, Check, Clock, Sparkles } from "@/components/icons/glyphs";
import { formatPrice, RATE_UNIT_SHORT, type RateTier, normaliseRateCard, visibleTiers } from "../rates";
import type { Skin } from "./blocks";
import { ContactLink, type View } from "./kit";

export function hasRates(v: Pick<View, "portfolio">) {
  return visibleTiers(normaliseRateCard(v.portfolio.rate_card), Boolean(v.portfolio.premium_active)).length > 0;
}

export function RateCardBlock({ v, skin, display }: { v: View; skin: Skin; display?: CSSProperties }) {
  const card = normaliseRateCard(v.portfolio.rate_card);
  const tiers = visibleTiers(card, Boolean(v.portfolio.premium_active));
  if (!card || !tiers.length) return null;
  const single = tiers.length === 1;

  return (
    <div>
      <style>{RATE_CSS}</style>
      {single ? (
        <SingleRate tier={tiers[0]} currency={card.currency} v={v} skin={skin} display={display} />
      ) : (
        <div
          className={`pf-rates -mx-1 grid gap-4 px-1 pb-1 pt-4 ${
            tiers.length === 2
              ? "@2xl:grid-cols-2"
              : tiers.length === 3
                ? "@3xl:grid-cols-3"
                : "@2xl:grid-cols-2 @5xl:grid-cols-4"
          }`}
        >
          {tiers.map((tier, i) => (
            <TierCard
              key={tier.id}
              tier={tier}
              index={i}
              currency={card.currency}
              v={v}
              skin={skin}
              display={display}
            />
          ))}
        </div>
      )}
      {card.note?.trim() && (
        <p className={`mt-5 max-w-[640px] text-[13px] leading-relaxed ${skin.faint}`}>{card.note}</p>
      )}
    </div>
  );
}

function Price({
  tier,
  currency,
  display,
  size,
  reserve,
}: {
  tier: RateTier;
  currency: string;
  display?: CSSProperties;
  size: "lg" | "xl";
  /** Keep the "Starting from" line's space so prices line up across tiers. */
  reserve?: boolean;
}) {
  const big = size === "xl" ? "text-[44px] @2xl:text-[52px]" : "text-[38px]";
  const kicker = (text: string | null) =>
    text || reserve ? (
      <p
        aria-hidden={!text}
        className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-55 ${text ? "" : "invisible"}`}
      >
        {text || "Starting from"}
      </p>
    ) : null;
  if (tier.custom || tier.price == null)
    return (
      <div>
        {kicker(reserve ? "Tailored" : null)}
        <p className={`${big} font-semibold leading-none tracking-[-0.03em]`} style={display}>
          Custom
          <span className="ml-2 align-middle text-[14px] font-medium tracking-normal opacity-55">quote</span>
        </p>
      </div>
    );
  return (
    <div>
      {kicker(tier.from ? "Starting from" : null)}
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={`${big} font-semibold leading-none tracking-[-0.03em] tabular-nums`} style={display}>
          {formatPrice(currency, tier.price)}
        </span>
        <span className="text-[14px] font-medium opacity-55">/ {RATE_UNIT_SHORT[tier.unit]}</span>
      </p>
    </div>
  );
}

function Features({ tier, skin, highlight }: { tier: RateTier; skin: Skin; highlight?: boolean }) {
  if (!tier.features.length) return null;
  return (
    <ul className="space-y-2.5">
      {tier.features.map((f, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug">
          <span
            className={`mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${
              highlight ? "bg-[var(--pf-accent)] text-[color:var(--pf-ink)]" : "bg-[var(--pf-accent)]/15 text-[var(--pf-accent)]"
            }`}
          >
            <Check className="h-[11px] w-[11px]" strokeWidth={3} />
          </span>
          <span className={skin.muted}>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function Cta({ v, tier, filled, skin }: { v: View; tier: RateTier; filled: boolean; skin: Skin }) {
  const label = tier.custom || tier.price == null ? "Get a quote" : `Choose ${tier.name}`;
  return (
    <ContactLink
      v={v}
      className={`pf-rate-cta group/cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[14.5px] font-semibold transition active:scale-[0.98] ${
        filled
          ? "bg-[var(--pf-accent)] text-[color:var(--pf-ink)] shadow-[0_10px_30px_-12px_var(--pf-accent)] hover:brightness-110"
          : `border ${skin.line} hover:border-[var(--pf-accent)] hover:text-[var(--pf-accent)]`
      }`}
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5" />
    </ContactLink>
  );
}

function TierCard({
  tier,
  index,
  currency,
  v,
  skin,
  display,
}: {
  tier: RateTier;
  index: number;
  currency: string;
  v: View;
  skin: Skin;
  display?: CSSProperties;
}) {
  const hi = Boolean(tier.highlight);
  return (
    <article
      className={`pf-rate pf-lift relative flex min-w-0 flex-col overflow-hidden p-6 @2xl:p-7 ${skin.card} ${
        hi ? "pf-rate-hi ring-2 ring-[var(--pf-accent)] ring-offset-0" : ""
      }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {hi && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full opacity-30 blur-3xl"
            style={{ background: "var(--pf-accent)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
            style={{ background: "linear-gradient(90deg, transparent, var(--pf-accent), transparent)" }}
          />
        </>
      )}
      <div className="relative flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-bold uppercase tracking-[0.14em]" style={display}>
          {tier.name}
        </p>
        {hi && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--pf-accent)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[color:var(--pf-ink)]">
            <Sparkles className="h-3 w-3" /> Most popular
          </span>
        )}
      </div>
      <div className="relative mt-5">
        <Price tier={tier} currency={currency} display={display} size="lg" reserve />
      </div>
      {tier.summary?.trim() && (
        <p className={`relative mt-3 text-[14px] leading-relaxed ${skin.muted}`}>{tier.summary}</p>
      )}
      <div className={`relative my-5 border-t ${skin.line}`} />
      <div className="relative flex-1">
        <Features tier={tier} skin={skin} highlight={hi} />
      </div>
      {tier.turnaround?.trim() && (
        <p className={`relative mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium ${skin.faint}`}>
          <Clock className="h-3.5 w-3.5" /> Delivered in {tier.turnaround}
        </p>
      )}
      <div className="relative mt-6">
        <Cta v={v} tier={tier} filled={hi} skin={skin} />
      </div>
    </article>
  );
}

function SingleRate({
  tier,
  currency,
  v,
  skin,
  display,
}: {
  tier: RateTier;
  currency: string;
  v: View;
  skin: Skin;
  display?: CSSProperties;
}) {
  return (
    <article className={`pf-rate relative overflow-hidden ${skin.card}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--pf-accent)" }}
      />
      <div className="relative grid gap-6 p-6 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] @2xl:gap-10 @2xl:p-9">
        <div className="flex min-w-0 flex-col">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--pf-accent)]">{tier.name}</p>
          <div className="mt-4">
            <Price tier={tier} currency={currency} display={display} size="xl" />
          </div>
          {tier.summary?.trim() && (
            <p className={`mt-4 max-w-[420px] text-[15px] leading-relaxed ${skin.muted}`}>{tier.summary}</p>
          )}
        </div>
        <div className={`flex min-w-0 flex-col justify-between gap-6 @2xl:border-l @2xl:pl-10 ${skin.line}`}>
          {tier.features.length > 0 ? (
            <div>
              <p className={`mb-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${skin.faint}`}>
                What's included
              </p>
              <Features tier={tier} skin={skin} />
            </div>
          ) : (
            <span />
          )}
          <div className="@2xl:max-w-[280px]">
            <Cta v={v} tier={tier} filled skin={skin} />
          </div>
        </div>
      </div>
    </article>
  );
}

/* Tiers rise in one after another; on narrow screens they become a swipeable rail. */
const RATE_CSS = `
@keyframes pf-rate-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
.pf-rate { animation: pf-rate-in .6s cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .pf-rate { animation: none } }
@container (max-width: 41.99rem) {
  .pf-rates { grid-auto-flow: column; grid-auto-columns: minmax(82%, 1fr); overflow-x: auto;
    scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
  .pf-rates::-webkit-scrollbar { display: none }
  .pf-rates > * { scroll-snap-align: center; }
}
@container (min-width: 64rem) { .pf-rate-hi { transform: translateY(-8px) } }
`;
