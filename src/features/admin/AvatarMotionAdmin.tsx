import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

type Failure = {
  id: string;
  requested_at: string;
  model: string | null;
  error: string;
  username: string | null;
};
type Stats = {
  last_30_days: {
    requested?: number;
    succeeded?: number;
    failed?: number;
    processing?: number;
    avg_seconds?: number | null;
    avg_mb?: number | null;
    cost_usd?: number;
  };
  animated_profiles: number;
  recent_failures: Failure[];
};

/* Animated profile pictures: generation health and cost, last 30 days. */
export function AvatarMotionAdmin() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-avatar-motion"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_avatar_motion_stats");
      if (error) throw error;
      return data as Stats;
    },
    staleTime: 60_000,
  });
  if (isLoading) return null;
  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        Animated profile stats are unavailable: {(error as Error).message}
      </p>
    );
  const m: Stats["last_30_days"] = data?.last_30_days || {};
  const tiles = [
    { label: "Animated profiles", value: Number(data?.animated_profiles || 0).toLocaleString() },
    { label: "Requested (30d)", value: Number(m.requested || 0).toLocaleString() },
    { label: "Succeeded", value: Number(m.succeeded || 0).toLocaleString() },
    { label: "Failed", value: Number(m.failed || 0).toLocaleString() },
    { label: "Avg time", value: m.avg_seconds ? `${m.avg_seconds}s` : "—" },
    { label: "Avg size", value: m.avg_mb ? `${m.avg_mb} MB` : "—" },
    { label: "Est. cost (30d)", value: `$${Number(m.cost_usd || 0).toFixed(2)}` },
  ];
  return (
    <section>
      <h2 className="text-[16px] font-semibold">Animated profile pictures</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Generation runs through the avatar-motion edge function (provider: fal.ai). Logs: Supabase →
        Edge Functions → avatar-motion.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[12px] text-muted-foreground">{t.label}</p>
            <p className="mt-0.5 text-[17px] font-semibold tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>
      {(data?.recent_failures || []).length > 0 && (
        <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {data!.recent_failures.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-[13px]"
            >
              <span className="font-semibold">@{f.username || "member"}</span>
              <span className="text-muted-foreground">
                {new Date(f.requested_at).toLocaleString()}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.error}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
