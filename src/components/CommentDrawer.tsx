import { useState, useEffect, useRef } from "react";
import { 
  Drawer, DrawerContent, DrawerHeader, DrawerTitle 
} from "@/components/ui/drawer";
import { MessageCircle, Send, X, MoreHorizontal, Heart, Mail, UserPlus, Flag, EyeOff, Plus, Pencil, Loader2 } from "lucide-react";
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
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";

interface CommentDrawerProps {
  post: any;
  type?: 'post' | 'note';
  isOpen?: boolean;
  inline?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onCommentAdded?: () => void;
}

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
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [activePickerId, setActivePickerId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const { data: currentUser } = useUser();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: followedUserIds } = useQuery({
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
      setComments([]); // clear instantly to avoid ghosting previous chat
      fetchComments();
    }
    if (!isOpen && !inline) {
      setReplyTo(null);
      setNewComment("");
      setEditingCommentId(null);
    }
  }, [isOpen, inline, post?.id]);

  const fetchComments = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase
      .from(type === 'note' ? 'note_comments' : 'comments')
      .select('*, profiles(username, full_name, avatar_url)')
      .eq(type === 'note' ? 'note_id' : 'post_id', post.original_id || post.id)
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      const commentIds = data.map(c => c.id);
      const { data: rxns } = commentIds.length > 0 
        ? await supabase.from(type === 'note' ? 'note_comment_reactions' : 'comment_reactions').select('*').in('comment_id', commentIds) 
        : { data: [] };

      if (session) {
        const { data: userLikes } = await supabase
          .from(type === 'note' ? 'note_comment_likes' : 'comment_likes')
          .select('comment_id')
          .eq('profile_id', session.user.id);
        
        const likedIds = new Set(userLikes?.map(l => l.comment_id) || []);
        setComments(data.map(c => ({ 
          ...c, 
          isLiked: likedIds.has(c.id),
          likes_count: c.likes_count || 0,
          reactions: rxns?.filter(r => r.comment_id === c.id) || []
        })));
      } else {
        setComments(data.map(c => ({ 
          ...c, 
          likes_count: c.likes_count || 0,
          reactions: rxns?.filter(r => r.comment_id === c.id) || []
        })));
      }
    }
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
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, reactions: c.reactions.filter((r: any) => r.id !== existingReaction.id) } : c));
      await supabase.from(type === 'note' ? 'note_comment_reactions' : 'comment_reactions').delete().eq('id', existingReaction.id);
    } else {
      const tempId = crypto.randomUUID();
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, reactions: [...(c.reactions || []), { id: tempId, comment_id: commentId, profile_id: session.user.id, emoji }] } : c));
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
    setComments(prev => prev.map(c => 
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
      setComments(prev => prev.map(c => 
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || loading) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Sign in to comment!");
      return;
    }

    setLoading(true);
    const payload: any = {
      [type === 'note' ? 'note_id' : 'post_id']: post.original_id || post.id,
      profile_id: session.user.id,
      content: newComment.trim()
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
    } else {
      setComments([...comments, data]);
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
      
      // Auto-scroll to bottom to show the new comment
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 100);
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

  const DrawerInner = (
    <>
      {inline ? (
        <div className="py-4 border-b hairline shrink-0 mt-8">
          <h3 className="text-[20px] font-semibold tracking-tight">Discussion</h3>
        </div>
      ) : (
        <DrawerHeader className="px-6 py-4 border-b hairline shrink-0">
          <DrawerTitle className="text-lg font-bold">Comments</DrawerTitle>
        </DrawerHeader>
      )}

      <div className={`flex flex-col flex-1 ${inline ?'w-full' : 'min-h-0'}`}>
          <div ref={scrollRef} vaul-scrollable="" className={`${inline ?'py-6 space-y-6' : 'flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar'}`}>
            {threadedComments.length > 0 ? (
              threadedComments.map((comment) => {
                const isReply = comment.isReply;
                
                const groupedReactions = comment.reactions?.reduce((acc: any, r: any) => {
                  acc[r.emoji] = acc[r.emoji] || { count: 0, me: false };
                  acc[r.emoji].count++;
                  if (r.profile_id === currentUser?.id) acc[r.emoji].me = true;
                  return acc;
                }, {}) || {};
                
                return (
                  <div 
                    key={comment.id} 
                    className={`flex gap-3 relative transition-all duration-300 ${isReply ?"ml-9" : ""}`}
                  >
                    {/* Curved Connection Line for Replies */}
                    {isReply && (
                      <div 
                        className="absolute left-[-20px] top-[-16px] w-[14px] h-[32px] border-l-2 border-b-2 border-border/30 rounded-bl-[10px] pointer-events-none" 
                      />
                    )}
                    {/* Avatar Container with Thread Line */}
                    <div className="flex flex-col items-center shrink-0 relative">
                      <Link 
                        to="/app/profile/$id" 
                        params={{ id: comment.profile_id }}
                        className="h-8 w-8 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-bold text-muted-foreground transition active:opacity-70 z-10"
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
                        <div className="absolute top-8 bottom-0 w-[2px] bg-border/40 left-1/2 -translate-x-1/2 z-0" style={{ bottom: '-24px' }} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Link 
                          to="/app/profile/$id" 
                          params={{ id: comment.profile_id }}
                          className="text-sm font-bold text-foreground hover:underline"
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
                            className="w-full bg-accent/30 rounded-xl border-border/50 text-sm focus:border-primary p-3 min-h-[80px]"
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
                              className="px-4 py-1.5 text-[11px] font-bold bg-primary text-primary-foreground rounded-full hover:brightness-110 transition-all"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/80 leading-relaxed mb-2">
                          <LinkifiedText text={comment.content} />
                        </p>
                      )}
                      
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="flex flex-wrap items-center gap-4 relative">
                          <button 
                            onClick={() => handleLikeComment(comment)}
                            className={`text-[11px] font-bold transition flex items-center gap-1.5 ${comment.isLiked ?"text-primary" : "text-muted-foreground hover:text-primary"}`}
                          >
                            <Heart className={`h-3.5 w-3.5 ${comment.isLiked ?"fill-primary" : ""}`} />
                            {comment.likes_count > 0 ? comment.likes_count : "Like"}
                          </button>
                          
                          <button 
                            onClick={() => setReplyTo(comment)}
                            className="text-[11px] font-bold text-muted-foreground hover:text-primary transition flex items-center gap-1.5"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Reply
                          </button>



                          <div className="ml-auto">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 hover:bg-foreground/[0.06] rounded-full transition-colors">
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
                              {currentUser?.id === comment.profile_id && (

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
                                onClick={() => router.navigate({ to: `/app/chat/${comment.profile_id}` })}
                              >
                                <Mail className="h-4 w-4" />
                                <span className="font-medium text-sm">Message {getFirstName(comment.profiles)}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer" onClick={async () => {
                                if (!currentUser) return;
                                const isFollowing = followedUserIds?.includes(comment.profile_id);
                                if (isFollowing) {
                                  await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', comment.profile_id);
                                  toast.success(`Unfollowed ${getFirstName(comment.profiles)}`);
                                } else {
                                  await supabase.from('follows').insert([{ follower_id: currentUser.id, following_id: comment.profile_id }]);
                                  toast.success(`Now following ${getFirstName(comment.profiles)}!`);
                                }
                              }}>
                                {followedUserIds?.includes(comment.profile_id) ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                                <span className="font-medium text-sm">{followedUserIds?.includes(comment.profile_id) ? "Unfollow" : "Follow"} {getFirstName(comment.profiles)}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="flex items-center gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => toast.success("Comment reported. Thank you.")}>
                                <Flag className="h-4 w-4" />
                                <span className="font-medium text-sm">Report comment</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Reactions display */}
                      {Object.keys(groupedReactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {Object.entries(groupedReactions).map(([emoji, data]: [string, any]) => (
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

          <div className={`${inline ?'fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-background/95 backdrop-blur-md border-t border-border/50 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-3 z-50' : 'p-4 bg-background border-t hairline safe-bottom'}`}>
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
                  currentUser?.username?.charAt(0).toUpperCase() || "U"
                )}
              </div>
              <form onSubmit={handleSubmit} className="flex-1 bg-card rounded-2xl border border-border flex items-end pr-1 pb-1 min-h-[44px] focus-within:border-primary/50 transition-colors">
                <textarea 
                  placeholder={replyTo ? "Post your reply" : "Post your thoughts"}
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground resize-none max-h-32 min-h-[38px] leading-relaxed no-scrollbar"
                  value={newComment}
                  onChange={(e) => {
                    setNewComment(e.target.value);
                    const target = e.target;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                  rows={1}
                  style={{ height: 'auto' }}
                  autoFocus={!!replyTo}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      if (newComment.trim() && !loading) {
                        handleSubmit(e as any);
                      }
                    }
                  }}
                />
                <button 
                  type="submit" 
                  disabled={!newComment.trim() || loading}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-95 mb-0.5 mr-0.5 ${
                    newComment.trim() ?'bg-primary text-white' : 'text-muted-foreground bg-muted'
                  }`}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </div>
        {inline && <div className="h-24 shrink-0" /> /* Padding for the fixed footer */}
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
      <DrawerContent className="h-[85dvh] flex flex-col bg-background border-t border-border/30 p-0 sm:max-w-md sm:left-1/2 sm:-translate-x-1/2 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] focus:outline-none">
        {DrawerInner}
      </DrawerContent>
    </Drawer>
  );
}
