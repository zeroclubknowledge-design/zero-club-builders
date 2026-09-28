import { useEffect, useState } from "react";
import { BadgeCheck, ExternalLink, Gift, MapPin } from "lucide-react";
import {
  adminAddBonus, adminAmbassadors, adminApplications, adminReviewApplication, adminSetDefaultRate,
  adminUpdateAmbassador, getDefaultRate, type AmbassadorRow, type ApplicationRow,
} from "@/lib/campaignApi";
import { config } from "@/lib/config";
import { externalUrl } from "@/lib/links";
import { money } from "@/lib/money";
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";

function Face({ url, name, size = "h-11 w-11" }: { url: string | null; name: string; size?: string }) {
  return url ? (
    <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent`}>{name.charAt(0).toUpperCase()}</span>
  );
}

/* ── Applications ──────────────────────────────────────────────────────── */

export function ApplicationsAdmin() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultRate, setDefaultRate] = useState(20);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setRows(null);
    setError(null);
    adminApplications(status).then(setRows).catch((e) => setError(e.message));
    getDefaultRate().then(setDefaultRate).catch(() => {});
  };
  useEffect(load, [status]);

  const decide = async (row: ApplicationRow, approve: boolean) => {
    setBusy(row.id);
    try {
      const rate = rates[row.id] ? Number(rates[row.id]) : null;
      const res = await adminReviewApplication(row.id, approve, notes[row.id], rate);
      if (!res.ok) setError(res.reason || "Could not save that decision.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="inline-flex rounded-full bg-ink/[0.05] p-1">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`h-9 rounded-full px-4 text-[13px] font-semibold capitalize transition ${status === s ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}>
            {s}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-xl bg-bad/10 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>}
      {!rows && !error && <Skeleton className="mt-5 h-60 rounded-[18px]" />}
      {rows && rows.length === 0 && (
        <div className="mt-5"><EmptyState title={status === "pending" ? "No applications waiting" : `No ${status} applications`} body="Applications from people who want to be Zero Ambassadors land here." /></div>
      )}

      <div className="mt-5 space-y-3">
        {(rows || []).map((row) => {
          const links = (row.links || "").split(/[\s,]+/).map((l) => externalUrl(l)).filter(Boolean) as string[];
          return (
            <Card key={row.id} className="p-5">
              <div className="flex items-start gap-3">
                <Face url={row.avatar_url} name={row.display_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-semibold text-ink">{row.display_name}</p>
                    {row.status !== "pending" && <StatusBadge status={row.status === "approved" ? "approved" : "rejected"} />}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-muted">
                    {row.username && (
                      <a href={`${config.zeroClubUrl}/app/profile/${row.profile_id}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">@{row.username}</a>
                    )}
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {row.location}{row.country ? `, ${row.country}` : ""}</span>
                    <span>· {row.posts} posts · member since {new Date(row.member_since).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
                  </p>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-line text-[13.5px] leading-relaxed text-ink/85">{row.motivation}</p>
              {row.bio && <p className="mt-2 text-[12.5px] text-ink-muted">{row.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.focus_labels.map((f) => <span key={f} className="zs-inset rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted">{f}</span>)}
                <span className="zs-inset rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-ink-muted">Paid in {row.payout_currency}</span>
              </div>
              {links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {links.map((l) => (
                    <a key={l} href={l} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent">
                      {new URL(l).hostname.replace(/^www\./, "")} <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}

              {row.status === "pending" ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-[150px_1fr]">
                    <label>
                      <span className="zs-label">Commission %</span>
                      <input className="zs-input" inputMode="decimal" placeholder={String(defaultRate)} value={rates[row.id] || ""} onChange={(e) => setRates({ ...rates, [row.id]: e.target.value.replace(/[^\d.]/g, "") })} />
                    </label>
                    <label>
                      <span className="zs-label">Note (shown if rejected)</span>
                      <input className="zs-input" value={notes[row.id] || ""} onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })} />
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button disabled={busy === row.id} onClick={() => decide(row, true)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ok text-[13.5px] font-semibold text-white disabled:opacity-40">
                      <BadgeCheck className="h-4 w-4" /> Approve at {rates[row.id] || defaultRate}%
                    </button>
                    <button disabled={busy === row.id} onClick={() => decide(row, false)} className="h-11 rounded-full bg-bad/10 px-5 text-[13.5px] font-semibold text-bad disabled:opacity-40">Reject</button>
                  </div>
                </>
              ) : (
                row.review_note && <p className="mt-3 text-[12px] text-ink-faint">Note: {row.review_note}</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ── Ambassadors, rates and bonuses ────────────────────────────────────── */

export function AmbassadorsAdmin() {
  const [rows, setRows] = useState<AmbassadorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultRate, setDefaultRate] = useState<string>("");
  const [savedRate, setSavedRate] = useState<number | null>(null);
  const [editing, setEditing] = useState<AmbassadorRow | null>(null);

  const load = () => {
    setError(null);
    adminAmbassadors().then(setRows).catch((e) => setError(e.message));
    getDefaultRate().then((r) => { setSavedRate(r); setDefaultRate(String(r)); }).catch(() => {});
  };
  useEffect(load, []);

  const saveDefault = async () => {
    const r = Number(defaultRate);
    if (!(r >= 0 && r <= 100)) return;
    const res = await adminSetDefaultRate(r);
    if (res.ok) setSavedRate(r);
  };

  return (
    <div>
      <section className="zs-hero p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Commission for newly approved ambassadors</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex h-12 items-center rounded-xl bg-white/10 px-4 ring-1 ring-white/15">
            <input value={defaultRate} onChange={(e) => setDefaultRate(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="w-14 bg-transparent font-display text-[24px] font-bold text-white outline-none" />
            <span className="font-display text-[20px] font-bold text-white/70">%</span>
          </div>
          <button onClick={saveDefault} disabled={String(savedRate) === defaultRate} className="h-11 rounded-full bg-white px-5 text-[13px] font-semibold text-ink disabled:opacity-50">Save</button>
        </div>
        <p className="mt-3 max-w-[52ch] text-[12.5px] leading-relaxed text-white/65">
          Each ambassador keeps the rate they were approved at. Lower this (e.g. 20% → 15% → 10%) and only people approved afterwards get the new rate.
        </p>
      </section>

      {error && <div className="mt-5"><ErrorState message={error} onRetry={load} /></div>}
      {!rows && !error && <Skeleton className="mt-5 h-60 rounded-[18px]" />}
      {rows && rows.length === 0 && <div className="mt-5"><EmptyState title="No ambassadors yet" body="Approve applications to add ambassadors." /></div>}

      {rows && rows.length > 0 && (
        <Card className="mt-5 divide-y divide-line">
          {rows.map((r) => (
            <button key={r.profile_id} onClick={() => setEditing(r)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-ink/[0.02]">
              <Face url={r.avatar_url} name={r.display_name} size="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-ink">
                  {r.display_name} {r.status !== "active" && <StatusBadge status={r.status === "paused" ? "paused" : "rejected"} />}
                </p>
                <p className="truncate text-[11.5px] text-ink-faint">{r.location} · {r.referred} referred · {money(r.sales)} sales · {money(r.paid)} paid</p>
              </div>
              <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-bold text-accent">{r.commission_rate}%</span>
            </button>
          ))}
        </Card>
      )}

      {editing && <AmbassadorEditor row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function AmbassadorEditor({ row, onClose, onSaved }: { row: AmbassadorRow; onClose: () => void; onSaved: () => void }) {
  const [rate, setRate] = useState(String(row.commission_rate));
  const [status, setStatus] = useState(row.status);
  const [bonus, setBonus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminUpdateAmbassador(row.profile_id, { status, rate: Number(rate) });
      if (!res.ok) setMessage(res.reason || "Could not save.");
      else onSaved();
    } finally {
      setBusy(false);
    }
  };

  const giveBonus = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminAddBonus(row.profile_id, Number(bonus), reason.trim());
      if (!res.ok) setMessage(res.reason === "reason_required" ? "Add a reason for the bonus." : res.reason || "Could not add the bonus.");
      else {
        setMessage(`Bonus of ${money(Number(bonus))} added — it's paid with this week's payout.`);
        setBonus("");
        setReason("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={row.display_name} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="zs-label">Commission %</span>
            <input className="zs-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label>
            <span className="zs-label">Status</span>
            <select className="zs-input" value={status} onChange={(e) => setStatus(e.target.value as AmbassadorRow["status"])}>
              <option value="active">Active</option>
              <option value="paused">Paused (no new commission)</option>
              <option value="removed">Removed (badge taken away)</option>
            </select>
          </label>
        </div>
        <button onClick={save} disabled={busy} className="h-11 w-full rounded-full bg-ink text-[13.5px] font-semibold text-white disabled:opacity-40">Save changes</button>

        <div className="zs-inset rounded-2xl p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Gift className="h-4 w-4 text-accent" /> Give a bonus</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
            <label>
              <span className="zs-label">Amount ₦</span>
              <input className="zs-input" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value.replace(/[^\d.]/g, ""))} />
            </label>
            <label>
              <span className="zs-label">Reason (they'll see it)</span>
              <input className="zs-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Top ambassador this week" />
            </label>
          </div>
          <button onClick={giveBonus} disabled={busy || !(Number(bonus) > 0)} className="mt-3 h-11 w-full rounded-full bg-accent text-[13.5px] font-semibold text-accent-ink disabled:opacity-40">Add bonus</button>
        </div>
        {message && <p className="rounded-xl bg-ink/[0.05] px-3.5 py-2.5 text-[12.5px] text-ink">{message}</p>}
      </div>
    </Sheet>
  );
}
