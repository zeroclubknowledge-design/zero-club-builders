import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Landmark, CreditCard, History, ChevronRight, ShieldCheck } from "@/components/icons/solar";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/wallet/settings")({
  component: PaymentsSettings,
});

function PaymentsSettings() {
  const [bankDetails, setBankDetails] = useState({
    bank_name: "",
    account_number: "",
    account_name: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBank() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('profiles').select('bank_name, account_number, account_name').eq('id', session.user.id).single();
        if (data) {
          setBankDetails({
            bank_name: data.bank_name || "",
            account_number: data.account_number || "",
            account_name: data.account_name || "",
          });
        }
      }
      setLoading(false);
    }
    loadBank();
  }, []);

  const handleSave = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from('profiles')
      .update(bankDetails)
      .eq('id', session.user.id);

    if (error) {
      toast.error("Failed to update bank details: " + error.message);
    } else {
      toast.success("Bank details updated successfully", {
        description: "Your payout settings have been saved.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background">
        <div className="mx-auto flex min-h-16 max-w-[980px] items-center gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-6 md:pt-3">
          <Link to="/app/wallet" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-card transition hover:bg-accent/60 active:scale-95">
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </Link>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Wallet settings</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Payouts, verification and payment preferences</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[980px] px-4 py-6 pb-24 md:px-6 md:py-8">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-lg border border-border/60 bg-card p-5 md:p-7">
            <div className="mb-7 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/[0.09] text-primary ring-1 ring-primary/15">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight text-foreground">Payout account</h2>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Add the Nigerian bank account where your Zero Club earnings should be paid.</p>
              </div>
            </div>

            <div className="grid gap-5">
              <label className="grid gap-2">
                <span className="text-[11px] font-semibold text-foreground">Bank name</span>
                <input
                  value={bankDetails.bank_name}
                  onChange={(e) => setBankDetails({ ...bankDetails, bank_name: e.target.value })}
                  placeholder="Enter bank name"
                  disabled={loading}
                  className="h-12 w-full rounded-lg border border-border/70 bg-background px-4 text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
                />
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] font-semibold text-foreground">Account number</span>
                  <input
                    value={bankDetails.account_number}
                    onChange={(e) => setBankDetails({ ...bankDetails, account_number: e.target.value.replace(/\D/g, "") })}
                    placeholder="0000000000"
                    inputMode="numeric"
                    maxLength={10}
                    disabled={loading}
                    className="h-12 w-full rounded-lg border border-border/70 bg-background px-4 text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] font-semibold text-foreground">Account name</span>
                  <input
                    value={bankDetails.account_name}
                    onChange={(e) => setBankDetails({ ...bankDetails, account_name: e.target.value })}
                    placeholder="Enter full name"
                    disabled={loading}
                    className="h-12 w-full rounded-lg border border-border/70 bg-background px-4 text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
                  />
                </label>
              </div>
            </div>

            <div className="mt-7 flex items-center justify-end border-t border-border/50 pt-5">
              <button
                onClick={handleSave}
                disabled={loading}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-foreground px-5 text-[13px] font-semibold tracking-tight text-background transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50 sm:w-auto"
              >
                Save payout account
              </button>
            </div>
          </section>

          <aside className="grid gap-5">
            <section className="rounded-lg bg-[#171417] p-5 text-white ring-1 ring-white/[0.06]">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.08] text-[#f28fd0]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight">Identity verification</h2>
                  <p className="mt-1 text-[12px] leading-5 text-white/55">Verify your identity to unlock higher withdrawal limits and protected payouts.</p>
                </div>
              </div>
              <button
                onClick={() => toast.info("Coming soon!")}
                className="mt-5 h-10 w-full rounded-lg bg-white text-[12px] font-semibold text-[#171417] transition hover:opacity-90 active:scale-[0.98]"
              >
                Start verification
              </button>
            </section>

            <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
              <div className="border-b border-border/50 px-4 py-3.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Wallet controls</h2>
              </div>
              <div className="divide-y divide-border/50">
                <Link to="/app/wallet" hash="transactions" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-foreground/[0.03]">
                  <History className="h-[18px] w-[18px] text-muted-foreground group-hover:text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-foreground">Transaction history</div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">Deposits, earnings and payouts</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>

                <button onClick={() => toast.info("Payment methods coming soon!")} className="group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-foreground/[0.03]">
                  <CreditCard className="h-[18px] w-[18px] text-muted-foreground group-hover:text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-foreground">Payment methods</div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">Cards used for Zero Club purchases</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>

                <button onClick={() => toast.info("Tax information forms coming soon!")} className="group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-foreground/[0.03]">
                  <Landmark className="h-[18px] w-[18px] text-muted-foreground group-hover:text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-foreground">Tax information</div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">Documents and reporting details</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
