import { useQuery } from "@tanstack/react-query";
import { Check, Gift } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { GiftCodeRedeemer } from "./GiftCodeRedeemer";
import { useUser } from "@/hooks/useUser";

export type RestrictedZeroGiftService =
  | "bootcamps"
  | "membership"
  | "zero-ai"
  | "tutor-session"
  | "zero-store"
  | "universal";

export const zeroGiftBalanceQueryKey = (service: RestrictedZeroGiftService, bootcampId?: string) => [
  "zero-gift-balance",
  service,
  ...(bootcampId ? [bootcampId] : []),
];

export function useZeroGiftBalance(service: RestrictedZeroGiftService, enabled = true, bootcampId?: string) {
  const { data: user } = useUser();
  const query = useQuery({
    queryKey: [...zeroGiftBalanceQueryKey(service, bootcampId), user?.id],
    enabled: enabled && !!user?.id,
    retry: false,
    refetchInterval: query => Math.max(500, Math.min(60_000, query.state.data?.expiresAt ? Date.parse(query.state.data.expiresAt) - Date.now() + 50 : 60_000)),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_zero_gift_balance_v2", {
        p_service: service,
        p_bootcamp_id: bootcampId || null,
      });

      // Before the migration reaches an environment there is simply no gift
      // option. Checkout itself remains usable with the ordinary wallet.
      if (error) return { available: 0, giftCount: 0, expiresAt: null as string | null };
      const result = data as { available?: unknown; gift_count?: unknown; next_expiry?: string | null } | null;
      return {
        available: Math.max(0, Number(result?.available) || 0),
        giftCount: Math.max(0, Number(result?.gift_count) || 0),
        expiresAt: result?.next_expiry || null,
      };
    },
  });

  return {
    ...query,
    available: query.data?.available || 0,
    giftCount: query.data?.giftCount || 0,
  };
}

export function ZeroGiftPaymentOption({
  service,
  amount,
  applied,
  onAppliedChange,
  formatAmount,
  dark = false,
  enabled = true,
  bootcampId,
}: {
  service: RestrictedZeroGiftService;
  amount: number;
  applied: boolean;
  onAppliedChange: (applied: boolean) => void;
  formatAmount: (amount: number) => string;
  dark?: boolean;
  enabled?: boolean;
  bootcampId?: string;
}) {
  const { available, giftCount } = useZeroGiftBalance(service, enabled, bootcampId);
  if (!enabled) return null;

  const usable = amount > 0 ? Math.min(amount, available) : available;
  const shell = dark
    ? applied
      ? "border-[#ee64b3]/45 bg-[#c3217e]/15"
      : "border-white/12 bg-white/[0.045]"
    : applied
      ? "border-[#c3217e]/35 bg-[#c3217e]/[0.07]"
      : "border-border bg-card";

  return (
    <div>{available > 0 && <button
      type="button"
      role="checkbox"
      aria-checked={applied}
      onClick={() => onAppliedChange(!applied)}
      className={`flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition ${shell}`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${applied ? "bg-[#c3217e] text-white" : dark ? "bg-white/10 text-[#ee64b3]" : "bg-[#c3217e]/10 text-[#c3217e]"}`}
      >
        <Gift className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[12.5px] font-semibold ${dark ? "text-white" : "text-foreground"}`}
        >
          Apply Zero Gift
        </span>
        <span
          className={`mt-0.5 block text-[10.5px] ${dark ? "text-white/55" : "text-muted-foreground"}`}
        >
          {applied
            ? amount > 0
              ? `${formatAmount(usable)} gift + ${formatAmount(Math.max(0, amount - usable))} from your wallet`
              : "Will be applied to your next matching payment"
            : `${formatAmount(available)} available across ${giftCount} gift${giftCount === 1 ? "" : "s"}`}
        </span>
      </span>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${applied ? "border-[#c3217e] bg-[#c3217e] text-white" : dark ? "border-white/25" : "border-border"}`}
      >
        {applied && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>}<GiftCodeRedeemer dark={dark} onClaim={() => onAppliedChange(true)} /></div>
  );
}
