import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, Trash } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

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
    <div className="min-h-screen bg-[#f8f7f5] pb-20 dark:bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[980px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate({ to: "/app" })}
              aria-label="Back to feed"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card transition hover:bg-accent"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your writing</p>
              <h1 className="font-display text-[18px] font-semibold tracking-tight">Drafts</h1>
            </div>
          </div>
          <Link to="/app/compose" className="hidden h-10 items-center rounded-lg bg-foreground px-4 text-[12.5px] font-semibold text-background transition hover:opacity-90 sm:inline-flex">
            New post
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6 md:py-8">
        {savedDrafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-20 text-center">
            <h2 className="text-[18px] font-semibold tracking-tight">No drafts saved</h2>
            <p className="mx-auto mb-6 mt-2 max-w-sm text-[13px] leading-6 text-muted-foreground">Posts you save while composing will stay here until you publish or delete them.</p>
            <Link to="/app/compose" className="inline-flex h-11 items-center rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition hover:opacity-90">
              Start writing
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {savedDrafts.map((draft: any) => (
              <article
                key={draft.id} 
                onClick={() => loadDraft(draft)}
                className="group flex min-h-[150px] cursor-pointer items-start justify-between rounded-lg border border-border bg-card p-5 transition hover:border-primary/25 hover:bg-accent/20"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm text-foreground line-clamp-3 leading-relaxed">
                    {draft.blocks?.[0]?.text || <span className="italic text-muted-foreground">Empty draft</span>}
                  </p>
                  <p className="mt-4 text-[11px] text-muted-foreground">
                    {new Date(draft.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button 
                  onClick={(e) => deleteDraft(draft.id, e)}
                  aria-label="Delete draft"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
