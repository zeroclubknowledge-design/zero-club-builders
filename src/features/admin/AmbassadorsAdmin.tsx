import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Check, ExternalLink, Loader2, MapPin, Search, X } from "@/components/icons/glyphs";
import { ZeroLoader } from "@/components/ZeroLoader";
import { supabase } from "@/lib/supabase";

import { confirmCard } from "@/components/ConfirmCard";
/*
 * Admin → Ambassadors: review ZeroStart "Zero Ambassador" applications and
 * manage the people already approved. Everything goes through the same
 * admin-only RPCs ZeroStart's own admin uses (each checks is_zero_club_admin
 * on the server), so approving here or there is the same action.
 */

type AppStatus = "pending" | "approved" | "rejected";

interface ApplicationRow {
  id: string;
  profile_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location: string;
  country: string | null;
  bio: string | null;
  motivation: string;
  links: string | null;
  focus_labels: string[] | null;
  payout_currency: string;
  payout_frequency?: "weekly" | "monthly" | null;
  status: AppStatus;
  review_note: string | null;
  member_since: string;
  posts: number;
  created_at: string;
}

interface AmbassadorRow {
  profile_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location: string;
  status: "active" | "paused" | "removed";
  commission_rate: number;
  payout_currency: string;
  payout_frequency?: "weekly" | "monthly" | null;
  joined_at: string;
  referred: number;
  sales: number;
  paid: number;
}

type Refusal = { ok: boolean; reason?: string };

const REASONS: Record<string, string> = {
  not_admin: "Admin access is required.",
  not_found: "That application no longer exists.",
  already_reviewed: "Another admin already reviewed this.",
};

async function fetchApplications(status: AppStatus | "all") {
  const { data, error } = await supabase.rpc("zs_admin_applications", { p_status: status });
  if (error) throw error;
  return (data || []) as ApplicationRow[];
}

async function fetchAmbassadors() {
  const { data, error } = await supabase.rpc("zs_admin_ambassadors");
  if (error) throw error;
  return (data || []) as AmbassadorRow[];
}

async function fetchDefaultRate() {
  const { data } = await supabase.from("zs_settings").select("value").eq("key", "commission_rate").maybeSingle();
  return Number((data as { value?: unknown } | null)?.value ?? 20);
}

const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** Links are stored one per line as "Label: value"; older rows are plain URLs. */
function parseLinks(raw: string | null) {
  const out: { label: string; value: string }[] = [];
  for (const line of (raw || "").split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z][A-Za-z ]{0,23}):\s*(.+)$/);
    if (m && !/^https?$/i.test(m[1].trim())) out.push({ label: m[1].trim(), value: m[2].trim() });
    else t.split(/[\s,]+/).filter(Boolean).forEach((v) => out.push({ label: "Link", value: v }));
  }
  return out;
}

const FILTERS: { value: AppStatus | "all"; label: string }[] = [
  { value: "pending", label: "Awaiting review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Not approved" },
  { value: "all", label: "All" },
];

