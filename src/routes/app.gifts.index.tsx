import { createFileRoute, Link } from "@tanstack/react-router";
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
import { AdminGiftInbox } from "@/features/membership/AdminGiftInbox";
import { MembershipGiftInbox } from "@/features/membership/MembershipGifts";
import { GiftBootcampPicker } from "@/features/membership/GiftBootcampPicker";
import { GiftClubPicker, MAX_GIFT_CLUBS } from "@/features/membership/GiftClubPicker";
import { GiftCardVisual, giftServices, giftTemplates } from "@/components/GiftCardVisual";
import { GiftCodeRedeemer } from "@/components/GiftCodeRedeemer";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { shareOrCopy, giftLinkUrl } from "@/lib/share";
import { draftKey, storedDraftOwner, usePersistentDraft } from "@/lib/draftStorage";

const GIFT_SERVICE_DESTINATIONS: Record<string, { href?: string; action: string }> = {
  universal: { href: "/app", action: "Use at checkout" },
  bootcamps: { href: "/app/bootcamps", action: "Use for a bootcamp" },
  membership: { href: "/app/premium", action: "Use for membership" },
  "zero-ai": { href: "/app/zero-ai", action: "View Zero AI" },
  "tutor-session": { action: "Ready for tutor sessions" },
  "zero-store": { href: "/app/store", action: "Shop Zero Store" },
};

export const Route = createFileRoute("/app/gifts/")({ component: GiftCardsPage });

