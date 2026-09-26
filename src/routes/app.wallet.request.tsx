import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Copy, Link2, Loader2, Plus } from "@/components/icons/glyphs";
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
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <Link to="/app/wallet" aria-label="Back to wallet" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </Link>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Request money</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {createdSlug ? (
          /* Straight to the link. Nobody creates a request in order to admire
             the form afterwards. */
          <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1a7f4b]/10 px-2.5 py-1 text-[12px] font-semibold text-[#1a7f4b]">
              <Check className="h-3.5 w-3.5" /> Ready to send
            </span>
            <h2 className="mt-2.5 font-display text-[18px] font-semibold">Your request link</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              Anyone can pay this by card — they don't need a Zero Club account. Your wallet is credited the moment it clears.
            </p>
            <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-[#cc208f]/[0.06] p-3">
              <Link2 className="h-[18px] w-[18px] shrink-0 text-[#cc208f]" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{shareUrl.replace(/^https?:\/\//, "")}</span>
              <button
                onClick={() => copyToClipboard(shareUrl, "Request link copied")}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-[13px] font-semibold text-background"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
            <div className="mt-2.5 flex gap-2">
              <ShareMenu
                url={shareUrl}
                title="Fund my Zero Club wallet"
                text="Here is my Zero Club request link"
                label="Share"
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-foreground/20 text-[14px] font-semibold text-foreground transition hover:bg-foreground/[0.04]"
              />
              <button
                onClick={() => setCreatedSlug(null)}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-foreground/20 text-[14px] font-semibold text-foreground transition hover:bg-foreground/[0.04]"
              >
                <Plus className="h-4 w-4" /> New request
              </button>
            </div>
          </section>
        ) : (
          <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Create a link anyone can use to fund your wallet — for a bootcamp, a laptop or your next build. They can pay by card without an account.
            </p>
            <div className="mt-4 flex flex-col gap-3.5">
              <label className="block">
                <span className={LABEL}>Amount ({details.symbol})</span>
                <input
                  id="request-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="Leave blank to let them decide"
                  className={`${FIELD} font-semibold tabular-nums`}
                />
              </label>
              <label className="block">
                <span className={LABEL}>What's it for?</span>
                <input
                  id="request-note"
                  value={note}
                  maxLength={120}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Bootcamp fee, design work, split bill…"
                  className={FIELD}
                />
              </label>
              <button
                onClick={createRequest}
                disabled={creating}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create link"}
              </button>
            </div>
          </section>
        )}

        <section className="flex-1 bg-card pb-28 md:flex-none md:overflow-hidden md:rounded-xl md:border md:border-border md:pb-2">
          <h2 className="px-4 pb-2 pt-4 font-display text-[18px] font-semibold">Your requests</h2>
          {isLoading ? (
            <div className="grid min-h-28 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : links.length === 0 ? (
            <p className="border-t border-border/60 px-4 py-8 text-center text-[14px] text-muted-foreground">
              Nothing yet. Your requests and what they've collected show up here.
            </p>
          ) : (
            links.map((link) => {
              const collected = received[link.id] || { total: 0, count: 0 };
              const closed = link.status !== "active";
              const target = Number(link.amount) || 0;
              const percent = target > 0 ? Math.min(100, Math.round((collected.total / target) * 100)) : 0;
              return (
                <div key={link.id} className="border-t border-border/60 px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-semibold">{link.note || "Request"}</p>
                    <p className={`shrink-0 text-[14px] font-semibold tabular-nums ${closed && collected.total > 0 ? "text-[#1a7f4b]" : ""}`}>
                      {target > 0 ? `${format(collected.total)} of ${format(target)}` : collected.total > 0 ? format(collected.total) : "Any amount"}
                    </p>
                  </div>
                  {target > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                      <div className="h-full rounded-full bg-[#1a7f4b] transition-[width] duration-500" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted-foreground">
                    <span>
                      {collected.count > 0 ? `${collected.count} ${collected.count === 1 ? "person" : "people"} paid` : "No payments yet"}
                      {" · "}
                      <span className={closed ? "" : "font-semibold text-[#1a7f4b]"}>{closed ? "Closed" : "Open"}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => copyToClipboard(fundLinkUrl(link.slug), "Request link copied")}
                        aria-label="Copy link"
                        className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/[0.05] hover:text-foreground"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <ShareMenu
                        url={fundLinkUrl(link.slug)}
                        title="Fund my Zero Club wallet"
                        text={link.note ? `Zero Club request: ${link.note}` : "Here is my Zero Club request link"}
                        label="Share"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.05]"
                      />
                      {!closed && (
                        <button
                          onClick={() => closeRequest(link.slug)}
                          className="inline-flex h-8 items-center rounded-full px-2.5 text-[13px] font-semibold hover:text-destructive"
                        >
                          Close
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <p className="border-t border-border/60 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            Money received through a request can be spent anywhere on Zero Club, but it isn't earnings, so it can't be withdrawn to a bank.
          </p>
        </section>
      </main>
    </div>
  );
}

const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD = "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 placeholder:font-normal focus:border-foreground/40";
