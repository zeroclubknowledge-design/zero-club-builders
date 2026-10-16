/**
 * Signal — a pinned profile card beside a dark bento of work.
 * For developers and builders: quiet surfaces, one neon accent.
 */
import { ArrowUpRight, MapPin } from "@/components/icons/glyphs";
import { SocialLinksRow } from "@/features/profile/ProfileCredentials";
import { describeItem, itemImages } from "../parse";
import { SECTION_LABELS } from "../types";
import { ContactButtons, SectionBody, WorkMeta, type Skin } from "./blocks";
import {
  Avatar,
  ContactLink,
  Footer,
  RailArrows,
  ShippedWork,
  RotatingBadge,
  TemplateStyles,
  WorkLinks,
  portfolioView,
  themeVars,
  useTemplateFont,
  type TemplateProps,
} from "./kit";

const skin: Skin = {
  card: "rounded-2xl border border-white/[0.07] bg-white/[0.03]",
  muted: "text-white/70",
  faint: "text-white/45",
  chip: "border border-white/10 bg-white/[0.04] text-white/85",
  line: "border-white/[0.07]",
  tile: "bg-white/[0.06] text-white/70",
};

/** Puts the last two words of the owner's own headline in the accent pill. */
function Highlighted({ text }: { text: string }) {
  const words = text.split(/\s+/);
  if (words.length < 4) return <>{text}</>;
  const tail = words.splice(-2).join(" ");
  return (
    <>
      {words.join(" ")}{" "}
      <span className="rounded-full border [box-decoration-break:clone] [-webkit-box-decoration-break:clone] border-[var(--pf-accent)]/40 bg-[var(--pf-accent)]/15 px-3 text-[var(--pf-accent)]">
        {tail}
      </span>
    </>
  );
}

