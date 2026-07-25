import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, ArrowRight, WalletCards } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/wallet/add-money")({ component: AddMoneyPage });

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

function AddMoneyPage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const numericAmount = parseInt(amount) || 0;

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
              <span className="text-[26px] text-muted-foreground">₦</span>
              <input type="number" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" autoFocus className="w-auto min-w-[80px] max-w-[240px] bg-transparent text-center text-[48px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:text-[56px]" style={{ width: `${Math.max(1, amount.length)}ch` }} />
            </div>
            <div className="mx-auto mt-2 h-[2px] w-16 rounded-full bg-primary/60" />
          </div>

          <div className="mt-9 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_AMOUNTS.map((quick) => <button key={quick} onClick={() => setAmount(String(quick))} className={`rounded-lg py-2.5 text-[12px] font-semibold tabular-nums ${numericAmount === quick ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>₦{quick.toLocaleString()}</button>)}
          </div>

          <button disabled={numericAmount <= 0} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40">
            {numericAmount > 0 ? `Pay ₦${numericAmount.toLocaleString()} with Paystack` : "Pay with Paystack"}<ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg bg-[#171218] p-5 text-white"><WalletCards className="h-5 w-5 text-[#f06ac3]" /><h2 className="mt-4 text-[16px] font-semibold">Fund your wallet</h2><p className="mt-1.5 text-[12px] leading-relaxed text-white/60">Use your balance for memberships, bootcamps, products, and builder transactions.</p></div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"><ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" /><p className="text-[12px] leading-relaxed text-muted-foreground">Processed securely by Paystack. Successful payments arrive instantly.</p></div>
        </aside>
      </main>
    </div>
  );
}
