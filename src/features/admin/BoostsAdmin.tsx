import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2, Pause, Play, Rocket, Trash2, Users, BarChart3 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

/*
 * Boosts are run by members, not by admins. Admins oversee them: see what is
 * being promoted and how it performs, pause something that needs a look, or
 * remove it (the unused reward pool is returned to the member).
 */
type AdminBoost = {
  id: string; post_id: string; goal: string; status: string; paid_with: string;
  budget_naira: number; reach_naira: number; max_actions: number; actions_count: number;
  impressions: number; clicks: number; refunded_naira: number; ends_at: string; created_at: string;
  target_url: string | null; owner_username: string | null; owner_name: string | null; post_excerpt: string;
};

const GOAL_LABEL: Record<string, string> = { engage: "Engagement", follow: "Followers", visit: "Link visits" };

export function BoostsAdmin() {
  const { format } = useWalletCurrency();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"live" | "all">("live");
  const query = useQuery({
    queryKey: ["admin-boosts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_boosts");
      if (error) throw error;
      return (data || []) as AdminBoost[];
    },
  });

  const set = async (id: string, status: "paused" | "active" | "removed") => {
    if (status === "removed" && !confirm("Remove this boost? The member gets their unused reward budget back.")) return;
    setBusy(id);
    const { error } = await supabase.rpc("admin_set_boost_status", { p_id: id, p_status: status });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "removed" ? "Boost removed and unused budget returned" : status === "paused" ? "Boost paused" : "Boost resumed");
    void query.refetch();
  };

  const all = query.data || [];
  const live = all.filter((b) => b.status === "active" || b.status === "paused");
  const rows = filter === "live" ? live : all;
  const spend = all.reduce((sum, b) => sum + b.budget_naira - (b.refunded_naira || 0), 0);
  const revenue = all.reduce((sum, b) => sum + b.reach_naira, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#cc208f]">Sponsored posts</p>
          <h1 className="mt-1 text-[22px] font-semibold">Boosts</h1>
          <p className="mt-1 max-w-[560px] text-[14px] text-muted-foreground">Members boost their own posts from the Boost page. Review what is running, pause anything that needs a look, or remove it.</p>
        </div>
        <div className="flex rounded-lg bg-muted p-1 text-[13px] font-semibold">
          {(["live", "all"] as const).map((value) => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-md px-3 py-1.5 ${filter === value ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{value === "live" ? `Running · ${live.length}` : `All · ${all.length}`}</button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Running boosts", value: live.length.toLocaleString() },
          { label: "Member spend", value: format(spend) },
          { label: "Reach revenue (30%)", value: format(revenue) },
          { label: "Rewarded actions", value: all.reduce((s, b) => s + b.actions_count, 0).toLocaleString() },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-[12.5px] text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {query.isLoading ? (
        <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : query.error ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-[14px] text-muted-foreground">{(query.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
          <Rocket className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-[15px] font-semibold">{filter === "live" ? "No boosts running" : "No boosts yet"}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">When members boost a post, it shows up here.</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {rows.map((b) => {
            const running = b.status === "active";
            const open = b.status === "active" || b.status === "paused";
            return (
              <div key={b.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_260px_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${running ? "bg-emerald-500/15 text-emerald-600" : b.status === "paused" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>{b.status}</span>
                    <span className="text-[13px] font-semibold">@{b.owner_username || "member"}</span>
                    <span className="text-[12.5px] text-muted-foreground">· {GOAL_LABEL[b.goal] || b.goal} · {b.paid_with === "wallet" ? format(b.budget_naira) : `${(b.budget_naira * 10).toLocaleString()} ZP`}</span>
                  </div>
                  <a href={`/app/post/${b.post_id}`} target="_blank" rel="noreferrer" className="mt-1 line-clamp-2 block text-[14px] text-foreground/85 hover:underline">{b.post_excerpt || "Photo post"}</a>
                  {b.target_url && <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">Link: {b.target_url}</p>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[12px] text-muted-foreground">
                  <span><Eye className="mx-auto h-3.5 w-3.5" /><b className="block text-[14px] text-foreground">{b.impressions.toLocaleString()}</b>views</span>
                  <span><BarChart3 className="mx-auto h-3.5 w-3.5" /><b className="block text-[14px] text-foreground">{b.clicks.toLocaleString()}</b>clicks</span>
                  <span><Users className="mx-auto h-3.5 w-3.5" /><b className="block text-[14px] text-foreground">{b.actions_count}/{b.max_actions}</b>rewarded</span>
                </div>
                <div className="flex gap-2 lg:justify-end">
                  {open && (
                    <button disabled={busy === b.id} onClick={() => void set(b.id, running ? "paused" : "active")} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-muted disabled:opacity-50">
                      {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{running ? "Pause" : "Resume"}
                    </button>
                  )}
                  {open && (
                    <button disabled={busy === b.id} onClick={() => void set(b.id, "removed")} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" />Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
