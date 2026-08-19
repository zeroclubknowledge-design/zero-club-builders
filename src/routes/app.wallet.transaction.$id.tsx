import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, Check, Copy, Loader2, Receipt, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { copyToClipboard } from "@/lib/share";

export const Route = createFileRoute("/app/wallet/transaction/$id")({
  component: TransactionDetailPage,
});

/** Plain English for the ledger's `source` column. */
const SOURCE_LABELS: Record<string, { label: string; detail: string }> = {
  paystack: { label: "Card top-up", detail: "Added to your wallet through Paystack" },
  fund_link: { label: "Fund link", detail: "Someone paid into your wallet through a link" },
  bootcamp: { label: "Bootcamp", detail: "Bootcamp enrolment" },
  store: { label: "Zero Store", detail: "A digital product on Zero Store" },
  referral: { label: "Referral commission", detail: "Your share from someone you referred" },
  gift: { label: "Zero Card", detail: "A gift card sent or claimed" },
  membership: { label: "Membership", detail: "Zero Club membership" },
  zero_form: { label: "Zero Form", detail: "A bootcamp registration form" },
  transfer: { label: "Transfer", detail: "Sent between Zero Club wallets" },
  zp: { label: "ZP converted", detail: "Zero Points converted into spendable wallet balance" },
  refund: { label: "Refund", detail: "Money returned to your wallet" },
  withdrawal: { label: "Withdrawal", detail: "Paid out to your bank account" },
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-all text-right text-[12.5px] font-medium text-foreground ${mono ? "font-mono text-[11.5px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function TransactionDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { format } = useWalletCurrency();

  const { data: entry, isLoading } = useQuery({
    queryKey: ["wallet-transaction", id],
    queryFn: async () => {
      // RLS restricts wallet_transactions to the owner, so this cannot return
      // somebody else's row even with a guessed id.
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Receipt className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.5} />
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">Transaction not found</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            It may belong to another account.
          </p>
        </div>
        <Link
          to="/app/wallet"
          className="rounded-full bg-foreground px-6 py-2.5 text-[13px] font-semibold text-background"
        >
          Back to wallet
        </Link>
      </div>
    );
  }

  const credit = entry.direction === "credit";
  const source = SOURCE_LABELS[entry.source] || {
    label: String(entry.source || "Wallet").replaceAll("_", " "),
    detail: "Wallet activity",
  };
  const when = new Date(entry.created_at);

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[640px] items-center gap-3">
          <button
            onClick={() => navigate({ to: "/app/wallet" })}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
            aria-label="Back to wallet"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p>
            <h1 className="text-[18px] font-semibold tracking-tight">Transaction</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-4 py-6 md:px-7 md:py-8">
        {/* The amount leads, with its direction stated rather than implied by
            colour alone — colour is the one cue a colour-blind reader loses. */}
        <section className="rounded-lg border border-border bg-card p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03),0_14px_34px_-22px_rgba(0,0,0,0.18)]">
          <span
            className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${
              credit ? "bg-emerald-500/10 text-emerald-600" : "bg-foreground/[0.06] text-foreground"
            }`}
          >
            {credit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
          </span>

          <p className={`mt-4 text-[32px] font-semibold leading-none tracking-tight tabular-nums ${credit ? "text-emerald-600" : "text-foreground"}`}>
            {credit ? "+" : "−"}{format(Number(entry.amount) || 0)}
          </p>
          <p className="mt-2 text-[13px] font-medium text-foreground">
            {entry.description || source.label}
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {credit ? "Money in" : "Money out"} · {source.label}
          </p>

          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-600">
            <Check className="h-3 w-3" /> Completed
          </span>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-card px-5 py-1">
          <div className="divide-y divide-border/60">
            <Row label="What this was" value={source.detail} />
            <Row
              label="Date"
              value={when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            />
            <Row
              label="Time"
              value={when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            />
            {entry.balance_after != null && (
              <Row label="Balance after" value={format(Number(entry.balance_after))} />
            )}
          </div>
        </section>

        {entry.reference && (
          <section className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Reference
                </p>
                {/* The one thing support will ask for, so it is made easy to
                    hand over rather than transcribed by hand. */}
                <p className="mt-1 break-all font-mono text-[11.5px] text-foreground">{entry.reference}</p>
              </div>
              <button
                onClick={() => copyToClipboard(String(entry.reference), "Reference copied")}
                aria-label="Copy reference"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent/40 hover:text-foreground"
              >
                <Copy className="h-[15px] w-[15px]" />
              </button>
            </div>
          </section>
        )}

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Recorded in your Zero Club wallet ledger
        </p>
      </main>
    </div>
  );
}
