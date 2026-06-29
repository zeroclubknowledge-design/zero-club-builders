import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Landmark, CreditCard, History, ChevronRight, Plus, ShieldCheck } from "lucide-react";
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
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
        <Link to="/app/wallet" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">Wallet Settings</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
        {/* Verification Status */}
        <section className="p-5">
          <div className="rounded-2xl bg-card border border-border/40 p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className="h-10 w-10 shrink-0 rounded-full bg-accent/50 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground leading-tight">Identity Verification</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Unlock higher withdrawal limits</p>
              </div>
            </div>
            <button 
              onClick={() => toast.info("Coming soon!")}
              className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-sm transition active:scale-95 shrink-0 ml-2"
            >
              Verify
            </button>
          </div>
        </section>

        {/* Bank Account Details */}
        <section className="px-5 space-y-6 mt-2">
          <div>
            <h2 className="text-sm text-muted-foreground mb-4">Payout Method</h2>
            <div className="space-y-4">
              <div className="space-y-1.5 border-b border-border pb-2 focus-within:border-primary transition-colors">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Bank Name</label>
                <input 
                  value={bankDetails.bank_name}
                  onChange={(e) => setBankDetails({...bankDetails, bank_name: e.target.value})}
                  placeholder="Select Bank"
                  className="w-full bg-transparent px-1 text-base font-medium outline-none text-foreground"
                />
              </div>

              <div className="space-y-1.5 border-b border-white/10 pb-2 focus-within:border-primary transition-colors">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Account Number</label>
                <input 
                  value={bankDetails.account_number}
                  onChange={(e) => setBankDetails({...bankDetails, account_number: e.target.value})}
                  placeholder="0000000000"
                  maxLength={10}
                  className="w-full bg-transparent px-1 text-base font-medium outline-none text-foreground"
                />
              </div>

              <div className="space-y-1.5 border-b border-white/10 pb-2 focus-within:border-primary transition-colors">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Account Name</label>
                <input 
                  value={bankDetails.account_name}
                  onChange={(e) => setBankDetails({...bankDetails, account_name: e.target.value})}
                  placeholder="Enter full name"
                  className="w-full bg-transparent px-1 text-base font-medium outline-none text-foreground"
                />
              </div>
            </div>
            <button 
              onClick={handleSave}
              className="mt-6 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-glow transition active:scale-95"
            >
              Update Payout Method
            </button>
          </div>

          <div className="pt-6">
            <h2 className="text-sm text-muted-foreground mb-4">History & Options</h2>
            <div className="space-y-1 flex flex-col">
              <Link to="/app/wallet" hash="transactions" className="flex items-center gap-4 py-4 px-1 transition active:bg-accent/10 text-left group">
                <div className="h-10 w-10 rounded-xl bg-foreground flex items-center justify-center group-active:bg-foreground/80 transition-colors shadow-sm">
                  <History className="h-5 w-5 text-background" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-foreground">Transaction History</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">View all your past payouts and deposits</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              <button onClick={() => toast.info("Payment methods coming soon!")} className="flex items-center gap-4 py-4 px-1 transition active:bg-accent/10 text-left group">
                <div className="h-10 w-10 rounded-xl bg-foreground flex items-center justify-center group-active:bg-foreground/80 transition-colors shadow-sm">
                  <CreditCard className="h-5 w-5 text-background" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-foreground">Payment Methods</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">Cards and other ways to pay for bootcamps</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>

              <button onClick={() => toast.info("Tax information forms coming soon!")} className="flex items-center gap-4 py-4 px-1 transition active:bg-accent/10 text-left group">
                <div className="h-10 w-10 rounded-xl bg-foreground flex items-center justify-center group-active:bg-foreground/80 transition-colors shadow-sm">
                  <Landmark className="h-5 w-5 text-background" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-foreground">Tax Information</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">Manage your tax documents and forms</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
