import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, BarChart3, Check, Copy, File, FileText, Download, Image, Loader2, Lock, Mic, Paperclip, Pencil, Phone, Pin,
  Plus, Reply, Send, Square, Trash2, Users, Video, X,
} from "@/components/icons/glyphs";
import { useGoBack } from "@/hooks/useGoBack";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { LinkifiedText } from "@/components/LinkifiedText";
import { LinkPreview } from "@/components/LinkPreview";
import { MentionField } from "@/components/MentionField";
import { VoiceNotePlayer } from "@/components/VoiceNotePlayer";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ChatMediaGrid, type ChatVisual } from "@/components/ChatMediaGrid";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { compressImage } from "@/lib/imageCompression";
import { decodeChatMedia, encodeChatMedia, getChatMediaType, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { isSendKey, useEnterToSend } from "@/lib/chatPrefs";
import {
  displayName, editMessage, getGroup, getMembers, getMessages, getReactionsAndVotes, markRead, MESSAGE_PAGE, pinMessage, react,
  removeMessage, sendMessage, type GroupMessage, type GroupReaction, type GroupVote,
} from "@/features/groups/api";
import { GroupAvatar, PersonAvatar } from "@/features/groups/components";
import { PollCard, PollComposer } from "@/features/groups/Poll";
import { GroupInfoSheet } from "@/features/groups/GroupInfoSheet";

export const Route = createFileRoute("/app/chat/g/$groupId")({
  component: GroupChatPage,
});

const QUICK = ["❤️", "😂", "🔥", "👏", "🙏", "😮"];
const MEDIA = "$$MEDIA$$";

function GroupChatPage() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/app/chat");
  const queryClient = useQueryClient();
  const { data: me } = useUser();
  const myId: string = me?.id || "";
  const [enterToSend] = useEnterToSend();

  const groupQuery = useQuery({ queryKey: ["group", groupId], queryFn: () => getGroup(groupId) });
  const membersQuery = useQuery({ queryKey: ["group-members", groupId], queryFn: () => getMembers(groupId) });
  const group = groupQuery.data;
  const members = membersQuery.data || [];
  const memberById = useMemo(() => new Map(members.map((m) => [m.profile_id, m])), [members]);
  const myRole = memberById.get(myId)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reactions, setReactions] = useState<GroupReaction[]>([]);
  const [votes, setVotes] = useState<GroupVote[]>([]);
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [editing, setEditing] = useState<GroupMessage | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [actionsFor, setActionsFor] = useState<GroupMessage | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number; types?: ("image" | "video")[]; caption?: string; sender?: { name: string; avatarUrl?: string | null; time?: string } } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { isRecording, recordingSeconds, startRecording, stopRecording } = useVoiceRecorder((file) => setFiles((f) => [...f, file]));

  const scrollToEnd = (smooth = false) =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" }));

  const loadExtras = async (ids: string[]) => {
    const { reactions: r, votes: v } = await getReactionsAndVotes(ids);
    setReactions(r);
    setVotes(v);
  };

  // First page.
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getMessages(groupId)
      .then((rows) => {
        if (!alive) return;
        setMessages(rows);
        setReachedStart(rows.length < MESSAGE_PAGE);
        setLoaded(true);
        scrollToEnd();
        void loadExtras(rows.map((m) => m.id));
        void markRead(groupId).then(() => queryClient.invalidateQueries({ queryKey: ["my-groups"] }));
      })
      .catch(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [groupId, queryClient]);

  // Live: new and changed messages, reactions, votes, the group and its members.
  useEffect(() => {
    if (!myId) return;
    let extrasTimer: number | null = null;
    const refreshExtras = () => {
      if (extrasTimer) window.clearTimeout(extrasTimer);
      extrasTimer = window.setTimeout(() => {
        setMessages((current) => {
          void loadExtras(current.map((m) => m.id));
          return current;
        });
      }, 250);
    };
    const channel = supabase
      .channel(`group-${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages", filter: `group_id=eq.${groupId}` }, (payload) => {
        const row = payload.new as GroupMessage;
        setMessages((current) => (current.some((m) => m.id === row.id) ? current : [...current.filter((m) => !(m.pending && m.sender_id === row.sender_id && m.content === row.content)), row]));
        if (atBottom.current || row.sender_id === myId) scrollToEnd(true);
        if (document.visibilityState === "visible") void markRead(groupId);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_group_messages", filter: `group_id=eq.${groupId}` }, (payload) => {
        const row = payload.new as GroupMessage;
        setMessages((current) => current.map((m) => (m.id === row.id ? row : m)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_reactions" }, refreshExtras)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_poll_votes" }, refreshExtras)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups", filter: `id=eq.${groupId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members", filter: `group_id=eq.${groupId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["group-members", groupId] });
      })
      .subscribe();
    return () => {
      if (extrasTimer) window.clearTimeout(extrasTimer);
      void supabase.removeChannel(channel);
    };
  }, [groupId, myId, queryClient]);

  // Ask the server whether the call is really still going: it ends calls
  // that everyone has left (even by closing the app).
  const callSince = groupQuery.data?.call_active_since;
  useEffect(() => {
    if (!callSince) return;
    const check = () => void supabase.rpc("chat_group_call_state" as any, { p_group: groupId } as any).then(({ data }) => {
      if (data && (data as any).active === false) void queryClient.invalidateQueries({ queryKey: ["group", groupId] });
    });
    check();
    const t = window.setInterval(check, 20_000);
    return () => window.clearInterval(t);
  }, [callSince, groupId, queryClient]);

  const loadOlder = async () => {
    if (loadingOlder || reachedStart || !messages.length) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const before = el?.scrollHeight || 0;
    try {
      const older = await getMessages(groupId, messages[0].created_at);
      setReachedStart(older.length < MESSAGE_PAGE);
      setMessages((current) => [...older, ...current]);
      void loadExtras([...older, ...messages].map((m) => m.id));
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !files.length) || sending || !group) return;
    if (editing) {
      setSending(true);
      try {
        await editMessage(editing.id, text);
        setEditing(null);
        setInput("");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setSending(false);
      }
      return;
    }
    setSending(true);
    const reply = replyTo;
    const pendingFiles = files;
    setInput("");
    setReplyTo(null);
    setFiles([]);
    try {
      let content = text;
      if (pendingFiles.length) {
        const tokens: string[] = [];
        for (const original of pendingFiles) {
          const file = await compressImage(original);
          const ext = file.name.split(".").pop();
          const path = `${myId}/${Math.random()}.${ext}`;
          const { error } = await supabase.storage.from("post-media").upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
          if (error) throw error;
          const { data } = supabase.storage.from("post-media").getPublicUrl(path);
          tokens.push(encodeChatMedia(getChatMediaType(file), data.publicUrl, original.name));
        }
        content = `${text}\n\n${MEDIA}${tokens.join(",")}`.trim();
      }
      // Shown straight away; the realtime insert replaces it.
      const temp: GroupMessage = {
        id: `pending-${Date.now()}`, group_id: groupId, sender_id: myId, kind: "text", content, reply_to_id: reply?.id || null,
        poll: null, edited_at: null, deleted_at: null, created_at: new Date().toISOString(), pending: true,
      };
      setMessages((m) => [...m, temp]);
      scrollToEnd(true);
      const saved = await sendMessage(groupId, content, reply?.id);
      setMessages((m) => (m.some((x) => x.id === saved.id) ? m.filter((x) => x.id !== temp.id) : m.map((x) => (x.id === temp.id ? saved : x))));
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.pending));
      setInput(text);
      setFiles(pendingFiles);
      toast.error((e as Error).message || "Message not sent");
    } finally {
      setSending(false);
    }
  };

  const toggleVoice = async () => {
    if (isRecording) return stopRecording();
    try {
      await startRecording();
    } catch (e) {
      toast.error((e as Error).message || "Microphone access is needed for voice notes.");
    }
  };

  const startCall = (video = false) => navigate({ to: "/app/chat/g/$groupId/call", params: { groupId }, search: { video } });

  const reactionsFor = (id: string) => {
    const map: Record<string, { count: number; mine: boolean }> = {};
    for (const r of reactions) {
      if (r.message_id !== id) continue;
      map[r.emoji] = map[r.emoji] || { count: 0, mine: false };
      map[r.emoji].count++;
      if (r.profile_id === myId) map[r.emoji].mine = true;
    }
    return Object.entries(map);
  };

  const toggleReaction = async (id: string, emoji: string) => {
    // Optimistic: flip it locally, realtime confirms.
    setReactions((rs) => rs.some((r) => r.message_id === id && r.profile_id === myId && r.emoji === emoji)
      ? rs.filter((r) => !(r.message_id === id && r.profile_id === myId && r.emoji === emoji))
      : [...rs, { message_id: id, profile_id: myId, emoji }]);
    try { await react(id, emoji); } catch (e) { toast.error((e as Error).message); }
  };

  if (groupQuery.isLoading || (!loaded && !groupQuery.isError)) {
    return <div className="fixed inset-0 z-[60] grid place-items-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!group) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-foreground/[0.06]"><Users className="h-6 w-6 text-muted-foreground" /></span>
        <h1 className="text-[18px] font-semibold">You're not in this group</h1>
        <p className="max-w-[280px] text-[13.5px] text-muted-foreground">It may have been removed, or you were taken out. Ask someone in it for the invite link.</p>
        <Link to="/app/chat" className="mt-2 h-10 rounded-full bg-foreground px-5 text-[14px] font-semibold leading-10 text-background">Back to messages</Link>
      </div>
    );
  }

  const pinned = group.pinned_message_id ? messages.find((m) => m.id === group.pinned_message_id) : null;
  const callLive = Boolean(group.call_active_since && Date.now() - new Date(group.call_active_since).getTime() < 6 * 3600_000);
  const canSend = !group.admins_only_send || isAdmin;
  const mentionPeople = [
    // Admins can tag the whole group; the server checks the role before notifying anyone.
    ...(isAdmin && members.length > 1
      ? [{ id: null, username: "everyone", full_name: "Everyone in this group", avatar_url: null, badge: `Tag all ${members.length - 1}` }]
      : []),
    ...members
      .filter((m) => m.profile?.username && m.profile_id !== myId)
      .map((m) => ({ id: m.profile_id, username: m.profile!.username!, full_name: m.profile!.full_name, avatar_url: m.profile!.avatar_url, badge: m.role === "member" ? null : m.role === "owner" ? "Owner" : "Admin" })),
  ];

  return (
    <div className="zc-chat-panel fixed inset-0 z-[60] flex flex-col bg-background md:left-[var(--zc-sidebar-w,280px)] md:border-x md:border-border/60 xl:right-[336px]" style={{ height: "100dvh" }}>
      {/* Header */}
      <header className="relative z-10 flex items-center gap-1 bg-background/85 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-[0_10px_24px_-22px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <button onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.04]">
          <ArrowLeft className="h-[22px] w-[22px]" />
        </button>
        <button type="button" onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <GroupAvatar name={group.name} url={group.avatar_url} size={38} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight">{group.name}</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {members.slice(0, 4).map((m) => (m.profile_id === myId ? "You" : displayName(m.profile).split(" ")[0])).join(", ")}
              {members.length > 4 ? ` +${members.length - 4}` : ""}
            </span>
          </span>
        </button>
        <button onClick={() => startCall(true)} aria-label="Video call" className="grid h-11 w-10 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.04]">
          <Video className="h-[22px] w-[22px]" />
        </button>
        <button onClick={() => startCall(false)} aria-label="Voice call" className="grid h-11 w-10 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.04]">
          <Phone className="h-[21px] w-[21px]" />
        </button>
      </header>

      {callLive && (
        <button type="button" onClick={() => startCall()} className="relative z-10 mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#16a34a,#15803d)] px-4 py-2.5 text-left text-white shadow-[0_10px_24px_-14px_rgba(22,163,74,0.8)]">
          <span className="relative grid h-8 w-8 place-items-center rounded-full bg-white/20">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />
            <Phone className="relative h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">Group call in progress</span>
            <span className="block text-[11.5px] text-white/80">Tap to join</span>
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-[12.5px] font-bold text-green-700">Join</span>
        </button>
      )}

      {pinned && (
        <button
          type="button"
          onClick={() => document.getElementById(`gm-${pinned.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="relative z-10 mx-3 mt-2 flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2 text-left shadow-[0_8px_24px_-18px_rgba(0,0,0,0.6)] ring-1 ring-foreground/[0.06]"
        >
          <Pin className="h-4 w-4 shrink-0 fill-current text-[#cc208f]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-[#cc208f]">Pinned</span>
            <span className="block truncate text-[13.5px] text-foreground/85">{previewText(pinned)}</span>
          </span>
          {isAdmin && (
            <span role="button" tabIndex={0} aria-label="Unpin" onClick={(e) => { e.stopPropagation(); void pinMessage(groupId, null).catch((err) => toast.error(err.message)); }} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]">
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      )}

      {/* Thread */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          if (el.scrollTop < 80) void loadOlder();
        }}
        className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4 pt-2"
      >
        {reachedStart && (
          <div className="flex flex-col items-center pb-4 pt-6 text-center">
            <GroupAvatar name={group.name} url={group.avatar_url} size={76} />
            <h2 className="mt-3 text-[18px] font-semibold">{group.name}</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{members.length} {members.length === 1 ? "member" : "members"}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 py-1 text-[11.5px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Only members can see this group
            </p>
          </div>
        )}
        {loadingOlder && <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const plain = (x?: GroupMessage) => x && (x.kind === "text" || x.kind === "poll");
          const groupStart = newDay || !plain(prev) || prev?.sender_id !== m.sender_id;
          const groupEnd = !plain(next) || next?.sender_id !== m.sender_id || (next && new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString());
          return (
            <React.Fragment key={m.id}>
              {newDay && (
                <div className="sticky top-1 z-[5] my-4 flex justify-center">
                  <span className="rounded-full bg-card/90 px-3 py-1 text-[11.5px] font-semibold text-muted-foreground shadow-sm ring-1 ring-foreground/[0.05] backdrop-blur">{dayLabel(m.created_at)}</span>
                </div>
              )}
              {m.kind === "system" ? (
                <div className="my-2 flex justify-center px-6">
                  <span className="rounded-xl bg-foreground/[0.05] px-3 py-1.5 text-center text-[12px] text-muted-foreground">{m.content}</span>
                </div>
              ) : m.kind === "call" ? (
                <div className="my-2.5 flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-2xl bg-green-500/10 px-3.5 py-2 text-[12.5px] font-medium text-green-700 dark:text-green-400">
                    <Phone className="h-3.5 w-3.5" /> {m.content}
                    <span className="text-[11px] opacity-70">{timeLabel(m.created_at)}</span>
                    {m.sender_id && callLive && (
                      <button type="button" onClick={() => startCall()} className="ml-1 rounded-full bg-green-600 px-2.5 py-0.5 text-[11.5px] font-bold text-white">Join</button>
                    )}
                  </span>
                </div>
              ) : (
                <Bubble
                  m={m}
                  mine={m.sender_id === myId}
                  sender={m.sender_id ? memberById.get(m.sender_id)?.profile : null}
                  senderRole={m.sender_id ? memberById.get(m.sender_id)?.role : undefined}
                  groupStart={groupStart}
                  groupEnd={groupEnd}
                  replied={m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null}
                  repliedName={(id) => (id === myId ? "You" : displayName(memberById.get(id || "")?.profile))}
                  reactions={reactionsFor(m.id)}
                  votes={votes}
                  myId={myId}
                  onReact={(emoji) => void toggleReaction(m.id, emoji)}
                  onOpenActions={() => !m.pending && !m.deleted_at && setActionsFor(m)}
                  onReply={() => !m.deleted_at && setReplyTo(m)}
                  onImage={(urls, index, extra) => setViewer({ urls, index, ...extra })}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Composer */}
      <div className="relative z-10 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-1">
        {!canSend ? (
          <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-foreground/[0.05] px-4 py-3 text-center text-[13px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Only admins can send messages
          </p>
        ) : (
          <>
            {(replyTo || editing) && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)] ring-1 ring-foreground/[0.06]">
                {editing ? <Pencil className="h-4 w-4 shrink-0 text-[#cc208f]" /> : <Reply className="h-4 w-4 shrink-0 text-[#cc208f]" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-[#cc208f]">
                    {editing ? "Editing message" : `Replying to ${replyTo!.sender_id === myId ? "yourself" : displayName(memberById.get(replyTo!.sender_id || "")?.profile)}`}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{previewText((editing || replyTo)!)}</span>
                </span>
                <button type="button" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setInput(""); } }} className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/[0.06]"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {files.length > 0 && (
              <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
                {files.map((f, i) => (
                  <span key={i} className="relative flex h-14 shrink-0 items-center gap-2 overflow-hidden rounded-xl bg-card px-3 ring-1 ring-foreground/[0.07]">
                    {f.type.startsWith("image/") ? <img src={URL.createObjectURL(f)} alt="" className="-mx-3 h-14 w-14 object-cover" /> : <><FileText className="h-5 w-5 text-[#cc208f]" /><span className="max-w-[120px] truncate text-[12px]">{f.type.startsWith("audio/") ? "Voice note" : f.name}</span></>}
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5 rounded-[28px] bg-card py-2 pl-2 pr-2 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.65)] ring-1 ring-foreground/[0.07] focus-within:ring-[#cc208f]/40">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Attach" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground active:scale-95"><Plus className="h-6 w-6" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="z-[100] w-48">
                  <DropdownMenuItem onSelect={() => imageRef.current?.click()} className="gap-2.5"><Image className="h-4 w-4" /> Photos & videos</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => fileRef.current?.click()} className="gap-2.5"><File className="h-4 w-4" /> File</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPollOpen(true)} className="gap-2.5"><BarChart3 className="h-4 w-4" /> Poll</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => startCall()} className="gap-2.5"><Phone className="h-4 w-4" /> Group call</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={imageRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
              <MentionField
                people={mentionPeople}
                peopleLabel="In this group"
                menuPlacement="top"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
                }}
                onKeyDown={(e) => {
                  if (isSendKey(e, enterToSend)) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={editing ? "Edit your message" : "Message the group"}
                className="block w-full flex-1 resize-none border-0 bg-transparent py-[11px] text-[16px] leading-[22px] outline-none placeholder:text-muted-foreground no-scrollbar"
                style={{ minHeight: 44, maxHeight: 132, height: 44 }}
              />
              {!input.trim() && !files.length && !editing ? (
                <button type="button" onClick={() => void toggleVoice()} aria-label={isRecording ? "Stop recording" : "Record a voice note"} className={`inline-flex h-11 shrink-0 items-center justify-center rounded-full active:scale-95 ${isRecording ? "min-w-16 bg-red-500 px-3 text-white" : "w-11 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}>
                  {isRecording ? <><Square className="h-4 w-4 fill-current" /><span className="ml-1.5 text-[12px] font-semibold tabular-nums">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</span></> : <Mic className="h-[22px] w-[22px]" />}
                </button>
              ) : (
                <button type="button" disabled={sending} onClick={() => void send()} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full active:scale-95 bg-[linear-gradient(135deg,#d6309b,#b0187f)] text-white shadow-[0_6px_16px_-8px_rgba(204,32,143,0.8)]">
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : editing ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Message actions (long-press) */}
      <Sheet open={Boolean(actionsFor)} onOpenChange={(o) => !o && setActionsFor(null)}>
        <SheetContent side="bottom" overlayClassName="z-[90]" className="z-[100] rounded-t-[28px] border-0 bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="sr-only"><SheetTitle>Message options</SheetTitle></SheetHeader>
          {actionsFor && (
            <>
              <div className="mt-2 flex justify-between gap-1 rounded-full bg-foreground/[0.05] p-1.5">
                {QUICK.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => { void toggleReaction(actionsFor.id, emoji); setActionsFor(null); }} className="grid h-11 w-11 place-items-center rounded-full text-[24px] transition hover:bg-foreground/[0.06] active:scale-90">{emoji}</button>
                ))}
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-foreground/[0.06]">
                <ActionRow icon={<Reply className="h-4 w-4" />} label="Reply" onClick={() => { setReplyTo(actionsFor); setActionsFor(null); }} />
                {actionsFor.kind === "text" && (
                  <ActionRow icon={<Copy className="h-4 w-4" />} label="Copy text" onClick={() => { void navigator.clipboard.writeText(actionsFor.content.split(MEDIA)[0].trim()); toast.success("Copied"); setActionsFor(null); }} />
                )}
                {actionsFor.sender_id === myId && actionsFor.kind === "text" && !actionsFor.content.includes(MEDIA) && (
                  <ActionRow icon={<Pencil className="h-4 w-4" />} label="Edit" onClick={() => { setEditing(actionsFor); setInput(actionsFor.content); setActionsFor(null); }} />
                )}
                {isAdmin && (
                  <ActionRow
                    icon={<Pin className="h-4 w-4" />}
                    label={group.pinned_message_id === actionsFor.id ? "Unpin" : "Pin for everyone"}
                    onClick={() => { void pinMessage(groupId, group.pinned_message_id === actionsFor.id ? null : actionsFor.id).catch((e) => toast.error(e.message)); setActionsFor(null); }}
                  />
                )}
                {(() => {
                  // Your own messages: always. Someone else's: only when you
                  // outrank them (owner > admin > member) — a moderation tool,
                  // not something every member sees.
                  const mineMsg = actionsFor.sender_id === myId;
                  const rank = { owner: 3, admin: 2, member: 1 } as Record<string, number>;
                  const senderRole = actionsFor.sender_id ? memberById.get(actionsFor.sender_id)?.role : undefined;
                  const canModerate = !mineMsg && isAdmin && (rank[myRole || "member"] > rank[senderRole || "member"]);
                  if (!mineMsg && !canModerate) return null;
                  const who = displayName(memberById.get(actionsFor.sender_id || "")?.profile).split(" ")[0];
                  return (
                    <ActionRow
                      danger
                      icon={<Trash2 className="h-4 w-4" />}
                      label={mineMsg ? "Delete for everyone" : `Remove ${who}'s message`}
                      onClick={() => {
                        const id = actionsFor.id;
                        setActionsFor(null);
                        if (confirm(mineMsg ? "Delete this message for everyone?" : `Remove ${who}'s message for everyone? They'll see it was removed.`)) {
                          void removeMessage(id).catch((e) => toast.error(e.message));
                        }
                      }}
                    />
                  );
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <PollComposer open={pollOpen} onOpenChange={setPollOpen} groupId={groupId} />
      {myId && <GroupInfoSheet open={infoOpen} onOpenChange={setInfoOpen} group={group} members={members} myId={myId} onStartCall={() => startCall()} />}
      {viewer && <ImageLightbox mediaUrls={viewer.urls} initialIndex={viewer.index} mediaTypes={viewer.types} caption={viewer.caption} sender={viewer.sender} isOpen onClose={() => setViewer(null)} allowDownload />}
    </div>
  );
}

function Bubble({
  m, mine, sender, senderRole, groupStart, groupEnd, replied, repliedName, reactions, votes, myId, onReact, onOpenActions, onReply, onImage,
}: {
  m: GroupMessage;
  mine: boolean;
  sender: { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null | undefined;
  senderRole?: string;
  groupStart: boolean;
  groupEnd: boolean;
  replied: GroupMessage | null | undefined;
  repliedName: (id: string | null) => string;
  reactions: [string, { count: number; mine: boolean }][];
  votes: GroupVote[];
  myId: string;
  onReact: (emoji: string) => void;
  onOpenActions: () => void;
  onReply: () => void;
  onImage: (urls: string[], index: number, extra?: { types?: ("image" | "video")[]; caption?: string; sender?: { name: string; avatarUrl?: string | null; time?: string } }) => void;
}) {
  const timer = useRef<number | null>(null);
  const startX = useRef(0);
  const [dx, setDx] = useState(0);
  const cancel = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };
  const [text, mediaPart] = m.content.split(MEDIA);
  const media = mediaPart ? mediaPart.split(",").map(decodeChatMedia) : [];
  const images = media.filter((x) => x.type === "image").map((x) => x.url);
  // Photos and videos stand on their own; any text goes in a bubble under them.
  const visuals = (m.deleted_at || m.kind === "poll" ? [] : media.filter((x) => x.type === "image" || x.type === "video")) as ChatVisual[];
  const otherMedia = media.filter((x) => x.type !== "image" && x.type !== "video");
  const hasVisual = visuals.length > 0;
  const needsBubble = !hasVisual || Boolean(text?.trim()) || otherMedia.length > 0 || Boolean(replied);
  const openVisual = (index: number) =>
    onImage(visuals.map((v) => v.url), index, {
      types: visuals.map((v) => v.type),
      caption: text?.trim(),
      sender: { name: mine ? "You" : displayName(sender), avatarUrl: sender?.avatar_url, time: new Date(m.created_at).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) },
    });
  const color = nameColor(m.sender_id || "");

  return (
    <div
      id={`gm-${m.id}`}
      className={`flex w-full select-none ${groupStart ? "mt-2.5" : "mt-[3px]"} ${mine ? "justify-end" : "justify-start"}`}
      style={{ WebkitTouchCallout: "none", transform: `translateX(${dx}px)`, transition: dx ? "none" : "transform .2s ease-out" }}
      onContextMenu={(e) => { if ((e.target as HTMLElement).closest("a, video, audio, button")) return; e.preventDefault(); onOpenActions(); }}
      onTouchStart={(e) => {
        if ((e.target as HTMLElement).closest("button, a, video, audio")) return;
        startX.current = e.touches[0].clientX;
        timer.current = window.setTimeout(() => { timer.current = null; navigator.vibrate?.(25); onOpenActions(); }, 400);
      }}
      onTouchMove={(e) => {
        const d = e.touches[0].clientX - startX.current;
        if (Math.abs(d) > 10) cancel();
        if (d > 0) setDx(Math.min(d, 64));
      }}
      onTouchEnd={() => { cancel(); if (dx >= 48) onReply(); setDx(0); }}
    >
      {!mine && (
        <span className="mr-1.5 w-7 shrink-0 self-end">
          {groupEnd && sender && (
            <Link to="/app/profile/$id" params={{ id: sender.id }}><PersonAvatar person={sender} size={28} /></Link>
          )}
        </span>
      )}
      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {hasVisual && (
          <>
            {!mine && groupStart && (
              <span className="mb-1 ml-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em]" style={{ color }}>
                {displayName(sender)}
                {senderRole && senderRole !== "member" && <span className="rounded bg-foreground/[0.08] px-1 py-px text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">{senderRole}</span>}
              </span>
            )}
            <div className={m.pending ? "opacity-70" : ""}>
              <ChatMediaGrid
                items={visuals}
                mine={mine}
                onOpen={openVisual}
                overlay={!needsBubble ? <>{m.edited_at && "edited · "}{m.pending ? "Sending…" : timeLabel(m.created_at)}</> : undefined}
              />
            </div>
          </>
        )}
        {needsBubble && (
        <div
          className={`relative rounded-[18px] px-3.5 py-2 ${hasVisual ? "mt-1" : ""} ${
            mine
              ? `bg-[linear-gradient(135deg,#d6309b_0%,#b0187f_100%)] text-white shadow-[0_8px_20px_-12px_rgba(204,32,143,0.75)] ${groupEnd ? "rounded-br-[4px]" : ""} ${!groupStart ? "rounded-tr-[4px]" : ""}`
              : `bg-foreground/[0.07] ${groupEnd ? "rounded-bl-[4px]" : ""} ${!groupStart ? "rounded-tl-[4px]" : ""}`
          } ${m.pending ? "opacity-70" : ""}`}
        >
          {!mine && groupStart && !hasVisual && (
            <span className="mb-0.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color }}>
              {displayName(sender)}
              {senderRole && senderRole !== "member" && <span className="rounded bg-foreground/[0.08] px-1 py-px text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">{senderRole}</span>}
            </span>
          )}
          {m.deleted_at ? (
            <p className={`text-[14px] italic ${mine ? "text-white/75" : "text-muted-foreground"}`}>This message was removed</p>
          ) : (
            <>
              {replied && (
                <button
                  type="button"
                  onClick={() => document.getElementById(`gm-${replied.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className={`mb-1.5 block w-full rounded-[12px] border-l-[3px] px-2.5 py-1.5 text-left ${mine ? "border-white/70 bg-white/15" : "border-[#cc208f] bg-card"}`}
                >
                  <span className={`block text-[12px] font-semibold ${mine ? "text-white/90" : "text-[#cc208f]"}`}>{repliedName(replied.sender_id)}</span>
                  <span className={`block max-w-[220px] truncate text-[12.5px] ${mine ? "text-white/80" : "text-muted-foreground"}`}>{previewText(replied)}</span>
                </button>
              )}
              {m.kind === "poll" ? (
                <PollCard message={m} votes={votes} myId={myId} mine={mine} />
              ) : (
                <>
                  {text?.trim() && (
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.4]">
                      <LinkifiedText text={text.trim()} linkColor={mine ? "text-white underline font-semibold" : "text-[#cc208f] underline font-semibold"} />
                    </p>
                  )}
                  {text?.trim() && <LinkPreview text={text} mine={mine} />}
                  {otherMedia.length > 0 && (
                    <div className="mt-1.5 overflow-hidden rounded-[12px]">
                      {otherMedia.map((x, i) => (
                        <div key={i} className={x.type === "image" ? (images.length >= 2 ? "aspect-square" : "max-h-[300px]") : "py-1"}>
                          {x.type === "image" ? (
                            <img src={x.url} alt="" loading="lazy" decoding="async" onClick={() => onImage(images, images.indexOf(x.url))} className="h-full w-full cursor-pointer object-cover" />
                          ) : x.type === "video" ? (
                            <video src={x.url} controls className="max-h-[300px] w-full rounded-[10px]" />
                          ) : x.type === "audio" ? (
                            <VoiceNotePlayer src={x.url} name={x.name} mine={mine} avatarUrl={mine ? null : sender?.avatar_url} />
                          ) : (
                            <a href={x.url} target="_blank" rel="noreferrer" className="flex min-w-[200px] items-center gap-2.5"><FileText className="h-6 w-6 shrink-0" /><span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{x.name}</span><Download className="h-4 w-4 shrink-0" /></a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10.5px] tabular-nums ${mine ? "text-white/65" : "text-muted-foreground"}`}>
            {m.edited_at && !m.deleted_at && "edited · "}
            {m.pending ? "Sending…" : timeLabel(m.created_at)}
          </span>
        </div>
        )}
        {reactions.length > 0 && (
          <div className={`-mt-1.5 flex flex-wrap gap-1 ${mine ? "justify-end pr-1" : "pl-1"}`}>
            {reactions.map(([emoji, r]) => (
              <button key={emoji} type="button" onClick={() => onReact(emoji)} className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] font-semibold shadow-sm ring-2 ring-background ${r.mine ? "bg-[#cc208f]/15 text-[#cc208f]" : "bg-card text-foreground/80"}`}>
                {emoji}{r.count > 1 ? <span>{r.count}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 border-b border-foreground/[0.05] px-4 py-3.5 text-left text-[14.5px] font-medium last:border-b-0 hover:bg-foreground/[0.03] ${danger ? "text-rose-600" : ""}`}>
      {icon} {label}
    </button>
  );
}

function previewText(m: GroupMessage) {
  if (m.deleted_at) return "Message removed";
  if (m.kind === "poll") return `📊 ${m.content}`;
  const [text, media] = m.content.split(MEDIA);
  if (text?.trim()) return text.trim();
  const first = media ? decodeChatMedia(media.split(",")[0]) : null;
  return first?.type === "image" ? "📷 Photo" : first?.type === "video" ? "🎬 Video" : first?.type === "audio" ? "🎤 Voice note" : first ? `📎 ${first.name}` : "Message";
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** A steady colour per person, so names are easy to tell apart. */
function nameColor(id: string) {
  const palette = ["#cc208f", "#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#db2777", "#0891b2", "#9333ea", "#ca8a04"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
