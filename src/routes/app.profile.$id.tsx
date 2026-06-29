import { useLoaderData, createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  BadgeCheck, Flame, MapPin, LinkIcon, CalendarDays, ChevronLeft, 
  Search, MoreHorizontal, Hash, Users, MessageCircle, Heart, 
  UserPlus, UserMinus, Loader2, Share2, Copy, Flag, X, Send,
  Bell, BellRing, Star, Play, CheckCircle2, Settings, Shield, Sparkles, Edit3, Mail, Pen, Zap
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getProfile, enrichPosts } from "@/api";
import { getLevelFromXp } from "@/lib/utils";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app/profile/$id")({
  loader: async ({ params: { id } }) => {
    // SECURITY/ROUTING FIX: If the ID is 'profile', it means the router mismatched the index route.
    // Redirect back to the correct index route.
    if (id === 'profile') {
      throw redirect({ to: '/app/profile/' });
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session && id === session.user.id) {
      throw redirect({ to: '/app/profile/' });
    }

    // Fetch only profile for SEO/Head, leave heavy data for component to load instantly
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const query = supabase
      .from('profiles')
      .select('*');
    
    const { data: profile, error } = await (isUuid 
      ? query.eq('id', id) 
      : query.ilike('username', id)
    ).maybeSingle();

    if (error) throw error;
    if (!profile) throw new Error("Profile not found");

    if (session && profile.id === session.user.id) {
      throw redirect({ to: '/app/profile/' });
    }

    return { profile };
  },
  head: ({ loaderData }) => {
    const profile = loaderData?.profile;
    const title = profile ? `${profile.full_name || profile.username} (${getFirstName(profile)}) on Zero Club` : "Profile | Zero Club";
    const description = profile?.bio || "Zero Club builder on the rise. Check out my builds!";
    const image = profile?.avatar_url || "/logo.png";
    
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ]
    };
  },
  component: ProfileDetail,
});

const tabs = ["Posts", "Ships", "Media", "Likes", "Clubs", "Network"] as const;

const isVideoUrl = (url: string) => {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.includes('video');
};

