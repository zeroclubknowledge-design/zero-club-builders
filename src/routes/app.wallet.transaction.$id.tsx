import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, Check, Copy, Loader2, Receipt, ShieldCheck,
} from "@/components/icons/glyphs";
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
    <div className="flex items-start justify-between gap-4 border-t border-border/60 px-4 py-3 first:border-t-0">
      <span className="shrink-0 text-[14px] text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-all text-right text-[14px] font-medium text-foreground ${mono ? "font-mono text-[13px]" : ""}`}>
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
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <Receipt className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.5} />
        <div>
          <h1 className="font-display text-[18px] font-semibold">Transaction not found</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            It may belong to another account.
          </p>
        </div>
        <Link
          to="/app/wallet"
          className="flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background"
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
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: "/app/wallet" })}
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
            aria-label="Back to wallet"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Transaction</h1>
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {/* The amount leads, with its direction stated rather than implied by
            colour alone — colour is the one cue a colour-blind reader loses. */}
        <section className="bg-card px-4 py-6 text-center md:rounded-xl md:border md:border-border">
          <span
            className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
              credit ? "bg-[#1a7f4b]/10 text-[#1a7f4b]" : "bg-foreground/[0.06] text-foreground"
            }`}
          >
            {credit ? <ArrowDownLeft className="h-6 w-6" /> : <ArrowUpRight className="h-6 w-6" />}
          </span>
          <p className={`mt-3 font-display text-[34px] font-semibold leading-tight tabular-nums ${credit ? "text-[#1a7f4b]" : "text-foreground"}`}>
            {credit ? "+" : "−"}{format(Number(entry.amount) || 0)}
          </p>
          <p className="mt-1 text-[15px] font-semibold text-foreground">{entry.description || source.label}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{credit ? "Money in" : "Money out"} · {source.label}</p>
          <span className="mt-3 inline-flex h-6 items-center gap-1.5 rounded-full bg-[#1a7f4b]/10 px-2.5 text-[12px] font-bold text-[#1a7f4b]">
            <Check className="h-3.5 w-3.5" /> Completed
          </span>
        </section>

        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <Row label="What this was" value={source.detail} />
          <Row label="Date" value={when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} />
          <Row label="Time" value={when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} />
          {entry.reference && (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
              <span className="shrink-0 text-[14px] text-muted-foreground">Reference</span>
              {/* The one thing support will ask for, so it is made easy to
                  hand over rather than transcribed by hand. */}
              <button
                onClick={() => copyToClipboard(String(entry.reference), "Reference copied")}
                className="flex min-w-0 items-center gap-1.5 text-right font-mono text-[13px] font-medium text-foreground hover:text-[#cc208f]"
                aria-label="Copy reference"
              >
                <span className="truncate">{entry.reference}</span>
                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </div>
          )}
          {entry.balance_after != null && <Row label="Balance after" value={format(Number(entry.balance_after))} />}
        </section>

        <section className="flex flex-1 flex-col bg-card px-4 pb-28 pt-4 md:flex-none md:rounded-xl md:border md:border-border md:pb-4">
          <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Recorded in your Zero Club wallet ledger
          </p>
          <Link to="/app/settings/resources" className="mt-3 text-center text-[14px] font-semibold text-muted-foreground hover:text-foreground">
            Need help with this?
          </Link>
        </section>
      </main>
    </div>
  );
}
