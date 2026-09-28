import { AffiliationBadge, AvatarAffiliation } from "@/components/AffiliationBadge";
import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { 
  MoreHorizontal, CheckCircle2, Bookmark, BadgeCheck, Plus,
  UserMinus, VolumeX, Volume2, Flag, ThumbsUp, MessageSquare, Repeat, Mail, Send, Trash2, Quote, Edit3, Rocket, Play
} from "@/components/icons/glyphs";
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { memo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { ImageLightbox } from './ImageLightbox';
import { likePostAction, unlikePostAction } from "@/api";
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName } from "@/lib/utils";
import { useFollow } from "@/hooks/useFollow";

interface PostCardProps {
  post: any;
  currentUser?: any;
  onCommentClick?: (post: any) => void;
}

const isVideoUrl = (url: string) => {
  const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
  return videoExtensions.some((extension) => url.toLowerCase().includes(extension)) || url.includes('video');
};

function SingleFeedMedia({ url, onOpen }: { url: string; onOpen: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.6 });

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  if (isVideoUrl(url)) {
    return (
      <div className="mt-3 w-full bg-black">
        <div
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpen();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            onOpen();
          }}
          className="group/media relative mx-auto flex max-w-full cursor-zoom-in justify-center"
        >
          <video
            ref={videoRef}
            src={url}
            className="block h-auto max-h-[520px] w-auto max-w-full object-contain"
            muted={isMuted}
            loop
            playsInline
            preload="metadata"
          />
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (videoRef.current) videoRef.current.muted = nextMuted;
            }}
            className="absolute bottom-2.5 right-2.5 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/75"
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 w-full bg-foreground/[0.03]">
      <img
        src={url}
        alt="Post media"
        loading="lazy"
        decoding="async"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
        className="mx-auto block h-auto max-h-[560px] w-full cursor-zoom-in object-cover transition-opacity hover:opacity-[0.98]"
      />
    </div>
  );
}

