import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/primitives";
import {
  CampaignForm, type CampaignDraft, emptyDraft, filledTasks, isValid,
} from "@/features/campaign/CampaignForm";

/**
 * Creating a campaign, tasks and all.
 *
 * The campaign is written first and its tasks second, because the tasks need
 * its id. If the task insert fails the campaign is deleted rather than left
 * behind — a campaign with no tasks is worse than no campaign, since a tester
 * can join it and find nothing to do.
 */
export function NewCampaign() {
  const { mvpId } = useParams({ from: "/build/$mvpId/campaign" });
  const navigate = useNavigate();
  const { session } = useAuth();

  const [draft, setDraft] = useState<CampaignDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (goLive: boolean) => {
    if (!session) { navigate({ to: "/signin" }); return; }
    setSaving(true);
    setError(null);

    const { data: campaign, error: e1 } = await supabase
      .from("zs_campaigns")
      .insert({
        mvp_id: mvpId,
        builder_id: session.user.id,
        name: draft.name.trim(),
        objective: draft.objective.trim() || null,
        tester_limit: draft.testerLimit,
        zp_reward: draft.zpReward,
        deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
        status: goLive ? "live" : "draft",
      })
      .select("id")
      .single();

    if (e1 || !campaign) {
      setSaving(false);
      setError(e1?.message || "Could not create the campaign.");
      return;
    }

    const { error: e2 } = await supabase.from("zs_tasks").insert(
      filledTasks(draft).map((t, i) => ({
        campaign_id: campaign.id,
        title: t.title.trim(),
        description: t.description.trim() || null,
        position: i,
        required: t.required,
      }))
    );

    if (e2) {
      // Don't leave a joinable campaign with nothing in it.
      await supabase.from("zs_campaigns").delete().eq("id", campaign.id);
      setSaving(false);
      setError(e2.message);
      return;
    }

    setSaving(false);
    navigate({ to: "/build" });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/build" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Build
      </Link>

      <Card className="p-6 sm:p-8">
        <h1 className="text-[22px] font-bold text-ink">New campaign</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Decide what you want tested, how many people you want, and what their time is worth.
        </p>

        <CampaignForm draft={draft} onChange={setDraft} />

        {error && (
          <p className="mt-5 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => create(true)}
            disabled={!isValid(draft) || saving}
            className="zs-glow h-12 w-full shrink-0 rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
          >
            {saving ? "Creating…" : "Create and go live"}
          </button>
          <button
            onClick={() => create(false)}
            disabled={!isValid(draft) || saving}
            className="h-12 w-full shrink-0 rounded-full bg-ink/[0.06] text-[14px] font-semibold text-ink transition hover:bg-ink/10 disabled:opacity-40 sm:flex-1"
          >
            Save as draft
          </button>
        </div>
      </Card>
    </div>
  );
}
