import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, FileText, Mail, ShieldCheck } from "@/components/icons/glyphs";
import { PublicHeader } from "@/components/public/PublicHeader";
import { ZeroMark } from "@/components/ZeroLoader";
import { CONTACT_EMAIL, LEGAL_EFFECTIVE, LEGAL_UPDATED, type LegalBlock, type LegalDoc } from "./content";

const PINK = "#cc208f";

/** The shared layout for Zero Club's legal documents. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const [active, setActive] = useState(doc.sections[0]?.id);
  const [tocOpen, setTocOpen] = useState(false);
  const other = doc.slug === "terms"
    ? { to: "/privacy" as const, title: "Privacy Policy", body: "How we collect, use and protect your information." }
    : { to: "/terms" as const, title: "Terms of Service", body: "The rules for using Zero Club, for members and for us." };

  useEffect(() => {
    const els = doc.sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [doc]);

  const jump = (id: string) => {
    setTocOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#f7f6f3] text-[#171717] dark:bg-[#0f0d12] dark:text-white">
      <PublicHeader />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_100%_0%,rgba(204,32,143,0.12),transparent_60%)] dark:bg-[radial-gradient(70%_80%_at_100%_0%,rgba(204,32,143,0.22),transparent_60%)]" />
        <ZeroMark size={320} className="pointer-events-none absolute -right-20 -top-16 rotate-12 text-[#cc208f] opacity-[0.06] dark:opacity-[0.1]" />
        <div className="relative mx-auto max-w-[1120px] px-5 pb-12 pt-28 md:px-8 md:pb-16 md:pt-36">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: PINK, background: "rgba(204,32,143,0.08)", boxShadow: "inset 0 0 0 1px rgba(204,32,143,0.22)" }}>
            {doc.slug === "terms" ? <FileText className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {doc.eyebrow}
          </span>
          <h1 className="mt-5 font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] md:text-[60px]">{doc.title}</h1>
          <p className="mt-5 max-w-[680px] text-[16px] leading-relaxed text-[#55505a] dark:text-white/65 md:text-[17px]">{doc.summary}</p>
          <p className="mt-5 text-[13px] text-[#77707a] dark:text-white/45">
            Last updated {LEGAL_UPDATED} · Effective {LEGAL_EFFECTIVE}
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {doc.highlights.map((h) => (
              <div key={h.title} className="rounded-2xl border border-black/[0.07] bg-white/80 p-5 backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.03]">
                <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: PINK }}>
                  <ZeroMark size={16} />
                </span>
                <p className="mt-4 text-[15px] font-semibold leading-snug">{h.title}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5f5a63] dark:text-white/55">{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-12 md:px-8 lg:grid-cols-[260px_1fr] lg:gap-16 lg:py-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <button
            onClick={() => setTocOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[14px] font-semibold dark:border-white/[0.1] dark:bg-white/[0.03] lg:hidden"
          >
            On this page
            <ChevronDown className={`h-4 w-4 transition ${tocOpen ? "rotate-180" : ""}`} />
          </button>
          <nav className={`${tocOpen ? "mt-2 block" : "hidden"} rounded-xl border border-black/[0.08] bg-white p-2 dark:border-white/[0.1] dark:bg-white/[0.03] lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0 dark:lg:bg-transparent`}>
            <p className="mb-3 hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-[#77707a] dark:text-white/40 lg:block">On this page</p>
            <ol className="space-y-0.5">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => jump(s.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-[13.5px] leading-snug transition lg:border-l-2 lg:rounded-none lg:py-1.5 ${
                      active === s.id
                        ? "font-semibold text-[#171717] dark:text-white lg:border-[#cc208f]"
                        : "text-[#6a646d] hover:text-[#171717] dark:text-white/50 dark:hover:text-white lg:border-transparent"
                    }`}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <main className="min-w-0 max-w-[720px]">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 border-b border-black/[0.06] py-8 first:pt-0 last:border-0 dark:border-white/[0.07]">
              <h2 className="font-display text-[22px] font-semibold tracking-[-0.015em] md:text-[24px]">{s.title}</h2>
              <div className="mt-4 space-y-4">
                {s.blocks.map((b, i) => <Block key={i} block={b} />)}
              </div>
            </section>
          ))}

          {/* Contact + the other document */}
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <a href={`mailto:${CONTACT_EMAIL}`} className="group rounded-2xl bg-[#16111a] p-6 text-white transition hover:-translate-y-0.5">
              <Mail className="h-5 w-5" style={{ color: "#f28fd0" }} />
              <p className="mt-4 text-[16px] font-semibold">Questions? Talk to us</p>
              <p className="mt-1 text-[13.5px] text-white/60">{CONTACT_EMAIL}</p>
            </a>
            <Link to={other.to} className="group rounded-2xl border border-black/[0.08] bg-white p-6 transition hover:-translate-y-0.5 dark:border-white/[0.1] dark:bg-white/[0.03]">
              <FileText className="h-5 w-5" style={{ color: PINK }} />
              <p className="mt-4 flex items-center gap-1.5 text-[16px] font-semibold">
                {other.title} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </p>
              <p className="mt-1 text-[13.5px] text-[#6a646d] dark:text-white/55">{other.body}</p>
            </Link>
          </div>
          <p className="mt-10 text-[12.5px] text-[#77707a] dark:text-white/40">© {new Date().getFullYear()} Zero Club. All rights reserved.</p>
        </main>
      </div>
    </div>
  );
}

/** Emails in the text become links. */
function withLinks(text: string) {
  const parts = text.split(/([\w.+-]+@[\w-]+\.[\w.]+)/g);
  return parts.map((p, i) =>
    /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(p)
      ? <a key={i} href={`mailto:${p}`} className="font-medium underline decoration-[#cc208f]/40 underline-offset-2" style={{ color: PINK }}>{p}</a>
      : p,
  );
}

/** "Lead phrase. Rest of item" — the lead phrase is set in bold. */
function listItem(text: string) {
  const m = text.match(/^([^.—:]{2,48})(\.|:| —)\s+(.*)$/s);
  if (m && !/^(harass|post|impersonate|plagiarise|scam|send|share|upload|scrape|use|access|correct|delete|object|receive|complain)/i.test(m[1])) {
    return <><strong className="font-semibold text-[#171717] dark:text-white">{m[1]}{m[2].trim() === "—" ? " —" : m[2]}</strong> {withLinks(m[3])}</>;
  }
  return withLinks(text);
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return <p className="text-[15.5px] leading-[1.75] text-[#3d3940] dark:text-white/75">{withLinks(block)}</p>;
  }
  if ("note" in block) {
    return (
      <p className="rounded-xl border-l-4 px-4 py-3 text-[15px] font-medium leading-relaxed" style={{ borderColor: PINK, background: "rgba(204,32,143,0.06)" }}>
        {block.note}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {block.list.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15.5px] leading-[1.7] text-[#3d3940] dark:text-white/75">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PINK }} />
          <span>{listItem(item)}</span>
        </li>
      ))}
    </ul>
  );
}
