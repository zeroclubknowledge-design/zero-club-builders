import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Gift, Loader2, Share2, ShieldCheck } from "@/components/icons/glyphs";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { GiftCardVisual, giftServices, giftTemplates } from "@/components/GiftCardVisual";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { shareOrCopy, giftLinkUrl } from "@/lib/share";

const GIFT_SERVICE_DESTINATIONS: Record<string, { href?: string; action: string }> = {
  bootcamps: { href: "/app/bootcamps", action: "Use for a bootcamp" },
  membership: { href: "/app/premium", action: "Use for membership" },
  "zero-ai": { href: "/app/zero-ai", action: "View Zero AI" },
  "tutor-session": { action: "Ready for tutor sessions" },
  "zero-store": { href: "/app/store", action: "Shop Zero Store" },
};

export const Route = createFileRoute("/app/gifts/")({ component: GiftCardsPage });

function GiftCardsPage() {
  const [amount, setAmount] = useState("");
  const [templateId, setTemplateId] = useState("signature");
  const [service, setService] = useState("bootcamps");
  const [message, setMessage] = useState("");
  const [customPurpose, setCustomPurpose] = useState("");
  const [createdCard, setCreatedCard] = useState<any>(null);
  const { details: currencyDetails, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const displayAmount = Number(amount) || 0;
  const numericAmount = toBaseAmount(displayAmount);

  const { data: profile } = useQuery({
    queryKey: ["gift-card-profile"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from("profiles").select("id, username, coins").eq("id", session.user.id).single();
      return data;
    },
  });

  /* Only the count here — the cards themselves live on their own page.
     Creating a gift debits the wallet immediately, so an unshared card is real
     money sitting idle; the button has to say so plainly. */
  const { data: unclaimedCount = 0, refetch: refetchUnclaimed } = useQuery({
    queryKey: ["unclaimed-gift-count", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("gift_cards")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", profile!.id)
        .eq("status", "active");
      return count || 0;
    },
  });

  const { data: availableGifts = [] } = useQuery({
    queryKey: ["available-restricted-zero-gifts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_cards")
        .select("id, code, amount, remaining_amount, service, template_id, message, claimed_at")
        .eq("claimed_by", profile!.id)
        .eq("status", "claimed")
        .gt("remaining_amount", 0)
        .order("claimed_at", { ascending: false });
      // Before the restricted-gift migration reaches a deployment, keep the
      // Gifts page usable. Other failures should still surface to monitoring.
      if (error && ["42703", "PGRST204"].includes(error.code || "")) return [];
      if (error) throw error;
      return data || [];
    },
  });

  const shareGift = (card: any) => {
    const label = giftServices.find((item) => item.id === card.service)?.label || card.service;
    shareOrCopy({
      title: "A Zero Card for you",
      text: `You received a ${format(Number(card.amount))} Zero Card — ${label}.`,
      url: giftLinkUrl(card.code),
      copiedMessage: "Gift link copied",
    });
  };

  const createGift = useMutation({
    mutationFn: async () => {
      if (numericAmount <= 0) throw new Error("Enter a valid gift amount.");
      if (numericAmount > Number(profile?.coins || 0)) throw new Error("Your wallet balance is too low for this gift.");
      if (service === "custom" && !customPurpose.trim()) {
        throw new Error("Say what this custom gift is for.");
      }
      const { data, error } = await supabase.rpc("create_gift_card", {
        gift_amount: numericAmount,
        gift_template: templateId,
        gift_service: service,
        gift_message: message.trim() || null,
        gift_custom_purpose: service === "custom" ? customPurpose.trim() : null,
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (card) => {
      refetchUnclaimed();
      setCreatedCard(card);
      toast.success("Your Zero Card is ready.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedService = giftServices.find((item) => item.id === service);
  const canCreate = !createGift.isPending && numericAmount > 0 && numericAmount <= Number(profile?.coins || 0) && !(service === "custom" && !customPurpose.trim());

  const header = (title: string) => (
    <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
      <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
        <Link to="/app/wallet" aria-label="Back to wallet" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
          <ArrowLeft className="h-[22px] w-[22px]" />
        </Link>
        <h1 className="flex-1 font-display text-[18px] font-semibold">{title}</h1>
        {unclaimedCount > 0 && (
          <Link to="/app/gifts/unclaimed" className="mr-1 flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-foreground/20 px-3 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.04]">
            Unclaimed
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#cc208f] px-1 text-[11px] font-bold tabular-nums text-white">{unclaimedCount}</span>
          </Link>
        )}
      </div>
    </header>
  );

  if (createdCard) {
    const serviceLabel = giftServices.find((item) => item.id === createdCard.service)?.label || createdCard.service;
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        {header("Zero Card ready")}
        <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center bg-card px-4 pb-28 pt-8 text-center md:my-2 md:rounded-xl md:border md:border-border md:pb-8">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#1a7f4b]/10 text-[#1a7f4b]"><Check className="h-6 w-6" /></span>
          <h2 className="mt-3 font-display text-[24px] font-semibold leading-tight">Your Zero Card is ready</h2>
          <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-muted-foreground">It can be used for {serviceLabel}. Share the link with the person you chose.</p>
          <div className="mt-6 w-full max-w-[420px]">
            <GiftCardVisual amount={createdCard.amount} service={createdCard.service} templateId={createdCard.template_id} code={createdCard.code} message={createdCard.message} />
          </div>
          <button onClick={() => shareGift(createdCard)} className="mt-6 flex h-12 w-full max-w-[420px] items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background">
            <Share2 className="h-4 w-4" /> Share Zero Card
          </button>
          <button onClick={() => { setCreatedCard(null); setAmount(""); setMessage(""); }} className="mt-3 h-10 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
            Send another
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      {header("Send a Zero Card")}

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          <div className="mx-auto w-full max-w-[420px]">
            <GiftCardVisual amount={numericAmount} service={service} templateId={templateId} message={message} />
          </div>
          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1">
            {giftTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => setTemplateId(template.id)}
                aria-label={`${template.name} design`}
                aria-pressed={templateId === template.id}
                className={`h-9 w-[52px] shrink-0 rounded-lg border border-foreground/10 ${template.shell} ${templateId === template.id ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`}
              />
            ))}
          </div>
        </section>

        {availableGifts.length > 0 && (
          <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
            <h2 className="px-4 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Cards you can spend · {availableGifts.length}</h2>
            <p className="px-4 pb-2 text-[13px] text-muted-foreground">Apply these at checkout. Your wallet only pays what's left over.</p>
            {availableGifts.map((gift: any) => {
              const label = giftServices.find((item) => item.id === gift.service)?.label || gift.service;
              const destination = GIFT_SERVICE_DESTINATIONS[gift.service] || { action: "Use this card" };
              return (
                <div key={gift.id} className="flex items-center gap-3 border-t border-border/60 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#cc208f]/10 text-[#cc208f]"><Gift className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{format(Number(gift.remaining_amount) || 0)} · {label}</p>
                    <p className="text-[13px] text-muted-foreground">of {format(Number(gift.amount) || 0)} left</p>
                  </div>
                  {destination.href ? (
                    <a href={destination.href} className="shrink-0 text-[14px] font-semibold text-[#cc208f] hover:text-[#a3186f]">Use</a>
                  ) : (
                    <span className="shrink-0 text-[13px] text-muted-foreground">{destination.action}</span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="flex flex-col gap-4 bg-card p-4 md:rounded-xl md:border md:border-border">
          <div>
            <span className={LABEL}>Amount</span>
            <div className="flex items-baseline gap-1.5 border-b border-foreground/15 pb-2 focus-within:border-foreground/40">
              <span className="font-display text-[24px] font-semibold text-muted-foreground">{currencyDetails.symbol}</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" type="number" placeholder="0" aria-label="Card amount" className="min-w-0 flex-1 bg-transparent font-display text-[34px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/35 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[3000, 5000, 7000, 12000].map((value) => (
                <button key={value} onClick={() => setAmount(String(fromBaseAmount(value)))} className={`h-9 rounded-full px-3.5 text-[14px] font-semibold tabular-nums transition ${numericAmount === value ? "bg-foreground text-background" : "border border-foreground/20 text-muted-foreground hover:border-foreground/40"}`}>
                  {format(value)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">From your wallet · {format(Number(profile?.coins || 0))} available</p>
          </div>

          <div>
            <span className={LABEL}>Can be used for</span>
            <div className="flex flex-wrap gap-2">
              {giftServices.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setService(item.id)}
                  aria-pressed={service === item.id}
                  className={`flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] font-semibold transition ${service === item.id ? "border-[1.5px] border-foreground text-foreground" : "border border-foreground/20 text-muted-foreground hover:border-foreground/40"}`}
                >
                  {service === item.id && <Check className="h-3.5 w-3.5" />}
                  {item.label}
                </button>
              ))}
            </div>
            {selectedService?.description && <p className="mt-2 text-[13px] text-muted-foreground">{selectedService.description}</p>}
          </div>

          {service === "custom" && (
            <label className="block">
              <span className={LABEL}>What's it for?</span>
              <input
                value={customPurpose}
                onChange={(event) => setCustomPurpose(event.target.value.slice(0, 60))}
                placeholder="e.g. Data for your bootcamp week"
                className={FIELD}
              />
              {/* Said plainly, because "custom" could easily be read as
                  restricting where the money can go. It does not. */}
              <span className="mt-1 block text-[12px] text-muted-foreground">A note for them. The money still lands in their wallet to spend freely.</span>
            </label>
          )}

          <label className="block">
            <span className={LABEL}>Message <span className="font-normal">(optional)</span></span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 140))} rows={2} placeholder="Add a short note" className={`${FIELD} h-auto resize-none py-2.5`} />
            <span className="mt-1 block text-right text-[12px] text-muted-foreground">{message.length}/140</span>
          </label>
        </section>

        <section className="flex flex-1 flex-col bg-card px-4 pb-28 pt-4 md:flex-none md:rounded-xl md:border md:border-border md:pb-4">
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {service === "support" || service === "custom"
              ? "The amount leaves your wallet now and lands in theirs the moment they claim it."
              : "The amount is reserved from your wallet now and stays locked to what you chose."}
          </p>
          <button
            onClick={() => createGift.mutate()}
            disabled={!canCreate}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {createGift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{numericAmount > 0 ? `Create ${format(numericAmount)} card` : "Create card"}<ArrowRight className="h-4 w-4" /></>}
          </button>
        </section>
      </main>
    </div>
  );
}

const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD = "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40";
