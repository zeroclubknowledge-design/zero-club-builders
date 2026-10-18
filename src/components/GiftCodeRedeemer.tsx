import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "@/components/icons/glyphs";
import { toast } from "sonner";

export function GiftCodeRedeemer({ onClaim, dark = false, walletOnly = false }: { onClaim: () => void; dark?: boolean; walletOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const client = useQueryClient();
  const claim = useMutation({ mutationFn: async () => {
    if (walletOnly) {
      const { data: card, error } = await supabase.rpc("get_gift_card_v2", { gift_code: code.trim() });
      if (error) throw error;
      if (!["universal", "support", "custom"].includes((card as any)?.service)) throw new Error("Use an Any payment gift here. Purpose-bound gifts are used at their matching checkout.");
    }
    const { data, error } = await supabase.rpc("claim_gift_card", { gift_code: code.trim() });
    if (error) throw error; return data;
  }, onSuccess: () => {
    for (const key of ["zero-gift-balance", "available-restricted-zero-gifts", "profile", "gift-card-profile", "wallet", "wallet-balance"]) void client.invalidateQueries({ queryKey: [key] });
    setCode(""); onClaim(); toast.success("Gift ready. Eligible credit is applied first; your wallet covers the rest.");
  } });
  return <div className={`mt-2 text-sm ${dark ? "text-white/70" : "text-muted-foreground"}`}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-h-10 text-xs font-semibold underline underline-offset-4">Have a gift code?</button>
    {open && <div className="space-y-2"><div className="flex min-w-0 gap-2"><input aria-label="Gift code" placeholder="ZC-…" value={code} onChange={e => { setCode(e.target.value); claim.reset(); }} autoCapitalize="characters" autoComplete="off" className={`h-11 min-w-0 flex-1 rounded-lg border px-3 text-base outline-none sm:text-sm ${dark ? "border-white/20 bg-white/5" : "border-border bg-card"}`} /><button type="button" disabled={!code.trim() || claim.isPending} onClick={() => claim.mutate()} className="flex h-11 items-center gap-2 rounded-full bg-[#cc208f] px-4 text-xs font-semibold text-white disabled:opacity-40">{claim.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Redeem</button></div>{claim.isError && <p role="alert" className="text-xs text-destructive">{(claim.error as Error).message}</p>}<p className="text-xs">One claim per account. Any bootcamp restrictions still apply.</p></div>}
  </div>;
}
