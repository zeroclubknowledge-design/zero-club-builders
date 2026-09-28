import { useEffect, useState } from "react";
import { ExternalLink, Pause, Play, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  adminCampaignReviews, adminPayoutPreview, adminReviewCampaign, adminRunPayouts, adminSetCampaignStatus,
  type ReviewFilter,
} from "@/lib/campaignApi";
import { externalUrl } from "@/lib/links";
import { money } from "@/lib/money";
import { GOAL_LABEL, daysLeft, type CampaignReview, type PayoutPreviewRow } from "@/types/campaign";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { CampaignCover, PhasePill } from "@/features/campaigns/CampaignCard";
import { AdminReview } from "../AdminReview";
import { AmbassadorsAdmin, ApplicationsAdmin } from "./PeopleAdmin";

type Tab = "applications" | "ambassadors" | "campaigns" | "payouts" | "tasks";

export function AdminHub() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("applications");

  if (loading) return <Skeleton className="h-80 rounded-[18px]" />;
  if (!isAdmin) return <EmptyState title="Admins only" body="This area is for the Zero Club team." />;

  return (
    <div className="zs-rise">
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Admin</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Approve ambassadors, check their finished campaigns and pay them.</p>
      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {([
          ["applications", "Applications"],
          ["ambassadors", "Ambassadors & rates"],
          ["campaigns", "Campaign checks"],
          ["payouts", "Payouts"],
          ["tasks", "Tasks & initiatives"],
        ] as [Tab, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition ${tab === value ? "bg-ink text-white" : "bg-ink/[0.05] text-ink-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "applications" && <ApplicationsAdmin />}
        {tab === "ambassadors" && <AmbassadorsAdmin />}
        {tab === "campaigns" && <CampaignChecks />}
        {tab === "payouts" && <PayoutsAdmin />}
        {tab === "tasks" && <AdminReview />}
      </div>
    </div>
  );
}

/* ── Campaign checks ───────────────────────────────────────────────────── */

const FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: "pending", label: "Awaiting check" },
  { value: "live", label: "Running" },
  { value: "reviewed", label: "Checked" },
  { value: "all", label: "All" },
];

function CampaignChecks() {
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [rows, setRows] = useState<CampaignReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setRows(null);
    adminCampaignReviews(filter).then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, [filter]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition ${filter === f.value ? "bg-accent text-accent-ink" : "bg-ink/[0.05] text-ink-muted hover:text-ink"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
        Ambassadors start and run their own campaigns. When one ends, check its results here: approve to pay the commission it
        earned (plus any bonus you set) straight to their wallet, or reject it. You can pause or take down a running campaign.
      </p>

      <div className="mt-5">
        {error && <ErrorState message={error} onRetry={load} />}
        {!error && !rows && <Skeleton className="h-60 rounded-[18px]" />}
        {rows && rows.length === 0 && (
          <EmptyState
            title={filter === "pending" ? "Nothing to check" : "No campaigns here"}
            body={filter === "pending" ? "Campaigns land here when they end." : "Ambassadors' campaigns show up here."}
          />
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((c) => <ReviewCard key={c.id} c={c} onDone={load} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ c, onDone }: { c: CampaignReview; onDone: () => void }) {
  const [bonus, setBonus] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "reject" | "remove" | null>(null);

  const awaiting = c.review_status === "pending" && c.status === "ended";
  const running = c.status === "live" || c.status === "paused";
  const bonusN = Number(bonus) || 0;
  const payNow = Number(c.commission_owed) + bonusN;
  const left = running ? daysLeft(c.ends_at) : null;
  const partnerUrl = externalUrl(c.partner_url);

  const act = async (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.reason === "not_awaiting_review" ? "Someone already checked this campaign." : res.reason || "That didn't work.");
      else onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4 sm:p-5">
        <CampaignCover campaign={c} className="hidden h-24 w-36 shrink-0 rounded-xl sm:block" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PhasePill campaign={c} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{GOAL_LABEL[c.goal]}</span>
            {left != null && <span className="text-[11.5px] text-ink-faint">· {left}d left</span>}
          </div>
          <p className="mt-1.5 text-[16px] font-bold leading-snug text-ink">{c.title}</p>
          <div className="mt-1.5 flex items-center gap-2">
            {c.owner_avatar ? <img src={c.owner_avatar} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{c.owner_name.charAt(0)}</span>}
            <p className="truncate text-[12.5px] text-ink-muted">
              <span className="font-semibold text-ink">{c.owner_name}</span>
              {c.owner_location ? ` · ${c.owner_location}` : ""} · {c.commission_rate ?? "—"}%
            </p>
          </div>
          <p className="mt-1 text-[11.5px] text-ink-faint">
            {new Date(c.starts_at).toLocaleDateString()} – {new Date(c.ended_at || c.ends_at || c.starts_at).toLocaleDateString()}
            {c.locations ? ` · ${c.locations}` : ""}
            {partnerUrl && <> · <a href={partnerUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent">{c.partner_name || "Partner"}</a></>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-5 sm:px-5">
        <Num label="Joined" value={String(c.new_members)} />
        <Num label="Active" value={String(c.active_members)} />
        <Num label="Paying" value={String(c.paying_members)} />
        <Num label="Payments" value={money(c.sales, "NGN", true)} />
        <Num label="Commission owed" value={money(c.commission_owed)} strong />
      </div>

      {(c.summary || c.description) && (
        <details className="mx-4 mt-3 sm:mx-5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-ink">Their plan</summary>
          {c.summary && <p className="mt-2 text-[13px] font-medium text-ink">{c.summary}</p>}
          {c.description && <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink/80">{c.description}</p>}
        </details>
      )}

      {c.reports.length > 0 && (
        <div className="mx-4 mt-3 space-y-2 sm:mx-5">
          <p className="text-[12.5px] font-semibold text-ink">Offline results reported</p>
          {c.reports.map((r, i) => {
            const link = externalUrl(r.evidence_url);
            return (
              <div key={i} className="zs-inset rounded-xl px-3.5 py-2.5">
                <p className="text-[12.5px] text-ink"><span className="font-bold">{r.quantity}</span> reached · {new Date(r.created_at).toLocaleDateString()}</p>
                <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-muted">{r.evidence}</p>
                {link && <a href={link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">Open proof <ExternalLink className="h-3 w-3" /></a>}
              </div>
            );
          })}
        </div>
      )}

      {c.review_note && !awaiting && <p className="mx-4 mt-3 text-[12.5px] italic text-ink-muted sm:mx-5">Note: {c.review_note}</p>}
      {c.review_status === "approved" && Number(c.bonus_awarded) > 0 && (
        <p className="mx-4 mt-2 text-[12.5px] font-semibold text-ok sm:mx-5">Bonus paid: {money(c.bonus_awarded || 0)}</p>
      )}

      <div className="mt-4 border-t border-line bg-ink/[0.015] p-4 sm:p-5">
        {awaiting && (
          <>
            <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
              <label>
                <span className="zs-label">Bonus (₦, optional)</span>
                <input className="zs-input" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
              </label>
              <label>
                <span className="zs-label">Note to the ambassador</span>
                <input className="zs-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Great turnout at the UNILAG event!" />
              </label>
            </div>
            {!confirm ? (
              <div className="mt-3 flex gap-2">
                <button disabled={busy} onClick={() => setConfirm("approve")} className="h-11 flex-1 rounded-full bg-ok text-[13.5px] font-semibold text-white disabled:opacity-40">
                  Approve & pay {money(payNow)}
                </button>
                <button disabled={busy} onClick={() => setConfirm("reject")} className="h-11 rounded-full bg-bad/10 px-5 text-[13.5px] font-semibold text-bad disabled:opacity-40">
                  Reject
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink/[0.04] p-3">
                <span className="flex-1 text-[12.5px] text-ink">
                  {confirm === "approve"
                    ? `Credit ${money(payNow)} to ${c.owner_name}'s wallet now?`
                    : `Reject this campaign? Its ${money(c.commission_owed)} commission won't be paid.`}
                </span>
                <button
                  disabled={busy}
                  onClick={() => act(() => adminReviewCampaign(c.id, confirm === "approve", confirm === "approve" ? bonusN : 0, note))}
                  className={`h-10 rounded-full px-4 text-[13px] font-semibold text-white disabled:opacity-50 ${confirm === "approve" ? "bg-ok" : "bg-bad"}`}
                >
                  {busy ? "Saving…" : confirm === "approve" ? "Yes, pay" : "Yes, reject"}
                </button>
                <button onClick={() => setConfirm(null)} className="h-10 rounded-full bg-ink/[0.06] px-4 text-[13px] font-semibold text-ink-muted">Cancel</button>
              </div>
            )}
          </>
        )}

        {running && (
          <div className="flex flex-wrap items-center gap-2">
            {c.status === "live" ? (
              <button disabled={busy} onClick={() => act(() => adminSetCampaignStatus(c.id, "paused", note))} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-warn/12 px-4 text-[13px] font-semibold text-warn disabled:opacity-40">
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button disabled={busy} onClick={() => act(() => adminSetCampaignStatus(c.id, "live", note))} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ok/12 px-4 text-[13px] font-semibold text-ok disabled:opacity-40">
                <Play className="h-4 w-4" /> Resume
              </button>
            )}
            {confirm === "remove" ? (
              <>
                <span className="text-[12.5px] text-ink">Take it down? No payout for it.</span>
                <button disabled={busy} onClick={() => act(() => adminSetCampaignStatus(c.id, "removed", note))} className="h-10 rounded-full bg-bad px-4 text-[13px] font-semibold text-white disabled:opacity-50">Yes, take down</button>
                <button onClick={() => setConfirm(null)} className="h-10 rounded-full bg-ink/[0.06] px-4 text-[13px] font-semibold text-ink-muted">Cancel</button>
              </>
            ) : (
              <button disabled={busy} onClick={() => setConfirm("remove")} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-bad/10 px-4 text-[13px] font-semibold text-bad disabled:opacity-40">
                <Trash2 className="h-4 w-4" /> Take down
              </button>
            )}
            <input className="zs-input !h-10 min-w-[180px] flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (shown to the ambassador)" />
          </div>
        )}

        {!awaiting && !running && (
          <p className="text-[12.5px] text-ink-muted">
            {c.status === "removed" ? "Taken down." : c.review_status === "approved" ? "Approved and paid." : "Rejected."}
            {Number(c.commission_owed) > 0 && c.review_status === "approved" && ` ${money(c.commission_owed)} in new commission is waiting in Payouts.`}
          </p>
        )}
        {error && <p className="mt-3 rounded-xl bg-bad/10 px-3.5 py-2.5 text-[12.5px] font-medium text-bad">{error}</p>}
      </div>
    </Card>
  );
}

function Num({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="zs-inset rounded-xl px-3 py-2.5">
      <p className={`truncate font-display text-[15px] font-bold ${strong ? "text-accent" : "text-ink"}`}>{value}</p>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
    </div>
  );
}

/* ── Payouts ───────────────────────────────────────────────────────────── */

function PayoutsAdmin() {
  const [rows, setRows] = useState<PayoutPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = () => {
    setError(null);
    adminPayoutPreview().then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const total = (rows || []).reduce((s, r) => s + Number(r.total), 0);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await adminRunPayouts();
      if (!res.ok) setError(res.reason || "Payout failed.");
      else setDone(`Paid ${res.ambassadors_paid} ambassador${res.ambassadors_paid === 1 ? "" : "s"} · ${money(res.total || 0)}`);
      setConfirming(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (error && !rows) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <Skeleton className="h-60 rounded-[18px]" />;

  return (
    <div>
      <section className="zs-hero p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Approved, not yet paid</p>
        <p className="mt-2 font-display text-[38px] font-bold leading-none">{money(total)}</p>
        <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-white/65">
          Commission from members who keep paying after their campaign was approved, plus one-off bonuses. Approving a campaign pays it
          immediately — this is for everything that comes in after.
        </p>
        {rows.length > 0 && !confirming && (
          <button onClick={() => setConfirming(true)} className="mt-5 h-11 rounded-full bg-white px-6 text-[13.5px] font-semibold text-ink">Pay everyone now</button>
        )}
        {confirming && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-white/80">Credit {money(total)} to {rows.length} wallet{rows.length === 1 ? "" : "s"}?</span>
            <button onClick={run} disabled={running} className="h-10 rounded-full bg-white px-5 text-[13px] font-semibold text-ink disabled:opacity-50">{running ? "Paying…" : "Yes, pay"}</button>
            <button onClick={() => setConfirming(false)} className="h-10 rounded-full bg-white/10 px-5 text-[13px] font-semibold text-white">Cancel</button>
          </div>
        )}
      </section>

      {done && <p className="mt-4 rounded-xl bg-ok/10 px-4 py-3 text-[13px] font-semibold text-ok">{done}</p>}
      {error && rows && <p className="mt-4 rounded-xl bg-bad/10 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>}

      {rows.length === 0 ? (
        <div className="mt-5"><EmptyState title="Nothing owed" body="Everyone is paid up." /></div>
      ) : (
        <Card className="mt-5 divide-y divide-line">
          {rows.map((r) => (
            <div key={r.profile_id} className="flex items-center gap-3 px-4 py-3.5">
              {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft font-bold text-accent">{r.display_name.charAt(0)}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{r.display_name}</p>
                <p className="text-[11.5px] text-ink-faint">{money(r.base_amount)} commission{Number(r.bonus_amount) > 0 ? ` · +${money(r.bonus_amount)} bonus` : ""} · sees {r.currency}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-[15px] font-bold text-ink">{money(r.total)}</p>
                {r.currency !== "NGN" && <p className="text-[11px] text-ink-faint">{money(r.total, r.currency)}</p>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
