import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/share/$kind/$name/$username")({
  beforeLoad: async ({ params }) => {
    const { data, error } = await supabase.rpc("resolve_named_share", {
      p_path: `/share/${params.kind}/${params.name}/${params.username}`,
    });
    if (error) throw new Error("Couldn't load this link. Please try again.");
    if (typeof data !== "string" || !data.startsWith("/") || data.startsWith("//")) {
      throw new Error("This share link was not found.");
    }
    throw redirect({ href: data });
  },
});
