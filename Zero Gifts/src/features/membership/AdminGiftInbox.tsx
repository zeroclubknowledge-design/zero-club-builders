import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { giftStatus, giftType, type AdminUserGift } from "./giftCatalog";
import { formatNaira } from "./plans";
import { toast } from "sonner";

export function AdminGiftInbox({ userId }: { userId?: string }) {
  const client = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const gifts = useQuery({
    queryKey: ["admin-gift-inbox", userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_user_gifts").select("*").eq("recipient_id", userId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as AdminUserGift[];
    }, refetchInterval: 30_000,
  });
  const claim = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("claim_admin_user_gift", { p_gift_id: id });
      if (error) throw error;
      return data as { status: string };
    },
    onSuccess: async result => {
      await Promise.all(["admin-gift-inbox", "admin-user-gifts", "my_profile", "profile", "gift-card-profile", "available-restricted-zero-gifts", "zero-gift-balance", "wallet", "admin", "admin-dashboard-snapshot"].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast[result.status === "expired" ? "error" : "success"](result.status === "expired" ? "This gift’s claim deadline has passed." : result.status === "already_claimed" ? "You already claimed this gift." : "Gift claimed! It’s now available in your account.");
    },
  });
  if (gifts.isLoading) return <div role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking gifts from Zero Club…</div>;
  if (gifts.isError) return <p role="alert" className="p-4 text-sm text-muted-foreground">Could not load your gifts. <button className="underline" onClick={() => gifts.refetch()}>Try again</button></p>;
  if (!gifts.data?.length) return null;
  const pending = gifts.data.filter(gift => giftStatus(gift, now) === "pending");
  const past = gifts.data.filter(gift => giftStatus(gift, now) !== "pending");
  return <section aria-label="Gifts from Zero Club" className="min-w-0 rounded-2xl border border-primary/20 bg-card p-4 text-left sm:p-5">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Gift className="h-5 w-5 text-primary" />Gifts from Zero Club</h2>
    {pending.length > 0 && <p className="mt-1 text-sm text-muted-foreground">A little support for your next step. Claim before the deadline.</p>}
    <div className="mt-4 space-y-3">{[...pending, ...(showHistory ? past : [])].map(gift => {
      const status = giftStatus(gift, now);
      const type = giftType(gift.kind);
      const value = gift.kind === "zp" ? `${Number(gift.amount).toLocaleString()} ZP` : formatNaira(Number(gift.amount));
      return <article key={gift.id} className="min-w-0 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{value} · {type?.label}</h3><span className="text-xs capitalize text-muted-foreground">{status}</span></div>
        {gift.message && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{gift.message}</p>}
        <p className="mt-2 text-sm leading-5 text-muted-foreground">{status === "pending" ? type?.description : status === "claimed" ? "Claimed and added to your account." : "The claim deadline passed before this gift was claimed."}</p>
        <p className="mt-2 text-xs text-muted-foreground">Claim by {new Date(gift.claim_deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
        {claim.isError && claim.variables === gift.id && <p role="alert" className="mt-3 text-sm text-destructive">{(claim.error as Error).message}</p>}
        {status === "pending" && <button disabled={claim.isPending} onClick={() => claim.mutate(gift.id)} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-40">{claim.isPending && claim.variables === gift.id && <Loader2 className="h-4 w-4 animate-spin" />}Claim gift</button>}
      </article>;
    })}</div>
    {past.length > 0 && <button onClick={() => setShowHistory(value => !value)} aria-expanded={showHistory} className="mt-4 min-h-10 text-sm font-medium text-primary">{showHistory ? "Hide past gifts" : `View ${past.length} past ${past.length === 1 ? "gift" : "gifts"}`}</button>}
  </section>;
}
