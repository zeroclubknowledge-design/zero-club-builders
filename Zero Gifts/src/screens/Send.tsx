import { Link } from "@tanstack/react-router";
import { AppShell, PageHead } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { zc } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { NAV } from "./nav";
import { AuthSheet } from "@/components/auth/AuthSheet";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gift,
  Loader2,
  Share2,
  ShieldCheck,
} from "@/components/icons/glyphs";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { GiftBootcampPicker } from "@/features/membership/GiftBootcampPicker";
import { GiftCardVisual, giftServices, giftTemplates } from "@/components/GiftCardVisual";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { shareOrCopy, giftLinkUrl } from "@/lib/share";
import { draftKey, storedDraftOwner, usePersistentDraft } from "@/lib/draftStorage";

export function SendGift() {
  const { refreshProfile, session } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const client = useQueryClient();
  const giftKey = (field: string) => draftKey(storedDraftOwner(), "gift-card", field);
  const [amount, setAmount] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const [templateId, setTemplateId] = usePersistentDraft(giftKey("template"), "signature");
  const [service, setService] = usePersistentDraft(giftKey("service"), "universal");
  useEffect(() => { if (service === "support") setService("universal"); }, [service, setService]);
  const [quantity, setQuantity] = usePersistentDraft(giftKey("quantity"), "1");
  const [expires, setExpires] = usePersistentDraft(giftKey("expiry"), "");
  const [limited, setLimited] = usePersistentDraft(giftKey("limited-bootcamps"), false);
  const [bootcampIds, setBootcampIds] = usePersistentDraft<string[]>(giftKey("bootcamps"), []);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const [message, setMessage] = usePersistentDraft(giftKey("message"), "");
  const [customPurpose, setCustomPurpose] = usePersistentDraft(giftKey("purpose"), "");
  const [createdCard, setCreatedCard] = usePersistentDraft<any>(giftKey("created"), null);
  const { details: currencyDetails, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const displayAmount = Number(amount) || 0;
  const numericAmount = Math.round(toBaseAmount(displayAmount));
  const count = Number(quantity);
  const total = numericAmount * count;
  const expiry = new Date(expires).getTime();
  const validDetails = Number.isInteger(count) && count > 0 && count <= 10000 && Number.isFinite(expiry) && expiry > now && expiry <= now + 366 * 86400000 && !(service === "bootcamps" && limited && (!bootcampIds.length || bootcampIds.length > 100));

  const { data: profile, isError: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ["gift-card-profile", session?.user.id ?? null],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, coins, is_admin")
        .eq("id", session.user.id)
        .single();
      if (error) throw error;
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

  const shareGift = (card: any) => {
    const label = giftServices.find((item) => item.id === card.service)?.label || card.service;
    shareOrCopy({
      title: "A Zero Card for you",
      text: `${format(Number(card.amount))} per person — ${label}. ${card.quantity || 1} claims, one per account.${card.expires_at ? ` Claim by ${new Date(card.expires_at).toLocaleString()}.` : ""}`,
      url: giftLinkUrl(card.code),
      copiedMessage: "Gift link copied",
    });
  };

  const isPlatformAdmin = profile?.is_admin === true;
  const hasGiftFunds = isPlatformAdmin || total <= Number(profile?.coins || 0);
  const createGift = useMutation({
    mutationFn: async () => {
      if (numericAmount <= 0) throw new Error("Enter a valid gift amount.");
      if (!validDetails) throw new Error("Choose a quantity, future expiry and any required bootcamps.");
      if (!hasGiftFunds)
        throw new Error("Your wallet balance is too low for this gift.");
      if (service === "custom" && !customPurpose.trim()) {
        throw new Error("Say what this custom gift is for.");
      }
      const signature = JSON.stringify([numericAmount, count, expires, templateId, service, message.trim(), customPurpose.trim(), service === "bootcamps" && limited ? bootcampIds : []]);
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      const { data, error } = await supabase.rpc("create_gift_campaign", {
        gift_amount: numericAmount,
        gift_template: templateId,
        gift_service: service,
        gift_message: message.trim() || null,
        gift_custom_purpose: service === "custom" ? customPurpose.trim() : null,
        gift_quantity: count,
        gift_expires_at: new Date(expires).toISOString(),
        gift_bootcamp_ids: service === "bootcamps" && limited ? bootcampIds : [],
        p_request_id: request.current!.id,
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (card) => {
      refetchUnclaimed();
      void client.invalidateQueries({ queryKey: ["gift-card-profile"] });
      void client.invalidateQueries({ queryKey: ["profile", "current"] });
      setCreatedCard(card);
      void refreshProfile();
      setMessage("");
      setCustomPurpose("");
      toast.success("Your Zero Card is ready.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedService = giftServices.find((item) => item.id === service);
  const canCreate =
    !createGift.isPending &&
    !!profile?.id && numericAmount > 0 && numericAmount <= 5000000 &&
    validDetails && hasGiftFunds &&
    !(service === "custom" && !customPurpose.trim());
  const blockedReason = profileError ? "Your account couldn't load. Try again to create a gift."
    : !session ? null
    : !profile?.id ? "Loading your account…"
    : numericAmount <= 0 ? "Enter an amount per person to continue."
    : numericAmount > 5000000 ? `Amount per person must be ${format(5000000)} or less.`
    : !Number.isInteger(count) || count < 1 || count > 10000 ? "Choose between 1 and 10,000 people."
    : !Number.isFinite(expiry) ? "Choose the date and time when claims and unused credit expire."
    : expiry <= now ? "Choose an expiry date and time in the future."
    : expiry > now + 366 * 86400000 ? "Choose an expiry within one year."
    : service === "bootcamps" && limited && !bootcampIds.length ? "Select at least one eligible bootcamp."
    : service === "bootcamps" && limited && bootcampIds.length > 100 ? "Select no more than 100 bootcamps."
    : service === "custom" && !customPurpose.trim() ? "Describe what this custom gift is for."
    : !hasGiftFunds ? `Add ${format(Math.max(0, total - Number(profile?.coins || 0)))} to your wallet to create this gift.`
    : null;

  const waiting = unclaimedCount > 0 ? (
    <Link to="/sent" className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13px] font-semibold">
      Collecting
      <span className="grid h-[20px] min-w-[20px] place-items-center rounded-full bg-[#cc208f] px-1 text-[11px] font-bold tabular-nums text-white">{unclaimedCount}</span>
    </Link>
  ) : null;

  if (createdCard) {
    const serviceLabel =
      giftServices.find((item) => item.id === createdCard.service)?.label || createdCard.service;
    return (
      <AppShell brand={<Brand />} nav={NAV}>
        <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center rounded-[26px] border border-border bg-card px-4 pb-10 pt-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#1a7f4b]/10 text-[#1a7f4b]">
            <Check className="h-6 w-6" />
          </span>
          <h2 className="mt-3 font-display text-[24px] font-semibold leading-tight">
            Your Zero Card is ready
          </h2>
          <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            {format(Number(createdCard.amount))} per person · {createdCard.quantity || 1} claims. Each account can claim once. Use for {serviceLabel}.
          </p>
          {createdCard.expires_at && <p className="mt-2 text-xs text-muted-foreground">Claim and use before {new Date(createdCard.expires_at).toLocaleString()}. Unused credit expires.</p>}
          <div className="mt-6 w-full max-w-[420px]">
            <GiftCardVisual
              amount={createdCard.amount}
              service={createdCard.service}
              templateId={createdCard.template_id}
              code={createdCard.code}
              message={createdCard.message}
            />
          </div>
          <button
            onClick={() => shareGift(createdCard)}
            className="mt-6 flex h-12 w-full max-w-[420px] items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background"
          >
            <Share2 className="h-4 w-4" /> Share Zero Card
          </button>
          <button
            onClick={() => {
              setCreatedCard(null);
              setAmount("");
              setMessage("");
            }}
            className="mt-3 h-10 text-[14px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Send another
          </button>
          <Link to="/sent" className="mt-1 text-[13px] font-semibold text-[#cc208f]">See all your gifts</Link>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell brand={<Brand />} nav={NAV}>
      <PageHead title="Gifts & Zero Cards" action={waiting} />
      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-3 [&>section]:rounded-[22px] [&>section]:border [&>section]:border-border">
        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          <div className="mx-auto w-full max-w-[420px]">
            <GiftCardVisual
              amount={numericAmount}
              service={service}
              templateId={templateId}
              message={message}
            />
          </div>
          {/* Room is left around every swatch so the selection ring is never
              clipped by the scrolling row, and the row lines up with the card. */}
          <div className="mx-auto mt-3 w-full max-w-[420px]">
            <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto p-1">
              {giftTemplates.map((template) => {
                const selected = templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    aria-label={`${template.name} design`}
                    aria-pressed={selected}
                    className={`relative grid h-10 min-w-[52px] flex-1 place-items-center rounded-[10px] border border-foreground/10 transition active:scale-95 ${template.shell} ${selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`}
                  >
                    {selected && (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-background/90 text-foreground shadow-sm">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 bg-card p-4 md:rounded-xl md:border md:border-border">
          <div>
            <span className={LABEL}>Amount per person</span>
            <div className="flex items-baseline gap-1.5 border-b border-foreground/15 pb-2 focus-within:border-foreground/40">
              <span className="font-display text-[24px] font-semibold text-muted-foreground">
                {currencyDetails.symbol}
              </span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                type="number"
                placeholder="0"
                aria-label="Card amount"
                className="min-w-0 flex-1 bg-transparent font-display text-[34px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/35 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[3000, 5000, 7000, 12000].map((value) => (
                <button
                  key={value}
                  onClick={() => setAmount(String(fromBaseAmount(value)))}
                  className={`h-9 rounded-full px-3.5 text-[14px] font-semibold tabular-nums transition ${numericAmount === value ? "bg-foreground text-background" : "border border-foreground/20 text-muted-foreground hover:border-foreground/40"}`}
                >
                  {format(value)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {!session ? "Paid from your Zero Club wallet" : isPlatformAdmin ? "Sponsored by Zero Club · no wallet balance required" : `From your wallet · ${format(Number(profile?.coins || 0))} available`}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label><span className={LABEL}>Number of people</span><input type="number" inputMode="numeric" min="1" max="10000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} className={FIELD} /><span className="mt-1 block text-xs text-muted-foreground">Each account can claim once.</span></label>
            <label><span className={LABEL}>Claim and use before</span><input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} className={`${FIELD} min-w-0 max-w-full`} /><span className="mt-1 block text-xs text-muted-foreground">New claims and unused gift credit expire at this time.</span></label>
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
            {selectedService?.description && (
              <p className="mt-2 text-[13px] text-muted-foreground">
                {selectedService.description}
              </p>
            )}
          </div>

          {service === "bootcamps" && <div><span className={LABEL}>Eligible bootcamps</span><div className="mt-2 flex flex-wrap gap-2"><button type="button" aria-pressed={!limited} onClick={() => setLimited(false)} className={`rounded-full border px-4 py-2 text-sm ${!limited ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>All bootcamps</button><button type="button" aria-pressed={limited} onClick={() => setLimited(true)} className={`rounded-full border px-4 py-2 text-sm ${limited ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>Choose bootcamps</button></div>{limited && <GiftBootcampPicker selected={bootcampIds} onChange={setBootcampIds} />}</div>}
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
              <span className="mt-1 block text-[12px] text-muted-foreground">
                A note for them. Gift credit can be used for payments until its expiry.
              </span>
            </label>
          )}

          <label className="block">
            <span className={LABEL}>
              Message <span className="font-normal">(optional)</span>
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 140))}
              rows={2}
              placeholder="Add a short note"
              className={`${FIELD} h-auto resize-none py-2.5`}
            />
            <span className="mt-1 block text-right text-[12px] text-muted-foreground">
              {message.length}/140
            </span>
          </label>
        </section>

        <section className="flex flex-col bg-card px-4 pb-4 pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-3"><span className="text-sm text-muted-foreground">{isPlatformAdmin ? "Total sponsored" : "Total reserved"} · {count > 0 ? count.toLocaleString() : 0} × {format(numericAmount)}</span><strong className="text-base tabular-nums">{format(Number.isFinite(total) ? total : 0)}</strong></div>
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {isPlatformAdmin ? "Zero Club sponsors this gift without charging your wallet. Each member receives gift credit, subject to the selected purpose and expiry."
              : service === "universal" || service === "support" || service === "custom"
              ? "The total is reserved now. Each member receives separate gift credit. It pays first at checkout, with only the remainder charged to their wallet. Unused credit expires on the selected date."
              : "The total is reserved now. Each claim activates credit for its chosen purpose. Checkout applies eligible credit first, then your wallet covers the rest."}
          </p>
          <button
            onClick={() => (session ? createGift.mutate() : setAuthOpen(true))}
            disabled={session ? !canCreate : false}
            aria-describedby={blockedReason ? "gift-create-help" : undefined}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {createGift.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {!session ? "Sign in to create this gift" : numericAmount > 0 && count > 0 ? `Create ${count.toLocaleString()}-claim gift` : "Create card"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {blockedReason && <p id="gift-create-help" role="status" className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">{blockedReason}</p>}
          {profileError && <button type="button" onClick={() => refetchProfile()} className="mt-2 min-h-10 text-sm font-semibold underline">Try again</button>}
        </section>
        {!session && <p className="text-center text-[12.5px] text-muted-foreground">Design your card now. You'll sign in or create a free Zero Club account to fund and send it.</p>}
        <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} onDone={() => { void client.invalidateQueries({ queryKey: ["gift-card-profile"] }); }} />
        {session && !isPlatformAdmin && !hasGiftFunds && (
          <a href={zc("/app/wallet/add-money")} target="_blank" rel="noreferrer" className="mx-auto mt-1 text-[13px] font-semibold text-[#cc208f]">Add money to your Zero Club wallet</a>
        )}
      </main>
    </AppShell>
  );
}

const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD =
  "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40";