function GiftCardsPage() {
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
  const [scope, setScope] = usePersistentDraft<"all" | "bootcamps" | "clubs">(giftKey("bootcamp-scope"), "all");
  const limited = scope === "bootcamps";
  const byClub = scope === "clubs";
  const [clubIds, setClubIds] = usePersistentDraft<string[]>(giftKey("clubs"), []);
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
  const validDetails = Number.isInteger(count) && count > 0 && count <= 10000 && Number.isFinite(expiry) && expiry > now && expiry <= now + 366 * 86400000 && !(service === "bootcamps" && limited && (!bootcampIds.length || bootcampIds.length > 100)) && !(service === "bootcamps" && byClub && (!clubIds.length || clubIds.length > MAX_GIFT_CLUBS));

  const { data: profile, isError: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ["gift-card-profile", storedDraftOwner()],
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

  const { data: giftRows = [], refetch: refetchAvailableGifts } = useQuery({
    queryKey: ["available-restricted-zero-gifts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_cards")
        .select("id, code, amount, remaining_amount, service, template_id, message, claimed_at,bootcamp_ids,club_ids,expires_at")
        .eq("claimed_by", profile!.id)
        .eq("status", "claimed")
        .gt("remaining_amount", 0)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("claimed_at", { ascending: false });
      // Before the restricted-gift migration reaches a deployment, keep the
      // Gifts page usable. Other failures should still surface to monitoring.
      if (error && ["42703", "PGRST204"].includes(error.code || "")) return [];
      if (error) throw error;
      return data || [];
    },
  });

  const availableGifts = giftRows.filter((card: any) => !card.expires_at || Date.parse(card.expires_at) > now);

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
      const signature = JSON.stringify([numericAmount, count, expires, templateId, service, message.trim(), customPurpose.trim(), service === "bootcamps" && limited ? bootcampIds : [], service === "bootcamps" && byClub ? clubIds : []]);
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      const clubScoped = service === "bootcamps" && byClub;
      const { data, error } = await supabase.rpc((clubScoped ? "create_club_gift_campaign" : "create_gift_campaign") as "create_gift_campaign", {
        ...(clubScoped ? { gift_club_ids: clubIds } : {}),
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
    : !profile?.id ? "Loading your account…"
    : numericAmount <= 0 ? "Enter an amount per person to continue."
    : numericAmount > 5000000 ? `Amount per person must be ${format(5000000)} or less.`
    : !Number.isInteger(count) || count < 1 || count > 10000 ? "Choose between 1 and 10,000 people."
    : !Number.isFinite(expiry) ? "Choose the date and time when claims and unused credit expire."
    : expiry <= now ? "Choose an expiry date and time in the future."
    : expiry > now + 366 * 86400000 ? "Choose an expiry within one year."
    : service === "bootcamps" && limited && !bootcampIds.length ? "Select at least one eligible bootcamp."
    : service === "bootcamps" && limited && bootcampIds.length > 100 ? "Select no more than 100 bootcamps."
    : service === "bootcamps" && byClub && !clubIds.length ? "Select at least one club."
    : service === "bootcamps" && byClub && clubIds.length > MAX_GIFT_CLUBS ? `Select no more than ${MAX_GIFT_CLUBS} clubs.`
    : service === "custom" && !customPurpose.trim() ? "Describe what this custom gift is for."
    : !hasGiftFunds ? `Add ${format(Math.max(0, total - Number(profile?.coins || 0)))} to your wallet to create this gift.`
    : null;

  const header = (title: string) => (
    <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
      <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
        <Link
          to="/app/wallet"
          aria-label="Back to wallet"
          className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
        >
          <ArrowLeft className="h-[22px] w-[22px]" />
        </Link>
        <h1 className="flex-1 font-display text-[18px] font-semibold">{title}</h1>
        {unclaimedCount > 0 && (
          <Link
            to="/app/gifts/unclaimed"
            className="mr-1 flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-foreground/20 px-3 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.04]"
          >
            Unclaimed
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#c3217e] px-1 text-[11px] font-bold tabular-nums text-white">
              {unclaimedCount}
            </span>
          </Link>
        )}
      </div>
    </header>
  );

  if (createdCard) {
    const serviceLabel =
      giftServices.find((item) => item.id === createdCard.service)?.label || createdCard.service;
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        {header("Zero Card ready")}
        <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center bg-card px-4 pb-28 pt-8 text-center md:my-2 md:rounded-xl md:border md:border-border md:pb-8">
          <div className="mb-6 w-full"><AdminGiftInbox userId={profile?.id} /><MembershipGiftInbox userId={profile?.id} /></div>
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
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      {header("Gifts & Zero Cards")}

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <AdminGiftInbox userId={profile?.id} />
        <MembershipGiftInbox userId={profile?.id} />
        {/* Someone holding a code comes here first, so the way in lives on this
            page too — not only inside a checkout they have not reached yet. */}
        <section className="bg-card px-4 py-3 md:rounded-xl md:border md:border-border">
          <GiftCodeRedeemer onClaim={() => { void refetchAvailableGifts(); }} />
        </section>
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

        {availableGifts.length > 0 && (
          <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
            <h2 className="px-4 pb-1 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Cards you can spend · {availableGifts.length}
            </h2>
            <p className="px-4 pb-2 text-[13px] text-muted-foreground">
              Apply these at checkout. Your wallet only pays what's left over.
            </p>
            {availableGifts.map((gift: any) => {
              const label =
                giftServices.find((item) => item.id === gift.service)?.label || gift.service;
              const destination = GIFT_SERVICE_DESTINATIONS[gift.service] || {
                action: "Use this card",
              };
              return (
                <div
                  key={gift.id}
                  className="flex items-center gap-3 border-t border-border/60 px-4 py-3"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#c3217e]/10 text-[#c3217e]">
                    <Gift className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">
                      {format(Number(gift.remaining_amount) || 0)} · {label}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      of {format(Number(gift.amount) || 0)} left
                    </p>
                    {!!gift.bootcamp_ids?.length && <p className="mt-1 text-xs text-muted-foreground">Only for {gift.bootcamp_ids.length} selected bootcamp{gift.bootcamp_ids.length === 1 ? "" : "s"}</p>}
                    {!!gift.club_ids?.length && <p className="mt-1 text-xs text-muted-foreground">Only for bootcamps in {gift.club_ids.length} club{gift.club_ids.length === 1 ? "" : "s"}</p>}
                    {gift.expires_at && <p className="mt-1 text-xs text-muted-foreground">Use before {new Date(gift.expires_at).toLocaleString()}</p>}
                  </div>
                  {destination.href ? (
                    <a
                      href={destination.href}
                      className="shrink-0 text-[14px] font-semibold text-[#c3217e] hover:text-[#9a1963]"
                    >
                      Use
                    </a>
                  ) : (
                    <span className="shrink-0 text-[13px] text-muted-foreground">
                      {destination.action}
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        )}

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
            <div className="mt-3 grid grid-cols-4 gap-1.5 sm:flex sm:gap-2">
              {[3000, 5000, 7000, 12000].map((value) => (
                <button
                  key={value}
                  onClick={() => setAmount(String(fromBaseAmount(value)))}
                  className={`h-9 min-w-0 whitespace-nowrap rounded-full px-1 text-[12px] font-semibold tabular-nums transition sm:px-3.5 sm:text-[14px] ${numericAmount === value ? "bg-foreground text-background" : "border border-foreground/20 text-muted-foreground hover:border-foreground/40"}`}
                >
                  {format(value)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {isPlatformAdmin ? "Sponsored by Zero Club · no wallet balance required" : `From your wallet · ${format(Number(profile?.coins || 0))} available`}
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

          {service === "bootcamps" && <div><span className={LABEL}>Eligible bootcamps</span><div className="mt-2 flex flex-wrap gap-2">{([["all", "All bootcamps"], ["clubs", "Choose clubs"], ["bootcamps", "Choose bootcamps"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)} className={`rounded-full border px-4 py-2 text-sm ${scope === id ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>{label}</button>)}</div>{byClub && <GiftClubPicker selected={clubIds} onChange={setClubIds} />}{limited && <GiftBootcampPicker selected={bootcampIds} onChange={setBootcampIds} />}</div>}
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

        <section className="flex flex-1 flex-col bg-card px-4 pb-28 pt-4 md:flex-none md:rounded-xl md:border md:border-border md:pb-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-3"><span className="text-sm text-muted-foreground">{isPlatformAdmin ? "Total sponsored" : "Total reserved"} · {count > 0 ? count.toLocaleString() : 0} × {format(numericAmount)}</span><strong className="text-base tabular-nums">{format(Number.isFinite(total) ? total : 0)}</strong></div>
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {isPlatformAdmin ? "Zero Club sponsors this gift without charging your wallet. Each member receives gift credit, subject to the selected purpose and expiry."
              : service === "universal" || service === "support" || service === "custom"
              ? "The total is reserved now. Each member receives separate gift credit. It pays first at checkout, with only the remainder charged to their wallet. Unused credit expires on the selected date."
              : "The total is reserved now. Each claim activates credit for its chosen purpose. Checkout applies eligible credit first, then your wallet covers the rest."}
          </p>
          <button
            onClick={() => createGift.mutate()}
            disabled={!canCreate}
            aria-describedby={blockedReason ? "gift-create-help" : undefined}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {createGift.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {numericAmount > 0 && count > 0 ? `Create ${count.toLocaleString()}-claim gift` : "Create card"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {blockedReason && <p id="gift-create-help" role="status" className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">{blockedReason}</p>}
          {profileError && <button type="button" onClick={() => refetchProfile()} className="mt-2 min-h-10 text-sm font-semibold underline">Try again</button>}
        </section>
      </main>
    </div>
  );
}

const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD =
  "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40";