function FeedMediaGrid({ urls, onOpen }: { urls: string[]; onOpen: (index: number) => void }) {
  const visibleUrls = urls.slice(0, 4);
  const count = visibleUrls.length;
  const gridClass = count === 2
    ? "grid-cols-2 h-[210px] sm:h-[280px] md:h-[320px]"
    : count === 3
      ? "grid-cols-2 grid-rows-2 h-[260px] sm:h-[320px] md:h-[360px]"
      : "grid-cols-2 grid-rows-2 h-[260px] sm:h-[320px] md:h-[360px]";

  return (
    <div className={`mt-3 grid w-full gap-0.5 overflow-hidden bg-card ${gridClass}`}>
      {visibleUrls.map((url, index) => (
        <div
          key={`${url}-${index}`}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpen(index);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            onOpen(index);
          }}
          className={`group/media relative min-h-0 min-w-0 cursor-zoom-in overflow-hidden bg-muted ${count === 3 && index === 0 ? "row-span-2" : ""}`}
        >
          {isVideoUrl(url) ? (
            <>
              <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
              <span className="absolute left-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur-sm">
                <Play className="h-3.5 w-3.5 fill-current" />
              </span>
            </>
          ) : (
            <img
              src={url}
              alt={`Post media ${index + 1}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover/media:scale-[1.015]"
            />
          )}

          {urls.length > 4 && index === 3 && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-black/55">
              <span className="text-2xl font-semibold tracking-tight text-white">+{urls.length - 4}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdaptiveFeedMedia({ urls, onOpen }: { urls: string[]; onOpen: (index: number) => void }) {
  if (urls.length === 1) {
    return <SingleFeedMedia url={urls[0]} onOpen={() => onOpen(0)} />;
  }
  return <FeedMediaGrid urls={urls} onOpen={onOpen} />;
}

function PostCardView({ post, currentUser, onCommentClick }: PostCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cleanLegacyShipContent = (content: string) => {
    if (!content) return content;
    return content
      .replace(/## 🚀 /g, '**Project:** ')
      .replace(/### 🔗 Project Links/g, '**Project Links:**\n')
      .replace(/### 🤖 AI Prompts Used/g, '**AI Prompts Used:**\n')
      // Ships stored before the rename keep saying "Skills Used". Rewriting on
      // the way out means every ship reads the same without touching a single
      // stored row.
      .replace(/\*\*Skills Used:\*\*/g, '**Tools Used:**');
  };
  const displayContent = post.is_build_post ? cleanLegacyShipContent(post.content) : post.content;
  const quotedDisplayContent = post.quoted_posts?.is_build_post ? cleanLegacyShipContent(post.quoted_posts.content) : post.quoted_posts?.content;
  const [liked, setLiked] = useState(post?.isLiked || false);
  const [likesCount, setLikesCount] = useState<number>(Number(post?.likes_count || 0));
  const [commentsCount, setCommentsCount] = useState<number>(Number(post?.comments_count || 0));
  const [isBookmarked, setIsBookmarked] = useState(post?.isBookmarked || false);
  const [hasReposted, setHasReposted] = useState(post?.hasReposted || false);
  const [hasQuoted, setHasQuoted] = useState(post?.hasQuoted || false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);
  const postId = post.original_id || post.id;
  const isOwnPost = currentUser?.id === post.author_id;
  const isEditable = isOwnPost; // No time limit

  // Shared follow state, kept in sync with profiles and post detail pages.
  const { isFollowing: isFollowingAuthor, toggleFollow: toggleFollowAuthor } = useFollow(post.author_id);

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
    const handleCommentDeleted = (e: any) => {
      if (e.detail?.postId === postId) {
        const deletedCount = Math.max(1, Number(e.detail?.count || 1));
        setCommentsCount(prev => Math.max(0, prev - deletedCount));
      }
    };
    window.addEventListener('comment-added', handleCommentAdded);
    window.addEventListener('comment-deleted', handleCommentDeleted);
    return () => {
      window.removeEventListener('comment-added', handleCommentAdded);
      window.removeEventListener('comment-deleted', handleCommentDeleted);
    };
  }, [postId]);

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
        queryClient.invalidateQueries({ queryKey: ['feed_posts'], refetchType: 'none' });
      } else {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('profile_id', currentUser.id)
          .eq('post_id', postId);
        if (error) throw error;
        toast.success("Removed from bookmarks");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'], refetchType: 'none' });
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
        queryClient.invalidateQueries({ queryKey: ['feed_posts'], refetchType: 'none' });
      } else {
        await unlikePostAction({ data: { profileId: currentUser.id, postId } });
        toast.success("Removed from liked ships");
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
        queryClient.invalidateQueries({ queryKey: ['feed_posts'], refetchType: 'none' });
      }
    } catch (err: any) {
      setLiked(!newLiked);
      setLikesCount(likesCount);
      toast.error(`Could not update like: ${err.message || 'Unknown error'}`);
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

  const timeAgo = post.created_at
    ? formatDistanceToNow(new Date(post.created_at)).replace('about ', '').replace(' minutes', 'm').replace(' minute', 'm').replace(' hours', 'h').replace(' hour', 'h').replace(' days', 'd').replace(' day', 'd').replace(' months', 'mo').replace(' month', 'mo').replace(' years', 'y').replace(' year', 'y').replace('less than am', '<1m')
    : 'now';
  const authorRole =
    post.profiles?.account_type === 'Institution' ? 'Institution' : post.profiles?.account_type === 'Tutor' ? 'Tutor' : 'Builder';
  const repostCount = Math.max(0,
    (post.computed_reposts_count ?? post.reposts_count ?? 0) + (hasReposted && !post.hasReposted ? 1 : (!hasReposted && post.hasReposted ? -1 : 0)) +
    (post.computed_quotes_count ?? 0) + (hasQuoted && !post.hasQuoted ? 1 : (!hasQuoted && post.hasQuoted ? -1 : 0))
  );
  const openMedia = (urls: string[], index: number) => {
    setLightboxUrls(urls);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  const actionClass = "flex h-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold tap transition-colors hover:bg-foreground/[0.03]";

  return (
    <article className="mt-2 bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
      {post.type === 'repost' && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
          <Repeat className="h-3.5 w-3.5" />
          <span className="truncate"><span className="font-semibold text-foreground">{post.reposted_by}</span> reposted this</span>
        </div>
      )}

      <header className="flex items-start gap-2.5 px-4 pt-3">
        <Link to="/app/profile/$id" params={{ id: post.author_id }} className="flex min-w-0 flex-1 items-start gap-2.5 tap">
          <div className="relative h-12 w-12 shrink-0">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
              {post.profiles?.avatar_url ? (
                <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                (post.profiles?.full_name || post.profiles?.username || 'U').substring(0, 1).toUpperCase()
              )}
            </div>
            <AvatarAffiliation profile={post.profiles} size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="truncate text-[15px] font-semibold text-foreground">{post.profiles?.full_name || post.profiles?.username}</span>
              {(post.profiles?.tier === 'Premium' || post.profiles?.tier === 'Premium+') && (
                <BadgeCheck
                  aria-label={post.profiles.tier}
                  className={`h-4 w-4 shrink-0 fill-current ${post.profiles.tier === 'Premium+' ? 'text-[#e0a800]' : 'text-accent'}`}
                />
              )}
              <AffiliationBadge profile={post.profiles} size={15} />
            </div>
            <p className="truncate text-[13px] leading-snug text-muted-foreground">
              {authorRole}{post.profiles?.username ? ` · @${post.profiles.username}` : ''}
            </p>
            <p className="flex items-center gap-1 text-[12px] leading-snug text-muted-foreground">
              <span className="tabular-nums">{timeAgo}</span>
              {post.is_build_post && (
                <>
                  <span aria-hidden>·</span>
                  <Rocket className="h-3.5 w-3.5" />
                  <span>Shipped a project</span>
                </>
              )}
              {post.location && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{post.location}</span>
                </>
              )}
            </p>
          </div>
        </Link>

        {!isOwnPost && currentUser && !isFollowingAuthor && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const next = await toggleFollowAuthor();
                if (next) toast.success(`Now following ${getFirstName(post.profiles)}`);
              } catch (error: any) {
                toast.error(error.message || "Could not follow");
              }
            }}
            className="flex h-8 shrink-0 items-center gap-0.5 text-[14px] font-semibold text-accent tap hover:opacity-80"
          >
            <Plus className="h-4 w-4" />
            Follow
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="More options" className="-mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover/95 backdrop-blur-xl border-border shadow-lift">
            <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={handleBookmark}>
              <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
              <span className="font-medium text-sm">{isBookmarked ? 'Saved' : 'Save'}</span>
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
            {!isOwnPost && isFollowingAuthor && (
              <DropdownMenuItem
                className="flex items-center gap-3 py-2.5 cursor-pointer"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const next = await toggleFollowAuthor();
                    if (next === false) toast.success(`Unfollowed ${getFirstName(post.profiles)}`);
                  } catch (error: any) {
                    toast.error(error.message || "Could not update follow");
                  }
                }}
              >
                <UserMinus className="h-4 w-4" />
                <span className="font-medium text-sm">Unfollow {getFirstName(post.profiles)}</span>
              </DropdownMenuItem>
            )}
            {isEditable && (
              <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={handleEditClick}>
                <Edit3 className="h-4 w-4" />
                <span className="font-medium text-sm">Edit post</span>
              </DropdownMenuItem>
            )}
            {isOwnPost && (
              <DropdownMenuItem
                className="flex items-center gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive"
                onClick={handleDeletePost}
              >
                <Trash2 className="h-4 w-4" />
                <span className="font-medium text-sm">Delete post</span>
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

      <Link to="/app/post/$id" params={{ id: postId }} className="block">
        <div className="px-4 pt-2.5">
          <div className="line-clamp-3 whitespace-pre-wrap text-[14.5px] leading-[1.5] text-foreground">
            <LinkifiedText text={displayContent} />
            {post.updated_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000 && (
              <span className="ml-1.5 text-[12px] text-muted-foreground">· edited</span>
            )}
          </div>
          {displayContent?.length > 150 && (
            <span className="text-[14px] text-muted-foreground">…more</span>
          )}
          {post.is_build_post && post.is_verified_build && (
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[12px] font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5 fill-current" /> Verified proof
            </span>
          )}
        </div>

        {post.media_urls && post.media_urls.length > 0 && (
          <AdaptiveFeedMedia urls={post.media_urls} onOpen={(index) => openMedia(post.media_urls, index)} />
        )}

        {post.quoted_posts && (
          <div
            className="mx-4 mt-3 cursor-pointer rounded-xl border border-border p-3.5 transition-colors hover:bg-foreground/[0.02]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.navigate({ to: '/app/post/$id', params: { id: post.quoted_posts.id } });
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <div className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[12px] font-semibold text-muted-foreground">
                {post.quoted_posts.profiles?.avatar_url ? (
                  <img src={post.quoted_posts.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  (post.quoted_posts.profiles?.username || 'U')[0].toUpperCase()
                )}
              </div>
              <span className="truncate text-[14px] font-semibold">{post.quoted_posts.profiles?.full_name || post.quoted_posts.profiles?.username}</span>
            </div>
            <div className="line-clamp-2 text-[14px] leading-[1.45] text-foreground/85">
              <LinkifiedText text={quotedDisplayContent} />
            </div>
            {post.quoted_posts.media_urls?.[0] && (
              <div
                className="mt-3 overflow-hidden rounded-lg"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMedia(post.quoted_posts.media_urls, 0);
                }}
              >
                {isVideoUrl(post.quoted_posts.media_urls[0]) ? (
                  <video src={post.quoted_posts.media_urls[0]} className="block max-h-[200px] w-full bg-black object-contain" muted playsInline preload="metadata" />
                ) : (
                  <img src={post.quoted_posts.media_urls[0]} alt="Quoted post media" loading="lazy" decoding="async" className="block max-h-[200px] w-full object-cover" />
                )}
              </div>
            )}
          </div>
        )}
      </Link>

      {/* Who reacted, and how much conversation there is — above the actions,
          so the buttons themselves carry no numbers. */}
      {(likesCount > 0 || commentsCount > 0 || repostCount > 0) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-2.5 text-[12px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {likesCount > 0 && (
              <>
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  <ThumbsUp className="h-2.5 w-2.5 fill-current" />
                </span>
                <span className="truncate tabular-nums">
                  {liked ? (likesCount > 1 ? `You and ${likesCount - 1} other${likesCount - 1 === 1 ? '' : 's'}` : 'You') : likesCount}
                </span>
              </>
            )}
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCommentClick?.(post);
            }}
            className="shrink-0 tabular-nums hover:text-foreground hover:underline"
          >
            {[commentsCount > 0 && `${commentsCount} comment${commentsCount === 1 ? '' : 's'}`, repostCount > 0 && `${repostCount} repost${repostCount === 1 ? '' : 's'}`]
              .filter(Boolean)
              .join(' · ')}
          </button>
        </div>
      )}

      <div className="mx-4 mt-2.5 h-px bg-border" />
      <footer className="grid h-[52px] grid-cols-4 text-muted-foreground">
        <button onClick={handleLike} aria-pressed={liked} className={`${actionClass} ${liked ? 'text-accent' : 'hover:text-foreground'}`}>
          <ThumbsUp className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
          {liked ? 'Liked' : 'Like'}
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCommentClick?.(post);
          }}
          className={`${actionClass} hover:text-foreground`}
        >
          <MessageSquare className="h-5 w-5" />
          Comment
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className={`${actionClass} ${hasReposted || hasQuoted ? 'text-accent' : 'hover:text-foreground'}`}
            >
              <Repeat className="h-5 w-5" />
              {hasReposted ? 'Reposted' : 'Repost'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-48 bg-popover/95 backdrop-blur-xl border-border shadow-lift">
            <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onClick={handleRepost}>
              <Repeat className="h-4 w-4" />
              <span className="font-medium text-sm">{hasReposted ? 'Undo repost' : 'Repost'}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-3 py-2.5 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.navigate({ to: '/app/compose', search: { quote: postId } });
              }}
            >
              <Quote className="h-4 w-4" />
              <span className="font-medium text-sm">Quote</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button onClick={handleShare} className={`${actionClass} hover:text-foreground`}>
          <Send className="h-5 w-5" />
          Send
        </button>
      </footer>

      <ImageLightbox
        mediaUrls={lightboxUrls}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </article>
  );
}

/** A card only re-renders when its own post (or the viewer) changes. */
export const PostCard = memo(PostCardView);
