import { createFileRoute } from "@tanstack/react-router";
import { socialPreviewImageUrl } from "@/lib/share";
import { supabase } from "@/lib/supabase";

async function noteImageResponse(slug: string, headOnly = false) {
  const { data: note, error } = await supabase
    .from("notes")
    .select("cover_url")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !note?.cover_url) {
    return new Response(headOnly ? null : "Note image not found", { status: 404 });
  }

  try {
    // Note covers can be full-resolution photos. Preview clients are far more
    // reliable with a small, standard social card served from the shared link's
    // own domain, so resize and convert without altering the original cover.
    const upstream = await fetch(socialPreviewImageUrl(note.cover_url), {
      headers: { accept: "image/jpeg,image/*" },
    });

    if (!upstream.ok || !upstream.body) {
      return Response.redirect(note.cover_url, 302);
    }

    const headers = new Headers({
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);

    return new Response(headOnly ? null : upstream.body, { status: 200, headers });
  } catch {
    return Response.redirect(note.cover_url, 302);
  }
}

export const Route = createFileRoute("/notes/$slug/preview-v1")({
  server: {
    handlers: {
      GET: async ({ params }) => noteImageResponse(params.slug),
      HEAD: async ({ params }) => noteImageResponse(params.slug, true),
    },
  },
});
