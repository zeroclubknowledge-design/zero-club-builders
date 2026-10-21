import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { contentPreview } from "@/lib/contentPreview";
import { Forward, ForwardSheet, MessageActionsSheet } from "@/features/chat/MessageActions";
import { tooLargeMessage, UPLOAD_LIMIT_MB } from "@/lib/storage";
import { VoiceNotePlayer } from "@/components/VoiceNotePlayer";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ChatMediaGrid, type ChatVisual } from "@/components/ChatMediaGrid";
import { isRecentlySeen, lastSeenLabel, useIsOnline } from "@/lib/realtime/presence";
import { useInboxTyping, useSendTypingTo } from "@/lib/realtime/typing";
import { MentionField } from "@/components/MentionField";
import { isSendKey, useEnterToSend } from "@/lib/chatPrefs";
import { useGoBack } from "@/hooks/useGoBack";
import { ArrowLeft, ChevronLeft, Info, Send, Paperclip, MoreHorizontal, Lock, Check, Trash2, Flag, Pencil, X, Loader2, Reply, Plus, Building2, Mic, Square, Image, Film, File, FileText, Download, BellOff, Bell, UserRound, WalletCards, ArrowUpRight, BadgeCheck, Headphones, CheckCheck, Clock, Star, Pin } from "@/components/icons/glyphs";
import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { getMessages, MESSAGE_PAGE_SIZE, sendMessageAction, editMessageAction } from "@/api";
import { ComposerOverlay } from "@/components/ComposerOverlay";
import { compressImage } from "@/lib/imageCompression";
import { useUser } from "@/hooks/useUser";
import { LinkifiedText } from "@/components/LinkifiedText";
import { LinkPreview } from "@/components/LinkPreview";
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
import { Popover } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { directMessagePreview, parseFundLinkMessage } from "@/lib/directMessage";
import { draftKey, usePersistentDraft } from "@/lib/draftStorage";
import { useDraftMedia } from "@/hooks/useDraftMedia";
import { readChatAttachments } from "@/lib/chatAttachments";

import { confirmCard } from "@/components/ConfirmCard";
import { ComposerSlot } from "@/components/ComposerSlot";
// A stable loading fallback. Creating [] inside the useQuery destructure gives
// the message-sync effect a new dependency on every render and can trigger
// React's maximum-update-depth failure while a slow connection is still loading.
const EMPTY_DIRECT_MESSAGES: any[] = [];

export const Route = createFileRoute("/app/chat/$id")({
  component: ChatViewPage,
});

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

/**
 * WhatsApp-style receipts on my messages:
 * a clock while sending, one tick once saved, two ticks when it has reached
 * their phone, two pink ticks once they have opened the chat and seen it.
 */
function MessageTicks({ message }: { message: any }) {
  if (message.pending) return <Clock className="h-3 w-3" aria-label="Sending" />;
  if (message.is_read || message.read_at) {
    return <CheckCheck className="h-[15px] w-[15px] text-[#a5f0ff]" strokeWidth={2.4} aria-label="Seen" />;
  }
  if (message.delivered_at) return <CheckCheck className="h-[15px] w-[15px]" strokeWidth={2.2} aria-label="Delivered" />;
  return <Check className="h-[14px] w-[14px]" strokeWidth={2.4} aria-label="Sent" />;
}