export function AmbassadorsAdmin() {
  const [view, setView] = useState<"applications" | "roster">("applications");
  const pending = useQuery({ queryKey: ["admin", "zs-applications", "pending"], queryFn: () => fetchApplications("pending") });
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div>
      <div>
        <h2 className="text-[20px] font-semibold">Zero Ambassadors</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          People who applied on ZeroStart to represent Zero Club. Approving gives them the Ambassador badge, campaigns and a commission share of Zero Club’s 10% platform fee.
        </p>
      </div>

      <div className="mt-4 inline-flex rounded-full bg-foreground/[0.06] p-1">
        {([
          ["applications", "Applications"],
          ["roster", "Ambassadors"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setView(value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition ${view === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
            {value === "applications" && pendingCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#c3217e] px-1.5 text-[10.5px] font-bold text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {view === "applications" ? <Applications /> : <Roster />}
    </div>
  );
}

/* ── Applications ─────────────────────────────────────────────────────── */

function Applications() {
  const [filter, setFilter] = useState<AppStatus | "all">("pending");
  const query = useQuery({ queryKey: ["admin", "zs-applications", filter], queryFn: () => fetchApplications(filter) });
  const rate = useQuery({ queryKey: ["admin", "zs-default-rate"], queryFn: fetchDefaultRate });

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition ${filter === f.value ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground hover:text-foreground"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {query.isLoading && <div className="flex justify-center py-16"><ZeroLoader /></div>}
        {query.error && <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-[13px] text-rose-600">{(query.error as Error).message}</p>}
        {query.data?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">{filter === "pending" ? "No one waiting" : "Nothing here yet"}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">New ambassador applications land here, and every admin gets a notification.</p>
          </div>
        )}
        {query.data?.map((app) => <ApplicationCard key={app.id} app={app} defaultRate={rate.data ?? 20} />)}
      </div>
    </div>
  );
}

function ApplicationCard({ app, defaultRate }: { app: ApplicationRow; defaultRate: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(app.status === "pending");
  const [note, setNote] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const links = parseLinks(app.links);

  const decide = async (approve: boolean) => {
    if (!approve && note.trim().length < 5) {
      toast.error("Add a short note so the applicant knows why.");
      return;
    }
    const customRate = rate.trim() ? Number(rate) : null;
    if (approve && customRate !== null && (!Number.isFinite(customRate) || customRate < 0 || customRate > 100)) {
      toast.error("Commission must be between 0 and 100%.");
      return;
    }
    setBusy(approve ? "approve" : "reject");
    try {
      const { data, error } = await supabase.rpc("zs_admin_review_application", {
        p_id: app.id, p_approve: approve, p_note: note.trim() || null, p_rate: approve ? customRate : null,
      });
      if (error) throw error;
      const res = data as Refusal;
      if (!res.ok) throw new Error(REASONS[res.reason || ""] || res.reason || "Couldn't save that.");
      toast.success(approve ? `${app.display_name} is now a Zero Ambassador` : "Application declined");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "zs-applications"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "zs-ambassadors"] }),
      ]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-4 text-left">
        <Avatar name={app.display_name} url={app.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">
            {app.display_name} {app.username && <span className="font-normal text-muted-foreground">@{app.username}</span>}
          </p>
          <p className="flex items-center gap-1 truncate text-[13px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> {[app.location, app.country].filter(Boolean).join(", ")}
          </p>
        </div>
        <StatusPill status={app.status} />
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {!!app.focus_labels?.length && (
            <div className="flex flex-wrap gap-1.5">
              {app.focus_labels.map((f) => (
                <span key={f} className="rounded-full bg-[#c3217e]/10 px-2.5 py-1 text-[12px] font-semibold text-[#c3217e]">{f}</span>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Block title="Why they want to be an ambassador">{app.motivation}</Block>
            {app.bio && <Block title="Bio">{app.bio}</Block>}
            <Block title="Payouts">{`${app.payout_currency} · ${app.payout_frequency === "monthly" ? "Monthly" : "Weekly"} withdrawals`}</Block>
          </div>

          {links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map((l, i) => (
                <a key={`${l.label}-${i}`} href={href(l.value)} target="_blank" rel="noreferrer" className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-border px-3.5 text-[12.5px] font-semibold hover:bg-foreground/[0.04]">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{l.label}</span>
                </a>
              ))}
            </div>
          )}

          <p className="mt-4 text-[12px] text-muted-foreground">
            Member since {new Date(app.member_since).toLocaleDateString()} · {app.posts} posts · applied {new Date(app.created_at).toLocaleDateString()}
            {app.username && (
              <>
                {" · "}
                <a href={`/@${app.username}`} target="_blank" rel="noreferrer" className="font-semibold text-[#c3217e]">View profile</a>
              </>
            )}
          </p>

          {app.status === "pending" ? (
            <div className="mt-4 rounded-xl bg-foreground/[0.03] p-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Note to the applicant (required to decline, optional to approve)"
                className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13.5px] outline-none focus:border-[#c3217e]"
              />
              <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
                Commission
                <input
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder={String(defaultRate)}
                  className="h-8 w-16 rounded-lg border border-border bg-card px-2 text-center text-[13px] font-semibold text-foreground outline-none focus:border-[#c3217e]"
                />
                % <span className="text-[11.5px]">(leave blank for the default {defaultRate}%)</span>
              </label>
              <div className="mt-3 flex gap-2">
                <button disabled={!!busy} onClick={() => void decide(true)} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 text-[13.5px] font-semibold text-white disabled:opacity-50">
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve as Ambassador
                </button>
                <button disabled={!!busy} onClick={() => void decide(false)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-rose-500/10 px-4 text-[13.5px] font-semibold text-rose-600 disabled:opacity-50">
                  {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Decline
                </button>
              </div>
            </div>
          ) : (
            app.review_note && <p className="mt-3 text-[13px] italic text-muted-foreground">Note: {app.review_note}</p>
          )}
        </div>
      )}
    </article>
  );
}

/* ── Roster ───────────────────────────────────────────────────────────── */

function Roster() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "zs-ambassadors"], queryFn: fetchAmbassadors });
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const update = async (row: AmbassadorRow, changes: { status?: string; rate?: number }) => {
    setBusyId(row.profile_id);
    try {
      const { data, error } = await supabase.rpc("zs_admin_update_ambassador", {
        p_profile: row.profile_id, p_status: changes.status ?? null, p_rate: changes.rate ?? null,
      });
      if (error) throw error;
      const res = data as Refusal;
      if (!res.ok) throw new Error(REASONS[res.reason || ""] || res.reason || "Couldn't save that.");
      toast.success("Saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "zs-ambassadors"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const rows = (query.data || []).filter((r) => !q || `${r.display_name} ${r.username || ""} ${r.location}`.toLowerCase().includes(q));

  return (
    <div className="mt-5">
      <label className="relative flex h-10 items-center rounded-lg border border-border bg-card">
        <Search className="ml-3 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ambassadors" className="min-w-0 flex-1 bg-transparent px-3 text-[14px] outline-none" />
      </label>

      <div className="mt-4 space-y-3">
        {query.isLoading && <div className="flex justify-center py-16"><ZeroLoader /></div>}
        {query.error && <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-[13px] text-rose-600">{(query.error as Error).message}</p>}
        {query.data && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-[15px] font-semibold">{q ? "No matches" : "No ambassadors yet"}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Approve applications to add ambassadors.</p>
          </div>
        )}
        {rows.map((row) => (
          <article key={row.profile_id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <Avatar name={row.display_name} url={row.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[14.5px] font-semibold">
                  {row.display_name}
                  {row.status === "active" && <BadgeCheck className="h-4 w-4 shrink-0 text-[#c3217e]" />}
                </p>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {row.username ? `@${row.username} · ` : ""}{row.location} · since {new Date(row.joined_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize ${row.status === "active" ? "bg-emerald-500/10 text-emerald-600" : row.status === "paused" ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600"}`}>{row.status}</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Metric label="Members" value={String(row.referred ?? 0)} />
              <Metric label="Sales" value={`${row.payout_currency} ${Number(row.sales || 0).toLocaleString()}`} />
              <Metric label="Paid out" value={`${row.payout_currency} ${Number(row.paid || 0).toLocaleString()}`} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RateEditor value={row.commission_rate} disabled={busyId === row.profile_id} onSave={(r) => update(row, { rate: r })} /><span className="text-[12px] text-muted-foreground">of Zero Club’s 10% fee</span>
              <span className="text-[12px] text-muted-foreground">{row.payout_frequency === "monthly" ? "Monthly" : "Weekly"} withdrawals</span>
              <div className="ml-auto flex gap-1.5">
                {row.status !== "active" && (
                  <button disabled={busyId === row.profile_id} onClick={() => update(row, { status: "active" })} className="h-8 rounded-full bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-600 disabled:opacity-50">Reactivate</button>
                )}
                {row.status === "active" && (
                  <button disabled={busyId === row.profile_id} onClick={() => update(row, { status: "paused" })} className="h-8 rounded-full bg-amber-500/10 px-3 text-[12px] font-semibold text-amber-600 disabled:opacity-50">Pause</button>
                )}
                {row.status !== "removed" && (
                  <button
                    disabled={busyId === row.profile_id}
                    onClick={async () => { if ((await confirmCard(`Remove ${row.display_name} as a Zero Ambassador?`))) void update(row, { status: "removed" }); }}
                    className="h-8 rounded-full bg-rose-500/10 px-3 text-[12px] font-semibold text-rose-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function RateEditor({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (rate: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const n = Number(draft);
  const changed = draft.trim() !== "" && n !== Number(value);
  const valid = Number.isFinite(n) && n >= 0 && n <= 100;
  return (
    <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
      Commission
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
        inputMode="decimal"
        className="h-8 w-14 rounded-lg border border-border bg-background px-2 text-center text-[13px] font-semibold text-foreground outline-none focus:border-[#c3217e]"
      />
      %
      {changed && (
        <button type="button" disabled={disabled || !valid} onClick={() => onSave(n)} className="h-8 rounded-full bg-foreground px-3 text-[12px] font-semibold text-background disabled:opacity-50">
          Save
        </button>
      )}
    </label>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────── */

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#c3217e]/10 font-bold text-[#c3217e]">{name.charAt(0)}</span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.04] px-2 py-2">
      <p className="truncate text-[13.5px] font-bold">{value}</p>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}

function StatusPill({ status }: { status: AppStatus }) {
  const cls = status === "approved" ? "bg-emerald-500/10 text-emerald-600" : status === "rejected" ? "bg-rose-500/10 text-rose-600" : "bg-[#c3217e]/10 text-[#c3217e]";
  const label = status === "approved" ? "Approved" : status === "rejected" ? "Declined" : "Pending";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}>{label}</span>;
}
