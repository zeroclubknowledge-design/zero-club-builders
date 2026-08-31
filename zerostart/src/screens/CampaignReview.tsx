import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Star } from "lucide-react";
import { getCampaign, reviewSubmission, submissionsForCampaign } from "@/lib/api";
import type { Campaign, Participation } from "@/types";
import { Card, EmptyState, ErrorState, SeatMeter, Skeleton, StatusBadge, ZpBadge } from "@/components/ui/primitives";

/** What went wrong, in words a builder can act on. */
const REFUSAL: Record<string, string> = {
  already_approved: "Already approved — the tester has been paid.",
  already_rejected: "Already rejected.",
  not_submitted: "This test hasn't been submitted yet.",
  not_yours: "This isn't your campaign.",
  own_submission: "You can't review your own submission.",
  not_found: "This submission no longer exists.",
};

export function CampaignReview() {
  const { id } = useParams({ from: "/build/campaign/$id" });
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [rows, setRows] = useState<Participation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([getCampaign(id), submissionsForCampaign(id)])
      .then(([c, p]) => { setCampaign(c); setRows(p); })
      .catch((e) => setError(e.message || "Could not load this campaign."));
  };

  useEffect(load, [id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (campaign === undefined || !rows) return <Skeleton className="h-[480px] rounded-[18px]" />;
  if (campaign === null) return <ErrorState message="This campaign could not be found." />;

  const waiting = rows.filter((r) => r.status === "submitted");
  const settled = rows.filter((r) => r.status !== "submitted");

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/build" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Build
      </Link>

      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[21px] font-bold text-ink">{campaign.name}</h1>
            <p className="mt-1 text-[13px] text-ink-muted">{campaign.mvp?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <ZpBadge amount={campaign.zp_reward} />
            <StatusBadge status={campaign.status} />
          </div>
        </div>
        <div className="mt-5 max-w-[280px]">
          <SeatMeter taken={campaign.seats_taken ?? 0} limit={campaign.tester_limit} />
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">
        Waiting on you {waiting.length > 0 && `· ${waiting.length}`}
      </h2>

      {waiting.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          body="When a tester submits, their feedback appears here and you decide whether the work earns the ZP."
        />
      ) : (
        <div className="space-y-4">
          {waiting.map((p) => (
            <SubmissionCard key={p.id} participation={p} reward={campaign.zp_reward} onDone={load} />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <>
          <h2 className="mb-3 mt-9 text-[12px] font-bold uppercase tracking-wider text-ink-faint">
            Reviewed
          </h2>
          <div className="space-y-4">
            {settled.map((p) => (
              <SubmissionCard key={p.id} participation={p} reward={campaign.zp_reward} onDone={load} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SubmissionCard({ participation, reward, onDone }: {
  participation: Participation; reward: number; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);

  const feedback = Array.isArray(participation.feedback)
    ? participation.feedback[0]
    : participation.feedback;
  const tester = participation.tester;
  const pending = participation.status === "submitted";

  const decide = async (approve: boolean) => {
    setBusy(true);
    setRefusal(null);
    try {
      const result = await reviewSubmission(participation.id, approve, note.trim() || undefined);
      if (!result.ok) {
        setRefusal(REFUSAL[result.reason || ""] || "Could not record that decision.");
        // Whatever happened, the row on screen is no longer what the database
        // holds — reload rather than guess.
        onDone();
        return;
      }
      onDone();
    } catch (e) {
      setRefusal((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        {tester?.avatar_url ? (
          <img src={tester.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ink/[0.06] text-[12px] font-bold text-ink-muted">
            {(tester?.full_name || tester?.username || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">
            {tester?.full_name || tester?.username || "A tester"}
          </p>
          {tester?.username && <p className="text-[12px] text-ink-faint">@{tester.username}</p>}
        </div>
        {feedback && (
          <span className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`h-3.5 w-3.5 ${n <= feedback.overall_rating ? "fill-accent text-accent" : "text-ink/12"}`}
              />
            ))}
          </span>
        )}
        <StatusBadge status={participation.status} />
      </div>

      {feedback ? (
        <div className="mt-4 space-y-3">
          <Answer label="Worked well" text={feedback.liked} />
          <Answer label="Confusing" text={feedback.confusing} />
          <Answer label="Would change" text={feedback.suggestions} />
          <Answer label="Anything else" text={feedback.additional_feedback} />
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-ink-faint">No written feedback was left.</p>
      )}

      {participation.review_note && !pending && (
        <p className="mt-4 rounded-xl bg-ink/[0.04] px-4 py-3 text-[12.5px] leading-relaxed text-ink-muted">
          Your note: {participation.review_note}
        </p>
      )}

      {refusal && (
        <p className="mt-4 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{refusal}</p>
      )}

      {pending && (
        <div className="mt-5 border-t border-line pt-5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A note for the tester (optional)"
            className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => decide(true)}
              disabled={busy}
              className="zs-glow h-11 flex-1 rounded-full bg-accent text-[13.5px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Working…" : `Approve · pay ${reward} ZP`}
            </button>
            <button
              onClick={() => decide(false)}
              disabled={busy}
              className="h-11 rounded-full bg-ink/[0.06] px-5 text-[13.5px] font-semibold text-ink-muted transition hover:text-bad disabled:opacity-40"
            >
              Reject
            </button>
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-faint">
            Approving pays this tester once. Pressing it twice cannot pay twice.
          </p>
        </div>
      )}
    </Card>
  );
}

function Answer({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">{text}</p>
    </div>
  );
}
