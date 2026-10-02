import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useGoBack } from "@/hooks/useGoBack";
import { ArrowLeft, Clock, ArrowRight, Landmark, ShieldCheck } from "@/components/icons/glyphs";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

export const Route = createFileRoute("/app/wallet/withdraw")({ component: WithdrawPage });

function WithdrawPage() {
  const goBackSmart = useGoBack("/app/wallet");
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const { details, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const [amount, setAmount] = useState("");
  const numericAmount = toBaseAmount(Number(amount) || 0);

  /*
   * The cap is earnings, not balance.
   *
   * Topped-up money is float — it came in to be spent on Zero Club, and paying
   * it back out to a bank account is a refund, not a withdrawal. Allowing it
   * would also open the card-in / bank-out route that chargeback fraud runs on.
   *
   * Falls back to the full balance only when the split function is not
   * installed, so this page still behaves rather than showing zero.
   */
  const { data: split } = useQuery({
    queryKey: ["withdrawable", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_withdrawable_balance");
      if (error) return null;
      return data as { balance: number; earned: number; withdrawable: number } | null;
    },
  });

  const balance = profile?.coins || 0;
  const withdrawable = split ? Number(split.withdrawable) : balance;
  const overBalance = numericAmount > withdrawable;

  const hasBank = Boolean(profile?.bank_name && profile?.account_number);
  const lastFour = String(profile?.account_number || "").slice(-4);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button onClick={goBackSmart} aria-label="Back to wallet" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Withdraw</h1>
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className="bg-card px-4 pb-5 pt-6 text-center md:rounded-xl md:border md:border-border">
          <p className="text-[13px] font-semibold text-muted-foreground">Available to withdraw</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular-nums">{format(withdrawable)}</p>
          <div className="mt-4 flex items-baseline justify-center gap-1">
            <span className="font-display text-[30px] font-semibold text-muted-foreground">{details.symbol}</span>
            <input
              type="number"
              inputMode="decimal"
              aria-label="Amount to withdraw"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
              autoFocus
              className="min-w-[70px] max-w-[260px] bg-transparent text-center font-display text-[44px] font-semibold tracking-[-0.02em] tabular-nums outline-none placeholder:text-muted-foreground/35 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              style={{ width: `${Math.max(1, amount.length)}ch` }}
            />
          </div>
          {overBalance ? (
            <p className="mt-1 text-[13px] font-semibold text-destructive">More than you've earned</p>
          ) : (
            <button type="button" onClick={() => setAmount(String(withdrawable > 0 ? fromBaseAmount(withdrawable) : ""))} className="mt-1 text-[14px] font-semibold text-[#cc208f] hover:text-[#a3186f]">
              Withdraw all
            </button>
          )}
          {split && Number(split.balance) > withdrawable && (
            <p className="mx-auto mt-3 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
              Your balance is {format(Number(split.balance))}, but only earnings can be withdrawn. Money you added is for spending on Zero Club.
            </p>
          )}
        </section>

        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <h2 className="px-4 pb-2 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">To</h2>
          <Link to="/app/wallet/settings" className="flex items-center gap-3 border-t border-border/60 px-4 py-3.5 hover:bg-foreground/[0.02]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-foreground/[0.06]"><Landmark className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              {hasBank ? (
                <>
                  <span className="block truncate text-[15px] font-semibold">{profile.bank_name} ···· {lastFour}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{profile.account_name || "Payout account"}</span>
                </>
              ) : (
                <>
                  <span className="block text-[15px] font-semibold">Add a bank account</span>
                  <span className="block text-[13px] text-muted-foreground">Where your earnings should be paid</span>
                </>
              )}
            </span>
            <span className="shrink-0 text-[14px] font-semibold text-muted-foreground">{hasBank ? "Change" : "Add"}</span>
          </Link>
        </section>

        <section className="flex flex-1 flex-col bg-card px-4 pb-28 pt-4 md:flex-none md:rounded-xl md:border md:border-border md:pb-4">
          <button
            disabled={numericAmount <= 0 || overBalance || !hasBank}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {numericAmount > 0 && !overBalance ? `Withdraw ${format(numericAmount)}` : "Withdraw"}
            {numericAmount > 0 && !overBalance && <ArrowRight className="h-4 w-4" />}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Arrives within 24 hours
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Protected by your wallet security and payout checks
          </p>
        </section>
      </main>
    </div>
  );
}
