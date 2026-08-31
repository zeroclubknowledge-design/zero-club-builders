import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCampaign } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Campaign, CampaignStatus } from "@/types";
import { Card, ErrorState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import {
  CampaignForm, type CampaignDraft, draftFromCampaign, filledTasks, isValid,
} from "@/features/campaign/CampaignForm";

/**
 * Editing a campaign you launched.
 *
 * Saving is three writes — the campaign, its changed tasks, its removed tasks —
 * and they are done in that order so a failure part-way leaves the campaign
 * itself correct. There is no transaction available from the client; ordering
 * by blast radius is the next best thing.
 */
export function EditCampaign() {
  const { id } = useParams({ from: "/build/campaign/$id/edit" });
  const navigate = useNavigate();
  const { session } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    getCampaign(id)
      .then((c) => {
        setCampaign(c);
        if (c) setDraft(draftFromCampaign(c, c.tasks || []));
      })
      .catch((e) => setLoadError(e.message || "Could not load this campaign."));
  };

  useEffect(load, [id]);

  /* Tasks that existed on load but are no longer in the draft. Tracked rather
     than diffed at save time so the intent survives further edits. */
  const onChange = (next: CampaignDraft) => {
    const before = new Set(draft?.tasks.filter((t) => t.id).map((t) => t.id!) ?? []);
    const after = new Set(next.tasks.filter((t) => t.id).map((t) => t.id!));
    const gone = [...before].filter((tid) => !after.has(tid));
    if (gone.length > 0) setRemoved((r) => [...new Set([...r, ...gone])]);
    setDraft(next);
  };

  const setStatus = async (status: CampaignStatus) => {
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.from("zs_campaigns").update({ status }).eq("id", id);
    setSaving(false);
    if (e) { setError(e.message); return; }
    load();
  };

  const save = async () => {
    if (!draft || !session) return;
    setSaving(true);
    setError(null);

    const { error: e1 } = await supabase
      .from("zs_campaigns")
      .update({
        name: draft.name.trim(),
        objective: draft.objective.trim() || null,
        tester_limit: draft.testerLimit,
        zp_reward: draft.zpReward,
        deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
      })
      .eq("id", id);

    if (e1) { setSaving(false); setError(friendly(e1.message)); return; }

    const tasks = filledTasks(draft);

    const existing = tasks.filter((t) => t.id);
    for (const [i, t] of existing.entries()) {
      const { error: e } = await supabase
        .from("zs_tasks")
        .update({
          title: t.title.trim(),
          description: t.description.trim() || null,
          position: i,
          required: t.required,
        })
        .eq("id", t.id!);
      if (e) { setSaving(false); setError(friendly(e.message)); return; }
    }

    const added = tasks.filter((t) => !t.id);
    if (added.length > 0) {
      const { error: e } = await supabase.from("zs_tasks").insert(
        added.map((t, i) => ({
          campaign_id: id,
          title: t.title.trim(),
          description: t.description.trim() || null,
          position: existing.length + i,
          required: t.required,
        }))
      );
      if (e) { setSaving(false); setError(friendly(e.message)); return; }
    }

    if (removed.length > 0) {
      const { error: e } = await supabase.from("zs_tasks").delete().in("id", removed);
      if (e) { setSaving(false); setError(friendly(e.message)); return; }
    }

    setSaving(false);
    navigate({ to: "/build/campaign/$id", params: { id } });
  };

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (campaign === undefined || !draft) return <Skeleton className="h-[560px] rounded-[18px]" />;
  if (campaign === null) return <ErrorState message="This campaign could not be found." />;

  if (campaign.builder_id !== session?.user?.id) {
    return <ErrorState message="This isn't your campaign." />;
  }

  const seatsTaken = campaign.seats_taken ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/build/campaign/$id"
        params={{ id }}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to submissions
      </Link>

      <Card className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-ink">Edit campaign</h1>
            <p className="mt-1.5 text-[13px] text-ink-muted">{campaign.mvp?.name}</p>
          </div>
          <StatusBadge status={campaign.status} />
        </div>

        {seatsTaken > 0 && (
          <p className="mt-4 rounded-xl bg-warn/10 px-4 py-3 text-[12.5px] leading-relaxed text-warn">
            {seatsTaken} tester{seatsTaken === 1 ? " has" : "s have"} already joined at{" "}
            {campaign.zp_reward} ZP. You can raise the reward or add seats, but not lower what
            they were promised.
          </p>
        )}

        <CampaignForm draft={draft} onChange={onChange} seatsTaken={seatsTaken} />

        {error && (
          <p className="mt-5 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
        )}

        <button
          onClick={save}
          disabled={!isValid(draft) || saving}
          className="zs-glow mt-7 h-12 w-full rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </Card>

      <Card className="mt-4 p-6 sm:p-7">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">
          Recruiting
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
          {campaign.status === "live"
            ? "Testers can join right now."
            : campaign.status === "paused"
            ? "Paused — nobody new can join. Submissions already in progress still work."
            : campaign.status === "draft"
            ? "A draft. Nobody can see this campaign yet."
            : campaign.status === "cancelled"
            ? "Cancelled."
            : "Completed — every seat was filled and approved."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {campaign.status !== "live" && campaign.status !== "completed" && (
            <button
              onClick={() => setStatus("live")}
              disabled={saving}
              className="h-10 rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
            >
              {campaign.status === "draft" ? "Go live" : "Resume"}
            </button>
          )}
          {campaign.status === "live" && (
            <button
              onClick={() => setStatus("paused")}
              disabled={saving}
              className="h-10 rounded-full bg-ink/[0.06] px-5 text-[13px] font-semibold text-ink transition hover:bg-ink/10 disabled:opacity-40"
            >
              Pause recruiting
            </button>
          )}
          {campaign.status !== "cancelled" && campaign.status !== "completed" && (
            <button
              onClick={() => setStatus("cancelled")}
              disabled={saving}
              className="h-10 rounded-full bg-ink/[0.06] px-5 text-[13px] font-semibold text-ink-muted transition hover:text-bad disabled:opacity-40"
            >
              Cancel campaign
            </button>
          )}
        </div>

        {seatsTaken > 0 && campaign.status === "live" && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            Pausing stops new testers joining. Anyone already testing can still submit, and you
            still owe them a review.
          </p>
        )}
      </Card>
    </div>
  );
}

/** Turn the database's guard messages into something a builder can act on. */
function friendly(message: string) {
  if (/Cannot lower the reward/i.test(message) || /Cannot set the limit/i.test(message)
      || /already completed/i.test(message)) {
    // These come from our own triggers and are already written for a person.
    return message.replace(/^.*?(Cannot)/, "$1");
  }
  return message;
}
