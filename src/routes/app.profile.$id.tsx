import { useLoaderData, createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  BadgeCheck, Flame, MapPin, LinkIcon, CalendarDays, ChevronLeft, 
  Search, MoreHorizontal, Hash, Users, MessageCircle, Heart, 
  UserPlus, UserMinus, Loader2, Share2, Copy, Flag, X, Send, Link2,
  Bell, BellRing, Star, Play, CheckCircle2, Settings, Shield, Sparkles, Edit3, Mail, Pen, Zap
} from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { getProfile, enrichPosts } from "@/api";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName } from "@/lib/utils";
import { IconMessages } from "@/components/icons/nav";
import { useFollow } from "@/hooks/useFollow";
import { ProfileExperience } from "@/components/ProfileExperience";

export const Route = createFileRoute("/app/profile/$id")({
  loader: async ({ params: { id } }) => {
    // SECURITY/ROUTING FIX: If the ID is 'profile', it means the router mismatched the index route.
    // Redirect back to the correct index route.
    if (id === 'profile') {
      throw redirect({ to: '/app/profile' });
    }

    // Fetch only profile for SEO/Head, leave heavy data for component to load instantly
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const query = supabase
      .from('profiles')
      .select('*');
    
    /*
     * Never throws.
     *
     * This used to `throw error` on any failure and `throw new Error` when the
     * row came back empty. A loader that throws takes the whole navigation
     * down, so one slow or momentarily unauthenticated request meant the
     * profile simply would not open — and trying again a few times eventually
     * caught a good attempt. That is the "reload the app many times" symptom.
     *
     * None of those conditions are permanent. One retry covers the common
     * transient case, and returning null lets the page render and fetch the
     * profile itself on the client, where react-query retries properly.
     */
    const fetchProfile = async () =>
      (isUuid ? supabase.from('profiles').select('*').eq('id', id)
              : supabase.from('profiles').select('*').ilike('username', id)
      ).maybeSingle();

    try {
      let { data: profile, error } = await fetchProfile();

      // A single immediate retry: the usual cause is the auth token not being
      // attached yet on a cold start, which resolves within milliseconds.
      if (error || !profile) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        ({ data: profile } = await fetchProfile());
      }

      return { profile: profile ?? null };
    } catch {
      return { profile: null };
    }
  },
  head: ({ loaderData }) => {
    const profile = loaderData?.profile;
    const title = profile ? `${profile.full_name || profile.username} (${getFirstName(profile)}) on Zero Club` : "Profile | Zero Club";
    const description = profile?.bio || "Zero Club builder on the rise. Check out my builds!";
    /* Preview images must be ABSOLUTE urls. "/logo.png" is relative, so every
       profile without an avatar previewed with a broken image — crawlers do
       not resolve relative paths against the page they are reading. */
    const image = profile?.avatar_url?.startsWith("http")
      ? profile.avatar_url
      : "https://www.zeroclubs.xyz/logo.png";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:image:alt", content: `${profile?.full_name || profile?.username || "Builder"} on Zero Club` },
        { property: "og:type", content: "profile" },
        // summary_large_image when there is a real photo to show, so it is not
        // reduced to a thumbnail in the preview card.
        { name: "twitter:card", content: profile?.avatar_url ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ]
    };
  },
  component: ProfileDetail,
});

const tabs = ["Posts", "Ships", "Media", "Likes"] as const;

const isVideoUrl = (url: string) => {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.includes('video');
};