export function SignalTemplate({ data, preview, onOpenItem }: TemplateProps) {
  useTemplateFont("Space+Grotesk:wght@400;500;600;700");
  const v = portfolioView(data);
  const display = { fontFamily: "'Space Grotesk', Montserrat, sans-serif" };
  const rest = v.sections.filter((s) => s.key !== "work");

  return (
    <div
      className="dark @container min-h-full overflow-x-clip bg-[#0a0b0a] text-[#f4f5f4] antialiased selection:bg-[var(--pf-accent)] selection:text-black"
      style={themeVars(v.accent, true)}
    >
      <TemplateStyles />
      <div className="mx-auto grid w-full max-w-[1180px] gap-5 px-4 pb-12 pt-5 @4xl:grid-cols-[340px_1fr] @4xl:gap-6 @4xl:px-6 @4xl:pt-6">
        {/* Profile card */}
        <aside className="@4xl:sticky @4xl:top-6 @4xl:self-start">
          <div className="pf-rise relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#111312] p-4">
            <div className="relative overflow-hidden rounded-[22px] bg-white/[0.04]">
              <Avatar
                v={v}
                rounded="rounded-[22px]"
                className="aspect-[4/4.4] w-full text-6xl grayscale-[35%]"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#111312] to-transparent" />
              {v.profile.location && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-medium text-white/85 backdrop-blur">
                  <MapPin className="h-3.5 w-3.5" /> {v.profile.location}
                </span>
              )}
            </div>
            <div className="px-1 pt-4">
              <h1
                className="text-[28px] font-semibold leading-tight tracking-[-0.02em]"
                style={display}
              >
                Hey, I'm {v.firstName}
              </h1>
              {v.role && (
                <p className="mt-1 text-[14px] font-medium text-[var(--pf-accent)]">{v.role}</p>
              )}
              {v.headline && (
                <p className="mt-2 text-[14px] leading-relaxed text-white/60">{v.headline}</p>
              )}
              <div className="mt-4">
                <ContactButtons v={v} dark />
              </div>
              <SocialLinksRow links={v.profile.social_links} className="mt-4" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {/* Statement */}
          <section className="pf-rise relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#111312] p-6 @2xl:p-9">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
              style={{ background: v.accent }}
            />
            <div className="relative flex items-center gap-2.5 text-[13px] text-white/55">
              <Avatar v={v} className="h-7 w-7 text-[12px]" />
              <span>@{v.profile.username}</span>
            </div>
            <p
              className="relative mt-5 max-w-[680px] text-[30px] font-medium leading-[1.15] tracking-[-0.03em] @2xl:text-[46px]"
              style={display}
            >
              {v.headline ? (
                <Highlighted text={v.headline} />
              ) : (
                <>
                  Building in public on <span className="text-[var(--pf-accent)]">Zero Club</span>
                </>
              )}
            </p>
            <div className="relative mt-8 flex flex-wrap items-end justify-between gap-6">
              {v.numbers.length > 0 && (
                <dl className="flex flex-wrap gap-x-10 gap-y-5">
                  {v.numbers.map((n) => (
                    <div key={n.label}>
                      <dd
                        className="text-[38px] font-semibold leading-none tabular-nums tracking-tight"
                        style={display}
                      >
                        {n.value.toLocaleString()}
                        <span className="text-[var(--pf-accent)]">+</span>
                      </dd>
                      <dt className="mt-1.5 text-[12.5px] text-white/50">{n.label}</dt>
                    </div>
                  ))}
                </dl>
              )}
              <RotatingBadge
                text={`ZERO CLUB · ${data.stats.verified > 0 ? "VERIFIED BUILDER" : "PORTFOLIO"} · ${new Date().getFullYear()} · `}
                size={112}
                className="text-white/70"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--pf-accent)] text-[color:var(--pf-ink)]">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </RotatingBadge>
            </div>
          </section>

          {/* Work as a bento */}
          {v.on("work") && (
            <section id="pf-work" className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <Heading>{SECTION_LABELS.work}</Heading>
                <RailArrows railId="pf-work-rail" dark />
              </div>
              <div id="pf-work-rail" className="pf-rail">
                {v.projects.map((item, i) => {
                  const { title, summary, ship } = describeItem(item);
                  const img = itemImages(item)[0];
                  const wide = item.featured || (i === 0 && v.projects.length % 2 === 1);
                  return (
                    <article
                      key={item.id}
                      className={`group overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#111312] ${wide ? "@2xl:col-span-2" : ""}`}
                    >
                      {img && (
                        <div
                          className={`overflow-hidden ${wide ? "aspect-[16/7]" : "aspect-[16/10]"}`}
                        >
                          <img
                            src={img}
                            alt={title}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                          />
                        </div>
                      )}
                      <div className="p-5">
                        <p className="text-[12px] text-white/45">
                          <WorkMeta item={item} />
                        </p>
                        <h3
                          className="mt-1.5 text-[21px] font-semibold tracking-tight"
                          style={display}
                        >
                          {title}
                        </h3>
                        {summary && (
                          <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-white/60">
                            {summary}
                          </p>
                        )}
                        {ship && ship.tools.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {ship.tools.slice(0, 6).map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-white/70"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <WorkLinks
                          item={item}
                          preview={preview}
                          onOpen={onOpenItem}
                          className="mt-4"
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <ShippedWork v={v} dark titleStyle={display} className="!py-0" />

          {rest.map((s) => (
            <section
              key={s.key}
              id={`pf-${s.key}`}
              className="rounded-[28px] border border-white/[0.08] bg-[#111312] p-5 @2xl:p-7"
            >
              <Heading>{SECTION_LABELS[s.key]}</Heading>
              <div className="mt-4">
                {s.key === "contact" ? (
                  <div>
                    <p
                      className="text-[26px] font-medium tracking-tight @2xl:text-[34px]"
                      style={display}
                    >
                      Have something in mind?{" "}
                      <span className="text-[var(--pf-accent)]">Let's build it.</span>
                    </p>
                    <div className="mt-5">
                      <SectionBody k="contact" v={v} skin={skin} />
                    </div>
                  </div>
                ) : (
                  <SectionBody k={s.key} v={v} skin={skin} preview={preview} onOpen={onOpenItem} />
                )}
              </div>
            </section>
          ))}
          <Footer dark branding={v.showBranding} />
        </main>
      </div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--pf-accent)]" /> {children}
    </h2>
  );
}
