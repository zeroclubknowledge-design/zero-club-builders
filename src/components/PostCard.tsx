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
        // Strip HTML tags before sharing
        const tmp = document.createElement("DIV");
        tmp.innerHTML = displayContent || "";
        const plainText = tmp.textContent || tmp.innerText || "";
        
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
    <article className="border-b border-white/5 transition active:bg-white/[0.02">
      <div className="p-4">
        {post.type === 'repost' && (
          <div className="flex items-center gap-2 mb-2 px-1 text-muted-foreground">
            <span className="text-[11px] font-bold text-muted-foreground/60">{post.reposted_by} reposted</span>
          </div>
        )}
        <header className="flex items-center justify-between mb-3">
          <Link 
            to="/app/profile/$id" 
            params={{ id: post.author_id }}
            className="flex items-center gap-3 transition active:opacity-70"
          >
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-muted-foreground text-xs">
                {post.profiles?.avatar_url ? (
                  <img src={post.profiles.avatar_url} alt={post.profiles.username} className="h-full w-full object-cover" />
                ) : (
                  (post.profiles?.full_name || post.profiles?.username || 'U').substring(0, 1).toUpperCase()
                )}
              </div>
              {post.profiles?.tier === 'Premium' && (
                <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 fill-[#cc208f] text-white border-2 border-black rounded-full" />
              )}
              {post.profiles?.tier === 'Premium+' && (
                <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 fill-[#ffcf00] text-black border-2 border-black rounded-full" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-foreground leading-none">{post.profiles?.full_name || post.profiles?.username}</span>
                {post.is_build_post && (
                  <div className="flex items-center gap-1">
                    <span className="flex items-center gap-0.5 rounded-full bg-primary/20 px-2 py-0.5 text-[9px] text-primary border border-primary/20">
                      <Rocket className="h-2.5 w-2.5 fill-current" /> Ship
                    </span>
                    {post.is_verified_build && (
                      <span className="flex items-center gap-0.5 rounded-full bg-success/20 px-2 py-0.5 text-[9px] text-success border border-success/20">
                        <CheckCircle2 className="h-2.5 w-2.5 fill-current" /> Proof
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="truncate max-w-[100px] sm:max-w-[150px]">@{post.profiles?.username}</span>
                <span className="text-[8px] opacity-40 shrink-0">•</span>
                <span className="flex items-center gap-1 text-[10px] shrink-0">
                  <Clock className="h-3 w-3 opacity-60" />
                  {post.created_at ? `${formatDistanceToNow(new Date(post.created_at))} ago · ${format(new Date(post.created_at), 'h:mm a')}` : 'just now'}
                </span>
                {post.location && (
                  <>
                    <span className="text-[8px] opacity-40 shrink-0 hidden sm:inline">•</span>
                    <span className="flex items-center gap-1 text-[10px] shrink-0 truncate max-w-[120px]">
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
              <button className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition rounded-full hover:bg-accent/50">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-xl border-border">
              <DropdownMenuItem className="flex items-center gap-3 py-3 cursor-pointer" onClick={handleShare}>
                <Send className="h-4 w-4" />
                <span className="font-medium text-sm">Send</span>
              </DropdownMenuItem>
              {!isOwnPost && (
                <DropdownMenuItem 
                  className="flex items-center gap-3 py-3 cursor-pointer"
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
                  className="flex items-center gap-3 py-3 cursor-pointer"
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
                  className="flex items-center gap-3 py-3 cursor-pointer text-destructive focus:text-destructive font-bold"
                  onClick={handleDeletePost}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-sm">Delete Post</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                className="flex items-center gap-3 py-3 cursor-pointer text-destructive focus:text-destructive"
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
              <div className="text-[15px] text-foreground/90 leading-relaxed group-hover:text-foreground transition whitespace-pre-wrap line-clamp-3">
                <LinkifiedText text={displayContent} />
                {post.updated_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000 && (
                  <span className="text-[10px] text-muted-foreground/50 ml-2 font-medium italic">(edited)</span>
                )}
              </div>
              {displayContent?.length > 150 && (
                <span className="text-primary text-[13px] font-bold mt-1 block hover:underline">Read more</span>
              )}
            </div>
            
            {post.media_urls && post.media_urls.length > 0 && (
              <div className={`mt-3 rounded-2xl overflow-hidden transition-colors ${
                post.media_urls.length === 2 
                  ?"grid grid-cols-2 gap-0.5 max-h-[320px] border border-white/10 bg-white/5 group-hover:border-white/20" 
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
                        ?"h-[320px] w-full" 
                        : "max-w-full border border-white/10 bg-white/5 hover:border-white/20 transition-colors"
                    }`}
                  >
                    {isVideoUrl(url) ? (
                      <div className="relative h-full w-full flex items-center justify-center">
                        <video 
                          ref={videoRef}
                          src={url} 
                          className={`rounded-2xl ${
                            post.media_urls.length === 2 
                              ?"w-full h-full object-cover" 
                              : "max-w-full max-h-[600px] w-auto h-auto"
                          }`} 
                          muted={isMuted} 
                          loop 
                          playsInline
                        />
                        <button 
                          onClick={toggleMute}
                          className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition active:scale-95 hover:bg-black/60 z-10"
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
                              ?"w-full h-full object-cover" 
                              : "max-w-full max-h-[600px] w-auto h-auto"
                          }`} 
                        />
                      )}
                      
                      {post.media_urls.length > 2 && i === 1 && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                          <span className="text-white text-3xl font-bold tracking-tight">+{post.media_urls.length - 2}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            {/* Quoted Post Mini-Card */}
            {post.quoted_posts && (
              <div 
                className="mt-3 rounded-2xl border border-border/50 bg-card/30 p-3 hover:bg-card/50 transition cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.navigate({ to: '/app/post/$id', params: { id: post.quoted_posts.id } });
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-5 w-5 rounded-full overflow-hidden bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                    {post.quoted_posts.profiles?.avatar_url ? (
                      <img src={post.quoted_posts.profiles.avatar_url} className="h-full w-full object-cover" />
                    ) : (
                      (post.quoted_posts.profiles?.username || 'U')[0].toUpperCase()
                    )}
                  </div>
                  <span className="text-[13px] font-bold truncate">{post.quoted_posts.profiles?.full_name || post.quoted_posts.profiles?.username}</span>
                  <span className="text-[11px] text-muted-foreground truncate">{getFirstName(post.quoted_posts.profiles)}</span>
                </div>
                <div className="text-[13px] line-clamp-2 text-foreground/80 leading-relaxed mb-2">
                  <LinkifiedText text={quotedDisplayContent} />
                </div>
                {post.quoted_posts.media_urls?.[0] && (
                  <div 
                    className="mt-3 relative h-[200px] w-full rounded-2xl overflow-hidden border border-white/10 cursor-pointer"
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

        <footer className="mt-4 flex items-center justify-between">
          <div className="flex items-center justify-between w-full text-muted-foreground gap-x-2 flex-wrap pr-1 sm:pr-4">
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCommentClick?.(post);
              }}
              className="flex items-center gap-1.5 transition hover:text-primary active:scale-95 group/btn"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-xs">{commentsCount}</span>
            </button>
            <button 
              onClick={handleLike}
              className="flex items-center gap-1.5 transition active:scale-95 group/btn"
            >
              <Heart className={`h-4 w-4 ${liked ?"fill-primary text-primary" : "group-hover/btn:text-primary"}`} />
              <span className={`text-xs ${liked ?"text-primary" : ""}`}>
                {likesCount}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className={`flex items-center gap-1.5 transition active:scale-95 ${hasReposted || hasQuoted ?'text-primary font-bold' : 'hover:text-primary'}`}
                >
                  <Repeat className={`h-4 w-4 ${hasReposted || hasQuoted ?'text-primary font-bold' : ''}`} />
                  <span className="text-xs">
                    {Math.max(0, 
                      (post.computed_reposts_count ?? post.reposts_count ?? 0) + (hasReposted && !post.hasReposted ? 1 : (!hasReposted && post.hasReposted ? -1 : 0)) +
                      (post.computed_quotes_count ?? 0) + (hasQuoted && !post.hasQuoted ? 1 : (!hasQuoted && post.hasQuoted ? -1 : 0))
                    )}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 bg-background/95 backdrop-blur-xl border-border">
                <DropdownMenuItem className="gap-3 py-3 cursor-pointer" onClick={handleRepost}>
                  <Repeat className="h-4 w-4" />
                  <span className="font-bold">{hasReposted ? 'Undo Repost' : 'Repost'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="gap-3 py-3 cursor-pointer"
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
                  <span className="font-bold">Quote</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button 
              onClick={handleBookmark}
              className={`flex items-center gap-1.5 transition active:scale-95 ${isBookmarked ?'text-primary font-bold' : 'hover:text-primary text-muted-foreground'}`}
            >
              <Bookmark className={`h-4 w-4 ${isBookmarked ?'fill-current' : ''}`} />
              <span className="text-xs">{isBookmarked ? 'Saved' : 'Save'}</span>
            </button>

            <button 
              onClick={handleShare}
              className="flex items-center gap-1.5 transition hover:text-primary active:scale-95 text-muted-foreground"
            >
              <Share2 className="h-4 w-4" />
              <span className="text-xs">Share</span>
            </button>
          </div>
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