function DMMessageBubble({ m, isMe, time, otherUser, startEditing, handleDecideClubRequest, messages, onReply, onReact, currentUser, groupStart = true, groupEnd = true, highlighted = false, onToggleHighlight, onForward, onReplyText, onTogglePin }: any) {
  const [viewer, setViewer] = React.useState<{ urls: string[]; index: number; types?: ("image" | "video")[]; caption?: string } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
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

  // Opening the menu cancels any swipe in progress, so lifting the finger
  // afterwards doesn't also trigger a reply or snap the bubble.
  const openActions = () => {
    isSwiping.current = false;
    setSwipeOffset(0);
    setActionsOpen(true);
    if (window.navigator.vibrate) window.navigator.vibrate(30);
  };

  const startLongPress = () => {
    cancelLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      // Long-press: the message menu (react, reply, copy, forward, highlight…).
      if (isSwiping.current) openActions();
    }, 380);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  useEffect(() => () => cancelLongPress(), []);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (!('touches' in e) && e.button !== 0) return;
    // Taps on buttons, links and players inside the bubble aren't a long-press.
    if ((e.target as HTMLElement).closest('button, a, input, textarea, [role="slider"]')) return;
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

    // Every message, sent or received, swipes right to reply.
    if (diffX > 0) {
      const offset = Math.min(diffX, maxSwipe);
      setSwipeOffset(offset);
      if (offset >= 45 && swipeOffset < 45) {
        if (window.navigator.vibrate) window.navigator.vibrate(10);
      }
    } else {
      setSwipeOffset(0);
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
  // Photos and videos show on their own, with any text as a bubble under them.
  const mediaTokens: any[] = m.content.includes('$$MEDIA$$') ? m.content.split('$$MEDIA$$')[1].split(',').filter(Boolean).map((t: string) => decodeChatMedia(t)) : [];
  const visuals = mediaTokens.filter((x) => x.type === 'image' || x.type === 'video') as ChatVisual[];
  const otherMedia = mediaTokens.filter((x) => x.type !== 'image' && x.type !== 'video');
  const hasVisual = visuals.length > 0;
  const captionText = m.content.split('$$MEDIA$$')[0].trim();
  const needsBubble = !hasVisual || Boolean(captionText) || otherMedia.length > 0 || Boolean(repliedMessage) || Boolean(m.forwarded) || highlighted;

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
    <>
    <div 
      id={`message-${m.id}`}
      className={`group/row relative flex w-full select-none [@media(hover:hover)_and_(pointer:fine)]:select-text transition-colors duration-500 ${groupStart ? 'mt-2.5' : 'mt-[3px]'} ${isMe ?'justify-end' : 'justify-start'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      onTouchCancel={() => { cancelLongPress(); isSwiping.current = false; setSwipeOffset(0); }}
      // Android's own long-press and a desktop right-click both open the menu.
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('a, video, audio, input, textarea')) return;
        event.preventDefault();
        cancelLongPress();
        openActions();
      }}
      style={{ 
        // No text-selection callout on long-press: the menu has Copy instead.
        WebkitTouchCallout: 'none',
        transform: `translateX(${swipeOffset}px)`,
        transition: isSwiping.current ? 'none' : 'transform 0.2s ease-out'
      }}
    >
      {/* Reply icon: slides in from the left as any message is swiped right. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/[0.06]"
        style={{
          opacity: Math.min(swipeOffset / 45, 1),
          transform: `translate(-40px, -50%) scale(${Math.min(swipeOffset / 45, 1)})`,
          transition: isSwiping.current ? 'none' : 'all 0.2s ease-out'
        }}
      >
        <Reply className="h-4 w-4 text-foreground" />
      </div>

      <div className={`flex gap-2 relative z-10 max-w-[80%] ${isMe ?'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Their avatar sits beside the last message of a run, like a
            signature; earlier messages in the run keep its space empty. */}
        {!isMe && !groupEnd && <span className="w-7 shrink-0" />}
        {!isMe && groupEnd && (
          <Link to="/app/profile/$id" params={{ id: m.sender_id }} className="grid h-7 w-7 shrink-0 place-items-center self-end overflow-hidden rounded-full bg-foreground/[0.06] text-[12px] font-semibold text-muted-foreground transition hover:opacity-80">
            {otherUser?.avatar_url ? (
              <img src={otherUser.avatar_url} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
            )}
          </Link>
        )}


        <div className={`flex flex-col ${isMe ?"items-end" : "items-start"} min-w-0`}>
          <>
              <div className={hasVisual ? `relative group flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}` : `relative group px-3.5 py-2 flex flex-col rounded-[18px] ${highlighted ? 'ring-2 ring-[#cc208f]/70' : ''} ${
                isMe
                  ? `bg-[linear-gradient(135deg,#d6309b_0%,#b0187f_100%)] text-right text-white shadow-[0_8px_20px_-12px_rgba(204,32,143,0.75)] ${groupEnd ? 'rounded-br-[4px]' : ''} ${!groupStart ? 'rounded-tr-[4px]' : ''}`
                  : `bg-foreground/[0.07] text-left ${groupEnd ? 'rounded-bl-[4px]' : ''} ${!groupStart ? 'rounded-tl-[4px]' : ''}`
              }`}>
                {hasVisual && (
                  <ChatMediaGrid
                    items={visuals}
                    mine={isMe}
                    onOpen={(index) => setViewer({ urls: visuals.map((v) => v.url), index, types: visuals.map((v) => v.type), caption: captionText })}
                    overlay={!needsBubble ? (<>{m.is_edited && <span>edited</span>}{time}{isMe && <MessageTicks message={m} />}</>) : undefined}
                  />
                )}
                {needsBubble && (
                <div className={hasVisual ? `relative flex max-w-[min(72vw,300px)] flex-col rounded-[18px] px-3.5 py-2 ${highlighted ? 'ring-2 ring-[#cc208f]/70' : ''} ${
                  isMe
                    ? `bg-[linear-gradient(135deg,#d6309b_0%,#b0187f_100%)] text-right text-white shadow-[0_8px_20px_-12px_rgba(204,32,143,0.75)] ${groupEnd ? 'rounded-br-[4px]' : ''} rounded-tr-[6px]`
                    : `bg-foreground/[0.07] text-left ${groupEnd ? 'rounded-bl-[4px]' : ''} rounded-tl-[6px]`
                }` : 'contents'}>
                
                {(m.forwarded || highlighted) && (
                  <span className={`mb-0.5 flex items-center gap-1.5 text-[11.5px] italic ${isMe ? 'justify-end text-white/65' : 'text-muted-foreground'}`}>
                    {m.forwarded && <><Forward className="h-3.5 w-3.5" /> Forwarded</>}
                    {highlighted && <Star className="h-3.5 w-3.5 fill-[#cc208f] text-[#cc208f]" aria-label="Highlighted" />}
                  </span>
                )}
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
                    className={`mb-1.5 rounded-[12px] px-2.5 py-1.5 text-left cursor-pointer hover:opacity-80 transition-opacity ${isMe ? 'bg-white/15' : 'bg-card'}`}
                  >
                    <span className={`block text-[12px] font-semibold mb-0.5 ${isMe ?'text-white/80' : 'text-foreground'}`}>
                      {repliedMessage.sender_id === (isMe ? m.sender_id : otherUser?.id) ? 'You' : (otherUser?.full_name || otherUser?.username || 'Someone')}
                    </span>
                    <p className={`text-[13px] truncate max-w-[200px] ${isMe ?'text-white/85' : 'text-muted-foreground'}`}>
                      {directMessagePreview(repliedMessage.content, { sentByCurrentUser: repliedMessage.sender_id === currentUser?.id })}
                    </p>
                  </div>
                )}

                {m.content.startsWith('TUTOR_INVITE:') ? (
                  <div className="flex flex-col gap-3 min-w-[200px]">
                    <div className="font-bold flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Tutor Invitation
                    </div>
                    <p className={`text-[14px] ${isMe ?'text-white/90' : 'text-foreground/90'}`}>
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
                        ? "border-white/20 bg-white/[0.08] hover:bg-white/[0.13]"
                        : "border-primary/20 bg-card hover:border-primary/35 hover:shadow-sm"
                    }`}
                  >
                    <span className="flex items-start gap-3 p-3.5">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${isMe ? "bg-white/15" : "bg-primary/10 text-primary"}`}>
                        <WalletCards className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[10px] font-semibold uppercase tracking-[0.12em] ${isMe ? "text-white/65" : "text-primary"}`}>
                          Zero Club wallet
                        </span>
                        <span className="mt-1 block text-[14px] font-bold leading-snug">
                          {isMe ? "Your wallet fund link" : `Fund ${fundLink.ownerName}'s wallet`}
                        </span>
                        <span className={`mt-1 block text-[11px] leading-relaxed ${isMe ? "text-white/70" : "text-muted-foreground"}`}>
                          {isMe ? "Shared in this conversation" : "Pay securely with your wallet or card"}
                        </span>
                      </span>
                    </span>
                    <span className={`flex items-center justify-between border-t px-3.5 py-2.5 pr-14 text-[11px] font-bold ${isMe ? "border-white/15 text-white" : "border-border/60 text-primary"}`}>
                      {isMe ? "View fund link" : "Open and fund wallet"}
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/fund:-translate-y-0.5 group-hover/fund:translate-x-0.5" />
                    </span>
                  </a>
                ) : m.content.startsWith('ACCEPTED_TUTOR_INVITE:') ? (
                   <p className={`text-[14px] font-bold ${isMe ? 'text-white' : 'text-green-600 dark:text-green-400'}`}>✅ Accepted invitation to join {m.content.split(':')[1]}</p>
                ) : m.content.startsWith('REJECTED_TUTOR_INVITE:') ? (
                   <p className={`text-[14px] font-bold ${isMe ? 'text-white' : 'text-red-600 dark:text-red-400'}`}>❌ Rejected invitation to join {m.content.split(':')[1]}</p>
                ) : (
                  <p className={`text-[15px] leading-[1.4] whitespace-pre-wrap text-left break-words ${isMe ?'text-white' : 'text-foreground'}`}>
                    <LinkifiedText text={m.content.split('$$MEDIA$$')[0].trim()} linkColor={isMe ? "text-white underline font-semibold hover:opacity-80" : "text-[#cc208f] underline font-semibold hover:opacity-80"} />
                    {/* Time and ticks float to the end of the last line, or
                        drop to their own line when the text fills it, so
                        they never sit on top of the words. */}
                    {otherMedia.length === 0 && (
                      <span className={`float-right ml-2.5 mt-[6px] -mb-[3px] inline-flex items-center gap-1 text-[11px] leading-none tabular-nums ${isMe ? 'text-white/65' : 'text-muted-foreground'}`}>
                        {m.is_edited && <span>edited</span>}
                        {time}
                        {isMe && <MessageTicks message={m} />}
                      </span>
                    )}
                  </p>
                )}
                
                {!fundLink && !/^(TUTOR_INVITE|ACCEPTED_TUTOR_INVITE|REJECTED_TUTOR_INVITE|CLUB_REQUEST):/.test(m.content) && (
                  <LinkPreview text={m.content} mine={isMe} />
                )}
                {otherMedia.length > 0 && (
                  <div className={`mt-1.5 rounded-[12px] overflow-hidden transition-colors ${
                    otherMedia.length >= 2
                      ? "grid grid-cols-2 gap-0.5 max-h-[240px]"
                      : "flex justify-start"
                  }`}>
                    {otherMedia.map((media: any, i: number) => {
                      return (
                        <div key={i} className={`relative overflow-hidden w-full ${
                          media.type === 'audio' || media.type === 'file' ? 'min-w-[220px] p-1' : otherMedia.length === 1 ? "max-h-[300px]" : "aspect-square"
                        }`}>
                          {media.type === 'video' ? (
                            <video src={media.url} controls className="h-full w-full object-cover" />
                          ) : media.type === 'audio' ? (
                            <VoiceNotePlayer src={media.url} name={media.name} mine={isMe} avatarUrl={isMe ? null : otherUser?.avatar_url} />
                          ) : media.type === 'file' ? (
                            <a href={media.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 text-left"><FileText className="h-6 w-6 shrink-0" /><span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{media.name}</span><Download className="h-4 w-4 shrink-0" /></a>
                          ) : (
                            <img loading="lazy" decoding="async" src={media.url} className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-90" onClick={(event) => {
                              event.stopPropagation();
                              // Opens in the app's photo viewer, never a browser tab.
                              const images = m.content.split('$$MEDIA$$')[1].split(',').map((t: string) => decodeChatMedia(t)).filter((x: any) => x.type === 'image').map((x: any) => x.url);
                              setViewer({ urls: images, index: Math.max(0, images.indexOf(media.url)) });
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Media and cards: time and ticks on their own line under them. */}
                {(otherMedia.length > 0 || fundLink || m.content.startsWith('ACCEPTED_TUTOR_INVITE:') || m.content.startsWith('REJECTED_TUTOR_INVITE:') || m.content.startsWith('CLUB_REQUEST:') || m.content.startsWith('TUTOR_INVITE:')) && (
                  <span className={`mt-1 flex items-center justify-end gap-1 text-[11px] leading-none tabular-nums ${isMe ? 'text-white/65' : 'text-muted-foreground'}`}>
                    {m.is_edited && <span>edited</span>}
                    {time}
                    {isMe && <MessageTicks message={m} />}
                  </span>
                )}

                </div>
                )}

                {/* Desktop: the message menu on hover, without taking up any room. */}
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setActionsOpen(true); }}
                  aria-label="Message options"
                  title="Message options"
                  aria-haspopup="dialog"
                  aria-expanded={actionsOpen}
                  className={`absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 [@media(hover:hover)_and_(pointer:fine)]:grid place-items-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border transition-opacity hover:text-foreground [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 ${isMe ? '-left-9' : '-right-9'}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>

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
                      className={`-mt-2.5 flex items-center gap-0.5 px-0.5 text-[11px] font-semibold transition-transform active:scale-90 ${
                        data.me ? 'text-[#cc208f]' : 'text-muted-foreground'
                      }`}
                    >
                      <span className="text-[18px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">{emoji}</span>
                      {data.count > 1 && <span>{data.count}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
        </div>
      </div>
    </div>
    {/* Outside the swipe/long-press area: taps inside the menu or the photo
        viewer must not start another long-press or swipe on the message. */}
              {viewer && (
                <ImageLightbox
                  mediaUrls={viewer.urls}
                  initialIndex={viewer.index}
                  mediaTypes={viewer.types}
                  caption={viewer.caption}
                  isOpen
                  onClose={() => setViewer(null)}
                  allowDownload
                  sender={{
                    name: isMe ? 'You' : otherUser?.full_name || otherUser?.username || 'Photo',
                    avatarUrl: isMe ? currentUser?.avatar_url : otherUser?.avatar_url,
                    time: new Date(m.created_at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
                  }}
                  onReply={(text: string) => onReplyText?.(m, text)}
                />
              )}

              <MessageActionsSheet
                open={actionsOpen}
                onOpenChange={setActionsOpen}
                message={m}
                isMe={isMe}
                highlighted={highlighted}
                onReact={(emoji: string) => onReact(m.id, emoji)}
                onReply={() => onReply(m)}
                onEdit={() => startEditing(m)}
                onForward={() => onForward?.(m)}
                onToggleHighlight={() => onToggleHighlight?.(m)}
                pinned={Boolean(m.pinned_at)}
                onTogglePin={
                  onTogglePin && !m.pending && !String(m.content || "").startsWith("CLUB_REQUEST:")
                    ? () => onTogglePin(m)
                    : undefined
                }
              />
    </>
  );
}

function ChatViewPage() {
  const goBackSmart = useGoBack("/app/chat");
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [enterToSend] = useEnterToSend();
  const { data: currentUserProfile } = useUser();
  // Online status and "typing…" for this conversation.
  const otherOnline = useIsOnline(id);
  const typingToMe = useInboxTyping(currentUserProfile?.id);
  const otherTyping = typingToMe.has(id);
  const { notifyTyping, stopTyping } = useSendTypingTo(id, currentUserProfile?.id);

  // Highlighted messages (private to me) and the message being forwarded.
  const [forwarding, setForwarding] = useState<any | null>(null);
  const { data: highlightIds = new Set<string>(), refetch: refetchHighlights } = useQuery({
    queryKey: ["message-highlights", currentUserProfile?.id],
    enabled: Boolean(currentUserProfile?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("message_highlights").select("message_id").eq("profile_id", currentUserProfile!.id);
      if (error) throw error;
      return new Set<string>((data || []).map((row: { message_id: string }) => row.message_id));
    },
  });
  const toggleHighlight = async (message: any) => {
    if (!currentUserProfile?.id || String(message.id).startsWith("pending-")) return;
    const on = highlightIds.has(message.id);
    const key = ["message-highlights", currentUserProfile.id];
    const next = new Set(highlightIds);
    if (on) next.delete(message.id); else next.add(message.id);
    queryClient.setQueryData(key, next);
    const { error } = on
      ? await supabase.from("message_highlights").delete().eq("message_id", message.id).eq("profile_id", currentUserProfile.id)
      : await supabase.from("message_highlights").insert({ message_id: message.id, profile_id: currentUserProfile.id });
    if (error) { queryClient.setQueryData(key, highlightIds); return toast.error("Could not save the highlight. Please try again."); }
    toast.success(on ? "Removed from favourites" : "Added to favourites", on ? undefined : { description: "Find it any time in this chat's details." });
    void refetchHighlights();
  };
  // Replying from the photo viewer: sends the text as a reply to that photo.
  const replyWithText = async (message: any, text: string) => {
    const saved = await sendMessageAction({ receiverId: id, content: text, reply_to_id: message.id });
    setMessages((previous) => (previous.some((m) => m.id === saved.id) ? previous : [...previous, saved]));
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };
  const navigate = useNavigate();

  const { data: otherUser } = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
      return data;
    },
    // Keeps "Online" / "last seen" current while the chat is open.
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: loadedMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => getMessages(id),
    staleTime: 0,
  });
  const initialMessages = loadedMessages ?? EMPTY_DIRECT_MESSAGES;

  const [messages, setMessages] = useState<any[]>([]);
  const messageDraftKey = draftKey(currentUserProfile?.id, "dm", id);
  const [input, setInput] = usePersistentDraft(messageDraftKey, "");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = usePersistentDraft<string | null>(messageDraftKey && messageDraftKey + ":editing", null);
  const [replyingTo, setReplyingTo] = usePersistentDraft<any>(messageDraftKey && messageDraftKey + ":reply", null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { files: mediaFiles, setFiles: setMediaFiles, previews: mediaPreviews, setPreviews: setMediaPreviews, addFiles: addMediaFiles, removeFile: removeMediaFile } = useDraftMedia(messageDraftKey && messageDraftKey + ":media");
  const { isRecording, recordingSeconds, startRecording, stopRecording } = useVoiceRecorder((file) => {
    addMediaFiles([file]);
  });
  const [isUploading, setIsUploading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => typeof window !== 'undefined' && localStorage.getItem(`zero-chat-muted:${id}`) === 'true');
  const [reporting, setReporting] = useState(false);
  const [viewportHeight, setViewportHeight] = useState("100dvh");
  const [viewportTop, setViewportTop] = useState("0px");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);

  /*
   * The rest of the conversation, when it is asked for.
   *
   * Opening a chat now loads the recent end only, so history has to be
   * reachable. Scroll position is measured before the prepend and restored
   * after it — otherwise adding messages above the viewport throws the reader
   * up the page, which feels like the app losing their place.
   */
  const loadOlderMessages = async () => {
    if (loadingOlder || reachedStart || messages.length === 0) return;
    setLoadingOlder(true);
    const container = scrollRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const previousTop = container?.scrollTop ?? 0;

    try {
      const older = await getMessages(id, MESSAGE_PAGE_SIZE, messages[0]?.created_at);
      if (older.length < MESSAGE_PAGE_SIZE) setReachedStart(true);
      if (older.length > 0) {
        const known = new Set(messages.map((m: any) => m.id));
        const fresh = older.filter((m: any) => !known.has(m.id));
        if (fresh.length > 0) {
          setMessages((current) => [...fresh, ...current]);
          requestAnimationFrame(() => {
            if (!container) return;
            container.scrollTop = previousTop + (container.scrollHeight - previousHeight);
          });
        }
      }
    } catch {
      toast.error("Could not load older messages");
    } finally {
      setLoadingOlder(false);
    }
  };

  /* Pins: either person pins a message for both to see, shown under the
     header. Read from the database (not only what's loaded), so a pin on an
     old message still shows. At most 3 per chat; the newest is first. */
  const pinsKey = ["dm-pins", currentUserId, id];
  const { data: pins = [] } = useQuery({
    queryKey: pinsKey,
    enabled: Boolean(currentUserId && id),
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at, pinned_at")
        .not("pinned_at", "is", null)
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${currentUserId})`)
        .order("pinned_at", { ascending: false })
        .limit(3);
      return (data || []) as { id: string; content: string; sender_id: string; created_at: string; pinned_at: string }[];
    },
  });
  const [pinCursor, setPinCursor] = useState(0);
  // Pins change on either phone; any update to this chat refreshes them.
  const pinsSignature = messages.map((m) => (m.pinned_at ? m.id : "")).join("");
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["dm-pins", currentUserId, id] });
  }, [pinsSignature, queryClient, currentUserId, id]);

  const togglePin = async (message: any) => {
    const next = !message.pinned_at;
    const apply = (pinnedAt: string | null) =>
      setMessages((previous) => previous.map((m) => (m.id === message.id ? { ...m, pinned_at: pinnedAt } : m)));
    apply(next ? new Date().toISOString() : null);
    const { error } = await supabase.rpc("set_direct_message_pin" as any, { p_message: message.id, p_pinned: next });
    if (error) {
      apply(message.pinned_at || null);
      toast.error("Could not update the pin");
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["dm-pins", currentUserId, id] });
    toast.success(next ? "Pinned for both of you" : "Unpinned");
  };

  /* Favourites: messages in this chat starred to come back to. */
  const { data: favourites = [] } = useQuery({
    queryKey: ["chat-favourites", currentUserId, id, highlightIds.size],
    enabled: Boolean(currentUserId && id && highlightIds.size > 0),
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at")
        .in("id", [...highlightIds])
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${currentUserId})`)
        .order("created_at", { ascending: false });
      return (data || []) as { id: string; content: string; sender_id: string; created_at: string }[];
    },
  });

  /** Close the details, load back far enough if needed, then scroll to the message and flash it. */
  const jumpToMessage = async (message: { id: string; created_at: string }) => {
    // Reading back in history: don't let the bottom-pin pull the view away.
    stickToBottom.current = false;
    setInfoOpen(false);
    const flash = () => {
      const el = document.getElementById(`message-${message.id}`);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("zc-message-flash");
      window.setTimeout(() => el.classList.remove("zc-message-flash"), 1800);
      return true;
    };
    if (flash()) return;
    // Older than what's on screen: fetch everything from it up to the oldest loaded message.
    const oldest = messages[0]?.created_at;
    if (oldest) {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${currentUserId})`)
        .gte("created_at", message.created_at)
        .lt("created_at", oldest)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (data?.length) {
        setMessages((current) => {
          const known = new Set(current.map((m: any) => m.id));
          return [...data.filter((m: any) => !known.has(m.id)), ...current];
        });
      }
    }
    // Give the newly loaded messages a moment to render.
    window.setTimeout(() => {
      if (!flash()) toast.error("Could not find that message");
    }, 350);
  };

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
    setReachedStart(visibleMessages.length < MESSAGE_PAGE_SIZE);
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
          filter: `sender_id=eq.${currentUserId}`,
        },
        (payload) => {
          // My message was delivered or seen: update its ticks.
          const updated = payload.new as any;
          if (updated.receiver_id !== id) return;
          setMessages((previous) => previous.map((message) =>
            message.id === updated.id ? { ...message, ...updated } : message
          ));
        }
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
      // Reactions in this chat, live. RLS only sends reactions on messages
      // this person is part of; the id check keeps it to this conversation.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const r = payload.new as any;
          if (r.profile_id === currentUserId) return;
          setMessages((previous) => previous.map((message) =>
            message.id === r.message_id && !(message.reactions || []).some((x: any) => x.id === r.id)
              ? { ...message, reactions: [...(message.reactions || []), r] }
              : message
          ));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const r = payload.old as any;
          if (!r?.id || r.profile_id === currentUserId) return;
          setMessages((previous) => previous.map((message) =>
            (message.reactions || []).some((x: any) => x.id === r.id)
              ? { ...message, reactions: message.reactions.filter((x: any) => x.id !== r.id) }
              : message
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

  /*
   * Open at the newest message and stay pinned there.
   *
   * The list is "stuck to the bottom" until the reader scrolls up. While
   * stuck, new messages and late-loading images/videos (which grow the page
   * after the first paint — the reason chats used to open part-way up) keep it
   * at the bottom. Scrolling up releases it, so reading history or loading
   * older messages is never yanked away.
   */
  const stickToBottom = useRef(true);
  useEffect(() => {
    stickToBottom.current = true;
  }, [id]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pin = () => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    };
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // load/loadedmetadata don't bubble, so listen in the capture phase.
    el.addEventListener('load', pin, true);
    el.addEventListener('loadedmetadata', pin, true);
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(pin) : null;
    resize?.observe(el);
    Array.from(el.children).forEach((child) => resize?.observe(child));
    const settle = [60, 250, 700].map((ms) => window.setTimeout(pin, ms));
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('load', pin, true);
      el.removeEventListener('loadedmetadata', pin, true);
      resize?.disconnect();
      settle.forEach(window.clearTimeout);
    };
  }, [id, messages.length > 0]);

  const handleChatMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = readChatAttachments(e.currentTarget);
    const accepted = selected.filter(file => {
      if (file.size > UPLOAD_LIMIT_MB * 1024 * 1024) {
        toast.error(tooLargeMessage(file));
        return false;
      }
      return true;
    });
    addMediaFiles(accepted);
  };

  const removeMedia = removeMediaFile;

  const handleClearChat = async () => {
    if (!(await confirmCard('Clear this conversation from this device? New messages will still appear.'))) return;
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
    if (!(await confirmCard(`Report ${otherUser?.full_name || otherUser?.username || 'this user'} for inappropriate direct messages?`))) return;
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
    stopTyping();

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
          for (const original of mediaFiles) {
            // Shrunk before it is sent, not after. Everyone in the thread pays
            // the download cost of whatever gets stored here.
            const file = await compressImage(original);
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${currentUserId}/${fileName}`;
            const { error: uploadError } = await supabase.storage
              .from('post-media')
              .upload(filePath, file, { cacheControl: '31536000', contentType: file.type || undefined });
            if (uploadError) throw uploadError;
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage.from('post-media').getPublicUrl(filePath);
              uploadedUrls.push(encodeChatMedia(getChatMediaType(file), publicUrl, original.name));
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
        stickToBottom.current = true;
        setMessages((previous) => [...previous, optimisticMessage]);
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
      setInput((current) => current === originalInput ? "" : current);
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
      toast.dismiss("upload");
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
    
    const setReactions = (fn: (rs: any[]) => any[]) =>
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reactions: fn(m.reactions || []) } : m)));

    if (existingReaction) {
      setReactions((rs) => rs.filter((r: any) => !(r.profile_id === currentUserId && r.emoji === emoji)));
      // By its natural key, so a reaction added moments ago (still holding a
      // temporary id on screen) is removed too.
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('profile_id', currentUserId)
        .eq('emoji', emoji);
      if (error) {
        setReactions((rs) => [...rs, existingReaction]);
        toast.error("Couldn't remove your reaction");
      }
    } else {
      const tempId = `pending-${crypto.randomUUID()}`;
      setReactions((rs) => [...rs, { id: tempId, message_id: messageId, profile_id: currentUserId, emoji }]);
      const { data, error } = await supabase
        .from('message_reactions')
        .insert([{ message_id: messageId, profile_id: currentUserId, emoji }])
        .select('id, message_id, profile_id, emoji, created_at')
        .single();
      if (error && error.code !== '23505') {
        setReactions((rs) => rs.filter((r: any) => r.id !== tempId));
        toast.error("Couldn't add your reaction");
        return;
      }
      if (data) setReactions((rs) => rs.map((r: any) => (r.id === tempId ? data : r)));
    }
    // Keep the cached copy and the inbox preview in step.
    void queryClient.invalidateQueries({ queryKey: ["messages", id] });
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  if (messagesLoading && messages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // "Message yourself": your own notes, links and files.
  const isSelfChat = Boolean(currentUserId && id === currentUserId);
  const isSupportChat = Boolean(otherUser?.is_admin) && !isSelfChat;
  const otherUserDisplayName = isSelfChat
    ? `${otherUser?.full_name || otherUser?.username || "You"} (You)`
    : isSupportChat
      ? "Zero Club Support"
      : otherUser?.full_name || otherUser?.username;

  // Live: "typing…" beats "online" beats "last seen".
  const presence = (() => {
    if (isSelfChat) return { tone: 'self', label: 'Message yourself' };
    if (otherTyping) return { tone: 'typing', label: 'typing' };
    if (isSupportChat) return { tone: 'support', label: 'Official Zero Club support' };
    if (otherOnline || isRecentlySeen(otherUser?.last_seen_at)) return { tone: 'active', label: 'Online' };
    return { tone: 'offline', label: lastSeenLabel(otherUser?.last_seen_at) || 'Tap for profile' };
  })();

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  };

  // Something to send (text, attachments or an edit): tools fold away, Send shows.
  const composerHasContent = Boolean(input.trim()) || mediaFiles.length > 0 || Boolean(editingId);

  return (
    <div 
      className="zc-chat-panel fixed inset-x-0 z-[60] mx-auto flex max-w-none flex-col overflow-hidden bg-background md:border-x md:border-border/60 md:left-[var(--zc-sidebar-w,280px)] md:right-0 md:mx-0 md:max-w-none xl:right-[336px]"
      style={{ height: viewportHeight, top: viewportTop }}
    >
      <header className="relative z-10 flex items-center gap-1 bg-background/85 px-2 pb-2 shadow-[0_10px_24px_-22px_rgba(0,0,0,0.6)] backdrop-blur-xl pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <button onClick={goBackSmart} aria-label="Back to messages" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
          <ArrowLeft className="h-[22px] w-[22px]" />
        </button>

        <Link to="/app/profile/$id" params={{ id }} className="flex min-w-0 flex-1 items-center gap-2.5 tap" aria-label={`Open ${otherUserDisplayName || 'user'} profile`}>
          <span className="relative shrink-0">
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[13px] font-semibold text-muted-foreground">
              {otherUser?.avatar_url ? (
                <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : isSupportChat ? (
                <Headphones className="h-[18px] w-[18px]" />
              ) : (
                (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
              )}
            </span>
            {presence.tone === 'active' && (
              <span className="absolute -bottom-px -right-px h-3 w-3 rounded-full border-2 border-card bg-success" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[15px] font-semibold leading-tight text-foreground">
              <span className="truncate">{otherUserDisplayName}</span>
              {isSupportChat && <BadgeCheck className="h-4 w-4 shrink-0 fill-current text-accent" />}
            </span>
            <span className={`flex items-center gap-1 truncate text-[12px] font-medium ${presence.tone === 'active' || presence.tone === 'typing' ? 'text-success' : 'text-muted-foreground'}`}>
              {presence.label}
              {presence.tone === 'typing' && <span className="zc-typing-dots inline-flex items-center gap-[3px]"><span /><span /><span /></span>}
            </span>
          </span>
        </Link>

        <button onClick={() => setInfoOpen(true)} aria-label="Conversation details" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
          <Info className="h-[22px] w-[22px]" />
        </button>
      </header>

      {pins.length > 0 && (() => {
        const index = pinCursor % pins.length;
        const current = pins[index];
        return (
          <button
            type="button"
            onClick={() => {
              void jumpToMessage(current);
              setPinCursor((c) => c + 1);
            }}
            className="relative z-10 mx-3 mt-2 flex w-auto shrink-0 items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2 text-left shadow-[0_8px_24px_-18px_rgba(0,0,0,0.6)] ring-1 ring-foreground/[0.06] transition active:scale-[0.99]"
          >
            <Pin className="h-4 w-4 shrink-0 fill-current text-[#cc208f]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-[#cc208f]">
                Pinned{pins.length > 1 ? ` · ${index + 1} of ${pins.length}` : ""}
              </span>
              <span className="block truncate text-[13.5px] text-foreground/85">
                {directMessagePreview(current.content) || contentPreview(current.content) || "Message"}
              </span>
            </span>
          </button>
        );
      })()}

      <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
        <SheetContent side="right" overlayClassName="z-[90]" className="z-[100] w-[min(92vw,380px)] border-l border-border bg-background p-0">
          <SheetHeader className="border-b border-border/60 px-5 py-5 text-left">
            <SheetTitle>Conversation details</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto no-scrollbar p-5">
            <div className="flex flex-col items-center text-center">
              <Link to="/app/profile/$id" params={{ id }} onClick={() => setInfoOpen(false)} className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-muted text-xl font-semibold text-muted-foreground transition active:scale-95">
                {otherUser?.avatar_url ? <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()}
              </Link>
              <h3 className="mt-3 text-[16px] font-semibold tracking-tight">{otherUser?.full_name || otherUser?.username}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">@{otherUser?.username}</p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-card p-3 text-center"><p className="text-[18px] font-semibold tabular-nums">{messages.length}</p><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Messages</p></div>
              <div className="rounded-lg border border-border bg-card p-3 text-center"><p className="text-[18px] font-semibold tabular-nums">{messages.filter((message) => message.content?.includes('$$MEDIA$$')).length}</p><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Attachments</p></div>
            </div>

            {/* Favourites: starred messages in this chat. Tap one to jump to it. */}
            <section className="mt-5">
              <h4 className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-[#cc208f] text-[#cc208f]" /> Favourites
                {favourites.length > 0 && <span className="ml-auto tabular-nums normal-case tracking-normal">{favourites.length}</span>}
              </h4>
              {favourites.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-[13px] leading-relaxed text-muted-foreground">
                  Press and hold a message, then tap <span className="font-semibold text-foreground">Add to favourites</span> to keep it here.
                </p>
              ) : (
                <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border bg-card no-scrollbar">
                  {favourites.map((fav) => {
                    const mine = fav.sender_id === currentUserId;
                    const text = contentPreview(fav.content) || 'Message';
                    return (
                      <button
                        key={fav.id}
                        type="button"
                        onClick={() => void jumpToMessage(fav)}
                        className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-accent/40"
                      >
                        <Star className="mt-0.5 h-4 w-4 shrink-0 fill-[#cc208f] text-[#cc208f]" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                            <span className="truncate font-semibold text-foreground">{mine ? 'You' : otherUserDisplayName}</span>
                            <span className="shrink-0 tabular-nums">{new Date(fav.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-foreground/90">{text}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
              <Link to="/app/profile/$id" params={{ id }} onClick={() => setInfoOpen(false)} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 text-[13px] font-medium hover:bg-accent/40"><UserRound className="h-4 w-4 text-muted-foreground" /> View profile <ChevronLeft className="ml-auto h-4 w-4 rotate-180 text-muted-foreground" /></Link>
              <button onClick={toggleMuteConversation} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-left text-[13px] font-medium hover:bg-accent/40">{isMuted ? <Bell className="h-4 w-4 text-muted-foreground" /> : <BellOff className="h-4 w-4 text-muted-foreground" />} {isMuted ? 'Unmute conversation' : 'Mute conversation'}</button>
              <button onClick={handleClearChat} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-left text-[13px] font-medium text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /> Clear conversation</button>
              {!isSupportChat && (
                <button disabled={reporting} onClick={handleReportUser} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[13px] font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"><Flag className="h-4 w-4" /> {reporting ? 'Submitting…' : 'Report user'}</button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-28 pt-2 no-scrollbar"
      >
        {!reachedStart && (
          <div className="flex justify-center pb-2">
            <button
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="h-8 rounded-full bg-foreground/[0.06] px-4 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              {loadingOlder ? "Loading..." : "Load earlier messages"}
            </button>
          </div>
        )}

        {/* This block marks the beginning of the conversation, so it only
            belongs at the top once there is nothing older left to fetch. */}
        {reachedStart && (
        <div className="flex flex-col items-center pb-2 pt-6 text-center">
          <Link to="/app/profile/$id" params={{ id }} className="mb-2.5 grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full bg-foreground/[0.06] font-display text-[24px] font-semibold text-muted-foreground transition active:scale-95">
            {otherUser?.avatar_url ? (
              <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()
            )}
          </Link>
          <h3 className="font-display text-[18px] font-semibold text-foreground">{otherUserDisplayName}</h3>
          {/* The username, not "First name · Builder". The line above already
              carries the display name, so repeating a truncated version of it
              next to a label everyone shares said nothing about who this is. */}
          {isSelfChat ? (
            <p className="mt-1 max-w-[280px] text-[13px] leading-snug text-muted-foreground">
              Your private space. Save notes, links, photos and files — only you can see them.
            </p>
          ) : otherUser?.username && !isSupportChat && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">@{otherUser.username}</p>
          )}
          <Link
            to="/app/profile/$id"
            params={{ id }}
            className="mt-3 inline-flex h-8 items-center rounded-full border-[1.5px] border-foreground px-4 text-[14px] font-semibold text-foreground tap hover:bg-foreground/[0.04]"
          >
            View profile
          </Link>
        </div>
        )}

        {messages.map((m: any, index: number) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const nextNewDay = !next || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString();
          return (
          <React.Fragment key={m.id}>
          {newDay && (
            <div className="sticky top-1 z-[5] my-4 flex justify-center">
              <span className="rounded-full bg-card/90 px-3 py-1 text-[11.5px] font-semibold text-muted-foreground shadow-sm ring-1 ring-foreground/[0.05] backdrop-blur">
                {dayLabel(m.created_at)}
              </span>
            </div>
          )}
          <DMMessageBubble
            m={m}
            isMe={m.sender_id === currentUserId}
            groupStart={newDay || previous?.sender_id !== m.sender_id}
            groupEnd={nextNewDay || next?.sender_id !== m.sender_id}
            time={new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            otherUser={otherUser}
            startEditing={startEditing}
            handleDecideClubRequest={handleDecideClubRequest}
            messages={messages}
            onReply={(msg: any) => { setReplyingTo(msg); setEditingId(null); }}
            onReact={handleReact}
            currentUser={{ id: currentUserId, avatar_url: currentUserProfile?.avatar_url }}
            highlighted={highlightIds.has(m.id)}
            onToggleHighlight={toggleHighlight}
            onForward={(msg: any) => setForwarding(msg)}
            onReplyText={replyWithText}
            onTogglePin={togglePin}
          />
          </React.Fragment>
          );
        })}
        <ForwardSheet message={forwarding} onClose={() => setForwarding(null)} />
        {/* The other person is writing: a bubble on their side, like WhatsApp. */}
        {otherTyping && (
          <div className="mt-1 flex items-end gap-2" aria-live="polite" aria-label={`${otherUserDisplayName || 'They'} is typing`}>
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[11px] font-semibold text-muted-foreground">
              {otherUser?.avatar_url ? <img src={otherUser.avatar_url} alt="" className="h-full w-full object-cover" /> : (otherUser?.full_name || otherUser?.username || 'U').substring(0, 1).toUpperCase()}
            </span>
            <span className="zc-typing-dots flex h-9 items-center gap-1 rounded-2xl rounded-bl-md bg-foreground/[0.07] px-3.5 text-muted-foreground">
              <span /><span /><span />
            </span>
          </div>
        )}
      </div>

      {/* An overlay, not a footer. The thread keeps the full height and the
          composer rests on top of it.

          Absolute rather than fixed: this page is itself a fixed panel whose
          height follows visualViewport, so a fixed child would ignore both the
          desktop sidebar offset and the shrinking the keyboard causes. */}
      <ComposerOverlay position="absolute" maxWidthClassName="max-w-[820px]">
        {editingId && (
          <div className="mb-2 flex items-center justify-between rounded-2xl bg-card px-3 py-2 text-xs font-bold text-primary shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)] ring-1 ring-foreground/[0.06]">
            <span className="flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editing message</span>
            <button onClick={cancelEditing} className="hover:text-foreground grid h-6 w-6 place-items-center rounded-full hover:bg-primary/20 transition"><X className="h-3 w-3" /></button>
          </div>
        )}
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between rounded-2xl bg-card px-3 py-2 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)] ring-1 ring-foreground/[0.06]">
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
                  <VoiceNotePlayer src={preview} name={mediaFiles[idx]?.name} />
                ) : mediaFiles[idx]?.type.startsWith('video/') ? (
                  <video src={preview} className="h-full w-full object-cover" />
                ) : mediaFiles[idx]?.type.startsWith('image/') ? (
                  <img src={preview} className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
        
        {/* One container. The avatar used to sit outside the input, which read
            as two boxes side by side for what is a single action. */}
        <div
          className={`flex items-end gap-1 rounded-[28px] bg-card py-2 pr-2 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.65)] ring-1 transition-[padding] duration-200 ${composerHasContent ? "pl-4" : "pl-1.5"} ${editingId ? "ring-success/40" : "ring-foreground/[0.07] focus-within:ring-[#cc208f]/40"}`}
          style={{ fontFamily: 'var(--font-sans)', "--font-button": 'var(--font-sans)' } as React.CSSProperties}
        >
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
            {/* Options on the left, voice note on the right; both fold away
                while typing so only Send shows and the text gets the room. */}
            <ComposerSlot show={!composerHasContent}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Add attachment" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-95"><Paperclip className="h-[22px] w-[22px]" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="z-[100] w-44 border-border bg-background/95 shadow-lift backdrop-blur-xl">
                  <DropdownMenuItem onSelect={() => mediaInputRef.current?.click()} className="gap-2.5"><Image className="h-4 w-4" /> Pictures</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => videoInputRef.current?.click()} className="gap-2.5"><Film className="h-4 w-4" /> Video</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => fileInputRef.current?.click()} className="gap-2.5"><File className="h-4 w-4" /> File</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ComposerSlot>
            <MentionField
              people={otherUser?.username ? [{ id: otherUser.id, username: otherUser.username, full_name: otherUser.full_name, avatar_url: otherUser.avatar_url }] : []}
              peopleLabel="In this chat"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value.trim()) notifyTyping();
                else stopTyping();
                const target = e.target;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 132)}px`;
              }}
              onKeyDown={(e) => {
                if (isSendKey(e, enterToSend)) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              enterKeyHint={enterToSend ? "send" : "enter"}
              placeholder={editingId ? "Edit your message" : (replyingTo ? "Write a reply..." : "Start a message")} 
              className="block w-full flex-1 resize-none border-0 bg-transparent py-[11px] text-[16px] leading-[22px] text-foreground shadow-none outline-none focus:border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground no-scrollbar"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '132px', height: '44px' }}
            />
            <ComposerSlot show={!composerHasContent}>
              <button
                onClick={toggleVoiceRecording}
                title={isRecording ? 'Stop recording' : 'Record voice note'}
                className={`inline-flex h-11 items-center justify-center rounded-full transition active:scale-95 ${isRecording ? 'min-w-16 bg-red-500 px-3 text-white' : 'w-11 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'}`}
              >
                {isRecording ? <><Square className="h-4 w-4 fill-current" /><span className="ml-1.5 text-[12px] font-semibold tabular-nums">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</span></> : <Mic className="h-[22px] w-[22px]" />}
              </button>
            </ComposerSlot>
            <ComposerSlot show={composerHasContent}>
              <button 
                onClick={handleSendMessage}
                disabled={(!input.trim() && mediaFiles.length === 0) || sending}
                className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-95 ${
                  (input.trim() || mediaFiles.length > 0) && !sending ? (editingId ?'bg-success text-success-foreground' : 'bg-[linear-gradient(135deg,#d6309b,#b0187f)] text-white shadow-[0_6px_16px_-8px_rgba(204,32,143,0.8)]') : 'text-muted-foreground'
                }`}
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : (editingId ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />)}
              </button>
            </ComposerSlot>
        </div>
      </ComposerOverlay>
    </div>
  );
}
