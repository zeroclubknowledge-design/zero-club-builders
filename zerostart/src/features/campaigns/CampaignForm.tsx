import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { useAuth } from "@/lib/auth";
import { createCampaign, updateMyCampaign, uploadCampaignCover, type CampaignInput } from "@/lib/campaignApi";
import { GOAL_LABEL, type CampaignGoal, type MyCampaign } from "@/types/campaign";

const MAX_DAYS = 60;

const REFUSAL: Record<string, string> = {
  not_an_ambassador: "Only approved, active ambassadors can start campaigns.",
  title_required: "Give your campaign a title (at least 4 characters).",
  bad_end_date: `Pick an end date between tomorrow and ${MAX_DAYS} days from now.`,
  too_many_live: "You already have 3 campaigns running. End one to start another.",
  not_yours: "This campaign isn't yours.",
  not_editable: "This campaign has ended, so it can't be edited.",
};

const dayInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
/** The end of the chosen day, local time. */
const endOfDay = (day: string) => new Date(`${day}T23:59:00`).toISOString();

const GOALS: CampaignGoal[] = ["signups", "activations", "event", "sales", "awareness", "other"];

/** Start a campaign, or edit one that is still running. */
export function CampaignForm({ initial, onClose, onSaved }: { initial?: MyCampaign; onClose: () => void; onSaved: (id?: string) => void }) {
  const { session } = useAuth();
  const editing = Boolean(initial);
  const [f, setF] = useState({
    title: initial?.title || "",
    summary: initial?.summary || "",
    description: initial?.description || "",
    goal: (initial?.goal || "signups") as CampaignGoal,
    locations: initial?.locations || "",
    partner_name: initial?.partner_name || "",
    partner_url: initial?.partner_url || "",
    ends: initial?.ends_at ? dayInput(new Date(initial.ends_at)) : dayInput(plusDays(14)),
  });
  const [cover, setCover] = useState(initial?.cover_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const pickCover = async (file?: File) => {
    if (!file || !session) return;
    setUploading(true);
    setError(null);
    try {
      setCover(await uploadCampaignCover(file, session.user.id));
    } catch (e) {
      setError(`Couldn't upload that image: ${(e as Error).message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const input: CampaignInput = {
      title: f.title.trim(),
      summary: f.summary.trim(),
      description: f.description.trim(),
      cover_url: cover,
      locations: f.locations.trim(),
      ends_at: endOfDay(f.ends),
    };
    try {
      const res = editing
        ? await updateMyCampaign(initial!.id, input)
        : await createCampaign({ ...input, goal: f.goal, partner_name: f.partner_name.trim(), partner_url: f.partner_url.trim() });
      if (!res.ok) setError(REFUSAL[res.reason || ""] || "Couldn't save your campaign.");
      else onSaved(res.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const latestEnd = (() => {
    const d = initial ? new Date(initial.starts_at) : new Date();
    d.setDate(d.getDate() + MAX_DAYS - 1);
    return d;
  })();
  const valid = f.title.trim().length >= 4 && Boolean(f.ends);

  return (
    <Sheet
      title={editing ? "Edit campaign" : "Start a campaign"}
      onClose={onClose}
      wide
      footer={
        <button
          onClick={save}
          disabled={!valid || saving || uploading}
          className="zs-glow flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14.5px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
        >
          {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {editing ? "Save changes" : "Launch & get my link"}
        </button>
      }
    >
      {!editing && (
        <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink">
          Your campaign goes live straight away with your own link. You earn commission on every payment made by people who join
          through it. When it ends, the Zero Club team checks the results and pays you — plus a bonus for strong campaigns.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {/* Cover */}
        <div>
          <span className="zs-label">Cover image</span>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickCover(e.target.files?.[0])} />
          {cover ? (
            <div className="relative h-36 overflow-hidden rounded-2xl">
              <img src={cover} alt="" className="h-full w-full object-cover" />
              <button onClick={() => setCover("")} aria-label="Remove cover" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="zs-inset flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line text-ink-muted transition hover:text-ink"
            >
              {uploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              <span className="text-[12.5px] font-semibold">{uploading ? "Uploading…" : "Add a cover (optional)"}</span>
            </button>
          )}
        </div>

        <Field label="Title">
          <input className="zs-input" value={f.title} onChange={set("title")} maxLength={120} placeholder="Bring 50 builders from UNILAG to Zero Club" />
        </Field>
        <Field label="One-line pitch">
          <input className="zs-input" value={f.summary} onChange={set("summary")} maxLength={280} placeholder="What people get when they join through you" />
        </Field>
        <Field label="Your plan">
          <textarea className="zs-input" rows={4} value={f.description} onChange={set("description")} maxLength={4000} placeholder="Where you'll share it, who you'll reach, events you'll run." />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {!editing && (
            <Field label="Goal">
              <select className="zs-input" value={f.goal} onChange={set("goal")}>
                {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
              </select>
            </Field>
          )}
          <Field label="Where">
            <input className="zs-input" value={f.locations} onChange={set("locations")} placeholder="UNILAG, Yaba, online" />
          </Field>
          <Field label={`Ends (max ${MAX_DAYS} days)`}>
            <input
              type="date"
              className="zs-input"
              value={f.ends}
              min={dayInput(plusDays(editing ? 0 : 1))}
              max={dayInput(latestEnd)}
              onChange={set("ends")}
            />
          </Field>
        </div>

        {!editing && (
          <details className="zs-inset rounded-2xl px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-ink">Promoting a Zero Club partner?</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Partner name"><input className="zs-input" value={f.partner_name} onChange={set("partner_name")} /></Field>
              <Field label="Partner website"><input className="zs-input" value={f.partner_url} onChange={set("partner_url")} placeholder="https://" /></Field>
            </div>
          </details>
        )}

        {error && <p className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-[12.5px] font-medium text-bad">{error}</p>}
      </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="zs-label">{label}</span>
      {children}
    </label>
  );
}
