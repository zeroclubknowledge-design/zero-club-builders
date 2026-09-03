import { useEffect, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card, EmptyState, ErrorState, Skeleton, ZpBadge } from "@/components/ui/primitives";

interface Pending {
  log_id: string;
  profile_id: string;
  ambassador_name: string;
  ambassador_username: string | null;
  ambassador_avatar: string | null;
  location: string;
  quest_title: string;
  reward: number;
  evidence: string | null;
  evidence_url: string | null;
  submitted_at: string;
}

const REFUSAL: Record<string, string> = {
  already_approved: "Already approved — the ambassador has been paid.",
  already_rejected: "Already rejected.",
  not_found: "This submission no longer exists.",
  not_admin: "This page is for Zero Club admins.",
};

/**
 * Signing off ambassador work.
 *
 * This is the only place an ambassador task pays, and it is deliberately a
 * person's decision: nothing in the database can prove a meetup happened or
 * that twelve people actually signed up because of someone's post. The
 * evidence is here to be read, not parsed.
 */
export function AdminReview() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<"tasks" | "initiatives">("tasks");
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [inits, setInits] = useState<PendingInitiative[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = () => {
    setError(null);
    supabase.rpc("zs_pending_ambassador_tasks").then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setRows((data || []) as Pending[]);
    });
    supabase.rpc("zs_pending_initiatives").then(({ data }) => {
      setInits((data || []) as PendingInitiative[]);
    });
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const decide = async (row: Pending, approve: boolean) => {
    setBusyId(row.log_id);
    const { data, error: e } = await supabase.rpc("zs_review_ambassador_task", {
      p_log_id: row.log_id,
      p_approve: approve,
      p_note: notes[row.log_id]?.trim() || null,
    });
    setBusyId(null);
    if (e) { setError(e.message); return; }
    const result = data as { ok: boolean; reason?: string };
    if (!result?.ok) setError(REFUSAL[result?.reason || ""] || "Could not record that decision.");
    load();
  };

  if (loading) return <Skeleton className="h-[300px] rounded-[18px]" />;
  if (!isAdmin) return <EmptyState title="Not for you" body="This page is for Zero Club admins." />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[26px] font-bold text-ink">Ambassador submissions</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
        Approving pays the task's ZP once. Rejecting costs nothing and tells them why.
      </p>

      <div className="mt-5 flex gap-2">
        {([
          ["tasks", "Tasks", rows?.length ?? 0],
          ["initiatives", "Initiatives", inits?.length ?? 0],
        ] as const).map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-[12.5px] font-semibold transition ${
              tab === id ? "bg-accent text-accent-ink" : "zs-card text-ink-muted hover:text-ink"
            }`}
          >
            {label}
            <span className={`ml-1.5 ${tab === id ? "text-accent-ink/70" : "text-ink-faint"}`}>{n}</span>
          </button>
        ))}
      </div>

      {tab === "initiatives" && (
        <InitiativeQueue rows={inits} onDone={load} onError={setError} />
      )}

      <div className={`mt-6 ${tab === "tasks" ? "" : "hidden"}`}>
        {error && <ErrorState message={error} onRetry={load} />}
        {!error && !rows && <Skeleton className="h-[200px] rounded-[18px]" />}
        {rows && rows.length === 0 && (
          <EmptyState title="Nothing waiting" body="Submissions appear here as ambassadors send work in." />
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-4">
            {rows.map((row) => (
              <Card key={row.log_id} className="p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  {row.ambassador_avatar ? (
                    <img src={row.ambassador_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-ink/[0.06] text-[13px] font-bold text-ink-muted">
                      {row.ambassador_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">{row.ambassador_name}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-ink-faint">
                      <MapPin className="h-3 w-3" /> {row.location}
                      {row.ambassador_username && <> · @{row.ambassador_username}</>}
                    </p>
                  </div>
                  <ZpBadge amount={row.reward} />
                </div>

                <p className="mt-4 text-[12px] font-bold uppercase tracking-wider text-ink-faint">
                  {row.quest_title}
                </p>

                {row.evidence && (
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
                    {row.evidence}
                  </p>
                )}

                {row.evidence_url && (
                  <a
                    href={row.evidence_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-flex items-center gap-1.5 break-all text-[12.5px] font-semibold text-accent"
                  >
                    {row.evidence_url} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                )}

                <div className="mt-5 border-t border-line pt-4">
                  <input
                    value={notes[row.log_id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [row.log_id]: e.target.value }))}
                    placeholder="A note for the ambassador (optional)"
                    className="h-10 w-full rounded-lg border border-line bg-bg px-3.5 text-[12.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
                  />
                  <div className="mt-3 flex gap-3">
                    <button
                      onClick={() => decide(row, true)}
                      disabled={busyId === row.log_id}
                      className="zs-glow h-11 flex-1 rounded-full bg-accent text-[13px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
                    >
                      {busyId === row.log_id ? "Working…" : `Approve · pay ${row.reward} ZP`}
                    </button>
                    <button
                      onClick={() => decide(row, false)}
                      disabled={busyId === row.log_id}
                      className="h-11 rounded-full bg-ink/[0.06] px-5 text-[13px] font-semibold text-ink-muted transition hover:text-bad disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
                    Approving pays once. Pressing it twice cannot pay twice.
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PendingInitiative {
  id: string;
  profile_id: string;
  ambassador_name: string;
  ambassador_username: string | null;
  ambassador_avatar: string | null;
  location: string;
  focus_slug: string;
  focus_label: string;
  kind: string;
  title: string;
  description: string;
  target_count: number | null;
  target_label: string | null;
  result_summary: string | null;
  result_count: number | null;
  evidence_url: string | null;
  submitted_at: string;
}

/**
 * Initiatives an ambassador started themselves.
 *
 * The reward is set here rather than agreed up front, because this is where
 * there is something to judge. "Invite 50" that brought 12 is worth something,
 * but not what 50 would have been — and the alternative is either paying for
 * the promise or renegotiating after the fact.
 */
function InitiativeQueue({
  rows, onDone, onError,
}: {
  rows: PendingInitiative[] | null;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!rows) return <Skeleton className="mt-6 h-[200px] rounded-[18px]" />;
  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Nothing waiting"
          body="Initiatives appear here when an ambassador finishes something they started."
        />
      </div>
    );
  }

  const decide = async (row: PendingInitiative, approve: boolean) => {
    setBusyId(row.id);
    const { data, error } = await supabase.rpc("zs_review_initiative", {
      p_id: row.id,
      p_approve: approve,
      p_amount: approve ? Number(amounts[row.id] ?? 100) || 0 : 0,
      p_note: notes[row.id]?.trim() || null,
    });
    setBusyId(null);
    if (error) { onError(error.message); return; }
    const result = data as { ok: boolean; reason?: string };
    if (!result?.ok) onError(REFUSAL[result?.reason || ""] || "Could not record that decision.");
    onDone();
  };

  return (
    <div className="mt-6 space-y-4">
      {rows.map((row) => {
        // The gap between what they aimed at and what they got is the single
        // most useful thing on this card, so it is stated rather than left for
        // the reviewer to work out.
        const hit = row.target_count && row.result_count != null
          ? Math.round((row.result_count / row.target_count) * 100)
          : null;

        return (
          <Card key={row.id} className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              {row.ambassador_avatar ? (
                <img src={row.ambassador_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ink/[0.06] text-[13px] font-bold text-ink-muted">
                  {row.ambassador_name.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{row.ambassador_name}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-ink-faint">
                  <MapPin className="h-3 w-3" /> {row.location}
                  {row.ambassador_username && <> · @{row.ambassador_username}</>}
                </p>
              </div>
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-accent">
              {row.focus_label}
            </p>
            <h3 className="mt-1 text-[15px] font-semibold text-ink">{row.title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{row.description}</p>

            {row.target_count != null && (
              <p className="mt-3 text-[12.5px] text-ink-muted">
                Aimed for <span className="font-semibold text-ink">{row.target_count}</span>
                {row.target_label ? ` ${row.target_label}` : ""}
                {row.result_count != null && (
                  <>
                    {" · got "}
                    <span className={`font-semibold ${hit != null && hit >= 100 ? "text-ok" : "text-ink"}`}>
                      {row.result_count}
                    </span>
                    {hit != null && <span className="text-ink-faint"> ({hit}%)</span>}
                  </>
                )}
              </p>
            )}

            {row.result_summary && (
              <div className="zs-inset mt-4 rounded-xl p-3.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
                  What they say happened
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
                  {row.result_summary}
                </p>
              </div>
            )}

            {row.evidence_url && (
              <a
                href={row.evidence_url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-1.5 break-all text-[12.5px] font-semibold text-accent"
              >
                {row.evidence_url} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={amounts[row.id] ?? "100"}
                  onChange={(e) => setAmounts((a) => ({ ...a, [row.id]: e.target.value }))}
                  aria-label="ZP to award"
                  className="h-10 w-24 rounded-lg border border-line bg-bg px-3 text-[12.5px] text-ink outline-none focus:border-accent/50"
                />
                <span className="text-[11.5px] text-ink-faint">ZP</span>
                <input
                  value={notes[row.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                  placeholder="A note for the ambassador (optional)"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3.5 text-[12.5px] text-ink outline-none focus:border-accent/50"
                />
              </div>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => decide(row, true)}
                  disabled={busyId === row.id}
                  className="zs-glow h-11 flex-1 rounded-full bg-accent text-[13px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
                >
                  {busyId === row.id ? "Working…" : "Approve and pay"}
                </button>
                <button
                  onClick={() => decide(row, false)}
                  disabled={busyId === row.id}
                  className="h-11 rounded-full bg-ink/[0.06] px-5 text-[13px] font-semibold text-ink-muted transition hover:text-bad disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
