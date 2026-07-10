import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, Edit3, Circle, MoreHorizontal, ChevronLeft, MessageSquare, Users as UsersIcon, ChevronDown, Check, Settings, MessageCircle, User, MessageSquarePlus } from "lucide-react";
import { getConversations } from "@/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/app/chat/")({
  component: ChatInboxPage,
});

function ChatInboxPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'All' | 'Unread'>('All');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
    refetchInterval: 5000, 
  });
  const { data: currentUser } = useUser();

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
    let filtered = conversations.filter((c: any) => !c.lastMessage?.startsWith('CLUB_REQUEST:') && c.lastMessage !== 'DISMISSED_CLUB_REQUEST');
    
    // Search filtering
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) => 
        c.user?.full_name?.toLowerCase().includes(q) || 
        c.user?.username?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
      );
    }

    // Tab filtering
    if (activeTab === 'Unread') {
      filtered = filtered.filter((c: any) => c.unread);
    }
    
    return filtered;
  }, [conversations, searchQuery, activeTab]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-140px)] items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <span className="text-[11px] text-muted-foreground animate-pulse">Loading messages</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background relative pb-20">
      {/* Premium Frosted Glass Header */}
      <header className={`fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md md:sticky md:left-0 md:translate-x-0 md:max-w-full z-20 bg-background/70 backdrop-blur-2xl px-5 pb-3 pt-[calc(1.5rem+env(safe-area-inset-top))] md:pt-[1.5rem] transition-all duration-300 ${isScrolled ? "border-b border-border/40" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* User Avatar */}
            <button onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))} className="h-9 w-9 rounded-full overflow-hidden ring-2 ring-border/30 shadow-sm shrink-0 transition-all duration-300 active:scale-95 hover:ring-primary/40 hover:shadow-md cursor-pointer">
              {currentUser?.avatar_url ? (
                <img src={currentUser.avatar_url} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-[11px] font-semibold text-white">
                  {currentUser?.username?.[0].toUpperCase() || "U"}
                </div>
              )}
            </button>
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">Messages</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/app/chat/new"
              className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-semibold tracking-tight text-background tap hover:opacity-90"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New chat
            </Link>
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent/30 hover:bg-accent/50 transition-all duration-300 active:scale-95 ring-1 ring-border">
                  <span className="text-[11px]">{activeTab}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-background/95 backdrop-blur-2xl border-border/40 rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.15)] p-1.5">
                <DropdownMenuItem onClick={() => setActiveTab('All')} className="gap-3 py-3 rounded-xl transition-all duration-200">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> 
                  <span className="text-sm font-semibold">All Messages</span>
                  {activeTab === 'All' && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('Unread')} className="gap-3 py-3 rounded-xl transition-all duration-200">
                  <Circle className="h-4 w-4 fill-primary text-primary" /> 
                  <span className="text-sm font-semibold">Unread</span>
                  {activeTab === 'Unread' && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-border/30 my-1" />
                <DropdownMenuItem onClick={handleMarkAllAsRead} className="gap-3 py-3 rounded-xl text-primary focus:text-primary cursor-pointer transition-all duration-200">
                  <Check className="h-4 w-4" /> 
                  <span className="text-sm font-bold">Mark all as read</span>
                </DropdownMenuItem>
                <Link to="/app/chat/settings" className="w-full">
                  <DropdownMenuItem className="gap-3 py-3 rounded-xl cursor-pointer transition-all duration-200">
                    <Settings className="h-4 w-4 text-muted-foreground" /> 
                    <span className="text-sm font-semibold">Settings</span>
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      </header>

      {/* Premium Search Bar */}
      <div className="px-5 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-2 md:px-8 lg:px-10 md:pt-4 md:max-w-[860px] md:w-full">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input 
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl bg-accent/40 border-none px-5 py-3.5 pl-11 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 focus:bg-accent/60 transition-all duration-300"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex flex-col flex-1 md:flex-none md:mx-8 lg:mx-10 md:mt-3 md:mb-16 md:max-w-[780px] md:rounded-3xl md:ring-1 md:ring-border md:bg-card md:shadow-soft md:overflow-hidden">
        {filteredConversations.map((chat: any) => (
          <Link 
            key={chat.id} 
            to="/app/chat/$id"
            params={{ id: chat.id }}
            className={`flex items-center gap-4 px-5 py-4 md:px-6 md:py-[18px] hover:bg-accent/30 transition-all duration-200 cursor-pointer border-b border-border/10 last:border-b-0 active:bg-accent/20 group ${chat.unread ?"bg-primary/[0.03]" : ""}`}
          >
            {/* Avatar with Online Status */}
            <div className="relative shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate({ to: '/app/profile/$id', params: { id: chat.user?.id } }); }}>
              <div className="h-12 w-12 rounded-full bg-muted overflow-hidden ring-2 ring-background shadow-sm group-active:scale-95 transition-all duration-200 cursor-pointer hover:shadow-md">
                {chat.user?.avatar_url ? (
                  <img src={chat.user.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-muted-foreground/20 to-accent flex items-center justify-center font-semibold text-muted-foreground text-lg">
                    {(chat.user?.full_name || chat.user?.username || 'U').substring(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Online Status Dot */}
              {chat.status === 'online' && (
                <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
              )}
            </div>

            {/* Conversation Details */}
            <div className="flex flex-1 flex-col justify-center min-w-0 gap-0.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-[14px] font-semibold text-foreground truncate leading-none tracking-tight">
                    {chat.user?.full_name || chat.user?.username}
                  </span>
                  {chat.user?.verified && <Check className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />}
                </div>
                <div className="flex items-center gap-2.5 shrink-0 ml-3">
                  <span className="text-[10px] text-muted-foreground/70 font-medium">{chat.time || '4h'}</span>
                  {chat.unread && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className={`text-xs md:text-[12.5px] truncate max-w-[200px] md:max-w-[420px] leading-relaxed ${chat.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {chat.lastMessage?.includes('$$MEDIA$$') ? (() => {
                    const textPart = chat.lastMessage.split('$$MEDIA$$')[0].trim();
                    if (textPart) return textPart;
                    const urls = chat.lastMessage.split('$$MEDIA$$')[1] || '';
                    const firstUrl = urls.split(',')[0]?.toLowerCase() || '';
                    let mediaType = "an attachment";
                    if (firstUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp)/i) || firstUrl.includes('image')) mediaType = "a picture";
                    else if (firstUrl.match(/\.(mp4|webm|ogg|mov)/i) || firstUrl.includes('video')) mediaType = "a video";
                    else if (firstUrl.match(/\.(mp3|wav|m4a|aac)/i) || firstUrl.includes('audio')) mediaType = "a voice note";
                    return `Sent ${mediaType}`;
                  })() : chat.lastMessage}
                </p>
              </div>
            </div>
          </Link>
        ))}

        {/* Premium Empty State */}
        {filteredConversations.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center py-32 text-center px-10 animate-in fade-in duration-700">
            <div className="h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mb-5">
              <MessageCircle className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
            </div>
            <h3 className="text-[17px] font-semibold tracking-tight mb-1.5 text-foreground">
              {searchQuery ? 'No matches found' : 'No conversations yet'}
            </h3>
            <p className="text-[13.5px] text-muted-foreground leading-relaxed max-w-[260px] mb-7">
              {searchQuery 
                ? 'Try searching for someone else or adjust your filters.' 
                : 'Start a new conversation to connect with someone.'}
            </p>
            <Link 
              to="/app/chat/new" 
              className="rounded-full bg-foreground text-background px-6 py-2.5 font-semibold tracking-tight text-[13px] inline-flex items-center gap-2 transition-all duration-300 hover:opacity-90 hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)] active:scale-95"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Message
            </Link>
          </div>
        )}
      </div>

      {/* Premium Floating Action Button */}
      <Link 
        to="/app/chat/new" 
        className="fixed bottom-24 right-6 z-50 h-14 w-14 rounded-full bg-foreground text-background shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all duration-300 active:scale-90 hover:shadow-[0_6px_32px_-4px_rgba(0,0,0,0.4)] hover:scale-105 md:hidden"
      >
        <MessageSquarePlus className="h-6 w-6" />
      </Link>
    </div>
  );
}
