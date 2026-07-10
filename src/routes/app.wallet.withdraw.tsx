import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock, ArrowRight, Landmark } from "lucide-react";
import { useState } from "react";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/app/wallet/withdraw")({
  component: WithdrawPage,
});

function WithdrawPage() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [amount, setAmount] = useState("");

  const numericAmount = parseInt(amount) || 0;
  const balance = profile?.coins || 0;
  const overBalance = numericAmount > balance;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="flex items-center gap-3 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4">
        <button
          onClick={() => navigate({ to: "/app/wallet" })}
          className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04] shrink-0"
        >
          <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Withdraw</h1>
      </header>

      <div className="flex flex-col px-6 pt-10 max-w-md mx-auto">
        {/* Amount — editorial display type */}
        <div className="text-center">
          <label className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Amount to withdraw
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
          <div className={`mx-auto mt-2 h-[2px] w-16 rounded-full ${overBalance ? "bg-destructive/60" : "bg-primary/60"}`} />
          <p className={`mt-3 text-[12px] tabular-nums ${overBalance ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {overBalance ? "Exceeds available balance" : `Available · ₦${balance.toLocaleString()}`}
          </p>
        </div>

        {/* Destination + timing */}
        <div className="mt-10 overflow-hidden rounded-2xl ring-1 ring-border bg-card divide-y divide-hairline">
          <div className="flex items-start gap-3 p-4">
            <Landmark className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium tracking-tight text-foreground">Linked bank account</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Manage payout details in wallet settings.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4">
            <Clock className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium tracking-tight text-foreground">Arrives within 24 hours</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Withdrawals are securely processed and typically much faster.</p>
            </div>
          </div>
        </div>

        <button
          disabled={numericAmount <= 0 || overBalance}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-4 text-[15px] font-semibold tracking-tight text-background tap shadow-lift disabled:opacity-40"
        >
          {numericAmount > 0 && !overBalance ? `Withdraw ₦${numericAmount.toLocaleString()}` : "Confirm withdrawal"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
