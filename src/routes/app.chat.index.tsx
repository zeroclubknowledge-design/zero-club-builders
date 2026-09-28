import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, Edit3, MoreHorizontal, ArrowLeft, CheckCheck, Settings, MessageCircle, BadgeCheck, Headphones, Loader2 } from "@/components/icons/glyphs";
import { useGoBack } from "@/hooks/useGoBack";
import { getConversations } from "@/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { directMessagePreview } from "@/lib/directMessage";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/app/chat/")({
  component: ChatInboxPage,
});

function ChatInboxPage() {
  const navigate = useNavigate();
  const goBack = useGoBack("/app");
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'All' | 'Unread'>('All');

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
    // Realtime below handles normal delivery. This slower fallback only
    // repairs the list if a phone briefly loses its websocket connection.
    refetchInterval: 30000,
  });
  const { data: currentUser } = useUser();
  const supportConversation = conversations.find((conversation: any) => conversation.isSupport);

  useEffect(() => {
    if (!currentUser?.id) return;

    // Auto-mark any club requests or dismissed requests as read so taskbar message badge reflects clean PMs
    supabase
      .from("messages")
      .update({ is_read: true })
      .eq("receiver_id", currentUser.id)
      .eq("is_read", false)
      .or("content.like.CLUB_REQUEST:%,content.eq.DISMISSED_CLUB_REQUEST")
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      });

    const refreshInbox = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const channel = supabase
      .channel(`inbox-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        refreshInbox,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, queryClient]);

  const handleMarkAllAsRead = async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);
        
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("All messages marked as read!");
    } catch (e) {
      toast.error("Failed to mark messages as read");
    }
  };

  const filteredConversations = useMemo(() => {
    // Completely remove club requests from personal inbox
    let filtered = conversations.filter((c: any) => !c.isSupport && !c.lastMessage?.startsWith('CLUB_REQUEST:') && c.lastMessage !== 'DISMISSED_CLUB_REQUEST');
    
    // Search filtering
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) => 
        c.user?.full_name?.toLowerCase().includes(q) || 
        c.user?.username?.toLowerCase().includes(q) ||
        directMessagePreview(c.lastMessage, { sentByCurrentUser: c.lastSenderId === currentUser?.id }).toLowerCase().includes(q)
      );
    }

    // Tab filtering
    if (activeTab === 'Unread') {
      filtered = filtered.filter((c: any) => c.unread);
    }
    
    return filtered;
  }, [conversations, searchQuery, activeTab, currentUser?.id]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">Loading messages</span>
        </div>
      </div>
    );
  }

  const preview = (chat: any) =>
    directMessagePreview(chat.lastMessage, { sentByCurrentUser: chat.lastSenderId === currentUser?.id });
  const unreadCount = conversations.filter(
    (c: any) => c.unread && !c.isSupport && !c.lastMessage?.startsWith('CLUB_REQUEST:') && c.lastMessage !== 'DISMISSED_CLUB_REQUEST',
  ).length;

  return (
    <div className="relative flex min-h-screen flex-col bg-card pb-28">
      <header className="sticky top-0 z-20 bg-card pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-1 px-2 md:px-6">
          <button
            onClick={goBack}
            aria-label="Back"
            className="grid h-11 w-11 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04] md:hidden"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[20px] font-semibold text-foreground">Messages</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Message options" className="grid h-11 w-11 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
                <MoreHorizontal className="h-[22px] w-[22px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={handleMarkAllAsRead} className="gap-3 py-2.5">
                <CheckCheck className="h-4 w-4" />
                <span className="text-sm font-medium">Mark all as read</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/app/chat/settings" })} className="gap-3 py-2.5">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Message settings</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/app/chat/new" aria-label="New message" className="grid h-11 w-11 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <Edit3 className="h-[22px] w-[22px]" />
          </Link>
        </div>

        <div className="px-4 pb-3 md:px-6">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-foreground/[0.05] px-3">
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search messages"
              aria-label="Search messages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="mt-2.5 flex gap-2">
            {(['All', 'Unread'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`h-8 rounded-full px-3.5 text-[14px] font-semibold tap ${
                  activeTab === tab ? 'bg-foreground text-background' : 'border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]'
                }`}
              >
                {tab}
                {tab === 'Unread' && unreadCount > 0 ? ` · ${unreadCount}` : ''}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="zc-page-width flex flex-1 flex-col border-t border-border md:mx-6 md:max-w-[820px]">
        {supportConversation && activeTab === 'All' && !searchQuery && (
          <Link
            to="/app/chat/$id"
            params={{ id: supportConversation.id }}
            className="group flex items-center gap-3 px-4 transition-colors hover:bg-foreground/[0.02] md:px-6"
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground text-background">
              {supportConversation.user?.avatar_url ? (
                <img src={supportConversation.user.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <Headphones className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 flex-1 border-b border-border py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={`truncate text-[15px] text-foreground ${supportConversation.unread ? 'font-bold' : 'font-semibold'}`}>Zero Club Support</span>
                  <span className="shrink-0 rounded bg-foreground/[0.06] px-1.5 py-px text-[11px] font-semibold text-foreground/70">Official</span>
                </span>
                {supportConversation.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
              </div>
              <p className={`mt-0.5 truncate text-[14px] ${supportConversation.unread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {supportConversation.lastMessage ? preview(supportConversation) : "Message the Zero Club team for help"}
              </p>
            </div>
          </Link>
        )}

        {filteredConversations.map((chat: any) => (
          <Link
            key={chat.id}
            to="/app/chat/$id"
            params={{ id: chat.id }}
            className="group flex items-center gap-3 px-4 transition-colors hover:bg-foreground/[0.02] md:px-6"
          >
            <div
              className="relative shrink-0"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate({ to: '/app/profile/$id', params: { id: chat.user?.id } }); }}
            >
              <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[17px] font-semibold text-muted-foreground">
                {chat.user?.avatar_url ? (
                  <img src={chat.user.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  (chat.user?.full_name || chat.user?.username || 'U').substring(0, 1).toUpperCase()
                )}
              </div>
              {chat.status === 'online' && (
                <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-card bg-success" aria-label="Online" />
              )}
            </div>

            <div className="min-w-0 flex-1 border-b border-border py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1">
                  <span className={`truncate text-[15px] text-foreground ${chat.unread ? 'font-bold' : 'font-semibold'}`}>
                    {chat.user?.full_name || chat.user?.username}
                  </span>
                  {chat.user?.verified && <BadgeCheck className="h-4 w-4 shrink-0 fill-current text-accent" />}
                </span>
                <span className={`shrink-0 text-[12px] ${chat.unread ? 'font-semibold text-accent' : 'text-muted-foreground'}`}>{chat.time}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <p className={`min-w-0 flex-1 truncate text-[14px] ${chat.unread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {preview(chat)}
                </p>
                {chat.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
              </div>
            </div>
          </Link>
        ))}

        {filteredConversations.length === 0 && !(supportConversation && activeTab === 'All' && !searchQuery) && (
          <div className="flex flex-1 flex-col items-center justify-center px-10 py-24 text-center">
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-foreground/[0.05]">
              <MessageCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-1.5 font-display text-[18px] font-semibold text-foreground">
              {searchQuery ? 'No matches' : activeTab === 'Unread' ? 'All caught up' : 'No conversations yet'}
            </h3>
            <p className="max-w-[260px] text-[14px] leading-relaxed text-muted-foreground">
              {searchQuery
                ? 'Try a different name or word.'
                : activeTab === 'Unread'
                ? 'You have read every message.'
                : 'Start a conversation with someone you follow.'}
            </p>
          </div>
        )}
      </div>

      <Link
        to="/app/chat/new"
        className="fixed bottom-24 right-4 z-40 flex h-[52px] items-center gap-2 rounded-full bg-foreground pl-4 pr-5 text-[15px] font-semibold text-background shadow-[0_10px_28px_-10px_rgba(0,0,0,0.5)] tap hover:opacity-90 md:hidden"
      >
        <Edit3 className="h-5 w-5" />
        New message
      </Link>
    </div>
  );
}
