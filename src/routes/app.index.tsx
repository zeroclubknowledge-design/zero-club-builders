import { useLoaderData, createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { 
  Heart, MessageCircle, Share2, Plus, Bell, Repeat, 
  Search, MoreHorizontal, CheckCircle2, Flame, Send, X, Zap, Bookmark, Loader2,
  Radio, Video, ArrowRight
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
import { useSharedPresence } from "@/hooks/useSharedPresence";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFirstName } from "@/lib/utils";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

export const Route = createFileRoute("/app/")({
  component: Feed,
});

function LiveClubCard({ club, currentUserId, onOpen }: { club: any; currentUserId?: string; onOpen: (clubId: string) => void }) {
  const { presenceState } = useSharedPresence(club?.id ? `live-presence-${club.id}` : '');
  const liveHosts = Object.values(presenceState).flat().filter((person: any) => person?.isAdmin).length;
  const isHost = club.creator_id === currentUserId || ['administrator', 'admin', 'moderator'].includes((club.member_role || '').toLowerCase());
  const canEnter = isHost || liveHosts > 0;

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative h-24 bg-[#171318]">
        {club.banner_url && <img src={club.banner_url} alt="" className="h-full w-full object-cover opacity-65" />}
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${liveHosts > 0 ? 'bg-red-500 animate-pulse' : 'bg-white/40'}`} />
          {liveHosts > 0 ? 'LIVE NOW' : isHost ? 'READY TO HOST' : 'OFFLINE'}
        </div>
      </div>
      <div className="flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold tracking-tight">{club.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{liveHosts > 0 ? `${liveHosts} host${liveHosts === 1 ? '' : 's'} on stage` : isHost ? 'Your community is ready' : 'The host has not started yet'}</p>
        </div>
        <button
          onClick={() => canEnter && onOpen(club.id)}
          disabled={!canEnter}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold ${canEnter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          {isHost ? <Radio className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          {isHost ? 'Go live' : liveHosts > 0 ? 'Join' : 'Offline'}
        </button>
      </div>
    </article>
  );
}

function Feed() {
  const { format } = useWalletCurrency();
  const router = useRouter();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [livePickerOpen, setLivePickerOpen] = useState(false);

  const { data: liveClubs = [], isLoading: liveClubsLoading } = useQuery({
    queryKey: ['feed_live_clubs', currentUser?.id],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      const [ownedResult, membershipsResult] = await Promise.all([
        supabase.from('clubs').select('*').eq('creator_id', currentUser!.id),
        supabase.from('club_members').select('role, clubs(*)').eq('profile_id', currentUser!.id),
      ]);
      const clubsById = new Map<string, any>();
      (ownedResult.data || []).forEach((club: any) => clubsById.set(club.id, { ...club, member_role: 'Administrator' }));
      (membershipsResult.data || []).forEach((membership: any) => {
        if (membership.clubs) clubsById.set(membership.clubs.id, { ...membership.clubs, member_role: membership.role });
      });
      return Array.from(clubsById.values());
    },
  });

  const hostClubs = liveClubs.filter((club: any) => (
    club.creator_id === currentUser?.id || ['administrator', 'admin', 'moderator'].includes((club.member_role || '').toLowerCase())
  ));

  const openLiveRoom = (clubId: string) => {
    setLivePickerOpen(false);
    router.navigate({ to: '/app/live/$classId', params: { classId: clubId } });
  };

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
    <div className="flex min-h-screen flex-col bg-[#f8f7f5] pb-20 dark:bg-background md:pb-12">
      {/* Top Header Tabs */}
      <header className="sticky top-[calc(66px+env(safe-area-inset-top))] z-40 border-b border-border bg-background md:top-[66px] md:mx-auto md:w-full md:max-w-[780px] md:border-x">
        <div className="flex min-h-[52px] items-center justify-between px-4 py-1">
          {!showSearch ? (
            <>
              <div className="no-scrollbar flex min-w-0 flex-1 gap-5 overflow-x-auto">
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
              <div className="flex items-center gap-2 pl-4">
                <button
                  onClick={() => setShowSearch(true)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground tap hover:bg-accent hover:text-foreground"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="hidden items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-[12.5px] font-semibold text-background tap hover:opacity-90 md:inline-flex"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Create
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
                  className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-4 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
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

      <main className="flex-1 bg-background md:mx-auto md:mb-12 md:w-full md:max-w-[780px] md:border-x md:border-b md:border-border/60">
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
                      <article className="flex gap-4 overflow-hidden rounded-lg bg-card p-3 ring-1 ring-border transition-colors hover:ring-foreground/15">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
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
                            <span className="text-[13px] font-semibold text-foreground tabular-nums">{format(Number(camp.price))}</span>
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
            {activeTab === 'Live' ? (
              <div className="space-y-5 p-3 sm:p-5">
                <section className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#171318] p-5 text-white sm:p-6">
                  <div className="flex items-start justify-between gap-5">
                    <div className="min-w-0">
                      <div className="mb-4 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" /><span className="relative h-2 w-2 rounded-full bg-red-500" /></span>
                        Live on Zero Club
                      </div>
                      <h2 className="max-w-md text-[23px] font-semibold leading-tight tracking-tight sm:text-[27px]">Teach, build and solve problems together in real time.</h2>
                      <p className="mt-2 max-w-lg text-[12.5px] leading-relaxed text-white/55">Start inside a community you manage, or join a room when its host goes live.</p>
                    </div>
                    <div className="hidden h-14 w-14 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground sm:grid"><Radio className="h-6 w-6" /></div>
                  </div>
                  <button onClick={() => setLivePickerOpen(true)} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-[12.5px] font-semibold text-black">
                    <Radio className="h-4 w-4" /> Go live now
                  </button>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div><h3 className="text-[14px] font-semibold tracking-tight">Your live communities</h3><p className="mt-0.5 text-[11.5px] text-muted-foreground">Rooms update automatically when a host takes the stage.</p></div>
                    <span className="text-[11px] text-muted-foreground">{liveClubs.length}</span>
                  </div>
                  {liveClubsLoading ? (
                    <div className="grid min-h-36 place-items-center rounded-lg border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : liveClubs.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {liveClubs.map((club: any) => <LiveClubCard key={club.id} club={club} currentUserId={currentUser?.id} onOpen={openLiveRoom} />)}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-card p-8 text-center">
                      <Video className="mx-auto h-6 w-6 text-muted-foreground" />
                      <h3 className="mt-4 text-[15px] font-semibold">Join a club to enter live rooms</h3>
                      <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">Live sessions stay attached to communities so people know who is hosting and why they are gathering.</p>
                      <Link to="/app/clubs" className="mt-5 inline-flex items-center gap-1 text-[12px] font-semibold text-primary">Explore clubs <ArrowRight className="h-4 w-4" /></Link>
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <>
            {/* Desktop inline composer */}
            <div className="m-3 hidden items-center gap-3.5 rounded-lg border border-border bg-card px-4 py-3 md:flex">
              <div className="h-10 w-10 rounded-full overflow-hidden ring-1 ring-border shrink-0">
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-primary flex items-center justify-center text-[12px] font-semibold text-white uppercase">
                    {currentUser?.username?.substring(0, 1) || "U"}
                  </div>
                )}
              </div>
              <button
                onClick={() => setCreateOpen(true)}
                className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-left text-[14px] text-muted-foreground transition-colors tap hover:bg-accent"
              >
                Share what you're building…
              </button>
              <Link
                to="/app/ship"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-[12.5px] font-semibold text-foreground tap hover:bg-accent"
              >
                <Rocket className="h-3.5 w-3.5 text-[#cc208f]" strokeWidth={1.75} />
                Ship
              </Link>
            </div>

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
      <Drawer open={createOpen} onOpenChange={setCreateOpen}>
        <DrawerTrigger asChild>
          <button className="fixed bottom-24 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lift tap hover:opacity-90 md:hidden">
            <Plus className="h-6 w-6" strokeWidth={2} />
          </button>
        </DrawerTrigger>
        <DrawerContent className="mx-auto max-h-[72dvh] w-full max-w-[520px] overflow-hidden rounded-t-lg border border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:ring-0">
          <DrawerTitle className="mb-1 text-[18px] font-semibold tracking-tight text-foreground">Create something</DrawerTitle>
          <p className="mb-4 text-[12px] text-muted-foreground">Choose a format and get straight to work.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Link to="/app/compose" className="group flex min-h-[108px] flex-col items-start rounded-lg bg-card p-3.5 ring-1 ring-border transition-all tap hover:bg-accent/40">
              <div className="h-11 w-11 shrink-0 rounded-full bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center">
                <Pencil className="h-[18px] w-[18px] text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Post</h3>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">Start a conversation with the community.</p>
              </div>
              <span className="text-muted-foreground text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>

            <Link to="/app/ship" className="group flex min-h-[108px] flex-col items-start rounded-lg bg-card p-3.5 ring-1 ring-border transition-all tap hover:bg-accent/40">
              <div className="h-11 w-11 shrink-0 rounded-full bg-[#cc208f]/8 ring-1 ring-[#cc208f]/15 flex items-center justify-center">
                <Rocket className="h-[18px] w-[18px] text-[#cc208f]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Ship</h3>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">Share proof of work and earn XP.</p>
              </div>
              <span className="text-muted-foreground text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>

            <Link to="/app/notes/create" className="group flex min-h-[108px] flex-col items-start rounded-lg bg-card p-3.5 ring-1 ring-border transition-all tap hover:bg-accent/40">
              <div className="h-11 w-11 shrink-0 rounded-full bg-emerald-500/8 ring-1 ring-emerald-500/15 flex items-center justify-center">
                <FileText className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Note</h3>
                <p className="text-[12.5px] text-muted-foreground mt-0.5 leading-snug">Capture ideas, notes and learning insights.</p>
              </div>
              <span className="text-muted-foreground text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>
            <button
              onClick={() => { setCreateOpen(false); window.setTimeout(() => setLivePickerOpen(true), 180); }}
              className="flex min-h-[108px] flex-col items-start rounded-lg bg-red-500/[0.04] p-3.5 text-left ring-1 ring-red-500/20 transition-colors hover:bg-red-500/[0.08]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-red-500 text-white"><Radio className="h-[18px] w-[18px]" /></div>
              <div className="mt-3"><h3 className="text-[15px] font-semibold tracking-tight">Go live</h3><p className="mt-0.5 text-[12px] text-muted-foreground">Open a community room.</p></div>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={livePickerOpen} onOpenChange={setLivePickerOpen}>
        <DrawerContent className="mx-auto max-h-[76dvh] w-full max-w-[520px] overflow-hidden rounded-t-lg border border-border bg-background p-0 focus:ring-0">
          <div className="border-b border-border/60 px-5 pb-4 pt-5">
            <DrawerTitle className="flex items-center gap-2 text-[18px] font-semibold tracking-tight"><Radio className="h-5 w-5 text-red-500" /> Go live</DrawerTitle>
            <p className="mt-1 text-[12px] text-muted-foreground">Choose the community that will host this session.</p>
          </div>
          <div className="max-h-[55dvh] space-y-2 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {liveClubsLoading ? (
              <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : hostClubs.length > 0 ? hostClubs.map((club: any) => (
              <button key={club.id} onClick={() => openLiveRoom(club.id)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/40">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[#171318]">
                  {club.banner_url ? <img src={club.banner_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center"><Radio className="h-5 w-5 text-primary" /></div>}
                </div>
                <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold">{club.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Start an instant session</p></div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )) : (
              <div className="py-8 text-center">
                <Radio className="mx-auto h-6 w-6 text-muted-foreground" />
                <h3 className="mt-3 text-[14px] font-semibold">No community to host yet</h3>
                <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted-foreground">Create a club or ask an administrator to make you an admin before starting a live room.</p>
                <Link to="/app/clubs" className="mt-5 inline-flex text-[12px] font-semibold text-primary">Open Clubs</Link>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

