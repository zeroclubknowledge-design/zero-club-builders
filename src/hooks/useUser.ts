import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/auth";

export function useUser() {
  return useQuery({
    queryKey: ["profile", "current"],
    queryFn: async () => {
      console.log("[useUser] Fetching cached session...");
      const { data: { session }, error: sessionError } = await getCachedSession();
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
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", session.user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", session.user.id),
        supabase.from("follows").select("following_id").eq("follower_id", session.user.id)
      ]);

      let profileData = data || {};

      // REPAIR LOGIC: If username is an email or missing, try to recover from metadata
      const metaUsername = session.user.user_metadata?.username || session.user.user_metadata?.preferred_username;
      const metaFullName = session.user.user_metadata?.full_name || session.user.user_metadata?.name;

      if (profileData.username?.includes('@') || !profileData.username) {
        if (metaUsername) {
          console.log("[useUser] Repairing missing username with:", metaUsername);
          profileData.username = metaUsername;
          profileData.full_name = metaFullName || profileData.full_name;
          
          await supabase
            .from('profiles')
            .upsert({ 
              id: session.user.id,
              username: metaUsername,
              full_name: metaFullName || profileData.full_name,
              avatar_url: profileData.avatar_url || session.user.user_metadata?.avatar_url || null
            });
        } else {
          console.log("[useUser] No profile row exists and no metaUsername found. User needs to finish signup.");
          if (typeof window !== 'undefined' && window.location.pathname.startsWith("/app")) {
            console.log("[useUser] Redirecting to /signup");
            window.location.href = "/signup";
          }
        }
      }

      const finalProfile = {
        ...profileData,
        followers_count: followersResult.count || 0,
        following_count: followingResult.count || 0,
        following_ids: followingListResult.data?.map(f => f.following_id) || [],
        isAuthenticated: true,
        userId: session.user.id,
      };
      
      console.log("[useUser] Final resolved profile:", finalProfile);
      return finalProfile;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1,
  });
}
