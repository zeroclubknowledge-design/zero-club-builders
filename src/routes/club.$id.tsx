import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Public landing page for a shared club link.
 *
 * Club invites used to point straight at /app?club=<id>. That works for people
 * who are already signed in, but a link preview is built by a crawler that is
 * signed out and does not run JavaScript — so every club link previewed as the
 * generic "Zero Club" card, with no club name and no picture.
 *
 * This page exists so the club's own name, description and banner are present
 * in the HTML the moment it is served. Anyone who actually clicks through is
 * sent straight on into the app.
 */
export const Route = createFileRoute("/club/$id")({
  component: ClubLinkPage,

  // Never allowed to throw: a failed lookup should still render a page.
  loader: async ({ params }) => {
    try {
      const { data, error } = await supabase.rpc("get_club_public", { club_id: params.id });
      if (error || !data?.found) return null;
      return data as {
        is_private: boolean;
        name: string;
        description: string | null;
        banner_url: string | null;
        member_count: number;
      };
    } catch {
      return null;
    }
  },

  head: ({ loaderData }) => {
    if (!loaderData?.name) return {};

    const title = `${loaderData.name} — a club on Zero Club`;
    const description =
      loaderData.description?.slice(0, 200).trim() ||
      `Join ${loaderData.name} on Zero Club — ${loaderData.member_count} member${
        loaderData.member_count === 1 ? "" : "s"
      }.`;

    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];

    // Only override the site-wide preview image when this club has its own.
    if (loaderData.banner_url) {
      meta.push(
        { property: "og:image", content: loaderData.banner_url },
        { name: "twitter:image", content: loaderData.banner_url },
        { name: "twitter:card", content: "summary_large_image" },
      );
    }

    return { meta };
  },
});

function ClubLinkPage() {
  const club = Route.useLoaderData();
  const { id } = Route.useParams();
  const target = `/app?club=${id}`;

  // Anyone already signed in should not have to look at this page at all.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) window.location.replace(target);
    });
    return () => { cancelled = true; };
  }, [target]);

  return (
    <div className="min-h-screen bg-[#f8f7f5] text-foreground dark:bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[720px] items-center px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="font-display text-[16px] font-semibold tracking-tight">
              Zero <span className="text-primary">Club</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[520px] px-5 py-16 text-center">
        {club?.banner_url && (
          <img
            src={club.banner_url}
            alt=""
            className="mx-auto mb-7 h-24 w-24 rounded-2xl border border-border object-cover"
          />
        )}

        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          You have been invited to a club
        </p>
        <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-tight">
          {club?.name || "This club"}
        </h1>

        {club?.description && (
          <p className="mt-3 text-[14px] leading-7 text-muted-foreground">{club.description}</p>
        )}

        {typeof club?.member_count === "number" && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {club.member_count} member{club.member_count === 1 ? "" : "s"}
          </p>
        )}

        <a
          href={target}
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-8 text-[14.5px] font-semibold text-background transition hover:opacity-90"
        >
          Open in Zero Club <ArrowRight className="h-4 w-4" />
        </a>

        {!club && (
          <p className="mt-6 text-[12.5px] text-muted-foreground">
            We could not load this club. The link may have expired.
          </p>
        )}
      </main>
    </div>
  );
}
