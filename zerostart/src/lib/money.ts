/**
 * Money, shown the way the Zero Club wallet shows it.
 *
 * Every amount in the database is in the wallet's base unit (Naira). An
 * ambassador picks the currency they want to see — Naira, Ghana cedis or US
 * dollars — and it is converted with exactly the same fixed rates the wallet
 * uses, so the number here and the number in the wallet always agree.
 */
export type PayoutCurrency = "NGN" | "GHS" | "USD";

export const CURRENCIES: Record<PayoutCurrency, { name: string; symbol: string; rate: number; locale: string; flag: string }> = {
  NGN: { name: "Nigerian Naira", symbol: "₦", rate: 1, locale: "en-NG", flag: "https://flagcdn.com/ng.svg" },
  GHS: { name: "Ghana Cedi", symbol: "GH₵", rate: 100, locale: "en-GH", flag: "https://flagcdn.com/gh.svg" },
  USD: { name: "US Dollar", symbol: "$", rate: 1500, locale: "en-US", flag: "https://flagcdn.com/us.svg" },
};

export const CURRENCY_ORDER: PayoutCurrency[] = ["NGN", "GHS", "USD"];

export function isCurrency(value: unknown): value is PayoutCurrency {
  return value === "NGN" || value === "GHS" || value === "USD";
}

/** A base (Naira) amount, formatted in the chosen currency. */
export function money(base: number | string | null | undefined, currency: PayoutCurrency = "NGN", compact = false) {
  const c = CURRENCIES[currency];
  const value = Number(base || 0) / c.rate;
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: currency === "NGN" ? 0 : value < 100 ? 2 : 0,
  }).format(value);
}
