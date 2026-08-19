import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ChevronLeft,
  Check,
  Copy,
  HandCoins,
  Loader2,
  Plus,
  X,
} from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { copyToClipboard, fundLinkUrl } from "@/lib/share";
import { ShareMenu } from "@/components/ShareMenu";
import { toast } from "sonner";

/**
 * Ask anyone for money, whether or not they are on Zero Club.
 *
 * A request is a fund link: a short public URL that opens a page showing what
 * is being asked for and who is asking. A member pays from their wallet in one
 * tap; anyone else pays by card without making an account. Either way the
 * money lands in the requester's wallet on its own — the Paystack webhook
 * credits it, so nothing depends on the payer coming back to the app
 * afterwards.
 */

export const Route = createFileRoute("/app/wallet/request")({
  component: RequestPage,
});

type FundLink = {
  id: string;
  slug: string;
  amount: number | null;
  note: string | null;
  status: "active" | "closed";
  expires_at: string | null;
  created_at: string;
};

function RequestPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  const { details, format, toBaseAmount } = useWalletCurrency();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["fund-links", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      // Both tables are restricted to the owner by RLS, so these return this
      // member's rows and nobody else's.
      const [{ data: links }, { data: payments }] = await Promise.all([
        supabase.from("fund_links").select("*").order("created_at", { ascending: false }),
        supabase.from("fund_link_payments").select("link_id, amount, status").eq("status", "paid"),
      ]);

      const received: Record<string, { total: number; count: number }> = {};
      for (const payment of payments || []) {
        const entry = (received[payment.link_id] ||= { total: 0, count: 0 });
        entry.total += Number(payment.amount) || 0;
        entry.count += 1;
      }

      return { links: (links || []) as FundLink[], received };
    },
  });

  const links = data?.links || [];
  const received = data?.received || {};
  const shareUrl = createdSlug ? fundLinkUrl(createdSlug) : "";

  const createRequest = async () => {
    const typed = Number(amount);
    if (amount.trim() && (!Number.isFinite(typed) || typed <= 0)) {
      toast.error("Enter a valid amount, or leave it blank to let them decide");
      return;
    }

    setCreating(true);
    try {
      const { data: created, error } = await supabase.rpc("create_fund_link", {
        p_amount: typed > 0 ? toBaseAmount(typed) : null,
        p_note: note.trim() || null,
        p_expires_days: null,
      });
      if (error) throw error;

      setCreatedSlug((created as any)?.slug || null);
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["fund-links"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not create the request");
    } finally {
      setCreating(false);
    }
  };

  const closeRequest = async (slug: string) => {
    try {
      const { error } = await supabase.rpc("close_fund_link", { p_slug: slug });
      if (error) throw error;
      toast.success("Request closed. The link no longer accepts payments.");
      if (createdSlug === slug) setCreatedSlug(null);
      queryClient.invalidateQueries({ queryKey: ["fund-links"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not close the request");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[640px] items-center gap-3">
          <Link to="/app/wallet" aria-label="Back to wallet" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p>
            <h1 className="text-[18px] font-semibold tracking-tight">Request money</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-4 py-5 md:px-7 md:py-7">
        {createdSlug ? (
          /* Straight to the link. Nobody creates a request in order to admire
             the form afterwards. */
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#241a2b] via-[#17131b] to-[#0e0c10] p-5 text-white shadow-[0_28px_65px_-40px_rgba(20,12,19,0.85)] ring-1 ring-black/10 sm:p-6">
            <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-[#cc208f]/25 blur-[70px]" />
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full border-[18px] border-white opacity-[0.045]" />

            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                <Check className="h-3 w-3" strokeWidth={3} /> Ready to send
              </span>
              <h2 className="mt-3 text-[19px] font-semibold tracking-tight">Your request link</h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
                Anyone can open this and pay you — a card is enough, they do not need a Zero Club account.
                Your wallet is credited the moment the payment clears.
              </p>

              <p className="mt-4 break-all rounded-lg bg-black/30 px-3 py-2.5 font-mono text-[11.5px] text-white/80 ring-1 ring-white/10">
                {shareUrl}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ShareMenu
                  url={shareUrl}
                  title="Fund my Zero Club wallet"
                  text="Here is my Zero Club request link"
                  label="Share"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[12.5px] font-semibold text-[#12101a] transition active:scale-95"
                />
                <button
                  onClick={() => copyToClipboard(shareUrl, "Request link copied")}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/20 px-4 text-[12.5px] font-semibold text-white transition hover:bg-white/10 active:scale-95"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <button
                  onClick={() => setCreatedSlug(null)}
                  className="inline-flex h-10 items-center gap-1.5 px-3 text-[12.5px] font-semibold text-white/55 transition hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> New request
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_14px_34px_-24px_rgba(0,0,0,0.18)] sm:p-6">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/[0.08] text-primary ring-1 ring-primary/15">
              <HandCoins className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <h2 className="mt-3.5 text-[17px] font-semibold tracking-tight">Ask anyone to pay you</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Create a link, send it to whoever owes you. They can pay by card without an account,
              and the money arrives in your wallet automatically.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="request-amount" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Amount ({details.symbol})
                </label>
                <input
                  id="request-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="Leave blank to let them decide"
                  className="mt-1.5 h-12 w-full rounded-lg border border-border bg-background px-3.5 text-[15px] font-semibold tabular-nums outline-none transition focus:border-primary/50"
                />
              </div>

              <div>
                <label htmlFor="request-note" className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  What is it for
                </label>
                <input
                  id="request-note"
                  value={note}
                  maxLength={120}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Design work, cohort fee, split bill…"
                  className="mt-1.5 h-12 w-full rounded-lg border border-border bg-background px-3.5 text-[14px] outline-none transition focus:border-primary/50"
                />
              </div>
            </div>

            <button
              onClick={createRequest}
              disabled={creating}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create request link"}
            </button>
          </section>
        )}

        <section className="mt-6">
          <h3 className="px-1 text-[13px] font-semibold tracking-tight">Your requests</h3>

          {isLoading ? (
            <div className="mt-3 grid min-h-28 place-items-center rounded-xl border border-border bg-card">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-8 text-center text-[12.5px] text-muted-foreground">
              Nothing yet. Your requests and what they have collected will show up here.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {links.map((link) => {
                const collected = received[link.id] || { total: 0, count: 0 };
                const closed = link.status !== "active";
                return (
                  <div key={link.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold tracking-tight tabular-nums">
                          {link.amount ? format(Number(link.amount)) : "Any amount"}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {link.note || "No description"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${closed ? "bg-foreground/[0.06] text-muted-foreground" : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"}`}>
                        {closed ? "Closed" : "Active"}
                      </span>
                    </div>

                    <p className="mt-2.5 text-[11.5px] text-muted-foreground">
                      {collected.count > 0
                        ? <>Received <strong className="font-semibold text-foreground tabular-nums">{format(collected.total)}</strong> from {collected.count} {collected.count === 1 ? "payment" : "payments"}</>
                        : "No payments yet"}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                      <button
                        onClick={() => copyToClipboard(fundLinkUrl(link.slug), "Request link copied")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11.5px] font-semibold text-foreground transition hover:bg-accent/40"
                      >
                        <Copy className="h-3 w-3" /> Copy link
                      </button>
                      <ShareMenu
                        url={fundLinkUrl(link.slug)}
                        title="Fund my Zero Club wallet"
                        text={link.note ? `Zero Club request: ${link.note}` : "Here is my Zero Club request link"}
                        label="Share"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11.5px] font-semibold text-foreground transition hover:bg-accent/40"
                      />
                      {!closed && (
                        <button
                          onClick={() => closeRequest(link.slug)}
                          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] font-semibold text-muted-foreground transition hover:text-destructive"
                        >
                          <X className="h-3 w-3" /> Close
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Money received through a request is float, not earnings, so it can be spent anywhere on
          Zero Club but is not withdrawable to a bank account.
        </p>
      </main>
    </div>
  );
}
