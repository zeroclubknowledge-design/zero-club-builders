import { useQuery } from "@tanstack/react-query";
import { Check, Gift } from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";

export type RestrictedZeroGiftService =
  | "bootcamps"
  | "membership"
  | "zero-ai"
  | "tutor-session"
  | "zero-store";

export const zeroGiftBalanceQueryKey = (service: RestrictedZeroGiftService) => [
  "zero-gift-balance",
  service,
];

export function useZeroGiftBalance(service: RestrictedZeroGiftService, enabled = true) {
  const query = useQuery({
    queryKey: zeroGiftBalanceQueryKey(service),
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_zero_gift_balance", {
        p_service: service,
      });

      // Before the migration reaches an environment there is simply no gift
      // option. Checkout itself remains usable with the ordinary wallet.
      if (error) return { available: 0, giftCount: 0 };
      const result = data as { available?: unknown; gift_count?: unknown } | null;
      return {
        available: Math.max(0, Number(result?.available) || 0),
        giftCount: Math.max(0, Number(result?.gift_count) || 0),
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
}: {
  service: RestrictedZeroGiftService;
  amount: number;
  applied: boolean;
  onAppliedChange: (applied: boolean) => void;
  formatAmount: (amount: number) => string;
  dark?: boolean;
  enabled?: boolean;
}) {
  const { available, giftCount } = useZeroGiftBalance(service, enabled);
  if (!enabled || available <= 0) return null;

  const usable = amount > 0 ? Math.min(amount, available) : available;
  const shell = dark
    ? applied
      ? "border-[#f06ac3]/45 bg-[#cc208f]/15"
      : "border-white/12 bg-white/[0.045]"
    : applied
      ? "border-[#cc208f]/35 bg-[#cc208f]/[0.07]"
      : "border-border bg-card";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={applied}
      onClick={() => onAppliedChange(!applied)}
      className={`flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition ${shell}`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${applied ? "bg-[#cc208f] text-white" : dark ? "bg-white/10 text-[#f06ac3]" : "bg-[#cc208f]/10 text-[#cc208f]"}`}
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
              ? `${formatAmount(usable)} will be applied first`
              : "Will be applied to your next matching payment"
            : `${formatAmount(available)} available across ${giftCount} gift${giftCount === 1 ? "" : "s"}`}
        </span>
      </span>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${applied ? "border-[#cc208f] bg-[#cc208f] text-white" : dark ? "border-white/25" : "border-border"}`}
      >
        {applied && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}
