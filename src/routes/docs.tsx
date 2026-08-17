import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  Menu,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { docPages, getDocPage } from "@/features/docs/content";
import { usePublicTheme } from "@/hooks/usePublicTheme";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  validateSearch: (search: Record<string, unknown>): { page?: string } => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Zero Club Docs - Learn, build, show proof, and earn" },
      { name: "description", content: "The complete guide to Zero Club profiles, Feed, Clubs, Bootcamps, Wallet, ZeroHub, Zero Games, Zero AI, and educator workspaces." },
    ],
  }),
});

function sectionId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function DocsPage() {
  // Adopts the theme chosen on the landing page.
  usePublicTheme();
  const { page: pageSlug } = Route.useSearch();
  const page = getDocPage(pageSlug);
  const [query, setQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setMobileNavOpen(false);
  }, [page.slug]);

  const filteredPages = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return docPages;
    return docPages.filter((item) =>
      [item.title, item.summary, item.group, ...item.sections.map((section) => section.title)].join(" ").toLowerCase().includes(term),
    );
  }, [query]);

  const groups = useMemo(() => {
    return filteredPages.reduce<Record<string, typeof docPages>>((result, item) => {
      (result[item.group] ||= []).push(item);
      return result;
    }, {});
  }, [filteredPages]);

  const currentIndex = docPages.findIndex((item) => item.slug === page.slug);
  const previousPage = currentIndex > 0 ? docPages[currentIndex - 1] : null;
  const nextPage = currentIndex < docPages.length - 1 ? docPages[currentIndex + 1] : null;

  const navigation = (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#171717]/[0.08] dark:border-white/10 p-4">
        <label className="flex h-10 items-center gap-2 rounded-md border border-[#171717]/10 dark:border-white/10 bg-white dark:bg-[#141118] px-3 focus-within:border-[#cc208f]/40 focus-within:ring-2 focus-within:ring-[#cc208f]/10">
          <Search className="h-4 w-4 shrink-0 text-[#827b80] dark:text-white/55" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation" className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none placeholder:text-[#9b9599]" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X className="h-3.5 w-3.5 text-[#827b80] dark:text-white/55" /></button>}
        </label>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Documentation pages">
        {Object.entries(groups).map(([group, pages]) => (
          <section key={group} className="mb-6">
            <p className="mb-2 px-2 text-[8.5px] font-semibold uppercase tracking-[0.15em] text-[#918a8e] dark:text-white/50">{group}</p>
            <div className="space-y-0.5">
              {pages.map((item) => {
                const active = item.slug === page.slug;
                return (
                  <Link
                    key={item.slug}
                    to="/docs"
                    search={{ page: item.slug }}
                    className={`flex min-h-9 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[11.5px] font-medium leading-4 transition-colors ${active ? "bg-[#171717] text-white" : "text-[#5f5a5d] dark:text-white/55 hover:bg-[#171717]/[0.045] hover:text-[#171717]"}`}
                  >
                    <span>{item.title}</span>
                    {active && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#f28fd0]" />}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {filteredPages.length === 0 && (
          <div className="px-2 py-8 text-center">
            <p className="text-[11px] font-semibold">No matching page</p>
            <p className="mt-1 text-[10px] leading-4 text-[#827b80] dark:text-white/55">Try a product name or action.</p>
          </div>
        )}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f6f3] dark:bg-[#100e13] font-sans text-[#171717] dark:text-white">
      <PublicHeader section="Documentation" />

      <div className="sticky top-16 z-30 flex h-12 items-center justify-between border-b border-[#171717]/[0.08] dark:border-white/10 bg-[#f7f6f3]/95 px-4 backdrop-blur-xl lg:hidden">
        <button type="button" onClick={() => setMobileNavOpen(true)} className="flex items-center gap-2 text-[11px] font-semibold">
          <Menu className="h-4 w-4" /> All docs
        </button>
        <span className="max-w-[58vw] truncate text-[10.5px] font-medium text-[#6f696d]">{page.title}</span>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[70] bg-black/25 lg:hidden" onClick={() => setMobileNavOpen(false)}>
          <aside className="h-full w-[min(88vw,340px)] border-r border-[#171717]/10 dark:border-white/10 bg-[#f7f6f3] dark:bg-[#100e13] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-[#171717]/10 dark:border-white/10 px-4">
              <span className="flex items-center gap-2 text-[12px] font-semibold"><BookOpen className="h-4 w-4 fill-current" /> Documentation</span>
              <button type="button" onClick={() => setMobileNavOpen(false)} className="grid h-8 w-8 place-items-center rounded-md" aria-label="Close documentation navigation"><X className="h-4 w-4" /></button>
            </div>
            <div className="h-[calc(100%-3.5rem)]">{navigation}</div>
          </aside>
        </div>
      )}

      <div className="mx-auto max-w-[1440px] lg:grid lg:grid-cols-[260px_minmax(0,1fr)_210px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-r border-[#171717]/[0.08] dark:border-white/10 lg:block">{navigation}</aside>

        <main className="min-w-0 bg-white dark:bg-[#141118]">
          <article className="mx-auto max-w-[760px] px-5 py-12 sm:px-8 md:py-16 lg:px-12 lg:py-20">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9d176d]">
              <span>{page.group}</span>
              <span className="text-[#b6afb3]">/</span>
              <span className="flex items-center gap-1 text-[#827b80] dark:text-white/55"><Clock3 className="h-3 w-3" /> {page.readTime}</span>
            </div>
            <h1 className="mt-5 font-display text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[48px]">{page.title}</h1>
            <p className="mt-5 max-w-[680px] text-[15px] leading-7 text-[#686266] sm:text-[16px]">{page.summary}</p>

            <div className="mt-10 h-px bg-[#171717]/10" />

            <div className="mt-10 space-y-12">
              {page.sections.map((section) => (
                <section key={section.title} id={sectionId(section.title)} className="scroll-mt-28">
                  <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em] sm:text-[27px]">{section.title}</h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-[13.5px] leading-7 text-[#565156] dark:text-white/60 sm:text-[14px]">{paragraph}</p>
                  ))}
                  {section.bullets && (
                    <ul className="mt-5 space-y-3">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-3 text-[13px] leading-6 text-[#565156] dark:text-white/60 sm:text-[13.5px]">
                          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cc208f]" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.note && (
                    <div className="mt-6 border-l-2 border-[#cc208f] bg-[#cc208f]/[0.045] px-4 py-3.5">
                      <p className="text-[12.5px] font-medium leading-6 text-[#4f484d]">{section.note}</p>
                    </div>
                  )}
                </section>
              ))}
            </div>

            <div className="mt-16 grid gap-px overflow-hidden rounded-md border border-[#171717]/10 dark:border-white/10 bg-[#171717]/10 sm:grid-cols-2">
              {previousPage ? (
                <Link to="/docs" search={{ page: previousPage.slug }} className="group bg-white dark:bg-[#141118] p-5 hover:bg-[#faf9f7]">
                  <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8388] dark:text-white/45"><ArrowLeft className="h-3 w-3" /> Previous</span>
                  <span className="mt-2 block text-[12px] font-semibold group-hover:text-[#9d176d]">{previousPage.title}</span>
                </Link>
              ) : <div className="hidden bg-white dark:bg-[#141118] sm:block" />}
              {nextPage && (
                <Link to="/docs" search={{ page: nextPage.slug }} className="group bg-white dark:bg-[#141118] p-5 text-left sm:text-right">
                  <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8a8388] dark:text-white/45 sm:justify-end">Next <ArrowRight className="h-3 w-3" /></span>
                  <span className="mt-2 block text-[12px] font-semibold group-hover:text-[#9d176d]">{nextPage.title}</span>
                </Link>
              )}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#171717]/10 dark:border-white/10 pt-6">
              <p className="text-[10px] text-[#8a8388] dark:text-white/45">Last reviewed August 2026</p>
              <Link to="/signup" search={{ ref: undefined, club: undefined }} className="inline-flex items-center gap-2 text-[10.5px] font-semibold text-[#9d176d]">Open Zero Club <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </article>
        </main>

        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] border-l border-[#171717]/[0.08] dark:border-white/10 px-6 py-10 xl:block">
          <p className="text-[8.5px] font-semibold uppercase tracking-[0.15em] text-[#918a8e] dark:text-white/50">On this page</p>
          <nav className="mt-4 space-y-3" aria-label="On this page">
            {page.sections.map((section) => (
              <a key={section.title} href={`#${sectionId(section.title)}`} className="block text-[10.5px] leading-4 text-[#777075] hover:text-[#9d176d]">{section.title}</a>
            ))}
          </nav>
          <div className="mt-8 border-t border-[#171717]/10 dark:border-white/10 pt-6">
            <p className="text-[10.5px] font-semibold">Need the product view?</p>
            <p className="mt-1.5 text-[9.5px] leading-4 text-[#827b80] dark:text-white/55">Explore how each Zero Club tool works before joining.</p>
            <Link to="/explore/$slug" params={{ slug: "feed" }} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[#9d176d]">Explore products <ArrowRight className="h-3 w-3" /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
