import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { buildNoteHead, NoteReaderPage } from "@/routes/app.notes.$id";

export const Route = createFileRoute("/notes/$slug")({
  loader: async ({ params: { slug } }) => {
    const { data: note, error } = await supabase
      .from("notes")
      .select("*, profiles(username, full_name, avatar_url)")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) console.error("Error loading public note:", error);
    return { note };
  },
  head: ({ loaderData }) => buildNoteHead(loaderData?.note),
  component: PublicNoteRoutePage,
});

function PublicNoteRoutePage() {
  const { note } = Route.useLoaderData();
  return <NoteReaderPage noteId={note?.id || ""} initialNote={note} />;
}
