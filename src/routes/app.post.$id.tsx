import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MoreHorizontal, ThumbsUp, Repeat, Send, UserPlus, UserMinus, Loader2, Bookmark, MessageSquare, Mail, Flag, ShieldCheck, Trash2, Link as LinkIcon, VolumeX, Volume2, Pencil, Edit3, Rocket, ArrowLeft, Plus, Quote, BadgeCheck } from "@/components/icons/glyphs";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { likePostAction, unlikePostAction } from "@/api";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { useFollow } from "@/hooks/useFollow";
import { useGoBack } from "@/hooks/useGoBack";
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
import { ComposerOverlay } from "@/components/ComposerOverlay";
import { JoinToInteract } from "@/components/JoinToInteract";
import { fetchPostComments } from "@/features/comments/api";

// Query data is undefined while replies are loading. A fallback created inline
// (`data: postComments = []`) is a different array on every render; because the
// reply-sync effect depends on it and writes another array to state, slower
// clients can enter an update loop before the request finishes (React #185).
const EMPTY_POST_COMMENTS: any[] = [];
const EMPTY_COMMENT_LIKES: string[] = [];

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
  commentLikes: EMPTY_COMMENT_LIKES,
});

/**
 * The same post, read by somebody with no account.
 *
 * Row-level security hides posts from strangers, which is right for the table
 * and wrong for a link that was deliberately shared in public. This asks the
 * database for the read-only view instead, which returns the post, its author
 * and its counts — and nothing that belongs to a member.
 */
const fetchPublicPostRecord = async (id: string) => {
  const { data, error } = await supabase.rpc('get_post_public', { p_post_id: id });
  if (error) return null;

  const payload = data as any;
  if (!payload?.found) return null;

  return {
    ...payload.post,
    profiles: payload.author || null,
    bootcamps: null,
    isPublicView: true,
  };
};

