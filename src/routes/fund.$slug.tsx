import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, WalletCards, CreditCard, CheckCircle2 } from "@/components/icons/solar";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { openPaystackCheckout, buildReference, paystackKeyProblem } from "@/lib/paystack";

/**
 * Public payment page for a fund link.
 *
 * Two audiences, one page:
 *
 *   Signed in   can pay from their own Zero Club wallet, instantly and with no
 *               card involved, or pay by card if their wallet is short.
 *   Signed out  has no wallet, so card only. They never need an account.
 *
 * Either way the money lands in the LINK OWNER's wallet. The browser never
 * decides that — start_fund_link_topup writes the owner into wallet_topups
 * before checkout opens, and the Paystack webhook credits from there.
 */
export const Route = createFileRoute("/fund/$slug")({
  component: FundLinkPage,

  loader: async ({ params }) => {
    try {
      const { data, error } = await supabase.rpc("get_fund_link_public", { p_slug: params.slug });
      if (error || !data?.found) return null;
      return data as {
        slug: string;
        amount: number | null;
        note: string | null;
        status: string;
        expired: boolean;
        owner_id: string;
        owner_name: string | null;
        owner_username: string | null;
        owner_avatar: string | null;
      };
    } catch {
      return null;
    }
  },

  head: ({ loaderData }) => {
    if (!loaderData?.owner_name) return {};

    const who = loaderData.owner_name;
    const title = `Send money to ${who} on Zero Club`;
    const description =
      loaderData.note?.slice(0, 200).trim() ||
      `${who} has shared a Zero Club fund link. Pay by card, or from your Zero Club wallet.`;

    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Zero Club" },
      { property: "og:url", content: `https://www.zeroclubs.xyz/fund/${loaderData.slug}` },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];

    if (loaderData.owner_avatar) {
      meta.push(
        { property: "og:image", content: loaderData.owner_avatar },
        { name: "twitter:image", content: loaderData.owner_avatar },
      );
    }

    return { meta };
  },
});

