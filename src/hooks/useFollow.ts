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

    // Optimistic: flip the id in the cached profile so the UI responds instantly.
    const next = !isFollowing;
    queryClient.setQueryData(["profile", "current"], (old: any) => {
      if (!old) return old;
      const ids: string[] = old.following_ids || [];
      return {
        ...old,
        following_ids: next ? [...ids, targetUserId] : ids.filter((id) => id !== targetUserId),
        following_count: Math.max(0, (old.following_count || 0) + (next ? 1 : -1)),
      };
    });

    try {
      if (next) {
        const { error } = await supabase
          .from("follows")
          .insert([{ follower_id: currentUser.id, following_id: targetUserId }]);
        if (error) throw error;
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
