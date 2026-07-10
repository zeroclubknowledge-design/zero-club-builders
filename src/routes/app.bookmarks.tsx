import { createFileRoute, Link, useLoaderData, useRouter } from "@tanstack/react-router";
import { Bookmark, Search, Heart, MessageCircle, Share2, MoreHorizontal, ChevronLeft, Send, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getProfile, enrichPosts } from "@/api";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [commentPost, setCommentPost] = useState<any>(null);

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
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/app" className="p-1 transition active:opacity-60 lg:hidden">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Bookmarks</h1>
            <p className="text-[10px] text-muted-foreground">Your Saved Builds</p>
          </div>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 transition active:scale-95">
          <Search className="h-4 w-4" />
        </button>
      </header>

      <div className="px-5 py-6">
        {isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : bookmarks.length > 0 ? (
          <div className="space-y-4">
            {bookmarks.map((post: any) => {
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
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-10">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-muted/10 text-muted-foreground mb-6">
              <Bookmark className="h-12 w-12 opacity-20" />
            </div>
            <h2 className="text-2xl font-bold">No bookmarks yet</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              When you find a build that inspires you, tap the bookmark icon to save it here for later reference.
            </p>
            <Link 
              to="/app" 
              className="mt-8 rounded-2xl bg-primary px-10 py-4 text-sm font-bold text-primary-foreground shadow-glow shadow-primary/20 transition active:scale-95"
            >
              Discover Builds
            </Link>
          </div>
        )}
      </div>

      <CommentDrawer 
        post={commentPost} 
        isOpen={!!commentPost} 
        onOpenChange={(open) => !open && setCommentPost(null)} 
      />
    </div>
  );
}