function ProfileDetail() {
  const navigate = useNavigate();
  const { profile: loaderProfile } = Route.useLoaderData();

  const { id } = Route.useParams();

  /*
   * The client-side safety net.
   *
   * When the loader came back empty — a slow first request, a session that was
   * not ready — this fetches the profile again with proper retries instead of
   * leaving the page broken until somebody reloads the app.
   */
  const { data: fetchedProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile-detail", id],
    enabled: !loaderProfile,
    retry: 3,
    retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 3000),
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const { data, error } = await (isUuid
        ? supabase.from("profiles").select("*").eq("id", id)
        : supabase.from("profiles").select("*").ilike("username", id)
      ).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profile = loaderProfile ?? fetchedProfile ?? null;
  const queryClient = useQueryClient();
  
  const { data: networkStats } = useQuery({
    queryKey: ['networkStats', profile.id],
    queryFn: async () => {
      const [followersRes, followingRes] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
      ]);
      return { followers: followersRes.count || 0, following: followingRes.count || 0 };
    }
  });

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['profilePosts', profile.id],
    queryFn: async () => {
      const { data: postsRes } = await supabase.from('posts').select('*, bootcamps(*), profiles(*), quoted_posts:quoted_post_id(*, bootcamps(*), profiles(*))').eq('author_id', profile.id).order('created_at', { ascending: false });
      const posts = postsRes || [];
      let mappedPosts = posts.map(p => ({ ...p, profiles: profile }));
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const enriched = await enrichPosts(posts, session.user.id);
        return enriched.map(p => ({
          ...p,
          profiles: profile
        }));
      }
      return mappedPosts;
    },
    initialData: () => {
      const feedPosts = queryClient.getQueryData<any[]>(['feed_posts']);
      const userFeedPosts = feedPosts?.filter(p => p.author_id === profile.id);
      if (userFeedPosts && userFeedPosts.length > 0) {
        return userFeedPosts.map(p => ({
          ...p,
          profiles: profile
        }));
      }
      return undefined;
    },
    staleTime: 0
  });

  const { data: likedPostsData, isLoading: likedPostsLoading } = useQuery({
    queryKey: ['profileLikedPosts', profile.id],
    queryFn: async () => {
      const { data: likesRes } = await supabase
        .from('likes')
        .select('post_id, posts(*, profiles(*))')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false });

      if (!likesRes) return [];

      const { data: { session } } = await supabase.auth.getSession();
      let bookmarkedIds = new Set<string>();
      let likedIds = new Set<string>();
      let repostedIds = new Set<string>();

      if (session) {
        const [bookmarksRes, currentLikesRes, repostsRes] = await Promise.all([
          supabase.from('bookmarks').select('post_id').eq('profile_id', session.user.id),
          supabase.from('likes').select('post_id').eq('profile_id', session.user.id),
          supabase.from('reposts').select('post_id').eq('profile_id', session.user.id)
        ]);
        bookmarkedIds = new Set(bookmarksRes.data?.map(b => b.post_id) || []);
        likedIds = new Set(currentLikesRes.data?.map(l => l.post_id) || []);
        repostedIds = new Set(repostsRes.data?.map(r => r.post_id) || []);
      }

      return likesRes
        .map(l => l.posts)
        .filter(Boolean)
        .map((p: any) => ({
          ...p,
          isBookmarked: bookmarkedIds.has(p.id),
          isLiked: likedIds.has(p.id),
          hasReposted: repostedIds.has(p.id)
        }));
    }
  });

  const { data: profileClubsData, isLoading: clubsLoading } = useQuery({
    queryKey: ['profile_clubs', profile.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('club_members')
        .select('clubs(*)')
        .eq('profile_id', profile.id);
        
      if (!data) return [];
      
      const clubs = data.map(d => d.clubs).filter(Boolean);
      const clubIds = clubs.map((c: any) => c.id);
      
      if (clubIds.length > 0) {
        const { data: memberRows } = await supabase
          .from('club_members')
          .select('club_id')
          .in('club_id', clubIds);
          
        const membersCountMap: Record<string, number> = {};
        if (memberRows) {
          memberRows.forEach(row => {
            membersCountMap[row.club_id] = (membersCountMap[row.club_id] || 0) + 1;
          });
        }
        
        clubs.forEach((c: any) => {
          c.members_count = membersCountMap[c.id] || 0;
        });
      }
      
      return clubs;
    }
  });

  const posts = postsData || [];
  const profileClubs = profileClubsData || [];
  const followersCount = networkStats?.followers || 0;
  const followingCount = networkStats?.following || 0;

  const [tab, setTab] = useState<typeof tabs[number]>("Posts");
  const [followLoading, setFollowLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [commentPost, setCommentPost] = useState<any>(null);
  const [isNotified, setIsNotified] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target;
      const scrollTop = target === document ? window.scrollY : ((target as HTMLElement)?.scrollTop || window.scrollY || 0);
      setScrolled(scrollTop > 40);
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, []);

  // Shared follow state — the same source the feed and post pages read from,
  // so following here updates the button everywhere in the app.
  const { isFollowing, toggleFollow } = useFollow(profile?.id);

  /* Whether this person's posts should interrupt me. Read through a function
     rather than by selecting the row, because the subscription table is
     readable only by its owner — deliberately, so subscribing to someone does
     not hand them a list of who is watching. */
  const [postAlertsOn, setPostAlertsOn] = useState(false);
  const [alertsPending, setAlertsPending] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      // Not migrated yet? The bell simply reads as off rather than throwing.
      const { data } = await supabase.rpc("is_subscribed_to_posts", { p_author_id: profile.id });
      if (!cancelled) setPostAlertsOn(Boolean(data));
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const togglePostAlerts = async () => {
    if (!profile?.id) return;
    setAlertsPending(true);
    // Flipped straight away, then corrected if the server disagrees. A bell
    // that waits on the network before changing feels broken.
    const optimistic = !postAlertsOn;
    setPostAlertsOn(optimistic);
    try {
      const { data, error } = await supabase.rpc("toggle_post_notifications", { p_author_id: profile.id });
      if (error) throw error;
      const subscribed = Boolean((data as any)?.subscribed);
      setPostAlertsOn(subscribed);
      toast.success(subscribed ? `You will be told when ${displayName} posts` : "Post notifications off");
    } catch (error: any) {
      setPostAlertsOn(!optimistic);
      toast.error(error?.message || "Could not change that");
    } finally {
      setAlertsPending(false);
    }
  };

  useEffect(() => {
    // Check local storage for notification preference
    const notified = localStorage.getItem(`notify_${profile.id}`) === 'true';
    setIsNotified(notified);
    checkFollowStatus();
  }, [profile.id]);

  async function checkFollowStatus() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      setCurrentUser(profileData || session.user);
      if (session.user.id === profile.id) return; // Own profile

      const { data: followedByRes } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', profile.id)
        .eq('following_id', session.user.id)
        .maybeSingle();
      
      setIsFollowingMe(!!followedByRes);
    }
  }

  async function handleFollow() {
    if (!currentUser) {
      toast.error("Please sign in to follow");
      return;
    }
    setFollowLoading(true);
    try {
      const nowFollowing = await toggleFollow();
      if (nowFollowing === null) return;

      if (!nowFollowing) {
        toast.success(`Unfollowed ${getFirstName(profile)}`);
      } else {
        // Referral incentives are spendable ZP, not reputation XP.
        if (currentUser.referral_code_used && currentUser.referral_code_used === profile.referral_code) {
          const { error: referralErr } = await supabase.rpc('claim_referral_reward', {
            referrer: profile.id,
          });
          if (referralErr) throw referralErr;
          toast.success("Referral complete! Both earned 200 ZP");
          
          // Add a notification for the referrer
          await supabase.from('notifications').insert([{
            recipient_id: profile.id,
            actor_id: currentUser.id,
            type: 'referral_reward',
            content: 'completed your referral link and you both earned 200 ZP!'
          }]);
        } else {
          toast.success(`Following ${getFirstName(profile)}!`);
        }
      }

      // Refresh everything
      queryClient.invalidateQueries({ queryKey: ['networkStats', profile.id] });
      queryClient.invalidateQueries({ queryKey: ['followStatus', profile.id] });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFollowLoading(false);
    }
  }

  function handleNotificationToggle() {
    if (!currentUser) {
      toast.error("Please sign in to enable notifications");
      return;
    }
    const newState = !isNotified;
    setIsNotified(newState);
    localStorage.setItem(`notify_${profile.id}`, newState.toString());
    
    if (newState) {
      toast.success(`You'll now get notified when ${getFirstName(profile)} builds!`);
    } else {
      toast.info(`Notifications turned off for ${getFirstName(profile)}`);
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`;
    const text = `Check out ${profile.full_name || profile.username}'s builder profile on Zero Club! 🚀`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile.full_name || profile.username} on Zero Club`,
          text: text,
          url: url,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      toast.success("Profile link copied!");
    }
  };

  const normalPosts = posts.filter((p: any) => !p.is_build_post);
  const shipPosts = posts.filter((p: any) => p.is_build_post);

  const filteredPosts = normalPosts.filter((p: any) => 
    (p.content || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredShips = shipPosts.filter((p: any) => 
    (p.content || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isOwnProfile = currentUser?.id === profile.id;
  const canMessageProfile = Boolean(currentUser?.id && profile?.id && !isOwnProfile);
  const initials = (profile?.full_name || profile?.username || 'U').substring(0, 1).toUpperCase();
  const tier = (profile?.tier || "Basic").charAt(0).toUpperCase() + (profile?.tier || "Basic").slice(1);
  const displayName = profile?.full_name || profile?.account_name || profile?.username || "Builder";
  const profileHandle = profile?.username ? `@${profile.username}` : "@builder";

  return (
    <div className="min-h-screen bg-background">
      {/* ═══════════════════════════════════════════
          FROSTED HEADER — Back + @handle + Actions
         ═══════════════════════════════════════════ */}
      <header className={`fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-md md:sticky md:left-0 md:translate-x-0 md:max-w-none h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] overflow-hidden transition-colors duration-300 ${
        scrolled || searchOpen
          ? profile?.banner_url ? "border-b border-white/20 bg-black/45" : "border-b border-border bg-background"
          : "border-b border-transparent bg-transparent"
      }`}>
        {profile?.banner_url && (
          <div className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${scrolled || searchOpen ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">
            <img src={profile.banner_url} alt="" className="h-full w-full scale-110 object-cover blur-md" />
            <div className="absolute inset-0 bg-black/45" />
          </div>
        )}
        <div className="relative z-20 flex items-center justify-between px-4 h-full">
          {!searchOpen ? (
            <>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => navigate({ to: '/app' })}
                  className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors active:scale-95 ${
                    profile?.banner_url
                      ? "border-white/20 bg-black/35 text-white hover:bg-black/50"
                      : scrolled ? "border-border bg-card text-foreground hover:bg-accent" : "border-white/10 bg-black/30 text-white"
                  }`}
                >
                  <ChevronLeft className="h-[18px] w-[18px]" />
                </button>
                
                {/* Sticky header @handle — only visible when scrolled */}
                <div className={`transition-all duration-300 transform ${
                  scrolled ?"opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
                }`}>
                  <h1 className={`font-display max-w-[12rem] truncate text-sm font-semibold leading-tight ${profile?.banner_url ? 'text-white' : 'text-foreground'}`}>
                    {displayName}
                  </h1>
                  <p className={`text-[10px] ${profile?.banner_url ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {posts.length} {posts.length === 1 ? "Post" : "Posts"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* More Options Drawer */}
                <Drawer>
                  <DrawerTrigger asChild>
                    <button className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors active:scale-95 ${
                      profile?.banner_url
                        ? "border-white/20 bg-black/35 text-white hover:bg-black/50"
                        : scrolled ? "border-border bg-card text-foreground hover:bg-accent" : "border-white/10 bg-black/30 text-white"
                    }`}>
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="border-none bg-background px-4 pb-4 pt-1 sm:p-6">
                    <DrawerHeader className="mb-3 p-0 text-left sm:mb-6 sm:p-4">
                      <DrawerTitle className="text-[17px] font-semibold sm:text-xl">Profile actions</DrawerTitle>
                    </DrawerHeader>
                    <div className="space-y-2">
                      <button 
                        onClick={handleShare}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm font-semibold tap hover:bg-accent"
                      >
                        <Share2 className="h-5 w-5 text-primary" /> Share Profile Link
                      </button>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`);
                          toast.success("Profile link copied!");
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm font-semibold tap hover:bg-accent"
                      >
                        <Copy className="h-5 w-5 text-primary" /> Copy URL
                      </button>
                      {!isOwnProfile && (
                        <button 
                          onClick={() => toast.success("Report submitted. Thank you!")}
                          className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm font-semibold text-destructive tap hover:bg-destructive/5"
                        >
                          <Flag className="h-5 w-5" /> Report Profile
                        </button>
                      )}
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            </>
          ) : null}
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          HENSOR STYLE HERO CARD
         ═══════════════════════════════════════════════ */}
      <div className="mx-auto max-w-[900px] px-0 md:!-mt-14 md:px-6" style={{ marginTop: 'calc(-1 * env(safe-area-inset-top))' }}>
        <div className="relative overflow-hidden bg-background md:rounded-lg md:border md:border-border">
          {/* Banner */}
          <div className="relative flex h-[calc(220px+env(safe-area-inset-top))] w-full items-center justify-center overflow-hidden bg-muted sm:h-[260px]">
            {profile?.banner_url ? (
              <img 
                src={profile.banner_url} 
                alt="Banner" 
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#211d21]">
                <img src="/logo.png" alt="" className="h-20 w-20 object-contain opacity-35" />
              </div>
            )}
          </div>
          
          {/* Profile Info Section */}
          <div className="relative px-6 pb-6">
            {/* Avatar overlapping banner */}
            <div className="absolute -top-[44px] left-6 z-20 sm:-top-[48px]">
              <div 
                className="flex h-[88px] w-[88px] cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-muted ring-4 ring-background shadow-[0_14px_30px_-18px_rgba(0,0,0,0.5)] transition-opacity hover:opacity-90 sm:h-[96px] sm:w-[96px]"
                onClick={() => setIsAvatarOpen(true)}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} className="h-full w-full object-cover" alt="Avatar" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary/10 text-2xl font-semibold text-primary sm:text-3xl">
                    {initials}
                  </div>
                )}
              </div>
            </div>

            {/* Right side actions */}
            <div className="flex h-[44px] items-center justify-end gap-4 sm:h-[48px]">
               {isOwnProfile ? (
                 <Link to="/app/profile/edit" className="flex h-10 items-center rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition hover:opacity-90">
                   Edit profile
                 </Link>
               ) : canMessageProfile ? (
                 <>
                 {/* Following says "put this in my feed"; the bell says
                     "interrupt me". Two different appetites, so two controls —
                     you can follow quietly, or be told without following. */}
                 <button
                   onClick={togglePostAlerts}
                   disabled={alertsPending}
                   aria-pressed={postAlertsOn}
                   title={postAlertsOn ? "Stop notifying me about their posts" : "Notify me when they post"}
                   aria-label={postAlertsOn ? "Stop notifying me about their posts" : "Notify me when they post"}
                   className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg transition active:scale-95 disabled:opacity-50 ${
                     postAlertsOn
                       ? "bg-[#cc208f] text-white"
                       : "border border-border bg-card text-foreground hover:bg-accent"
                   }`}
                 >
                   {alertsPending
                     ? <Loader2 className="h-4 w-4 animate-spin" />
                     : postAlertsOn ? <BellRing className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />}
                 </button>
                 <button
                   onClick={handleFollow}
                   disabled={followLoading}
                   className={`flex items-center gap-2 rounded-lg px-5 py-2 text-[14px] font-semibold transition-colors active:scale-95 ${
                     isFollowing 
                       ? "border border-border bg-transparent text-foreground hover:bg-accent" 
                       : "bg-foreground text-background hover:opacity-90"
                   }`}
                 >
                   {followLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                   {isFollowing ? "Following" : (isFollowingMe ? "Follow back" : "Follow")}
                 </button>
                 </>
               ) : null}
            </div>

            <div className="mt-4 flex flex-col items-start gap-1">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[22px] font-semibold tracking-tight text-foreground leading-none">
                    {displayName}
                  </h2>
                  {profile?.tier === 'Premium' && <BadgeCheck className="h-[18px] w-[18px] fill-primary text-background shrink-0" />}
                  {profile?.tier === 'Premium+' && <BadgeCheck className="h-[18px] w-[18px] fill-[#ffcf00] text-black shrink-0" />}
                </div>
                <span className="text-[15px] text-muted-foreground mt-1">{profileHandle}</span>
              </div>
              
              <div className="mt-3 text-[15px] text-foreground leading-relaxed pr-4">
                 {profile?.bio ? <LinkifiedText text={profile.bio} /> : "Dynamic builder and creator on Zero Club, specializing in shipping great products."}
              </div>
              
              <div className="mt-4 flex items-center gap-4 text-[15px]">
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'unknown' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="font-bold text-foreground">{followingCount}</span>
                  <span className="text-muted-foreground">Following</span>
                </Link>
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'unknown' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="font-bold text-foreground">{followersCount}</span>
                  <span className="text-muted-foreground">Followers</span>
                </Link>
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'unknown' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="font-bold text-foreground">{profileClubs.length}</span>
                  <span className="text-muted-foreground">{profileClubs.length === 1 ? 'Club' : 'Clubs'}</span>
                </Link>
              </div>

              <ProfileExperience xp={profile?.xp} accountType={profile?.account_type} />
              
              {profile?.website && (
                <div className="mt-3 flex items-center gap-1.5 text-[14px]">
                   <Link2 className="h-4 w-4 text-muted-foreground" />
                   <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
                     {profile.website.replace(/^https?:\/\//, '')}
                   </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          CONTENT TABS
         ═══════════════════════════════════════════ */}
      <div className="mx-auto mt-5 max-w-[760px] px-4 md:px-0">
        {canMessageProfile && (
          <Link
            to="/app/chat/$id"
            params={{ id: profile.id }}
            aria-label={`Message ${getFirstName(profile)}`}
            className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background transition hover:opacity-90 active:scale-[0.99]"
          >
            <IconMessages className="h-[18px] w-[18px]" active />
            <span>Message {getFirstName(profile)}</span>
          </Link>
        )}
        <div className="grid grid-cols-4 gap-1 overflow-hidden rounded-lg border border-border bg-card p-1">
          {tabs.map((t) => {
            const active = tab === t;
            return (
              <button 
                key={t} 
                onClick={() => setTab(t)} 
                className={`relative flex h-10 min-w-0 items-center justify-center rounded-md px-2 text-[12px] font-semibold transition-colors ${
                  active 
                    ? "bg-primary/[0.09] text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          TAB CONTENT
         ═══════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-[760px] pb-20 pt-2">
        {tab === "Posts" && (
          <div className="space-y-4">
            {postsLoading ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filteredPosts.length > 0 ? (
              filteredPosts.map((post: any) => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  currentUser={currentUser} 
                  onCommentClick={setCommentPost} 
                />
              ))
            ) : (
              <div className="py-20 text-center">
                <div className="relative mx-auto mb-6 w-fit">
                  
                  <div className="relative h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mx-auto">
                    <Pen className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">No posts yet</h3>
                <p className="text-sm text-muted-foreground mb-8 max-w-[260px] mx-auto leading-relaxed">
                  {getFirstName(profile)} hasn't posted anything yet.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "Ships" && (
          <div className="space-y-4">
            {postsLoading ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filteredShips.length > 0 ? (
              filteredShips.map((post: any) => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  currentUser={currentUser} 
                  onCommentClick={setCommentPost} 
                />
              ))
            ) : (
              <div className="py-20 text-center">
                <div className="relative mx-auto mb-6 w-fit">
                  
                  <div className="relative h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mx-auto">
                    <Zap className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">No ships yet</h3>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  {getFirstName(profile)} hasn't shared any shipped projects yet.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "Media" && (
          <div>
            {posts.filter(p => p.media_urls?.[0]).length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {posts.filter(p => p.media_urls?.[0]).map((post) => {
                  const url = post.media_urls[0];
                  const isVideo = isVideoUrl(url);
                  return (
                    <Link 
                      key={post.id} 
                      to="/app/post/$id" 
                      params={{ id: post.id }}
                      className="relative aspect-square rounded-2xl overflow-hidden bg-muted hover:opacity-90 transition cursor-pointer group"
                    >
                      {isVideo ? (
                        <>
                          <video src={url} className="w-full h-full object-cover" muted playsInline />
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                            <Play className="h-6 w-6 text-white drop-shadow-md fill-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition duration-300" />
                          </div>
                        </>
                      ) : (
                        <img src={url} alt="Post media" className="w-full h-full object-cover" />
                      )}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="py-20 text-center">
                <div className="relative mx-auto mb-6 w-fit">
                  
                  <div className="relative h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mx-auto">
                    <Play className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">No media yet</h3>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  Photos and videos from {getFirstName(profile)}'s posts will appear here.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "Likes" && (
          <div className="space-y-4">
            {likedPostsLoading ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : likedPostsData && likedPostsData.length > 0 ? (
              likedPostsData.map((post: any) => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  currentUser={currentUser} 
                  onCommentClick={setCommentPost} 
                />
              ))
            ) : (
              <div className="py-20 text-center">
                <div className="relative mx-auto mb-6 w-fit">
                  
                  <div className="relative h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mx-auto">
                    <Heart className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">No likes yet</h3>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  {getFirstName(profile)} hasn't liked any posts yet.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {commentPost && (
        <CommentDrawer 
          post={commentPost} 
          isOpen={!!commentPost} 
          onOpenChange={(open) => !open && setCommentPost(null)}
          onCommentAdded={() => {
            queryClient.invalidateQueries({ queryKey: ['profilePosts', profile.id] });
          }}
        />
      )}

      {isAvatarOpen && profile?.avatar_url && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setIsAvatarOpen(false)}
        >
          <button 
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-all"
            onClick={(e) => { e.stopPropagation(); setIsAvatarOpen(false); }}
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={profile.avatar_url} 
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl" 
            alt="Full Avatar" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
