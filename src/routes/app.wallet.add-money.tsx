import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/app/wallet/add-money")({
  component: AddMoneyPage,
});

function AddMoneyPage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 transition-colors duration-300 px-6">
      <header className="flex items-center gap-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-6">
        <button 
          onClick={() => navigate({ to: "/app/wallet" })}
          className="h-10 w-10 rounded-full bg-accent/20 border border-border/40 flex items-center justify-center transition-transform active:scale-95 shadow-sm"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Add Funds</h1>
      </header>

      <div className="flex flex-col gap-6 pt-4 text-foreground max-w-md mx-auto">
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider ml-1">Amount to add</label>
          <div className="relative mt-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black opacity-40">₦</span>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" 
              className="w-full rounded-2xl bg-accent/10 py-4 pr-4 pl-12 text-3xl font-black tracking-tight outline-none ring-primary transition-all duration-300 focus:ring-2 text-foreground border border-border/30 focus:border-primary/50 focus:bg-background shadow-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="rounded-2xl bg-primary/5 border border-primary/10 p-5 mt-2">
          <p className="text-sm font-medium text-foreground leading-relaxed">
            Funds will be instantly added to your Zero Club wallet after a successful payment via Paystack.
          </p>
        </div>

        <button className="mt-6 w-full rounded-full bg-foreground py-4 font-bold text-background shadow-[0_2px_20px_-4px_rgba(0,0,0,0.15)] transition-all duration-300 active:scale-[0.97] hover:shadow-[0_4px_30px_-4px_rgba(0,0,0,0.25)] text-base">
          Pay with Paystack
        </button>
      </div>
    </div>
  );
}
