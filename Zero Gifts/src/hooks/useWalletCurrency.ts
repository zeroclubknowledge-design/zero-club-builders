import { useCallback, useSyncExternalStore } from "react";

export type WalletCurrency = "NGN" | "GHS" | "USD";

const STORAGE_KEY = "wallet_currency";
const CHANGE_EVENT = "zero-wallet-currency-change";

export const walletCurrencies: Record<WalletCurrency, { label: string; symbol: string; rate: number; locale: string; iconUrl: string }> = {
  NGN: { label: "NGN Wallet", symbol: "\u20a6", rate: 1, locale: "en-NG", iconUrl: "https://flagcdn.com/ng.svg" },
  GHS: { label: "GHS Wallet", symbol: "GH\u20b5", rate: 100, locale: "en-GH", iconUrl: "https://flagcdn.com/gh.svg" },
  USD: { label: "USD Wallet", symbol: "$", rate: 1500, locale: "en-US", iconUrl: "https://flagcdn.com/us.svg" },
};

export function getWalletCurrency(): WalletCurrency {
  if (typeof window === "undefined") return "NGN";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "USD" || stored === "GHS" ? stored : "NGN";
}

export function setWalletCurrency(currency: WalletCurrency) {
  window.localStorage.setItem(STORAGE_KEY, currency);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: currency }));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function formatWalletAmount(
  baseAmount: number,
  currency: WalletCurrency = getWalletCurrency(),
  options: { maximumFractionDigits?: number; notation?: "standard" | "compact" } = {},
) {
  const details = walletCurrencies[currency];
  const converted = Number(baseAmount || 0) / details.rate;
  return new Intl.NumberFormat(details.locale, {
    style: "currency",
    currency,
    notation: options.notation || "standard",
    maximumFractionDigits: options.maximumFractionDigits ?? (currency === "NGN" ? 0 : 2),
  }).format(converted);
}

export function useWalletCurrency() {
  const currency = useSyncExternalStore(subscribe, getWalletCurrency, () => "NGN" as WalletCurrency);
  const details = walletCurrencies[currency];
  const format = useCallback(
    (baseAmount: number, options?: { maximumFractionDigits?: number; notation?: "standard" | "compact" }) =>
      formatWalletAmount(baseAmount, currency, options),
    [currency],
  );

  return {
    currency,
    details,
    format,
    setCurrency: setWalletCurrency,
    toBaseAmount: (displayAmount: number) => Number(displayAmount || 0) * details.rate,
    fromBaseAmount: (baseAmount: number) => Number(baseAmount || 0) / details.rate,
  };
}
