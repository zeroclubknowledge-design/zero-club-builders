import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Plus, Flame, Loader2, Radio, Video, ArrowRight, PenLine, NotebookPen, Building2, BadgeCheck, ChevronRight } from "@/components/icons/glyphs";
import { useState, useEffect, useMemo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { getPosts } from "@/api";
import { PostCard } from "@/components/PostCard";
import { SponsoredPostCard } from "@/features/boost/SponsoredPostCard";
import { getSponsoredPosts, sponsoredSlots } from "@/features/boost/api";
import { CommentDrawer } from "@/components/CommentDrawer";
import { Rocket } from "@/components/icons/glyphs";
import { getCachedSession } from "@/lib/auth";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useSharedPresence } from "@/hooks/useSharedPresence";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/app/")({
  /* ?create=1 is how the Post tab opens the create sheet from anywhere.
     ?club and ?ref arrive from sign-in and invite links and are read by the
     app shell, so they pass through untouched. */
  validateSearch: (search: Record<string, unknown>): { create?: 1; club?: string; ref?: string } => ({
    ...(search.create === 1 || search.create === "1" ? { create: 1 as const } : {}),
    ...(typeof search.club === "string" ? { club: search.club } : {}),
    ...(typeof search.ref === "string" ? { ref: search.ref } : {}),
  }),
  component: Feed,
});

