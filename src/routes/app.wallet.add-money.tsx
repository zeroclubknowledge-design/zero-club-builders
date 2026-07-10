import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, ArrowRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/wallet/add-money")({
  component: AddMoneyPage,
});

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

function AddMoneyPage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");

  const numericAmount = parseInt(amount) || 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="flex items-center gap-3 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4">
        <button
          onClick={() => navigate({ to: "/app/wallet" })}
          className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04] shrink-0"
        >
          <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Add funds</h1>
      </header>

      <div className="flex flex-col px-6 pt-10 max-w-md mx-auto">
        {/* Amount — editorial display type */}
        <div className="text-center">
          <label className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Amount to add
          </label>
          <div className="mt-4 flex items-baseline justify-center gap-1">
            <span className="text-[28px] font-normal text-muted-foreground">₦</span>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-auto min-w-[80px] max-w-[240px] bg-transparent text-center text-[56px] font-semibold tracking-tight tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{ width: `${Math.max(1, amount.length)}ch` }}
            />
          </div>
          <div className="mx-auto mt-2 h-[2px] w-16 rounded-full bg-primary/60" />
        </div>

        {/* Quick amounts */}
        <div className="mt-10 grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((quick) => (
            <button
              key={quick}
              onClick={() => setAmount(String(quick))}
              className={`rounded-full py-2.5 text-[12.5px] font-semibold tracking-tight tabular-nums tap transition-colors ${
                numericAmount === quick
                  ? "bg-foreground text-background"
                  : "ring-1 ring-border text-foreground hover:bg-foreground/[0.04]"
              }`}
            >
              ₦{quick.toLocaleString()}
            </button>
          ))}
        </div>

        {/* Info row */}
        <div className="mt-8 flex items-start gap-3 rounded-2xl ring-1 ring-border bg-card p-4">
          <ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={1.75} />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Funds arrive in your Zero Club wallet instantly after a successful payment.
            Processed securely by Paystack.
          </p>
        </div>

        <button
          disabled={numericAmount <= 0}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-4 text-[15px] font-semibold tracking-tight text-background tap shadow-lift disabled:opacity-40"
        >
          {numericAmount > 0 ? `Pay ₦${numericAmount.toLocaleString()} with Paystack` : "Pay with Paystack"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
