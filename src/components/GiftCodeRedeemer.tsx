import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Check, ChevronDown, Gift, Loader2 } from "@/components/icons/glyphs";
import { toast } from "sonner";

/**
 * Redeem a Zero Card by its code.
 *
 * This used to be a small underlined "Have a gift code?" link, so people who
 * had just been sent a card could stand on a checkout screen and not find it.
 * It is now a card-shaped row with the same weight as the payment options
 * around it, always visible — including when the account has no gift credit,
 * which is exactly the state someone holding an unclaimed code is in.
 *
 * `walletOnly` is used on the wallet page: only codes that turn into ordinary
 * wallet balance are redeemed there, because a bootcamp-restricted card
 * claimed from the wallet would vanish into a balance it cannot be spent from.
 */
export function GiftCodeRedeemer({
  onClaim,
  dark = false,
  walletOnly = false,
}: {
  onClaim: () => void;
  dark?: boolean;
  walletOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const client = useQueryClient();

  const claim = useMutation({
    mutationFn: async () => {
      const value = code.replace(/\s+/g, "").toUpperCase();
      if (!value) throw new Error("Enter your gift code");
      if (walletOnly) {
        const { data: card, error } = await supabase.rpc("get_gift_card_v2", { gift_code: value });
        if (error) throw error;
        if (!["universal", "support", "custom"].includes((card as any)?.service))
          throw new Error("Use an Any payment gift here. Purpose-bound gifts are used at their matching checkout.");
      }
      const { data, error } = await supabase.rpc("claim_gift_card", { gift_code: value });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      for (const key of [
        "zero-gift-balance",
        "available-restricted-zero-gifts",
        "profile",
        "gift-card-profile",
        "wallet",
        "wallet-balance",
      ])
        void client.invalidateQueries({ queryKey: [key] });
      setCode("");
      setOpen(false);
      onClaim();
      toast.success("Gift ready. Eligible credit is applied first; your wallet covers the rest.");
    },
  });

  const openIt = () => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const shell = dark ? "border-white/12 bg-white/[0.045]" : "border-border bg-card";
  const iconShell = dark ? "bg-white/10 text-[#f06ac3]" : "bg-[#cc208f]/10 text-[#cc208f]";
  const title = dark ? "text-white" : "text-foreground";
  const muted = dark ? "text-white/55" : "text-muted-foreground";
  const field = dark
    ? "border-white/20 bg-white/[0.06] text-white placeholder:text-white/35 focus:border-[#f06ac3]/60"
    : "border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:border-[#cc208f]/50";

  return (
    <div className={`mt-2.5 overflow-hidden rounded-xl border transition-colors ${shell}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openIt())}
        aria-expanded={open}
        aria-controls="gift-code-panel"
        className="flex w-full items-center gap-3 p-3.5 text-left tap"
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${iconShell}`}>
          <Gift className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[12.5px] font-semibold ${title}`}>Have a gift code?</span>
          <span className={`mt-0.5 block text-[10.5px] ${muted}`}>
            Redeem a Zero Card someone sent you
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""} ${muted}`}
        />
      </button>

      {open && (
        <div id="gift-code-panel" className={`space-y-2.5 border-t px-3.5 pb-3.5 pt-3 ${dark ? "border-white/10" : "border-border/70"}`}>
          <form
            className="flex min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim() && !claim.isPending) claim.mutate();
            }}
          >
            <input
              ref={inputRef}
              aria-label="Gift code"
              placeholder="ZC-0000 0000 0000"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                claim.reset();
              }}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="done"
              className={`h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-[13px] uppercase tracking-[0.08em] outline-none transition-colors ${field}`}
            />
            <button
              type="submit"
              disabled={!code.trim() || claim.isPending}
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#cc208f] px-4 text-xs font-semibold text-white transition hover:bg-[#b41c7e] disabled:opacity-40"
            >
              {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
              Redeem
            </button>
          </form>
          {claim.isError && (
            <p role="alert" className="text-xs text-destructive">
              {(claim.error as Error).message}
            </p>
          )}
          <p className={`text-[11px] leading-relaxed ${muted}`}>
            One claim per account. Credit is tied to you and any bootcamp restrictions still apply.
          </p>
        </div>
      )}
    </div>
  );
}
