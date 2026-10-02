import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { buildNoteHead } from "@/features/notes/noteHead";
import { NoteReaderPage } from "@/features/notes/NoteReaderPage";

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
  const { slug } = Route.useParams();
  // The slug lets a signed-in reader load a bootcamp-only note the server render could not.
  return <NoteReaderPage noteId={note?.id || ""} initialNote={note} slug={slug} />;
}
