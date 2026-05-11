import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Plus, Repeat, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/wallet")({
  component: WalletPage,
});

const txs = [
  { t: "Bootcamp enrollment", sub: "Product Design Sprint", amt: "-₦25,000", neg: true, time: "Today" },
  { t: "XP converted", sub: "1,000 XP → cash (10% fee)", amt: "+₦90", neg: false, time: "Yesterday" },
  { t: "Wallet top-up", sub: "Paystack · ****4521", amt: "+₦30,000", neg: false, time: "2d ago" },
  { t: "Referral bonus", sub: "Tunde joined with your code", amt: "+500 XP", neg: false, time: "5d ago" },
];

function WalletPage() {
  return (
    <div className="px-5 pt-6">
      <header>
        <p className="text-xs text-muted-foreground">Your money</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Wallet</h1>
      </header>

      {/* Balance card */}
      <section className="mt-5 overflow-hidden rounded-3xl bg-gradient-primary p-6 shadow-glow">
        <div className="text-xs uppercase tracking-wider text-primary-foreground/80">Funds balance</div>
        <div className="mt-2 font-display text-4xl font-bold text-primary-foreground">₦12,450.<span className="text-2xl opacity-70">00</span></div>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-2xl bg-background/15 py-3 text-sm font-semibold text-primary-foreground backdrop-blur">+ Top up</button>
          <button className="flex-1 rounded-2xl bg-background py-3 text-sm font-semibold text-foreground">Withdraw</button>
        </div>
      </section>

      {/* XP card */}
      <section className="mt-4 rounded-3xl bg-gradient-card p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">XP balance</div>
            <div className="mt-1 font-display text-2xl font-bold">3,420 XP</div>
            <div className="text-xs text-muted-foreground">≈ ₦307.80 after 10% fee</div>
          </div>
          <button className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-2 text-xs font-semibold text-primary">
            <Repeat className="h-3 w-3" /> Convert
          </button>
        </div>
      </section>

      {/* Quick actions */}
      <section className="mt-6 grid grid-cols-4 gap-2">
        {[
          { i: Plus, l: "Add" },
          { i: ArrowUpRight, l: "Send" },
          { i: ArrowDownLeft, l: "Receive" },
          { i: TrendingUp, l: "Earn" },
        ].map(({ i: Icon, l }) => (
          <button key={l} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/40 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-[11px] font-medium">{l}</span>
          </button>
        ))}
      </section>

      {/* Transactions */}
      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Recent activity</h3>
        <div className="rounded-3xl bg-gradient-card shadow-soft">
          {txs.map((tx, i) => (
            <div key={tx.t + i} className={`flex items-center gap-3 p-4 ${i !== txs.length - 1 ? "border-b border-border" : ""}`}>
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${tx.neg ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                {tx.neg ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{tx.t}</div>
                <div className="text-xs text-muted-foreground">{tx.sub}</div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-semibold ${tx.neg ? "text-destructive" : "text-success"}`}>{tx.amt}</div>
                <div className="text-[10px] text-muted-foreground">{tx.time}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
