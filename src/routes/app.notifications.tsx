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
import { formatDistanceToNow } from "date-fns";
import { SwipeToDelete } from "@/components/SwipeToDelete";

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
        .select('*, actor:profiles!actor_id(id, username, full_name, avatar_url), recipient:profiles!recipient_id(id, username, full_name, avatar_url)')
        .or(`recipient_id.eq.${session.user.id},and(actor_id.eq.${session.user.id},type.eq.mention)`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setNotifs(data || []);
    } catch (err: any) {
      toast.error("Could not load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser?.id) return;

    const channel = supabase
      .channel(`notifications:${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentUser.id}` },
        async ({ new: notification }) => {
          const [{ data: actor }, { data: recipient }] = await Promise.all([
            supabase.from('profiles').select('id, username, full_name, avatar_url').eq('id', notification.actor_id).maybeSingle(),
            supabase.from('profiles').select('id, username, full_name, avatar_url').eq('id', notification.recipient_id).maybeSingle(),
          ]);
          setNotifs((current) => current.some((item) => item.id === notification.id)
            ? current
            : [{ ...notification, actor, recipient }, ...current].slice(0, 100));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  const markAllRead = async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', currentUser.id);
      
      if (error) throw error;
      setNotifs((current) => current.map(n => ({ ...n, is_read: true })));
      toast.success("All caught up!");
    } catch (err) {
      toast.error("Could not update notifications");
    }
  };

  const markRead = async (id: string) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      setNotifs((current) => current.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {}
  };

  /** Removes a notification (or a whole grouped set) for this member. */
  const deleteNotification = async (ids: string[]) => {
    const previous = notifs;
    setNotifs((current) => current.filter((n) => !ids.includes(n.id)));
    try {
      const { error } = await supabase.from('notifications').delete().in('id', ids);
      if (error) throw error;
      toast.success(ids.length > 1 ? "Notifications deleted" : "Notification deleted");
    } catch (err: any) {
      setNotifs(previous);
      toast.error(err.message || "Could not delete notification");
    }
  };

  const getNotifUI = (type: string, actorName?: string, isActorMe?: boolean, recipientName?: string) => {
    switch (type) {
      case 'like': return { icon: HeartHandshake, bg: 'bg-primary', text: 'text-primary-foreground', action: 'liked your post' };
      case 'comment_like': return { icon: HeartHandshake, bg: 'bg-rose-500', text: 'text-white', action: 'liked your comment' };
      case 'comment': return { icon: MessageCircleMore, bg: 'bg-sky-600', text: 'text-white', action: 'commented on your post' };
      case 'follow': return { icon: UserRoundPlus, bg: 'bg-emerald-600', text: 'text-white', action: 'started following you' };
      case 'repost': return { icon: ArrowUpFromLine, bg: 'bg-emerald-600', text: 'text-white', action: 'reposted your post' };
      case 'mention': return { icon: AtSign, bg: 'bg-amber-600', text: 'text-white', action: isActorMe ? `You mentioned @${recipientName}` : 'mentioned you' };
      case 'build_tagged': return { icon: Trophy, bg: 'bg-violet-600', text: 'text-white', action: 'tagged their post for verification' };
      case 'game_buzz': return { icon: BellRing, bg: 'bg-amber-400', text: 'text-black', action: 'buzzed you into a Zero Game' };
      case 'system': return { icon: Zap, bg: 'bg-amber-500', text: 'text-black', action: `Referral reward: You and ${actorName} both earned 200 ZP.` };
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
    const grouped = new Map<string, any>();

    filteredNotifs.forEach((notification) => {
      if (!['like', 'comment_like', 'follow', 'repost'].includes(notification.type)) {
        groups.push(notification);
        return;
      }

      const key = notification.type === 'follow'
        ? `follow:${new Date(notification.created_at).toDateString()}`
        : `${notification.type}:${notification.type === 'comment_like' ? notification.comment_id : notification.entity_id}`;
      const existing = grouped.get(key);

      if (!existing) {
        const group = {
          ...notification,
          isGroup: false,
          groupActors: notification.actor ? [notification.actor] : [],
          groupIds: [notification.id],
        };
        grouped.set(key, group);
        groups.push(group);
        return;
      }

      existing.isGroup = true;
      existing.groupIds.push(notification.id);
      existing.is_read = existing.is_read && notification.is_read;
      if (notification.actor && !existing.groupActors.some((actor: any) => actor.id === notification.actor.id)) {
        existing.groupActors.push(notification.actor);
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
    <div className="flex min-h-screen flex-col bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[900px] px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] md:px-6 md:pt-5">
          <div className="mb-4">
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">Notifications</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Updates from your work, network and communities</p>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-card p-1">
          {["all", "verified", "mentions"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative flex h-10 min-w-0 items-center justify-center rounded-md px-2 text-[12px] font-semibold tracking-tight transition-colors ${
              activeTab === tab ? "bg-primary/[0.09] text-primary" : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[900px] items-center justify-between border-b border-border/50 px-5 py-3 md:px-6">
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

      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-2.5 p-4 md:px-6 md:py-5">
        {activeTab === 'mentions' ? (
          mentionsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : mentionsFeed && mentionsFeed.length > 0 ? (
            mentionsFeed.map((post: any) => (
              <div 
                key={post.id} 
                className="relative overflow-hidden rounded-lg border border-border/60 bg-background transition hover:border-border"
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
            
            if (n.type === 'game_buzz' && n.entity_id) {
              navigate({ to: '/app/games/$id', params: { id: n.entity_id } });
            } else if (['like', 'comment_like', 'comment', 'repost', 'mention', 'build_tagged'].includes(n.type) && n.entity_id) {
              navigate({ to: '/app/post/$id', params: { id: n.entity_id } });
            } else if (n.type === 'follow' && n.actor_id) {
              navigate({ to: '/app/profile/$id', params: { id: n.actor_id } });
            }
          };

          return (
            <SwipeToDelete key={n.id} onDelete={() => deleteNotification(n.isGroup ? n.groupIds : [n.id])}>
            <div
              onClick={handleNotificationClick}
              className={`group relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-3.5 overflow-hidden rounded-lg border p-3.5 transition-[background-color,border-color,transform] duration-150 active:scale-[0.995] sm:p-4 ${(!n.is_read && !isActorMe) ? "border-primary/25 bg-primary/[0.045] shadow-sm" : "border-border/60 bg-card hover:border-border hover:bg-accent/20"}`}
            >
              {(!n.is_read && !isActorMe) && (
                <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-primary" />
              )}
              
              {/* Avatar Row */}
              <div className="relative flex w-fit shrink-0 items-start pt-0.5">
                <div className="flex -space-x-3">
                  {n.isGroup ? (
                    n.groupActors.slice(0, 3).map((actor: any, i: number) => (
                      <Link 
                        key={actor.id}
                        to="/app/profile/$id" 
                        params={{ id: actor.id }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ zIndex: 10 - i }}
                        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-card bg-muted text-xs font-bold text-muted-foreground shadow-sm transition active:opacity-70 sm:h-12 sm:w-12"
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
                      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-card bg-muted text-sm font-bold text-muted-foreground shadow-sm transition active:opacity-70 sm:h-12 sm:w-12"
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
                <div className={`absolute -bottom-1 -right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border-[2px] border-card ${ui.bg} shadow-sm`}>
                  <Icon className={`h-3.5 w-3.5 ${ui.text}`} />
                </div>
              </div>

              {/* Content Column */}
              <div className="mt-0.5 flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <span className="text-[13px] leading-snug tracking-tight sm:text-[14px]">
                      <span className="mr-1 font-semibold text-foreground">{renderActors()}</span>
                      <span className="font-normal text-muted-foreground">{ui.action}</span>
                    </span>
                  </div>
                </div>
                
                {n.content && (
                  <p className={`mt-0.5 line-clamp-2 text-[12px] leading-relaxed transition sm:text-[13px] ${(!n.is_read && !isActorMe) ?"font-medium text-foreground/90" : "text-muted-foreground"}`}>
                    "{renderText(n)}"
                  </p>
                )}
                
                <span className="mt-1 text-[10.5px] text-muted-foreground/65">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
              </div>
              <div className="flex items-start pt-1">{(!n.is_read && !isActorMe) && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}</div>
            </div>
            </SwipeToDelete>
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
