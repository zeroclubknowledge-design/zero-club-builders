import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Gift, Loader2, ShieldCheck, X } from "@/components/icons/glyphs";
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

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-[#17181b]"><Loader2 className="h-7 w-7 animate-spin text-white/60" /></div>;
  if (isError || !data?.card) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.06]"><Gift className="h-5 w-5" /></div>
        <h1 className="mt-4 font-display text-[20px] font-semibold">Zero Card unavailable</h1>
        <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">This link is invalid, has expired, or the card has already been claimed.</p>
        <Link to="/app/wallet" className="mt-5 flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">Open wallet</Link>
      </div>
    );
  }

  const card = claimedCard || data.card;
  const service = giftServices.find((item) => item.id === card.service);
  const alreadyClaimed = data.card.status === "claimed";
  const senderName = data.creator?.full_name || data.creator?.username || "A Zero Club member";
  const walletBacked = card.service === "support" || card.service === "custom";
  const useHref = card.service === "bootcamps" ? "/app/bootcamps" : card.service === "zero-store" ? "/app/store" : card.service === "membership" ? "/app/premium" : card.service === "zero-ai" ? "/app/zero-ai" : walletBacked ? "/app/wallet" : "/app";

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col items-center bg-[#17181b] text-white">
      <header className="flex h-14 w-full max-w-[680px] items-center px-2 pt-[env(safe-area-inset-top)]">
        <Link to="/app/wallet" aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10">
          <X className="h-[22px] w-[22px]" />
        </Link>
      </header>
      <main className="flex w-full max-w-[420px] flex-1 flex-col items-center px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-center md:pb-10">{children}</main>
    </div>
  );

  const sender = (
    <div className="mt-4 grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full bg-white/10 text-[22px] font-semibold ring-4 ring-white/10">
      {data.creator?.avatar_url ? <img src={data.creator.avatar_url} alt="" className="h-full w-full object-cover" /> : senderName.charAt(0).toUpperCase()}
    </div>
  );

  if (claimedCard || alreadyClaimed) {
    return shell(
      <>
        <span className="mt-6 grid h-12 w-12 place-items-center rounded-full bg-[#1a7f4b] text-white"><Check className="h-6 w-6" /></span>
        <h1 className="mt-4 font-display text-[24px] font-semibold leading-tight">
          {walletBacked ? `${format(Number(card.amount))} is in your wallet` : `You now have ${service?.label || card.service} credit`}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/65">
          {walletBacked
            ? "Spend it anywhere on Zero Club."
            : `Your ${format(Number(card.amount))} is locked to ${service?.description?.toLowerCase() || card.service} and can't be spent elsewhere.`}
        </p>
        <div className="mt-7 w-full">
          <GiftCardVisual amount={card.amount} service={card.service} templateId={card.template_id} code={card.code} message={card.message} />
        </div>
        <div className="mt-auto w-full pt-8">
          <Link to={useHref} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-[#17181b]">
            {walletBacked ? "Open wallet" : "Use it now"} <ArrowRight className="h-4 w-4" />
          </Link>
          {data.creator?.id && (
            <Link to="/app/chat/$id" params={{ id: data.creator.id }} className="mt-2.5 flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-white/75 hover:text-white">
              Say thanks to {senderName.split(" ")[0]}
            </Link>
          )}
        </div>
      </>,
    );
  }

  return shell(
    <>
      {sender}
      <p className="mt-3 text-[15px] text-white/70">{senderName} sent you a Zero Card</p>
      <div className="mt-7 w-full -rotate-2">
        <GiftCardVisual amount={card.amount} service={card.service} templateId={card.template_id} code={card.code} message={card.message} />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2 text-[13px]">
        <span className="flex h-7 items-center rounded-full bg-white/10 px-3">Use for: {service?.label || card.service}</span>
      </div>
      <p className="mt-4 flex items-start gap-2 text-left text-[13px] leading-relaxed text-white/55">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        {walletBacked
          ? "Once claimed, this is ordinary wallet balance — spend it anywhere on Zero Club."
          : "This claim is tied to your account and can't be transferred after you claim it."}
      </p>
      <div className="mt-auto w-full pt-8">
        <button onClick={() => claimGift.mutate()} disabled={claimGift.isPending} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-[#17181b] disabled:opacity-60">
          {claimGift.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : `Claim ${format(Number(card.amount))}`}
        </button>
        {data.creator?.id && (
          <Link to="/app/chat/$id" params={{ id: data.creator.id }} className="mt-2.5 flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold text-white/75 hover:text-white">
            Say thanks first
          </Link>
        )}
      </div>
    </>,
  );
}
