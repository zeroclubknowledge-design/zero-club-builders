import { supabase } from "@/lib/supabase";

export interface NotifyMentionParams {
  content: string;
  actorId: string;
  entityId: string;
  type?: 'post' | 'comment' | 'club_chat';
  entityTitle?: string;
}

/**
 * Parses `@username` mentions from content and creates notification records
 * for each mentioned user.
 */
export async function notifyMentionedUsers({
  content,
  actorId,
  entityId,
  type = 'post',
  entityTitle,
}: NotifyMentionParams): Promise<void> {
  if (!content) return;

  const mentions = content.match(/@(\w+)/g);
  if (!mentions || mentions.length === 0) return;

  const usernames = Array.from(new Set(mentions.map((m) => m.slice(1))));
  if (usernames.length === 0) return;

  try {
    const { data: mentionedProfiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('username', usernames);

    if (!mentionedProfiles || mentionedProfiles.length === 0) return;

    const notifType = type === 'club_chat' ? 'club_mention' : 'mention';

    let notifContent = 'tagged you in a post';
    if (type === 'comment') {
      notifContent = 'tagged you in a comment';
    } else if (type === 'club_chat') {
      notifContent = entityTitle ? `tagged you in ${entityTitle}` : 'tagged you in a club chat';
    }

    const mentionNotifications = mentionedProfiles
      .filter((p) => p.id !== actorId)
      .map((p) => ({
        recipient_id: p.id,
        actor_id: actorId,
        type: notifType,
        content: notifContent,
        entity_id: entityId,
      }));

    if (mentionNotifications.length > 0) {
      await supabase.from('notifications').insert(mentionNotifications);
    }
  } catch (err) {
    console.error("Failed to send mention notifications:", err);
  }
}
