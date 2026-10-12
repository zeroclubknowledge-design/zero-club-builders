import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { membershipGiftStatus, type MembershipGift } from "@/features/membership/MembershipGifts";
import { toast } from "sonner";

const initialDeadline = () => {
  const date = new Date(Date.now() + 7 * 86400000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function MembershipGiftsAdmin() {
  const client = useQueryClient();
  const [username, setUsername] = useState("");
  const [planKey, setPlanKey] = useState("learner_premium");
  const [days, setDays] = useState("30");
  const [deadline, setDeadline] = useState(initialDeadline);
  const plans = useQuery({ queryKey: ["gift-membership-plans"], queryFn: async () => {
    const { data, error } = await supabase.from("subscription_plans").select("key,name,audience").eq("active", true).gt("price_amount", 0).in("billing_interval", ["month", "year"]);
    if (error) throw error;
    return data as { key: string; name: string; audience: string }[];
  }});
  const gifts = useQuery({ queryKey: ["admin-membership-gifts"], queryFn: async () => {
    const { data, error } = await supabase.from("membership_gifts").select("*,plan:subscription_plans(name,features),recipient:profiles!membership_gifts_recipient_id_fkey(username)").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data as MembershipGift[];
  }, refetchInterval: 30_000 });
  const send = useMutation({ mutationFn: async () => {
    const length = Number(days);
    const expires = new Date(deadline);
    if (!username.trim()) throw new Error("Enter the recipient's username.");
    if (!Number.isInteger(length) || length < 1 || length > 366) throw new Error("Choose between 1 and 366 days of membership.");
    if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) throw new Error("Choose a future claim deadline.");
    const { data, error } = await supabase.rpc("admin_gift_membership", { p_username: username.trim(), p_plan_key: planKey, p_duration_days: length, p_claim_deadline: expires.toISOString() });
    if (error) throw error;
    return data as { username: string; plan_name: string };
  }, onSuccess: gift => {
    toast.success(`${gift.plan_name} gift sent to @${gift.username}`);
    setUsername("");
    void client.invalidateQueries({ queryKey: ["admin-membership-gifts"] });
    void client.invalidateQueries({ queryKey: ["admin-dashboard-snapshot"] });
    void client.invalidateQueries({ queryKey: ["membership-gifts"] });
  }, onError: (error: Error) => toast.error(error.message) });
  const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
  return <section className="min-w-0 space-y-6">
    <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Gift className="h-5 w-5" />Membership gifts</h2><p className="mt-2 text-sm text-muted-foreground">Gift a paid plan to a username. The recipient must claim it before your deadline; membership starts at claim time.</p></div>
    <form onSubmit={event => { event.preventDefault(); send.mutate(); }} className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Recipient username<input className={inputClass} placeholder="@username" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} required /></label>
      <label className="text-sm font-medium">Membership plan<select className={inputClass} value={planKey} onChange={e => setPlanKey(e.target.value)} disabled={plans.isLoading || plans.isError}>{plans.data?.map(plan => <option key={plan.key} value={plan.key}>{plan.name}</option>)}</select></label>
      <label className="text-sm font-medium">Subscription length (days)<input type="number" min="1" max="366" required className={inputClass} value={days} onChange={e => setDays(e.target.value)} /></label>
      <label className="text-sm font-medium">Claim deadline (your local time)<input type="datetime-local" required className={inputClass} value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
      <p className="text-sm text-muted-foreground sm:col-span-2">No wallet charge or automatic renewal. A different active membership will not be replaced.</p>
      <button disabled={send.isPending || !plans.data?.length || gifts.isError} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2">{send.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Gift membership</button>
    </form>
    {gifts.isError || plans.isError ? <p role="alert" className="text-sm text-destructive">Membership gifts could not load. Check the membership gift database setup, then <button className="underline" onClick={() => { void gifts.refetch(); void plans.refetch(); }}>try again</button>.</p> : gifts.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="space-y-3"><h3 className="font-semibold">Recent gifts</h3>{!gifts.data?.length && <p className="text-sm text-muted-foreground">No membership gifts yet.</p>}{gifts.data?.map(gift => <div key={gift.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div className="min-w-0"><p className="break-words font-medium">@{gift.recipient?.username} · {gift.plan.name}</p><p className="mt-1 text-sm text-muted-foreground">{gift.duration_days} days · Claim by {new Date(gift.claim_deadline).toLocaleString()}</p></div><span className="text-sm capitalize">{membershipGiftStatus(gift)}</span></div>)}</div>}
  </section>;
}
