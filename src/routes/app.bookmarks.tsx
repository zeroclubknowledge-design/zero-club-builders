import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, Search, X, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { enrichPosts } from "@/api";
import { useState, useEffect } from "react";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";

import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/bookmarks")({
  component: BookmarksPage,
});

async function getBookmarks() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const bookmarksRes = await supabase
    .from('bookmarks')
    .select('*, posts(*, profiles(*))')
    .eq('profile_id', session.user.id)
    .order('created_at', { ascending: false });

  if (bookmarksRes.error) {
    console.error("Error fetching bookmarks:", bookmarksRes.error);
    return [];
  }

  let posts = bookmarksRes.data.map((b: any) => ({
    ...b.posts,
    profiles: b.posts.profiles,
  }));

  return enrichPosts(posts, session.user.id);
}

function BookmarksPage() {
  const { data: bookmarksData, isLoading } = useQuery({
    queryKey: ['bookmarks'],
    queryFn: getBookmarks
  });
  const bookmarks = bookmarksData || [];
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [commentPost, setCommentPost] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredBookmarks = normalizedQuery
    ? bookmarks.filter((post: any) => {
        const searchable = [
          post?.content,
          post?.profiles?.full_name,
          post?.profiles?.username,
          post?.bootcamps?.title,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
    : bookmarks;

  useEffect(() => {
    async function initUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setCurrentUser(profile || session.user);
      }
    }
    initUser();
  }, []);

  const [kind, setKind] = useState<"all" | "posts" | "ships">("all");
  const visibleBookmarks = filteredBookmarks.filter((post: any) =>
    kind === "all" ? true : kind === "ships" ? Boolean(post?.is_build_post) : !post?.is_build_post,
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-50 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <Link to="/app" aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </Link>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Saved</h1>
          {bookmarks.length > 0 && <span className="pr-3 text-[13px] text-muted-foreground">{bookmarks.length} saved</span>}
        </div>
        <div className="zc-page-width mx-auto w-full max-w-[680px] px-3 pb-2">
          <label className="flex h-[38px] w-full items-center gap-2 rounded-full bg-foreground/[0.06] px-3">
            <Search className="h-[17px] w-[17px] shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search saved posts, people or bootcamps"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
        <div className="zc-page-width mx-auto flex w-full max-w-[680px] gap-2 px-3 pb-3">
          {([["all", "All"], ["posts", "Posts"], ["ships", "Ships"]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setKind(value)}
              className={`h-8 rounded-full px-3.5 text-[14px] font-semibold transition ${kind === value ? "bg-foreground text-background" : "border border-foreground/30 text-muted-foreground hover:border-foreground/50"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col md:py-2">
        {isLoading ? (
          <div className="flex flex-1 justify-center bg-card py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
        ) : visibleBookmarks.length > 0 ? (
          <div className="flex flex-1 flex-col gap-2 pt-2">
            {visibleBookmarks.map((post: any) => {
              if (!post) return null;
              return (
                <PostCard
                  key={post.id}
                  post={{ ...post, isBookmarked: true }}
                  currentUser={currentUser}
                  onCommentClick={setCommentPost}
                />
              );
            })}
            <div aria-hidden className="min-h-24 flex-1 bg-card md:hidden" />
          </div>
        ) : (
          <div className="mt-2 flex flex-1 flex-col items-center justify-center bg-card px-6 py-20 text-center md:rounded-xl md:border md:border-border">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
              {searchQuery ? <Search className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
            </div>
            <h2 className="font-display text-[18px] font-semibold">{searchQuery || kind !== "all" ? "Nothing matches" : "Nothing saved yet"}</h2>
            <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
              {searchQuery || kind !== "all"
                ? "Try another name, phrase or filter."
                : "Tap the bookmark on any post or ship to keep it here for later."}
            </p>
            {!searchQuery && kind === "all" && (
              <Link to="/app" className="mt-6 flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background transition hover:opacity-90">
                Explore the feed
              </Link>
            )}
          </div>
        )}
      </main>

      <CommentDrawer 
        post={commentPost} 
        isOpen={!!commentPost} 
        onOpenChange={(open) => !open && setCommentPost(null)} 
      />
    </div>
  );
}
