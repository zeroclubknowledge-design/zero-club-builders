import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock, ArrowRight, Landmark, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/app/wallet/withdraw")({ component: WithdrawPage });

function WithdrawPage() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [amount, setAmount] = useState("");
  const numericAmount = parseInt(amount) || 0;
  const balance = profile?.coins || 0;
  const overBalance = numericAmount > balance;

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <button onClick={() => navigate({ to: "/app/wallet" })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"><ArrowLeft className="h-[18px] w-[18px]" /></button>
          <div><p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p><h1 className="text-[18px] font-semibold tracking-tight">Withdraw</h1></div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[760px] gap-5 px-4 py-6 md:grid-cols-[minmax(0,1fr)_250px] md:px-7 md:py-8">
        <section className="rounded-lg border border-border bg-card p-5 sm:p-7">
          <div className="text-center">
            <label className="text-[11px] font-medium uppercase text-muted-foreground">Amount to withdraw</label>
            <div className="mt-4 flex items-baseline justify-center gap-1"><span className="text-[26px] text-muted-foreground">₦</span><input type="number" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" autoFocus className="w-auto min-w-[80px] max-w-[240px] bg-transparent text-center text-[48px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:text-[56px]" style={{ width: `${Math.max(1, amount.length)}ch` }} /></div>
            <div className={`mx-auto mt-2 h-[2px] w-16 rounded-full ${overBalance ? "bg-destructive" : "bg-primary/60"}`} />
            <p className={`mt-3 text-[12px] tabular-nums ${overBalance ? "font-medium text-destructive" : "text-muted-foreground"}`}>{overBalance ? "Exceeds available balance" : `Available · ₦${balance.toLocaleString()}`}</p>
          </div>

          <button disabled={numericAmount <= 0 || overBalance} className="mt-9 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40">{numericAmount > 0 && !overBalance ? `Withdraw ₦${numericAmount.toLocaleString()}` : "Confirm withdrawal"}<ArrowRight className="h-4 w-4" /></button>
        </section>

        <aside className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
            <Link to="/app/wallet/settings" className="flex items-start gap-3 p-4 hover:bg-muted/50"><Landmark className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" /><div><p className="text-[13px] font-semibold">Linked bank account</p><p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Review payout details in wallet settings.</p></div></Link>
            <div className="flex items-start gap-3 p-4"><Clock className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" /><div><p className="text-[13px] font-semibold">Within 24 hours</p><p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Most verified payouts arrive sooner.</p></div></div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-[#171218] p-4 text-white"><ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f06ac3]" /><p className="text-[11.5px] leading-relaxed text-white/60">Withdrawals are protected by your wallet security and payout verification.</p></div>
        </aside>
      </main>
    </div>
  );
}
