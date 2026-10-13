import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { membershipGiftStatus, type MembershipGift } from "@/features/membership/MembershipGifts";
import { ADMIN_GIFT_TYPES, eligibleGiftPlans, giftStatus, giftType, type AdminGiftKind, type AdminUserGift, type GiftPlan, type GiftRecipient } from "@/features/membership/giftCatalog";
import { formatNaira } from "@/features/membership/plans";
import { toast } from "sonner";
import { GiftRecipientPicker } from "./GiftRecipientPicker";

const deadlineIn = (days: number) => {
  const date = new Date(Date.now() + days * 86400000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const dateLabel = (date: string) => new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const inputClass = "mt-2 min-h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 sm:text-sm";

export function MembershipGiftsAdmin() {
  const client = useQueryClient();
  const [username, setUsername] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<GiftRecipient | null>(null);
  const [kind, setKind] = useState<AdminGiftKind>("subscription");
  const [planKey, setPlanKey] = useState("");
  const [days, setDays] = useState("30");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState(() => deadlineIn(7));
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [now, setNow] = useState(Date.now());
  const request = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const plans = useQuery({ queryKey: ["gift-membership-plans"], queryFn: async () => {
    const { data, error } = await supabase.from("subscription_plans").select("key,name,audience").eq("active", true).gt("price_amount", 0).in("billing_interval", ["month", "year"]);
    if (error) throw error;
    return data as GiftPlan[];
  }});
  const memberships = useQuery({ queryKey: ["admin-membership-gifts"], queryFn: async () => {
    const { data, error } = await supabase.from("membership_gifts").select("*,plan:subscription_plans(name,features),recipient:profiles!membership_gifts_recipient_id_fkey(username)").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data as MembershipGift[];
  }, refetchInterval: 30_000 });
  const gifts = useQuery({ queryKey: ["admin-user-gifts"], queryFn: async () => {
    const { data, error } = await supabase.from("admin_user_gifts").select("*,recipient:profiles!admin_user_gifts_recipient_id_fkey(username)").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data as AdminUserGift[];
  }, refetchInterval: 30_000 });
  const availablePlans = eligibleGiftPlans(plans.data || [], selectedRecipient);
  // The chosen plan, as long as it suits the recipient (any plan before one is picked).
  const choosablePlans = selectedRecipient ? availablePlans : plans.data || [];
  const selectedPlan = choosablePlans.find(plan => plan.key === planKey) || (planKey ? undefined : availablePlans[0]);
  const isSubscription = kind === "subscription";
  const type = giftType(kind)!;
  const value = Number(amount);
  const expiry = new Date(deadline).getTime();
  const validAmount = Number.isInteger(value) && value > 0 && value <= (kind === "zp" ? 50_000_000 : 5_000_000) && (kind !== "zp" || value % 10 === 0);
  const valid = !!selectedRecipient && (!isSubscription || availablePlans.some(plan => plan.key === selectedPlan?.key)) && Number.isFinite(expiry) && expiry > now && expiry <= now + 366 * 86400000 && (isSubscription ? !!selectedPlan && Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 366 : validAmount && (kind !== "custom" || message.trim().length >= 3));
  const summary = isSubscription ? `${days} days of ${selectedPlan?.name || "a subscription"}` : `${kind === "zp" ? `${value.toLocaleString()} ZP` : formatNaira(value || 0)} · ${type.label}`;
  const send = useMutation({ mutationFn: async () => {
    if (!valid || !selectedRecipient) throw new Error("Complete the gift details and choose a valid recipient.");
    const expires = new Date(deadline).toISOString();
    if (isSubscription) {
      const { data, error } = await supabase.rpc("admin_gift_membership", { p_username: selectedRecipient.username, p_plan_key: selectedPlan!.key, p_duration_days: Number(days), p_claim_deadline: expires });
      if (error) throw error;
      return data;
    }
    const signature = JSON.stringify([selectedRecipient.id, kind, value, message.trim(), expires]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const { data, error } = await supabase.rpc("admin_send_user_gift", { p_username: selectedRecipient.username, p_kind: kind, p_amount: value, p_message: message.trim(), p_claim_deadline: expires, p_request_id: request.current!.id });
    if (error) throw error;
    return data;
  }, onSuccess: () => {
    const text = `${summary} sent to @${selectedRecipient!.username}`;
    setSuccess(text); toast.success("Gift sent. The recipient has been notified.");
    setUsername(""); setSelectedRecipient(null); setAmount(""); setMessage(""); request.current = null;
    void Promise.all(["admin-membership-gifts", "admin-user-gifts", "admin-dashboard-snapshot", "membership-gifts", "admin-gift-inbox"].map(key => client.invalidateQueries({ queryKey: [key] })));
  } });
  const history = [
    ...(memberships.data || []).map(gift => ({ id: gift.id, created: gift.created_at, title: `${gift.duration_days} days of ${gift.plan.name}`, username: gift.recipient?.username, status: membershipGiftStatus(gift, now), deadline: gift.claim_deadline })),
    ...(gifts.data || []).map(gift => ({ id: gift.id, created: gift.created_at, title: `${gift.kind === "zp" ? `${Number(gift.amount).toLocaleString()} ZP` : formatNaira(Number(gift.amount))} · ${giftType(gift.kind)?.label}`, username: gift.recipient?.username, status: giftStatus(gift, now), deadline: gift.claim_deadline })),
  ].sort((a, b) => Date.parse(b.created) - Date.parse(a.created)).slice(0, 100);

  return <section className="min-w-0 space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">From Zero Club</p><h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold"><Gift className="h-6 w-6" />Gifts for your members</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Give access, support a goal, or celebrate progress. Every gift goes to a specific member and has a deadline to claim.</p></div>
    {success && <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm"><Check className="h-5 w-5 shrink-0 text-emerald-600" /><div><p className="font-semibold">Gift sent</p><p className="mt-1 break-words">{success}</p></div></div>}
    <form onSubmit={event => { event.preventDefault(); send.mutate(); }} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)]">
      <fieldset disabled={send.isPending} className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <legend className="sr-only">Gift details</legend>
        <div><h3 className="text-base font-semibold">1. Choose your recipient</h3>
          <GiftRecipientPicker value={username} selected={selectedRecipient} onChange={value => { setUsername(value); setSelectedRecipient(null); send.reset(); }} onSelect={setSelectedRecipient} />
        </div>
        <div className="border-t border-border pt-5"><h3 className="text-base font-semibold">2. Choose a gift</h3><p className="mt-3 text-sm font-medium" id="gift-type-label">Gift type</p>
          <div role="radiogroup" aria-labelledby="gift-type-label" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ADMIN_GIFT_TYPES.map(option => {
              const on = option.id === kind;
              return (
                <button key={option.id} type="button" role="radio" aria-checked={on} onClick={() => { setKind(option.id); send.reset(); }} className={`min-h-12 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${on ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/20" : "border-border hover:bg-muted/60"}`}>
                  <span className="flex items-center justify-between gap-2">{option.label}{on && <Check className="h-4 w-4 shrink-0 text-primary" />}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">{type.description}</p>
          {isSubscription ? <div className="mt-4 space-y-4 rounded-xl bg-muted/40 p-3 sm:p-4"><div>
            <p className="text-sm font-medium" id="gift-plan-label">Subscription plan</p>
            {plans.isLoading ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading plans…</p>
            ) : plans.isError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">Plans could not load. <button type="button" className="underline" onClick={() => plans.refetch()}>Retry</button></p>
            ) : (
              <div role="radiogroup" aria-labelledby="gift-plan-label" className="mt-2 space-y-3">
                {["learner", "creator", "tutor", "institution"].filter(audience => (plans.data || []).some(plan => plan.audience === audience)).map(audience => (
                  <div key={audience}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{audience}</p>
                    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                      {(plans.data || []).filter(plan => plan.audience === audience).map(plan => {
                        const eligible = !selectedRecipient || availablePlans.some(p => p.key === plan.key);
                        const on = selectedPlan?.key === plan.key;
                        return (
                          <button key={plan.key} type="button" role="radio" aria-checked={on} disabled={!eligible} onClick={() => setPlanKey(plan.key)} className={`min-h-12 rounded-xl border px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-primary bg-primary/10 font-semibold ring-2 ring-primary/20" : "border-border bg-background hover:bg-muted/60"}`}>
                            <span className="flex items-center justify-between gap-2">{plan.name}{on && <Check className="h-4 w-4 shrink-0 text-primary" />}</span>
                            {!eligible && <span className="mt-0.5 block text-[11px] text-muted-foreground">Not for a {selectedRecipient?.account_type || "member"} account</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!selectedRecipient && <p className="mt-2 text-xs text-muted-foreground">Pick a plan now; choose the recipient above before sending.</p>}
            {selectedRecipient?.is_admin && <p className="mt-2 text-sm text-muted-foreground">This administrator already has every feature for free.</p>}
          </div><div><label htmlFor="gift-days" className="text-sm font-medium">Access duration (days)</label><input id="gift-days" type="number" min="1" max="366" className={inputClass} value={days} onChange={e => setDays(e.target.value)} required /><div className="mt-2 flex flex-wrap gap-2">{[30, 90, 180].map(value => <button type="button" key={value} onClick={() => setDays(String(value))} aria-pressed={days === String(value)} className={`min-h-9 rounded-full border px-3 text-xs ${days === String(value) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{value} days</button>)}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Starts when claimed. The same plan is extended; a different active plan is kept.</p></div></div> : <div className="mt-4"><label htmlFor="gift-amount" className="text-sm font-medium">{kind === "zp" ? "Zero Points" : "Gift value (₦)"}</label><input id="gift-amount" type="number" inputMode="numeric" min={kind === "zp" ? 10 : 1} max={kind === "zp" ? 50_000_000 : 5_000_000} step={kind === "zp" ? 10 : 1} required className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} placeholder={kind === "zp" ? "e.g. 1,000 ZP" : "e.g. 5,000"} /><label htmlFor="gift-message" className="mt-4 block text-sm font-medium">{kind === "custom" ? "Gift purpose" : "Personal message (optional)"}</label><textarea id="gift-message" required={kind === "custom"} minLength={kind === "custom" ? 3 : undefined} maxLength={500} className={`${inputClass} min-h-24 py-3`} value={message} onChange={e => setMessage(e.target.value)} placeholder="A little encouragement goes a long way…" /><p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/500</p></div>}
        </div>
        <div className="border-t border-border pt-5"><h3 className="text-base font-semibold">3. Set the claim deadline</h3><label htmlFor="gift-deadline" className="mt-3 block text-sm font-medium">Claim by (your local time)</label><input id="gift-deadline" type="datetime-local" className={inputClass} required value={deadline} onChange={e => setDeadline(e.target.value)} /><div className="mt-2 flex flex-wrap gap-2">{[3, 7, 30].map(days => <button type="button" key={days} className="min-h-9 rounded-full border border-border px-3 text-xs text-muted-foreground" onClick={() => setDeadline(deadlineIn(days))}>In {days} days</button>)}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Unclaimed gifts expire at this time. Once claimed, wallet funds, points, and service credits stay available.</p></div>
      </fieldset>
      <aside aria-label="Gift summary" className="min-w-0 rounded-2xl border border-primary/20 bg-card p-5 lg:sticky lg:top-24">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Gift className="h-6 w-6" /></span><h3 className="mt-4 text-lg font-semibold">Ready to make their day?</h3><p className="mt-1 text-sm text-muted-foreground">Review your gift before sending.</p>
        <dl className="mt-5 space-y-4 text-sm"><div><dt className="text-muted-foreground">To</dt><dd className="mt-1 break-words font-semibold">{selectedRecipient ? `@${selectedRecipient.username}` : "Choose a member"}</dd></div><div><dt className="text-muted-foreground">Gift</dt><dd className="mt-1 break-words font-semibold">{summary}</dd></div><div><dt className="text-muted-foreground">Claim by</dt><dd className="mt-1 font-medium">{Number.isFinite(expiry) ? dateLabel(deadline) : "Choose a deadline"}</dd></div>{!isSubscription && message.trim() && <div><dt className="text-muted-foreground">Message</dt><dd className="mt-1 whitespace-pre-wrap break-words">{message.trim()}</dd></div>}</dl>
        <p className="mt-5 rounded-xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">Sent by Zero Club. Your personal wallet is not charged. The recipient gets a notification and claims the gift from their account.</p>
        {send.isError && <p role="alert" className="mt-4 break-words text-sm text-destructive">{(send.error as Error).message}</p>}
        <button type="submit" disabled={!valid || send.isPending} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40">{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}{send.isPending ? "Sending gift…" : "Send gift"}</button>
      </aside>
    </form>
    <section aria-label="Gift history" className="min-w-0"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Recent gifts</h3><span className="text-xs text-muted-foreground">All gift types</span></div>{gifts.isError || memberships.isError ? <p role="alert" className="mt-3 text-sm text-destructive">Some gifts could not load. <button className="underline" onClick={() => { void gifts.refetch(); void memberships.refetch(); }}>Try again</button></p> : null}{gifts.isLoading || memberships.isLoading ? <div role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading gifts…</div> : !history.length ? <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center"><Gift className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">Your first gift starts here</p><p className="mt-1 text-sm text-muted-foreground">Sent gifts and their claim status will appear here.</p></div> : <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{history.map(gift => <article key={gift.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="break-words font-medium">{gift.title}</p><p className="mt-1 break-words text-sm text-muted-foreground">@{gift.username || "deleted member"} · Claim by {dateLabel(gift.deadline)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${gift.status === "claimed" ? "bg-emerald-500/10 text-emerald-600" : gift.status === "expired" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{gift.status === "pending" ? "Awaiting claim" : gift.status}</span></article>)}</div>}</section>
  </section>;
}
