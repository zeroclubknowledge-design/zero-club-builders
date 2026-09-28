import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, PlayCircle, X } from "@/components/icons/glyphs";
import { ZeroLoader } from "@/components/ZeroLoader";
import {
  adminReviewTutorApplication, adminTutorApplications,
  type AdminTutorApplication, type TutorApplicationStatus,
} from "@/lib/tutorApplication";

const FILTERS: { value: TutorApplicationStatus | "all"; label: string }[] = [
  { value: "pending", label: "Awaiting review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Not approved" },
  { value: "all", label: "All" },
];

const href = (url?: string | null) => (!url ? null : /^https?:\/\//i.test(url) ? url : `https://${url}`);

/** Admin → Tutor applications: vet people before they get Tutor tools. */
export function TutorApplicationsAdmin() {
  const [filter, setFilter] = useState<TutorApplicationStatus | "all">("pending");
  const query = useQuery({ queryKey: ["admin", "tutor-applications", filter], queryFn: () => adminTutorApplications(filter) });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold">Tutor applications</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Learners who want to teach. Approving unlocks Tutor mode and Tutor Studio for them.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
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
            <p className="mt-1 text-[13px] text-muted-foreground">New tutor applications land here and notify every admin.</p>
          </div>
        )}
        {query.data?.map((app) => <ApplicationCard key={app.id} app={app} />)}
      </div>
    </div>
  );
}

function ApplicationCard({ app }: { app: AdminTutorApplication }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(app.status === "pending");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const decide = async (approve: boolean) => {
    if (!approve && note.trim().length < 5) {
      toast.error("Add a short note so the applicant knows what to improve.");
      return;
    }
    setBusy(approve ? "approve" : "reject");
    try {
      const res = await adminReviewTutorApplication(app.id, approve, note);
      if (!res.ok) throw new Error(res.reason === "already_reviewed" ? "Another admin already reviewed this." : res.reason || "Couldn't save that.");
      toast.success(approve ? `${app.display_name} is now a Tutor` : "Application declined");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tutor-applications"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const links = [
    ["LinkedIn", href(app.linkedin_url)],
    ["Portfolio", href(app.portfolio_url)],
    ["Intro video", href(app.intro_video_url)],
  ].filter(([, url]) => url) as [string, string][];

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-4 text-left">
        {app.avatar_url ? (
          <img src={app.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#cc208f]/10 font-bold text-[#cc208f]">{app.display_name.charAt(0)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{app.display_name} {app.username && <span className="font-normal text-muted-foreground">@{app.username}</span>}</p>
          <p className="truncate text-[13px] text-muted-foreground">{app.headline}</p>
        </div>
        <StatusPill status={app.status} />
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {app.subjects.map((s) => <span key={s} className="rounded-full bg-[#cc208f]/10 px-2.5 py-1 text-[12px] font-semibold text-[#cc208f]">{s}</span>)}
            {[app.experience_years, app.location, ...app.levels, ...app.formats].filter(Boolean).map((s) => (
              <span key={s!} className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[12px] font-medium text-foreground/80">{s}</span>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Block title="Experience">{app.teaching_experience}</Block>
            <Block title={`Sample class · ${app.sample_title}`}>{app.sample_outline}</Block>
            {app.bio && <Block title="Bio">{app.bio}</Block>}
            <Block title="Availability">{`${app.availability.join(", ")}${app.weekly_hours ? ` · ${app.weekly_hours}/week` : ""}`}</Block>
          </div>

          {links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map(([label, url]) => (
                <a key={label} href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[12.5px] font-semibold hover:bg-foreground/[0.04]">
                  {label === "Intro video" ? <PlayCircle className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />} {label}
                </a>
              ))}
            </div>
          )}

          <p className="mt-4 text-[12px] text-muted-foreground">
            Member since {new Date(app.member_since).toLocaleDateString()} · {app.posts} posts · {app.followers} followers · applied {new Date(app.created_at).toLocaleDateString()}
          </p>

          {app.status === "pending" ? (
            <div className="mt-4 rounded-xl bg-foreground/[0.03] p-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Note to the applicant (required to decline, optional to approve)"
                className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13.5px] outline-none focus:border-[#cc208f]"
              />
              <div className="mt-2 flex gap-2">
                <button disabled={!!busy} onClick={() => void decide(true)} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 text-[13.5px] font-semibold text-white disabled:opacity-50">
                  {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve as Tutor
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

function Block({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      <p className="mt-1 whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/90">{children}</p>
    </div>
  );
}

function StatusPill({ status }: { status: TutorApplicationStatus }) {
  const cls = status === "approved" ? "bg-emerald-500/10 text-emerald-600" : status === "rejected" ? "bg-rose-500/10 text-rose-600" : "bg-[#cc208f]/10 text-[#cc208f]";
  const label = status === "approved" ? "Approved" : status === "rejected" ? "Declined" : "Pending";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${cls}`}>{label}</span>;
}
