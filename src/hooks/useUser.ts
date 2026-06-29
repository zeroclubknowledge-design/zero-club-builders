import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/auth";

export function useUser() {
  return useQuery({
    queryKey: ["profile", "current"],
    queryFn: async () => {
      const { data: { session } } = await getCachedSession();
      if (!session) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (error) throw error;

      // Fetch follow counts and actual following IDs
      const [followersResult, followingResult, followingListResult] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", session.user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", session.user.id),
        supabase.from("follows").select("following_id").eq("follower_id", session.user.id)
      ]);

      let profileData = { ...data };

      // REPAIR LOGIC: If username is an email or missing, try to recover from metadata
      const metaUsername = session.user.user_metadata?.username;
      const metaFullName = session.user.user_metadata?.full_name;

      if (profileData.username?.includes('@') || !profileData.username) {
        if (metaUsername && metaUsername !== profileData.username) {
          // Update local object immediately
          profileData.username = metaUsername;
          profileData.full_name = metaFullName || profileData.full_name;
          
          // Silently update database for future
          await supabase
            .from('profiles')
            .update({ 
              username: metaUsername,
              full_name: metaFullName || profileData.full_name
            })
            .eq('id', session.user.id);
        }
      }

      return {
        ...profileData,
        followers_count: followersResult.count || 0,
        following_count: followingResult.count || 0,
        following_ids: followingListResult.data?.map(f => f.following_id) || [],
        isAuthenticated: true,
        userId: session.user.id,
      };
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1,
  });
}
