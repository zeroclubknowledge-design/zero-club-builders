import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Gift, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { zc } from "@/lib/config";
import { AppShell, PageHead } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { GiftCardVisual, giftServices } from "@/components/GiftCardVisual";
import { GiftCodeRedeemer } from "@/components/GiftCodeRedeemer";
import { AdminGiftInbox } from "@/features/membership/AdminGiftInbox";
import { MembershipGiftInbox } from "@/features/membership/MembershipGifts";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { NAV } from "./nav";

/** Where each kind of credit gets spent on Zero Club. */
const WHERE: Record<string, { path: string; action: string }> = {
  universal: { path: "/app", action: "Use at any checkout" },
  bootcamps: { path: "/app/bootcamps", action: "Pick a bootcamp" },
  membership: { path: "/app/premium", action: "Use for membership" },
  "zero-ai": { path: "/app/zero-ai", action: "Open Zero AI" },
  "zero-store": { path: "/app/store", action: "Shop Zero Store" },
  "tutor-session": { path: "/app", action: "Book a tutor session" },
};

/**
 * Everything given to you: Zero Cards you can still spend, membership and
 * Zero Club gifts waiting to be claimed, and a box for a code someone sent you.
 */
export function ReceivedGifts() {
  const { session, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { format } = useWalletCurrency();
  useEffect(() => { if (!loading && !session) void navigate({ to: "/signin" }); }, [loading, session, navigate]);

  const cards = useQuery({
    queryKey: ["available-restricted-zero-gifts", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_cards")
        .select("id, code, amount, remaining_amount, service, template_id, message, claimed_at, bootcamp_ids, expires_at")
        .eq("claimed_by", profile!.id)
        .eq("status", "claimed")
        .gt("remaining_amount", 0)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("claimed_at", { ascending: false });
      if (error && ["42703", "PGRST204"].includes(error.code || "")) return [];
      if (error) throw error;
      return data || [];
    },
  });
  const list = (cards.data || []) as any[];
  const total = list.reduce((s, c) => s + Number(c.remaining_amount || 0), 0);

  return (
    <AppShell brand={<Brand />} nav={NAV}>
      <PageHead
        eyebrow="Received"
        title="Gifts for you"
        sub="Zero Cards you can spend on Zero Club, and gifts waiting for you to claim."
        action={total > 0 ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Gift credit</p>
            <p className="font-display text-[18px] font-bold tabular-nums">{format(total)}</p>
          </div>
        ) : undefined}
      />
      <div className="mx-auto grid max-w-[1080px] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <AdminGiftInbox userId={profile?.id} />
          <MembershipGiftInbox userId={profile?.id} />
          {cards.isLoading ? (
            <div className="grid place-items-center rounded-[22px] border border-border bg-card py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border bg-card px-6 py-14 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><Gift className="h-6 w-6" /></span>
              <h3 className="mt-3 text-[16px] font-bold">No gift credit right now</h3>
              <p className="mx-auto mt-1 max-w-[340px] text-[13.5px] text-muted-foreground">When someone sends you a Zero Card, open their link or enter the code here. It shows up ready to spend.</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {list.map((g) => {
                const label = giftServices.find((s) => s.id === g.service)?.label || g.service;
                const where = WHERE[g.service] || WHERE.universal;
                return (
                  <article key={g.id} className="min-w-0">
                    <GiftCardVisual amount={g.amount} service={g.service} templateId={g.template_id} code={g.code} message={g.message} />
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-bold">{format(Number(g.remaining_amount))} left · {label}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          of {format(Number(g.amount))}{g.expires_at ? ` · use by ${new Date(g.expires_at).toLocaleDateString()}` : ""}
                          {g.bootcamp_ids?.length ? ` · ${g.bootcamp_ids.length} bootcamp${g.bootcamp_ids.length === 1 ? "" : "s"} only` : ""}
                        </p>
                      </div>
                      <a href={zc(where.path)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background">
                        Use <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <section className="rounded-[22px] border border-border bg-card p-4">
            <h2 className="text-[15px] font-bold">Have a gift code?</h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Enter it to add the credit to your account.</p>
            <div className="mt-3">
              <GiftCodeRedeemer onClaim={() => { void cards.refetch(); void refreshProfile(); }} />
            </div>
          </section>
          <section className="rounded-[22px] bg-[linear-gradient(130deg,#1a0b17,#3b0f3a_60%,#24104a)] p-5 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#ff8fd2]">How credit works</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-white/75">Gift credit pays first at checkout on Zero Club; your wallet only covers what's left. Unused credit expires on the card's date.</p>
            <a href={zc("/app/wallet")} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#1a0b17]">Open my wallet <ArrowUpRight className="h-4 w-4" /></a>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
