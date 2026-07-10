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
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-4">
        <button 
          onClick={() => navigate({ to: "/app" })}
          className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Drafts</h1>
      </header>

      <main className="p-4">
        {savedDrafts.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-xl font-bold mb-2">No drafts saved</h2>
            <p className="text-muted-foreground text-sm mb-6">When you save a draft while composing, it will show up here.</p>
            <Link to="/app/compose" className="rounded-full bg-primary px-6 py-3 font-bold text-white transition active:scale-95 inline-block">
              Start Writing
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {savedDrafts.map((draft: any) => (
              <div 
                key={draft.id} 
                onClick={() => loadDraft(draft)}
                className="p-4 rounded-2xl border border-white/10 bg-card hover:bg-accent/20 transition cursor-pointer flex justify-between items-start group"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm text-foreground line-clamp-3 leading-relaxed">
                    {draft.blocks?.[0]?.text || <span className="italic text-muted-foreground">Empty draft</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(draft.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button 
                  onClick={(e) => deleteDraft(draft.id, e)}
                  className="p-2 rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
