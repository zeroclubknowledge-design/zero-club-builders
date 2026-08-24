import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Search, ChevronLeft, X, Loader2 } from "@/components/icons/solar";
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-[860px] items-center gap-3 px-4 py-4 sm:px-6">
          <Link to="/app" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card transition hover:bg-accent active:opacity-60 lg:hidden">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">Bookmarks</h1>
            <p className="text-xs text-muted-foreground">Posts and builds saved for later</p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[860px] px-4 pb-4 sm:px-6">
          <label className="flex h-11 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 focus-within:border-primary">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search saved posts, people, or bootcamps"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[860px] px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filteredBookmarks.length > 0 ? (
          <div className="space-y-4">
            {filteredBookmarks.map((post: any) => {
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
          </div>
        ) : (
          <div className="flex min-h-[52vh] flex-col items-center justify-center px-6 text-center">
            <div className="mb-5 grid h-16 w-16 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
              {searchQuery ? <Search className="h-7 w-7" /> : <Bookmark className="h-7 w-7" />}
            </div>
            <h2 className="text-xl font-semibold">{searchQuery ? "No matching bookmarks" : "No bookmarks yet"}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {searchQuery
                ? "Try another name, phrase, or bootcamp title."
                : "When you find a build that inspires you, save it here for later reference."}
            </p>
            {!searchQuery && (
              <Link to="/app" className="mt-7 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-95">
                Discover builds
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

