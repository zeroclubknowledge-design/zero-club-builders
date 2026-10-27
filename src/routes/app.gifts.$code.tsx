import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Gift, Loader2, ShieldCheck, X } from "@/components/icons/glyphs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { GiftCardVisual, giftServices } from "@/components/GiftCardVisual";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { GiftClaimDeadline } from "@/components/GiftClaimDeadline";
import { giftClaimDeadline, giftClaimExpired, giftClaimNotice, giftClaimRefreshInterval } from "@/lib/giftClaimExpiry";

/** "Only for any bootcamp in Club A · Bootcamp X" — whichever limits the gift has. */
function scopeText(card: any) {
  const clubs: string[] = (card?.clubs || []).map((c: any) => (typeof c === "string" ? c : c?.name)).filter(Boolean);
  const camps: string[] = (card?.bootcamps || []).map((c: any) => c?.title).filter(Boolean);
  const parts = [clubs.length ? `any bootcamp in ${clubs.join(", ")}` : "", camps.length ? camps.join(", ") : ""].filter(Boolean);
  return parts.length ? `Only for ${parts.join(" · ")}` : "";
}

export const Route = createFileRoute("/app/gifts/$code")({ component: ClaimGiftPage });

function ClaimGiftPage() {
  const client = useQueryClient();
  const { code } = Route.useParams();
  const { format } = useWalletCurrency();
  const [claimedCard, setClaimedCard] = useState<any>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["gift-card", code],
    refetchInterval: query => query.state.data?.card?.expired ? false : giftClaimRefreshInterval(query.state.data?.card),
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc("get_gift_card_v2", { gift_code: code });
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
      for (const key of ["profile", "zero-gift-balance", "available-restricted-zero-gifts", "gift-card", "unclaimed-gifts", "unclaimed-gift-count"]) void client.invalidateQueries({ queryKey: [key] });
      if (giftClaimExpired(card)) toast.error("Your claim deadline has passed. Each account can claim this gift only once.");
      else toast.success("Gift claimed successfully.", { description: giftClaimNotice(card), duration: 15000 });
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
  const alreadyClaimed = !!data.card.my_claim_id;
  const claimState = alreadyClaimed ? data.card : claimedCard;
  const claimExpiresAt = giftClaimDeadline(claimState);
  const unavailable = !alreadyClaimed && (data.card.expired || data.card.status !== "active" || data.card.claims_remaining === 0);
  const senderName = data.creator?.full_name || data.creator?.username || "A Zero Club member";
  const walletBacked = !card.expires_at && (card.service === "support" || card.service === "custom");
  const oneClub = card.service === "bootcamps" && data.card.clubs?.length === 1 && !data.card.bootcamps?.length ? data.card.clubs[0].id : null;
  const useHref = oneClub ? `/app/clubs/${oneClub}` : card.service === "bootcamps" ? "/app/bootcamps" : card.service === "zero-store" ? "/app/store" : card.service === "membership" ? "/app/premium" : card.service === "zero-ai" ? "/app/zero-ai" : walletBacked ? "/app/wallet" : "/app";

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col items-center bg-[#17181b] text-white">
      <header className="flex h-14 w-full max-w-[680px] items-center px-2 pt-[env(safe-area-inset-top)]">
        <Link to="/app/wallet" aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10">
          <X className="h-[22px] w-[22px]" />
        </Link>
      </header>
      <main className="zc-page-width flex w-full max-w-[420px] flex-1 flex-col items-center px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-center md:pb-10">{children}</main>
    </div>
  );

  const sender = (
    <div className="mt-4 grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full bg-white/10 text-[22px] font-semibold ring-4 ring-white/10">
      {data.creator?.avatar_url ? <img src={data.creator.avatar_url} alt="" className="h-full w-full object-cover" /> : senderName.charAt(0).toUpperCase()}
    </div>
  );

  if (claimedCard || alreadyClaimed) {
    if (data.card.expired || giftClaimExpired(claimState)) return shell(<><h1 className="mt-12 text-2xl font-semibold">Your gift claim has expired</h1><p className="mt-3 text-sm text-white/65">The deadline for using this claim has passed. Completely unused claims return to the available places for other members. Each account can claim once; your wallet money is unaffected.</p><Link to="/app/gifts" className="mt-6 rounded-full bg-white px-6 py-3 font-semibold text-black">Open gifts</Link></>);
    return shell(
      <>
        <span className="mt-6 grid h-12 w-12 place-items-center rounded-full bg-[#1a7f4b] text-white"><Check className="h-6 w-6" /></span>
        <h1 className="mt-4 font-display text-[24px] font-semibold leading-tight">
          {walletBacked ? `${format(Number(card.amount))} is in your wallet` : `You now have ${service?.label || card.service} credit`}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/65">
          {walletBacked
            ? "Spend it anywhere on Zero Club."
            : `Use your ${format(Number(card.amount))} at eligible checkouts. Gift credit pays first and your wallet covers any remainder.`}
        </p>
        <GiftClaimDeadline expiresAt={claimExpiresAt} />
        {!walletBacked && <p className="mt-2 text-sm font-semibold text-white">{format(Number(data.card.my_claim_remaining ?? card.remaining_amount ?? card.amount))} remaining</p>}
        {scopeText(data.card) && <p className="mt-2 text-xs text-white/65">{scopeText(data.card)}</p>}
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

  if (unavailable) return shell(<><h1 className="mt-12 text-2xl font-semibold">{data.card.expired ? "This gift has expired" : "This gift is no longer available"}</h1><p className="mt-3 text-sm text-white/60">{data.card.expired ? "The deadline for new claims has passed." : "All claims have been taken, or the creator closed this gift."}</p><Link to="/app/gifts" className="mt-6 rounded-full bg-white px-6 py-3 font-semibold text-black">Open gifts</Link></>);

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
      <p className="mt-3 text-xs text-white/65">{data.card.claims_remaining} of {data.card.quantity} claims left · one per account</p>
      {data.card.expires_at && <p className="mt-2 text-xs text-white/65">Claim and use before {new Date(data.card.expires_at).toLocaleString()}. Unused credit expires.</p>}
      {data.card.expires_at && <p className="mt-2 text-sm font-semibold text-white">Once claimed, use within 6 hours or before the gift expires, whichever comes first. Completely unused claims return to the available places.</p>}
      {scopeText(data.card) && <p className="mt-3 text-sm text-white/70">{scopeText(data.card)}</p>}
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
