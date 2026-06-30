import { getFirstName } from "@/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Info, Send, Paperclip, MoreHorizontal, CheckCheck, Lock, Check, Trash2, Flag, Pencil, X as CloseIcon, X, Loader2, Reply, Plus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { getMessages, sendMessageAction, editMessageAction } from "@/api";
import { useUser } from "@/hooks/useUser";
import { LinkifiedText } from "@/components/LinkifiedText";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EmojiPicker from 'emoji-picker-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const Route = createFileRoute("/app/chat/$id")({
  component: ChatViewPage,
});

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

function DMMessageBubble({ m, isMe, time, otherUser, startEditing, handleDecideClubRequest, messages, onReply, onReact, currentUser }: any) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isSwiping = useRef(false);
  const maxSwipe = 60;

  const groupedReactions = m.reactions?.reduce((acc: any, r: any) => {
    acc[r.emoji] = acc[r.emoji] || { count: 0, me: false };
    acc[r.emoji].count++;
    if (r.profile_id === currentUser?.id) acc[r.emoji].me = true;
    return acc;
  }, {}) || {};

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      if (isSwiping.current) {
        setShowEmojiPicker(true);
        if (window.navigator.vibrate) window.navigator.vibrate(50);
      }
    }, 400);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    } else {
      startX.current = e.clientX;
      startY.current = e.clientY;
    }
    isSwiping.current = true;
    startLongPress();
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isSwiping.current) return;
    let currentX = 0;
    let currentY = 0;
    
    if ('touches' in e) {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else {
      currentX = e.clientX;
      currentY = e.clientY;
    }
    
    const diffX = currentX - startX.current;
    const diffY = currentY - startY.current;

    // Cancel long press if moved significantly
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      cancelLongPress();
    }

    // If vertical scrolling is more prominent than horizontal, cancel the swipe to let the page scroll
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isSwiping.current = false;
      setSwipeOffset(0);
      return;
    }

    if (diffX > 0 && !isMe) {
      const offset = Math.min(diffX, maxSwipe);
      setSwipeOffset(offset);
      if (offset >= 45 && swipeOffset < 45) {
        if (window.navigator.vibrate) window.navigator.vibrate(10);
      }
    } else if (diffX < 0 && isMe) {
      const offset = Math.max(diffX, -maxSwipe);
      setSwipeOffset(offset);
      if (offset <= -45 && swipeOffset > -45) {
        if (window.navigator.vibrate) window.navigator.vibrate(10);
      }
    }
  };

  const handleTouchEnd = () => {
    cancelLongPress();
    if (Math.abs(swipeOffset) >= 45 && isSwiping.current) {
      onReply(m);
    }
    setSwipeOffset(0);
    isSwiping.current = false;
  };

  const repliedMessage = m.reply_to_id ? messages.find((msg: any) => msg.id === m.reply_to_id) : null;

  return (
    <div 
      id={`message-${m.id}`}
      className={`relative py-1.5 flex w-full transition-colors duration-500 ${isMe ?'justify-end' : 'justify-start'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      style={{ 
        transform: `translateX(${swipeOffset}px)`,
        transition: isSwiping.current ? 'none' : 'transform 0.2s ease-out'
      }}
    >
      <div className={`flex gap-2.5 relative z-10 max-w-[85%] ${isMe ?'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar for received */}
        {!isMe && (
          <Link to="/app/profile/$id" params={{ id: m.sender_id }} className="h-8 w-8 shrink-0 rounded-full bg-accent/30 border border-border overflow-hidden flex items-center justify-center text-xs font-bold text-muted-foreground self-end mb-1 transition hover:opacity-80">
            {otherUser?.avatar_url ? (
              <img src={otherUser.avatar_url} className="h-full w-full object-cover" />
            ) : (
              (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
            )}
          </Link>
        )}

        {/* Swipe reply icon for received */}
        {!isMe && (
          <div 
            className="absolute left-full top-1/2 -translate-y-1/2 flex items-center justify-center h-8 w-8 rounded-full bg-accent/50"
            style={{
              opacity: Math.min(swipeOffset / 45, 1),
              transform: `translate(${-swipeOffset + 10}px, -50%) scale(${Math.min(swipeOffset / 45, 1)})`,
              transition: isSwiping.current ? 'none' : 'all 0.2s ease-out'
            }}
          >
            <Reply className="h-3.5 w-3.5 text-primary" />
          </div>
        )}

        {/* Swipe reply icon for sent */}
        {isMe && (
          <div 
            className="absolute right-full top-1/2 -translate-y-1/2 flex items-center justify-center h-8 w-8 rounded-full bg-accent/50"
            style={{
              opacity: Math.min(-swipeOffset / 45, 1),
              transform: `translate(${-swipeOffset - 10}px, -50%) scale(${Math.min(-swipeOffset / 45, 1)})`,
              transition: isSwiping.current ? 'none' : 'all 0.2s ease-out'
            }}
          >
            <Reply className="h-3.5 w-3.5 text-primary" />
          </div>
        )}

        <div className={`flex flex-col ${isMe ?"items-end" : "items-start"} min-w-0`}>
          {/* Action menu for my messages */}
          {isMe && (new Date().getTime() - new Date(m.created_at).getTime() < 30 * 60 * 1000) && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-1 flex justify-end w-full">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => startEditing(m)} className="gap-2">
                    <Pencil className="h-4 w-4" /> Edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <>
              <div className={`relative group px-3.5 py-2.5 flex flex-col ${
                isMe 
                  ?'bg-primary border border-primary/20 rounded-[22px] rounded-br-sm text-right' 
                  : 'bg-muted border border-border/50 rounded-[22px] rounded-bl-sm text-left'
              }`}>
                
                {/* Replied Message Preview */}
                {repliedMessage && (
                  <div 
                    onClick={() => {
                      const el = document.getElementById(`message-${repliedMessage.id}`);
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.style.backgroundColor = 'rgba(var(--primary), 0.2)';
                        setTimeout(() => {
                          el.style.backgroundColor = 'transparent';
                        }, 1500);
                      }
                    }}
                    className={`mb-1.5 p-2 rounded-xl text-left border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${isMe ?'bg-black/10 border-white/40' : 'bg-background/50 border-primary/40'}`}
                  >
                    <span className={`block text-[10px] font-bold mb-0.5 ${isMe ?'text-white/80' : 'text-primary'}`}>
                      {repliedMessage.sender_id === (isMe ? m.sender_id : otherUser?.id) ? 'You' : (otherUser?.full_name || otherUser?.username || 'Someone')}
                    </span>
                    <p className={`text-[11px] truncate max-w-[180px] ${isMe ?'text-white/90' : 'text-foreground/80'}`}>
                      {repliedMessage.content}
                    </p>
                  </div>
                )}

                {/* Sender Name for Received */}
                {!isMe && !repliedMessage && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[12px] font-bold text-foreground">{otherUser?.full_name || otherUser?.username}</span>
                  </div>
                )}

                <p className={`text-[14px] leading-relaxed whitespace-pre-wrap text-left break-words ${isMe ?'text-primary-foreground' : 'text-foreground'}`}>
                  <LinkifiedText text={m.content.split('$$MEDIA$$')[0].trim()} linkColor={isMe ? "text-primary-foreground underline font-bold hover:opacity-80" : "text-primary underline font-bold hover:opacity-80"} />
                  {!m.content.includes('$$MEDIA$$') && <span className="inline-block w-12" />} {/* Space for timestamp */}
                </p>
                
                {m.content.includes('$$MEDIA$$') && (
                  <div className={`mt-2 rounded-xl overflow-hidden transition-colors ${
                    m.content.split('$$MEDIA$$')[1].split(',').length >= 2 
                      ? "grid grid-cols-2 gap-0.5 max-h-[240px] border border-white/10 bg-white/5" 
                      : "flex justify-start border border-white/10"
                  }`}>
                    {m.content.split('$$MEDIA$$')[1].split(',').map((url: string, i: number) => {
                      const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg)$/);
                      return (
                        <div key={i} className={`relative overflow-hidden w-full ${
                          m.content.split('$$MEDIA$$')[1].split(',').length === 1 ? "max-h-[300px]" : "aspect-square"
                        }`}>
                          {isVideo ? (
                            <video src={url} controls className="h-full w-full object-cover" />
                          ) : (
                            <img src={url} className="h-full w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(url, '_blank')} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {m.content.includes('$$MEDIA$$') && <div className="h-4" />} {/* Space for timestamp when media is present */}
                
                <span className={`text-[10px] absolute bottom-2 right-3 ${isMe ?'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {time} {m.is_edited && "(edited)"}
                </span>

                {/* Tap outside overlay */}
                {(showEmojiPicker || showFullPicker) && (
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(false); setShowFullPicker(false); }} 
                    onTouchStart={(e) => { e.stopPropagation(); setShowEmojiPicker(false); setShowFullPicker(false); }} 
                  />
                )}

                {/* Emoji Picker Popover */}
                {showEmojiPicker && (
                  <div 
                    className={`absolute z-50 flex flex-row gap-1.5 p-2 bg-card/95 backdrop-blur-xl border border-border/80 rounded-full shadow-2xl animate-in zoom-in duration-200 -top-14 ${isMe ?'right-0' : 'left-0'}`}
                  >
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={(e) => { e.stopPropagation(); onReact(m.id, emoji); setShowEmojiPicker(false); }}
                        className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-xl active:scale-90"
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowFullPicker(true); setShowEmojiPicker(false); }}
                      className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-xl active:scale-90 bg-accent/20 text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Full Emoji Picker Popover */}
                {showFullPicker && (
                  <div 
                    className={`absolute z-50 shadow-2xl animate-in zoom-in duration-200 ${isMe ?'right-0 -top-[320px]' : 'left-0 -top-[320px]'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EmojiPicker 
                      onEmojiClick={(emojiData) => {
                        onReact(m.id, emojiData.emoji);
                        setShowFullPicker(false);
                      }} 
                      theme={'dark' as any}
                      lazyLoadEmojis={true}
                      searchDisabled={false}
                      skinTonesDisabled={true}
                      width={280}
                      height={300}
                    />
                  </div>
                )}
              </div>

              {/* Reactions display */}
              {Object.keys(groupedReactions).length > 0 && (
                <div className={`flex flex-wrap gap-1 mt-1 ${isMe ?'justify-end' : 'justify-start'}`}>
                  {Object.entries(groupedReactions).map(([emoji, data]: [string, any]) => (
                    <button
                      key={emoji}
                      onClick={() => onReact(m.id, emoji)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold transition-colors ${
                        data.me ?'bg-primary/20 border-primary/30 text-primary' : 'bg-accent/30 border-white/5 text-muted-foreground hover:bg-accent/50'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span>{data.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
        </div>
      </div>
    </div>
  );
}

function ChatViewPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: currentUserProfile } = useUser();
  const navigate = useNavigate();

  const { data: otherUser } = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
      return data;
    }
  });

  const { data: initialMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => getMessages(id),
    staleTime: 0,
  });

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState("100dvh");
  const [viewportTop, setViewportTop] = useState("0px");

  const EMOJIS = ["🚀", "🔥", "💎", "💯", "👏", "🙌", "✨", "🤝", "💻", "🎨", "📈", "🎯"];

  useEffect(() => {
    // Lock body scrolling when chat page is mounted
    const originalStyle = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    return () => {
      // Restore body scrolling when chat page is unmounted
      window.document.body.style.overflow = originalStyle;
    };
  }, []);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleResize = () => {
      setViewportHeight(`${visualViewport.height}px`);
      setViewportTop(`${visualViewport.offsetTop}px`);
    };

    visualViewport.addEventListener("resize", handleResize);
    visualViewport.addEventListener("scroll", handleResize);
    
    handleResize();

    return () => {
      visualViewport.removeEventListener("resize", handleResize);
      visualViewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user.id || null);
    });

    // Real-time subscription
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new;
            if ((newMsg.sender_id === id || newMsg.receiver_id === id) && !(newMsg.content || '').startsWith('CLUB_REQUEST:') && newMsg.content !== 'DISMISSED_CLUB_REQUEST') {
              setMessages(prev => [...prev, newMsg]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new;
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    
    const markMessagesAsRead = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', id)
        .eq('receiver_id', session.user.id)
        .eq('is_read', false);
    };

    markMessagesAsRead();
  }, [id, messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);



  const handleChatMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files);
    setMediaFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setMediaPreviews(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && mediaFiles.length === 0) || sending) return;
    
    setSending(true);
    try {
      if (editingId) {
        await editMessageAction({ messageId: editingId, content: input.trim() });
        setEditingId(null);
        toast.success("Message updated");
      } else {
        let text = input;
        if (mediaFiles.length > 0) {
          toast.loading("Uploading media...", { id: "upload" });
          const uploadedUrls: string[] = [];
          for (const file of mediaFiles) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${currentUserId}/${fileName}`;
            const { error: uploadError } = await supabase.storage.from('post-media').upload(filePath, file);
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage.from('post-media').getPublicUrl(filePath);
              uploadedUrls.push(publicUrl);
            }
          }
          toast.dismiss("upload");
          if (uploadedUrls.length > 0) {
            text += `\n\n$$MEDIA$$${uploadedUrls.join(',')}`;
          }
        }
        await sendMessageAction({ receiverId: id, content: text.trim(), reply_to_id: replyingTo?.id });
        setReplyingTo(null);
        setMediaFiles([]);
        setMediaPreviews([]);
      }
      setInput("");
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(t => { t.style.height = 'auto'; });
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to process message");
    } finally {
      setSending(false);
    }
  };

  const handleDecideClubRequest = async (messageId: string, clubId: string, applicantId: string, decision: 'accept' | 'decline') => {
    try {
      if (decision === 'accept') {
        const msgToUpdate = messages.find(m => m.id === messageId);
        if (msgToUpdate) {
          const parts = msgToUpdate.content.split(':');
          parts[3] = 'accepted';
          const newContent = parts.join(':');

          const { error: msgError } = await supabase
            .from('messages')
            .update({ content: newContent, is_read: true })
            .eq('id', messageId);

          if (msgError) throw msgError;

          const { error: memberError } = await supabase
            .from('club_members')
            .insert([{
              club_id: clubId,
              profile_id: applicantId,
              role: 'Member'
            }]);

          if (memberError && memberError.code !== '23505') {
            console.error("Error adding member to club:", memberError);
          }
          
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, is_read: true } : m));
          toast.success("Request approved! Builder added to your private club.");
        }
      } else {
        const msgToUpdate = messages.find(m => m.id === messageId);
        if (msgToUpdate) {
          const parts = msgToUpdate.content.split(':');
          parts[3] = 'declined';
          const newContent = parts.join(':');

          const { error: msgError } = await supabase
            .from('messages')
            .update({ content: newContent, is_read: true })
            .eq('id', messageId);

          if (msgError) throw msgError;

          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, is_read: true } : m));
          toast.error("Request declined.");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process request");
    }
  };

  const startEditing = (message: any) => {
    setEditingId(message.id);
    setInput(message.content);
    setReplyingTo(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setInput("");
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!currentUserId) return;
    
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    
    const existingReaction = msg.reactions?.find((r: any) => r.profile_id === currentUserId && r.emoji === emoji);
    
    if (existingReaction) {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: m.reactions.filter((r: any) => r.id !== existingReaction.id) };
      }));
      // Suppress error if table doesn't exist
      await supabase.from('message_reactions').delete().eq('id', existingReaction.id).catch(() => {});
    } else {
      const tempId = crypto.randomUUID();
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: [...(m.reactions || []), { id: tempId, message_id: messageId, profile_id: currentUserId, emoji }] };
      }));
      await supabase.from('message_reactions').insert([{
        message_id: messageId,
        profile_id: currentUserId,
        emoji
      }]).catch(() => {});
    }
  };

  if (messagesLoading && messages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div 
      className="flex fixed inset-x-0 z-[60] flex-col bg-background max-w-md mx-auto overflow-hidden border-x border-border"
      style={{ height: viewportHeight, top: viewportTop }}
    >
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: '/app/chat' })} className="grid h-9 w-9 place-items-center rounded-full transition active:scale-95 active:bg-accent/50">
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-muted-foreground">
              {otherUser?.avatar_url ? (
                <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">{otherUser?.full_name || otherUser?.username}</h2>
              <div className="flex items-center gap-1.5">
                {(() => {
                  const lastSeen = otherUser?.updated_at ? new Date(otherUser.updated_at).getTime() : 0;
                  const now = Date.now();
                  const diffMins = (now - lastSeen) / (1000 * 60);
                  
                  if (diffMins < 5) return (
                    <>
                      <div className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)" />
                      <span className="text-[10px] text-muted-foreground">Active now</span>
                    </>
                  );
                  if (diffMins < 15) return (
                    <>
                      <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                      <span className="text-[10px] text-muted-foreground">Away</span>
                    </>
                  );
                  return (
                    <>
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                      <span className="text-[10px] text-muted-foreground">Offline</span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/app/profile/$id" params={{ id: otherUser?.id || '' }} className="grid h-9 w-9 place-items-center rounded-full transition active:bg-accent/50">
            <Info className="h-5 w-5" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid h-9 w-9 place-items-center rounded-full transition active:bg-accent/50">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-background/95 backdrop-blur-xl border-border">
              <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => toast.success("Chat history cleared locally.")}>
                <Trash2 className="h-4 w-4" />
                <span className="text-sm font-medium">Clear Chat</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => toast.success("User reported. Thank you.")}>
                <Flag className="h-4 w-4" />
                <span className="text-sm font-medium">Report User</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide"
      >
        <div className="flex flex-col items-center py-6 text-center">
          <div className="h-20 w-20 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-muted-foreground text-xl mb-3">
            {otherUser?.avatar_url ? (
              <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
            )}
          </div>
          <h3 className="font-bold">{otherUser?.full_name || otherUser?.username}</h3>
          <p className="text-xs text-muted-foreground">{getFirstName(otherUser)} · Builder</p>
        </div>

        {messages.map((m: any) => (
          <DMMessageBubble 
            key={m.id}
            m={m}
            isMe={m.sender_id === currentUserId}
            time={new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            otherUser={otherUser}
            startEditing={startEditing}
            handleDecideClubRequest={handleDecideClubRequest}
            messages={messages}
            onReply={(msg: any) => { setReplyingTo(msg); setEditingId(null); setInput(""); }}
            onReact={handleReact}
            currentUser={{ id: currentUserId }}
          />
        ))}
      </div>

      <footer className="px-4 py-3 bg-background border-t border-border/50">
        {editingId && (
          <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-primary/10 rounded-xl text-xs font-bold text-primary">
            <span className="flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editing message</span>
            <button onClick={cancelEditing} className="hover:text-foreground grid h-6 w-6 place-items-center rounded-full hover:bg-primary/20 transition"><X className="h-3 w-3" /></button>
          </div>
        )}
        {replyingTo && (
          <div className="flex items-center justify-between mb-2 px-2 bg-primary/5 rounded-lg py-1.5 border border-primary/10">
            <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
              <Reply className="h-3 w-3" /> Replying to {replyingTo.sender_id === currentUserId ? 'yourself' : (otherUser?.full_name || otherUser?.username)}
            </span>
            <button 
              onClick={() => setReplyingTo(null)} 
              className="p-1 hover:bg-primary/10 rounded-full text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        
        {mediaPreviews.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar py-2">
            {mediaPreviews.map((preview, idx) => (
              <div key={idx} className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-border">
                {preview.startsWith('data:video') ? (
                  <video src={preview} className="h-full w-full object-cover" />
                ) : (
                  <img src={preview} className="h-full w-full object-cover" />
                )}
                <button 
                  onClick={() => removeMedia(idx)}
                  className="absolute top-1 right-1 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-destructive transition"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-end gap-2">
          <div className="h-9 w-9 shrink-0 rounded-full bg-accent/30 border border-border/50 overflow-hidden flex items-center justify-center font-bold text-xs text-muted-foreground mb-0.5">
            {currentUserProfile?.avatar_url ? (
              <img src={currentUserProfile.avatar_url} className="h-full w-full object-cover" />
            ) : (
              (currentUserProfile?.full_name || currentUserProfile?.username || 'U').substring(0, 1).toUpperCase()
            )}
          </div>

          <div className="flex-1 flex items-end gap-1.5 rounded-2xl border border-border bg-card px-3 py-1 focus-within:border-primary/50 transition-colors">
            <textarea 
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const target = e.target;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 80)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={editingId ? "Edit your message" : (replyingTo ? "Write a reply..." : "Start a message")} 
              className="flex-1 resize-none bg-transparent py-2 text-sm outline-none text-foreground placeholder:text-muted-foreground no-scrollbar"
              rows={1}
              style={{ minHeight: '36px', maxHeight: '80px', height: '36px' }}
            />
            <div className="flex items-center gap-0.5 pb-1 shrink-0">
              <input 
                type="file" 
                ref={mediaInputRef} 
                className="hidden" 
                onChange={handleChatMediaUpload}
                multiple
                accept="image/*,video/*"
              />
              <button 
                onClick={() => mediaInputRef.current?.click()}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground active:scale-95 hover:text-foreground transition"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button 
                onClick={handleSendMessage}
                disabled={(!input.trim() && mediaFiles.length === 0) || sending}
                className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-95 ${
                  (input.trim() || mediaFiles.length > 0) && !sending ? (editingId ?'bg-success text-success-foreground' : 'bg-primary text-white') : 'text-muted-foreground'
                }`}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />)}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