const fetchPostDetailRecord = async (id: string) => {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  // Signed out, or hidden by row-level security. Either way the public reader
  // is the right next thing to try rather than an empty page.
  if (postError || !post) {
    const publicPost = await fetchPublicPostRecord(id);
    if (publicPost) return publicPost;
  }

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
    // The shared link says what it is too, so a project does not arrive in
    // somebody's timeline announced as a post.
    const title = `${authorName}'s ${post.is_build_post ? "Project" : "Post"} on Zero Club`;
    
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

    const image = firstMedia || post.profiles?.avatar_url || "https://www.zeroclubs.xyz/api/og-default";

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
    data: loadedPostComments,
    isLoading: commentsLoading,
    isError: commentsError,
    refetch: refetchComments,
  } = useQuery({
    queryKey: ['post-comments', id],
    queryFn: async () => {
      try {
        return await fetchPostComments(id);
      } catch {
        // Same reasoning as the post itself: a stranger should still see the
        // discussion, they just cannot add to it.
        const { data } = await supabase.rpc('get_post_comments_public', { p_post_id: id });
        return (data as any[]) || [];
      }
    },
    enabled: Boolean(id),
    staleTime: 10_000,
    retry: 2,
  });
  const postComments = loadedPostComments ?? EMPTY_POST_COMMENTS;

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
      .replace(/### 🤖 AI Prompts Used/g, '**AI Prompts Used:**\n')
      // Ships stored before the rename keep saying "Skills Used". Rewriting on
      // the way out means every ship reads the same without touching a single
      // stored row.
      .replace(/\*\*Skills Used:\*\*/g, '**Tools Used:**');
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
    const likedIds = new Set(data?.commentLikes ?? EMPTY_COMMENT_LIKES);
    setComments((current) => {
      if (postComments.length === 0 && current.length === 0) return current;
      return postComments.map((comment: any) => ({
        ...comment,
        isLiked: likedIds.has(comment.id),
        likes_count: comment.likes_count || 0,
      }));
    });
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

  /* Back to wherever this was opened from — ZeroHub, a profile, the feed —
     rather than always the feed. The feed is only the fallback for a link
     opened cold, where there genuinely is no previous page. */
  const handleBack = useGoBack("/app");

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

  const likeCount = (post?.likes_count || 0) + (liked && !initialLiked ? 1 : 0) - (!liked && initialLiked ? 1 : 0);
  const repostCount = Math.max(0, (post?.computed_reposts_count ?? post?.reposts_count ?? 0) + (hasReposted && !data?.hasReposted ? 1 : (!hasReposted && data?.hasReposted ? -1 : 0)));
  const authorRole = post?.profiles?.account_type === 'Institution' ? 'Institution' : post?.profiles?.account_type === 'Tutor' ? 'Tutor' : 'Builder';
  const focusComposer = () => {
    const inputElement = document.querySelector<HTMLTextAreaElement>('[data-comment-composer]');
    if (inputElement) inputElement.focus();
  };
  const actionClass = "flex h-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold tap transition-colors hover:bg-foreground/[0.03]";

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-canvas md:relative md:inset-auto md:z-auto md:h-screen md:min-h-screen">
      <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button onClick={handleBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          {/* A shipped build is a project, and calling its page "Post"
              made the header disagree with everything under it. */}
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">{post?.is_build_post ? "Project" : "Post"}</h1>
          {post && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="More options" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
                  <MoreHorizontal className="h-[22px] w-[22px]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  className="flex items-center gap-3 py-2.5 cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied!");
                  }}
                >
                  <LinkIcon className="h-4 w-4" />
                  <span className="font-medium text-sm">Copy link</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={handleBookmark}>
                  <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
                  <span className="font-medium text-sm">{isBookmarked ? 'Saved' : 'Save'}</span>
                </DropdownMenuItem>
                {currentUser && currentUser.id !== post.author_id && isFollowing && (
                  <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={handleFollow}>
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
                {currentUser && currentUser.id === post.author_id && (
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
                  onClick={() => toast.success("Report submitted. Thank you!")}
                >
                  <Flag className="h-4 w-4" />
                  <span className="font-medium text-sm">Report post</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Room at the bottom for the floating composer, so the last reply can
          be scrolled clear of it rather than ending underneath. */}
      <div className="no-scrollbar flex-1 overflow-y-auto pb-28">
        {!post ? (
          <div className="flex flex-col items-center justify-center py-20">
            {isError ? (
              <>
                <p className="text-[15px] font-semibold text-foreground">This build could not be loaded.</p>
                <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['post', id] })} className="mt-4 h-9 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background">Try again</button>
              </>
            ) : (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="mt-4 text-[14px] text-muted-foreground">Loading…</p>
              </>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[680px] animate-in fade-in duration-300">
            <article className="bg-card md:mt-2 md:overflow-hidden md:rounded-xl md:border md:border-border">
              <header className="flex items-start gap-2.5 px-4 pt-3">
                <Link to="/app/profile/$id" params={{ id: post.author_id }} className="flex min-w-0 flex-1 items-start gap-2.5">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
                    {post.profiles?.avatar_url ? (
                      <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <h2 className="truncate text-[15px] font-semibold tracking-normal text-foreground [font-family:inherit]">{post.profiles?.full_name || post.profiles?.username}</h2>
                      {(post.profiles?.tier === 'Premium' || post.profiles?.tier === 'Premium+') && (
                        <BadgeCheck className={`h-4 w-4 shrink-0 fill-current ${post.profiles.tier === 'Premium+' ? 'text-[#e0a800]' : 'text-accent'}`} />
                      )}
                    </div>
                    <p className="truncate text-[13px] leading-snug text-muted-foreground">
                      {authorRole}{post.profiles?.username ? ` · @${post.profiles.username}` : ''}
                    </p>
                    <p className="flex items-center gap-1 text-[12px] leading-snug text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                      {post.is_build_post && (
                        <>
                          <span aria-hidden>·</span>
                          <Rocket className="h-3.5 w-3.5" /> Shipped a project
                        </>
                      )}
                      {post.bootcamps && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate font-semibold text-foreground">{post.bootcamps.title}</span>
                        </>
                      )}
                    </p>
                  </div>
                </Link>
                {currentUser && currentUser.id !== post.author_id && !isFollowing && (
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className="flex h-8 shrink-0 items-center gap-0.5 text-[14px] font-semibold text-accent tap hover:opacity-80 disabled:opacity-50"
                  >
                    {followLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Follow
                  </button>
                )}
              </header>

              <div className="px-4 pt-3">
                <div className="whitespace-pre-wrap text-[15px] leading-[1.55] text-foreground">
                  <LinkifiedText text={displayContent || ""} linkColor="text-accent hover:underline" />
                  {post.updated_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000 && (
                    <span className="ml-2 text-[12px] text-muted-foreground">(edited)</span>
                  )}
                </div>
                {post.is_verified_build && (
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[12px] font-semibold text-success">
                    <ShieldCheck className="h-3.5 w-3.5 fill-current" /> Verified proof
                  </span>
                )}
              </div>

              {post.media_urls && post.media_urls.length > 0 && (
                <div className={`mt-3 ${post.media_urls.length >= 2 ? "grid grid-cols-2 gap-0.5" : ""}`}>
                  {post.media_urls.slice(0, 2).map((url: string, i: number) => (
                    <div
                      key={i}
                      className={`relative cursor-zoom-in overflow-hidden bg-foreground/[0.04] ${post.media_urls.length >= 2 ? "h-[320px]" : ""}`}
                      onClick={() => setSelectedImageIndex(i)}
                    >
                      {isVideoUrl(url) ? (
                        <div className="relative flex h-full w-full items-center justify-center bg-black">
                          <video
                            ref={videoRef}
                            src={url}
                            className={post.media_urls.length >= 2 ? "h-full w-full object-cover" : "block max-h-[600px] w-full object-contain"}
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
                            aria-label={isMuted ? "Unmute video" : "Mute video"}
                            className="absolute bottom-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md tap hover:bg-black/70"
                          >
                            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                          </button>
                        </div>
                      ) : (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={url}
                          alt={`Post media ${i + 1}`}
                          className={post.media_urls.length >= 2 ? "h-full w-full object-cover" : "mx-auto block max-h-[600px] w-full object-contain"}
                        />
                      )}
                      {post.media_urls.length > 2 && i === 1 && (
                        <div className="absolute inset-0 z-10 grid place-items-center bg-black/55">
                          <span className="text-2xl font-semibold text-white">+{post.media_urls.length - 2}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tutor proof: the tutor of the bootcamp this ship belongs to can verify it. */}
              {isTutor && !post.is_verified_build && (
                <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-success/10 p-3">
                  <ShieldCheck className="h-[22px] w-[22px] shrink-0 text-success" />
                  <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
                    You tutor <b>{post.bootcamps?.title}</b>. Verify this ship as proof of learning — the author earns XP.
                  </p>
                  <button
                    onClick={handleVerifyBuild}
                    disabled={verifying}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-success px-3.5 text-[14px] font-semibold text-success-foreground tap disabled:opacity-60"
                  >
                    {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                    Verify
                  </button>
                </div>
              )}

              {(likeCount > 0 || comments.length > 0 || repostCount > 0) && (
                <div className="flex items-center justify-between gap-3 px-4 pt-2.5 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {likeCount > 0 && (
                      <>
                        <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-accent text-accent-foreground">
                          <ThumbsUp className="h-2.5 w-2.5 fill-current" />
                        </span>
                        <span className="tabular-nums">
                          {liked ? (likeCount > 1 ? `You and ${likeCount - 1} other${likeCount - 1 === 1 ? '' : 's'}` : 'You') : likeCount}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {[comments.length > 0 && `${comments.length} ${comments.length === 1 ? 'reply' : 'replies'}`, repostCount > 0 && `${repostCount} repost${repostCount === 1 ? '' : 's'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              )}

              <div className="mx-4 mt-2.5 h-px bg-border" />
              <div className="grid h-[52px] grid-cols-4 text-muted-foreground">
                <button onClick={handleLike} aria-pressed={liked} className={`${actionClass} ${liked ? 'text-accent' : 'hover:text-foreground'}`}>
                  <ThumbsUp className={`h-5 w-5 ${liked ? 'fill-current' : ''}`} />
                  {liked ? 'Liked' : 'Like'}
                </button>
                <button onClick={focusComposer} className={`${actionClass} hover:text-foreground`}>
                  <MessageSquare className="h-5 w-5" />
                  Reply
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className={`${actionClass} ${hasReposted ? 'text-accent' : 'hover:text-foreground'}`}
                    >
                      <Repeat className="h-5 w-5" />
                      {hasReposted ? 'Reposted' : 'Repost'}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-48">
                    <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onClick={(e) => handleRepost(e)}>
                      <Repeat className="h-4 w-4" />
                      <span className="font-medium text-sm">{hasReposted ? 'Undo repost' : 'Repost'}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-3 py-2.5 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.navigate({ to: '/app/compose', search: { quote: post.id } });
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
              </div>
            </article>

            <section className="mt-2 bg-card px-4 pb-40 pt-3 md:rounded-xl md:border md:border-border">
              <h2 className="font-display text-[16px] font-semibold text-foreground">
                Replies{comments.length > 0 && <span className="ml-1.5 text-muted-foreground">{comments.length}</span>}
              </h2>
              {commentsLoading && comments.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading replies…
                </div>
              )}
              {commentsError && comments.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-muted-foreground">Replies could not be loaded.</p>
                  <button type="button" onClick={() => void refetchComments()} className="mt-3 h-8 rounded-full border border-border px-4 text-[14px] font-semibold hover:bg-foreground/[0.04]">Try again</button>
                </div>
              )}
              {threadedComments.map((comment: any) => {
                const isReply = comment.isReply;
                const isAuthor = comment.profile_id === post.author_id;
                return (
                  <div key={comment.id} className={`mt-3 flex gap-2 ${isReply ? "ml-12" : ""}`}>
                    <Link
                      to="/app/profile/$id"
                      params={{ id: comment.profile_id }}
                      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] font-semibold text-muted-foreground ${isReply ? "h-8 w-8 text-[12px]" : "h-10 w-10 text-[13px]"}`}
                    >
                      {comment.profiles?.avatar_url ? (
                        <img src={comment.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        (comment.profiles?.full_name || comment.profiles?.username || 'U').substring(0, 1).toUpperCase()
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="rounded-[4px_12px_12px_12px] bg-foreground/[0.05] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <Link to="/app/profile/$id" params={{ id: comment.profile_id }} className="flex min-w-0 items-center gap-1.5 hover:underline">
                            <span className="truncate text-[14px] font-semibold text-foreground">{comment.profiles?.full_name || comment.profiles?.username}</span>
                            {isAuthor && <span className="shrink-0 rounded bg-foreground px-1.5 text-[11px] font-semibold text-background">Author</span>}
                          </Link>
                          <span className="shrink-0 text-[12px] text-muted-foreground">
                            {new Date(comment.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        {comment.profiles?.username && <p className="text-[12px] text-muted-foreground">@{comment.profiles.username}</p>}
                        {editingCommentId === comment.id ? (
                          <div className="mt-2">
                            <textarea
                              value={editCommentText}
                              onChange={(e) => setEditCommentText(e.target.value)}
                              className="min-h-[80px] w-full rounded-lg border border-border bg-card p-3 text-[14px] outline-none focus:border-foreground/40"
                              autoFocus
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button onClick={() => setEditingCommentId(null)} className="h-8 px-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
                                Cancel
                              </button>
                              <button onClick={handleSaveCommentEdit} className="h-8 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background tap hover:opacity-90">
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 text-[14px] leading-[1.45] text-foreground">
                            <CommentContent content={comment.content} />
                          </div>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-4 pl-3 text-[12px] font-semibold text-muted-foreground">
                        <button onClick={() => handleLikeComment(comment)} className={comment.isLiked ? "text-accent" : "hover:text-foreground"}>
                          {comment.isLiked ? "Liked" : "Like"}{comment.likes_count > 0 ? ` · ${comment.likes_count}` : ""}
                        </button>
                        <button
                          onClick={() => {
                            setReplyTo(comment);
                            focusComposer();
                          }}
                          className="hover:text-foreground"
                        >
                          Reply
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button aria-label="Reply options" className="ml-auto grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/[0.05] hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={() => {
                              navigator.clipboard.writeText(window.location.href);
                              toast.success("Comment link copied!");
                            }}>
                              <Send className="h-4 w-4" />
                              <span className="font-medium text-sm">Send</span>
                            </DropdownMenuItem>
                            {currentUser?.id === comment.profile_id ? (
                              <>
                                <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5" onClick={() => handleStartEditComment(comment)}>
                                  <Pencil className="h-4 w-4" />
                                  <span className="text-sm font-medium">Edit reply</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5 text-destructive focus:text-destructive" onClick={() => handleDeleteComment(comment)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="text-sm font-medium">Delete reply</span>
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5" onClick={() => router.navigate({ to: '/app/chat/$id', params: { id: comment.profile_id } })}>
                                  <Mail className="h-4 w-4" />
                                  <span className="text-sm font-medium">Message {getFirstName(comment.profiles)}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5" onClick={() => handleToggleCommentFollow(comment)}>
                                  {currentUser?.following_ids?.includes(comment.profile_id) ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                                  <span className="text-sm font-medium">{currentUser?.following_ids?.includes(comment.profile_id) ? "Unfollow" : "Follow"} {getFirstName(comment.profiles)}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5 text-destructive focus:text-destructive" onClick={() => toast.success("Comment reported. Thank you.")}>
                                  <Flag className="h-4 w-4" />
                                  <span className="text-sm font-medium">Report reply</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!commentsLoading && !commentsError && comments.length === 0 && (
                <p className="py-10 text-center text-[14px] text-muted-foreground">No replies yet. Start the conversation.</p>
              )}
            </section>
          </div>
        )}
      </div>

      {/* The composer floats over the replies. Absolute rather than fixed, so
          it stays inside this page's column and off the desktop sidebar. */}
      {/* A stranger gets the way in where a member gets the reply box. The
          composer would only fail on submit, which is a worse way to learn
          that an account is needed. */}
      {post && !currentUser && <JoinToInteract what="reply" />}

      {post && currentUser && (
        <ComposerOverlay position="absolute" maxWidthClassName="max-w-[860px]">
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
        </ComposerOverlay>
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
