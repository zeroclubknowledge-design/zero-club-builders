import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";

/**
 * Single source of truth for follow state.
 *
 * Follow status is read from the current user's `following_ids`, so every
 * screen (feed cards, post details, profiles) reflects the same value.
 * After a follow or unfollow we invalidate that profile query, which
 * refreshes the state app-wide instead of only where the click happened.
 */
export function useFollow(targetUserId?: string) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useUser();
  const [loading, setLoading] = useState(false);

  const isSelf = !!targetUserId && currentUser?.id === targetUserId;
  const isFollowing = !!(targetUserId && currentUser?.following_ids?.includes(targetUserId));

  const refreshEverywhere = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
    // useUser reads following_ids from this summary, not from the profile row.
    queryClient.invalidateQueries({ queryKey: ["profile", "follow-summary"] });
    queryClient.invalidateQueries({ queryKey: ["profile", id] });
    queryClient.invalidateQueries({ queryKey: ["networkStats", id] });
    queryClient.invalidateQueries({ queryKey: ["followStatus", id] });
    queryClient.invalidateQueries({ queryKey: ["post"] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  /** Returns the new following state, or null when nothing changed. */
  const toggleFollow = async (): Promise<boolean | null> => {
    if (!currentUser?.id || !targetUserId || isSelf || loading) return null;
    setLoading(true);

    // Optimistic: flip the id so the button responds instantly. useUser merges
    // following_ids from the follow summary over the profile, so that is the
    // copy that has to change — flipping only the profile left the button on
    // "Follow", and a second tap tried to follow the same person twice.
    const next = !isFollowing;
    const flip = (old: any) => {
      if (!old) return old;
      const ids: string[] = old.following_ids || [];
      return {
        ...old,
        following_ids: next
          ? Array.from(new Set([...ids, targetUserId]))
          : ids.filter((id) => id !== targetUserId),
        following_count: Math.max(0, (old.following_count || 0) + (next ? 1 : -1)),
      };
    };
    queryClient.setQueryData(["profile", "current"], flip);
    queryClient.setQueryData(["profile", "follow-summary", currentUser.id], flip);

    try {
      if (next) {
        // Already following (another tab, a double tap, a stale screen) is
        // the result we wanted, not an error.
        const { error } = await supabase
          .from("follows")
          .upsert([{ follower_id: currentUser.id, following_id: targetUserId }], {
            onConflict: "follower_id,following_id",
            ignoreDuplicates: true,
          });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
      }
      refreshEverywhere(targetUserId);
      return next;
    } catch (error) {
      refreshEverywhere(targetUserId);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { isFollowing, isSelf, loading, toggleFollow, currentUser };
}
