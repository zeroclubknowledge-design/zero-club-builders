/**
 * Bright — light, warm and friendly. A circular portrait on a bold accent
 * shape, skills as chips and numbered project cards. A good first portfolio.
 */
import { ArrowRight, ArrowUpRight, MapPin } from "@/components/icons/glyphs";
import { SocialLinksRow } from "@/features/profile/ProfileCredentials";
import { describePost, postImages } from "../parse";
import { SECTION_LABELS } from "../types";
import { ContactButtons, SectionBody, WorkMeta, type Skin } from "./blocks";
import {
  Avatar,
  Footer,
  TemplateStyles,
  WorkLinks,
  portfolioView,
  themeVars,
  useTemplateFont,
  type TemplateProps,
} from "./kit";

const skin: Skin = {
  card: "rounded-2xl border border-black/[0.07] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_10px_24px_-14px_rgb(0_0_0/0.18)]",
  muted: "text-black/65",
  faint: "text-black/45",
  chip: "bg-black/[0.05] text-black/80",
  line: "border-black/[0.08]",
  tile: "bg-[var(--pf-accent)]/12 text-[var(--pf-accent)]",
};

export function BrightTemplate({ data, preview, onOpenItem }: TemplateProps) {
  useTemplateFont("Sora:wght@400;500;600;700;800");
  const v = portfolioView(data, { light: true });
  const display = { fontFamily: "'Sora', Montserrat, sans-serif" };
  const rest = v.sections.filter((s) => !["work", "skills"].includes(s.key));
  const firstStat = v.numbers[0];

  return (
    <div
      className="@container min-h-full overflow-x-clip bg-[#faf9f6] text-[#111] antialiased selection:bg-[var(--pf-accent)] selection:text-[color:var(--pf-ink)]"
      style={themeVars(v.accent, false)}
    >
      <TemplateStyles />
      <div className="mx-auto max-w-[1120px] px-5 @3xl:px-10">
        <nav className="flex items-center justify-between py-5">
          <span
            className="grid h-10 w-10 place-items-center rounded-full bg-[#111] text-[15px] font-bold text-white"
            style={display}
          >
            {v.firstName.charAt(0).toUpperCase()}
          </span>
          {v.email && (
            <a
              href={`mailto:${v.email}`}
              className="inline-flex h-10 items-center rounded-full bg-[#111] px-5 text-[13px] font-semibold text-white"
            >
              Let's talk
            </a>
          )}
        </nav>

        {/* Hero */}
        <header className="grid items-center gap-10 pb-12 pt-4 @3xl:grid-cols-2 @3xl:pt-10">
          <div className="pf-rise order-2 @3xl:order-1">
            <h1
              className="text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] @3xl:text-[64px]"
              style={display}
            >
              My name
              <br />
              is{" "}
              <span className="relative inline-block font-extrabold">
                {v.firstName}
                <span className="absolute -bottom-1 left-0 h-[0.18em] w-full rounded-full bg-[var(--pf-accent)]/80" />
              </span>
            </h1>
            {v.headline && (
              <p className="mt-5 max-w-[460px] text-[16px] leading-relaxed text-black/60">
                {v.headline}
              </p>
            )}
            {v.profile.location && (
              <p className="mt-3 inline-flex items-center gap-1 text-[13px] text-black/50">
                <MapPin className="h-3.5 w-3.5" /> {v.profile.location}
              </p>
            )}
            <div className="mt-6">
              <ContactButtons v={v} dark={false} />
            </div>
            {v.on("skills") && (
              <div className="mt-7 flex max-w-[460px] flex-wrap gap-2">
                {v.skills.slice(0, 8).map((s, i) => (
                  <span
                    key={s}
                    className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${i % 2 === 0 ? "bg-[var(--pf-accent)] text-[color:var(--pf-ink)]" : "bg-[#111] text-white"}`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="relative order-1 mx-auto aspect-square w-full max-w-[420px] @3xl:order-2">
            <div className="absolute inset-[6%] rounded-full bg-black/[0.04]" />
            <div className="absolute -right-[6%] -top-[4%] h-[70%] w-[70%] rotate-[18deg] rounded-[28%] bg-[var(--pf-accent)]" />
            <Avatar
              v={v}
              className="absolute inset-[10%] h-[80%] w-[80%] border-[6px] border-[#faf9f6] text-7xl"
            />
            {firstStat && (
              <div className="absolute bottom-[8%] left-0 rounded-2xl bg-[#111] px-4 py-3 text-white shadow-xl">
                <p className="text-[26px] font-bold leading-none" style={display}>
                  {firstStat.value.toLocaleString()}
                  {firstStat.value >= 10 ? "+" : ""}
                </p>
                <p className="mt-1 text-[11.5px] text-white/65">{firstStat.label}</p>
              </div>
            )}
          </div>
        </header>

        {/* Latest projects */}
        {v.on("work") && (
          <section id="pf-work" className="py-12">
            <div className="flex items-end justify-between gap-4">
              <h2
                className="text-[30px] font-bold tracking-[-0.03em] @3xl:text-[38px]"
                style={display}
              >
                Latest projects
              </h2>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#111] text-white">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-8 grid gap-6 @xl:grid-cols-2 @4xl:grid-cols-3">
              {v.projects.map((item, i) => {
                const { title, summary } = describePost(item.post);
                const img = postImages(item.post)[0];
                return (
                  <article key={item.id} className="group">
                    <div className="relative">
                      {img ? (
                        <img
                          src={img}
                          alt={title}
                          loading="lazy"
                          className="aspect-[4/3] w-full rounded-2xl object-cover transition duration-500 group-hover:-translate-y-1"
                        />
                      ) : (
                        <div
                          className="grid aspect-[4/3] w-full place-items-center rounded-2xl bg-[var(--pf-accent)]/15 px-6 text-center text-[20px] font-bold tracking-tight"
                          style={display}
                        >
                          {title}
                        </div>
                      )}
                      <span
                        className="absolute -bottom-3 right-4 grid h-12 w-12 place-items-center rounded-xl bg-[#111] text-[16px] font-bold text-white"
                        style={display}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[18px] font-semibold tracking-tight" style={display}>
                      {title}
                    </h3>
                    <p className="mt-0.5 text-[12.5px] text-black/45">
                      <WorkMeta item={item} />
                    </p>
                    {summary && (
                      <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-black/60">
                        {summary}
                      </p>
                    )}
                    <WorkLinks item={item} preview={preview} onOpen={onOpenItem} className="mt-3" />
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {rest.map((s) => (
          <section key={s.key} id={`pf-${s.key}`} className="py-12">
            {s.key === "contact" ? (
              <div className="relative overflow-hidden rounded-[32px] bg-[var(--pf-accent)] p-8 text-[color:var(--pf-ink)] @3xl:p-12">
                <p
                  className="max-w-[560px] text-[34px] font-bold leading-[1.05] tracking-[-0.03em] @3xl:text-[48px]"
                  style={display}
                >
                  Got a project? Let's make it happen.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {v.email && (
                    <a
                      href={`mailto:${v.email}`}
                      className="inline-flex h-12 items-center gap-2 rounded-full bg-[#111] px-6 text-[15px] font-semibold text-white"
                    >
                      {v.email} <ArrowUpRight className="h-4 w-4" />
                    </a>
                  )}
                  {v.website && (
                    <a
                      href={v.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center gap-1.5 rounded-full border border-current/30 px-5 text-[14px] font-semibold"
                    >
                      {v.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}{" "}
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <div className="mt-5 [--foreground:currentColor] [--muted-foreground:currentColor]">
                  <SocialLinksRow links={v.profile.social_links} />
                </div>
              </div>
            ) : (
              <>
                <h2
                  className="text-[28px] font-bold tracking-[-0.03em] @3xl:text-[34px]"
                  style={display}
                >
                  {SECTION_LABELS[s.key]}
                </h2>
                <div className="mt-6">
                  <SectionBody k={s.key} v={v} skin={skin} preview={preview} onOpen={onOpenItem} />
                </div>
              </>
            )}
          </section>
        ))}
        <Footer dark={false} />
        <div className="h-10" />
      </div>
    </div>
  );
}
