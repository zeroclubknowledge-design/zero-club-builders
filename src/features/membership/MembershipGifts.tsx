import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export type MembershipGift = {
  id: string; plan_key: string; duration_days: number; claim_deadline: string;
  status: "pending" | "claimed" | "expired"; claimed_at: string | null;
  created_at: string; plan: { name: string; features: string[] };
  recipient?: { username: string };
};

export function membershipGiftStatus(gift: Pick<MembershipGift, "status" | "claim_deadline">, now = Date.now()) {
  return gift.status === "pending" && new Date(gift.claim_deadline).getTime() <= now ? "expired" : gift.status;
}
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function MembershipGiftInbox({ userId }: { userId?: string }) {
  const client = useQueryClient();
  // Refresh expiry labels and buttons while the membership screen stays open.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const gifts = useQuery({
    queryKey: ["membership-gifts", userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("membership_gifts")
        .select("*,plan:subscription_plans(name,features)").eq("recipient_id", userId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as MembershipGift[];
    },
    refetchInterval: 30_000,
  });
  const claim = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("claim_membership_gift", { p_gift_id: id });
      if (error) throw error;
      return data as { status: string };
    },
    onSuccess: async (result) => {
      await Promise.all(["membership-gifts", "my_profile", "profile", "membership-dashboard", "club-capacity", "clubs_data", "can_use_premium_portfolio"].map(key => client.invalidateQueries({ queryKey: [key] })));
      if (result.status === "expired") toast.error("The claim deadline has passed. This gift has expired.");
      else toast.success(result.status === "already_claimed" ? "This gift was already claimed." : "Gift claimed! Your premium features are now available.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!gifts.data?.length) {
    if (gifts.isError && !["42P01", "PGRST205"].includes((gifts.error as any)?.code)) return <p className="mt-4 text-sm text-muted-foreground">Could not load membership gifts. <button className="underline" onClick={() => gifts.refetch()}>Try again</button></p>;
    return null;
  }
  return <section aria-label="Membership gifts" className="mt-5 space-y-3">
    <h3 className="flex items-center gap-2 text-lg font-semibold"><Gift className="h-5 w-5 text-primary" /> Gifts from Zero Club</h3>
    {gifts.data.map(gift => {
      const status = membershipGiftStatus(gift, now);
      return <article key={gift.id} className="min-w-0 rounded-2xl border border-primary/20 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{gift.duration_days} days of {gift.plan.name}</h4><span className="text-xs capitalize text-muted-foreground">{status}</span></div>
        {status === "pending" ? <>
          <p className="mt-2 text-sm text-muted-foreground">Claim by {dateLabel(gift.claim_deadline)}. Your subscription starts when you claim it; an existing subscription to this plan is extended.</p>
          <ul className="mt-3 space-y-1 text-sm">{gift.plan.features.map(feature => <li key={feature}>• {feature}</li>)}</ul>
          <button disabled={claim.isPending} onClick={() => claim.mutate(gift.id)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{claim.isPending && claim.variables === gift.id && <Loader2 className="h-4 w-4 animate-spin" />}Claim membership gift</button>
        </> : <p className="mt-2 text-sm text-muted-foreground">{status === "claimed" ? `Claimed ${dateLabel(gift.claimed_at!)}. Your membership includes this gift.` : `Expired on ${dateLabel(gift.claim_deadline)} without being claimed.`}</p>}
      </article>;
    })}
  </section>;
}
