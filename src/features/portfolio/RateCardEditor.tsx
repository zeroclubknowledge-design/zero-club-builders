/**
 * Rate card editor for the portfolio builder.
 *
 * Free plans set one rate. PRO members build up to four tiers, reorder them,
 * mark one "Most popular" and add delivery times. A lapsed member keeps
 * editing their first rate; any extra tiers are left untouched (the server
 * only lets PRO change them) and stay hidden until they renew.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Crown,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "@/components/icons/glyphs";
import { Switch } from "@/components/ui/switch";
import { SortableList } from "@/components/SortableList";
import {
  CURRENCIES,
  RATE_LIMITS,
  RATE_TEXT,
  RATE_UNITS,
  RATE_UNIT_LABEL,
  RATE_UNIT_SHORT,
  currencySymbol,
  formatPrice,
  newTier,
  newTierId,
  proPreset,
  tierReady,
  type RateCard,
  type RateTier,
} from "./rates";

const PINK = "#cc208f";
const ease = [0.22, 1, 0.36, 1] as const;

export function RateCardEditor({
  value,
  premium,
  onChange,
}: {
  value: RateCard | null;
  premium: boolean;
  onChange: (next: RateCard | null) => void;
}) {
  const limits = premium ? RATE_LIMITS.pro : RATE_LIMITS.free;
  const card = value;
  const allTiers = card?.tiers || [];
  // Free plans edit the first rate only; the rest (from a lapsed PRO) is kept as is.
  const tiers = premium ? allTiers : allTiers.slice(0, 1);
  const paused = premium ? 0 : Math.max(0, allTiers.length - 1);
  const [openId, setOpenId] = useState<string | null>(tiers[0]?.id ?? null);

  const write = (patch: Partial<RateCard>) =>
    onChange({ currency: "NGN", note: "", tiers: [], ...(card || {}), ...patch });

  const setTiers = (next: RateTier[]) =>
    write({ tiers: premium ? next : [...next.slice(0, 1), ...allTiers.slice(1)] });

  const patchTier = (id: string, patch: Partial<RateTier>) =>
    setTiers(
      tiers.map((t) => {
        if (t.id === id) return { ...t, ...patch };
        // Only one tier can be "Most popular".
        if (patch.highlight) return { ...t, highlight: false };
        return t;
      }),
    );

  const addTier = () => {
    if (tiers.length >= limits.tiers) return;
    const names = ["Basic", "Pro", "Premium", "Custom"];
    const name = names.find((n) => !tiers.some((t) => t.name === n)) || "";
    const tier = newTier(name, { unit: tiers[tiers.length - 1]?.unit || "project" });
    setTiers([...tiers, tier]);
    setOpenId(tier.id);
  };

  const duplicate = (tier: RateTier) => {
    if (tiers.length >= limits.tiers) return;
    const copy = { ...tier, id: newTierId(), name: `${tier.name} copy`.slice(0, RATE_TEXT.name), highlight: false };
    const at = tiers.findIndex((t) => t.id === tier.id);
    setTiers([...tiers.slice(0, at + 1), copy, ...tiers.slice(at + 1)]);
    setOpenId(copy.id);
  };

  const removeTier = (id: string) => {
    const next = tiers.filter((t) => t.id !== id);
    if (!next.length && !paused) return onChange(null);
    setTiers(next);
  };

  const start = (preset: "single" | "tiers") => {
    const next = preset === "tiers" ? proPreset() : [newTier(premium ? "Standard" : "My rate")];
    onChange({ currency: card?.currency || "NGN", note: card?.note || "", tiers: next });
    setOpenId(next[preset === "tiers" ? 1 : 0].id);
  };

  /* ── Empty ─────────────────────────────────────────── */
  if (!tiers.length) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#cc208f]/[0.07] via-transparent to-transparent p-5">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#cc208f]/20 blur-3xl"
        />
        <div className="relative flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#cc208f] text-white shadow-[0_10px_24px_-10px_#cc208f]">
            <Banknote className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">Show what you charge</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              A clear rate turns visitors into clients. They tap it and land straight in your “Let's talk”.
            </p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {premium ? (
            <>
              <button
                type="button"
                onClick={() => start("tiers")}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background transition active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4" /> Basic · Pro · Premium
              </button>
              <button type="button" onClick={() => start("single")} className={chip}>
                <Plus className="h-4 w-4" /> One rate
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => start("single")}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background transition active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Add my rate
            </button>
          )}
        </div>
        {!premium && <ProUpsell className="relative mt-4" />}
      </div>
    );
  }

  /* ── Editing ───────────────────────────────────────── */
  const tierRow = (tier: RateTier, handle?: ReactNode) => (
    <TierEditor
      tier={tier}
      currency={card!.currency}
      premium={premium}
      open={openId === tier.id}
      onToggle={() => setOpenId((id) => (id === tier.id ? null : tier.id))}
      onChange={(patch) => patchTier(tier.id, patch)}
      onDuplicate={premium && tiers.length < limits.tiers ? () => duplicate(tier) : undefined}
      onRemove={() => removeTier(tier.id)}
      handle={handle}
    />
  );

  return (
    <div className="space-y-4">
      {/* Currency */}
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">Currency</p>
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {CURRENCIES.map((c) => {
            const active = card!.currency === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => write({ currency: c.code })}
                className={`relative h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition ${
                  active ? "text-background" : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="rate-currency"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">
                  {c.symbol} <span className="opacity-70">{c.code}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tiers */}
      {premium && tiers.length > 1 ? (
        <SortableList
          items={tiers}
          getKey={(t) => t.id}
          onChange={setTiers}
          className="space-y-2.5"
          renderItem={(tier, tools) => tierRow(tier, tools.handle)}
        />
      ) : (
        <div className="space-y-2.5">{tiers.map((t) => <div key={t.id}>{tierRow(t)}</div>)}</div>
      )}

      {premium && tiers.length < limits.tiers && (
        <motion.button
          layout
          type="button"
          onClick={addTier}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-[13.5px] font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" /> Add a tier
          <span className="text-[12px] font-medium opacity-60">
            {tiers.length}/{limits.tiers}
          </span>
        </motion.button>
      )}

      {paused > 0 && (
        <p className="rounded-xl bg-[#cc208f]/[0.08] px-3 py-2 text-[12.5px] leading-snug">
          {paused} more {paused === 1 ? "tier is" : "tiers are"} paused while your membership is inactive. Visitors see
          your first rate only.{" "}
          <Link to="/app/premium" className="font-semibold text-[#cc208f]">
            Renew to bring {paused === 1 ? "it" : "them"} back
          </Link>
        </p>
      )}

      {!premium && !paused && <ProUpsell />}

      {/* Footnote */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">Footnote</span>
          <span className="text-[11.5px] tabular-nums text-muted-foreground/70">
            {(card!.note || "").length}/{RATE_TEXT.note}
          </span>
        </div>
        <input
          value={card!.note || ""}
          maxLength={RATE_TEXT.note}
          onChange={(e) => write({ note: e.target.value })}
          placeholder="e.g. 50% deposit to start · prices exclude VAT"
          className={field}
        />
      </div>
    </div>
  );
}

/* ── One tier ─────────────────────────────────────────── */

function TierEditor({
  tier,
  currency,
  premium,
  open,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
  handle,
}: {
  tier: RateTier;
  currency: string;
  premium: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<RateTier>) => void;
  onDuplicate?: () => void;
  onRemove: () => void;
  handle?: ReactNode;
}) {
  const limits = premium ? RATE_LIMITS.pro : RATE_LIMITS.free;
  const ready = tierReady(tier);
  const priceText = tier.custom
    ? "Custom quote"
    : tier.price != null
      ? `${tier.from ? "From " : ""}${formatPrice(currency, tier.price)} / ${RATE_UNIT_SHORT[tier.unit]}`
      : "Set a price";

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-background transition-[box-shadow,border-color] duration-300 ${
        open ? "border-foreground/20 shadow-[0_12px_32px_-18px_rgb(0_0_0/0.35)]" : "border-border"
      } ${tier.highlight ? "ring-1 ring-[#cc208f]/50" : ""}`}
    >
      {/* Summary row */}
      <div className="flex items-center gap-1.5 py-2 pl-1.5 pr-2">
        {handle ?? <span className="w-1" />}
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold ${
              tier.highlight ? "bg-[#cc208f] text-white" : "bg-foreground/[0.06] text-foreground"
            }`}
          >
            {currencySymbol(currency).slice(0, 3)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[14.5px] font-semibold">{tier.name || "Untitled rate"}</span>
              {tier.highlight && (
                <span className="shrink-0 rounded-full bg-[#cc208f]/12 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#cc208f]">
                  Popular
                </span>
              )}
            </span>
            <span
              className={`block truncate text-[12.5px] tabular-nums ${ready ? "text-muted-foreground" : "text-amber-600"}`}
            >
              {priceText}
            </span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3, ease }}>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease }}
          >
            <div className="space-y-4 border-t border-border px-3.5 pb-4 pt-3.5">
              {/* Name */}
              <div>
                <FieldLabel text="Name" count={`${tier.name.length}/${RATE_TEXT.name}`} />
                <input
                  value={tier.name}
                  maxLength={RATE_TEXT.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder={premium ? "Basic, Pro, Premium…" : "e.g. Brand identity, Landing page"}
                  className={field}
                />
              </div>

              {/* Price */}
              <div>
                <FieldLabel text="Price" />
                <div
                  className={`mt-1.5 flex h-14 items-center overflow-hidden rounded-xl border border-border bg-card transition focus-within:border-foreground/40 ${
                    tier.custom ? "opacity-50" : ""
                  }`}
                >
                  <span className="pl-3.5 pr-1 text-[20px] font-semibold text-muted-foreground">
                    {currencySymbol(currency)}
                  </span>
                  <input
                    inputMode="numeric"
                    disabled={tier.custom}
                    value={tier.price != null ? tier.price.toLocaleString("en") : ""}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                      onChange({ price: digits ? Number(digits) : null });
                    }}
                    placeholder="0"
                    aria-label="Price"
                    className="h-full min-w-0 flex-1 bg-transparent px-1 text-[22px] font-semibold tabular-nums tracking-tight outline-none placeholder:text-muted-foreground/40"
                  />
                  <select
                    value={tier.unit}
                    onChange={(e) => onChange({ unit: e.target.value as RateTier["unit"] })}
                    aria-label="Charged"
                    className="mr-2 h-10 shrink-0 cursor-pointer rounded-lg bg-foreground/[0.06] px-2.5 text-[13px] font-semibold outline-none"
                  >
                    {RATE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {RATE_UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <PillToggle
                    on={Boolean(tier.from)}
                    disabled={tier.custom}
                    onClick={() => onChange({ from: !tier.from })}
                  >
                    Starting from
                  </PillToggle>
                  <PillToggle on={Boolean(tier.custom)} onClick={() => onChange({ custom: !tier.custom })}>
                    Custom quote
                  </PillToggle>
                </div>
              </div>

              {/* Summary */}
              <div>
                <FieldLabel text="Short description" count={`${(tier.summary || "").length}/${RATE_TEXT.summary}`} />
                <textarea
                  value={tier.summary || ""}
                  maxLength={RATE_TEXT.summary}
                  rows={2}
                  onChange={(e) => onChange({ summary: e.target.value })}
                  placeholder="Who it's for and what they get"
                  className={`${field} h-auto resize-none py-2.5 leading-relaxed`}
                />
              </div>

              {/* Inclusions */}
              <Inclusions
                features={tier.features}
                max={limits.features}
                premium={premium}
                onChange={(features) => onChange({ features })}
              />

              {/* PRO extras */}
              {premium ? (
                <div className="space-y-1 rounded-xl bg-foreground/[0.03] p-3">
                  <label className="flex items-center gap-3 py-1">
                    <Sparkles className="h-4 w-4 shrink-0 text-[#cc208f]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">Most popular</span>
                      <span className="block text-[12px] text-muted-foreground">Lift and light this tier</span>
                    </span>
                    <Switch checked={Boolean(tier.highlight)} onCheckedChange={(highlight) => onChange({ highlight })} />
                  </label>
                  <div className="flex items-center gap-3 pt-1">
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      value={tier.turnaround || ""}
                      maxLength={RATE_TEXT.turnaround}
                      onChange={(e) => onChange({ turnaround: e.target.value })}
                      placeholder="Delivery time, e.g. 5 days"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[15px] outline-none transition focus:border-foreground/40"
                    />
                  </div>
                </div>
              ) : null}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {onDuplicate && (
                  <button type="button" onClick={onDuplicate} className={chip}>
                    <Copy className="h-4 w-4" /> Duplicate
                  </button>
                )}
                <button
                  type="button"
                  onClick={onRemove}
                  className={`${chip} ml-auto text-red-500 hover:bg-red-500/[0.06]`}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Inclusions({
  features,
  max,
  premium,
  onChange,
}: {
  features: string[];
  max: number;
  premium: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = features.length >= max;
  const add = () => {
    const text = draft.trim().slice(0, RATE_TEXT.feature);
    if (!text || full) return;
    onChange([...features, text]);
    setDraft("");
  };
  return (
    <div>
      <FieldLabel text="What's included" count={`${features.length}/${max}`} />
      <ul className="mt-1.5 space-y-1.5">
        <AnimatePresence initial={false}>
          {features.map((f, i) => (
            <motion.li
              key={i}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.22, ease }}
              className="flex items-center gap-2 rounded-xl border border-border bg-card pl-2.5 pr-1"
            >
              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#cc208f]/12 text-[#cc208f]">
                <Check className="h-[11px] w-[11px]" />
              </span>
              <input
                value={f}
                maxLength={RATE_TEXT.feature}
                onChange={(e) => onChange(features.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
                aria-label={`Inclusion ${i + 1}`}
              />
              <button
                type="button"
                aria-label="Remove"
                onClick={() => onChange(features.filter((_, j) => j !== i))}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {!full ? (
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-dashed border-border pl-2.5 pr-1 transition focus-within:border-foreground/40">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={draft}
            maxLength={RATE_TEXT.feature}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={features.length ? "Add another" : "e.g. 2 rounds of revisions"}
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
          />
          <AnimatePresence>
            {draft.trim() && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={add}
                className="h-8 shrink-0 rounded-full bg-foreground px-3 text-[12.5px] font-semibold text-background"
              >
                Add
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      ) : (
        !premium && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            PRO lists up to {RATE_LIMITS.pro.features} inclusions per tier.{" "}
            <Link to="/app/premium" className="font-semibold text-[#cc208f]">
              Go PRO
            </Link>
          </p>
        )
      )}
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────── */

/** A locked peek at PRO tiers for free plans. */
function ProUpsell({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/app/premium"
      className={`group relative block overflow-hidden rounded-2xl border border-border bg-card p-4 transition hover:border-[#cc208f]/40 ${className}`}
    >
      <div aria-hidden className="pointer-events-none flex gap-1.5 opacity-70 [mask-image:linear-gradient(90deg,#000_55%,transparent)]">
        {["Basic", "Pro", "Premium"].map((n, i) => (
          <div
            key={n}
            className={`h-[68px] flex-1 rounded-xl border p-2 transition duration-500 group-hover:-translate-y-0.5 ${
              i === 1 ? "border-[#cc208f]/60 bg-[#cc208f]/[0.08]" : "border-border bg-background"
            }`}
            style={{ transitionDelay: `${i * 60}ms` }}
          >
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{n}</p>
            <span className="mt-1.5 block h-2.5 w-3/5 rounded-full bg-foreground/20" />
            <span className="mt-1.5 block h-1.5 w-4/5 rounded-full bg-foreground/10" />
            <span className="mt-1 block h-1.5 w-2/3 rounded-full bg-foreground/10" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: PINK }}>
          <Crown className="h-4 w-4 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            Tiered rate cards <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
          <span className="block text-[12px] leading-snug text-muted-foreground">
            Basic, Pro and Premium side by side, a “Most popular” pick and delivery times.
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-[#cc208f]/12 px-2.5 py-1 text-[11px] font-bold text-[#cc208f]">PRO</span>
      </div>
    </Link>
  );
}

function PillToggle({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition active:scale-[0.98] disabled:opacity-40 ${
        on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      <motion.span
        initial={false}
        animate={{ width: on ? 14 : 0, opacity: on ? 1 : 0 }}
        transition={{ duration: 0.2, ease }}
        className="inline-flex overflow-hidden"
      >
        <Check className="h-3.5 w-3.5 shrink-0" />
      </motion.span>
      {children}
    </button>
  );
}

function FieldLabel({ text, count }: { text: string; count?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="text-[13px] font-medium text-muted-foreground">{text}</span>
      {count && <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground/70">{count}</span>}
    </div>
  );
}

const chip =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13.5px] font-medium transition hover:bg-foreground/[0.04] active:scale-[0.98]";
const field =
  "mt-1.5 h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3.5 text-[16px] outline-none transition focus:border-foreground/40";
