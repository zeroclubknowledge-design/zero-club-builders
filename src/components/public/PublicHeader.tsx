import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const productLinks = [
  { label: "Feed", slug: "feed" },
  { label: "Bootcamps", slug: "bootcamps" },
  { label: "Clubs", slug: "clubs" },
  { label: "Opportunities", slug: "opportunities" },
] as const;

export function PublicHeader({ section }: { section?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[#171717]/[0.08] bg-[#f7f6f3]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 md:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Zero Club home">
              <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
              <span className="hidden font-display text-[18px] font-semibold tracking-tight text-[#171717] sm:block">
                Zero <span className="text-[#cc208f]">Club</span>
              </span>
            </Link>
            {section && (
              <>
                <span className="h-5 w-px bg-[#171717]/10" />
                <span className="truncate text-[12px] font-semibold text-[#5f5a5d]">{section}</span>
              </>
            )}
          </div>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Public navigation">
            <Link to="/docs" search={{ page: undefined }} className="rounded-md px-3 py-2 text-[12px] font-semibold text-[#555155] hover:bg-black/[0.04]">Docs</Link>
            {productLinks.map((item) => (
              <Link key={item.slug} to="/explore/$slug" params={{ slug: item.slug }} className="rounded-md px-3 py-2 text-[12px] font-semibold text-[#555155] hover:bg-black/[0.04]">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/signin" search={{ ref: undefined, club: undefined }} className="hidden px-3 py-2 text-[12px] font-semibold text-[#555155] sm:block">Sign in</Link>
            <Link to="/signup" search={{ ref: undefined, club: undefined }} className="grid h-9 place-items-center rounded-md bg-[#171717] px-4 text-[11.5px] font-semibold text-white">Join</Link>
            <button type="button" onClick={() => setOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-md text-[#171717] lg:hidden" aria-label={open ? "Close menu" : "Open menu"}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-[#f7f6f3] px-5 py-8 lg:hidden">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8a8388]">Explore Zero Club</p>
          <div className="mt-4 divide-y divide-[#171717]/10 border-y border-[#171717]/10">
            <Link to="/docs" search={{ page: undefined }} onClick={() => setOpen(false)} className="block py-4 font-display text-[26px] font-medium tracking-tight">Docs</Link>
            {productLinks.map((item) => (
              <Link key={item.slug} to="/explore/$slug" params={{ slug: item.slug }} onClick={() => setOpen(false)} className="block py-4 font-display text-[26px] font-medium tracking-tight">
                {item.label}
              </Link>
            ))}
            {["metrics", "zero-ai", "wallet", "store"].map((slug) => (
              <Link key={slug} to="/explore/$slug" params={{ slug }} onClick={() => setOpen(false)} className="block py-4 font-display text-[26px] font-medium tracking-tight capitalize">
                {slug === "zero-ai" ? "Zero AI" : slug}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
