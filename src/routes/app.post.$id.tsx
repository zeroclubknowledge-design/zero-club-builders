import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { 
  ChevronLeft, MoreHorizontal, ThumbsUp,
  Repeat, Share2, Send, CheckCircle2, TrendingUp, UserPlus, UserMinus, Loader2, Bookmark,
  MessageSquare, Mail, Flag, EyeOff, ShieldCheck, Award, Zap, Trash2, Link as LinkIcon,
  VolumeX, Volume2, Pencil, Edit3, Rocket, MapPin
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { bookmarkPostAction, unbookmarkPostAction, likePostAction, unlikePostAction } from "@/api";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { useFollow } from "@/hooks/useFollow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ImageLightbox } from "@/components/ImageLightbox";
import { getFirstName } from "@/lib/utils";
import { CommentComposer, CommentContent, buildCommentContent } from "@/components/CommentComposer";
import { fetchPostComments } from "@/features/comments/api";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const findCachedPost = (queryClient: QueryClient, id: string) => {
  const feedPosts = queryClient.getQueryData<any[]>(['feed_posts']) || [];
  const profilePostQueries = queryClient.getQueriesData<any[]>({ queryKey: ['profilePosts'] });
  const profilePosts = profilePostQueries.flatMap(([, posts]) => Array.isArray(posts) ? posts : []);
  const cachedPost = [...feedPosts, ...profilePosts].find((post) => post && (post.id === id || post.original_id === id));

  if (!cachedPost) return null;
  return {
    ...cachedPost,
    // Repost cards have a presentation-only ID. Detail actions must always use
    // the original post ID represented by the route.
    id,
  };
};

const createPostDetailShell = (post: any) => ({
  post: { ...post, computed_reposts_count: post.computed_reposts_count || post.reposts_count || 0 },
  isBookmarked: Boolean(post.isBookmarked),
  isLiked: Boolean(post.isLiked),
  isFollowing: false,
  hasReposted: Boolean(post.hasReposted),
  commentLikes: [] as string[],
});

const fetchPostDetailRecord = async (id: string) => {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (postError) throw postError;
  if (!post) return null;

  const [profileResult, bootcampResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', post.author_id).maybeSingle(),
    post.bootcamp_id
      ? supabase.from('bootcamps').select('*').eq('id', post.bootcamp_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (profileResult.error) console.warn('Post author could not be loaded:', profileResult.error.message);
  if (bootcampResult.error) console.warn('Tagged bootcamp could not be loaded:', bootcampResult.error.message);

  return {
    ...post,
    profiles: profileResult.data || null,
    bootcamps: bootcampResult.data || null,
  };
};

export const Route = createFileRoute("/app/post/$id")({
  loader: async ({ params: { id }, context: { queryClient } }) => {
    const cachedPost = findCachedPost(queryClient, id);
    if (cachedPost) return { post: cachedPost };

    const post = await fetchPostDetailRecord(id);
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
  const { post: loaderPost } = Route.useLoaderData();
  const queryClient = useQueryClient();

  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.includes('video');
  };
  
  const { data, isError } = useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const postData = await fetchPostDetailRecord(id);
      if (!postData) throw new Error('This post or Ship no longer exists.');

      const [bookmarkRes, likeRes, followRes, commentLikesRes, repostRes, totalRepostsRes, totalQuotesRes] = await Promise.all([
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
        isBookmarked: !!bookmarkRes.data,
        isLiked: !!likeRes.data,
        isFollowing: !!followRes.data,
        hasReposted: !!repostRes.data,
        commentLikes: commentLikesRes?.data ? commentLikesRes.data.map((l: any) => l.comment_id) : []
      };
    },
    initialData: loaderPost ? () => createPostDetailShell(loaderPost) : undefined,
    // The route result paints the page immediately. The richer interaction data
    // is deliberately stale so React Query refreshes it without blanking the UI.
    initialDataUpdatedAt: 0,
    placeholderData: () => {
      const post = findCachedPost(queryClient, id);
      return post ? createPostDetailShell(post) : undefined;
    },
    staleTime: 0
  });

  const {
    data: postComments = [],
    isLoading: commentsLoading,
    isError: commentsError,
    refetch: refetchComments,
  } = useQuery({
    queryKey: ['post-comments', id],
    queryFn: () => fetchPostComments(id),
    enabled: Boolean(id),
    staleTime: 10_000,
    retry: 2,
  });

  const post = data?.post;
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null); // Tracks the comment being replied to
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [liked, setLiked] = useState(post?.isLiked || false);
  const [initialLiked, setInitialLiked] = useState(post?.isLiked || false);
  const [isBookmarked, setIsBookmarked] = useState(post?.isBookmarked || false);
  const [hasReposted, setHasReposted] = useState(data?.hasReposted || false);
  const [commentLoading, setCommentLoading] = useState(false);
  const { data: currentUser } = useUser();
  // Shared follow state — stays in sync with the feed, profiles, and every other screen.
  const { isFollowing, loading: followLoading, toggleFollow } = useFollow(post?.author_id);
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
      setLiked(data.isLiked);
      setInitialLiked(data.isLiked);
      setIsBookmarked(data.isBookmarked);
      setHasReposted(data.hasReposted);

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          if (data.post?.is_build_post && data.post.bootcamps) {
            setIsTutor(data.post.bootcamps.creator_id === session.user.id);
          }
        }
      });
    }
  }, [data]);

  useEffect(() => {
    const likedIds = new Set(data?.commentLikes || []);
    setComments(postComments.map((comment: any) => ({
      ...comment,
      isLiked: likedIds.has(comment.id),
      likes_count: comment.likes_count || 0,
    })));
  }, [postComments, data?.commentLikes]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`post-comments:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

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
      void queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
      toast.success("Comment updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update comment");
    }
  };

  const handleDeleteComment = async (comment: any) => {
    if (!currentUser || currentUser.id !== comment.profile_id) return;
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;

    const deletedIds = new Set<string>([String(comment.id)]);
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      comments.forEach((item) => {
        if (item.parent_id && deletedIds.has(String(item.parent_id)) && !deletedIds.has(String(item.id))) {
          deletedIds.add(String(item.id));
          foundChild = true;
        }
      });
    }

    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', comment.id)
        .eq('profile_id', currentUser.id);

      if (error) throw error;

      setComments((current) => current.filter((item) => !deletedIds.has(String(item.id))));
      if (replyTo && deletedIds.has(String(replyTo.id))) setReplyTo(null);
      if (editingCommentId && deletedIds.has(String(editingCommentId))) {
        setEditingCommentId(null);
        setEditCommentText("");
      }
      window.dispatchEvent(new CustomEvent('comment-deleted', {
        detail: { postId: post.id, count: deletedIds.size },
      }));
      void queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
      queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      toast.success("Comment deleted");
    } catch (error: any) {
      toast.error(error.message || "Could not delete comment.");
    }
  };

  const handleToggleCommentFollow = async (comment: any) => {
    if (!currentUser || currentUser.id === comment.profile_id) return;
    const isFollowingCommentAuthor = currentUser.following_ids?.includes(comment.profile_id) || false;

    try {
      if (isFollowingCommentAuthor) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', comment.profile_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert([{ follower_id: currentUser.id, following_id: comment.profile_id }]);
        if (error) throw error;
      }

      queryClient.setQueryData(['profile', 'current'], (old: any) => {
        if (!old) return old;
        const followingIds: string[] = old.following_ids || [];
        return {
          ...old,
          following_ids: isFollowingCommentAuthor
            ? followingIds.filter((userId) => userId !== comment.profile_id)
            : Array.from(new Set([...followingIds, comment.profile_id])),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['profile', comment.profile_id] });
      toast.success(isFollowingCommentAuthor
        ? `Unfollowed ${getFirstName(comment.profiles)}`
        : `Now following ${getFirstName(comment.profiles)}!`);
    } catch (error: any) {
      toast.error(error.message || "Could not update follow.");
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
      // Server-side: marks post verified + rewards author 50 XP,
      // with tutor authorization enforced in the database.
      const { error: verifyError } = await supabase.rpc('verify_build_post', {
        post_id: post.id,
      });

      if (verifyError) throw verifyError;

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
    try {
      const next = await toggleFollow();
      if (next !== null) toast.success(next ? "Now following builder!" : "Unfollowed builder");
    } catch (error: any) {
      toast.error(error.message);
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

  async function handleComment(mediaFiles: File[] = []) {
    if (!currentUser) {
      toast.error("Sign in to comment!");
      return false;
    }
    if (!commentText.trim() && mediaFiles.length === 0) return false;
    setCommentLoading(true);
    try {
      const content = await buildCommentContent(commentText, mediaFiles, currentUser.id);
      const payload: any = { 
        profile_id: currentUser.id, 
        post_id: post.id, 
        content,
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
      setComments((current) => [...current, data]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['post-comments', post.id] }),
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] }),
      ]);
      router.invalidate();
      return true;
    } catch (err: any) {
      console.error("Comment error:", err);
      toast.error(err.message || "Could not post comment.");
      return false;
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
    router.navigate({ to: "/app" });
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
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#f8f7f5] dark:bg-background md:relative md:inset-auto md:z-auto md:h-screen md:min-h-screen">
      <header className="sticky top-0 z-50 h-[calc(72px+env(safe-area-inset-top))] shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[72px] w-full max-w-[860px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button onClick={handleBack} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card transition hover:bg-accent active:opacity-60">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <h1 className="text-[17px] font-semibold tracking-tight">Post</h1>
          </div>
          <div className="flex items-center gap-2">
          {post?.is_verified_build && (
            <div className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-success ring-1 ring-success/20">
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
              <DropdownMenuContent align="end" className="w-56 rounded-lg border-border bg-background shadow-lg">
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

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {!post ? (
          <div className="flex flex-col items-center justify-center py-20">
            {isError ? (
              <>
                <p className="text-sm font-semibold text-foreground">This build could not be loaded.</p>
                <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['post', id] })} className="mt-4 h-9 rounded-md bg-foreground px-4 text-xs font-semibold text-background">Try again</button>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-sm text-muted-foreground font-medium">Loading build details...</p>
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto min-h-full w-full max-w-[860px] border-x border-border bg-background animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                <h2 className="text-[15px] font-semibold tracking-tight">{post.profiles?.full_name || post.profiles?.username}</h2>
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
              className={`flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-semibold tap ${
                isFollowing ? "bg-card ring-1 ring-border text-foreground" : "bg-foreground text-background"
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
            <div className={`mt-3 overflow-hidden rounded-lg transition-colors ${
              post.media_urls.length === 2 
                ? "grid grid-cols-2 gap-0.5 max-h-[320px] ring-1 ring-border bg-muted/40" 
                : "flex justify-start"
            }`}>
              {post.media_urls.slice(0, 2).map((url: string, i: number) => (
                <div 
                  key={i} 
                  className={`group relative cursor-zoom-in overflow-hidden rounded-lg ${
                    post.media_urls.length === 2 
                      ?"h-[320px] w-full" 
                      : "max-w-full ring-1 ring-border bg-muted/40 transition-colors"
                  }`}
                  onClick={() => setSelectedImageIndex(i)}
                >
                  {isVideoUrl(url) ? (
                    <div className="relative h-full w-full flex items-center justify-center">
                      <video 
                        ref={videoRef}
                        src={url} 
                        className={`rounded-lg [clip-path:inset(0_round_0.5rem)] transition duration-300 group-hover:scale-105 ${
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
                        className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/15 flex items-center justify-center text-white tap hover:bg-black/70 z-10"
                      >
                        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : (
                    <img 
                      src={url} 
                      alt={`Post media ${i + 1}`} 
                      className={`rounded-lg transition duration-300 group-hover:scale-105 ${
                        post.media_urls.length === 2 
                          ?"w-full h-full object-cover" 
                          : "max-w-full max-h-[600px] w-auto h-auto"
                      }`} 
                    />
                  )}
                  {post.media_urls.length > 2 && i === 1 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/60">
                      <span className="text-white text-2xl font-semibold tracking-tight">+{post.media_urls.length - 2}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tutor Proof Button */}
          {isTutor && !post.is_verified_build && (
            <div className="mt-8 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Award className="h-6 w-6" />
                </div>
              </div>
              <h3 className="text-[14px] font-semibold tracking-tight text-foreground mb-2">Verify this ship</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                As the tutor of <span className="text-primary font-bold">{post.bootcamps?.title}</span>, you can verify this build as proof of learning. This will reward the author with XP.
              </p>
              <button 
                onClick={handleVerifyBuild}
                disabled={verifying}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-3.5 text-[14px] font-semibold text-background tap hover:opacity-90"
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
                const inputElement = document.querySelector<HTMLTextAreaElement>('[data-comment-composer]');
                if (inputElement) inputElement.focus();
              }}
              className="flex items-center gap-1.5 transition hover:text-primary active:scale-95 group/btn"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs">{comments.length}</span>
            </button>
            <button 
              onClick={handleLike}
              className="flex items-center gap-1.5 transition active:scale-95 group/btn"
            >
              <ThumbsUp className={`h-4 w-4 ${liked ?"fill-primary text-primary" : "group-hover/btn:text-primary"}`} />
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
                  className={`flex items-center gap-1.5 transition active:scale-95 ${hasReposted ? 'text-success' : 'hover:text-success'}`}
                >
                  <Repeat className={`h-4 w-4 ${hasReposted ? 'text-success' : ''}`} />
                  <span className="text-xs">{Math.max(0, (post.computed_reposts_count ?? post.reposts_count ?? 0) + (hasReposted && !data?.hasReposted ? 1 : (!hasReposted && data?.hasReposted ? -1 : 0)))}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 rounded-lg border-border bg-background shadow-lg">
                <DropdownMenuItem className="gap-3 py-3 cursor-pointer" onClick={(e) => handleRepost(e)}>
                  <Repeat className="h-4 w-4" />
                  <span className="font-medium text-sm">{hasReposted ? 'Undo repost' : 'Repost'}</span>
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
                  <span className="font-medium text-sm">Quote</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button 
              onClick={handleBookmark}
              className={`flex items-center gap-1.5 transition active:scale-95 ${isBookmarked ? 'text-primary' : 'hover:text-primary text-muted-foreground'}`}
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

        <div className="flex items-center justify-between border-y border-border/60 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-foreground">Replies</p>
            <p className="text-[10px] text-muted-foreground">Newest activity appears automatically</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {comments.length}
          </span>
        </div>

        {/* Comments List */}
        <section className="mt-2 divide-y divide-border/30 px-4 pb-40">
          {commentsLoading && comments.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] font-medium text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading replies...
            </div>
          )}
          {commentsError && comments.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-[12px] font-medium text-muted-foreground">Replies could not be loaded.</p>
              <button type="button" onClick={() => void refetchComments()} className="mt-3 h-9 rounded-md border border-border px-4 text-[11px] font-semibold hover:bg-accent">Try again</button>
            </div>
          )}
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
                    <Link to="/app/profile/$id" params={{ id: comment.profile_id }} className="font-semibold tracking-tight text-sm text-foreground hover:underline">{comment.profiles?.full_name || comment.profiles?.username}</Link>
                    <span className="text-xs text-muted-foreground">@{comment.profiles?.username}</span>
                    <span className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleDateString()}</span>
                  </div>
                  
                  {isReply && comment.parentUsername && (
                    <p className="text-[10px] text-primary font-medium mb-1">Replying to @{comment.parentUsername}</p>
                  )}

                  {editingCommentId === comment.id ? (
                    <div className="mt-2">
                      <textarea
                        value={editCommentText}
                        onChange={(e) => setEditCommentText(e.target.value)}
                        className="min-h-[80px] w-full rounded-lg border border-border bg-card p-3 text-sm outline-none focus:border-primary"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button 
                          onClick={() => setEditingCommentId(null)}
                          className="px-3 py-1.5 text-xs font-semibold tracking-tight text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleSaveCommentEdit}
                          className="rounded-lg bg-foreground px-4 py-1.5 text-xs font-semibold text-background tap hover:opacity-90"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm leading-relaxed text-foreground/90">
                      <CommentContent content={comment.content} />
                    </div>
                  )}
                  
                  <div className="mt-2 flex items-center gap-4">
                    <button 
                      onClick={() => handleLikeComment(comment)}
                      className={`text-xs font-bold transition flex items-center gap-1 ${comment.isLiked ?"text-primary" : "text-muted-foreground hover:text-primary"}`}
                    >
                      <ThumbsUp className={`h-3 w-3 ${comment.isLiked ?"fill-primary" : ""}`} />
                      {comment.likes_count > 0 ? comment.likes_count : "Like"}
                    </button>
                    <button 
                      onClick={() => {
                        setReplyTo(comment);
                        const inputElement = document.querySelector<HTMLTextAreaElement>('[data-comment-composer]');
                        if (inputElement) inputElement.focus();
                      }}
                      className="text-xs font-bold text-muted-foreground hover:text-primary transition flex items-center gap-1"
                    >
                      <MessageSquare className="h-3 w-3" />
                      Reply
                    </button>

                    <div className="ml-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 hover:bg-muted rounded-full transition-colors">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-lg border-border bg-background shadow-lg">
                          <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            toast.success("Comment link copied!");
                          }}>
                            <Send className="h-4 w-4" />
                            <span className="font-medium text-sm">Send</span>
                          </DropdownMenuItem>
                          
                          {currentUser?.id === comment.profile_id ? (
                            <>
                              <DropdownMenuItem
                                className="flex cursor-pointer items-center gap-3 py-2.5"
                                onClick={() => handleStartEditComment(comment)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="text-sm font-medium">Edit Comment</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="flex cursor-pointer items-center gap-3 py-2.5 text-destructive focus:text-destructive"
                                onClick={() => handleDeleteComment(comment)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="text-sm font-medium">Delete Comment</span>
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem
                                className="flex cursor-pointer items-center gap-3 py-2.5"
                                onClick={() => router.navigate({ to: '/app/chat/$id', params: { id: comment.profile_id } })}
                              >
                                <Mail className="h-4 w-4" />
                                <span className="text-sm font-medium">Message {getFirstName(comment.profiles)}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5" onClick={() => handleToggleCommentFollow(comment)}>
                                {currentUser?.following_ids?.includes(comment.profile_id) ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                                <span className="text-sm font-medium">{currentUser?.following_ids?.includes(comment.profile_id) ? "Unfollow" : "Follow"} {getFirstName(comment.profiles)}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5 text-destructive focus:text-destructive" onClick={() => toast.success("Comment reported. Thank you.")}>
                                <Flag className="h-4 w-4" />
                                <span className="text-sm font-medium">Report comment</span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!commentsLoading && !commentsError && comments.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground italic">Be the first to reply!</p>
            </div>
          )}
        </section>

          </div>
        )}
      </div>

      {/* Floating Comment Composer */}
      {post && (
        <div className="pointer-events-none fixed inset-x-2 bottom-3 z-[60] pb-[env(safe-area-inset-bottom)] sm:inset-x-4 md:absolute md:inset-x-6">
          <div className="pointer-events-auto mx-auto w-full max-w-[830px]">
            <CommentComposer
              value={commentText}
              onChange={setCommentText}
              onSubmit={handleComment}
              loading={commentLoading}
              currentUser={currentUser}
              replyLabel={replyTo ? getFirstName(replyTo.profiles) : null}
              onCancelReply={() => setReplyTo(null)}
              placeholder="Post your reply"
            />
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
