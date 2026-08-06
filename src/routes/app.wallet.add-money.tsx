import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, ArrowRight, WalletCards, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { openPaystackCheckout, buildReference, paystackPublicKey, paystackKeyProblem } from "@/lib/paystack";

export const Route = createFileRoute("/app/wallet/add-money")({ component: AddMoneyPage });

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

function AddMoneyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currency, details, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const { data: profile } = useUser();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "paying" | "verifying">("idle");
  const numericAmount = toBaseAmount(Number(amount) || 0);
  const busy = status !== "idle";

  const handlePay = async () => {
    if (numericAmount <= 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!session || !email) {
      toast.error("Please sign in again to add money");
      return;
    }
    const keyProblem = paystackKeyProblem();
    if (keyProblem) {
      toast.error("Payments are not set up correctly", { description: keyProblem });
      return;
    }

    const reference = buildReference(session.user.id);
    // Charge in the currency the member is viewing; the wallet is credited
    // from Paystack's own record of the transaction.
    const chargeAmount = Number(amount);

    try {
      setStatus("paying");

      // Record who this payment belongs to *before* checkout. If the browser
      // never comes back, the Paystack webhook still knows which wallet to
      // credit, so money is never lost.
      await supabase.rpc("start_wallet_topup", { reference, amount: numericAmount });

      await openPaystackCheckout({
        email,
        amount: chargeAmount,
        currency,
        reference,
        profileId: session.user.id,
        displayName: profile?.full_name || profile?.username,
      });

      setStatus("verifying");
      const { data, error } = await supabase.functions.invoke("paystack-verify", {
        body: { reference },
      });

      if (error) throw new Error(error.message || "We could not confirm your payment");
      if ((data as any)?.error) throw new Error((data as any).error);

      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["wallet-activities"] });

      toast.success(
        (data as any)?.credited === false
          ? "This payment was already added to your wallet"
          : "Wallet funded successfully",
      );
      navigate({ to: "/app/wallet" });
    } catch (error: any) {
      const message = error?.message || "Payment could not be completed";
      if (message === "Payment cancelled") {
        toast("Payment cancelled");
      } else {
        // The card may still have been charged. Paystack's webhook credits the
        // wallet independently, so reassure rather than alarm, and refresh in
        // case the money has already landed.
        toast.error(message, {
          description: "If your card was charged, the money will appear in your wallet automatically.",
        });
        queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      }
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <button onClick={() => navigate({ to: "/app/wallet" })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"><ArrowLeft className="h-[18px] w-[18px]" /></button>
          <div><p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p><h1 className="text-[18px] font-semibold tracking-tight">Add money</h1></div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[760px] gap-5 px-4 py-6 md:grid-cols-[minmax(0,1fr)_250px] md:px-7 md:py-8">
        <section className="rounded-lg border border-border bg-card p-5 sm:p-7">
          <div className="text-center">
            <label className="text-[11px] font-medium uppercase text-muted-foreground">Amount to add</label>
            <div className="mt-4 flex items-baseline justify-center gap-1">
              <span className="text-[26px] text-muted-foreground">{details.symbol}</span>
              <input type="number" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} placeholder="0" autoFocus className="w-auto min-w-[80px] max-w-[240px] bg-transparent text-center text-[48px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:text-[56px]" style={{ width: `${Math.max(1, amount.length)}ch` }} />
            </div>
            <div className="mx-auto mt-2 h-[2px] w-16 rounded-full bg-primary/60" />
          </div>

          <div className="mt-9 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_AMOUNTS.map((quick) => <button key={quick} disabled={busy} onClick={() => setAmount(String(fromBaseAmount(quick)))} className={`rounded-lg py-2.5 text-[12px] font-semibold tabular-nums disabled:opacity-50 ${numericAmount === quick ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>{format(quick)}</button>)}
          </div>

          <button onClick={handlePay} disabled={numericAmount <= 0 || busy} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40">
            {status === "verifying" ? (<><Loader2 className="h-4 w-4 animate-spin" />Confirming payment</>)
              : status === "paying" ? (<><Loader2 className="h-4 w-4 animate-spin" />Waiting for Paystack</>)
              : (<>{numericAmount > 0 ? `Pay ${format(numericAmount)} with Paystack` : "Pay with Paystack"}<ArrowRight className="h-4 w-4" /></>)}
          </button>

          {paystackKeyProblem() && (
            <p className="mt-3 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-[11px] leading-relaxed text-amber-700 ring-1 ring-amber-500/20">
              {paystackKeyProblem()}
            </p>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg bg-[#171218] p-5 text-white"><WalletCards className="h-5 w-5 text-[#f06ac3]" /><h2 className="mt-4 text-[16px] font-semibold">Fund your wallet</h2><p className="mt-1.5 text-[12px] leading-relaxed text-white/60">Use your balance for memberships, bootcamps, products, and builder transactions.</p></div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"><ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" /><p className="text-[12px] leading-relaxed text-muted-foreground">Processed securely by Paystack. Successful payments arrive instantly.</p></div>
        </aside>
      </main>
    </div>
  );
}
