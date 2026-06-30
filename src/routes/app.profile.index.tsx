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
import { getLevelFromXp } from "@/lib/utils";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { PostCard } from "@/components/PostCard";
import { LinkifiedText } from "@/components/LinkifiedText";
import { CommentDrawer } from "@/components/CommentDrawer";
import { useUser } from "@/hooks/useUser";
import { getFirstName } from "@/lib/utils";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [commentPost, setCommentPost] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setCurrentUser(session.user);
    });
  }, []);

  const tier = (profile?.tier || "Basic").charAt(0).toUpperCase() + (profile?.tier || "Basic").slice(1);
  const initials = (profile?.full_name || profile?.username || 'U').substring(0, 1).toUpperCase();
  const level = getLevelFromXp(profile?.xp || 0);
  const displayName = profile?.full_name || profile?.account_name || profile?.username || "Builder";
  const profileHandle = profile?.username ? `@${profile.username}` : "@builder";

  const handleShare = async () => {
    const url = `${window.location.origin}/app/profile/${profile.id}?ref=${profile.referral_code}`;
    const text = `Download the Zero Club App (works on iOS & Android) and sign up when you do, follow me immediately and automatically get rewarded with 200XP! 🚀`;
    
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      {/* ═══════════════════════════════════════════
          FROSTED HEADER — Settings + @handle + Edit
         ═══════════════════════════════════════════ */}
      <header className={`fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-md h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        scrolled || searchOpen
          ?"bg-background/80 backdrop-blur-2xl border-b border-border/10 shadow-[0_1px_20px_rgba(0,0,0,0.08)]" 
          : "bg-transparent border-b border-transparent"
      }`}>
        <div className="relative z-20 flex items-center justify-between px-4 h-full">
          <div className="flex items-center gap-3">
            <button 
                  onClick={() => navigate({ to: '/app' })}
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
                    {userPosts.length} {userPosts.length === 1 ? "Post" : "Posts"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          HENSOR STYLE HERO CARD
         ═══════════════════════════════════════════════ */}
      <div className="mx-auto max-w-2xl px-0 sm:px-6 pt-0 sm:pt-4" style={{ marginTop: 'calc(-1 * env(safe-area-inset-top))' }}>
        <div className="relative overflow-hidden sm:rounded-[32px] border-x-0 sm:border border-border/40 bg-background shadow-xl">
          {/* Banner */}
          <div className="relative h-[calc(200px+env(safe-area-inset-top))] sm:h-[240px] w-full overflow-hidden bg-muted flex items-center justify-center">
            {profile?.banner_url ? (
              <img 
                src={profile.banner_url} 
                alt="Banner" 
                className="h-full w-full object-cover object-center"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF1E3F] via-[#FF1E3F]/80 to-black/90" />
            )}
          </div>
          
          {/* Profile Info Section */}
          <div className="relative px-6 pb-6">
            {/* Avatar overlapping banner */}
            <div className="absolute -top-[55px] left-6 z-20">
              <div 
                className="h-[110px] w-[110px] cursor-pointer overflow-hidden rounded-[28px] border-[6px] border-black bg-zinc-900 shadow-xl transition-opacity hover:opacity-90 flex items-center justify-center"
                onClick={() => setIsAvatarOpen(true)}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} className="h-full w-full object-cover" alt="Avatar" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-[#FF1E3F]/20 text-4xl font-black text-[#FF1E3F]">
                    {initials}
                  </div>
                )}
              </div>
            </div>

            {/* Right side actions */}
            <div className="flex justify-end h-[55px] items-center gap-4">
                 <Link 
                   to="/app/profile/edit"
                   className="rounded-full px-5 py-2 text-[14px] font-bold transition-all flex items-center gap-2 active:scale-95 shadow-lg bg-white text-black hover:bg-white/90"
                 >
                   Edit Profile
                 </Link>
            </div>

            <div className="mt-4 flex flex-col items-start gap-1">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[22px] font-bold tracking-tight text-white leading-none">
                    {displayName}
                  </h2>
                  {profile?.tier === 'Premium' && <BadgeCheck className="h-[18px] w-[18px] fill-primary text-white shrink-0" />}
                  {profile?.tier === 'Premium+' && <BadgeCheck className="h-[18px] w-[18px] fill-[#ffcf00] text-black shrink-0" />}
                </div>
                <span className="text-[15px] text-zinc-500 mt-1">{profileHandle}</span>
              </div>
              
              <div className="mt-3 text-[15px] text-zinc-300 leading-relaxed pr-4">
                 {profile?.bio ? <LinkifiedText text={profile.bio} /> : "Dynamic builder and creator on Zero Club, specializing in shipping great products."}
              </div>
              
              <div className="mt-4 flex items-center gap-4 text-[15px]">
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'me' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="font-bold text-foreground">{profile?.following_count || "0"}</span>
                  <span className="text-muted-foreground">Following</span>
                </Link>
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'me' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="font-bold text-foreground">{profile?.followers_count || "0"}</span>
                  <span className="text-muted-foreground">Followers</span>
                </Link>
                <Link to="/app/profile/$id/network" params={{ id: profile?.username || profile?.id || 'me' }} className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="font-bold text-foreground">{myClubs.length}</span>
                  <span className="text-muted-foreground">{myClubs.length === 1 ? 'Club' : 'Clubs'}</span>
                </Link>
              </div>
              
              <div className="mt-3 flex items-center gap-1.5 text-[14px]">
                 <Link2 className="h-4 w-4 text-zinc-500" />
                 <a href="#" className="text-blue-500 hover:underline">
                   {profileHandle.replace('@', '')}.net
                 </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* ═══════════════════════════════════════════
          CONTENT TABS
         ═══════════════════════════════════════════ */}
      <div className="mx-auto max-w-md mt-6 px-4">
        <div className="flex justify-between overflow-x-auto no-scrollbar border-b border-border/20">
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
                <div className="relative mx-auto mb-6 w-fit">
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Pen className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">No posts yet</h3>
                <p className="text-sm text-muted-foreground mb-8 max-w-[260px] mx-auto leading-relaxed">Share what you're building with the Zero Club community.</p>
                <Link to="/app/compose" className="inline-flex items-center gap-2 bg-foreground text-background px-7 py-3.5 rounded-full text-sm font-bold shadow-xl hover:opacity-90 active:scale-95 transition-all">
                  <Edit3 className="h-4 w-4" />
                  Create Post
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
                <div className="relative mx-auto mb-6 w-fit">
                  <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-[2]" />
                  <div className="relative h-24 w-24 rounded-3xl bg-accent/40 border border-border/30 flex items-center justify-center mx-auto shadow-inner">
                    <Zap className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">No ships yet</h3>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">Ship your first project and show the world what you're creating.</p>
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
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">Photos and videos from your posts will appear here.</p>
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
