import { useQuery } from "@tanstack/react-query";
import { Coins, Info, Lock } from "@/components/icons/glyphs";
import { draughtStakeInfo, isMissingFeature } from "./api";

export const STAKE_STEPS = [0, 100, 250, 500, 1000] as const;

/**
 * Choose the ZP stake for a new friend match.
 *
 * Only "settled" ZP can be staked: anything earned in the last 7 days is
 * locked (see the draught_watch_and_stakes migration), so the picker shows
 * what is actually available, not the whole balance, and greys out amounts
 * the player can't cover. Hidden entirely when the server has no stakes yet.
 */
export function StakePicker({ value, onChange }: { value: number; onChange: (stake: number) => void }) {
  const info = useQuery({ queryKey: ["draught-stake-info"], queryFn: draughtStakeInfo, retry: false, staleTime: 30_000 });
  if (info.error && isMissingFeature(info.error)) return null;
  const stakeable = info.data?.stakeable ?? 0;
  const ready = info.data?.account_ready ?? true;

  return (
    <div className="mt-4 rounded-2xl border border-[#ffca75]/20 bg-[linear-gradient(135deg,rgba(255,202,117,0.10),rgba(253,73,176,0.06))] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[#ffca75]">
          <Coins className="h-3.5 w-3.5" /> Stake ZP
        </p>
        <p className="text-[11.5px] text-white/50">
          {info.isPending ? "Checking balance…" : `${stakeable.toLocaleString()} ZP available`}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Stake">
        {STAKE_STEPS.map((step) => {
          const blocked = step > 0 && (!ready || step > stakeable);
          const on = value === step;
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={blocked}
              onClick={() => onChange(step)}
              className={`relative min-h-11 rounded-xl text-[13px] font-bold tabular-nums transition active:scale-95 disabled:opacity-30 ${
                on
                  ? "bg-[#ffca75] text-[#1b0f12] shadow-[0_10px_24px_-12px_rgba(255,202,117,0.9)]"
                  : "bg-white/[0.06] text-white ring-1 ring-white/10 hover:bg-white/10"
              }`}
            >
              {step === 0 ? "Free" : step >= 1000 ? "1k" : step}
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-white/50">
        {!ready ? (
          <><Lock className="mt-px h-3.5 w-3.5 shrink-0" /> Staked matches open 7 days after you join Zero Club.</>
        ) : value > 0 ? (
          <><Info className="mt-px h-3.5 w-3.5 shrink-0" /> Your {value} ZP is held now. The winner takes {value * 2} ZP. A draw or a cancelled invite returns it.</>
        ) : (
          <><Info className="mt-px h-3.5 w-3.5 shrink-0" /> ZP earned in the last 7 days can't be staked yet.</>
        )}
      </p>
    </div>
  );
}
