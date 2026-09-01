import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Copy, Gift, Loader2, Share2, ShieldCheck } from "@/components/icons/solar";
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

  if (createdCard) {
    const serviceLabel = giftServices.find((item) => item.id === createdCard.service)?.label || createdCard.service;
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] md:px-7"><div className="mx-auto flex max-w-[900px] items-center gap-3"><Link to="/app/wallet" className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p><h1 className="text-[18px] font-semibold">Gift created</h1></div></div></header>
        <main className="mx-auto flex max-w-[900px] flex-col items-center px-4 py-9 text-center md:px-7">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check className="h-6 w-6" strokeWidth={2.5} /></div>
          <h2 className="mt-4 font-display text-[27px] font-semibold tracking-tight">Your gift is ready to make a difference.</h2>
          <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">This gift can only be claimed for {serviceLabel}. Share the secure card link with the person you chose.</p>
          <div className="mt-7 w-full max-w-[520px]"><GiftCardVisual amount={createdCard.amount} service={createdCard.service} templateId={createdCard.template_id} code={createdCard.code} message={createdCard.message} /></div>
          <button onClick={() => shareGift(createdCard)} className="mt-7 flex h-12 w-full max-w-[520px] items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground"><Share2 className="h-4 w-4 fill-current" />Share gift card</button>
          <button onClick={() => { setCreatedCard(null); setAmount(""); setMessage(""); }} className="mt-3 text-[12px] font-semibold text-muted-foreground">Create another gift</button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7"><div className="mx-auto flex max-w-[1080px] items-center justify-between"><div className="flex items-center gap-3"><Link to="/app/wallet" className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p><h1 className="text-[18px] font-semibold">Create a gift</h1></div></div><div className="flex items-center gap-3">{unclaimedCount > 0 && (<Link to="/app/gifts/unclaimed" className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[11.5px] font-semibold text-foreground transition hover:bg-accent/40"><Gift className="h-3.5 w-3.5 text-primary" />Unclaimed<span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[9.5px] font-bold tabular-nums text-primary-foreground">{unclaimedCount}</span></Link>)}<div className="text-right"><p className="text-[9px] uppercase text-muted-foreground">Balance</p><p className="text-[13px] font-semibold tabular-nums">{format(Number(profile?.coins || 0))}</p></div></div></div></header>

      <main className="mx-auto grid min-w-0 max-w-[1080px] gap-6 px-4 py-6 md:px-7 md:py-8 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0 space-y-6">
          <div><span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase text-primary"><Gift className="h-4 w-4 fill-current" />Zero Cards</span><h2 className="mt-3 font-display text-[27px] font-semibold tracking-tight sm:text-[34px]">Give money, or give access.</h2><p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">Send cash straight to someone&rsquo;s wallet with Support, add a note on what it&rsquo;s for with Custom, or lock the value to one thing &mdash; a bootcamp, a membership, a product. You choose which below.</p></div>

          {availableGifts.length > 0 && (
            <section className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Your available Zero Gifts</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Apply these at checkout for the service shown. Your wallet only pays any amount left over.</p>
                </div>
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-primary px-2 text-[11px] font-bold text-primary-foreground">{availableGifts.length}</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {availableGifts.map((gift: any) => {
                  const label = giftServices.find((item) => item.id === gift.service)?.label || gift.service;
                  const destination = GIFT_SERVICE_DESTINATIONS[gift.service] || { action: "Use this gift" };
                  return (
                    <div key={gift.id} className="rounded-lg border border-border bg-card p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold">{label}</p>
                          <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">Gift {gift.code}</p>
                        </div>
                        <p className="shrink-0 text-[15px] font-semibold tabular-nums text-primary">{format(Number(gift.remaining_amount) || 0)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5">
                        <span className="text-[10.5px] text-muted-foreground">of {format(Number(gift.amount) || 0)} remaining</span>
                        {destination.href ? (
                          <a href={destination.href} className="text-[10.5px] font-semibold text-primary hover:underline">{destination.action} →</a>
                        ) : (
                          <span className="text-[10.5px] font-semibold text-primary">{destination.action}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="rounded-lg border border-border bg-card p-5">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Gift amount</label>
            <div className="mt-3 flex items-baseline gap-2 border-b border-border pb-3"><span className="text-[22px] text-muted-foreground">{currencyDetails.symbol}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" type="number" placeholder="0" className="min-w-0 flex-1 bg-transparent text-[37px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/25" /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[3000, 5000, 7000, 12000].map((value) => <button key={value} onClick={() => setAmount(String(fromBaseAmount(value)))} className={`min-w-0 rounded-lg border px-2 py-2.5 text-[10px] font-semibold tabular-nums ${numericAmount === value ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{format(value)}</button>)}</div>
          </div>

          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Choose a template</label><div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">{giftTemplates.map((template) => <button key={template.id} onClick={() => setTemplateId(template.id)} className={`overflow-hidden rounded-lg border p-1.5 ${templateId === template.id ? "border-primary ring-2 ring-primary/10" : "border-border"}`}><div className={`aspect-[1.5/1] rounded-md ${template.shell}`}><div className={`m-2 h-3 w-3 rounded-sm ${template.accent}`} /></div><span className="mt-1.5 block text-[9px] font-medium">{template.name}</span></button>)}</div></div>

          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">What can this gift be used for?</label><div className="mt-3 grid gap-2 sm:grid-cols-2">{giftServices.map((item) => <button key={item.id} onClick={() => setService(item.id)} className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 text-left ${service === item.id ? "border-primary bg-primary/[0.045]" : "border-border bg-card"}`}><div><p className="text-[12.5px] font-semibold">{item.label}</p><p className="mt-0.5 text-[10.5px] text-muted-foreground">{item.description}</p></div>{service === item.id && <Check className="h-4 w-4 shrink-0 text-primary" />}</button>)}</div></div>

          {service === "custom" && (
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">What is this gift for?</label>
              <input
                value={customPurpose}
                onChange={(event) => setCustomPurpose(event.target.value.slice(0, 60))}
                placeholder="e.g. Data for your bootcamp week"
                className="mt-3 w-full rounded-lg border border-border bg-card p-4 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              {/* Said plainly, because "custom" could easily be read as
                  restricting where the money can go. It does not. */}
              <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                A note for the recipient. The money still lands in their wallet to spend freely.
              </p>
            </div>
          )}

          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Personal message <span className="normal-case text-muted-foreground/60">(optional)</span></label><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 140))} rows={3} placeholder="Add a short note for the recipient" className="mt-3 w-full resize-none rounded-lg border border-border bg-card p-4 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /><p className="mt-1 text-right text-[9px] text-muted-foreground">{message.length}/140</p></div>
        </section>

        <aside className="w-full min-w-0 border-t border-border pt-6 lg:sticky lg:top-28 lg:self-start lg:border-0 lg:pt-0"><div className="mx-auto w-full max-w-[520px] lg:max-w-none"><GiftCardVisual amount={numericAmount} service={service} templateId={templateId} message={message} /><div className="mt-3 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[0.045] p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-[11.5px] leading-relaxed text-muted-foreground">{service === "support" || service === "custom" ? "The amount leaves your wallet now and lands in theirs the moment they claim it." : "The amount is reserved from your wallet when the card is created. It remains locked to the selected service."}</p></div><button onClick={() => createGift.mutate()} disabled={createGift.isPending || numericAmount <= 0 || numericAmount > Number(profile?.coins || 0) || (service === "custom" && !customPurpose.trim())} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground disabled:opacity-40">{createGift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create gift card<ArrowRight className="h-4 w-4" /></>}</button></div></aside>
      </main>
    </div>
  );
}
