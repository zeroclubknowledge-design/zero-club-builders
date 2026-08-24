import { useLoaderData, createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Heart, MessageCircle, Share2, Plus, Bell, Repeat, Search, MoreHorizontal, CheckCircle2, Flame, Send, X, Zap, Bookmark, Loader2, Radio, Video, ArrowRight, PenLine, NotebookPen, Building2, BadgeCheck } from "@/components/icons/solar";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { getPosts, searchEverything } from "@/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { Star, Users, Rocket, UserPlus, FileText, Pencil, Sparkles } from "@/components/icons/solar";
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
        {club.banner_url && <img src={club.banner_url} alt="" className="h-full w-full object-cover opacity-65" loading="lazy" decoding="async" />}
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

/**
 * Who is building the most in public.
 *
 * Ranked on posts published, because that is the one signal the platform has
 * that is entirely within a person's control — you cannot be given a post the
 * way you can be given likes or a follow. It is a first cut: when shipped work
 * and referrals are worth ranking on, the ordering changes here and the rest
 * of the screen does not.
 *
 * Counted client-side over the recent window rather than through a database
 * function, so that this can ship without another migration to run. If the
 * board ever needs to cover every post ever written, it wants a view with an
 * index behind it, not a bigger limit.
 */
function Leaderboard({ currentUserId }: { currentUserId?: string }) {
  const { data: leaders = [], isLoading } = useQuery({
    queryKey: ["leaderboard-posts"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data: posts } = await supabase
        .from("posts")
        .select("author_id")
        .order("created_at", { ascending: false })
        .limit(3000);

      const tally = new Map<string, number>();
      for (const post of posts || []) {
        if (!post.author_id) continue;
        tally.set(post.author_id, (tally.get(post.author_id) || 0) + 1);
      }

      // Fifteen. A leaderboard is meant to be read, and past the first screen
      // nobody is checking their position — they are scrolling past strangers.
      const ranked = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      if (ranked.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, xp")
        .in("id", ranked.map(([id]) => id));

      const byId = new Map((profiles || []).map((person: any) => [person.id, person]));
      return ranked
        .map(([id, posts]) => ({ ...(byId.get(id) || {}), id, posts }))
        .filter((person: any) => person.username);
    },
  });

  if (isLoading) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const medal = ["text-[#e2b53f]", "text-[#b4b8bf]", "text-[#c98b5a]"];

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="px-1">
        <h2 className="text-[16px] font-semibold tracking-tight">Leaderboard</h2>
        {/* Deliberately says nothing about how the rank is calculated.
            Posting is only what counts today; teaching, shipping and
            contribution are meant to count too, and a line naming one input
            reads as a promise that posting is the way to win. */}
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          The builders showing up for the community this week.
        </p>
      </div>

      {leaders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-[12.5px] text-muted-foreground">
          Nobody has posted yet. Be the first.
        </p>
      ) : (
        <div className="space-y-2">
          {leaders.map((person: any, index: number) => {
            const isMe = person.id === currentUserId;
            return (
              <Link
                key={person.id}
                to="/app/profile/$id"
                params={{ id: person.username || person.id }}
                className={`flex min-w-0 items-center gap-3 rounded-2xl p-3.5 transition hover:opacity-90 ${
                  isMe ? "bg-primary/[0.07] ring-1 ring-primary/20" : "bg-card"
                }`}
              >
                {/* The number carries the rank; a medal colour marks the top
                    three without needing a separate podium block. */}
                <span className={`w-6 shrink-0 text-center text-[15px] font-semibold tabular-nums ${index < 3 ? medal[index] : "text-muted-foreground"}`}>
                  {index + 1}
                </span>

                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[13px] font-semibold text-muted-foreground">
                  {person.avatar_url ? (
                    <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    (person.full_name || person.username || "?")[0].toUpperCase()
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold tracking-tight">
                    {person.full_name || person.username}
                    {isMe && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">you</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">@{person.username}</span>
                </span>

              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Every institution on Zero Club, and nothing else.
 *
 * This tab used to be "Academy" and showed the ordinary feed, which meant it
 * was a label with no behaviour behind it. Institutions are the one kind of
 * account people go looking for deliberately — you search for a school, you do
 * not stumble across it in a feed — so the tab is now a directory.
 */
function InstitutionDirectory() {
  const { data: institutions = [], isLoading } = useQuery({
    queryKey: ["institutions-directory"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, banner_url, bio, location")
        .ilike("account_type", "institution")
        .order("created_at", { ascending: false })
        .limit(60);

      const list = profiles || [];
      if (list.length === 0) return [];

      // One round trip for the counts rather than two per institution.
      const ids = list.map((item: any) => item.id);
      const [{ data: tutorLinks }, { data: programmes }] = await Promise.all([
        supabase.from("institution_tutors").select("institution_id").in("institution_id", ids),
        supabase.from("bootcamps").select("creator_id").in("creator_id", ids).eq("status", "active"),
      ]);

      const tally = (rows: any[] | null, key: string) => {
        const counts: Record<string, number> = {};
        for (const row of rows || []) counts[row[key]] = (counts[row[key]] || 0) + 1;
        return counts;
      };
      const tutorCounts = tally(tutorLinks, "institution_id");
      const programmeCounts = tally(programmes, "creator_id");

      return list.map((item: any) => ({
        ...item,
        tutorCount: tutorCounts[item.id] || 0,
        programmeCount: programmeCounts[item.id] || 0,
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="px-1">
        <h2 className="text-[16px] font-semibold tracking-tight">Institutions on Zero Club</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Schools, academies and organisations running programmes here.
        </p>
      </div>

      {institutions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-[12.5px] text-muted-foreground">
          No institutions have joined yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {institutions.map((institution: any) => (
            <Link
              key={institution.id}
              to="/app/institution/$id"
              params={{ id: institution.username || institution.id }}
              className="group min-w-0 overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/15"
            >
              <div className="relative h-20 bg-gradient-to-br from-[#241a2b] via-[#17131b] to-[#0e0c10]">
                {institution.banner_url && (
                  <img src={institution.banner_url} alt="" className="h-full w-full object-cover opacity-70" loading="lazy" decoding="async" />
                )}
              </div>
              <div className="flex min-w-0 items-start gap-3 p-4">
                <span className="-mt-9 grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-card text-muted-foreground ring-1 ring-border">
                  {institution.avatar_url ? (
                    <img src={institution.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <Building2 className="h-6 w-6" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[14.5px] font-semibold tracking-tight">
                      {institution.full_name || institution.username}
                    </p>
                    <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                    {institution.location || `@${institution.username}`}
                  </p>
                  <p className="mt-2 text-[11.5px] text-muted-foreground tabular-nums">
                    {institution.programmeCount} {institution.programmeCount === 1 ? "programme" : "programmes"}
                    {" · "}
                    {institution.tutorCount} {institution.tutorCount === 1 ? "tutor" : "tutors"}
                  </p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
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
    <div className="flex min-h-screen flex-col bg-background pb-20 md:pb-12">
      {/* Top Header Tabs */}
      {/* Pinned a pixel under the app header rather than exactly at its edge.
          The header sits above this one, so the overlap is invisible — and it
          means no rounding difference can ever reopen a gap for posts to
          scroll through. */}
      <header className="sticky top-[calc(var(--zc-header-h)-1px)] z-40 border-b border-border bg-background md:mx-auto md:w-full md:max-w-[780px] md:border-x">
        <div className="flex min-h-[52px] items-center justify-between px-4 py-1">
          {!showSearch ? (
            <>
              <div className="no-scrollbar flex min-w-0 flex-1 gap-5 overflow-x-auto">
                {["Discover", "Following", "Live", "Leaderboard", "Institution"].map((tab) => (
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
                          <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
                            <img src={camp.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
            {activeTab === 'Leaderboard' ? (
              <Leaderboard currentUserId={currentUser?.id} />
            ) : activeTab === 'Institution' ? (
              <InstitutionDirectory />
            ) : activeTab === 'Live' ? (
              <div className="space-y-5 p-3 sm:p-5">
                {/* Built from the same material as the wallet card: dark
                    gradient base, soft colour washes for depth, and thick
                    low-opacity rings that read as embossing rather than as
                    lines drawn on top. A third red wash carries the one thing
                    this card is about — being live. */}
                <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#241a2b] via-[#17131b] to-[#0e0c10] p-5 text-white shadow-[0_28px_65px_-30px_rgba(20,12,19,0.85)] ring-1 ring-black/10 sm:p-7">
                  <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#cc208f]/22 blur-[72px]" />
                  <div className="pointer-events-none absolute -bottom-28 -right-16 h-52 w-52 rounded-full bg-[#713bff]/18 blur-[76px]" />
                  <div className="pointer-events-none absolute -right-20 top-2 h-40 w-40 rounded-full bg-[#ff3b5c]/15 blur-[70px]" />
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />
                  <div className="pointer-events-none absolute -bottom-14 right-20 h-28 w-28 rotate-12 border-[16px] border-white opacity-[0.035]" />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-5">
                      <div className="min-w-0">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 ring-1 ring-white/10">
                          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" /><span className="relative h-2 w-2 rounded-full bg-red-500" /></span>
                          Live on Zero Club
                        </div>
                        <h2 className="max-w-md text-[23px] font-semibold leading-tight tracking-tight sm:text-[27px]">
                          Teach, build and solve problems together in <span className="text-[#f06ac3]">real time</span>.
                        </h2>
                        <p className="mt-2.5 max-w-lg text-[12.5px] leading-relaxed text-white/55">Start inside a community you manage, or join a room when its host goes live.</p>
                      </div>
                      <div className="hidden h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#cc208f] to-[#7a2bff] text-white shadow-[0_14px_32px_-12px_rgba(204,32,143,0.9)] ring-1 ring-white/15 sm:grid">
                        <Radio className="h-6 w-6" />
                      </div>
                    </div>
                    <button onClick={() => setLivePickerOpen(true)} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[12.5px] font-semibold text-[#12101a] shadow-[0_12px_26px_-14px_rgba(0,0,0,0.9)] transition hover:bg-white/92 active:scale-[0.98]">
                      <Radio className="h-4 w-4" /> Go live now
                    </button>
                  </div>
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
                  <img src={currentUser.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
          {/* One shape for every option, so nothing looks like an
              afterthought — the Go live tile was previously built by hand with
              a different layout and a solid red chip, which made it read as a
              warning rather than an invitation. */}
          <DrawerTitle className="text-[19px] font-semibold tracking-tight text-foreground">Create something</DrawerTitle>
          <p className="mb-4 mt-1 text-[12.5px] text-muted-foreground">Choose a format and get straight to work.</p>

          <div className="grid grid-cols-2 gap-2.5">
            {[
              {
                to: "/app/compose",
                Icon: PenLine,
                label: "Post",
                copy: "Start a conversation",
                tint: "bg-primary/[0.08] text-primary ring-primary/15",
              },
              {
                to: "/app/ship",
                Icon: Rocket,
                label: "Ship",
                copy: "Share proof of work",
                tint: "bg-[#cc208f]/[0.08] text-[#cc208f] ring-[#cc208f]/15",
              },
              {
                to: "/app/notes/create",
                Icon: NotebookPen,
                label: "Note",
                copy: "Write something longer",
                tint: "bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400 ring-emerald-500/15",
              },
              {
                onClick: () => { setCreateOpen(false); window.setTimeout(() => setLivePickerOpen(true), 180); },
                Icon: Radio,
                label: "Go live",
                copy: "Open a community room",
                tint: "bg-red-500/[0.08] text-red-500 ring-red-500/15",
              },
            ].map(({ to, onClick, Icon, label, copy, tint }) => {
              const inner = (
                <>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 ${tint}`}>
                    <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
                  </span>
                  <span className="mt-3 block text-[15px] font-semibold tracking-tight text-foreground">{label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{copy}</span>
                </>
              );
              const className =
                "flex min-h-[124px] flex-col items-start rounded-xl bg-card p-4 text-left ring-1 ring-border shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_26px_-16px_rgba(0,0,0,0.18)] transition-all tap hover:-translate-y-0.5 hover:ring-foreground/15 active:scale-[0.98]";

              return to ? (
                <Link key={label} to={to} className={className}>{inner}</Link>
              ) : (
                <button key={label} type="button" onClick={onClick} className={className}>{inner}</button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={livePickerOpen} onOpenChange={setLivePickerOpen}>
        <DrawerContent className="mx-auto max-h-[76dvh] w-full max-w-[520px] overflow-hidden rounded-t-lg border border-border bg-background p-0 focus:ring-0">
          <div className="border-b border-border/60 px-4 pb-3 pt-1 sm:px-5 sm:pb-4 sm:pt-5">
            <DrawerTitle className="flex items-center gap-2 text-[18px] font-semibold tracking-tight"><Radio className="h-5 w-5 text-red-500" /> Go live</DrawerTitle>
            <p className="mt-1 text-[12px] text-muted-foreground">Choose the community that will host this session.</p>
          </div>
          <div className="max-h-[55dvh] space-y-2 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {liveClubsLoading ? (
              <div className="grid min-h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : hostClubs.length > 0 ? hostClubs.map((club: any) => (
              <button key={club.id} onClick={() => openLiveRoom(club.id)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-accent/40">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[#171318]">
                  {club.banner_url ? <img src={club.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <div className="grid h-full w-full place-items-center"><Radio className="h-5 w-5 text-primary" /></div>}
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

