import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { buildNoteHead } from "@/features/notes/noteHead";
import { NoteReaderPage } from "@/features/notes/NoteReaderPage";

export const Route = createFileRoute("/app/notes/$id")({
  loader: async ({ params: { id } }) => {
    const { data: note, error } = await supabase
      .from("notes")
      .select("*, profiles(username, full_name, avatar_url)")
      .eq("id", id)
      .eq("is_published", true)
      .maybeSingle();

    if (error) console.error("Error loading note:", error);

    // Old UUID links remain valid, but immediately settle on the readable,
    // canonical public URL once this note has a slug.
    if (note?.slug) {
      throw redirect({ to: "/notes/$slug", params: { slug: note.slug }, replace: true });
    }

    return { note };
  },
  head: ({ loaderData }) => buildNoteHead(loaderData?.note),
  component: NoteReaderRoutePage,
});

function NoteReaderRoutePage() {
  const { id } = Route.useParams();
  const { note } = Route.useLoaderData();
  return <NoteReaderPage noteId={id} initialNote={note} />;
}
