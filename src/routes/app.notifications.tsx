import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo, type SetStateAction } from "react";
import {
  BellRing, UserRoundPlus, ThumbsUp, MessageSquare, Zap,
  CheckCheck, Repeat, AtSign, Loader2, ShieldCheck, Gamepad2, BriefcaseBusiness
} from "@/components/icons/glyphs";
import { useFollow } from "@/hooks/useFollow";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { stripMarkdownAsterisks } from "@/components/LinkifiedText";
import { contentPreview } from "@/lib/contentPreview";
import { toast } from "sonner";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { enrichPosts } from "@/api";
import { useUser } from "@/hooks/useUser";
import { getFirstName } from "@/lib/utils";
import { SwipeToDelete } from "@/components/SwipeToDelete";

export const Route = createFileRoute("/app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const [commentPost, setCommentPost] = useState<any>(null);

  const { data: profile, isLoading: profileLoading } = useUser();
  const currentUser = profile;
  const queryClient = useQueryClient();
  const notificationKey = ['notifications', profile?.id];
  const notifications = useQuery({
    queryKey: notificationKey,
    enabled: !!profile?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*, actor:profiles!actor_id(id, username, full_name, avatar_url), recipient:profiles!recipient_id(id, username, full_name, avatar_url)')
        .or(`recipient_id.eq.${profile!.id},and(actor_id.eq.${profile!.id},type.eq.mention)`)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });
  const notifs: any[] = notifications.data || [];
  const loading = profileLoading || notifications.isLoading;
  const setNotifs = (next: SetStateAction<any[]>) => queryClient.setQueryData<any[]>(notificationKey, (current) => typeof next === 'function' ? next(current || []) : next);

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
    if (profile?.id && notifications.isSuccess) void markAllSeen(profile.id);
  }, [profile?.id, notifications.isSuccess]);
  useEffect(() => {
    if (notifications.isError) toast.error("Could not load notifications");
  }, [notifications.isError]);

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
          void markAllSeen(currentUser.id);
          setNotifs((current) => current.some((item) => item.id === notification.id)
            ? current
            : [{ ...notification, actor, recipient }, ...current].slice(0, 100));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  /** Marks everything as read in the database without touching what's on screen. */
  async function markAllSeen(userId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);
    if (!error) window.dispatchEvent(new Event('zc:notifications-seen'));
  }

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

  /* One family of badge colours: pink for appreciation, green for proof,
     ink for everything else. The old set used six unrelated hues. */
  const getNotifUI = (type: string, actorName?: string, isActorMe?: boolean, recipientName?: string) => {
    const ink = { bg: 'bg-foreground', text: 'text-background' };
    const pink = { bg: 'bg-accent', text: 'text-accent-foreground' };
    const green = { bg: 'bg-success', text: 'text-success-foreground' };
    switch (type) {
      case 'like': return { icon: ThumbsUp, ...pink, action: 'liked your post' };
      case 'comment_like': return { icon: ThumbsUp, ...pink, action: 'liked your comment' };
      case 'comment': return { icon: MessageSquare, ...ink, action: 'commented on your post' };
      case 'follow': return { icon: UserRoundPlus, ...ink, action: 'started following you' };
      case 'repost': return { icon: Repeat, ...ink, action: 'reposted your post' };
      case 'mention': return { icon: AtSign, ...ink, action: isActorMe ? `You mentioned @${recipientName}` : 'tagged you' };
      case 'club_mention': return { icon: AtSign, ...ink, action: isActorMe ? `You mentioned @${recipientName}` : 'tagged you in a club chat' };
      case 'build_tagged': return { icon: ShieldCheck, ...green, action: 'tagged their post for verification' };
      case 'game_buzz': return { icon: Gamepad2, ...ink, action: 'buzzed you into a Zero Game' };
      // System notices carry their own message (referral ZP, tutor applications, rewards...).
      case 'system': return { icon: Zap, ...ink, action: '' };
      // Hiring on Opportunities: the message says what happened.
      case 'gig': return { icon: BriefcaseBusiness, ...green, action: '' };
      default: return { icon: BellRing, ...ink, action: 'interacted with you' };
    }
  };

  const renderText = (n: any) => {
    // contentPreview first: a voice-note-only comment has no text to show, so
    // the raw $$MEDIA$$ token was being printed. It describes the attachment
    // instead ("a voice note") and never leaks the marker or the URL.
    const raw = contentPreview(n.content);
    const text = raw ? stripMarkdownAsterisks(raw.replace(/<[^>]*>?/gm, '')).trim() : '';
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  }

  const filteredNotifs = notifs.filter(n => {
    if (activeTab === "all") return true;
    if (activeTab === "mentions") return n.type === "mention" || n.type === "club_mention";
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
        : notification.type === 'gig'
          ? `gig:${notification.id}`
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const unreadCount = filteredNotifs.filter(n => !n.is_read && n.actor_id !== currentUser?.id).length;
  const isUnread = (n: any) => !n.is_read && n.actor_id !== currentUser?.id;
  const newNotifs = displayNotifs.filter(isUnread);
  const earlierNotifs = displayNotifs.filter((n) => !isUnread(n));

  const renderNotification = (n: any) => {
    const isActorMe = n.actor_id === currentUser?.id;
    const ui = getNotifUI(n.type, n.actor?.full_name || n.actor?.username, isActorMe, n.recipient?.username);
    const Icon = ui.icon;
    const unread = isUnread(n);

    const renderActors = () => {
      if (isActorMe && (n.type === 'mention' || n.type === 'club_mention')) return currentUser?.full_name || currentUser?.username || "You";
      if (!n.isGroup) return n.actor?.full_name || n.actor?.username;
      const actors = n.groupActors;
      if (actors.length === 1) return actors[0].full_name || actors[0].username;
      if (actors.length === 2) return `${actors[0].full_name || actors[0].username} and ${actors[1].full_name || actors[1].username}`;
      return `${actors[0].full_name || actors[0].username} and ${actors.length - 1} others`;
    };

    const handleNotificationClick = () => {
      if (n.isGroup) {
        n.groupIds.forEach((id: string) => markRead(id));
      } else {
        markRead(n.id);
      }

      if (n.type === 'gig' && n.entity_id) {
        navigate({ to: '/app/quests', search: { gig: n.entity_id } });
      } else if (n.type === 'game_buzz' && n.entity_id) {
        navigate({ to: '/app/games/$id', params: { id: n.entity_id } });
      } else if (n.type === 'club_mention' && n.entity_id) {
        navigate({ to: '/app/clubs/chat', search: { clubId: n.entity_id } });
      } else if (['like', 'comment_like', 'comment', 'repost', 'mention', 'build_tagged'].includes(n.type) && n.entity_id) {
        navigate({ to: '/app/post/$id', params: { id: n.entity_id } });
      } else if (n.type === 'follow' && n.actor_id) {
        navigate({ to: '/app/profile/$id', params: { id: n.actor_id } });
      }
    };

    const avatarPerson = isActorMe && n.type === 'mention' ? n.recipient : n.isGroup ? n.groupActors[0] : n.actor;
    const avatarId = isActorMe && n.type === 'mention' ? n.recipient_id : avatarPerson?.id || n.actor_id;
    const isSystem = n.type === 'system';
    const isTutorApproval = isSystem && String(n.content || '').includes('approved as a Zero Club Tutor');
    const hasActor = Boolean(avatarPerson?.id);

    return (
      <SwipeToDelete key={n.id} onDelete={() => deleteNotification(n.isGroup ? n.groupIds : [n.id])}>
        <div
          onClick={handleNotificationClick}
          className={`grid cursor-pointer grid-cols-[48px_minmax(0,1fr)_auto] gap-3 border-b border-border px-4 py-3 transition-colors ${
            unread ? "bg-accent/[0.06] hover:bg-accent/[0.09]" : "bg-card hover:bg-foreground/[0.02]"
          }`}
        >
          <div className="relative h-12 w-12">
            {isSystem && !hasActor ? (
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-foreground font-display text-[14px] font-bold text-background">{isTutorApproval ? 'ZC' : 'ZP'}</span>
            ) : (
              <Link
                to="/app/profile/$id"
                params={{ id: avatarId }}
                onClick={(e) => e.stopPropagation()}
                className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground"
              >
                {avatarPerson?.avatar_url ? (
                  <img src={avatarPerson.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  (avatarPerson?.username || "U").substring(0, 1).toUpperCase()
                )}
              </Link>
            )}
            {!isSystem && (
              <span className={`absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 ${unread ? "border-[color-mix(in_oklab,var(--accent)_6%,var(--card))]" : "border-card"} ${ui.bg} ${ui.text}`}>
                <Icon className="h-2.5 w-2.5" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[14px] leading-[1.4] text-foreground">
              {!isSystem && n.type !== 'gig' && <span className="font-semibold">{renderActors()} </span>}
              <span>{isSystem ? (String(n.content || '').trim() || 'Zero Club update') : n.type === 'gig' ? String(n.content || '').trim() : ui.action}</span>
            </p>
            {n.content && !isSystem && n.type !== 'gig' && (
              <p className="mt-1 line-clamp-2 text-[13px] leading-[1.4] text-muted-foreground">“{renderText(n)}”</p>
            )}
            {n.type === 'follow' && !isActorMe && n.actor_id && <FollowBack userId={n.actor_id} />}
          </div>

          <div className="flex flex-col items-end gap-1.5 text-[12px] text-muted-foreground">
            <span className="whitespace-nowrap tabular-nums">{shortTime(n.created_at)}</span>
            {unread && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Unread" />}
          </div>
        </div>
      </SwipeToDelete>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-20 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center justify-between px-4">
          <h1 className="font-display text-[20px] font-semibold text-foreground">Notifications</h1>
          {unreadCount > 0 && activeTab !== 'mentions' && (
            <button onClick={markAllRead} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-muted-foreground tap hover:bg-foreground/[0.04] hover:text-foreground">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          )}
        </div>
        <div className="zc-page-width mx-auto flex w-full max-w-[680px] gap-2 border-b border-border px-4 pb-3">
          {["all", "verified", "mentions"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-8 rounded-full px-3.5 text-[14px] font-semibold tap ${
                activeTab === tab ? "bg-foreground text-background" : "border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <div className="zc-page-width mx-auto flex w-full max-w-[680px] flex-col">
        {activeTab === 'mentions' ? (
          mentionsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : mentionsFeed && mentionsFeed.length > 0 ? (
            mentionsFeed.map((post: any) => (
              <PostCard key={post.id} post={post} currentUser={currentUser} onCommentClick={setCommentPost} />
            ))
          ) : null
        ) : (
          <>
            {newNotifs.length > 0 && (
              <section className="mt-2 bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
                <h2 className="px-4 pb-1.5 pt-3 font-display text-[16px] font-semibold text-foreground">New</h2>
                {newNotifs.map(renderNotification)}
              </section>
            )}
            {earlierNotifs.length > 0 && (
              <section className="mt-2 bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
                <h2 className="px-4 pb-1.5 pt-3 font-display text-[16px] font-semibold text-foreground">Earlier</h2>
                {earlierNotifs.map(renderNotification)}
              </section>
            )}
          </>
        )}
      </div>

      {(activeTab === 'mentions' ? (!mentionsLoading && (!mentionsFeed || mentionsFeed.length === 0)) : filteredNotifs.length === 0) && (
        <div className="zc-page-width mx-auto mt-2 flex w-full max-w-[680px] flex-col items-center bg-card px-10 py-20 text-center md:rounded-xl">
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-foreground/[0.05]">
            <BellRing className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mb-1.5 font-display text-[18px] font-semibold text-foreground">Nothing to show yet</h3>
          <p className="max-w-[260px] text-[14px] leading-relaxed text-muted-foreground">
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
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}

/** "Follow back" right inside a follow notification. */
function FollowBack({ userId }: { userId: string }) {
  const { isFollowing, isSelf, toggleFollow, loading } = useFollow(userId);
  if (isSelf || isFollowing) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void toggleFollow();
      }}
      disabled={loading}
      className="mt-2 inline-flex h-8 items-center rounded-full border-[1.5px] border-accent px-3.5 text-[14px] font-semibold text-accent tap hover:bg-accent/[0.06] disabled:opacity-50"
    >
      Follow back
    </button>
  );
}

function shortTime(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}