function LiveClubCard({ club, currentUserId, onOpen }: { club: any; currentUserId?: string; onOpen: (clubId: string) => void }) {
  const { presenceState } = useSharedPresence(club?.id ? `live-presence-${club.id}` : '');
  // Live while anyone is still inside, not only while a host is.
  const inRoom = Object.values(presenceState).flat().filter((person: any) => person?.agora_uid != null);
  const liveHosts = inRoom.length;
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
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{liveHosts > 0 ? `${liveHosts} ${liveHosts === 1 ? 'person' : 'people'} in the room` : isHost ? 'Your community is ready' : 'The host has not started yet'}</p>
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
        .limit(300);

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
                <span className="relative z-10 -mt-11 grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border-[3px] border-card bg-card text-muted-foreground shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)]">
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: postsData, isLoading } = useQuery({ 
    queryKey: ['feed_posts'], 
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    queryFn: () => getPosts() 
  });
  const posts = postsData || [];
  const { data: currentUser } = useUser();
  
  const [activeTab, setActiveTab] = useState("Discover");
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [commentPost, setCommentPost] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { create } = Route.useSearch();

  // The Post tab lands here with ?create=1. Open the sheet, then drop the
  // flag so a refresh or a back navigation does not open it again.
  useEffect(() => {
    if (!create) return;
    setCreateOpen(true);
    router.navigate({ to: "/app", search: {}, replace: true });
  }, [create]);
  const [livePickerOpen, setLivePickerOpen] = useState(false);

  const { data: liveClubs = [], isLoading: liveClubsLoading } = useQuery({
    queryKey: ['feed_live_clubs', currentUser?.id],
    enabled: Boolean(currentUser?.id),
    staleTime: 1000 * 60 * 3,
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

  // Memoised so a re-render of the feed (a tab tap, a sheet opening) doesn't
  // rebuild every post card — that was a full re-render of ~100 cards, videos
  // included, on every state change.
  const filteredPosts = useMemo(() => (postsData || []).filter((post: any) => {
    if (activeTab === "Following") {
      // Show if user is the author OR if it's a repost from someone the user follows
      const isOriginalFromFollowed = followingIds.includes(post.author_id);
      const isRepostFromFollowed = post.type === 'repost' && followingIds.includes(post.reposter_id);
      return isOriginalFromFollowed || isRepostFromFollowed;
    }

    return true;
  }), [postsData, activeTab, followingIds]);

  /* Boosted posts, shown as Sponsored at intervals on Discover only — after the
     4th post and then every 8th, never two in a row, at most three per load. */
  const { data: sponsored = [] } = useQuery({
    queryKey: ["sponsored", "feed", currentUser?.id],
    enabled: Boolean(currentUser?.id) && activeTab === "Discover",
    staleTime: 1000 * 60 * 5,
    queryFn: () => getSponsoredPosts("feed", 3),
  });

  const memoizedPostCards = useMemo(() => {
    const slots = activeTab === "Discover" ? sponsoredSlots(filteredPosts.length) : [];
    const out: ReactNode[] = [];
    filteredPosts.forEach((post: any, index: number) => {
      const slot = slots.indexOf(index);
      if (slot >= 0 && sponsored[slot]) out.push(<SponsoredPostCard key={`sponsored-${sponsored[slot].boost_id}`} item={sponsored[slot]} />);
      out.push(
        <PostCard 
          key={post.id} 
          post={post} 
          currentUser={currentUser} 
          onCommentClick={setCommentPost} 
        />
      );
    });
    return out;
  }, [filteredPosts, currentUser, sponsored, activeTab]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Pinned a pixel under the app header rather than exactly at its edge.
          The header sits above this one, so the overlap is invisible — and it
          means no rounding difference can ever reopen a gap for posts to
          scroll through. */}
      <header className="zc-page-width zc-feed-tabs sticky top-[calc(var(--zc-header-h)-1px)] z-40 w-full border-b border-border bg-card">
        <div className="flex h-11 items-stretch justify-between px-4">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-[22px] overflow-x-auto">
            {["Discover", "Following", "Live", "Leaderboard", "Institution"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative whitespace-nowrap text-[14px] font-semibold transition-colors ${activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"}`}
              >
                {tab}
                {activeTab === tab && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground" />}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="my-auto ml-4 hidden h-8 items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background tap hover:opacity-90 md:inline-flex"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>
      </header>

      <main className="zc-page-width zc-feed-content w-full min-w-0">
          <>
            {activeTab === 'Leaderboard' ? (
              <div className="mt-2 bg-card md:rounded-xl md:border md:border-border">
                <Leaderboard currentUserId={currentUser?.id} />
              </div>
            ) : activeTab === 'Institution' ? (
              <div className="mt-2 bg-card md:rounded-xl md:border md:border-border">
                <InstitutionDirectory />
              </div>
            ) : activeTab === 'Live' ? (
              <div className="mt-2 space-y-5 bg-card p-3 sm:p-5 md:rounded-xl md:border md:border-border">
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
                      <div className="hidden h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#cc208f] to-[#8c1866] text-white shadow-[0_14px_32px_-12px_rgba(204,32,143,0.9)] ring-1 ring-white/15 sm:grid">
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
            {/* The composer strip. Tapping it opens the same create sheet as
                the Post tab; the rocket goes straight to shipping a project. */}
            <div className="zc-feed-composer mt-2 flex items-center gap-3 bg-card px-4 py-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-accent/10 text-[14px] font-semibold uppercase text-accent">
                    {currentUser?.username?.substring(0, 1) || "U"}
                  </div>
                )}
              </div>
              <button
                onClick={() => setCreateOpen(true)}
                className="h-11 min-w-0 flex-1 truncate rounded-full border border-foreground/20 px-4 text-left text-[14px] font-medium text-muted-foreground tap hover:bg-foreground/[0.03]"
              >
                Share what you shipped
              </button>
              <Link
                to="/app/ship"
                aria-label="Ship a project"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground tap hover:bg-foreground/[0.04] hover:text-foreground"
              >
                <Rocket className="h-[22px] w-[22px]" />
              </Link>
            </div>

            {isLoading ? (
              <div className="flex flex-col">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="mt-2 bg-card px-4 py-4 md:rounded-xl md:border md:border-border">
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
              <div className="mt-2 flex flex-col items-center bg-card px-8 py-16 text-center md:rounded-xl md:border md:border-border">
                <div className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-foreground/[0.05]">
                  <Flame className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mb-1.5 font-display text-[18px] font-semibold text-foreground">A quiet feed</h3>
                <p className="max-w-xs text-[14px] leading-relaxed text-muted-foreground">
                  Be the first to share your shipped work — it's how the Club rewards proof.
                </p>
                <Link
                  to="/app/ship"
                  className="mt-6 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[15px] font-semibold text-background tap"
                >
                  Ship your work
                </Link>
              </div>
            )}
              </>
            )}
          </>
      </main>

      <CommentDrawer 
        post={commentPost} 
        isOpen={!!commentPost} 
        onOpenChange={(open) => !open && setCommentPost(null)} 
        onCommentAdded={() => {
          queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
        }}
      />

      {/* The create sheet, opened by the Post tab, the composer strip and the
          desktop Create button. */}
      <Drawer open={createOpen} onOpenChange={setCreateOpen}>
        <DrawerContent className="mx-auto max-h-[72dvh] w-full max-w-[520px] overflow-hidden rounded-t-lg border border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:ring-0">
          {/* One shape for every option, so nothing looks like an
              afterthought — Go live sits in the same row as the rest rather
              than as a hand-built tile with a warning-red chip. */}
          <div className="pb-2 pt-1">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">Create something</DrawerTitle>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">Choose a format and get straight to work.</p>
          </div>

          <div className="-mx-4 flex flex-col">
            {[
              {
                to: "/app/compose",
                Icon: PenLine,
                label: "Post",
                copy: "Start a conversation",
                tint: "bg-foreground/[0.06] text-foreground",
              },
              {
                to: "/app/ship",
                Icon: Rocket,
                label: "Ship",
                copy: "Share proof of work",
                tint: "bg-[#cc208f]/10 text-[#cc208f]",
              },
              {
                to: "/app/notes/create",
                Icon: NotebookPen,
                label: "Note",
                copy: "Write something longer",
                tint: "bg-[#1a7f4b]/10 text-[#1a7f4b]",
              },
              {
                onClick: () => { setCreateOpen(false); window.setTimeout(() => setLivePickerOpen(true), 180); },
                Icon: Radio,
                label: "Go live",
                copy: "Open a community room",
                tint: "bg-[#e0245e]/10 text-[#e0245e]",
              },
            ].map(({ to, onClick, Icon, label, copy, tint }) => {
              const inner = (
                <>
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tint}`}>
                    <Icon className="h-[22px] w-[22px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-medium text-foreground">{label}</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">{copy}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </>
              );
              const className =
                "flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.06]";

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
          <div className="px-5 pb-3 pt-1">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">Go live</DrawerTitle>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">Choose the community that will host this session.</p>
          </div>
          <div className="max-h-[55dvh] overflow-y-auto overscroll-contain px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {liveClubsLoading ? (
              <div className="grid min-h-32 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : hostClubs.length > 0 ? (
              <>
                <p className="pb-1 text-[13px] font-semibold text-muted-foreground">Clubs you host</p>
                {hostClubs.map((club: any) => (
                  <button key={club.id} onClick={() => openLiveRoom(club.id)} className="-mx-5 flex w-[calc(100%+2.5rem)] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-foreground/[0.04]">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-foreground/[0.06]">
                      {club.banner_url ? <img src={club.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <div className="grid h-full w-full place-items-center"><Radio className="h-5 w-5 text-[#e0245e]" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{club.name}</p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">Start an instant session</p>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
                  <Radio className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-[16px] font-semibold">No community to host yet</h3>
                <p className="mx-auto mt-1 max-w-xs text-[14px] leading-relaxed text-muted-foreground">Create a club or ask an administrator to make you an admin before starting a live room.</p>
                <Link to="/app/clubs" className="mt-5 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[15px] font-semibold text-background">Open Clubs</Link>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}

