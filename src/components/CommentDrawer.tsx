import { useState, useEffect, useRef } from "react";
import {
  Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle
} from "@/components/ui/drawer";
import { MessageCircle, Send, MoreHorizontal, Mail, UserPlus, Flag, EyeOff, Plus, Pencil, Loader2, Trash2, X, ThumbsUp, ThumbsDown, MessageSquare, SlidersHorizontal, Check } from "@/components/icons/solar";
import { useRouter, Link } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { getFirstName } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus } from "@/components/icons/solar";
import { CommentComposer, CommentContent, buildCommentContent } from "@/components/CommentComposer";
import { fetchPostComments } from "@/features/comments/api";

interface CommentDrawerProps {
  post: any;
  type?: 'post' | 'note';
  isOpen?: boolean;
  inline?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onCommentAdded?: () => void;
}

const commentCache = new Map<string, { comments: any[]; cachedAt: number }>();
type CommentSort = "top" | "newest";

export function CommentDrawer({ post: incomingPost, type = 'post', isOpen = false, inline = false, onClose, onOpenChange, onCommentAdded }: CommentDrawerProps) {
  const handleOpenChange = (open: boolean) => {
    onOpenChange?.(open);
    if (!open) onClose?.();
  };
  const [savedPost, setSavedPost] = useState(incomingPost);

  useEffect(() => {
    if (incomingPost) {
      setSavedPost(incomingPost);
    }
  }, [incomingPost]);

  const post = incomingPost || savedPost;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [activePickerId, setActivePickerId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [commentSort, setCommentSort] = useState<CommentSort>("top");
  const { data: currentUser } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fetchRequestRef = useRef(0);

  const updateComments = (updater: (current: any[]) => any[]) => {
    setComments(current => {
      const next = updater(current);
      if (post) {
        const cacheKey = `${type}:${post.original_id || post.id}`;
        commentCache.set(cacheKey, { comments: next, cachedAt: Date.now() });
      }
      return next;
    });
  };

  const { data: followedUserIds, refetch: refetchFollowedUserIds } = useQuery({
    queryKey: ['followed_users', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const { data } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUser.id);
      return data?.map(f => f.following_id) || [];
    },
    enabled: !!currentUser?.id
  });

  useEffect(() => {
    if ((isOpen || inline) && post) {
      const postId = post.original_id || post.id;
      const cacheKey = `${type}:${postId}`;
      const cached = commentCache.get(cacheKey);

      if (cached) setComments(cached.comments);
      else setComments([]);

      // Render cached comments immediately, then always revalidate. A notification
      // can arrive while an empty cache entry is still considered fresh.
      void fetchComments(cacheKey, !cached);
    }
    if (!isOpen && !inline) {
      setReplyTo(null);
      setNewComment("");
      setEditingCommentId(null);
    }
  }, [isOpen, inline, post?.id, post?.original_id, type]);

  useEffect(() => {
    if ((!isOpen && !inline) || !post) return;

    const postId = post.original_id || post.id;
    const table = type === 'note' ? 'note_comments' : 'comments';
    const idColumn = type === 'note' ? 'note_id' : 'post_id';
    const cacheKey = `${type}:${postId}`;
    const channel = supabase
      .channel(`comment-drawer:${type}:${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `${idColumn}=eq.${postId}`,
        },
        () => {
          void fetchComments(cacheKey, false);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isOpen, inline, post?.id, post?.original_id, type]);

  const fetchComments = async (cacheKey: string, showLoading: boolean) => {
    const requestId = ++fetchRequestRef.current;
    if (showLoading) setCommentsLoading(true);

    const postId = post.original_id || post.id;
    const [sessionResult, commentsResult] = await Promise.all([
      supabase.auth.getSession(),
      type === 'note'
        ? supabase
            .from('note_comments')
            .select('*, profiles(username, full_name, avatar_url)')
            .eq('note_id', postId)
            .order('created_at', { ascending: true })
        : fetchPostComments(postId)
            .then((data) => ({ data, error: null }))
            .catch((error) => ({ data: null, error })),
    ]);

    const session = sessionResult.data.session;
    const { data, error } = commentsResult;

    if (!error && data) {
      const commentIds = data.map(c => c.id);
      const emptyResult = Promise.resolve({ data: [] as any[] });
      const [reactionResult, likesResult] = await Promise.all([
        commentIds.length > 0
          ? supabase.from(type === 'note' ? 'note_comment_reactions' : 'comment_reactions').select('*').in('comment_id', commentIds)
          : emptyResult,
        session && commentIds.length > 0
          ? supabase
              .from(type === 'note' ? 'note_comment_likes' : 'comment_likes')
              .select('comment_id')
              .eq('profile_id', session.user.id)
              .in('comment_id', commentIds)
          : emptyResult
      ]);

      const reactionsByComment = new Map<string, any[]>();
      for (const reaction of reactionResult.data || []) {
        const existing = reactionsByComment.get(reaction.comment_id) || [];
        existing.push(reaction);
        reactionsByComment.set(reaction.comment_id, existing);
      }

      const likedIds = new Set((likesResult.data || []).map(like => like.comment_id));
      const nextComments = data.map(comment => ({
        ...comment,
        isLiked: likedIds.has(comment.id),
        likes_count: comment.likes_count || 0,
        reactions: reactionsByComment.get(comment.id) || []
      }));

      commentCache.set(cacheKey, { comments: nextComments, cachedAt: Date.now() });
      if (requestId === fetchRequestRef.current) setComments(nextComments);
    } else if (error) {
      console.error("Comments could not be loaded:", error);
      if (requestId === fetchRequestRef.current && comments.length === 0) {
        toast.error("Comments could not be loaded. Please try again.");
      }
    }

    if (requestId === fetchRequestRef.current) setCommentsLoading(false);
  };

  const handleReactComment = async (commentId: string, emoji: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Sign in to react!");
      return;
    }

    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    const existingReaction = comment.reactions?.find((r: any) => r.profile_id === session.user.id && r.emoji === emoji);

    if (existingReaction) {
      updateComments(prev => prev.map(c => c.id === commentId ? { ...c, reactions: c.reactions.filter((r: any) => r.id !== existingReaction.id) } : c));
      await supabase.from(type === 'note' ? 'note_comment_reactions' : 'comment_reactions').delete().eq('id', existingReaction.id);
    } else {
      const tempId = crypto.randomUUID();
      updateComments(prev => prev.map(c => c.id === commentId ? { ...c, reactions: [...(c.reactions || []), { id: tempId, comment_id: commentId, profile_id: session.user.id, emoji }] } : c));
      await supabase.from(type === 'note' ? 'note_comment_reactions' : 'comment_reactions').insert([{ comment_id: commentId, profile_id: session.user.id, emoji }]);
    }
  };

  const handleLikeComment = async (comment: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Sign in to like comments!");
      return;
    }

    const isLiked = comment.isLiked;
    const newLiked = !isLiked;

    // Optimistic update
    updateComments(prev => prev.map(c =>
      c.id === comment.id 
        ? { ...c, isLiked: newLiked, likes_count: (c.likes_count || 0) + (newLiked ? 1 : -1) } 
        : c
    ));

    try {
      if (newLiked) {
        const { error } = await supabase
          .from(type === 'note' ? 'note_comment_likes' : 'comment_likes')
          .insert({ comment_id: comment.id, profile_id: session.user.id });
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase
          .from(type === 'note' ? 'note_comment_likes' : 'comment_likes')
          .delete()
          .eq('comment_id', comment.id)
          .eq('profile_id', session.user.id);
        if (error) throw error;
      }
    } catch (err: any) {
      // Revert on error
      updateComments(prev => prev.map(c =>
        c.id === comment.id 
          ? { ...c, isLiked: isLiked, likes_count: comment.likes_count } 
          : c
      ));
      toast.error("Could not update like.");
    }
  };

  const handleStartEditComment = (comment: any) => {
    setEditingCommentId(comment.id);
    setEditCommentText(comment.content);
  };

  const handleSaveCommentEdit = async () => {
    if (!editingCommentId || !editCommentText.trim()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from(type === 'note' ? 'note_comments' : 'comments')
        .update({ content: editCommentText.trim() })
        .eq('id', editingCommentId)
        .eq('profile_id', session.user.id);
      
      if (error) throw error;
      
      updateComments(prev => prev.map(c =>
        c.id === editingCommentId ? { ...c, content: editCommentText.trim() } : c
      ));
      setEditingCommentId(null);
      setEditCommentText("");
      toast.success("Comment updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update comment");
    }
  };

  const handleSubmit = async (mediaFiles: File[] = []) => {
    if ((!newComment.trim() && mediaFiles.length === 0) || loading) return false;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Sign in to comment!");
      return false;
    }

    setLoading(true);
    let content: string;
    try {
      content = await buildCommentContent(newComment, mediaFiles, session.user.id);
    } catch (error: any) {
      setLoading(false);
      toast.error(error.message || "Could not upload comment media.");
      return false;
    }
    const payload: any = {
      [type === 'note' ? 'note_id' : 'post_id']: post.original_id || post.id,
      profile_id: session.user.id,
      content,
    };

    if (replyTo) {
      payload.parent_id = replyTo.id;
    }

    const { data, error } = await supabase
      .from(type === 'note' ? 'note_comments' : 'comments')
      .insert(payload)
      .select('*, profiles(username, full_name, avatar_url)')
      .single();

    setLoading(false);
    if (error) {
      toast.error(error.message || "Could not post comment.");
      return false;
    } else {
      updateComments(current => [...current, { ...data, isLiked: false, likes_count: data.likes_count || 0, reactions: [] }]);
      setNewComment("");
      // Reset auto-growing textarea heights in the DOM
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(t => {
        t.style.height = 'auto';
      });
      setReplyTo(null);
      
      // Dispatch event for instant UI update
      window.dispatchEvent(new CustomEvent('comment-added', { 
        detail: { postId: post.original_id || post.id } 
      }));

      if (onCommentAdded) onCommentAdded();
      toast.success(replyTo ? "Reply posted! 💬" : "Comment posted! 💬");
      
      if (type === 'post') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['post', post.original_id || post.id] }),
          queryClient.invalidateQueries({ queryKey: ['feed_posts'] }),
        ]);
        void fetchComments(`${type}:${post.original_id || post.id}`, false);
      }

      // Auto-scroll to bottom to show the new comment
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 100);
      return true;
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
        .from(type === 'note' ? 'note_comments' : 'comments')
        .delete()
        .eq('id', comment.id)
        .eq('profile_id', currentUser.id);

      if (error) throw error;

      updateComments((current) => current.filter((item) => !deletedIds.has(String(item.id))));
      if (replyTo && deletedIds.has(String(replyTo.id))) setReplyTo(null);
      if (editingCommentId && deletedIds.has(String(editingCommentId))) {
        setEditingCommentId(null);
        setEditCommentText("");
      }

      if (type === 'post') {
        window.dispatchEvent(new CustomEvent('comment-deleted', {
          detail: { postId: post.original_id || post.id, count: deletedIds.size },
        }));
      }
      toast.success("Comment deleted");
    } catch (error: any) {
      toast.error(error.message || "Could not delete comment.");
    }
  };

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

    const countDescendants = (node: (typeof roots)[number]): number =>
      node.replies.reduce(
        (total: number, reply: typeof node) => total + 1 + countDescendants(reply),
        0,
      );

    roots.sort((a, b) => {
      if (commentSort === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      const score = (comment: (typeof roots)[number]) =>
        Number(comment.likes_count || 0) +
        Number(comment.reactions?.length || 0) +
        countDescendants(comment) * 2;
      return score(b) - score(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

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

  if (!post) return null;

  const commentSortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Sort comments"
        >
          <SlidersHorizontal className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">{commentSort === "top" ? "Top" : "Newest"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-md border-border bg-background p-1 shadow-xl">
        <DropdownMenuItem
          className="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5"
          onClick={() => setCommentSort("top")}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Top</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">Show the most useful conversations first</p>
          </div>
          {commentSort === "top" && <Check className="mt-0.5 h-4 w-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5"
          onClick={() => setCommentSort("newest")}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Newest</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">Show the most recent comments first</p>
          </div>
          {commentSort === "newest" && <Check className="mt-0.5 h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const DrawerInner = (
    <>
      {inline ? (
        <div className="mt-8 flex shrink-0 items-center justify-between border-b border-border py-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[18px] font-semibold">Discussion</h3>
            <span className="text-xs text-muted-foreground">{comments.length}</span>
          </div>
          {commentSortMenu}
        </div>
      ) : (
        <DrawerHeader className="flex h-14 shrink-0 flex-row items-center justify-between border-b border-border px-4 py-0 text-left sm:px-5">
          <div className="flex items-baseline gap-2">
            <DrawerTitle className="text-[17px] font-semibold">Comments</DrawerTitle>
            <span className="text-xs text-muted-foreground">{comments.length}</span>
          </div>
          <div className="flex items-center gap-1">
            {commentSortMenu}
            <DrawerClose className="grid h-9 w-9 place-items-center rounded-md transition-colors hover:bg-muted active:opacity-60">
              <X className="h-5 w-5" />
              <span className="sr-only">Close comments</span>
            </DrawerClose>
          </div>
        </DrawerHeader>
      )}

      <div className={`flex flex-col flex-1 ${inline ?'w-full' : 'min-h-0'}`}>
          <div ref={scrollRef} vaul-scrollable="" className={`${inline ?'space-y-4 py-5' : 'no-scrollbar flex-1 space-y-4 overflow-y-auto px-3 pb-32 pt-4 sm:px-5'}`}>
            {commentsLoading && threadedComments.length === 0 ? (
              <div className="space-y-5 py-1" aria-label="Loading comments">
                {[0, 1, 2].map(item => (
                  <div key={item} className="flex animate-pulse gap-3 border-b border-border/60 pb-5 last:border-0">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2.5 pt-0.5">
                      <div className="h-3 w-28 rounded bg-muted" />
                      <div className="h-3 w-full rounded bg-muted" />
                      <div className="h-3 w-3/5 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : threadedComments.length > 0 ? (
              threadedComments.map((comment) => {
                const isReply = comment.isReply;
                
                const groupedReactions = comment.reactions?.reduce((acc: any, r: any) => {
                  acc[r.emoji] = acc[r.emoji] || { count: 0, me: false };
                  acc[r.emoji].count++;
                  if (r.profile_id === currentUser?.id) acc[r.emoji].me = true;
                  return acc;
                }, {}) || {};
                const dislikeReaction = groupedReactions["👎"];
                const visibleReactions = Object.entries(
                  groupedReactions as Record<string, { count: number; me: boolean }>,
                ).filter(([emoji]) => emoji !== "👎");
                
                return (
                  <div 
                    key={comment.id} 
                    className={`relative flex gap-2.5 pb-4 transition-all duration-300 ${isReply ?"ml-6" : ""}`}
                  >
                    {/* Curved Connection Line for Replies */}
                    {isReply && (
                      <div 
                        className="pointer-events-none absolute left-[-15px] top-[-14px] h-[28px] w-[11px] rounded-bl-[8px] border-b border-l border-border/50"
                      />
                    )}
                    {/* Avatar Container with Thread Line */}
                    <div className="flex flex-col items-center shrink-0 relative">
                      <Link 
                        to="/app/profile/$id" 
                        params={{ id: comment.profile_id }}
                        className="z-10 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold text-muted-foreground transition active:opacity-70"
                      >
                        {comment.profiles?.avatar_url ? (
                          <img src={comment.profiles.avatar_url} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-bold text-[10px] text-muted-foreground">
                            {comment.profiles?.username?.substring(0,1).toUpperCase()}
                          </div>
                        )}
                      </Link>

                      {/* Twitter-style thread line */}
                      {comment.hasMoreInThread && (
                        <div className="absolute top-7 bottom-0 left-1/2 z-0 w-px -translate-x-1/2 bg-border/50" style={{ bottom: '-20px' }} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
                        <Link 
                          to="/app/profile/$id" 
                          params={{ id: comment.profile_id }}
                          className="truncate text-[12px] font-semibold text-foreground hover:underline"
                        >
                          {comment.profiles?.full_name || comment.profiles?.username}
                        </Link>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {isReply && comment.parentUsername && (
                        <p className="text-[10px] text-[#cc208f] font-bold mb-1">Replying to @{comment.parentUsername}</p>
                      )}
                      
                      {editingCommentId === comment.id ? (
                        <div className="mt-2 mb-2">
                          <textarea
                            value={editCommentText}
                            onChange={(e) => setEditCommentText(e.target.value)}
                            className="min-h-[80px] w-full rounded-lg border border-border bg-card p-3 text-sm outline-none focus:border-primary"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button 
                              onClick={() => setEditingCommentId(null)}
                              className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={handleSaveCommentEdit}
                              className="rounded-lg bg-primary px-4 py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-1.5 text-[13px] leading-[1.45] text-foreground/85">
                          <CommentContent content={comment.content} />
                        </div>
                      )}
                      
                      <div className="relative mt-2 flex items-center gap-5">
                          <button 
                            onClick={() => handleLikeComment(comment)}
                            className={`flex min-h-7 items-center gap-1.5 text-[11px] font-medium transition ${comment.isLiked ?"text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            aria-label={comment.isLiked ? "Unlike comment" : "Like comment"}
                          >
                            <ThumbsUp className={`h-[17px] w-[17px] ${comment.isLiked ?"fill-current" : ""}`} />
                            {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
                          </button>

                          <button
                            onClick={() => handleReactComment(comment.id, "👎")}
                            className={`flex min-h-7 items-center gap-1.5 text-[11px] font-medium transition ${dislikeReaction?.me ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            aria-label={dislikeReaction?.me ? "Remove dislike" : "Dislike comment"}
                          >
                            <ThumbsDown className={`h-[17px] w-[17px] ${dislikeReaction?.me ? "fill-current" : ""}`} />
                            {dislikeReaction?.count > 0 && <span>{dislikeReaction.count}</span>}
                          </button>
                          
                          <button 
                            onClick={() => setReplyTo(comment)}
                            className="flex min-h-7 items-center text-muted-foreground transition hover:text-foreground"
                            aria-label="Reply to comment"
                          >
                            <MessageSquare className="h-[17px] w-[17px]" />
                          </button>



                          <div className="ml-auto">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 hover:bg-foreground/[0.06] rounded-full transition-colors">
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
                                    onClick={() => router.navigate({ to: `/app/chat/${comment.profile_id}` })}
                                  >
                                    <Mail className="h-4 w-4" />
                                    <span className="text-sm font-medium">Message {getFirstName(comment.profiles)}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5" onClick={async () => {
                                    if (!currentUser) return;
                                    const isFollowing = followedUserIds?.includes(comment.profile_id);
                                    try {
                                      if (isFollowing) {
                                        const { error } = await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', comment.profile_id);
                                        if (error) throw error;
                                        toast.success(`Unfollowed ${getFirstName(comment.profiles)}`);
                                      } else {
                                        const { error } = await supabase.from('follows').insert([{ follower_id: currentUser.id, following_id: comment.profile_id }]);
                                        if (error) throw error;
                                        toast.success(`Now following ${getFirstName(comment.profiles)}!`);
                                      }
                                      await refetchFollowedUserIds();
                                    } catch (error: any) {
                                      toast.error(error.message || "Could not update follow.");
                                    }
                                  }}>
                                    {followedUserIds?.includes(comment.profile_id) ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                                    <span className="text-sm font-medium">{followedUserIds?.includes(comment.profile_id) ? "Unfollow" : "Follow"} {getFirstName(comment.profiles)}</span>
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
                      {/* Reactions display */}
                      {visibleReactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {visibleReactions.map(([emoji, data]) => (
                            <button
                              key={emoji}
                              onClick={() => handleReactComment(comment.id, emoji)}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold transition-colors ${
                                data.me ? 'bg-primary/15 border-primary/25 text-primary' : 'bg-foreground/[0.04] border-transparent text-muted-foreground hover:bg-foreground/[0.08]'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span>{data.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                </div>
                );
              })
            ) : (
              <div className="text-center py-10">
                <MessageCircle className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No comments yet. Start the conversation!</p>
              </div>
            )}
          </div>

          <div className={`${inline ?'fixed bottom-3 left-1/2 z-50 w-[calc(100%-20px)] max-w-[740px] -translate-x-1/2 pb-[env(safe-area-inset-bottom)]' : 'pointer-events-none absolute inset-x-2 bottom-2 z-20 pb-[env(safe-area-inset-bottom)] sm:inset-x-4 sm:bottom-4'}`}>
            <div className="pointer-events-auto">
              <CommentComposer
                value={newComment}
                onChange={setNewComment}
                onSubmit={handleSubmit}
                loading={loading}
                currentUser={currentUser}
                replyLabel={replyTo ? getFirstName(replyTo.profiles) : null}
                onCancelReply={() => setReplyTo(null)}
                placeholder={replyTo ? "Post your reply" : "Post your thoughts"}
              />
            </div>
          </div>
        {inline && <div className="h-28 shrink-0" /> /* Padding for the floating composer */}
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-col w-full flex-1">
        {DrawerInner}
      </div>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={handleOpenChange} shouldScaleBackground={false} repositionInputs={false}>
      <DrawerContent desktopVariant="panel" hideClose hideHandle className="mx-auto flex h-[72dvh] max-w-[760px] flex-col overflow-hidden border border-border bg-background p-0 shadow-xl focus:outline-none md:h-[85dvh]">
        {DrawerInner}
      </DrawerContent>
    </Drawer>
  );
}
