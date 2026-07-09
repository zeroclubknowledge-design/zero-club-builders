import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from "react";
import { 
  BellRing, UserRoundPlus, HeartHandshake, MessageCircleMore, Zap, 
  CheckCheck, MoreHorizontal, ArrowUpFromLine, AtSign, Loader2, Trophy 
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { enrichPosts } from "@/api";
import { useUser } from "@/hooks/useUser";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [commentPost, setCommentPost] = useState<any>(null);

  const { data: profile } = useUser();

  const { data: mentionsFeed, isLoading: mentionsLoading } = useQuery({
    queryKey: ['mentions_feed', profile?.id, profile?.username],
    queryFn: async () => {
      if (!profile?.id || !profile?.username) return [];
      
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(*), bootcamps(*), quoted_posts:quoted_post_id(*, bootcamps(*), profiles(*))')
        .or(`content.ilike.%${getFirstName(profile)}%,and(author_id.eq.${profile.id},content.ilike.%@%)`)
        .order('created_at', { ascending: false });
        
      if (error) return [];
      
      return enrichPosts(data || [], profile.id);
    },
    enabled: activeTab === 'mentions' && !!profile?.id
  });

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function fetchNotifications() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setCurrentUser(session.user);

      const { data, error } = await supabase
        .from('notifications')
        .select('*, actor:profiles!actor_id(*), recipient:profiles!recipient_id(*)')
        .or(`recipient_id.eq.${session.user.id},and(actor_id.eq.${session.user.id},type.eq.mention)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifs(data || []);
    } catch (err: any) {
      toast.error("Could not load notifications");
    } finally {
      setLoading(false);
    }
  }

  const markAllRead = async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', currentUser.id);
      
      if (error) throw error;
      setNotifs(notifs.map(n => ({ ...n, is_read: true })));
      toast.success("All caught up!");
    } catch (err) {
      toast.error("Could not update notifications");
    }
  };

  const markRead = async (id: string) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setNotifs(notifs.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {}
  };

  const getNotifUI = (type: string, actorName?: string, isActorMe?: boolean, recipientName?: string) => {
    switch (type) {
      case 'like': return { icon: HeartHandshake, bg: 'bg-primary', text: 'text-primary-foreground', action: 'liked your post' };
      case 'comment': return { icon: MessageCircleMore, bg: 'bg-sky-600', text: 'text-white', action: 'commented on your post' };
      case 'follow': return { icon: UserRoundPlus, bg: 'bg-emerald-600', text: 'text-white', action: 'started following you' };
      case 'repost': return { icon: ArrowUpFromLine, bg: 'bg-emerald-600', text: 'text-white', action: 'reposted your post' };
      case 'mention': return { icon: AtSign, bg: 'bg-amber-600', text: 'text-white', action: isActorMe ? `You mentioned @${recipientName}` : 'mentioned you' };
      case 'build_tagged': return { icon: Trophy, bg: 'bg-violet-600', text: 'text-white', action: 'tagged their post for verification' };
      case 'system': return { icon: Zap, bg: 'bg-amber-500', text: 'text-black', action: `Referral Reward: You and ${actorName} both earned 200XP!` };
      default: return { icon: BellRing, bg: 'bg-muted-foreground', text: 'text-background', action: 'interacted with you' };
    }
  };

  const renderText = (n: any) => {
    const text = n.content ? n.content.replace(/<[^>]*>?/gm, '').replace(/\*\*/g, '').replace(/(?<!\*)\*(?!\*)/g, '').trim() : '';
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  }

  const filteredNotifs = notifs.filter(n => {
    if (activeTab === "all") return true;
    if (activeTab === "mentions") return n.type === "mention";
    return true;
  });

  const displayNotifs = useMemo(() => {
    const groups: any[] = [];
    const processed = new Set();

    filteredNotifs.forEach((n) => {
      if (processed.has(n.id)) return;

      if (['like', 'follow', 'repost'].includes(n.type)) {
        const related = filteredNotifs.filter(other => {
          if (other.type !== n.type) return false;
          if (n.type === 'follow') {
            const dateN = new Date(n.created_at).toDateString();
            const dateOther = new Date(other.created_at).toDateString();
            return dateN === dateOther;
          }
          return other.entity_id === n.entity_id;
        });

        if (related.length > 1) {
          const actors = related.map(r => r.actor).filter(Boolean);
          const uniqueActors = Array.from(new Map(actors.map(a => [a.id, a])).values());
          
          groups.push({
            ...n,
            isGroup: true,
            groupActors: uniqueActors,
            groupIds: related.map(r => r.id),
            is_read: related.every(r => r.is_read)
          });

          related.forEach(r => processed.add(r.id));
        } else {
          groups.push(n);
          processed.add(n.id);
        }
      } else {
        groups.push(n);
        processed.add(n.id);
      }
    });

    return groups;
  }, [filteredNotifs]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const unreadCount = filteredNotifs.filter(n => !n.is_read && n.actor_id !== currentUser?.id).length;

  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)">
      <div className="flex border-b hairline sticky top-0 pt-[calc(0.5rem+env(safe-area-inset-top))] bg-background/85 backdrop-blur-xl backdrop-saturate-150 z-20">
        {["all", "verified", "mentions"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3.5 text-[13.5px] font-semibold tracking-tight transition-colors relative ${
              activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-10 bg-foreground rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-6 py-3 border-b hairline">
        <span className="text-[11px] font-medium text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground hover:text-primary transition-colors tap"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        {activeTab === 'mentions' ? (
          mentionsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : mentionsFeed && mentionsFeed.length > 0 ? (
            mentionsFeed.map((post: any) => (
              <div 
                key={post.id} 
                className="relative rounded-3xl overflow-hidden border border-border/40 hover:border-border transition-all duration-300 bg-background"
              >
                <PostCard post={post} currentUser={currentUser} onCommentClick={setCommentPost} />
              </div>
            ))
          ) : null
        ) : (
          displayNotifs.map((n) => {
            const isActorMe = n.actor_id === currentUser?.id;
          const ui = getNotifUI(n.type, n.actor?.full_name || n.actor?.username, isActorMe, n.recipient?.username);
          const Icon = ui.icon;
          
          const renderActors = () => {
            if (isActorMe && n.type === 'mention') return currentUser?.full_name || currentUser?.username || "You";
            if (!n.isGroup) return n.actor?.full_name || n.actor?.username;
            const actors = n.groupActors;
            if (actors.length === 1) return actors[0].full_name || actors[0].username;
            if (actors.length === 2) return `${actors[0].full_name || actors[0].username} and ${actors[1].full_name || actors[1].username}`;
            return `${actors[0].full_name || actors[0].username}, ${actors[1].full_name || actors[1].username} and ${actors.length - 2} others`;
          };

          const handleNotificationClick = () => {
            if (n.isGroup) {
              n.groupIds.forEach((id: string) => markRead(id));
            } else {
              markRead(n.id);
            }
            
            if (['like', 'comment', 'repost', 'mention', 'build_tagged'].includes(n.type) && n.entity_id) {
              navigate({ to: '/app/post/$id', params: { id: n.entity_id } });
            } else if (n.type === 'follow' && n.actor_id) {
              navigate({ to: '/app/profile/$id', params: { id: n.actor_id } });
            }
          };

          return (
            <div 
              key={n.id} 
              onClick={handleNotificationClick}
              className={`flex flex-col gap-3 p-5 rounded-2xl transition-all duration-200 tap cursor-pointer relative overflow-hidden group ${(!n.is_read && !isActorMe) ? "bg-card ring-1 ring-primary/15 shadow-soft" : "bg-transparent hover:bg-foreground/[0.02]"}`}
            >
              {(!n.is_read && !isActorMe) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] bg-primary rounded-r-full" />
              )}
              
              {/* Avatar Row */}
              <div className="relative shrink-0 flex items-start pt-1 pl-1 w-fit">
                <div className="flex -space-x-3">
                  {n.isGroup ? (
                    n.groupActors.slice(0, 3).map((actor: any, i: number) => (
                      <Link 
                        key={actor.id}
                        to="/app/profile/$id" 
                        params={{ id: actor.id }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ zIndex: 10 - i }}
                        className={`h-12 w-12 shrink-0 rounded-full border-[3px] border-background bg-muted overflow-hidden flex items-center justify-center font-bold text-xs text-muted-foreground shadow-sm transition active:opacity-70`}
                      >
                        {actor.avatar_url ? (
                          <img src={actor.avatar_url} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          (actor.username || "U").substring(0, 1).toUpperCase()
                        )}
                      </Link>
                    ))
                  ) : (
                    <Link 
                      to="/app/profile/$id" 
                      params={{ id: isActorMe && n.type === 'mention' ? n.recipient_id : n.actor_id }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-12 w-12 shrink-0 rounded-full border-[3px] border-background bg-muted overflow-hidden flex items-center justify-center font-bold text-sm text-muted-foreground shadow-sm transition active:opacity-70"
                    >
                      {(isActorMe && n.type === 'mention' ? n.recipient?.avatar_url : n.actor?.avatar_url) ? (
                        <img src={isActorMe && n.type === 'mention' ? n.recipient.avatar_url : n.actor.avatar_url} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        ((isActorMe && n.type === 'mention' ? n.recipient?.username : n.actor?.username) || "U").substring(0, 1).toUpperCase()
                      )}
                    </Link>
                  )}
                </div>
                
                {/* Action Badge Overlay */}
                <div className={`absolute -bottom-1 -right-1 h-[26px] w-[26px] rounded-full border-[3px] border-background flex items-center justify-center ${ui.bg} shadow-sm z-20`}>
                  <Icon className={`h-3.5 w-3.5 ${ui.text}`} />
                </div>
              </div>

              {/* Content Column */}
              <div className="flex flex-1 flex-col gap-1.5 justify-center mt-0.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <span className="text-[15px] leading-snug tracking-tight">
                      <span className="font-bold text-foreground mr-1.5">{renderActors()}</span>
                      <span className="text-muted-foreground font-medium">{ui.action}</span>
                    </span>
                  </div>
                </div>
                
                {n.content && (
                  <p className={`mt-0.5 text-[14px] leading-relaxed line-clamp-2 transition ${(!n.is_read && !isActorMe) ?"font-semibold text-foreground/90" : "text-muted-foreground"}`}>
                    "{renderText(n)}"
                  </p>
                )}
                
                <span className="text-[11px] text-muted-foreground/50 mt-1">
                  {new Date(n.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })
        )}
      </div>

      {(activeTab === 'mentions' ? (!mentionsLoading && (!mentionsFeed || mentionsFeed.length === 0)) : filteredNotifs.length === 0) && (
        <div className="flex flex-1 flex-col items-center justify-center py-24 text-center px-10">
          <div className="h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mb-5">
            <BellRing className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">Nothing to show yet</h3>
          <p className="text-[13.5px] text-muted-foreground leading-relaxed max-w-[250px]">
            {activeTab === "verified" 
              ? "Verified notifications from Zero Club will appear here once you reach Level 5." 
              : activeTab === "mentions" 
              ? "When you are mentioned in a post, or you mention someone, it will appear here." 
              : "When people interact with you or your clubs, you'll see it here."}
          </p>
        </div>
      )}

      {commentPost && (
        <CommentDrawer 
          isOpen={!!commentPost} 
          onClose={() => setCommentPost(null)} 
          post={commentPost} 
        />
      )}
    </div>
  );
}
