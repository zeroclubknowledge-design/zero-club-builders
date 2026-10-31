import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/club/$id/$username")({
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.rpc("resolve_club_invite", {
      p_slug: params.id,
      p_username: params.username,
    });
    if (error) throw new Error("Couldn't load this club invite. Please try again.");
    if (!data?.club_id) throw new Error("This club invite was not found.");
    throw redirect({ href: `/club/${data.club_id}${data.inviter_id ? `?ref=${data.inviter_id}` : ""}` });
  },
});
