import { useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "@/components/icons/glyphs";
import { PortfolioRenderer } from "@/features/portfolio/PortfolioRenderer";
import { fetchPublicPortfolio, recordPortfolioView } from "@/features/portfolio/api";
import { clip, postImages } from "@/features/portfolio/parse";
import { portfolioUrl, type PortfolioLookup } from "@/features/portfolio/types";

/**
 * The public portfolio: zeroclubs.xyz/@username.
 *
 * Rendered on the server so link previews and search engines see the real
 * name, headline and work. The server is always signed out, so a draft
 * reaches only its owner, through the client-side refetch below.
 */
export const Route = createFileRoute("/@{$username}")({
  loader: async ({ params }): Promise<PortfolioLookup> => {
    try {
      return await fetchPublicPortfolio(params.username);
    } catch {
      return { found: false };
    }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData || !loaderData.found) {
      return {
        meta: [
          { title: "Portfolio not found — Zero Club" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { profile, portfolio, items } = loaderData;
    const name = profile.full_name || profile.username;
    const title = `${name} — Portfolio`;
    const description =
      clip(portfolio.headline || portfolio.about || profile.bio || "", 200) ||
      `${name}'s projects and proof of work on Zero Club.`;
    const cover = items.map((item) => postImages(item.post)[0]).find(Boolean);
    const image = cover || profile.avatar_url || "https://www.zeroclubs.xyz/api/og-default";
    const url = portfolioUrl(params.username);
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "profile" },
      { property: "og:url", content: url },
      { property: "og:site_name", content: "Zero Club" },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: title },
      { name: "twitter:card", content: cover ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      { name: "theme-color", content: "#0a0a0b" },
    ];
    if (!portfolio.indexable || portfolio.status !== "published") {
      meta.push({ name: "robots", content: "noindex, nofollow" });
    }
    return { meta, links: [{ rel: "canonical", href: url }] };
  },
  component: PublicPortfolioPage,
});

function PublicPortfolioPage() {
  const { username } = Route.useParams();
  const initial = Route.useLoaderData();
  const { data } = useQuery({
    queryKey: ["public_portfolio", username.toLowerCase()],
    queryFn: () => fetchPublicPortfolio(username),
    initialData: initial,
    // Refetch once in the browser: that request carries the visitor's session,
    // which is how an owner sees their own draft.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const counted = useRef(false);
  useEffect(() => {
    if (!data?.found || data.is_owner || counted.current) return;
    counted.current = true;
    void recordPortfolioView(data.portfolio.id).catch(() => undefined);
  }, [data]);

  if (!data?.found) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0a0a0b] px-6 text-center text-white">
        <div>
          <p className="text-[13px] uppercase tracking-[0.18em] text-white/40">Zero Club</p>
          <h1 className="mt-3 text-[28px] font-semibold tracking-tight">No portfolio here yet</h1>
          <p className="mt-2 text-[15px] text-white/60">
            @{username} hasn't published a portfolio, or the link is mistyped.
          </p>
          <a
            href="https://www.zeroclubs.xyz"
            className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-black"
          >
            Go to Zero Club
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0b]">
      {data.is_owner && (
        <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0b]/90 backdrop-blur-xl">
          <div className="mx-auto flex h-12 max-w-[1040px] items-center justify-between gap-3 px-5 text-[13px] text-white/70">
            <span className="truncate">
              {data.portfolio.status === "published"
                ? "This is your live portfolio."
                : "Draft — only you can see this."}
            </span>
            <Link
              to="/app/portfolio"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 font-semibold text-black"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          </div>
        </div>
      )}
      <PortfolioRenderer
        data={data}
        onOpenItem={(item) =>
          void recordPortfolioView(data.portfolio.id, item.post.id).catch(() => undefined)
        }
      />
    </main>
  );
}