function ProfileDetail() {
  const { profile } = Route.useLoaderData();
  const { id } = Route.useParams();
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
      const target = e.target as HTMLElement;
      const scrollTop = target === document ? window.scrollY : (target.scrollTop || window.scrollY || 0);
      setScrolled(scrollTop > 40);
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, []);

  const { data: followStatus, refetch: refetchFollowStatus } = useQuery({
    queryKey: ['followStatus', profile.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const { data } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', currentUser.id)
        .eq('following_id', profile.id)
        .maybeSingle();
      return !!data;
    }
  });

  const isFollowing = !!followStatus;

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
      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', profile.id);
        
        if (error) throw error;
        toast.success(`Unfollowed ${getFirstName(profile)}`);
      } else {
        const { error } = await supabase
          .from('follows')
          .insert([{ follower_id: currentUser.id, following_id: profile.id }]);
        
        if (error) throw error;
        
        // Handle referral XP reward
        if (currentUser.referral_code_used && currentUser.referral_code_used === profile.referral_code) {
          await Promise.all([
            supabase.from('profiles').update({ xp: (currentUser.xp || 0) + 200, referral_code_used: null }).eq('id', currentUser.id),
            supabase.from('profiles').update({ xp: (profile.xp || 0) + 200 }).eq('id', profile.id)
          ]);
          toast.success("Referral complete! Both earned 200 XP");
          
          // Add a notification for the referrer
          await supabase.from('notifications').insert([{
            profile_id: profile.id,
            actor_id: currentUser.id,
            type: 'referral_reward',
            content: 'completed your referral link and you both earned 200 XP!'
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
  const initials = (profile?.full_name || profile?.username || 'U').substring(0, 1).toUpperCase();
  const level = getLevelFromXp(profile?.xp || 0);
  const tier = (profile?.tier || "Basic").charAt(0).toUpperCase() + (profile?.tier || "Basic").slice(1);
  const displayName = profile?.full_name || profile?.account_name || profile?.username || "Builder";
  const profileHandle = profile?.username ? `@${profile.username}` : "@builder";

  return (
    <div className="min-h-screen bg-background">
      {/* ═══════════════════════════════════════════
          FROSTED HEADER — Back + @handle + Actions
         ═══════════════════════════════════════════ */}
      <header className={`fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-md h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        scrolled || searchOpen
          ?"bg-background/80 backdrop-blur-2xl border-b border-border/10 shadow-[0_1px_20px_rgba(0,0,0,0.08)]" 
          : "bg-transparent border-b border-transparent"
      }`}>
        <div className="relative z-20 flex items-center justify-between px-4 h-full">
          {!searchOpen ? (
            <>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => window.history.back()}
                  className={`grid h-9 w-9 place-items-center rounded-full transition-all active:scale-95 ${
                    scrolled 
                      ?"bg-accent/50 text-foreground hover:bg-accent" 
                      : "bg-black/30 text-white backdrop-blur-md border border-white/10"
                  }`}
                >
                  <ChevronLeft className="h-[18px] w-[18px]" />
                </button>
                
                {/* Sticky header @handle — only visible when scrolled */}
                <div className={`transition-all duration-300 transform ${
                  scrolled ?"opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
                }`}>
                  <h1 className="font-display max-w-[12rem] truncate text-sm font-bold leading-tight text-foreground">
                    {displayName}
                  </h1>
                  <p className="text-[10px] text-muted-foreground">
                    {posts.length} {posts.length === 1 ? "Post" : "Posts"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* More Options Drawer */}
                <Drawer>
                  <DrawerTrigger asChild>
                    <button className={`grid h-9 w-9 place-items-center rounded-full transition-all active:scale-95 ${
                      scrolled 
                        ?"bg-accent/50 text-foreground hover:bg-accent" 
                        : "bg-black/30 text-white backdrop-blur-md border border-white/10"
                    }`}>
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="border-none bg-background p-6">
                    <DrawerHeader className="text-left mb-6">
                      <DrawerTitle className="text-xl font-bold">Profile Actions</DrawerTitle>
                    </DrawerHeader>
                    <div className="space-y-2">
                      <button 
                        onClick={handleShare}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-4 text-sm font-semibold transition active:bg-white/10"
                      >
                        <Share2 className="h-5 w-5 text-primary" /> Share Profile Link
                      </button>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`);
                          toast.success("Profile link copied!");
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-4 text-sm font-semibold transition active:bg-white/10"
                      >
                        <Copy className="h-5 w-5 text-primary" /> Copy URL
                      </button>
                      {!isOwnProfile && (
                        <button 
                          onClick={() => toast.success("Report submitted. Thank you!")}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white/5 p-4 text-sm font-semibold transition active:bg-white/10 text-red-400"
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
          IMMERSIVE HERO — Full-bleed avatar/banner
          with glassmorphic profile card overlay
         ═══════════════════════════════════════════════ */}
      <div className="relative w-full">
        {/* Hero image area */}
        <div className="relative h-[310px] w-full overflow-hidden sm:h-[360px]">
          {profile?.banner_url ? (
            <img 
              src={profile.banner_url} 
              alt="Banner" 
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.28),transparent_26%),linear-gradient(135deg,#171717_0%,#cc208f_48%,#f5b94b_100%)]" />
          )}

          {/* Gradient overlay — fades image into the background */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-black/45" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />
          <div className="absolute bottom-6 left-5 right-5 hidden items-end justify-between text-white/90 sm:flex">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/60">Builder profile</p>
              <p className="mt-1 max-w-[24rem] text-sm font-medium text-white/80">Portfolio, network, ships, and signal in one place.</p>
            </div>
            <div className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs font-bold backdrop-blur-xl">
              Level {level}
            </div>
          </div>
        </div>

        {/* ── Glassmorphic Profile Info Card ── */}
        <div className="relative z-10 -mt-24 px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-card/88 p-5 pt-16 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:p-6 sm:pt-16">
            {/* Subtle glass highlight */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/12 blur-3xl" />
            
            {/* Profile Avatar overlapping */}
            <div className="absolute -top-12 left-6 z-20">
              <div 
                className="h-24 w-24 cursor-pointer overflow-hidden rounded-3xl border-4 border-background bg-muted shadow-2xl transition-opacity hover:opacity-90"
                onClick={() => setIsAvatarOpen(true)}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} className="h-full w-full object-cover" alt="Avatar" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-primary/20 text-3xl font-black text-primary">
                    {initials}
                  </div>
                )}
              </div>
            </div>

            <div className="relative z-10">
              {/* Name + Badges + Action buttons row */}
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="font-display max-w-full break-words text-[clamp(2rem,8vw,3.35rem)] font-black leading-[0.95] tracking-tight text-foreground">
                      {displayName}
                    </h2>
                    {profile?.tier === 'Premium' && <BadgeCheck className="h-6 w-6 fill-[#cc208f] text-white shrink-0" />}
                    {profile?.tier === 'Premium+' && <BadgeCheck className="h-6 w-6 fill-[#ffcf00] text-black shrink-0" />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/40 bg-background/60 px-3 py-1 text-[13px] font-bold text-muted-foreground">{profileHandle}</span>
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[13px] font-bold text-primary">{tier}</span>
                    <span className="rounded-full border border-border/40 bg-background/60 px-3 py-1 text-[13px] font-bold text-muted-foreground">Level {level}</span>
                    {isFollowingMe && (
                      <span className="rounded-full border border-border/30 bg-accent/50 px-3 py-1 text-[12px] font-bold text-muted-foreground">
                        Follows you
                      </span>
                    )}
                  </div>
                </div>

                {/* Star + Envelope action circles (like reference) */}
                {!isOwnProfile && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button 
                      onClick={handleNotificationToggle}
                      className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 ${
                        isNotified 
                          ? "bg-gradient-primary shadow-lg shadow-primary/20" 
                          : "bg-foreground/10 hover:bg-foreground/20 backdrop-blur-md"
                      }`}
                      aria-label="Toggle notifications"
                    >
                      {isNotified 
                        ? <BellRing className="h-[18px] w-[18px] text-white" /> 
                        : <Bell className="h-[18px] w-[18px] text-foreground" />
                      }
                    </button>
                    <Link 
                      to="/app/chat/$id" 
                      params={{ id: profile.id }}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/90 shadow-lg transition-all active:scale-95"
                      aria-label="Message builder"
                    >
                      <MessageCircle className="h-[18px] w-[18px] text-background" />
                    </Link>
                  </div>
                )}
              </div>

              {/* Bio */}
              {profile?.bio && (
                <p className="mt-5 text-[15px] leading-7 text-foreground/75">
                  <LinkifiedText text={profile.bio} />
                </p>
              )}

              {/* Stats row with dividers — Followers | Following | Posts */}
              <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border/15 pt-4">
                <div className="rounded-2xl border border-border/25 bg-background/55 px-3 py-3 text-center">
                  <span className="block font-display text-[22px] font-black leading-none text-foreground">
                    {followersCount || "0"}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground">
                    Followers
                  </span>
                </div>
                <div className="rounded-2xl border border-border/25 bg-background/55 px-3 py-3 text-center">
                  <span className="block font-display text-[22px] font-black leading-none text-foreground">
                    {followingCount || "0"}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground">
                    Following
                  </span>
                </div>
                <div className="rounded-2xl border border-border/25 bg-background/55 px-3 py-3 text-center">
                  <span className="block font-display text-[22px] font-black leading-none text-foreground">
                    {posts.length}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-semibold tracking-wide text-muted-foreground">
                    Posts
                  </span>
                </div>
              </div>

              {/* Follow Button Array */}
              {!isOwnProfile && (
                <div className="mt-5">
                  <button 
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`w-full relative overflow-hidden rounded-xl py-3.5 text-[14px] font-bold tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                      isFollowing 
                        ?"bg-accent/40 border border-border/20 text-foreground hover:bg-accent/60" 
                        : "bg-gradient-primary text-white shadow-xl shadow-primary/20"
                    }`}
                  >
                    {followLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isFollowing ? "Following" : (isFollowingMe ? "Follow back" : "Follow")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          CONTENT TABS
         ═══════════════════════════════════════════ */}
      <div className="mt-8 px-5">
        <div className="flex gap-6 overflow-x-auto no-scrollbar border-b border-border/20">
          {tabs.map((t) => {
            const active = tab === t;
            return (
              <button 
                key={t} 
                onClick={() => setTab(t)} 
                className={`shrink-0 pb-3 text-[14px] font-bold tracking-wide transition-all relative ${
                  active 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          TAB CONTENT
         ═══════════════════════════════════════════ */}
      <div className="px-5 pt-2 pb-28">
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
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Pen className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">No posts yet</h3>
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
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Zap className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">No ships yet</h3>
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
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Play className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">No media yet</h3>
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
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Heart className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">No likes yet</h3>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  {getFirstName(profile)} hasn't liked any posts yet.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "Clubs" && (
          <div className="space-y-3">
            {profile?.hide_clubs_unless_following && !isFollowing && currentUser?.id !== profile.id ? (
              <div className="py-20 text-center">
                <div className="relative mx-auto mb-6 w-fit">
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Shield className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">Clubs are hidden</h3>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  Follow {getFirstName(profile)} to view the clubs they are a member of.
                </p>
              </div>
            ) : profileClubs.length > 0 ? profileClubs.map((c: any) => (
              <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id }} className="block transition active:scale-[0.98]">
                <article className="flex items-center gap-3.5 p-4 rounded-2xl bg-accent/20 border border-border/20 hover:bg-accent/40 transition-all">
                  <div className="shrink-0">
                    <div className="h-12 w-12 rounded-xl bg-accent/30 border border-border/30 flex items-center justify-center overflow-hidden">
                      {c.logo_url || c.banner_url ? (
                        <img src={c.logo_url || c.banner_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Hash className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h4 className="truncate text-[14px] font-bold text-foreground tracking-tight">{c.name}</h4>
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary fill-primary/20 shrink-0" />
                    </div>
                    <p className="truncate text-[12px] text-muted-foreground">{c.description || "Welcome to the club!"}</p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-accent/40 rounded-full px-2.5 py-1 border border-border/20">
                    <Users className="h-3 w-3" />
                    {c.members_count || 1}
                  </div>
                </article>
              </Link>
            )) : (
              <div className="py-20 text-center">
                <div className="relative mx-auto mb-6 w-fit">
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Users className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">No clubs yet</h3>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  {getFirstName(profile)} hasn't joined any clubs yet.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "Network" && <NetworkTab profileId={profile.id} />}
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

function NetworkTab({ profileId }: { profileId: string }) {
  const [activeTab, setActiveTab] = useState<"following" | "followers">("following");

  const { data: following, isLoading: followingLoading } = useQuery({
    queryKey: ['following', profileId],
    queryFn: async () => {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', profileId);
      const ids = follows?.map(f => f.following_id) || [];
      if (ids.length === 0) return [];
      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      return data || [];
    }
  });

  const { data: followers, isLoading: followersLoading } = useQuery({
    queryKey: ['followers', profileId],
    queryFn: async () => {
      const { data: follows } = await supabase.from('follows').select('follower_id').eq('following_id', profileId);
      const ids = follows?.map(f => f.follower_id) || [];
      if (ids.length === 0) return [];
      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      return data || [];
    }
  });

  const users = activeTab === "following" ? following : followers;
  const isLoading = activeTab === "following" ? followingLoading : followersLoading;

  return (
    <div className="space-y-4">
      {/* Line toggle */}
      <div className="flex gap-6 border-b border-border/20">
        <button 
          onClick={() => setActiveTab("following")}
          className={`pb-3 text-[14px] font-bold tracking-wide transition-all relative ${
            activeTab === "following" 
              ? "text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Following
          {activeTab === "following" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-t-full" />
          )}
        </button>
        <button 
          onClick={() => setActiveTab("followers")}
          className={`pb-3 text-[14px] font-bold tracking-wide transition-all relative ${
            activeTab === "followers" 
              ? "text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Followers
          {activeTab === "followers" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-t-full" />
          )}
        </button>
      </div>

      <div className="space-y-2.5">
        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : users && users.length > 0 ? (
          users.map((user: any) => (
            <Link key={user.id} to={`/app/profile/${user.username || user.id}`} className="flex items-center gap-3 p-3.5 rounded-2xl bg-accent/20 border border-border/20 hover:bg-accent/40 transition-all active:scale-[0.98]">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-accent border border-border/30 flex items-center justify-center font-bold text-muted-foreground text-xs">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  user.username?.charAt(0).toUpperCase() || "U"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground text-[14px] truncate">{user.full_name || user.username}</span>
                  {user.tier === 'Premium' && <BadgeCheck className="h-3.5 w-3.5 fill-[#cc208f] text-white shrink-0" />}
                  {user.tier === 'Premium+' && <BadgeCheck className="h-3.5 w-3.5 fill-[#ffcf00] text-black shrink-0" />}
                </div>
                <div className="text-[12px] text-muted-foreground">{getFirstName(user)}</div>
                {user.bio && <div className="text-[12px] text-muted-foreground/80 mt-0.5 line-clamp-1"><LinkifiedText text={user.bio} /></div>}
              </div>
            </Link>
          ))
        ) : (
          <div className="py-20 text-center">
            <div className="relative mx-auto mb-6 w-fit">
              <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
              <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                <Users className="h-10 w-10 text-muted-foreground/40" />
              </div>
            </div>
            <h3 className="text-xl font-black tracking-tight mb-2">No {activeTab} yet</h3>
            <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
              {activeTab === "following" ? "Not following anyone yet." : "No followers yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
