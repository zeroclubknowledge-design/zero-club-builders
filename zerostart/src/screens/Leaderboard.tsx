import { useEffect, useState } from "react";
import { Crown, MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/campaignApi";
import type { LeaderRow } from "@/types/campaign";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";

export function Leaderboard() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setRows(null);
    setError(null);
    getLeaderboard(period, 100).then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, [period]);

  const ranked = (rows || []).filter((r) => r.results > 0);
  const others = (rows || []).filter((r) => r.results === 0);
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="zs-rise">
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Leaderboard</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Ranked by verified campaign results.</p>

      <div className="mt-5 inline-flex rounded-full bg-ink/[0.05] p-1">
        {(["week", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${period === p ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            {p === "week" ? "This week" : "All time"}
          </button>
        ))}
      </div>

      {error && <div className="mt-5"><ErrorState message={error} onRetry={load} /></div>}
      {!rows && !error && <Skeleton className="mt-5 h-80 rounded-[18px]" />}

      {rows && ranked.length === 0 && (
        <div className="mt-5">
          <EmptyState title="No results yet" body={period === "week" ? "Nobody has a verified result this week yet. Yours could be first." : "The board fills up as ambassadors bring in results."} />
        </div>
      )}

      {podium.length > 0 && (
        <div className="mt-6 grid grid-cols-3 items-end gap-2 sm:gap-4">
          {[podium[1], podium[0], podium[2]].map((row, i) => {
            if (!row) return <div key={i} />;
            const place = row === podium[0] ? 1 : row === podium[1] ? 2 : 3;
            const tall = place === 1;
            return (
              <div key={row.profile_id} className={`zs-card flex flex-col items-center px-2 pb-4 text-center ${tall ? "pt-6" : "pt-4"} ${row.profile_id === session?.user?.id ? "ring-2 ring-accent" : ""}`}>
                {tall && <Crown className="mb-1 h-5 w-5 text-[#f5b301]" />}
                <Avatar row={row} size={tall ? "h-16 w-16" : "h-12 w-12"} />
                <p className="mt-2 w-full truncate text-[13px] font-semibold text-ink">{row.display_name}</p>
                <p className="w-full truncate text-[11px] text-ink-faint">{row.location}</p>
                <p className={`mt-2 font-display font-bold text-ink ${tall ? "text-[22px]" : "text-[18px]"}`}>{row.results}</p>
                <span className={`mt-1 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${place === 1 ? "bg-[#f5b301]/20 text-[#a77800]" : "bg-ink/[0.06] text-ink-muted"}`}>{place}</span>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <Card className="mt-4 divide-y divide-line">
          {rest.map((row, i) => (
            <Row key={row.profile_id} row={row} place={i + 4} me={row.profile_id === session?.user?.id} />
          ))}
        </Card>
      )}

      {others.length > 0 && period === "all" && (
        <>
          <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Getting started</h2>
          <Card className="divide-y divide-line">
            {others.slice(0, 30).map((row) => <Row key={row.profile_id} row={row} me={row.profile_id === session?.user?.id} />)}
          </Card>
        </>
      )}
    </div>
  );
}

function Avatar({ row, size }: { row: LeaderRow; size: string }) {
  return row.avatar_url ? (
    <img src={row.avatar_url} alt="" className={`${size} rounded-full object-cover ring-2 ring-surface`} />
  ) : (
    <span className={`${size} grid place-items-center rounded-full bg-accent-soft font-bold text-accent`}>{row.display_name.charAt(0).toUpperCase()}</span>
  );
}

function Row({ row, place, me }: { row: LeaderRow; place?: number; me: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${me ? "bg-accent-soft" : ""}`}>
      {place && <span className="w-6 text-center font-display text-[14px] font-bold text-ink-faint">{place}</span>}
      <Avatar row={row} size="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-ink">{row.display_name}{me && <span className="ml-1.5 text-[11px] text-accent">You</span>}</p>
        <p className="flex items-center gap-1 truncate text-[11.5px] text-ink-faint"><MapPin className="h-3 w-3 shrink-0" /> {row.location} · {row.level}</p>
      </div>
      <p className="font-display text-[15px] font-bold text-ink">{row.results}</p>
    </div>
  );
}
