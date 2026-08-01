import { useLoaderData, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { 
  BadgeCheck, Flame, MapPin, LinkIcon, CalendarDays, ChevronLeft, 
  Search, MoreHorizontal, Hash, Users, MessageCircle, Heart,
  Share2, Settings, UserPlus, Copy, X, Loader2, Star, Play, CheckCircle2, Link2,
  Edit3, Zap, Award, TrendingUp, Pen, Mail, Sparkles
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, enrichPosts } from "@/api";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { PostCard } from "@/components/PostCard";
import { LinkifiedText } from "@/components/LinkifiedText";
import { CommentDrawer } from "@/components/CommentDrawer";
import { useUser } from "@/hooks/useUser";
import { getFirstName } from "@/lib/utils";
import { ProfileExperience } from "@/components/ProfileExperience";

export const Route = createFileRoute("/app/profile/")({
  component: Profile,
});

const tabs = ["Posts", "Ships", "Media", "Likes"] as const;

const isVideoUrl = (url: string) => {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.includes('video');
};

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<typeof tabs[number]>("Posts");
  const [searchQuery, setSearchQuery] = useState("");
  const [commentPost, setCommentPost] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
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

  const { data: profileData, isLoading: profileLoading } = useUser();

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['my_posts'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      
      const { data: postsRes } = await supabase
        .from('posts')
        .select('*, bootcamps(*), profiles(*), quoted_posts:quoted_post_id(*, bootcamps(*), profiles(*))')
        .eq('author_id', session.user.id)
        .order('created_at', { ascending: false });
      
      let posts = postsRes || [];
      const enriched = await enrichPosts(posts, session.user.id);
      
      return enriched;
    }
  });

  const { data: likedPostsData, isLoading: likedPostsLoading } = useQuery({
    queryKey: ['my_liked_posts'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const { data: likesRes } = await supabase
        .from('likes')
        .select('post_id, posts(*, profiles(*))')
        .eq('profile_id', session.user.id)
        .order('created_at', { ascending: false });

      if (!likesRes) return [];

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

  const { data: myClubsData, isLoading: clubsLoading } = useQuery({
    queryKey: ['my_clubs', currentUser?.id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data } = await supabase
        .from('club_members')
        .select('clubs(*)')
        .eq('profile_id', session.user.id);
        
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

  const profile = profileData;
  const userPosts = postsData || [];
  const myClubs = myClubsData || [];

  useEffect(() => {
    if (!profile?.id) return;
    navigate({
      to: '/app/profile/$id',
      params: { id: profile.id },
      replace: true,
    });
  }, [navigate, profile?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setCurrentUser(session.user);
    });
  }, []);

  const tier = (profile?.tier || "Basic").charAt(0).toUpperCase() + (profile?.tier || "Basic").slice(1);
  const initials = (profile?.full_name || profile?.username || 'U').substring(0, 1).toUpperCase();
  const displayName = profile?.full_name || profile?.account_name || profile?.username || "Builder";
  const profileHandle = profile?.username ? `@${profile.username}` : "@builder";

  const handleShare = async () => {
    const url = `${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`;
    const text = `Join me on Zero Club and get rewarded with 200 ZP when you complete the referral.`;
    
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
      toast.success("Profile referral link copied!");
    }
  };

  const normalPosts = userPosts.filter((p: any) => !p.is_build_post);
  const shipPosts = userPosts.filter((p: any) => p.is_build_post);

  const filteredPosts = normalPosts.filter((p: any) => 
    (p.content || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredShips = shipPosts.filter((p: any) => 
    (p.content || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (profileLoading && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
        </div>
      </div>
    );
  }

  if (profile?.id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f7f5] dark:bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      {/* ═══════════════════════════════════════════
          FROSTED HEADER — Settings + @handle + Edit
         ═══════════════════════════════════════════ */}
      <header className="fixed left-1/2 top-0 z-50 h-[calc(3.5rem+env(safe-area-inset-top))] w-full max-w-md -translate-x-1/2 border-b border-border/60 bg-background pt-[env(safe-area-inset-top)] md:sticky md:left-0 md:max-w-none md:translate-x-0">
        <div className="relative z-20 flex items-center justify-between px-4 h-full">
          <div className="flex items-center gap-3">
            <button 
                  onClick={() => navigate({ to: '/app' })}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border/60 bg-card text-foreground transition hover:bg-accent/60 active:scale-95"
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
                    {userPosts.length} {userPosts.length === 1 ? "Post" : "Posts"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Drawer>
                  <DrawerTrigger asChild>
                    <button className="grid h-9 w-9 place-items-center rounded-lg border border-border/60 bg-card text-foreground transition hover:bg-accent/60 active:scale-95">
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
                  </DrawerTrigger>
                  <DrawerContent className="border-none bg-background px-4 pb-4 pt-1 sm:p-6">
                    <DrawerHeader className="mb-3 p-0 text-left sm:mb-4 sm:p-4">
                      <DrawerTitle className="text-[17px] font-semibold tracking-tight sm:text-[20px]">Profile actions</DrawerTitle>
                    </DrawerHeader>
                    <div className="space-y-2">
                      <button
                        onClick={handleShare}
                        className="flex w-full items-center gap-3 rounded-lg bg-card p-4 text-sm font-semibold tracking-tight ring-1 ring-border tap hover:bg-foreground/[0.03]"
                      >
                        <Share2 className="h-[18px] w-[18px] text-primary" /> Share profile link
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`);
                          toast.success("Profile link copied!");
                        }}
                        className="flex w-full items-center gap-3 rounded-lg bg-card p-4 text-sm font-semibold tracking-tight ring-1 ring-border tap hover:bg-foreground/[0.03]"
                      >
                        <Copy className="h-[18px] w-[18px] text-primary" /> Copy URL
                      </button>
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          HENSOR STYLE HERO CARD
         ═══════════════════════════════════════════════ */}
      <div className="mx-auto max-w-[900px] px-0 pt-[calc(3.5rem+env(safe-area-inset-top))] md:px-6 md:pt-6">
        <div className="relative overflow-hidden bg-background sm:rounded-lg sm:border sm:border-border/60">
          {/* Banner */}
          <div className="relative flex h-[180px] w-full items-center justify-center overflow-hidden bg-[#211d21] sm:h-[240px]">
            {profile?.banner_url ? (
              <img
                src={profile.banner_url}
                alt="Banner"
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <img src="/logo.png" alt="" className="h-20 w-20 object-contain opacity-35" />
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
                 <Link
                   to="/app/profile/edit"
                   className="flex h-10 items-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold tracking-tight text-background tap hover:opacity-90"
                 >
                   Edit profile
                 </Link>
            </div>

            <div className="mt-4 flex flex-col items-start gap-1">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[22px] font-semibold tracking-tight text-foreground leading-none">
                    {displayName}
                  </h2>
                  {profile?.tier === 'Premium' && (
                    <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-primary shrink-0">
                      <BadgeCheck className="h-3 w-3 text-primary-foreground" strokeWidth={2.5} />
                    </span>
                  )}
                  {profile?.tier === 'Premium+' && (
                    <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#ffcf00] shrink-0">
                      <BadgeCheck className="h-3 w-3 text-black" strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <span className="text-[14px] text-muted-foreground mt-1.5 font-medium">{profileHandle}</span>
              </div>

              <div className="mt-3 text-[15px] text-foreground/90 leading-[1.55] pr-4">
                 {profile?.bio ? <LinkifiedText text={profile.bio} /> : "Dynamic builder and creator on Zero Club, specializing in shipping great products."}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'me' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity">
                  <span className="font-semibold text-foreground tabular-nums">{profile?.following_count || "0"}</span>
                  <span className="text-muted-foreground">Following</span>
                </Link>
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'me' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity">
                  <span className="font-semibold text-foreground tabular-nums">{profile?.followers_count || "0"}</span>
                  <span className="text-muted-foreground">Followers</span>
                </Link>
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'me' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity">
                  <span className="font-semibold text-foreground tabular-nums">{myClubs.length}</span>
                  <span className="text-muted-foreground">{myClubs.length === 1 ? 'Club' : 'Clubs'}</span>
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
        <div className="grid grid-cols-4 gap-1 overflow-hidden rounded-lg border border-border/60 bg-card p-1">
          {tabs.map((t) => {
            const active = tab === t;
            return (
              <button 
                key={t} 
                onClick={() => setTab(t)} 
                className={`relative flex h-10 min-w-0 items-center justify-center rounded-md px-2 text-[12px] font-semibold tracking-tight transition-all ${
                  active 
                    ? "bg-primary/[0.09] text-primary"
                    : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
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
      <div className="mx-auto max-w-[760px] px-4 pb-24 pt-4 md:px-0">
        {tab === "Posts" && (
          <div className="space-y-4">
            {filteredPosts.length > 0 ? (
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
                <div className="mx-auto mb-5 h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center">
                  <Pen className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">No posts yet</h3>
                <p className="text-[13.5px] text-muted-foreground mb-7 max-w-[260px] mx-auto leading-relaxed">Share what you're building with the Zero Club community.</p>
                <Link to="/app/compose" className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-2.5 rounded-full text-[13px] font-semibold tracking-tight tap hover:opacity-90">
                  <Edit3 className="h-4 w-4" />
                  Create post
                </Link>
              </div>
            )}
          </div>
        )}

        {tab === "Ships" && (
          <div className="space-y-4">
            {filteredShips.length > 0 ? (
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
                <div className="mx-auto mb-5 h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center">
                  <Zap className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">No ships yet</h3>
                <p className="text-[13.5px] text-muted-foreground max-w-[260px] mx-auto leading-relaxed">Ship your first project and show the world what you're creating.</p>
              </div>
            )}
          </div>
        )}

        {tab === "Media" && (
          <div>
            {userPosts.filter(p => p.media_urls?.[0]).length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {userPosts.filter(p => p.media_urls?.[0]).map((post) => {
                  const url = post.media_urls[0];
                  const isVideo = isVideoUrl(url);
                  return (
                    <Link 
                      key={post.id} 
                      to="/app/post/$id" 
                      params={{ id: post.id }}
                      className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-muted transition hover:opacity-90"
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
                <div className="mx-auto mb-5 h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center">
                  <Play className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">No media yet</h3>
                <p className="text-[13.5px] text-muted-foreground max-w-[260px] mx-auto leading-relaxed">Photos and videos from your posts will appear here.</p>
              </div>
            )}
          </div>
        )}

        {tab === "Likes" && (
          <div className="py-20 text-center text-muted-foreground">
            Likes will appear here
          </div>
        )}
      </div>

      {commentPost && (
        <CommentDrawer 
          post={commentPost} 
          isOpen={!!commentPost} 
          onOpenChange={(open) => !open && setCommentPost(null)}
          onCommentAdded={() => {
            queryClient.invalidateQueries({ queryKey: ['posts'] });
            queryClient.invalidateQueries({ queryKey: ['post'] });
          }}
        />
      )}

      {/* Full Screen Avatar View */}
      {isAvatarOpen && (
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
            src={profile?.avatar_url} 
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl" 
            alt="Full Avatar" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
