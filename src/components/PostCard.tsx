import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { 
  MoreHorizontal, CheckCircle2, Bookmark, Zap,
  UserPlus, UserMinus, VolumeX, Volume2, Ban, Flag, Link as LinkIcon,
  ExternalLink, X, Heart, MessageCircle, Share2, Repeat, Mail, EyeOff, Send, Trash2, Quote, Clock, Edit3, Rocket, MapPin
} from "lucide-react";
import { formatDistanceToNow, format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ImageLightbox } from './ImageLightbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { likePostAction, unlikePostAction } from "@/api";
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName } from "@/lib/utils";

interface PostCardProps {
  post: any;
  currentUser?: any;
  onCommentClick?: (post: any) => void;
}

export function PostCard({ post, currentUser, onCommentClick }: PostCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cleanLegacyShipContent = (content: string) => {
    if (!content) return content;
    return content
      .replace(/## 🚀 /g, '**Project:** ')
      .replace(/### 🔗 Project Links/g, '**Project Links:**\n')
      .replace(/### 🤖 AI Prompts Used/g, '**AI Prompts Used:**\n');
  };
  const displayContent = post.is_build_post ? cleanLegacyShipContent(post.content) : post.content;
  const quotedDisplayContent = post.quoted_posts?.is_build_post ? cleanLegacyShipContent(post.quoted_posts.content) : post.quoted_posts?.content;
  const [liked, setLiked] = useState(post?.isLiked || false);
  const [likesCount, setLikesCount] = useState(post?.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(post?.comments_count || 0);
  const [isBookmarked, setIsBookmarked] = useState(post?.isBookmarked || false);
  const [hasReposted, setHasReposted] = useState(post?.hasReposted || false);
  const [hasQuoted, setHasQuoted] = useState(post?.hasQuoted || false);
  const [isMuted, setIsMuted] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const postId = post.original_id || post.id;
  const isOwnPost = currentUser?.id === post.author_id;
  const isEditable = isOwnPost; // No time limit

  const isFollowingAuthor = !!(currentUser?.following_ids?.includes(post.author_id));

  // Sync state with props
  useEffect(() => {
    setIsBookmarked(post.isBookmarked);
    setLiked(post.isLiked);
    setLikesCount(post.likes_count || 0);
    setCommentsCount(post.comments_count || 0);
    setHasReposted(post.hasReposted || false);
    setHasQuoted(post.hasQuoted || false);
  }, [post.isBookmarked, post.isLiked, post.likes_count, post.comments_count, post.hasReposted, post.hasQuoted]);

  // Listen for instant comment updates
  useEffect(() => {
    const handleCommentAdded = (e: any) => {
      if (e.detail?.postId === postId) {
        setCommentsCount(prev => prev + 1);
      }
    };
    window.addEventListener('comment-added', handleCommentAdded);
    return () => window.removeEventListener('comment-added', handleCommentAdded);
  }, [postId]);

  useEffect(() => {
    if (!videoRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoRef.current?.play().catch(() => {});
          } else {
            videoRef.current?.pause();
          }
        });
      },
      { threshold: 0.6 }
    );

    observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, []);

  const handleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!currentUser) {
      toast.error("Sign in to bookmark shipped work!");
      return;
    }

    const newStatus = !isBookmarked;
    setIsBookmarked(newStatus);
    
    try {
      if (newStatus) {
        const { error } = await supabase
          .from('bookmarks')
          .insert([{ profile_id: currentUser.id, post_id: postId }]);
        if (error) throw error;
        toast.success("Saved to bookmarks!");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      } else {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('profile_id', currentUser.id)
          .eq('post_id', postId);
        if (error) throw error;
        toast.success("Removed from bookmarks");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      }
    } catch (err: any) {
      setIsBookmarked(!newStatus);
      toast.error("Could not update bookmark.");
    }
  };

  const handleDeletePost = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;
      
      toast.success("Post deleted successfully! ️");
      queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
    } catch (err) {
      toast.error("Failed to delete post.");
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.is_build_post) {
      router.navigate({ to: '/app/ship', search: { editId: postId } });
    } else {
      router.navigate({ to: '/app/compose', search: { editId: postId } });
    }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!currentUser) {
      toast.error("Sign in to like shipped work!");
      return;
    }

    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount(prev => newLiked ? prev + 1 : prev - 1);
    
    try {
      if (newLiked) {
        await likePostAction({ data: { profileId: currentUser.id, postId } });
        toast.success("Added to your liked ships!");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      } else {
        await unlikePostAction({ data: { profileId: currentUser.id, postId } });
        toast.success("Removed from liked ships");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      }
    } catch (err: any) {
      setLiked(!newLiked);
      setLikesCount(likesCount);
      toast.error(`Could not update like: ${err.message || 'Unknown error'}`);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  const handleRepost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!currentUser) {
      toast.error("Sign in to repost ships!");
      return;
    }

    const newHasReposted = !hasReposted;
    setHasReposted(newHasReposted);

    if (newHasReposted) {
      const { error } = await supabase
        .from('reposts')
        .insert({ profile_id: currentUser.id, post_id: postId });

      if (error && error.code !== '23505') {
        setHasReposted(false);
        toast.error("Could not repost ship.");
      } else {
        toast.success("Reposted to your feed!");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      }
    } else {
      const { error } = await supabase
        .from('reposts')
        .delete()
        .eq('profile_id', currentUser.id)
        .eq('post_id', postId);
      
      if (error) {
        setHasReposted(true);
        toast.error("Could not undo repost.");
      } else {
        toast.success("Removed repost!");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      }
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Include referral code if available
    const referralSuffix = currentUser?.referral_code ? `?ref=${currentUser.referral_code}` : '';
    const url = `${window.location.origin}/app/post/${postId}${referralSuffix}`;
    
    if (navigator.share) {
      try {
        // Strip HTML tags and Markdown asterisks before sharing
        const tmp = document.createElement("DIV");
        tmp.innerHTML = displayContent || "";
        let plainText = tmp.textContent || tmp.innerText || "";
        plainText = plainText.replace(/\*/g, '');
        
        await navigator.share({
          title: 'Check out this shipped work on Zero Club!',
          text: plainText.substring(0, 100) + (plainText.length > 100 ? '...' : ''),
          url: url,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link with your referral code copied!");
    }
  };

  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.includes('video');
  };

  return (
    <article className="border-b hairline transition-colors duration-200 hover:bg-foreground/[0.015]">
      <div className="px-5 py-5">
        {post.type === 'repost' && (
          <div className="flex items-center gap-2 mb-2.5 pl-[52px] text-muted-foreground">
            <Repeat className="h-3 w-3 opacity-60" />
            <span className="text-[11px] font-medium tracking-tight text-muted-foreground/70">{post.reposted_by} reposted</span>
          </div>
        )}
        <header className="flex items-start justify-between mb-3">
          <Link
            to="/app/profile/$id"
            params={{ id: post.author_id }}
            className="flex items-center gap-3 tap min-w-0"
          >
            <div className="relative shrink-0">
              <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center font-semibold text-muted-foreground text-xs ring-1 ring-border">
                {post.profiles?.avatar_url ? (
                  <img src={post.profiles.avatar_url} alt={post.profiles.username} className="h-full w-full object-cover" />
                ) : (
                  (post.profiles?.full_name || post.profiles?.username || 'U').substring(0, 1).toUpperCase()
                )}
              </div>
              {post.profiles?.tier === 'Premium' && (
                <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary ring-2 ring-background">
                  <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                </span>
              )}
              {post.profiles?.tier === 'Premium+' && (
                <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#ffcf00] ring-2 ring-background">
                  <CheckCircle2 className="h-2.5 w-2.5 text-black" strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[15px] font-semibold tracking-tight text-foreground leading-tight">{post.profiles?.full_name || post.profiles?.username}</span>
                {post.is_build_post && (
                  <div className="flex items-center gap-1">
                    <span className="flex items-center gap-1 rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/15">
                      <Rocket className="h-2.5 w-2.5" /> Ship
                    </span>
                    {post.is_verified_build && (
                      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success ring-1 ring-success/20">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Proof
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[12px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight">
                <span className="truncate max-w-[110px] sm:max-w-[160px] font-medium">@{post.profiles?.username}</span>
                <span className="opacity-40 shrink-0">·</span>
                <span className="shrink-0 tabular-nums">
                  {post.created_at ? formatDistanceToNow(new Date(post.created_at)).replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm').replace(' hours', 'h').replace(' hour', 'h').replace(' days', 'd').replace(' day', 'd').replace(' months', 'mo').replace(' month', 'mo').replace(' years', 'y').replace(' year', 'y').replace('less than am', '<1m') : 'now'}
                </span>
                {post.location && (
                  <>
                    <span className="opacity-40 shrink-0 hidden sm:inline">·</span>
                    <span className="flex items-center gap-1 shrink-0 truncate max-w-[120px] hidden sm:inline-flex">
                      <MapPin className="h-3 w-3 opacity-60" />
                      {post.location}
                    </span>
                  </>
                )}
              </span>
            </div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid h-8 w-8 place-items-center -mr-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-foreground/5 transition-colors">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover/95 backdrop-blur-xl border-border shadow-lift">
              <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={handleShare}>
                <Send className="h-4 w-4" />
                <span className="font-medium text-sm">Send</span>
              </DropdownMenuItem>
              {!isOwnPost && (
                <DropdownMenuItem 
                  className="flex items-center gap-3 py-2.5 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.navigate({ to: `/app/chat/${post.author_id}` });
                  }}
                >
                  <Mail className="h-4 w-4" />
                  <span className="font-medium text-sm">Message {getFirstName(post.profiles)}</span>
                </DropdownMenuItem>
              )}
              {!isOwnPost && (
                <DropdownMenuItem 
                  className="flex items-center gap-3 py-2.5 cursor-pointer"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!currentUser) return;
                    if (isFollowingAuthor) {
                      await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', post.author_id);
                      toast.success(`Unfollowed ${getFirstName(post.profiles)}`);
                    } else {
                      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: post.author_id });
                      toast.success(`Now following ${getFirstName(post.profiles)}!`);
                    }
                    queryClient.invalidateQueries({ queryKey: ['followStatus', currentUser?.id, post.author_id] });
                  }}
                >
                  {isFollowingAuthor ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  <span className="font-medium text-sm">{isFollowingAuthor ? "Unfollow" : "Follow"} {getFirstName(post.profiles)}</span>
                </DropdownMenuItem>
              )}
              {isEditable && (
                <DropdownMenuItem 
                  onClick={handleEditClick}
                  className="cursor-pointer text-blue-500 hover:text-blue-600 focus:text-blue-600"
                >
                  <Edit3 className="mr-2 h-4 w-4" />
                  <span className="text-sm">Edit Post</span>
                </DropdownMenuItem>
              )}
              {isOwnPost && (
                <DropdownMenuItem 
                  className="flex items-center gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive font-bold"
                  onClick={handleDeletePost}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-sm">Delete Post</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                className="flex items-center gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  toast.success("Post reported. Thank you for keeping the club safe!");
                }}
              >
                <Flag className="h-4 w-4" />
                <span className="font-medium text-sm">Report post</span>
              </DropdownMenuItem>

            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <Link
          to="/app/post/$id"
          params={{ id: postId }}
          className="block group"
        >
          <div className="space-y-3">
            <div className="relative">
              <div className="text-[15px] text-foreground/90 leading-[1.55] tracking-[-0.005em] whitespace-pre-wrap line-clamp-3">
                <LinkifiedText text={displayContent} />
                {post.updated_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000 && (
                  <span className="text-[10px] text-muted-foreground/60 ml-1.5 font-medium">· edited</span>
                )}
              </div>
              {displayContent?.length > 150 && (
                <span className="text-muted-foreground hover:text-foreground text-[13px] font-medium mt-1.5 inline-block transition-colors">Read more →</span>
              )}
            </div>

            {post.media_urls && post.media_urls.length > 0 && (
              <div className={`mt-3 overflow-hidden rounded-2xl ${
                post.media_urls.length === 2
                  ? "grid grid-cols-2 gap-0.5 max-h-[320px] ring-1 ring-border bg-muted/40"
                  : "flex justify-start"
              }`}>
                {post.media_urls.slice(0, 2).map((url: string, i: number) => (
                  <div
                    key={i}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLightboxUrls(post.media_urls);
                      setLightboxIndex(i);
                      setLightboxOpen(true);
                    }}
                    className={`relative overflow-hidden rounded-2xl cursor-pointer ${
                      post.media_urls.length === 2
                        ? "h-[320px] w-full"
                        : "max-w-full ring-1 ring-border bg-muted/40 transition"
                    }`}
                  >
                    {isVideoUrl(url) ? (
                      <div className="relative h-full w-full flex items-center justify-center">
                        <video
                          ref={videoRef}
                          src={url}
                          className={`rounded-2xl ${
                            post.media_urls.length === 2
                              ? "w-full h-full object-cover"
                              : "max-w-full max-h-[600px] w-auto h-auto"
                          }`}
                          muted={isMuted}
                          loop
                          playsInline
                        />
                        <button
                          onClick={toggleMute}
                          className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/15 flex items-center justify-center text-white transition tap hover:bg-black/70 z-10"
                        >
                          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                      </div>
                    ) : (
                        <img
                          src={url}
                          alt={`Post media ${i + 1}`}
                          className={`rounded-2xl ${
                            post.media_urls.length === 2
                              ? "w-full h-full object-cover"
                              : "max-w-full max-h-[600px] w-auto h-auto"
                          }`}
                        />
                      )}

                      {post.media_urls.length > 2 && i === 1 && (
                        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                          <span className="text-white text-2xl font-semibold tracking-tight">+{post.media_urls.length - 2}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            {/* Quoted Post Mini-Card */}
            {post.quoted_posts && (
              <div
                className="mt-3 rounded-2xl ring-1 ring-border bg-card/50 p-3.5 hover:bg-card transition-colors cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.navigate({ to: '/app/post/$id', params: { id: post.quoted_posts.id } });
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 w-5 rounded-full overflow-hidden bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                    {post.quoted_posts.profiles?.avatar_url ? (
                      <img src={post.quoted_posts.profiles.avatar_url} className="h-full w-full object-cover" />
                    ) : (
                      (post.quoted_posts.profiles?.username || 'U')[0].toUpperCase()
                    )}
                  </div>
                  <span className="text-[13px] font-semibold tracking-tight truncate">{post.quoted_posts.profiles?.full_name || post.quoted_posts.profiles?.username}</span>
                  <span className="text-[11px] text-muted-foreground truncate">@{post.quoted_posts.profiles?.username}</span>
                </div>
                <div className="text-[13px] line-clamp-2 text-foreground/85 leading-[1.55] mb-1">
                  <LinkifiedText text={quotedDisplayContent} />
                </div>
                {post.quoted_posts.media_urls?.[0] && (
                  <div
                    className="mt-3 relative h-[200px] w-full rounded-xl overflow-hidden ring-1 ring-border cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLightboxUrls(post.quoted_posts.media_urls);
                      setLightboxIndex(0);
                      setLightboxOpen(true);
                    }}
                  >
                    {isVideoUrl(post.quoted_posts.media_urls[0]) ? (
                      <video src={post.quoted_posts.media_urls[0]} className="h-full w-full object-cover" muted playsInline />
                    ) : (
                      <img src={post.quoted_posts.media_urls[0]} className="h-full w-full object-cover" />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Link>

        <footer className="mt-4 -ml-2 flex items-center justify-between max-w-md">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCommentClick?.(post);
            }}
            className="group/btn flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-muted-foreground tap hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <MessageCircle className="h-[17px] w-[17px]" />
            <span className="text-[12px] font-medium tabular-nums">{commentsCount || ''}</span>
          </button>
          <button
            onClick={handleLike}
            className="group/btn flex items-center gap-1.5 rounded-full px-2.5 py-1.5 tap hover:bg-primary/8"
          >
            <Heart className={`h-[17px] w-[17px] transition-colors ${liked ? "fill-primary text-primary" : "text-muted-foreground group-hover/btn:text-primary"}`} strokeWidth={liked ? 2 : 1.75} />
            <span className={`text-[12px] font-medium tabular-nums transition-colors ${liked ? "text-primary" : "text-muted-foreground group-hover/btn:text-primary"}`}>
              {likesCount || ''}
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 tap hover:bg-primary/8 ${hasReposted || hasQuoted ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
              >
                <Repeat className="h-[17px] w-[17px]" />
                <span className="text-[12px] font-medium tabular-nums">
                  {(() => {
                    const n = Math.max(0,
                      (post.computed_reposts_count ?? post.reposts_count ?? 0) + (hasReposted && !post.hasReposted ? 1 : (!hasReposted && post.hasReposted ? -1 : 0)) +
                      (post.computed_quotes_count ?? 0) + (hasQuoted && !post.hasQuoted ? 1 : (!hasQuoted && post.hasQuoted ? -1 : 0))
                    );
                    return n || '';
                  })()}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-popover/95 backdrop-blur-xl border-border shadow-lift">
              <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onClick={handleRepost}>
                <Repeat className="h-4 w-4" />
                <span className="font-medium text-sm">{hasReposted ? 'Undo repost' : 'Repost'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-3 py-2.5 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.navigate({
                    to: '/app/compose',
                    search: { quote: postId }
                  });
                }}
              >
                <Quote className="h-4 w-4" />
                <span className="font-medium text-sm">Quote</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={handleBookmark}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 tap hover:bg-primary/8 ${isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
          >
            <Bookmark className={`h-[17px] w-[17px] ${isBookmarked ? 'fill-current' : ''}`} strokeWidth={isBookmarked ? 2 : 1.75} />
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 tap hover:bg-foreground/[0.04] text-muted-foreground hover:text-foreground"
          >
            <Share2 className="h-[17px] w-[17px]" />
          </button>
        </footer>
      </div>

      <ImageLightbox 
        mediaUrls={lightboxUrls} 
        initialIndex={lightboxIndex} 
        isOpen={lightboxOpen} 
        onClose={() => setLightboxOpen(false)} 
      />
    </article>
  );
}
