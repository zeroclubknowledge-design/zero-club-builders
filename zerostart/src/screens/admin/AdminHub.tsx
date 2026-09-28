import { useEffect, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  adminCampaigns, adminPayoutPreview, adminPendingProofs, adminReviewProof, adminRunPayouts, adminSaveCampaign,
} from "@/lib/campaignApi";
import { externalUrl } from "@/lib/links";
import { money } from "@/lib/money";
import type { AdminCampaign, BonusTier, CampaignGoal, CampaignStatus, CampaignTracking, PayoutPreviewRow, PendingProof } from "@/types/campaign";
import { GOAL_LABEL } from "@/types/campaign";
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { AdminReview } from "../AdminReview";
import { AmbassadorsAdmin, ApplicationsAdmin } from "./PeopleAdmin";

type Tab = "applications" | "ambassadors" | "campaigns" | "proofs" | "payouts" | "tasks";

export function AdminHub() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("applications");

  if (loading) return <Skeleton className="h-80 rounded-[18px]" />;
  if (!isAdmin) return <EmptyState title="Admins only" body="This area is for the Zero Club team." />;

  return (
    <div className="zs-rise">
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Admin</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Approve ambassadors, set commission and bonuses, run campaigns and pay out weekly.</p>
      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {([
          ["applications", "Applications"],
          ["ambassadors", "Ambassadors & rates"],
          ["campaigns", "Campaigns"],
          ["proofs", "Verify results"],
          ["payouts", "Weekly payouts"],
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
        {tab === "campaigns" && <CampaignsAdmin />}
        {tab === "proofs" && <ProofsAdmin />}
        {tab === "payouts" && <PayoutsAdmin />}
        {tab === "tasks" && <AdminReview />}
      </div>
    </div>
  );
}

/* ── Campaigns ─────────────────────────────────────────────────────────── */

function CampaignsAdmin() {
  const [rows, setRows] = useState<AdminCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<AdminCampaign> | null>(null);

  const load = () => {
    setError(null);
    adminCampaigns().then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <Skeleton className="h-60 rounded-[18px]" />;

  return (
    <div>
      <button
        onClick={() => setEditing({ status: "draft", goal: "signups", tracking: "both", bonus_tiers: [], proof_unit_label: "result" })}
        className="zs-glow inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[13.5px] font-semibold text-accent-ink"
      >
        <Plus className="h-4 w-4" /> New campaign
      </button>

      {rows.length === 0 ? (
        <div className="mt-5"><EmptyState title="No campaigns yet" body="Create the first one — for Zero Club or a partner." /></div>
      ) : (
        <div className="mt-5 space-y-2.5">
          {rows.map((c) => (
            <button key={c.id} onClick={() => setEditing(c)} className="zs-card zs-card-hover flex w-full items-center gap-4 p-4 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{c.title}</p>
                  <StatusBadge status={c.status === "live" ? "live" : c.status} />
                </div>
                <p className="mt-0.5 truncate text-[12px] text-ink-muted">
                  {c.partner_name || "Zero Club"} · {GOAL_LABEL[c.goal]} · {c.ambassadors} ambassadors · {c.verified_results} verified
                  {c.pending_results > 0 && <span className="font-semibold text-warn"> · {c.pending_results} to verify</span>}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && <CampaignEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function CampaignEditor({ initial, onClose, onSaved }: { initial: Partial<AdminCampaign>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: initial.title || "",
    summary: initial.summary || "",
    description: initial.description || "",
    partner_name: initial.partner_name || "",
    partner_url: initial.partner_url || "",
    cover_url: initial.cover_url || "",
    goal: (initial.goal || "signups") as CampaignGoal,
    tracking: (initial.tracking || "both") as CampaignTracking,
    reward_signup: String(initial.reward_signup ?? ""),
    reward_activation: String(initial.reward_activation ?? ""),
    reward_proof: String(initial.reward_proof ?? ""),
    proof_unit_label: initial.proof_unit_label || "result",
    locations: initial.locations || "",
    max_ambassadors: initial.max_ambassadors ? String(initial.max_ambassadors) : "",
    starts_at: toLocalInput(initial.starts_at),
    ends_at: toLocalInput(initial.ends_at),
    status: (initial.status || "draft") as CampaignStatus,
  });
  const [tiers, setTiers] = useState<BonusTier[]>(initial.bonus_tiers || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminSaveCampaign({
        id: initial.id || null,
        ...f,
        reward_signup: 0,
        reward_activation: 0,
        reward_proof: 0,
        starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : "",
        ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : "",
        bonus_tiers: tiers
          .filter((t) => Number(t.min) > 0 && Number(t.bonus) > 0)
          .map((t) => ({ min: Number(t.min), bonus: Number(t.bonus) }))
          .sort((a, b) => a.min - b.min),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const usesProof = f.tracking !== "link";

  return (
    <Sheet
      title={initial.id ? "Edit campaign" : "New campaign"}
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center gap-2">
          <select className="zs-input !h-12 max-w-[150px]" value={f.status} onChange={set("status")}>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
          </select>
          <button onClick={save} disabled={saving || f.title.trim().length < 4} className="h-12 flex-1 rounded-full bg-accent text-[14px] font-semibold text-accent-ink disabled:opacity-40">
            {saving ? "Saving…" : "Save campaign"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title"><input className="zs-input" value={f.title} onChange={set("title")} placeholder="Bring 100 builders from UNILAG" /></Field>
        <Field label="One-line summary"><input className="zs-input" value={f.summary} onChange={set("summary")} maxLength={280} /></Field>
        <Field label="Details for ambassadors"><textarea className="zs-input" rows={4} value={f.description} onChange={set("description")} placeholder="What to do, who to reach, what counts." /></Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Partner (leave empty for Zero Club)"><input className="zs-input" value={f.partner_name} onChange={set("partner_name")} /></Field>
          <Field label="Partner website"><input className="zs-input" value={f.partner_url} onChange={set("partner_url")} placeholder="https://" /></Field>
        </div>
        <Field label="Cover image URL"><input className="zs-input" value={f.cover_url} onChange={set("cover_url")} placeholder="https://" /></Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goal">
            <select className="zs-input" value={f.goal} onChange={set("goal")}>
              {(Object.keys(GOAL_LABEL) as CampaignGoal[]).map((g) => <option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
            </select>
          </Field>
          <Field label="How results are counted">
            <select className="zs-input" value={f.tracking} onChange={set("tracking")}>
              <option value="both">Link signups + reported proof</option>
              <option value="link">Link signups only (automatic)</option>
              <option value="proof">Reported proof only (verified)</option>
            </select>
          </Field>
        </div>

        {usesProof && (
          <Field label="What is one reported result? (counts toward bonuses)"><input className="zs-input" value={f.proof_unit_label} onChange={set("proof_unit_label")} placeholder="attendee, school, sign-up sheet entry…" /></Field>
        )}
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink">
          Ambassadors are paid commission (their own locked-in %) on every payment made by members who join through their link.
          Set bonuses below; one-off bonuses can be given per ambassador under “Ambassadors &amp; rates”.
        </p>

        <div className="zs-inset rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-ink">Weekly bonus tiers (new members + reported results in a week)</p>
            <button onClick={() => setTiers([...tiers, { min: 0, bonus: 0 }])} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent">
              <Plus className="h-3.5 w-3.5" /> Add tier
            </button>
          </div>
          {tiers.length === 0 && <p className="mt-2 text-[12px] text-ink-faint">No bonus. Add tiers like “25 results → ₦5,000”.</p>}
          <div className="mt-3 space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="zs-input" inputMode="numeric" value={t.min || ""} placeholder="Results" onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, min: Number(e.target.value.replace(/\D/g, "")) } : x)))} />
                <span className="text-[12px] text-ink-faint">→ ₦</span>
                <input className="zs-input" inputMode="decimal" value={t.bonus || ""} placeholder="Bonus" onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, bonus: Number(e.target.value.replace(/[^\d.]/g, "")) } : x)))} />
                <button onClick={() => setTiers(tiers.filter((_, j) => j !== i))} aria-label="Remove tier" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-faint hover:text-bad">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target locations"><input className="zs-input" value={f.locations} onChange={set("locations")} placeholder="Lagos, Accra, Nairobi" /></Field>
          <Field label="Max ambassadors (optional)"><input className="zs-input" inputMode="numeric" value={f.max_ambassadors} onChange={set("max_ambassadors")} /></Field>
          <Field label="Starts"><input type="datetime-local" className="zs-input" value={f.starts_at} onChange={set("starts_at")} /></Field>
          <Field label="Ends (optional)"><input type="datetime-local" className="zs-input" value={f.ends_at} onChange={set("ends_at")} /></Field>
        </div>

        {error && <p className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-[12.5px] font-medium text-bad">{error}</p>}
      </div>
    </Sheet>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="zs-label">{label}</span>
      {children}
    </label>
  );
}

/* ── Verify reported results ───────────────────────────────────────────── */

function ProofsAdmin() {
  const [rows, setRows] = useState<PendingProof[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setError(null);
    adminPendingProofs().then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const decide = async (row: PendingProof, approve: boolean) => {
    setBusy(row.id);
    try {
      const res = await adminReviewProof(row.id, approve, Number(qty[row.id] || row.quantity), notes[row.id]);
      if (!res.ok) setError(res.reason || "Could not save that decision.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error && !rows) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <Skeleton className="h-60 rounded-[18px]" />;
  if (rows.length === 0) return <EmptyState title="Nothing to verify" body="Reported results from ambassadors land here." />;

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const link = externalUrl(row.evidence_url);
        const count = Number(qty[row.id] || row.quantity);
        return (
          <Card key={row.id} className="p-5">
            <div className="flex items-center gap-3">
              {row.ambassador_avatar ? <img src={row.ambassador_avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft font-bold text-accent">{row.ambassador_name.charAt(0)}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{row.ambassador_name}</p>
                <p className="truncate text-[12px] text-ink-muted">{row.campaign_title} · {row.location}</p>
              </div>
              <p className="text-right text-[12px] text-ink-faint">{new Date(row.created_at).toLocaleDateString()}</p>
            </div>
            <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink/85">{row.evidence}</p>
            {link && <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent">Open proof <ExternalLink className="h-3 w-3" /></a>}
            <div className="mt-4 grid gap-2 sm:grid-cols-[140px_1fr]">
              <label>
                <span className="zs-label">Verified {row.proof_unit_label}s</span>
                <input className="zs-input" inputMode="numeric" value={qty[row.id] ?? String(row.quantity)} onChange={(e) => setQty({ ...qty, [row.id]: e.target.value.replace(/\D/g, "") })} />
              </label>
              <label>
                <span className="zs-label">Note to the ambassador (optional)</span>
                <input className="zs-input" value={notes[row.id] || ""} onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })} />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button disabled={busy === row.id || count < 1} onClick={() => decide(row, true)} className="h-11 flex-1 rounded-full bg-ok text-[13.5px] font-semibold text-white disabled:opacity-40">
                Verify {count} {row.proof_unit_label}{count === 1 ? "" : "s"}
              </button>
              <button disabled={busy === row.id} onClick={() => decide(row, false)} className="h-11 rounded-full bg-bad/10 px-5 text-[13.5px] font-semibold text-bad disabled:opacity-40">
                Reject
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Weekly payouts ────────────────────────────────────────────────────── */

function lastClosedWeek() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function PayoutsAdmin() {
  const until = lastClosedWeek();
  const [rows, setRows] = useState<PayoutPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = () => {
    setError(null);
    adminPayoutPreview(until).then(setRows).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const total = (rows || []).reduce((s, r) => s + Number(r.total), 0);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await adminRunPayouts(until);
      if (!res.ok) setError(res.reason === "week_not_finished" ? "That week hasn't finished yet." : res.reason || "Payout failed.");
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

  const weekEnd = new Date(until + "T00:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div>
      <section className="zs-hero p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          Owed up to the week ending {weekEnd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </p>
        <p className="mt-2 font-display text-[38px] font-bold leading-none">{money(total)}</p>
        <p className="mt-2 text-[12.5px] text-white/65">{rows.length} ambassador{rows.length === 1 ? "" : "s"} · credited to their Zero Club wallets</p>
        {rows.length > 0 && !confirming && (
          <button onClick={() => setConfirming(true)} className="mt-5 h-11 rounded-full bg-white px-6 text-[13.5px] font-semibold text-ink">Pay everyone now</button>
        )}
        {confirming && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-white/80">Credit {money(total)} to {rows.length} wallets?</span>
            <button onClick={run} disabled={running} className="h-10 rounded-full bg-white px-5 text-[13px] font-semibold text-ink disabled:opacity-50">{running ? "Paying…" : "Yes, pay"}</button>
            <button onClick={() => setConfirming(false)} className="h-10 rounded-full bg-white/10 px-5 text-[13px] font-semibold text-white">Cancel</button>
          </div>
        )}
      </section>

      {done && <p className="mt-4 rounded-xl bg-ok/10 px-4 py-3 text-[13px] font-semibold text-ok">{done}</p>}
      {error && rows && <p className="mt-4 rounded-xl bg-bad/10 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>}

      {rows.length === 0 ? (
        <div className="mt-5"><EmptyState title="Nothing owed" body="Everyone is paid up for finished weeks." /></div>
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
