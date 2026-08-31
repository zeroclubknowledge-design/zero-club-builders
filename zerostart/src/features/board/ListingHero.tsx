import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CATEGORIES } from "@/types";

/**
 * List your product without leaving the page you landed on.
 *
 * The old flow put three navigations between arriving and starting: Build,
 * then List an MVP, then the form. Most people who might have listed something
 * never saw the form. This is the first field of that form, hoisted to where
 * attention already is — it does not create anything, it carries what you typed
 * into the real form so nothing has to be retyped.
 */
export function ListingHero() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");

  const go = () => {
    if (!session) { navigate({ to: "/signin" }); return; }
    navigate({
      to: "/build/new",
      search: { url: url.trim() || undefined, category: category || undefined },
    });
  };

  return (
    <div className="mt-7">
      <h1 className="max-w-[16ch] text-[30px] font-bold leading-[1.08] text-ink sm:text-[42px]">
        Test what's being built
      </h1>
      <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-ink-muted sm:text-[15px]">
        Real products from real builders. Complete the tasks, leave honest feedback, and earn
        ZP the moment the builder approves your work.
      </p>

      <div className="zs-card mt-6 max-w-[560px] p-2.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          placeholder="Your product URL"
          className="h-12 w-full rounded-xl bg-transparent px-3.5 text-[14px] text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`h-12 w-full rounded-xl bg-bg px-3.5 text-[14px] outline-none sm:flex-1 ${
              category ? "text-ink" : "text-ink-faint"
            }`}
          >
            <option value="">Choose a category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={go}
            className="zs-glow h-12 w-full shrink-0 rounded-xl bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 sm:w-auto sm:px-7"
          >
            <span className="inline-flex items-center gap-1.5">
              List it <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>

      <p className="mt-2.5 text-[12px] text-ink-faint">
        Websites, Zerohub products and app store links all work. Listings go live immediately.
      </p>
    </div>
  );
}
