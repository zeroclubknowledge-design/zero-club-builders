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
    <div className="flex flex-col min-h-screen bg-background pb-24">
      {/* Top Header Tabs */}
      <header className="sticky top-[72px] z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center px-4 py-1 justify-between min-h-[48px]">
          {!showSearch ? (
            <>
              <div className="flex gap-6 overflow-x-auto no-scrollbar">
                {["Discover", "Following", "Live", "News", "Academy"].map((tab) => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative py-3 text-sm font-bold transition-colors whitespace-nowrap ${activeTab === tab ?"text-foreground" : "text-muted-foreground"}`}
                  >
                    {tab}
                    {activeTab === tab && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-6 rounded-full bg-primary shadow-glow" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 pl-4 border-l border-white/10">
                <button 
                  onClick={() => setShowSearch(true)}
                  className="p-1 transition active:scale-95"
                >
                  <Search className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center gap-3 py-2 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex-1 relative group">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-md opacity-0 group-focus-within:opacity-100 transition-all duration-500" />
                <div className="relative flex items-center">
                  <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Search builders, bootcamps, topics..."
                    className="w-full rounded-full bg-accent/40 border border-border/50 backdrop-blur-md py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:bg-background transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <button 
                onClick={() => { setShowSearch(false); setSearchQuery(""); }}
                className="text-sm font-bold text-primary px-2"
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
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-4 text-sm text-muted-foreground font-medium">Searching the Club...</p>
          </div>
        ) : searchQuery.length >= 2 ? (
          <div className="flex flex-col gap-8 pb-10">
            {/* Profiles/Tutors Section */}
            {searchResults.profiles.length > 0 && (
              <section className="px-5 pt-6">
                <h3 className="text-xs text-muted-foreground mb-4">Builders & Tutors</h3>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {searchResults.profiles.map((profile) => (
                    <Link 
                      key={profile.id} 
                      to="/app/profile/$id" 
                      params={{ id: profile.id }}
                      className="flex flex-col items-center gap-2 shrink-0 group"
                    >
                      <div className="h-16 w-16 rounded-2xl overflow-hidden border border-border group-active:scale-95 transition-transform">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full bg-gradient-primary flex items-center justify-center text-xl font-bold text-white">
                            {profile.username?.substring(0,1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] font-bold text-foreground line-clamp-1 w-16">
                          {profile.full_name || profile.username}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{getFirstName(profile)}</p>
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
                  <h3 className="text-xs text-muted-foreground">Active Bootcamps</h3>
                  <Link to="/app/bootcamps" className="text-[10px] font-bold text-primary hover:underline">View all</Link>
                </div>
                <div className="grid gap-4">
                  {searchResults.bootcamps.map((camp) => (
                    <Link key={camp.id} to="/app/bootcamps/$id" params={{ id: camp.id }} className="block transition active:scale-[0.98">
                      <article className="overflow-hidden rounded-2xl bg-card border border-border flex gap-4 p-3">
                        <div className="h-20 w-20 rounded-xl overflow-hidden shrink-0 bg-muted">
                          {camp.banner_url ? (
                            <img src={camp.banner_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                              <Rocket className="h-6 w-6 text-primary/40" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 py-1 flex flex-col justify-between">
                          <div>
                            <h4 className="text-sm font-bold line-clamp-1">{camp.title}</h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1">by {camp.profiles?.full_name || camp.profiles?.username}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-primary">₦{Number(camp.price).toLocaleString()}</span>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
              <h3 className="text-xs text-muted-foreground mb-4">Post Topics & Shipped Work</h3>
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
              <div className="flex flex-col items-center justify-center pt-20 px-6 text-center">
                <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                  <Search className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">No matching results</h3>
                <p className="text-sm text-muted-foreground">
                  We couldn't find any builders, bootcamps, or posts matching "{searchQuery}"
                </p>
                <button 
                  onClick={() => setSearchQuery("")}
                  className="mt-6 text-sm font-bold text-primary hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {isLoading ? (
              <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filteredPosts && filteredPosts.length > 0 ? (
              <div className="flex flex-col">
                {memoizedPostCards}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center pt-20 px-6 text-center">
                <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                  <Flame className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">No posts yet</h3>
                <p className="text-sm text-muted-foreground">
                  Be the first to share your shipped work with the club!
                </p>
                <Link 
                  to="/app/ship"
                  className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-glow transition active:scale-95"
                >
                  Ship Work
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
          <button className="fixed bottom-24 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#10b981] text-black shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all active:scale-90 hover:brightness-110">
            <Plus className="h-7 w-7" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="bg-background/95 backdrop-blur-xl border-t border-border focus:ring-0 p-6">
          <DrawerTitle className="text-xl font-bold mb-6 text-foreground">What would you like to do?</DrawerTitle>
          <div className="flex flex-col gap-4">
            <Link to="/app/compose" className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/40 hover:border-border transition active:scale-[0.98]">
              <div className="h-12 w-12 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                <Pencil className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">Create</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Start a conversation with the community.</p>
              </div>
            </Link>
            
            <Link to="/app/ship" className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/40 hover:border-border transition active:scale-[0.98]">
              <div className="h-12 w-12 shrink-0 rounded-full bg-[#cc208f]/10 flex items-center justify-center">
                <Rocket className="h-5 w-5 text-[#cc208f]" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">Ship</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Share proof of work and earn XP.</p>
              </div>
            </Link>

            <Link to="/app/notes/create" className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/40 hover:border-border transition active:scale-[0.98]">
              <div className="h-12 w-12 shrink-0 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">ZeroNotes</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Capture ideas, notes and learning insights.</p>
              </div>
            </Link>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

