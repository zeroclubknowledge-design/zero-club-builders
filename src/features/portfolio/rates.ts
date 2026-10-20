/**
 * Rate card: what the owner charges, written by the owner.
 *
 * Every plan gets one rate. PRO members can lay out up to four tiers
 * (Basic, Pro, Premium…), mark one as most popular and add delivery times.
 * The server enforces the tier limit and hides extra tiers when a
 * membership lapses; the helpers here mirror that so the preview matches.
 */

export const RATE_UNITS = ["project", "hour", "day", "week", "month", "session", "post"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  project: "per project",
  hour: "per hour",
  day: "per day",
  week: "per week",
  month: "per month",
  session: "per session",
  post: "per post",
};

/** Short suffix shown after a price: ₦50,000 / project. */
export const RATE_UNIT_SHORT: Record<RateUnit, string> = {
  project: "project",
  hour: "hr",
  day: "day",
  week: "week",
  month: "month",
  session: "session",
  post: "post",
};

export const CURRENCIES = [
  { code: "NGN", symbol: "₦" },
  { code: "USD", symbol: "$" },
  { code: "GBP", symbol: "£" },
  { code: "EUR", symbol: "€" },
  { code: "GHS", symbol: "₵" },
  { code: "KES", symbol: "KSh" },
  { code: "ZAR", symbol: "R" },
  { code: "CAD", symbol: "CA$" },
] as const;

export type RateTier = {
  id: string;
  name: string;
  /** Whole amount in the card's currency; null until set. */
  price: number | null;
  unit: RateUnit;
  /** "From ₦50,000" rather than a fixed price. */
  from?: boolean;
  /** Show "Custom quote" instead of a price. */
  custom?: boolean;
  summary?: string;
  features: string[];
  /** PRO: e.g. "5 days". */
  turnaround?: string;
  /** PRO: the "Most popular" tier. One at most. */
  highlight?: boolean;
};

export type RateCard = {
  currency: string;
  /** A footnote: deposits, taxes, what's not included. */
  note?: string;
  tiers: RateTier[];
};

export const RATE_LIMITS = {
  free: { tiers: 1, features: 3 },
  pro: { tiers: 4, features: 8 },
} as const;

export const RATE_TEXT = { name: 40, summary: 160, feature: 80, turnaround: 30, note: 200 } as const;

export function newTierId() {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function newTier(name = "", patch: Partial<RateTier> = {}): RateTier {
  return { id: newTierId(), name, price: null, unit: "project", features: [], ...patch };
}

/** The three-tier starting point offered to PRO members. */
export function proPreset(): RateTier[] {
  return [
    newTier("Basic", { summary: "The essentials, done well." }),
    newTier("Pro", { summary: "Everything in Basic, and more.", highlight: true }),
    newTier("Premium", { summary: "The full package, end to end." }),
  ];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Reads whatever is stored into a well-formed card (or null when there is none). */
export function normaliseRateCard(raw: unknown): RateCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const currency = CURRENCIES.some((c) => c.code === r.currency) ? (r.currency as string) : "NGN";
  const tiers = (Array.isArray(r.tiers) ? r.tiers : []).slice(0, RATE_LIMITS.pro.tiers).map((t) => {
    const o = (t || {}) as Record<string, unknown>;
    const price = typeof o.price === "number" && Number.isFinite(o.price) && o.price >= 0 ? Math.round(o.price) : null;
    return {
      id: typeof o.id === "string" && o.id ? o.id : newTierId(),
      name: str(o.name, RATE_TEXT.name),
      price,
      unit: (RATE_UNITS as readonly string[]).includes(o.unit as string) ? (o.unit as RateUnit) : "project",
      from: o.from === true,
      custom: o.custom === true,
      summary: str(o.summary, RATE_TEXT.summary),
      features: (Array.isArray(o.features) ? o.features : [])
        .map((f) => str(f, RATE_TEXT.feature))
        .slice(0, RATE_LIMITS.pro.features),
      turnaround: str(o.turnaround, RATE_TEXT.turnaround),
      highlight: o.highlight === true,
    } satisfies RateTier;
  });
  return { currency, note: str(r.note, RATE_TEXT.note), tiers };
}

/** A tier is ready to show once it has a name and either a price or "custom quote". */
export const tierReady = (t: RateTier) => t.name.trim().length > 0 && (t.custom || t.price != null);

/** The tiers a visitor sees, trimmed to what the owner's plan allows. */
export function visibleTiers(card: RateCard | null, premium: boolean): RateTier[] {
  if (!card) return [];
  const limits = premium ? RATE_LIMITS.pro : RATE_LIMITS.free;
  return card.tiers
    .slice(0, limits.tiers)
    .filter(tierReady)
    .map((t) => ({
      ...t,
      features: t.features.map((f) => f.trim()).filter(Boolean).slice(0, limits.features),
      highlight: premium ? t.highlight : false,
      turnaround: premium ? t.turnaround : "",
    }));
}

export function currencySymbol(code: string) {
  return CURRENCIES.find((c) => c.code === code)?.symbol || code;
}

export function formatPrice(code: string, amount: number) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencySymbol(code)}${amount.toLocaleString("en")}`;
  }
}
