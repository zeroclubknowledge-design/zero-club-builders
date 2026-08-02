import { supabase } from "@/lib/supabase";

export async function fetchPostComments(postId: string) {
  const { data: rpcComments, error: rpcError } = await supabase.rpc("get_post_comments", {
    target_post_id: postId,
  });

  if (!rpcError && Array.isArray(rpcComments)) {
    return rpcComments;
  }

  // Keep clients compatible while the database migration is being deployed.
  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (commentsError) {
    throw new Error(rpcError?.message || commentsError.message || "Comments could not be loaded");
  }

  const profileIds = [...new Set((comments || []).map((comment: any) => comment.profile_id).filter(Boolean))];
  if (profileIds.length === 0) return comments || [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", profileIds);

  if (profilesError) {
    console.warn("Comment authors could not be loaded:", profilesError.message);
  }

  const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
  return (comments || []).map((comment: any) => ({
    ...comment,
    profiles: profilesById.get(comment.profile_id) || null,
  }));
}
