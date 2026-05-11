import { createFileRoute } from "@tanstack/react-router";
import { Bookmark, Search } from "lucide-react";

export const Route = createFileRoute("/app/bookmarks")({
  component: BookmarksPage,
});

function BookmarksPage() {
  return (
    <div className="px-5 pt-6 pb-24">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Bookmarks</h1>
          <p className="text-sm text-muted-foreground">Saved posts for later.</p>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60">
          <Search className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-muted/20 text-muted-foreground mb-4">
          <Bookmark className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-bold">No bookmarks yet</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-[200px]">Save posts you want to see again by clicking the bookmark icon on the feed.</p>
        <button className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-glow">
          Explore Feed
        </button>
      </div>
    </div>
  );
}
