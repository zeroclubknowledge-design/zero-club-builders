import { useLoaderData, createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { 
  ChevronLeft, MoreHorizontal, MessageCircle, Heart, 
  Repeat, Share2, Send, CheckCircle2, TrendingUp, UserPlus, UserMinus, Loader2, X, Bookmark,
  MessageSquare, Mail, Flag, EyeOff, ShieldCheck, Award, Zap, Trash2, Link as LinkIcon,
  VolumeX, Volume2, Pencil, Edit3, Rocket, MapPin
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { bookmarkPostAction, unbookmarkPostAction, likePostAction, unlikePostAction } from "@/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ImageLightbox } from "@/components/ImageLightbox";
import { getFirstName } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export const Route = createFileRoute("/app/post/$id")({
  loader: async ({ params: { id } }) => {
    const { data: post, error } = await supabase
      .from('posts')
      .select('*, profiles(username, full_name, avatar_url)')
      .eq('id', id)
      .maybeSingle();

    if (error) console.error("Error loading post:", error);
    return { post };
  },
  head: ({ loaderData }) => {
    const post = loaderData?.post;
    if (!post) return {};

    const authorName = post.profiles?.full_name || post.profiles?.username || "Zero Club Builder";
    const title = `${authorName}'s Post on Zero Club`;
    
    let description = post.content || "Check out this post on Zero Club";
    const stripped = description.replace(/(<([^>]+)>)/gi, "");
    description = stripped.substring(0, 160) + (stripped.length > 160 ? '...' : '');

    const isVideoUrl = (url: string) => {
      const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
      return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.includes('video');
    };

    let firstMedia = post.media_urls?.[0];
    if (firstMedia && isVideoUrl(firstMedia)) {
      firstMedia = null; // Don't use video for og:image
    }

    const image = firstMedia || post.profiles?.avatar_url || "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4215c30d-ff7b-4508-a899-c922d00e5475/id-preview-fa4e9537--ee5d9983-4748-4793-a658-4041e1470658.lovable.app-1778475055046.png";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: firstMedia ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ]
    };
  },
  component: PostDetail,
});

function PostDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.includes('video');
  };
  
  const { data, isLoading } = useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const postRes = await supabase.from('posts').select('*, profiles(*), bootcamps(*, profiles(*))').eq('id', id).single();
      if (postRes.error) throw postRes.error;
      const postData = postRes.data;

      const [commentsRes, bookmarkRes, likeRes, followRes, commentLikesRes, repostRes, totalRepostsRes, totalQuotesRes] = await Promise.all([
        supabase.from('comments').select('*, profiles(*)').eq('post_id', id).order('created_at', { ascending: true }),
        session ? supabase.from('bookmarks').select('*').eq('profile_id', session.user.id).eq('post_id', id).maybeSingle() : Promise.resolve({ data: null }),
        session ? supabase.from('likes').select('*').eq('profile_id', session.user.id).eq('post_id', id).maybeSingle() : Promise.resolve({ data: null }),
        session ? supabase.from('follows').select('*').eq('follower_id', session.user.id).eq('following_id', postData.author_id).maybeSingle() : Promise.resolve({ data: null }),
        session ? supabase.from('comment_likes').select('comment_id').eq('profile_id', session.user.id) : Promise.resolve({ data: null }),
        session ? supabase.from('reposts').select('*').eq('profile_id', session.user.id).eq('post_id', id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('reposts').select('id', { count: 'exact', head: true }).eq('post_id', id),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('quoted_post_id', id)
      ]);

      return { 
        post: { ...postData, computed_reposts_count: (totalRepostsRes.count || 0) + (totalQuotesRes.count || 0) },
        comments: commentsRes.data || [],
        isBookmarked: !!bookmarkRes.data,
        isLiked: !!likeRes.data,
        isFollowing: !!followRes.data,
        hasReposted: !!repostRes.data,
        commentLikes: commentLikesRes?.data ? commentLikesRes.data.map((l: any) => l.comment_id) : []
      };
    },
    initialData: () => {
      const feedPosts = queryClient.getQueryData<any[]>(['feed_posts']) || [];
      const userPostsQueries = queryClient.getQueriesData<any[]>({ queryKey: ['profilePosts'] });
      const userPosts = userPostsQueries.flatMap(([_, data]) => Array.isArray(data) ? data : []);
      
      const allFound = [...feedPosts, ...userPosts];
      const post = allFound.find(p => p && p.author_id && p.content && (p.id === id || p.original_id === id));
      
      if (post) {
        return {
          post: { ...post, computed_reposts_count: post.computed_reposts_count || 0 },
          comments: [],
          isBookmarked: post.isBookmarked || false,
          isLiked: post.isLiked || false,
          isFollowing: false,
          hasReposted: post.hasReposted || false,
          commentLikes: []
        };
      }
      return undefined;
    },
    staleTime: 0
  });

  const post = data?.post;
  const initialComments = data?.comments || [];
  
  const [comments, setComments] = useState(initialComments);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null); // Tracks the comment being replied to
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [liked, setLiked] = useState(post?.isLiked || false);
  const [initialLiked, setInitialLiked] = useState(post?.isLiked || false);
  const [isBookmarked, setIsBookmarked] = useState(post?.isBookmarked || false);
  const [hasReposted, setHasReposted] = useState(data?.hasReposted || false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const { data: currentUser } = useUser();
  const [isTutor, setIsTutor] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();

  const isOwnPost = currentUser?.id === post?.author_id;
  
  const cleanLegacyShipContent = (content: string) => {
    if (!content) return content;
    return content
      .replace(/## 🚀 /g, '**Project:** ')
      .replace(/### 🔗 Project Links/g, '**Project Links:**\n')
      .replace(/### 🤖 AI Prompts Used/g, '**AI Prompts Used:**\n');
  };
  const displayContent = post?.is_build_post ? cleanLegacyShipContent(post.content) : post?.content;

  const isEditable = isOwnPost;

  const toggleMute = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  async function handleBookmark() {
    if (!currentUser) {
      toast.error("Sign in to bookmark builds!");
      return;
    }
    
    const newStatus = !isBookmarked;
    setIsBookmarked(newStatus);
    
    try {
      if (newStatus) {
        const { error } = await supabase.from('bookmarks').insert([{ profile_id: currentUser.id, post_id: post.id }]);
        if (error) throw error;
        toast.success("Saved to bookmarks!");
      } else {
        const { error } = await supabase.from('bookmarks').delete().eq('profile_id', currentUser.id).eq('post_id', post.id);
        if (error) throw error;
        toast.success("Removed from bookmarks");
      }
      queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      router.invalidate();
    } catch (err) {
      setIsBookmarked(!newStatus);
      toast.error("Could not update bookmark.");
    }
  }

  useEffect(() => {
    if (data) {
      const likedIds = new Set(data.commentLikes || []);
      setComments(data.comments.map((c: any) => ({
        ...c,
        isLiked: likedIds.has(c.id),
        likes_count: c.likes_count || 0
      })));
      setLiked(data.isLiked);
      setInitialLiked(data.isLiked);
      setIsBookmarked(data.isBookmarked);
      setHasReposted(data.hasReposted);
      setIsFollowing(data.isFollowing);
      
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          if (data.post?.is_build_post && data.post.bootcamps) {
            setIsTutor(data.post.bootcamps.creator_id === session.user.id);
          }
        }
      });
    }
  }, [data]);

  async function handleLikeComment(comment: any) {
    if (!currentUser) {
      toast.error("Sign in to like comments!");
      return;
    }

    const isLiked = comment.isLiked;
    const newLiked = !isLiked;

    // Optimistic update
    setComments(prev => prev.map(c => 
      c.id === comment.id 
        ? { ...c, isLiked: newLiked, likes_count: (c.likes_count || 0) + (newLiked ? 1 : -1) } 
        : c
    ));

    try {
      if (newLiked) {
        const { error } = await supabase
          .from('comment_likes')
          .insert({ comment_id: comment.id, profile_id: currentUser.id });
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', comment.id)
          .eq('profile_id', currentUser.id);
        if (error) throw error;
      }
    } catch (err: any) {
      // Revert
      setComments(prev => prev.map(c => 
        c.id === comment.id 
          ? { ...c, isLiked: isLiked, likes_count: comment.likes_count } 
          : c
      ));
      toast.error("Could not update like.");
    }
  }

  const handleStartEditComment = (comment: any) => {
    setEditingCommentId(comment.id);
    setEditCommentText(comment.content);
  };

  const handleSaveCommentEdit = async () => {
    if (!editingCommentId || !editCommentText.trim()) return;
    try {
      const { error } = await supabase
        .from('comments')
        .update({ content: editCommentText.trim() })
        .eq('id', editingCommentId)
        .eq('profile_id', currentUser?.id);
      
      if (error) throw error;
      
      setComments(prev => prev.map(c => 
        c.id === editingCommentId ? { ...c, content: editCommentText.trim() } : c
      ));
      setEditingCommentId(null);
      setEditCommentText("");
      toast.success("Comment updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update comment");
    }
  };

  async function handleDeletePost() {
    if (!currentUser || currentUser.id !== post.author_id) return;
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;
      
      toast.success("Post deleted! ️");
      router.navigate({ to: '/app' });
    } catch (err) {
      toast.error("Failed to delete post.");
    }
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.is_build_post) {
      router.navigate({ to: '/app/ship', search: { editId: post.id } });
    } else {
      router.navigate({ to: '/app/compose', search: { editId: post.id } });
    }
  };

  async function handleVerifyBuild() {
    if (!currentUser || !isTutor) return;
    setVerifying(true);
    try {
      // 1. Mark post as verified
      const { error: postError } = await supabase
        .from('posts')
        .update({ is_verified_build: true })
        .eq('id', post.id);
      
      if (postError) throw postError;

      // 2. Reward author with 50 XP (High level reward)
      const { data: authorProfile } = await supabase
        .from('profiles')
        .select('xp')
        .eq('id', post.author_id)
        .single();
      
      if (authorProfile) {
        await supabase
          .from('profiles')
          .update({ xp: (authorProfile.xp || 0) + 50 })
          .eq('id', post.author_id);
      }

      toast.success("Ship verified! Author rewarded with 50 XP");
      router.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to verify build");
    } finally {
      setVerifying(false);
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
        await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', post.author_id);
        setIsFollowing(false);
        toast.success("Unfollowed builder");
      } else {
        await supabase.from('follows').insert([{ follower_id: currentUser.id, following_id: post.author_id }]);
        setIsFollowing(true);
        toast.success("Now following builder!");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleLike() {
    if (!currentUser) {
      toast.error("Sign in to like builds!");
      return;
    }
    const newLiked = !liked;
    setLiked(newLiked);
    try {
      if (newLiked) {
        await likePostAction({ data: { profileId: currentUser.id, postId: post.id } });
      } else {
        await unlikePostAction({ data: { profileId: currentUser.id, postId: post.id } });
      }
      queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      router.invalidate();
    } catch (err: any) {
      setLiked(!newLiked);
      toast.error(`Could not update like: ${err.message || 'Unknown error'}`);
    }
  }

  async function handleRepost(e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    
    if (!currentUser) {
      toast.error("Sign in to repost builds!");
      return;
    }

    const newHasReposted = !hasReposted;
    setHasReposted(newHasReposted);

    try {
      if (newHasReposted) {
        const { error } = await supabase.from('reposts').insert({ profile_id: currentUser.id, post_id: post.id });
        if (error && error.code !== '23505') throw error;
        
        toast.success("Reposted to your feed!");
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
        router.invalidate();
      } else {
        const { error } = await supabase.from('reposts').delete().eq('profile_id', currentUser.id).eq('post_id', post.id);
        if (error) throw error;
        
        toast.success("Removed repost!");
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
        router.invalidate();
      }
    } catch (err) {
      setHasReposted(!newHasReposted);
      toast.error("Could not update repost.");
    }
  }

  async function handleComment() {
    if (!currentUser) {
      toast.error("Sign in to comment!");
      return;
    }
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      const payload: any = { 
        profile_id: currentUser.id, 
        post_id: post.id, 
        content: commentText.trim() 
      };
      
      if (replyTo) {
        payload.parent_id = replyTo.id;
      }

      const { data, error } = await supabase
        .from('comments')
        .insert(payload)
        .select('*, profiles(*)')
        .single();
      
      if (error) throw error;
      setComments([...comments, data]);
      setCommentText("");
      // Reset auto-growing textarea heights in the DOM
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(t => {
        t.style.height = 'auto';
      });
      setReplyTo(null);
      
      // Dispatch event for instant UI update elsewhere
      window.dispatchEvent(new CustomEvent('comment-added', { 
        detail: { postId: post.id } 
      }));

      toast.success(replyTo ? "Reply posted! 💬" : "Comment posted! 💬");
      router.invalidate();
    } catch (err: any) {
      console.error("Comment error:", err);
      toast.error(err.message || "Could not post comment.");
    } finally {
      setCommentLoading(false);
    }
  }

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Check out this build on Zero Club!', url });
      } catch (err) {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  const handleBack = () => {
    if (window.history.length <= 1) {
      router.navigate({ to: "/app" });
    } else {
      window.history.back();
    }
  };

  const initials = (post?.profiles?.full_name || post?.profiles?.username || 'U').substring(0, 1).toUpperCase();

  // Threading helper to build the X-style nested hierarchy
  const getThreadedComments = (flatComments: any[]) => {
    const map = new Map<string, any>();
    const roots: any[] = [];

    // Initialize map
    flatComments.forEach(c => {
      map.set(c.id.toString(), { ...c, replies: [] });
    });

    // Populate replies and roots
    flatComments.forEach(c => {
      const item = map.get(c.id.toString());
      if (c.parent_id && map.has(c.parent_id.toString())) {
        map.get(c.parent_id.toString()).replies.push(item);
      } else {
        roots.push(item);
      }
    });

    const threadedList: any[] = [];

    // Recursively collect all descendants of a root node
    const collectDescendants = (node: any, parent: any, targetArray: any[]) => {
      node.replies.forEach((child: any) => {
        targetArray.push({
          ...child,
          isReply: true,
          parentUsername: node.profiles?.username || 'builder'
        });
        collectDescendants(child, node, targetArray);
      });
    };

    roots.forEach(root => {
      const thread: any[] = [{
        ...root,
        isReply: false,
        parentUsername: null
      }];
      
      collectDescendants(root, null, thread);

      // Set hasMoreInThread for all except the last item in the thread
      thread.forEach((item, index) => {
        item.hasMoreInThread = index < thread.length - 1;
        threadedList.push(item);
      });
    });

    return threadedList;
  };

  const threadedComments = getThreadedComments(comments);

  return (
    <div className="flex fixed inset-0 z-40 flex-col bg-background overflow-hidden">
      <header className="shrink-0 sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border h-[calc(72px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
        <div className="flex h-[72px] items-center justify-between px-4">
        <button onClick={handleBack} className="p-1 transition active:opacity-60">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-[17px] font-bold">Post</h1>
        <div className="flex items-center gap-2">
          {post?.is_verified_build && (
            <div className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-1 text-[9px] font-black uppercase text-success border border-success/20">
              <ShieldCheck className="h-2.5 w-2.5" /> Proof
            </div>
          )}
          {post && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 transition active:opacity-60 outline-none">
                  <MoreHorizontal className="h-6 w-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-xl border-border">
                <DropdownMenuItem 
                  className="flex items-center gap-3 py-2.5 cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied!");
                  }}
                >
                  <LinkIcon className="h-4 w-4" />
                  <span className="font-medium text-sm">Copy Link</span>
                </DropdownMenuItem>
                
                {currentUser && currentUser.id !== post.author_id && (
                  <DropdownMenuItem 
                    className="flex items-center gap-3 py-2.5 cursor-pointer"
                    onClick={handleFollow}
                  >
                    {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    <span className="font-medium text-sm">{isFollowing ? `Unfollow ${getFirstName(post.profiles)}` : `Follow ${getFirstName(post.profiles)}`}</span>
                  </DropdownMenuItem>
                )}

                {isEditable && (
                  <DropdownMenuItem 
                    className="flex items-center gap-3 py-2.5 cursor-pointer text-blue-500 hover:text-blue-600 focus:text-blue-600 font-bold"
                    onClick={handleEditClick}
                  >
                    <Edit3 className="h-4 w-4" />
                    <span className="font-medium text-sm">Edit Post</span>
                  </DropdownMenuItem>
                )}

                {currentUser && currentUser.id === post.author_id && (
                  <DropdownMenuItem 
                    className="flex items-center gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive"
                    onClick={handleDeletePost}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="font-medium text-sm">Delete Post</span>
                  </DropdownMenuItem>
                )}



                <DropdownMenuItem 
                  className="flex items-center gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive"
                  onClick={() => toast.success("Report submitted. Thank you!")}
                >
                  <Flag className="h-4 w-4" />
                  <span className="font-medium text-sm">Report Post</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!post || isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground font-medium">Loading build details...</p>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="px-4 py-4 flex items-center justify-between">
              <Link to="/app/profile/$id" params={{ id: post.author_id }} className="flex items-center gap-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-muted-foreground">
                {post.profiles?.avatar_url ? (
                  <img src={post.profiles.avatar_url} alt={post.profiles.username} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              {post.profiles?.tier === 'Premium' && (
                <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 h-4 w-4 fill-[#cc208f] text-white border-2 border-background rounded-full" />
              )}
              {post.profiles?.tier === 'Premium+' && (
                <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 h-4 w-4 fill-[#ffcf00] text-black border-2 border-background rounded-full" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-bold">{post.profiles?.full_name || post.profiles?.username}</h2>
                {post.is_build_post && (
                  <span className="flex items-center gap-0.5 rounded-full bg-primary/20 px-2 py-0.5 text-[9px] text-primary border border-primary/20">
                    <Rocket className="h-2.5 w-2.5 fill-current" /> Ship
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                @{post.profiles?.username}
                {post.bootcamps && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                    <span className="text-primary font-bold">{post.bootcamps.title}</span>
                  </>
                )}
              </p>
            </div>
          </Link>
          
          {currentUser && currentUser.id !== post.author_id && (
            <button 
              onClick={handleFollow}
              disabled={followLoading}
              className={`rounded-full px-5 py-2 text-sm font-bold transition active:scale-95 flex items-center gap-2 ${
                isFollowing ?"bg-card border border-border text-foreground" : "bg-foreground text-background"
              }`}
            >
              {followLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </section>

        <section className="px-4 py-2">
            <div className="text-[17px] leading-[1.6] text-foreground/90 whitespace-pre-wrap">
              <LinkifiedText text={displayContent || ""} linkColor="text-[#cc208f] hover:underline" />
              {post.updated_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000 && (
                <span className="text-[10px] text-muted-foreground/50 ml-2 font-medium italic">(edited)</span>
              )}
            </div>
          
          {/* Media Grid */}
          {post.media_urls && post.media_urls.length > 0 && (
            <div className={`mt-3 rounded-2xl overflow-hidden transition-colors ${
              post.media_urls.length === 2 
                ?"grid grid-cols-2 gap-0.5 max-h-[320px] border border-white/10 bg-white/5" 
                : "flex justify-start"
            }`}>
              {post.media_urls.slice(0, 2).map((url: string, i: number) => (
                <div 
                  key={i} 
                  className={`relative overflow-hidden rounded-2xl cursor-zoom-in group ${
                    post.media_urls.length === 2 
                      ?"h-[320px] w-full" 
                      : "max-w-full border border-white/10 bg-white/5 transition-colors"
                  }`}
                  onClick={() => setSelectedImageIndex(i)}
                >
                  {isVideoUrl(url) ? (
                    <div className="relative h-full w-full flex items-center justify-center">
                      <video 
                        ref={videoRef}
                        src={url} 
                        className={`rounded-2xl transition duration-300 group-hover:scale-105 ${
                          post.media_urls.length === 2 
                            ?"w-full h-full object-cover" 
                            : "max-w-full max-h-[600px] w-auto h-auto"
                        }`} 
                        autoPlay
                        loop 
                        playsInline
                        muted={isMuted}
                      />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute(e);
                        }}
                        className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition active:scale-95 hover:bg-black/60 z-10"
                      >
                        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : (
                    <img 
                      src={url} 
                      alt={`Post media ${i + 1}`} 
                      className={`rounded-2xl transition duration-300 group-hover:scale-105 ${
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

          {/* Tutor Proof Button */}
          {isTutor && !post.is_verified_build && (
            <div className="mt-8 rounded-3xl bg-primary/5 p-6 border border-dashed border-primary/20 text-center">
              <div className="flex justify-center mb-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Award className="h-6 w-6" />
                </div>
              </div>
              <h3 className="text-sm font-bold text-foreground mb-2">Verify this Ship</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                As the tutor of <span className="text-primary font-bold">{post.bootcamps?.title}</span>, you can verify this build as proof of learning. This will reward the author with XP.
              </p>
              <button 
                onClick={handleVerifyBuild}
                disabled={verifying}
                className="w-full rounded-2xl bg-primary py-4 text-sm font-black text-primary-foreground shadow-glow transition active:scale-95 flex items-center justify-center gap-2"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Mark as Proof
              </button>
            </div>
          )}
        </section>

        <section className="px-4 py-4 border-b border-border/50">
          <div className="flex flex-wrap items-center gap-y-1 gap-x-2 text-xs text-muted-foreground mb-4">
            <span>{new Date(post.created_at).toLocaleString()}</span>
            <span>·</span>
            <span>Zero Club for Builders</span>
            {post.location && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 opacity-60" />
                  {post.location}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center justify-between w-full text-muted-foreground gap-x-2 flex-wrap pr-1 sm:pr-4 mb-6 border-t border-border pt-4">
            <button 
              onClick={() => {
                const inputElement = document.querySelector('input');
                if (inputElement) inputElement.focus();
              }}
              className="flex items-center gap-1.5 transition hover:text-primary active:scale-95 group/btn"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-xs">{comments.length}</span>
            </button>
            <button 
              onClick={handleLike}
              className="flex items-center gap-1.5 transition active:scale-95 group/btn"
            >
              <Heart className={`h-4 w-4 ${liked ?"fill-primary text-primary" : "group-hover/btn:text-primary"}`} />
              <span className={`text-xs ${liked ?"text-primary" : ""}`}>
                {(post.likes_count || 0) + (liked && !initialLiked ? 1 : 0) - (!liked && initialLiked ? 1 : 0)}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className={`flex items-center gap-1.5 transition active:scale-95 ${hasReposted ?'text-success font-bold' : 'hover:text-success'}`}
                >
                  <Repeat className={`h-4 w-4 ${hasReposted ?'text-success font-bold' : ''}`} />
                  <span className="text-xs">{Math.max(0, (post.computed_reposts_count ?? post.reposts_count ?? 0) + (hasReposted && !data?.hasReposted ? 1 : (!hasReposted && data?.hasReposted ? -1 : 0)))}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 bg-background/95 backdrop-blur-xl border-border">
                <DropdownMenuItem className="gap-3 py-3 cursor-pointer" onClick={(e) => handleRepost(e)}>
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
                      search: { quote: post.id } 
                    });
                  }}
                >
                  <Mail className="h-4 w-4" />
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

        </section>

        {/* Comments List */}
        <section className="mt-2 divide-y divide-border/30 px-4 pb-28">
          {threadedComments.map((comment: any) => {
            const isReply = comment.isReply;
            
            return (
              <div 
                key={comment.id} 
                className={`py-4 flex gap-3 relative transition-all duration-300 ${isReply ?"ml-10" : ""}`}
              >
                {/* Curved Connection Line for Replies */}
                {isReply && (
                  <div 
                    className="absolute left-[-22px] top-[-16px] w-[16px] h-[36px] border-l-2 border-b-2 border-border/30 rounded-bl-[12px] pointer-events-none" 
                  />
                )}
                {/* Avatar Container with Thread Line */}
                <div className="flex flex-col items-center shrink-0 relative">
                  <Link 
                    to="/app/profile/$id" 
                    params={{ id: comment.profile_id }} 
                    className="h-9 w-9 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-bold text-muted-foreground transition active:opacity-70 z-10"
                  >
                    {comment.profiles?.avatar_url ? (
                      <img src={comment.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (comment.profiles?.full_name || comment.profiles?.username || 'U').substring(0, 1).toUpperCase()
                    )}
                  </Link>
                  
                  {/* Twitter-style thread line */}
                  {comment.hasMoreInThread && (
                    <div className="absolute top-9 bottom-0 w-[2px] bg-border/40 left-1/2 -translate-x-1/2 z-0" style={{ bottom: '-16px' }} />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link to="/app/profile/$id" params={{ id: comment.profile_id }} className="font-bold text-sm text-foreground hover:underline">{comment.profiles?.full_name || comment.profiles?.username}</Link>
                    <span className="text-xs text-muted-foreground">@{comment.profiles?.username}</span>
                    <span className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleDateString()}</span>
                  </div>
                  
                  {isReply && comment.parentUsername && (
                    <p className="text-[10px] text-[#cc208f] font-bold mb-1">Replying to @{comment.parentUsername}</p>
                  )}

                  {editingCommentId === comment.id ? (
                    <div className="mt-2">
                      <textarea
                        value={editCommentText}
                        onChange={(e) => setEditCommentText(e.target.value)}
                        className="w-full bg-accent/30 rounded-xl border-border/50 text-sm focus:border-primary p-3 min-h-[80px]"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button 
                          onClick={() => setEditingCommentId(null)}
                          className="px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleSaveCommentEdit}
                          className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-full hover:brightness-110 transition-all"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                  )}
                  
                  <div className="mt-2 flex items-center gap-4">
                    <button 
                      onClick={() => handleLikeComment(comment)}
                      className={`text-xs font-bold transition flex items-center gap-1 ${comment.isLiked ?"text-primary" : "text-muted-foreground hover:text-primary"}`}
                    >
                      <Heart className={`h-3 w-3 ${comment.isLiked ?"fill-primary" : ""}`} />
                      {comment.likes_count > 0 ? comment.likes_count : "Like"}
                    </button>
                    <button 
                      onClick={() => {
                        setReplyTo(comment);
                        const inputElement = document.querySelector('input');
                        if (inputElement) inputElement.focus();
                      }}
                      className="text-xs font-bold text-muted-foreground hover:text-primary transition flex items-center gap-1"
                    >
                      <MessageCircle className="h-3 w-3" />
                      Reply
                    </button>

                    <div className="ml-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-muted rounded-full transition-colors">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-xl border-border">
                          <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            toast.success("Comment link copied!");
                          }}>
                            <Send className="h-4 w-4" />
                            <span className="font-medium text-sm">Send</span>
                          </DropdownMenuItem>
                          
                          {currentUser?.id === comment.profile_id && (new Date().getTime() - new Date(comment.created_at).getTime() < 30 * 60 * 1000) && (
                            <DropdownMenuItem 
                              className="flex items-center gap-3 py-2.5 cursor-pointer"
                              onClick={() => handleStartEditComment(comment)}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="font-medium text-sm">Edit Comment</span>
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuItem 
                            className="flex items-center gap-3 py-2.5 cursor-pointer"
                            onClick={() => router.navigate({ to: '/app/chat/$id', params: { id: comment.profile_id } })}
                          >
                            <Mail className="h-4 w-4" />
                            <span className="font-medium text-sm">Message {getFirstName(comment.profiles)}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={() => toast.success(`Now following ${getFirstName(comment.profiles)}!`)}>
                            <UserPlus className="h-4 w-4" />
                            <span className="font-medium text-sm">Follow {getFirstName(comment.profiles)}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => toast.success("Comment reported. Thank you.")}>
                            <Flag className="h-4 w-4" />
                            <span className="font-medium text-sm">Report comment</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {comments.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground italic">Be the first to reply!</p>
            </div>
          )}
        </section>

          </div>
        )}
      </div>

      {/* Static Comment Input Area */}
      {post && !isLoading && (
        <div className="shrink-0 bg-background/95 backdrop-blur-md border-t border-border/50 px-4 pt-3 pb-8 sm:pb-3 z-40">
          {replyTo && (
            <div className="flex items-center justify-between mb-2 px-2 bg-primary/5 rounded-lg py-1.5 border border-primary/10">
              <span className="text-xs text-primary font-medium">Replying to {getFirstName(replyTo.profiles)}</span>
              <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-primary/10 rounded-full">
                <X className="h-3 w-3 text-primary" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="h-9 w-9 shrink-0 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-muted-foreground text-xs mb-0.5">
              {currentUser?.avatar_url ? (
                <img src={currentUser.avatar_url} className="h-full w-full object-cover" />
              ) : (
                (currentUser?.full_name || currentUser?.username || 'U').substring(0, 1).toUpperCase()
              )}
            </div>
            <div className="flex-1 bg-card rounded-2xl border border-border flex items-end pr-1 pb-1 min-h-[44px] focus-within:border-primary/50 transition-colors">
              <textarea 
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  const target = e.target;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
                placeholder={replyTo ? "Post your reply" : "Post your thoughts"}
                rows={1}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground resize-none max-h-32 min-h-[38px] leading-relaxed no-scrollbar"
                style={{ height: 'auto' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleComment();
                  }
                }}
              />
              <button 
                onClick={handleComment}
                disabled={commentLoading || !commentText.trim()}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-95 mb-0.5 mr-0.5 ${
                  commentText.trim() ?'bg-primary text-white' : 'text-muted-foreground bg-muted'
                }`}
              >
                {commentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Fullscreen Image Preview using shared component */}
      <ImageLightbox 
        mediaUrls={post?.media_urls || []} 
        initialIndex={selectedImageIndex || 0} 
        isOpen={selectedImageIndex !== null} 
        onClose={() => setSelectedImageIndex(null)} 
      />
    </div>
  );
}