function FundLinkPage() {
  const link = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { currency, details, format, toBaseAmount } = useWalletCurrency();

  const [session, setSession] = useState<any>(null);
  const [checkedSession, setCheckedSession] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const [amount, setAmount] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState<null | "wallet" | "card">(null);
  const [done, setDone] = useState(false);

  const fixed = link?.amount != null;
  const displayFixed = fixed ? Number(link!.amount) / details.rate : 0;
  const entered = fixed ? Number(link!.amount) : toBaseAmount(Number(amount) || 0);
  const chargeMajor = entered / details.rate;

  const unusable = !link || link.status !== "active" || link.expired;
  const isOwnLink = !!session && link?.owner_id === session.user?.id;

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setCheckedSession(true);
      if (data.session?.user?.id) {
        const { data: me } = await supabase
          .from("profiles")
          .select("coins, full_name, username")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (me) {
          setBalance(Number(me.coins) || 0);
          setGuestName(me.full_name || me.username || "");
        }
      }
    });
  }, []);

  const payFromWallet = async () => {
    if (entered <= 0) return toast.error("Enter an amount");
    setBusy("wallet");
    try {
      const { error } = await supabase.rpc("pay_fund_link_from_wallet", {
        p_slug: slug,
        p_amount: entered,
      });
      if (error) throw error;
      setDone(true);
      toast.success(`Sent ${format(entered)} to ${link?.owner_name || "them"}`);
    } catch (error: any) {
      toast.error(error?.message || "That payment could not be completed");
    } finally {
      setBusy(null);
    }
  };

  const payByCard = async () => {
    if (entered <= 0) return toast.error("Enter an amount");

    const email = session?.user?.email || guestEmail.trim();
    if (!email || !email.includes("@")) {
      return toast.error("Enter the email address for your receipt");
    }

    const problem = paystackKeyProblem();
    if (problem) {
      return toast.error("Payments are not set up correctly", { description: problem });
    }

    const reference = buildReference(link!.owner_id);
    setBusy("card");

    try {
      // Recorded before checkout, so the owner is credited by the webhook even
      // if this browser never comes back.
      const { error: startError } = await supabase.rpc("start_fund_link_topup", {
        p_slug: slug,
        p_amount: entered,
        p_reference: reference,
        p_payer_label: guestName.trim() || email,
      });
      if (startError) throw startError;

      await openPaystackCheckout({
        email,
        amount: chargeMajor,
        currency,
        reference,
        // Signed in: their own id, so paystack-verify's ownership check passes.
        // Signed out: the owner's id, which is the webhook's fallback.
        profileId: session?.user?.id || link!.owner_id,
        displayName: guestName.trim() || email,
      });

      if (session) {
        // Confirm immediately. This credits the owner, not the payer, because
        // credit_wallet_from_paystack trusts the wallet_topups row.
        const { error } = await supabase.functions.invoke("paystack-verify", { body: { reference } });
        if (error) throw new Error(error.message || "We could not confirm your payment");
        setDone(true);
        toast.success("Payment complete");
        return;
      }

      // No session, so no verify call is possible. Wait for the webhook.
      toast.success("Payment received — confirming…");
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const { data } = await supabase.rpc("get_fund_link_payment_status", { p_reference: reference });
        if (data?.status === "paid") {
          setDone(true);
          return;
        }
      }
      // Paystack took the money; the webhook will still land. Never imply failure.
      setDone(true);
    } catch (error: any) {
      const message = error?.message || "Payment could not be completed";
      if (message.toLowerCase().includes("cancel")) {
        toast("Payment cancelled");
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f7f5] text-foreground dark:bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[720px] items-center px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" loading="lazy" decoding="async" />
            <span className="font-display text-[16px] font-semibold tracking-tight">
              Zero <span className="text-primary">Club</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[440px] px-5 py-12">
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" strokeWidth={1.5} />
            <h1 className="mt-5 font-display text-[26px] font-semibold tracking-tight">Money sent</h1>
            <p className="mt-2.5 text-[14px] leading-7 text-muted-foreground">
              {link?.owner_name || "They"} will see it in their Zero Club wallet.
            </p>
            <Link
              to="/app/wallet"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-8 text-[14.5px] font-semibold text-background transition hover:opacity-90"
            >
              Open Zero Club <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : !link ? (
          <div className="text-center">
            <h1 className="font-display text-[26px] font-semibold tracking-tight">Link not found</h1>
            <p className="mt-2.5 text-[14px] leading-7 text-muted-foreground">
              This fund link does not exist, or it has been removed.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-primary/10 text-[24px] font-semibold text-primary">
                {link.owner_avatar ? (
                  <img src={link.owner_avatar} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  (link.owner_name || "?").charAt(0).toUpperCase()
                )}
              </div>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                Fund a Zero Club wallet
              </p>
              <h1 className="mt-2.5 font-display text-[26px] font-semibold leading-tight tracking-tight">
                {link.owner_name || "A Zero Club member"}
              </h1>
              {link.owner_username && (
                <p className="mt-1 text-[13px] text-muted-foreground">@{link.owner_username}</p>
              )}
              {link.note && (
                <p className="mt-4 text-[14px] leading-7 text-muted-foreground">{link.note}</p>
              )}
            </div>

            {unusable ? (
              <p className="mt-8 rounded-xl bg-card px-4 py-5 text-center text-[13.5px] text-muted-foreground ring-1 ring-border">
                {link.expired
                  ? "This fund link has expired."
                  : "This fund link has been closed by its owner."}
              </p>
            ) : isOwnLink ? (
              <p className="mt-8 rounded-xl bg-card px-4 py-5 text-center text-[13.5px] text-muted-foreground ring-1 ring-border">
                This is your own fund link. Share it with someone else so they can add money to
                your wallet.
              </p>
            ) : (
              <div className="mt-8 space-y-5">
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Amount
                  </label>
                  {fixed ? (
                    <div className="rounded-xl bg-card px-4 py-4 text-center ring-1 ring-border">
                      <div className="text-[28px] font-semibold tracking-tight tabular-nums">
                        {format(Number(link.amount))}
                      </div>
                      <div className="mt-1 text-[11.5px] text-muted-foreground">
                        Fixed by {link.owner_name || "the recipient"}
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-muted-foreground">
                        {details.symbol}
                      </span>
                      <input
                        type="number"
                        min="1"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="5000"
                        className="h-14 w-full rounded-xl bg-background pl-10 pr-4 text-[18px] font-semibold tabular-nums outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  )}
                </div>

                {checkedSession && !session && (
                  <div className="grid gap-2.5">
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your name (optional)"
                      className="h-12 w-full rounded-xl bg-background px-4 text-[14px] outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                    />
                    <input
                      type="email"
                      inputMode="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="Email for your receipt"
                      className="h-12 w-full rounded-xl bg-background px-4 text-[14px] outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                )}

                {session && (
                  <button
                    onClick={payFromWallet}
                    disabled={busy !== null || entered <= 0 || (balance !== null && balance < entered)}
                    className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[14px] font-semibold tracking-tight text-primary-foreground tap hover:opacity-90 disabled:opacity-40"
                  >
                    {busy === "wallet" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <WalletCards className="h-4 w-4" />
                    )}
                    Pay from my wallet
                  </button>
                )}

                <button
                  onClick={payByCard}
                  disabled={busy !== null || entered <= 0}
                  className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-semibold tracking-tight tap hover:opacity-90 disabled:opacity-40 ${
                    session
                      ? "ring-1 ring-border text-foreground hover:bg-foreground/[0.03]"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {busy === "card" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Pay {entered > 0 ? format(entered) : ""} by card
                </button>

                {session && balance !== null && (
                  <p className="text-center text-[12px] text-muted-foreground">
                    Wallet balance {format(balance)}
                    {balance < entered && entered > 0 && " — not enough, use a card"}
                  </p>
                )}

                <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Goes straight to {link.owner_name || "their"} Zero Club wallet
                </p>

                {!fixed && displayFixed === 0 && null}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
