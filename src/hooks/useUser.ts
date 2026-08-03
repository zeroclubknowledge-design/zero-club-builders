import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/auth";

type ProfileUpdate = Record<string, unknown>;
type ProfileUpdateListener = (profile: ProfileUpdate) => void;

type CurrentProfileChannel = {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<ProfileUpdateListener>;
  teardownTimer: ReturnType<typeof setTimeout> | null;
};

const currentProfileChannels = new Map<string, CurrentProfileChannel>();

function createCurrentProfileChannelName(profileId: string) {
  const instanceId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `current-profile:${profileId}:${instanceId}`;
}

function listenForCurrentProfileUpdates(profileId: string, listener: ProfileUpdateListener) {
  let entry = currentProfileChannels.get(profileId);

  if (!entry) {
    const listeners = new Set<ProfileUpdateListener>([listener]);
    const channel = supabase
      .channel(createCurrentProfileChannelName(profileId))
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profileId}` },
        ({ new: updatedProfile }) => {
          listeners.forEach((notify) => notify(updatedProfile as ProfileUpdate));
        },
      );

    entry = { channel, listeners, teardownTimer: null };
    currentProfileChannels.set(profileId, entry);
    channel.subscribe();
  } else {
    if (entry.teardownTimer) {
      clearTimeout(entry.teardownTimer);
      entry.teardownTimer = null;
    }
    entry.listeners.add(listener);
  }

  return () => {
    const activeEntry = currentProfileChannels.get(profileId);
    if (!activeEntry) return;

    activeEntry.listeners.delete(listener);
    if (activeEntry.listeners.size > 0 || activeEntry.teardownTimer) return;

    // React can briefly unmount and remount effects in development. Deferring
    // teardown lets the remount retain this channel instead of racing removal.
    activeEntry.teardownTimer = setTimeout(() => {
      const latestEntry = currentProfileChannels.get(profileId);
      if (latestEntry !== activeEntry || latestEntry.listeners.size > 0) return;

      currentProfileChannels.delete(profileId);
      void supabase.removeChannel(latestEntry.channel);
    }, 250);
  };
}

export function useUser() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["profile", "current"],
    queryFn: async () => {
      console.log("[useUser] Fetching cached session...");
      const {
        data: { session },
        error: sessionError,
      } = await getCachedSession();
      if (sessionError) {
        console.error("[useUser] Session error:", sessionError);
      }

      if (!session) {
        console.log("[useUser] No session found, returning null");
        return null;
      }

      console.log("[useUser] Fetching profile for user:", session.user.id);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("[useUser] Error fetching profile:", error);
        throw error;
      }

      console.log("[useUser] Profile data from DB:", data);

      // Fetch follow counts and actual following IDs
      const [followersResult, followingResult, followingListResult] = await Promise.all([
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", session.user.id),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", session.user.id),
        supabase.from("follows").select("following_id").eq("follower_id", session.user.id),
      ]);

      const profileData = data || {};

      // REPAIR LOGIC: If username is an email or missing, try to recover from metadata
      const metaUsername =
        session.user.user_metadata?.username || session.user.user_metadata?.preferred_username;
      const metaFullName =
        session.user.user_metadata?.full_name || session.user.user_metadata?.name;

      if (profileData.username?.includes("@") || !profileData.username) {
        if (metaUsername) {
          console.log("[useUser] Repairing missing username with:", metaUsername);
          profileData.username = metaUsername;
          profileData.full_name = metaFullName || profileData.full_name;

          await supabase.from("profiles").upsert({
            id: session.user.id,
            username: metaUsername,
            full_name: metaFullName || profileData.full_name,
            avatar_url: profileData.avatar_url || session.user.user_metadata?.avatar_url || null,
          });
        } else {
          console.log(
            "[useUser] No profile row exists and no metaUsername found. User needs to finish signup.",
          );
          if (typeof window !== "undefined" && window.location.pathname.startsWith("/app")) {
            console.log("[useUser] Redirecting to /signup");
            window.location.href = "/signup";
          }
        }
      }

      const finalProfile = {
        ...profileData,
        followers_count: followersResult.count || 0,
        following_count: followingResult.count || 0,
        following_ids: followingListResult.data?.map((f) => f.following_id) || [],
        isAuthenticated: true,
        userId: session.user.id,
      };

      console.log("[useUser] Final resolved profile:", finalProfile);
      return finalProfile;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1,
  });

  useEffect(() => {
    const profileId = query.data?.id;
    if (!profileId) return;

    return listenForCurrentProfileUpdates(profileId, (updatedProfile) => {
      queryClient.setQueryData<Record<string, unknown> | null | undefined>(
        ["profile", "current"],
        (current) => (current ? { ...current, ...updatedProfile } : current),
      );
    });
  }, [query.data?.id, queryClient]);

  return query;
}
