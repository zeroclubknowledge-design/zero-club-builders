/**
 * Spotlight — editorial and cinematic. The name runs huge across a full-bleed
 * image, then the work reads as a numbered index.
 */
import { ArrowUpRight, MapPin } from "@/components/icons/glyphs";
import { describePost, postImages } from "../parse";
import { SECTION_LABELS } from "../types";
import { AboutBlock, ContactButtons, SectionBody, WorkMeta, type Skin } from "./blocks";
import {
  Avatar,
  FitText,
  Footer,
  fitSize,
  Marquee,
  TemplateStyles,
  WorkLinks,
  portfolioView,
  themeVars,
  useTemplateFont,
  type TemplateProps,
} from "./kit";

const skin: Skin = {
  card: "rounded-2xl border border-white/[0.08] bg-[#121212]",
  muted: "text-white/70",
  faint: "text-white/45",
  chip: "border border-white/12 bg-white/[0.04] text-white/85",
  line: "border-white/[0.08]",
  tile: "bg-white/[0.06] text-white/70",
};

export function SpotlightTemplate({ data, preview, onOpenItem }: TemplateProps) {
  useTemplateFont("Instrument+Serif:ital@0;1");
  const v = portfolioView(data);
  const serif = { fontFamily: "'Instrument Serif', Georgia, serif" };
  const rest = v.sections.filter((s) => s.key !== "work" && s.key !== "about");
  const ticker = [
    ...v.numbers.map((n) => `${n.value.toLocaleString()} ${n.label.toLowerCase()}`),
    ...v.skills.slice(0, 6),
  ];

  return (
    <div
      className="dark @container min-h-full overflow-x-clip bg-black text-white antialiased selection:bg-[var(--pf-accent)] selection:text-[color:var(--pf-ink)]"
      style={themeVars(v.accent, true)}
    >
      <TemplateStyles />
      {/* Hero */}
      <header className="relative isolate overflow-hidden">
        {v.heroImage ? (
          <img
            src={v.heroImage}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-70"
          />
        ) : (
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: `radial-gradient(80% 70% at 70% 30%, ${v.accent}55, transparent 70%)`,
            }}
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/30 to-black" />
        <div className="mx-auto flex min-h-[560px] max-w-[1180px] flex-col px-5 pb-10 pt-8 @3xl:min-h-[680px] @3xl:px-10">
          <div className="flex items-center justify-between text-[13px] text-white/75">
            <span className="font-semibold tracking-wide">@{v.profile.username}</span>
            {v.profile.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {v.profile.location}
              </span>
            )}
          </div>
          <p className="mt-auto text-[18px] italic text-white/80" style={serif}>
            Hi there!
          </p>
          <div className="@container">
            <FitText
              as="h1"
              className="pf-rise -ml-[0.04em] font-normal leading-[0.86] tracking-[-0.03em]"
              style={{ ...serif, fontSize: fitSize(v.name, 200, 0.44) }}
            >
              {v.name}
            </FitText>
          </div>
          <div className="mt-6 grid gap-5 @3xl:grid-cols-[1fr_380px] @3xl:items-end">
            <div>
              {v.role && <p className="text-[19px] font-semibold">{v.role}</p>}
              <div className="mt-4">
                <ContactButtons v={v} dark />
              </div>
            </div>
            {v.headline && (
              <p className="text-[14.5px] leading-relaxed text-white/75">{v.headline}</p>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 @3xl:px-10">
        {/* About as a statement */}
        {v.on("about") && (
          <section id="pf-about" className="grid gap-8 py-16 @3xl:grid-cols-[1fr_300px] @3xl:py-24">
            <div>
              <Label>{SECTION_LABELS.about}</Label>
              {firstSentence(v.about).length <= 220 ? (
                <>
                  <p
                    className="mt-5 text-[30px] leading-[1.15] tracking-[-0.01em] @3xl:text-[44px]"
                    style={serif}
                  >
                    {firstSentence(v.about)}
                  </p>
                  {rest_of(v.about) && (
                    <AboutBlock
                      v={{ ...v, about: rest_of(v.about) }}
                      skin={skin}
                      className="mt-5 max-w-[640px]"
                    />
                  )}
                </>
              ) : (
                <AboutBlock v={v} skin={skin} className="mt-5 max-w-[680px]" />
              )}
            </div>
            {v.numbers[0] && (
              <div className="self-start rounded-3xl border border-white/10 bg-[#111] p-5 text-center">
                <p className="text-[56px] leading-none" style={serif}>
                  {v.numbers[0].value.toLocaleString()}
                </p>
                <p className="mt-2 text-[13px] text-white/55">{v.numbers[0].label}</p>
                <Avatar
                  v={v}
                  rounded="rounded-2xl"
                  className="mt-5 aspect-square w-full text-5xl"
                />
              </div>
            )}
          </section>
        )}
      </div>

      {ticker.length > 2 && (
        <Marquee
          items={ticker}
          className="-rotate-1 bg-[var(--pf-accent)] py-3 text-[22px] font-semibold text-[color:var(--pf-ink)] @3xl:text-[28px]"
        />
      )}

      <div className="mx-auto max-w-[1180px] px-5 @3xl:px-10">
        {/* Work index */}
        {v.on("work") && (
          <section id="pf-work" className="py-16 @3xl:py-24">
            <Label>{SECTION_LABELS.work}</Label>
            <p
              className="mt-4 max-w-[640px] text-[32px] leading-tight @3xl:text-[46px]"
              style={serif}
            >
              A showcase of <em className="text-[var(--pf-accent)]">recent work</em>.
            </p>
            <ol className="mt-10 border-t border-white/10">
              {v.projects.map((item, i) => {
                const { title, summary } = describePost(item.post);
                const img = postImages(item.post)[0];
                return (
                  <li
                    key={item.id}
                    className="group grid gap-4 border-b border-white/10 py-6 @3xl:grid-cols-[64px_1fr_280px] @3xl:items-center @3xl:gap-8"
                  >
                    <span className="text-[14px] tabular-nums text-white/40">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h3
                        className="text-[30px] leading-tight transition group-hover:text-[var(--pf-accent)] @3xl:text-[38px]"
                        style={serif}
                      >
                        {title}
                      </h3>
                      <p className="mt-1 text-[12.5px] uppercase tracking-[0.12em] text-white/45">
                        <WorkMeta item={item} />
                      </p>
                      {summary && (
                        <p className="mt-3 line-clamp-2 max-w-[560px] text-[14px] leading-relaxed text-white/60">
                          {summary}
                        </p>
                      )}
                      <WorkLinks
                        item={item}
                        preview={preview}
                        onOpen={onOpenItem}
                        className="mt-3"
                      />
                    </div>
                    {img && (
                      <div className="overflow-hidden rounded-2xl">
                        <img
                          src={img}
                          alt=""
                          loading="lazy"
                          className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-105"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {rest.map((s) => (
          <section
            key={s.key}
            id={`pf-${s.key}`}
            className="border-t border-white/10 py-14 @3xl:py-20"
          >
            {s.key === "contact" ? (
              <div className="text-center">
                <Label center>{SECTION_LABELS.contact}</Label>
                <p
                  className="mx-auto mt-5 max-w-[760px] text-[44px] leading-[1.02] @3xl:text-[76px]"
                  style={serif}
                >
                  Let's work <em className="text-[var(--pf-accent)]">together</em>.
                </p>
                <div className="mt-8 flex justify-center">
                  <ContactButtons v={v} dark size="lg" />
                </div>
                <div className="mt-6 flex justify-center">
                  <SectionBody k="contact" v={v} skin={skin} />
                </div>
              </div>
            ) : (
              <>
                <Label>{SECTION_LABELS[s.key]}</Label>
                <div className="mt-6">
                  <SectionBody k={s.key} v={v} skin={skin} preview={preview} onOpen={onOpenItem} />
                </div>
              </>
            )}
          </section>
        ))}
        <Footer dark />
        <div className="h-10" />
      </div>
    </div>
  );
}

function Label({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11.5px] font-semibold text-black ${center ? "mx-auto" : ""}`}
    >
      <ArrowUpRight className="h-3 w-3" /> {children}
    </span>
  );
}

function firstSentence(text: string) {
  const m = text.match(/^[\s\S]*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
function rest_of(text: string) {
  return text.slice(firstSentence(text).length).trim();
}
