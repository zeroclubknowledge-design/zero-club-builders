import { useLoaderData, createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { 
  Heart, MessageCircle, Share2, Plus, Bell, Repeat, 
  Search, MoreHorizontal, CheckCircle2, Flame, Send, X, Zap, Bookmark, Loader2
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { getPosts, searchEverything } from "@/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { Star, Users, Rocket, UserPlus, FileText, Pencil, Sparkles } from "lucide-react";
import { getCachedSession } from "@/lib/auth";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: Feed,
});

function Feed() {
  const queryClient = useQueryClient();
  const { data: postsData, isLoading } = useQuery({ 
    queryKey: ['feed_posts'], 
    queryFn: () => getPosts() 
  });
  const posts = postsData || [];
  const { data: currentUser } = useUser();
  
  const [activeTab, setActiveTab] = useState("Discover");
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [commentPost, setCommentPost] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<{ posts: any[], bootcamps: any[], profiles: any[] }>({ posts: [], bootcamps: [], profiles: [] });
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetchFollowing();
  }, []);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const results = await searchEverything(searchQuery);
          setSearchResults(results);
        } catch (error) {
          console.error("Search error:", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults({ posts: [], bootcamps: [], profiles: [] });
      }
    }, 400);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  async function fetchFollowing() {
    const { data: { session } } = await getCachedSession();
    if (!session) return;

    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', session.user.id);
    
    if (data) {
      setFollowingIds(data.map(f => f.following_id));
    }
  }

  const filteredPosts = (posts || []).filter((post: any) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const contentMatch = post.content?.toLowerCase().includes(q);
      const usernameMatch = post.profiles?.username?.toLowerCase().includes(q);
      const fullNameMatch = post.profiles?.full_name?.toLowerCase().includes(q);
      
      if (!contentMatch && !usernameMatch && !fullNameMatch) {
        return false;
      }
    }

    // Tab filter
    if (activeTab === "Following") {
      // Show if user is the author OR if it's a repost from someone the user follows
      const isOriginalFromFollowed = followingIds.includes(post.author_id);
      const isRepostFromFollowed = post.type === 'repost' && followingIds.includes(post.reposter_id);
      return isOriginalFromFollowed || isRepostFromFollowed;
    }

    return true;
  });

  const memoizedPostCards = useMemo(() => {
    return filteredPosts.map((post: any) => (
      <PostCard 
        key={post.id} 
        post={post} 
        currentUser={currentUser} 
        onCommentClick={setCommentPost} 
      />
    ));
  }, [filteredPosts, currentUser]);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      {/* Top Header Tabs */}
      <header className="sticky top-[72px] z-40 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline">
        <div className="flex items-center px-4 py-1 justify-between min-h-[48px]">
          {!showSearch ? (
            <>
              <div className="flex gap-5 overflow-x-auto no-scrollbar">
                {["Discover", "Following", "Live", "News", "Academy"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative py-3 text-[13.5px] font-semibold tracking-tight transition-colors whitespace-nowrap ${activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"}`}
                  >
                    {tab}
                    {activeTab === tab && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-foreground" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 pl-4">
                <button
                  onClick={() => setShowSearch(true)}
                  className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 tap"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center gap-2 py-2 animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search builders, bootcamps, topics"
                  className="w-full rounded-full bg-foreground/[0.04] ring-1 ring-transparent py-2.5 pl-10 pr-4 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-primary/40 focus:bg-background transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => { setShowSearch(false); setSearchQuery(""); }}
                className="text-sm font-semibold text-foreground px-2 tap"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

      </header>

      <main className="flex-1">
        {isSearching ? (
          <div className="flex flex-col items-center justify-center pt-20">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">Searching the Club</p>
          </div>
        ) : searchQuery.length >= 2 ? (
          <div className="flex flex-col gap-8 pb-10">
            {/* Profiles/Tutors Section */}
            {searchResults.profiles.length > 0 && (
              <section className="px-5 pt-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-4">Builders & Tutors</h3>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {searchResults.profiles.map((profile) => (
                    <Link
                      key={profile.id}
                      to="/app/profile/$id"
                      params={{ id: profile.id }}
                      className="flex flex-col items-center gap-2 shrink-0 group"
                    >
                      <div className="h-16 w-16 rounded-2xl overflow-hidden ring-1 ring-border group-active:scale-95 transition-transform">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full bg-gradient-primary flex items-center justify-center text-xl font-semibold text-white">
                            {profile.username?.substring(0,1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[11.5px] font-semibold tracking-tight text-foreground line-clamp-1 w-16">
                          {profile.full_name || profile.username}
                        </p>
                        <p className="text-[10px] text-muted-foreground">@{profile.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Bootcamps Section */}
            {searchResults.bootcamps.length > 0 && (
              <section className="px-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Active Bootcamps</h3>
                  <Link to="/app/bootcamps" className="text-[11px] font-semibold text-foreground hover:text-primary transition-colors">View all →</Link>
                </div>
                <div className="grid gap-3">
                  {searchResults.bootcamps.map((camp) => (
                    <Link key={camp.id} to="/app/bootcamps/$id" params={{ id: camp.id }} className="block tap">
                      <article className="overflow-hidden rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 transition-colors flex gap-4 p-3">
                        <div className="h-20 w-20 rounded-xl overflow-hidden shrink-0 bg-muted ring-1 ring-border">
                          {camp.banner_url ? (
                            <img src={camp.banner_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-primary/15 to-purple-500/10 flex items-center justify-center">
                              <Rocket className="h-6 w-6 text-primary/50" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 py-1 flex flex-col justify-between min-w-0">
                          <div>
                            <h4 className="text-[14px] font-semibold tracking-tight line-clamp-1">{camp.title}</h4>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">by {camp.profiles?.full_name || camp.profiles?.username}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-foreground tabular-nums">₦{Number(camp.price).toLocaleString()}</span>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Users className="h-3 w-3" /> 0 enrolled
                            </div>
                          </div>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Posts Section */}
            <section className="px-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-4">Posts & Shipped Work</h3>
              <div className="flex flex-col -mx-5">
                {searchResults.posts.length > 0 ? (
                  searchResults.posts.map((post) => (
                    <PostCard 
                      key={post.id} 
                      post={post} 
                      currentUser={currentUser} 
                      onCommentClick={setCommentPost} 
                    />
                  ))
                ) : (
                  <div className="py-10 text-center px-10">
                    <p className="text-sm text-muted-foreground">No posts matching "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </section>

            {searchResults.profiles.length === 0 && searchResults.bootcamps.length === 0 && searchResults.posts.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-24 px-8 text-center max-w-sm mx-auto">
                <div className="h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mb-5">
                  <Search className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground mb-1.5">Nothing matched</h3>
                <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                  We couldn't find builders, bootcamps, or posts for <span className="font-medium text-foreground/80">"{searchQuery}"</span>
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-6 text-[13px] font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground tap"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {isLoading ? (
              <div className="flex flex-col pt-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border-b hairline px-5 py-5">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-foreground/[0.05] shimmer" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 w-40 rounded bg-foreground/[0.05] shimmer" />
                        <div className="h-3 w-24 rounded bg-foreground/[0.05] shimmer" />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-3 w-full rounded bg-foreground/[0.05] shimmer" />
                      <div className="h-3 w-11/12 rounded bg-foreground/[0.05] shimmer" />
                      <div className="h-3 w-2/3 rounded bg-foreground/[0.05] shimmer" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPosts && filteredPosts.length > 0 ? (
              <div className="flex flex-col">
                {memoizedPostCards}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center pt-24 px-8 text-center max-w-sm mx-auto">
                <div className="h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mb-5">
                  <Flame className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground mb-1.5">A quiet feed</h3>
                <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                  Be the first to share your shipped work — it's how the Club rewards proof.
                </p>
                <Link
                  to="/app/ship"
                  className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-semibold tracking-tight text-background tap"
                >
                  Ship your work
                </Link>
              </div>
            )}
          </>
        )}
      </main>

      <CommentDrawer 
        post={commentPost} 
        isOpen={!!commentPost} 
        onOpenChange={(open) => !open && setCommentPost(null)} 
        onCommentAdded={() => {
          queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
        }}
      />

      {/* Floating Action Button Action Sheet */}
      <Drawer>
        <DrawerTrigger asChild>
          <button className="fixed bottom-24 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lift tap hover:opacity-90">
            <Plus className="h-6 w-6" strokeWidth={2} />
          </button>
        </DrawerTrigger>
        <DrawerContent className="bg-background/95 backdrop-blur-xl border-t hairline focus:ring-0 p-6">
          <DrawerTitle className="text-[22px] font-semibold tracking-tight mb-1 text-foreground">Create</DrawerTitle>
          <p className="text-[13px] text-muted-foreground mb-6">What would you like to make?</p>
          <div className="flex flex-col gap-2">
            <Link to="/app/compose" className="group flex items-center gap-4 p-3.5 rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 transition-all tap">
              <div className="h-11 w-11 shrink-0 rounded-full bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center">
                <Pencil className="h-[18px] w-[18px] text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Post</h3>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">Start a conversation with the community.</p>
              </div>
              <span className="text-muted-foreground text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>

            <Link to="/app/ship" className="group flex items-center gap-4 p-3.5 rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 transition-all tap">
              <div className="h-11 w-11 shrink-0 rounded-full bg-[#cc208f]/8 ring-1 ring-[#cc208f]/15 flex items-center justify-center">
                <Rocket className="h-[18px] w-[18px] text-[#cc208f]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Ship</h3>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">Share proof of work and earn XP.</p>
              </div>
              <span className="text-muted-foreground text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>

            <Link to="/app/notes/create" className="group flex items-center gap-4 p-3.5 rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 transition-all tap">
              <div className="h-11 w-11 shrink-0 rounded-full bg-emerald-500/8 ring-1 ring-emerald-500/15 flex items-center justify-center">
                <FileText className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Note</h3>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">Capture ideas, notes and learning insights.</p>
              </div>
              <span className="text-muted-foreground text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

