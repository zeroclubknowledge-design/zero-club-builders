import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Gift, Loader2, Share2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { GiftCardVisual, giftServices, giftTemplates } from "@/components/GiftCardVisual";

export const Route = createFileRoute("/app/gifts/")({ component: GiftCardsPage });

function GiftCardsPage() {
  const [amount, setAmount] = useState("");
  const [templateId, setTemplateId] = useState("signature");
  const [service, setService] = useState("bootcamps");
  const [message, setMessage] = useState("");
  const [createdCard, setCreatedCard] = useState<any>(null);
  const numericAmount = Number(amount) || 0;

  const { data: profile } = useQuery({
    queryKey: ["gift-card-profile"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from("profiles").select("id, username, coins").eq("id", session.user.id).single();
      return data;
    },
  });

  const createGift = useMutation({
    mutationFn: async () => {
      if (numericAmount <= 0) throw new Error("Enter a valid gift amount.");
      if (numericAmount > Number(profile?.coins || 0)) throw new Error("Your wallet balance is too low for this gift.");
      const { data, error } = await supabase.rpc("create_gift_card", {
        gift_amount: numericAmount,
        gift_template: templateId,
        gift_service: service,
        gift_message: message.trim() || null,
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (card) => {
      setCreatedCard(card);
      toast.success("Your Zero Club Gift Card is ready.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const shareGift = async () => {
    if (!createdCard) return;
    const url = `${window.location.origin}/app/gifts/${createdCard.code}`;
    const shareData = { title: "A Zero Club Gift for you", text: `You received a ₦${Number(createdCard.amount).toLocaleString()} Zero Club Gift for ${giftServices.find((item) => item.id === createdCard.service)?.label || createdCard.service}.`, url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Gift link copied.");
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error("Could not share the gift link.");
    }
  };

  if (createdCard) {
    const serviceLabel = giftServices.find((item) => item.id === createdCard.service)?.label || createdCard.service;
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="border-b hairline px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] md:px-7"><div className="mx-auto flex max-w-[900px] items-center gap-3"><Link to="/app/wallet" className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p><h1 className="text-[18px] font-semibold">Gift created</h1></div></div></header>
        <main className="mx-auto flex max-w-[900px] flex-col items-center px-4 py-9 text-center md:px-7">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Check className="h-6 w-6" strokeWidth={2.5} /></div>
          <h2 className="mt-4 font-display text-[27px] font-semibold tracking-tight">Your gift is ready to make a difference.</h2>
          <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">This gift can only be claimed for {serviceLabel}. Share the secure card link with the person you chose.</p>
          <div className="mt-7 w-full max-w-[520px]"><GiftCardVisual amount={createdCard.amount} service={createdCard.service} templateId={createdCard.template_id} code={createdCard.code} message={createdCard.message} /></div>
          <button onClick={shareGift} className="mt-7 flex h-12 w-full max-w-[520px] items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground"><Share2 className="h-4 w-4 fill-current" />Share gift card</button>
          <button onClick={() => { setCreatedCard(null); setAmount(""); setMessage(""); }} className="mt-3 text-[12px] font-semibold text-muted-foreground">Create another gift</button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7"><div className="mx-auto flex max-w-[1080px] items-center justify-between"><div className="flex items-center gap-3"><Link to="/app/wallet" className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p><h1 className="text-[18px] font-semibold">Create a gift</h1></div></div><div className="text-right"><p className="text-[9px] uppercase text-muted-foreground">Balance</p><p className="text-[13px] font-semibold tabular-nums">₦{Number(profile?.coins || 0).toLocaleString()}</p></div></div></header>

      <main className="mx-auto grid max-w-[1080px] gap-6 px-4 py-6 md:px-7 md:py-8 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-6">
          <div><span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase text-primary"><Gift className="h-4 w-4 fill-current" />Restricted kindness</span><h2 className="mt-3 font-display text-[27px] font-semibold tracking-tight sm:text-[34px]">Give access, not just money.</h2><p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">Choose exactly what this gift supports. The value becomes a restricted entitlement when claimed and never enters the recipient's general wallet.</p></div>

          <div className="rounded-lg border border-border bg-card p-5">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Gift amount</label>
            <div className="mt-3 flex items-baseline gap-2 border-b border-border pb-3"><span className="text-[22px] text-muted-foreground">₦</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" type="number" placeholder="0" className="min-w-0 flex-1 bg-transparent text-[37px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/25" /></div>
            <div className="mt-3 grid grid-cols-4 gap-2">{[3000, 5000, 7000, 12000].map((value) => <button key={value} onClick={() => setAmount(String(value))} className={`rounded-lg border py-2 text-[10px] font-semibold tabular-nums ${numericAmount === value ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>₦{value.toLocaleString()}</button>)}</div>
          </div>

          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Choose a template</label><div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">{giftTemplates.map((template) => <button key={template.id} onClick={() => setTemplateId(template.id)} className={`overflow-hidden rounded-lg border p-1.5 ${templateId === template.id ? "border-primary ring-2 ring-primary/10" : "border-border"}`}><div className={`aspect-[1.5/1] rounded-md ${template.shell}`}><div className={`m-2 h-3 w-3 rounded-sm ${template.accent}`} /></div><span className="mt-1.5 block text-[9px] font-medium">{template.name}</span></button>)}</div></div>

          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">What can this gift be used for?</label><div className="mt-3 grid gap-2 sm:grid-cols-2">{giftServices.map((item) => <button key={item.id} onClick={() => setService(item.id)} className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 text-left ${service === item.id ? "border-primary bg-primary/[0.045]" : "border-border bg-card"}`}><div><p className="text-[12.5px] font-semibold">{item.label}</p><p className="mt-0.5 text-[10.5px] text-muted-foreground">{item.description}</p></div>{service === item.id && <Check className="h-4 w-4 shrink-0 text-primary" />}</button>)}</div></div>

          <div><label className="text-[10px] font-semibold uppercase text-muted-foreground">Personal message <span className="normal-case text-muted-foreground/60">(optional)</span></label><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 140))} rows={3} placeholder="Add a short note for the recipient" className="mt-3 w-full resize-none rounded-lg border border-border bg-card p-4 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /><p className="mt-1 text-right text-[9px] text-muted-foreground">{message.length}/140</p></div>
        </section>

        <aside className="lg:sticky lg:top-28 lg:self-start"><GiftCardVisual amount={numericAmount} service={service} templateId={templateId} message={message} /><div className="mt-3 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[0.045] p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p className="text-[11.5px] leading-relaxed text-muted-foreground">The amount is reserved from your wallet when the card is created. It remains locked to the selected service.</p></div><button onClick={() => createGift.mutate()} disabled={createGift.isPending || numericAmount <= 0 || numericAmount > Number(profile?.coins || 0)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40">{createGift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create gift card<ArrowRight className="h-4 w-4" /></>}</button></aside>
      </main>
    </div>
  );
}
