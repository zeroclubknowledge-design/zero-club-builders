import { useState } from "react";
import { CURRENCIES, CURRENCY_ORDER, type PayoutCurrency } from "@/lib/money";
import { setPayoutCurrency } from "@/lib/campaignApi";

/** Naira, cedis or dollars — how this ambassador sees (and is paid) their earnings. */
export function CurrencyPicker({ value, onChange }: { value: PayoutCurrency; onChange: (c: PayoutCurrency) => void }) {
  const [saving, setSaving] = useState<PayoutCurrency | null>(null);

  const pick = async (c: PayoutCurrency) => {
    if (c === value || saving) return;
    setSaving(c);
    try {
      const res = await setPayoutCurrency(c);
      if (res.ok) onChange(c);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payout currency">
      {CURRENCY_ORDER.map((c) => {
        const active = c === value;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(c)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-ink text-white" : "zs-inset text-ink hover:bg-ink/[0.04]"} ${saving === c ? "opacity-60" : ""}`}
          >
            <img src={CURRENCIES[c].flag} alt="" className="h-4 w-6 shrink-0 rounded-[3px] object-cover" />
            <span className="min-w-0">
              <span className="block text-[13px] font-bold leading-tight">{c}</span>
              <span className={`block truncate text-[10.5px] ${active ? "text-white/60" : "text-ink-faint"}`}>{CURRENCIES[c].symbol}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
