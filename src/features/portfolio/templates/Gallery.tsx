/**
 * Gallery — for artists, photographers and illustrators. A dark poster hero,
 * a loud HELLO, then the work as a masonry wall of images.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "@/components/icons/glyphs";
import { describeItem, itemImages } from "../parse";
import { SECTION_LABELS } from "../types";
import { AboutBlock, ContactButtons, SectionBody, type Skin } from "./blocks";
import {
  Avatar,
  FitText,
  ContactLink,
  Footer,
  RailArrows,
  ShippedWork,
  TemplateStyles,
  WorkLinks,
  fitSize,
  portfolioView,
  themeVars,
  useTemplateFont,
  type TemplateProps,
} from "./kit";

const skin: Skin = {
  card: "rounded-2xl border border-black/[0.07] bg-white",
  muted: "text-black/65",
  faint: "text-black/45",
  chip: "bg-black/[0.05] text-black/80",
  line: "border-black/[0.08]",
  tile: "bg-black/[0.05] text-black/70",
};

const DOTS = [
  { l: "6%", t: "7%", s: 10 },
  { l: "90%", t: "9%", s: 14 },
  { l: "12%", t: "72%", s: 8 },
  { l: "82%", t: "66%", s: 10 },
  { l: "94%", t: "44%", s: 6 },
  { l: "4%", t: "48%", s: 6 },
];

export function GalleryTemplate({ data, preview, onOpenItem }: TemplateProps) {
  useTemplateFont("Syne:wght@500;600;700;800");
  const v = portfolioView(data, { light: true });
  const display = { fontFamily: "'Syne', Montserrat, sans-serif" };
  const rest = v.sections.filter((s) => s.key !== "work" && s.key !== "about");
  const withImages = v.projects.filter((p) => itemImages(p).length > 0);
  const textOnly = v.projects.filter((p) => itemImages(p).length === 0);

  return (
    <div
      className="@container min-h-full overflow-x-clip bg-[#f7f6f3] text-[#121212] antialiased"
      style={themeVars(v.accent, false)}
    >
      <TemplateStyles />
      {/* Poster hero */}
      <header className="relative isolate overflow-hidden bg-[#0d0f1a] text-white">
        {DOTS.map((d, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: d.l,
              top: d.t,
              width: d.s,
              height: d.s,
              background: i % 2 ? v.accent : "#ffd23f",
            }}
          />
        ))}
        <div className="mx-auto flex max-w-[1100px] flex-col items-center px-5 pb-0 pt-12 text-center @3xl:pt-16">
          <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-white/55">
            @{v.profile.username}
          </p>
          <div className="@container w-full">
            <FitText
              as="h1"
              className="pf-rise mt-4 font-extrabold leading-[0.95] tracking-[-0.03em]"
              style={{ ...display, fontSize: fitSize(`I Am ${v.firstName}.`, 104, 0.88) }}
            >
              I Am {v.firstName}
              <span className="text-[var(--pf-accent)]">.</span>
            </FitText>
          </div>
          {v.role && (
            <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.35em] text-white/70">
              {v.role}
            </p>
          )}
          <div className="relative mt-8 h-[260px] w-[260px] @3xl:h-[340px] @3xl:w-[340px]">
            <div className="absolute inset-0 translate-x-[14%] rounded-full bg-[var(--pf-accent)]" />
            <Avatar
              v={v}
              className="absolute inset-[8%] h-[84%] w-[84%] border-4 border-[#0d0f1a] text-7xl"
            />
          </div>
        </div>
        <svg
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          className="-mb-px block h-12 w-full @3xl:h-20"
          aria-hidden
        >
          <path d="M0 10 L100 0 L100 10 Z" fill="#f7f6f3" />
        </svg>
      </header>

      <div className="mx-auto max-w-[1100px] px-5 @3xl:px-10">
        {/* HELLO */}
        <section
          id="pf-about"
          className="grid gap-8 py-14 @3xl:grid-cols-[1fr_1.3fr] @3xl:items-center"
        >
          <div className="@container min-w-0">
            <FitText
              as="h2"
              className="font-extrabold leading-none tracking-[-0.05em]"
              style={{ ...display, fontSize: fitSize("HELLO", 180, 1.12) }}
            >
              HELL<span className="text-[var(--pf-accent)]">O</span>
            </FitText>
          </div>
          <div>
            {v.headline && (
              <p className="text-[20px] font-semibold leading-snug tracking-tight" style={display}>
                {v.headline}
              </p>
            )}
            {v.on("about") && <AboutBlock v={v} skin={skin} className="mt-4" />}
            <div className="mt-6">
              <ContactButtons v={v} dark={false} />
            </div>
          </div>
        </section>

        {/* The wall */}
        {v.on("work") && (
          <section id="pf-work" className="py-10">
            <div className="flex items-end justify-between">
              <h2
                className="text-[40px] font-extrabold tracking-[-0.04em] @3xl:text-[56px]"
                style={display}
              >
                Portfolio<span className="text-[var(--pf-accent)]">.</span>
              </h2>
              <RailArrows railId="pf-work-rail" dark={false} />
            </div>
            {withImages.length > 0 && (
              <div id="pf-work-rail" className="pf-rail mt-8">
                {withImages.map((item) => {
                  const { title } = describeItem(item);
                  const img = itemImages(item)[0];
                  return (
                    <Link
                      key={item.id}
                      to="/app/post/$id"
                      params={{ id: item.post.id }}
                      onClick={() => {
                        if (!preview) onOpenItem?.(item);
                      }}
                      className="group relative mb-3 block break-inside-avoid overflow-hidden rounded-2xl @3xl:mb-4"
                    >
                      <img
                        src={img}
                        alt={title}
                        loading="lazy"
                        className="w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-white">
                        <p className="line-clamp-2 text-[14px] font-semibold leading-snug">
                          {title}
                        </p>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-black">
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            {textOnly.length > 0 && (
              <div className="pf-rail mt-4">
                {textOnly.map((item) => {
                  const { title, summary } = describeItem(item);
                  return (
                    <article key={item.id} className={`p-5 ${skin.card}`}>
                      <h3
                        className="break-words [overflow-wrap:anywhere] text-[18px] font-bold tracking-tight"
                        style={display}
                      >
                        {title}
                      </h3>
                      {summary && (
                        <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-black/60">
                          {summary}
                        </p>
                      )}
                      <WorkLinks
                        item={item}
                        preview={preview}
                        onOpen={onOpenItem}
                        className="mt-3"
                      />
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <ShippedWork v={v} dark={false} titleStyle={display} />

        {rest.map((s) => (
          <section key={s.key} id={`pf-${s.key}`} className="py-12">
            {s.key === "contact" ? (
              <div className="rounded-[32px] bg-[#0d0f1a] p-8 text-center text-white @3xl:p-14">
                <p
                  className="text-[40px] font-extrabold leading-none tracking-[-0.04em] @3xl:text-[64px]"
                  style={display}
                >
                  Say hello<span className="text-[var(--pf-accent)]">.</span>
                </p>
                <div className="mt-7 flex justify-center">
                  <ContactButtons v={v} dark size="lg" />
                </div>
                <div className="mt-6 flex justify-center [--foreground:#fafafa] [--muted-foreground:rgb(255_255_255/0.6)] [--border:rgb(255_255_255/0.15)]">
                  <SectionBody k="contact" v={v} skin={{ ...skin, muted: "text-white/70" }} />
                </div>
              </div>
            ) : (
              <>
                <h2
                  className="text-[32px] font-extrabold tracking-[-0.04em] @3xl:text-[40px]"
                  style={display}
                >
                  {SECTION_LABELS[s.key]}
                  <span className="text-[var(--pf-accent)]">.</span>
                </h2>
                <div className="mt-6">
                  <SectionBody k={s.key} v={v} skin={skin} preview={preview} onOpen={onOpenItem} />
                </div>
              </>
            )}
          </section>
        ))}
        <Footer dark={false} branding={v.showBranding} />
        <div className="h-10" />
      </div>
    </div>
  );
}
