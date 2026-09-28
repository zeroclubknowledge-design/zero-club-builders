import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft } from "@/components/icons/glyphs";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { toPlainText } from "@/lib/contentPreview";


/**
 * What to call a draft in the list.
 *
 * Two things write drafts: ZeroNotes saves an array of blocks, and the post
 * composer saves a single bodyText string. Reading only one of them is what
 * made every post draft render as "Empty draft" — it was not empty, it was
 * simply not the shape being looked for.
 */
const draftTitle = (draft: any): string => {
  const stored = String(draft?.title || "").trim();
  if (stored) return stored;

  const body = toPlainText(draft?.bodyText) || String(draft?.blocks?.[0]?.text || "");
  const firstLine = body.split("\n")[0].trim();
  if (!firstLine) return "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80).trimEnd()}…` : firstLine;
};

/** The line under the title, minus whatever the title already said. */
const draftPreview = (draft: any): string => {
  const body = String(draft?.preview || "") || toPlainText(draft?.bodyText) ||
    (draft?.blocks || []).map((block: any) => block?.text).filter(Boolean).join(" ");
  const rest = body.replace(draftTitle(draft).replace(/…$/, ""), "").trim();
  return rest.slice(0, 220);
};

export const Route = createFileRoute("/app/drafts")({
  component: DraftsPage,
});

function DraftsPage() {
  const navigate = useNavigate();
  const [savedDrafts, setSavedDrafts] = useState<any[]>([]);

  useEffect(() => {
    const drafts = JSON.parse(localStorage.getItem('zero_club_drafts') || '[]');
    setSavedDrafts(drafts);
  }, []);

  const deleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newDrafts = savedDrafts.filter((d: any) => d.id !== id);
    setSavedDrafts(newDrafts);
    localStorage.setItem('zero_club_drafts', JSON.stringify(newDrafts));
    toast.success("Draft deleted");
  };

  const loadDraft = (draft: any) => {
    // In a real implementation we would pass the draft state to compose somehow,
    // e.g., via state or just navigate and let compose read a specific draft id.
    // For now we set a current_active_draft in local storage.
    localStorage.setItem('zero_club_active_draft', JSON.stringify(draft));
    navigate({ to: "/app/compose", search: { draftId: draft.id } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: "/app" })}
            aria-label="Back"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">Drafts</h1>
          {savedDrafts.length > 0 && (
            <span className="pr-3 text-[13px] text-muted-foreground">{savedDrafts.length} saved</span>
          )}
        </div>
      </header>

      <main className="zc-page-width mx-auto mt-2 flex w-full max-w-[680px] flex-1 flex-col bg-card md:mb-6 md:rounded-xl md:border md:border-border">
        {savedDrafts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
            <h2 className="font-display text-[18px] font-semibold">No drafts saved</h2>
            <p className="mx-auto mb-6 mt-2 max-w-sm text-[14px] leading-6 text-muted-foreground">Posts you save while writing stay here until you publish or delete them.</p>
            <Link to="/app/compose" className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background transition hover:opacity-90">
              Start writing
            </Link>
          </div>
        ) : (
          savedDrafts.map((draft: any) => {
            const isNote = !draft?.bodyText && Array.isArray(draft?.blocks);
            return (
              <article key={draft.id} className="border-b border-border px-4 py-3.5 last:border-b-0">
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-px font-semibold text-foreground/75">{isNote ? "Note" : "Post"}</span>
                  Edited {formatDistanceToNow(new Date(draft.updatedAt), { addSuffix: true })}
                </div>
                {/* Drafts arrive in two shapes — ZeroNotes writes blocks, the
                    post composer writes bodyText. draftTitle handles both, and
                    still calls a genuinely blank draft blank. */}
                <button type="button" onClick={() => loadDraft(draft)} className="mt-2 block w-full text-left">
                  <p className="line-clamp-2 text-[15px] leading-snug text-foreground">
                    {draftTitle(draft) || <span className="italic text-muted-foreground">Empty draft</span>}
                  </p>
                  {draftPreview(draft) && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{draftPreview(draft)}</p>
                  )}
                </button>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => loadDraft(draft)}
                    className="h-8 rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background tap hover:opacity-90"
                  >
                    Continue
                  </button>
                  <button
                    onClick={(e) => deleteDraft(draft.id, e)}
                    className="h-8 rounded-full border border-foreground/30 px-3.5 text-[14px] font-semibold text-muted-foreground tap hover:border-foreground/50 hover:text-foreground"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}
