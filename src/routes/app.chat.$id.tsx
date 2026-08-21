import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Info, Send, Paperclip, MoreHorizontal, CheckCheck, Lock, Check, Trash2, Flag, Pencil, X as CloseIcon, X, Loader2, Reply, Plus, Building2, Mic, Square, Image, Film, File, FileText, Download, BellOff, Bell, UserRound, WalletCards, ArrowUpRight, BadgeCheck, Headphones } from "@/components/icons/solar";
import { useState, useRef, useEffect } from "react";
import { getMessages, sendMessageAction, editMessageAction } from "@/api";
import { useUser } from "@/hooks/useUser";
import { LinkifiedText } from "@/components/LinkifiedText";
import { supabase } from "@/lib/supabase";
import { decodeChatMedia, encodeChatMedia, getChatMediaType, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { directMessagePreview, parseFundLinkMessage } from "@/lib/directMessage";

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
  const fundLink = parseFundLinkMessage(m.content);

  const handleAcceptInvite = async (messageId: string, instId: string, instName: string) => {
    if (!currentUser) return;
    try {
      const { error: insertError } = await supabase
        .from('institution_tutors')
        .insert({ institution_id: instId, tutor_id: currentUser.id });
      
      if (insertError && insertError.code !== '23505') throw insertError;
      
      await supabase
        .from('messages')
        .update({ content: `ACCEPTED_TUTOR_INVITE:${instName}` })
        .eq('id', messageId);
      
      toast.success(`You are now a tutor at ${instName}!`);
    } catch (e: any) {
      toast.error('Failed to accept: ' + e.message);
    }
  };

  const handleRejectInvite = async (messageId: string, instName: string) => {
    try {
      await supabase
        .from('messages')
        .update({ content: `REJECTED_TUTOR_INVITE:${instName}` })
        .eq('id', messageId);
      toast.success(`Declined invitation from ${instName}`);
    } catch (e: any) {
      toast.error('Failed to decline: ' + e.message);
    }
  };

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
          {isMe && !fundLink && (new Date().getTime() - new Date(m.created_at).getTime() < 30 * 60 * 1000) && (
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
                  ? 'rounded-[22px] rounded-br-sm border border-foreground/10 bg-foreground text-right text-background shadow-sm shadow-black/10'
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
                    className={`mb-1.5 p-2 rounded-xl text-left border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${isMe ? 'bg-black/10 border-white/40' : 'bg-foreground/[0.04] border-primary/40'}`}
                  >
                    <span className={`block text-[10px] font-bold mb-0.5 ${isMe ?'text-white/80' : 'text-primary'}`}>
                      {repliedMessage.sender_id === (isMe ? m.sender_id : otherUser?.id) ? 'You' : (otherUser?.full_name || otherUser?.username || 'Someone')}
                    </span>
                    <p className={`text-[11px] truncate max-w-[180px] ${isMe ?'text-white/90' : 'text-foreground/80'}`}>
                      {directMessagePreview(repliedMessage.content, { sentByCurrentUser: repliedMessage.sender_id === currentUser?.id })}
                    </p>
                  </div>
                )}

                {/* Sender Name for Received */}
                {!isMe && !repliedMessage && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[12px] font-bold text-foreground">{otherUser?.full_name || otherUser?.username}</span>
                  </div>
                )}

                {m.content.startsWith('TUTOR_INVITE:') ? (
                  <div className="flex flex-col gap-3 min-w-[200px]">
                    <div className="font-bold flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Tutor Invitation
                    </div>
                    <p className={`text-[14px] ${isMe ?'text-background/90' : 'text-foreground/90'}`}>
                      You have been invited to join <strong>{m.content.split(':')[2]}</strong> as a Tutor.
                    </p>
                    {!isMe && (
                      <div className="flex gap-2 mt-1">
                        <button 
                          onClick={() => handleAcceptInvite(m.id, m.content.split(':')[1], m.content.split(':')[2])}
                          className="flex-1 bg-primary text-primary-foreground py-1.5 rounded-lg font-bold text-xs hover:opacity-90 transition"
                        >
                          Accept
                        </button>
                        <button 
                          onClick={() => handleRejectInvite(m.id, m.content.split(':')[2])}
                          className="flex-1 bg-background text-foreground border border-border py-1.5 rounded-lg font-bold text-xs hover:bg-accent transition text-center"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {isMe && (
                      <p className="text-xs opacity-70 mt-1">Invitation sent to user.</p>
                    )}
                  </div>
                ) : fundLink ? (
                  /* The whole card is a normal same-origin link. Stopping the
                     gesture events here keeps swipe-to-reply from swallowing
                     taps on mobile. */
                  <a
                    href={`/fund/${encodeURIComponent(fundLink.slug)}`}
                    onMouseDown={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    className={`group/fund flex min-w-[232px] max-w-[280px] flex-col overflow-hidden rounded-lg border text-left transition active:scale-[0.985] ${
                      isMe
                        ? "border-background/20 bg-background/[0.08] hover:bg-background/[0.13]"
                        : "border-primary/20 bg-card hover:border-primary/35 hover:shadow-sm"
                    }`}
                  >
                    <span className="flex items-start gap-3 p-3.5">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${isMe ? "bg-background/15" : "bg-primary/10 text-primary"}`}>
                        <WalletCards className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[10px] font-semibold uppercase tracking-[0.12em] ${isMe ? "text-background/65" : "text-primary"}`}>
                          Zero Club wallet
                        </span>
                        <span className="mt-1 block text-[14px] font-bold leading-snug">
                          {isMe ? "Your wallet fund link" : `Fund ${fundLink.ownerName}'s wallet`}
                        </span>
                        <span className={`mt-1 block text-[11px] leading-relaxed ${isMe ? "text-background/70" : "text-muted-foreground"}`}>
                          {isMe ? "Shared in this conversation" : "Pay securely with your wallet or card"}
                        </span>
                      </span>
                    </span>
                    <span className={`flex items-center justify-between border-t px-3.5 py-2.5 pr-14 text-[11px] font-bold ${isMe ? "border-background/15 text-background" : "border-border/60 text-primary"}`}>
                      {isMe ? "View fund link" : "Open and fund wallet"}
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/fund:-translate-y-0.5 group-hover/fund:translate-x-0.5" />
                    </span>
                  </a>
                ) : m.content.startsWith('ACCEPTED_TUTOR_INVITE:') ? (
                   <p className={`text-[14px] font-bold ${isMe ? 'text-background' : 'text-green-600 dark:text-green-400'}`}>✅ Accepted invitation to join {m.content.split(':')[1]}</p>
                ) : m.content.startsWith('REJECTED_TUTOR_INVITE:') ? (
                   <p className={`text-[14px] font-bold ${isMe ? 'text-background' : 'text-red-600 dark:text-red-400'}`}>❌ Rejected invitation to join {m.content.split(':')[1]}</p>
                ) : (
                  <p className={`text-[14px] leading-relaxed whitespace-pre-wrap text-left break-words ${isMe ?'text-background' : 'text-foreground'}`}>
                    <LinkifiedText text={m.content.split('$$MEDIA$$')[0].trim()} linkColor={isMe ? "text-background underline font-bold hover:opacity-80" : "text-primary underline font-bold hover:opacity-80"} />
                    {!m.content.includes('$$MEDIA$$') && <span className="inline-block w-12" />} {/* Space for timestamp */}
                  </p>
                )}
                
                {m.content.includes('$$MEDIA$$') && (
                  <div className={`mt-2 rounded-xl overflow-hidden transition-colors ${
                    m.content.split('$$MEDIA$$')[1].split(',').length >= 2 
                      ? "grid grid-cols-2 gap-0.5 max-h-[240px] ring-1 ring-border bg-muted/40" 
                      : "flex justify-start ring-1 ring-border"
                  }`}>
                    {m.content.split('$$MEDIA$$')[1].split(',').map((token: string, i: number) => {
                      const media = decodeChatMedia(token);
                      return (
                        <div key={i} className={`relative overflow-hidden w-full ${
                          media.type === 'audio' || media.type === 'file' ? 'min-w-[220px] bg-card/10 p-3' : m.content.split('$$MEDIA$$')[1].split(',').length === 1 ? "max-h-[300px]" : "aspect-square"
                        }`}>
                          {media.type === 'video' ? (
                            <video src={media.url} controls className="h-full w-full object-cover" />
                          ) : media.type === 'audio' ? (
                            <div className="flex min-w-0 flex-col gap-2 text-left"><div className="flex items-center gap-2"><Mic className="h-4 w-4 shrink-0" /><span className="truncate text-[11px] font-semibold">Voice message</span></div><audio src={media.url} controls className="h-10 w-full min-w-[190px]" /></div>
                          ) : media.type === 'file' ? (
                            <a href={media.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 text-left"><FileText className="h-6 w-6 shrink-0" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{media.name}</span><Download className="h-4 w-4 shrink-0" /></a>
                          ) : (
                            <img src={media.url} className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-90" onClick={() => window.open(media.url, '_blank')} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {m.content.includes('$$MEDIA$$') && <div className="h-4" />} {/* Space for timestamp when media is present */}
                
                <span className={`text-[10px] absolute bottom-2 right-3 ${isMe ?'text-background/70' : 'text-muted-foreground'}`}>
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
                        data.me ? 'bg-primary/15 border-primary/25 text-primary' : 'bg-foreground/[0.04] border-transparent text-muted-foreground hover:bg-foreground/[0.08]'
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
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const { isRecording, recordingSeconds, startRecording, stopRecording } = useVoiceRecorder((file) => {
    setMediaFiles((files) => [...files, file]);
    setMediaPreviews((previews) => [...previews, URL.createObjectURL(file)]);
  });
  const [isUploading, setIsUploading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => typeof window !== 'undefined' && localStorage.getItem(`zero-chat-muted:${id}`) === 'true');
  const [reporting, setReporting] = useState(false);
  const [viewportHeight, setViewportHeight] = useState("100dvh");
  const [viewportTop, setViewportTop] = useState("0px");

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    try {
      await startRecording();
    } catch (error: any) {
      toast.error(error.message || 'Microphone access is required to record a voice note.');
    }
  };

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
    const clearedAt = typeof window !== 'undefined' ? localStorage.getItem(`zero-chat-cleared:${id}`) : null;
    const visibleMessages = clearedAt
      ? initialMessages.filter((message: any) => new Date(message.created_at).getTime() > new Date(clearedAt).getTime())
      : initialMessages;
    setMessages(visibleMessages);
  }, [initialMessages, id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user.id || null);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const mergeIncomingMessage = (newMessage: any) => {
      if (newMessage.sender_id !== id || newMessage.receiver_id !== currentUserId) return;
      if ((newMessage.content || '').startsWith('CLUB_REQUEST:') || newMessage.content === 'DISMISSED_CLUB_REQUEST') return;
      setMessages((previous) => previous.some((message) => message.id === newMessage.id)
        ? previous
        : [...previous, newMessage]);
      queryClient.setQueryData<any[]>(["messages", id], (previous = []) =>
        previous.some((message) => message.id === newMessage.id) ? previous : [...previous, newMessage]
      );
    };

    // Listen only for messages delivered to this user. The old unfiltered
    // subscription received every message sent anywhere in the app.
    const channel = supabase
      .channel(`chat-${currentUserId}-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => mergeIncomingMessage(payload.new)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          const updatedMessage = payload.new;
          if (updatedMessage.sender_id !== id) return;
          setMessages((previous) => previous.map((message) =>
            message.id === updatedMessage.id ? { ...message, ...updatedMessage } : message
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, id, queryClient]);

  useEffect(() => {
    if (!id) return;
    
    const unreadMessageIds = messages
      .filter((message) => message.sender_id === id && message.receiver_id === currentUserId && !message.is_read)
      .map((message) => message.id)
      .filter((messageId) => !String(messageId).startsWith('pending-'));
    if (!currentUserId || unreadMessageIds.length === 0) return;

    const markMessagesAsRead = async () => {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadMessageIds);
    };

    markMessagesAsRead();
  }, [currentUserId, id, messages]);

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

  const handleClearChat = () => {
    if (!window.confirm('Clear this conversation from this device? New messages will still appear.')) return;
    localStorage.setItem(`zero-chat-cleared:${id}`, new Date().toISOString());
    setMessages([]);
    toast.success('Conversation cleared on this device.');
  };

  const toggleMuteConversation = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    localStorage.setItem(`zero-chat-muted:${id}`, String(nextMuted));
    toast.success(nextMuted ? 'Conversation muted.' : 'Conversation notifications restored.');
  };

  const handleReportUser = async () => {
    if (!currentUserId || reporting) return;
    if (!window.confirm(`Report ${otherUser?.full_name || otherUser?.username || 'this user'} for inappropriate direct messages?`)) return;
    setReporting(true);
    try {
      const { error } = await supabase.from('user_reports').insert({
        reporter_id: currentUserId,
        reported_id: id,
        context: 'direct_message',
        reason: 'Inappropriate or unsafe direct messages',
      });
      if (error) throw error;
      toast.success('Report submitted for review.');
    } catch (error: any) {
      toast.error(error.message || 'Could not submit this report.');
    } finally {
      setReporting(false);
    }
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && mediaFiles.length === 0) || sending) return;

    let pendingMessageId: string | null = null;
    const originalInput = input;
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
              uploadedUrls.push(encodeChatMedia(getChatMediaType(file), publicUrl, file.name));
            }
          }
          toast.dismiss("upload");
          if (uploadedUrls.length > 0) {
            text += `\n\n$$MEDIA$$${uploadedUrls.join(',')}`;
          }
        }
        const content = text.trim();
        const replyToId = replyingTo?.id;
        const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        pendingMessageId = pendingId;
        const optimisticMessage = {
          id: pendingId,
          sender_id: currentUserId,
          receiver_id: id,
          content,
          reply_to_id: replyToId,
          created_at: new Date().toISOString(),
          is_read: false,
          pending: true,
        };

        // Show text immediately while the database request completes.
        setMessages((previous) => [...previous, optimisticMessage]);
        setInput("");
        const savedMessage = await sendMessageAction({ receiverId: id, content, reply_to_id: replyToId });
        setMessages((previous) => {
          const withoutPending = previous.filter((message) => message.id !== pendingId);
          return withoutPending.some((message) => message.id === savedMessage.id)
            ? withoutPending
            : [...withoutPending, savedMessage];
        });
        queryClient.setQueryData<any[]>(["messages", id], (previous = []) =>
          previous.some((message) => message.id === savedMessage.id) ? previous : [...previous, savedMessage]
        );
        setReplyingTo(null);
        setMediaFiles([]);
        setMediaPreviews([]);
      }
      setInput("");
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(t => { t.style.height = 'auto'; });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err: any) {
      if (pendingMessageId) {
        setMessages((previous) => previous.filter((message) => message.id !== pendingMessageId));
        setInput((current) => current || originalInput);
      }
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
      try {
        await supabase.from('message_reactions').delete().eq('id', existingReaction.id);
      } catch {
        // Ignore if the optional reactions table is unavailable.
      }
    } else {
      const tempId = crypto.randomUUID();
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: [...(m.reactions || []), { id: tempId, message_id: messageId, profile_id: currentUserId, emoji }] };
      }));
      try {
        await supabase.from('message_reactions').insert([{
          message_id: messageId,
          profile_id: currentUserId,
          emoji
        }]);
      } catch {
        // Ignore if the optional reactions table is unavailable.
      }
    }
  };

  if (messagesLoading && messages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isSupportChat = Boolean(otherUser?.is_admin);
  const otherUserDisplayName = isSupportChat
    ? "Zero Club Support"
    : otherUser?.full_name || otherUser?.username;

  return (
    <div 
      className="fixed inset-x-0 z-[60] mx-auto flex max-w-md flex-col overflow-hidden border-x border-border bg-background md:left-[280px] md:right-0 md:mx-0 md:max-w-none xl:right-[336px]"
      style={{ height: viewportHeight, top: viewportTop }}
    >
      <header className="flex items-center justify-between border-b border-border bg-background/80 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: '/app/chat' })} className="grid h-9 w-9 place-items-center rounded-full transition active:scale-95 active:bg-accent/50">
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div className="flex items-center gap-3">
            <Link to="/app/profile/$id" params={{ id }} aria-label={`Open ${otherUserDisplayName || 'user'} profile`} className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-muted-foreground transition active:scale-95">
              {otherUser?.avatar_url ? (
                <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
              )}
            </Link>
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold leading-tight">
                {otherUserDisplayName}
                {isSupportChat && <BadgeCheck className="h-4 w-4 fill-primary text-primary-foreground" />}
              </h2>
              <div className="flex items-center gap-1.5">
                {isSupportChat ? (
                  <>
                    <Headphones className="h-3 w-3 text-primary" />
                    <span className="text-[10px] font-medium text-primary">Official Zero Club support</span>
                  </>
                ) : (() => {
                  const lastSeen = otherUser?.updated_at ? new Date(otherUser.updated_at).getTime() : 0;
                  const now = Date.now();
                  const diffMins = (now - lastSeen) / (1000 * 60);
                  
                  if (diffMins < 5) return (
                    <>
                      <div className="h-1.5 w-1.5 rounded-full bg-success" />
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
          <button onClick={() => setInfoOpen(true)} aria-label="Conversation information" className="grid h-9 w-9 place-items-center rounded-full transition active:bg-accent/50">
            <Info className="h-5 w-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid h-9 w-9 place-items-center rounded-full transition active:bg-accent/50">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[100] w-52 border-border bg-background/95 shadow-lift backdrop-blur-xl">
              <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onClick={toggleMuteConversation}>
                {isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                <span className="text-sm font-medium">{isMuted ? 'Unmute chat' : 'Mute chat'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer" onClick={() => navigate({ to: '/app/profile/$id', params: { id } })}>
                <UserRound className="h-4 w-4" />
                <span className="text-sm font-medium">View profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={handleClearChat}>
                <Trash2 className="h-4 w-4" />
                <span className="text-sm font-medium">Clear Chat</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={reporting} className="gap-3 py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={handleReportUser}>
                <Flag className="h-4 w-4" />
                <span className="text-sm font-medium">{reporting ? 'Submitting...' : 'Report User'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
        <SheetContent side="right" overlayClassName="z-[90]" className="z-[100] w-[min(92vw,380px)] border-l border-border bg-background p-0">
          <SheetHeader className="border-b border-border/60 px-5 py-5 text-left">
            <SheetTitle>Conversation details</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto no-scrollbar p-5">
            <div className="flex flex-col items-center text-center">
              <Link to="/app/profile/$id" params={{ id }} onClick={() => setInfoOpen(false)} className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-muted text-xl font-semibold text-muted-foreground transition active:scale-95">
                {otherUser?.avatar_url ? <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" /> : (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()}
              </Link>
              <h3 className="mt-3 text-[16px] font-semibold tracking-tight">{otherUser?.full_name || otherUser?.username}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">@{otherUser?.username}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-card p-3 text-center"><p className="text-[18px] font-semibold tabular-nums">{messages.length}</p><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Messages</p></div>
              <div className="rounded-lg border border-border bg-card p-3 text-center"><p className="text-[18px] font-semibold tabular-nums">{messages.filter((message) => message.content?.includes('$$MEDIA$$')).length}</p><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Attachments</p></div>
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
              <Link to="/app/profile/$id" params={{ id }} onClick={() => setInfoOpen(false)} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 text-[13px] font-medium hover:bg-accent/40"><UserRound className="h-4 w-4 text-muted-foreground" /> View profile <ChevronLeft className="ml-auto h-4 w-4 rotate-180 text-muted-foreground" /></Link>
              <button onClick={toggleMuteConversation} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-left text-[13px] font-medium hover:bg-accent/40">{isMuted ? <Bell className="h-4 w-4 text-muted-foreground" /> : <BellOff className="h-4 w-4 text-muted-foreground" />} {isMuted ? 'Unmute conversation' : 'Mute conversation'}</button>
              <button onClick={handleClearChat} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[13px] font-medium text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /> Clear conversation</button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar"
      >
        <div className="flex flex-col items-center py-6 text-center">
          <Link to="/app/profile/$id" params={{ id }} className="h-20 w-20 rounded-full bg-muted overflow-hidden flex items-center justify-center font-bold text-muted-foreground text-xl mb-3 transition active:scale-95">
            {otherUser?.avatar_url ? (
              <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
            )}
          </Link>
          <h3 className="font-bold">{otherUser?.full_name || otherUser?.username}</h3>
          {/* The username, not "First name · Builder". The line above already
              carries the display name, so repeating a truncated version of it
              next to a label everyone shares said nothing about who this is. */}
          {otherUser?.username && (
            <p className="text-xs text-muted-foreground">@{otherUser.username}</p>
          )}
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
              <div key={idx} className={`relative shrink-0 overflow-hidden rounded-lg border border-border bg-card ${mediaFiles[idx]?.type.startsWith('audio/') || (!mediaFiles[idx]?.type.startsWith('image/') && !mediaFiles[idx]?.type.startsWith('video/')) ? 'min-w-[190px] p-2 pr-7' : 'h-16 w-16'}`}>
                {mediaFiles[idx]?.type.startsWith('audio/') ? (
                  <audio src={preview} controls className="h-10 w-[180px]" />
                ) : mediaFiles[idx]?.type.startsWith('video/') ? (
                  <video src={preview} className="h-full w-full object-cover" />
                ) : mediaFiles[idx]?.type.startsWith('image/') ? (
                  <img src={preview} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-10 items-center gap-2 px-1"><FileText className="h-5 w-5 shrink-0 text-primary" /><span className="max-w-[130px] truncate text-[11px] font-medium">{mediaFiles[idx]?.name}</span></div>
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
                accept="image/*"
              />
              <input type="file" ref={videoInputRef} className="hidden" onChange={handleChatMediaUpload} multiple accept="video/*" />
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleChatMediaUpload} multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,application/*" />
              <button
                onClick={toggleVoiceRecording}
                title={isRecording ? 'Stop recording' : 'Record voice note'}
                className={`inline-flex h-8 items-center justify-center rounded-full transition active:scale-95 ${isRecording ? 'min-w-12 bg-red-500 px-2 text-white' : 'w-8 text-muted-foreground hover:text-foreground'}`}
              >
                {isRecording ? <><Square className="h-3.5 w-3.5 fill-current" /><span className="ml-1 text-[9px] tabular-nums">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</span></> : <Mic className="h-4 w-4" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Add attachment" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:text-foreground active:scale-95"><Paperclip className="h-4 w-4" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="z-[100] w-44 border-border bg-background/95 shadow-lift backdrop-blur-xl">
                  <DropdownMenuItem onSelect={() => mediaInputRef.current?.click()} className="gap-2.5"><Image className="h-4 w-4" /> Pictures</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => videoInputRef.current?.click()} className="gap-2.5"><Film className="h-4 w-4" /> Video</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => fileInputRef.current?.click()} className="gap-2.5"><File className="h-4 w-4" /> File</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button 
                onClick={handleSendMessage}
                disabled={(!input.trim() && mediaFiles.length === 0) || sending}
                className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-95 ${
                  (input.trim() || mediaFiles.length > 0) && !sending ? (editingId ?'bg-success text-success-foreground' : 'bg-primary text-primary-foreground') : 'text-muted-foreground'
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
