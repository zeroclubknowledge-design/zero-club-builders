import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Gift, Loader2, ShieldCheck } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { GiftCardVisual, giftServices } from "@/components/GiftCardVisual";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

export const Route = createFileRoute("/app/gifts/$code")({ component: ClaimGiftPage });

function ClaimGiftPage() {
  const { code } = Route.useParams();
  const { format } = useWalletCurrency();
  const [claimedCard, setClaimedCard] = useState<any>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["gift-card", code],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc("get_gift_card", { gift_code: code });
      const card = Array.isArray(result) ? result[0] : result;
      if (error || !card) throw error || new Error("Gift card not found");
      const { data: creator } = await supabase.from("profiles").select("id, username, full_name, avatar_url").eq("id", card.creator_id).maybeSingle();
      return { card, creator };
    },
  });

  const claimGift = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.rpc("claim_gift_card", { gift_code: code });
      if (error) throw error;
      return Array.isArray(result) ? result[0] : result;
    },
    onSuccess: (card) => {
      setClaimedCard(card);
      toast.success("Gift claimed successfully.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (isError || !data?.card) return <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center"><div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10"><Gift className="h-5 w-5 text-primary" /></div><h1 className="mt-4 text-[18px] font-semibold">Gift unavailable</h1><p className="mt-2 max-w-sm text-[13px] text-muted-foreground">This gift link is invalid, expired, or has already been claimed.</p><Link to="/app/wallet" className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground">Open wallet</Link></div>;

  const card = claimedCard || data.card;
  const service = giftServices.find((item) => item.id === card.service);
  const alreadyClaimed = data.card.status === "claimed";

  if (claimedCard || alreadyClaimed) {
    return (
      <div className="min-h-screen bg-background px-4 py-[calc(3rem+env(safe-area-inset-top))] text-center md:px-7">
        <main className="mx-auto flex max-w-[760px] flex-col items-center"><div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check className="h-6 w-6" /></div><p className="mt-4 text-[10px] font-semibold uppercase text-primary">Gift claimed</p><h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">You now have access to {service?.label || card.service}.</h1><p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">Your {format(Number(card.amount))} gift entitlement is locked to {service?.description?.toLowerCase() || card.service}. It cannot be spent elsewhere.</p><div className="mt-7 w-full max-w-[520px]"><GiftCardVisual amount={card.amount} service={card.service} templateId={card.template_id} code={card.code} message={card.message} /></div><Link to={card.service === "bootcamps" ? "/app/bootcamps" : card.service === "zero-store" ? "/app/store" : card.service === "membership" ? "/app/premium" : card.service === "zero-ai" ? "/app/zero-ai" : "/app"} className="mt-7 flex h-12 w-full max-w-[520px] items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground">Use your gift<ArrowRight className="h-4 w-4" /></Link></main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] md:px-7 md:pt-10">
      <main className="mx-auto grid min-w-0 max-w-[920px] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
        <section className="min-w-0"><p className="text-[10px] font-semibold uppercase text-primary">A Zero Club Gift for you</p><h1 className="mt-3 font-display text-[27px] font-semibold leading-tight tracking-tight sm:text-[40px]">Someone is backing your next step.</h1><p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted-foreground sm:text-[14px]">{data.creator?.full_name || data.creator?.username || "A Zero Club member"} sent you restricted credit for {service?.label || card.service}. Claim it once and use it only for that purpose.</p><div className="mt-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[0.045] p-3.5 sm:mt-6 sm:p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-[11.5px] leading-relaxed text-muted-foreground sm:text-[12px]">This claim is tied to your current Zero Club account and cannot be transferred after claiming.</p></div></section>
        <aside className="w-full min-w-0 border-t border-border pt-6 lg:border-0 lg:pt-0"><div className="mx-auto w-full max-w-[520px]"><GiftCardVisual amount={card.amount} service={card.service} templateId={card.template_id} code={card.code} message={card.message} /><button onClick={() => claimGift.mutate()} disabled={claimGift.isPending} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground disabled:opacity-50 sm:mt-4">{claimGift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Claim gift card<ArrowRight className="h-4 w-4" /></>}</button></div></aside>
      </main>
    </div>
  );
}
