import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

/*
 * Jobs where the poster or the hired person reported a problem. The pay is
 * still held. An admin reads both sides and either pays the freelancer or
 * returns the money to the poster. Every decision is written to the audit log.
 */
type Dispute = {
  id: string;
  title: string;
  escrow_amount: number;
  disputed_at: string;
  hired_at: string | null;
  dispute_reason: string | null;
  client: { id: string; name: string | null; username: string | null };
  hired: { id: string; name: string | null; username: string | null };
};

export function GigDisputesAdmin() {
  const { format } = useWalletCurrency();
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin-gig-disputes"],
    queryFn: async (): Promise<Dispute[]> => {
      const { data, error } = await supabase.rpc("admin_list_gig_disputes");
      if (error) throw error;
      return (data || []) as Dispute[];
    },
  });

  const resolve = async (dispute: Dispute, outcome: "pay" | "refund") => {
    setBusy(`${dispute.id}:${outcome}`);
    const { error } = await supabase.rpc("admin_resolve_gig_dispute", {
      p_gig: dispute.id,
      p_outcome: outcome,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Could not settle this job");
    toast.success(outcome === "pay" ? "Freelancer paid" : "Money returned to the poster");
    void query.refetch();
  };

  const disputes = query.data || [];
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[#cc208f]" />
        <h2 className="text-[16px] font-semibold">Job disputes</h2>
        <span className="ml-auto text-[12.5px] text-muted-foreground">
          {disputes.length} waiting
        </span>
      </div>
      {query.isLoading ? (
        <div className="grid min-h-20 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : disputes.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted-foreground">
          No reported jobs. Held pay is flowing normally.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="rounded-xl border border-border/70 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{dispute.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Poster{" "}
                    <Link
                      to="/app/profile/$id"
                      params={{ id: dispute.client.id }}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {dispute.client.name || dispute.client.username}
                    </Link>
                    {" · "}Hired{" "}
                    <Link
                      to="/app/profile/$id"
                      params={{ id: dispute.hired.id }}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {dispute.hired.name || dispute.hired.username}
                    </Link>
                  </p>
                </div>
                <span className="shrink-0 text-[16px] font-bold tabular-nums">
                  {format(dispute.escrow_amount)}
                </span>
              </div>
              {dispute.dispute_reason && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-foreground/[0.04] p-2.5 text-[13.5px] leading-relaxed">
                  {dispute.dispute_reason}
                </p>
              )}
              <p className="mt-2 text-[12px] text-muted-foreground">
                Reported {new Date(dispute.disputed_at).toLocaleString()}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => resolve(dispute, "refund")}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-foreground/20 text-[13.5px] font-semibold disabled:opacity-50"
                >
                  {busy === `${dispute.id}:refund` && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
                  Refund poster
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => resolve(dispute, "pay")}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1a7f4b] text-[13.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === `${dispute.id}:pay` && <Loader2 className="h-4 w-4 animate-spin" />} Pay
                  freelancer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
