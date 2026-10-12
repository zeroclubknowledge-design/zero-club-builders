/**
 * Statement — oversized type, a fanned stack of work, a turning badge and a
 * sunset to sign off. For people whose projects are visual.
 */
import { ArrowUpRight, MapPin } from "@/components/icons/glyphs";
import { describePost, postImages } from "../parse";
import { SECTION_LABELS } from "../types";
import { AboutBlock, ContactButtons, SectionBody, WorkMeta, type Skin } from "./blocks";
import {
  Footer,
  fitName,
  RotatingBadge,
  TemplateStyles,
  WorkLinks,
  portfolioView,
  themeVars,
  useTemplateFont,
  type TemplateProps,
} from "./kit";

const skin: Skin = {
  card: "rounded-xl border border-white/[0.08] bg-white/[0.02]",
  muted: "text-white/65",
  faint: "text-white/40",
  chip: "border border-white/15 text-white/85",
  line: "border-white/[0.08]",
  tile: "bg-white/[0.06] text-white/70",
};

export function StatementTemplate({ data, preview, onOpenItem }: TemplateProps) {
  useTemplateFont("Archivo:wdth,wght@62..125,500..900");
  const v = portfolioView(data);
  const heavy = {
    fontFamily: "'Archivo', Montserrat, sans-serif",
    fontStretch: "112%",
    fontWeight: 900,
  } as const;
  const rest = v.sections.filter((s) => !["work", "about", "skills"].includes(s.key));
  const fan = v.gallery.slice(0, 3);
  const top = (v.lastName ? v.firstName : v.name).toUpperCase();
  const bottom = v.lastName ? `.${v.lastName.toUpperCase()}` : "";

  return (
    <div
      className="dark @container min-h-full overflow-x-clip bg-[#0e0e0e] text-[#f2f2f2] antialiased"
      style={themeVars(v.accent, true)}
    >
      <TemplateStyles />
      <div className="h-1 w-full bg-[var(--pf-accent)]" />
      <div className="mx-auto max-w-[1200px] px-5 @3xl:px-10">
        <nav className="flex items-center justify-between py-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60">
          <span className="text-white">{v.profile.username}</span>
          {v.profile.location && (
            <span className="hidden items-center gap-1 @lg:inline-flex">
              <MapPin className="h-3.5 w-3.5" /> {v.profile.location}
            </span>
          )}
          {v.email ? (
            <a
              href={`mailto:${v.email}`}
              className="rounded-full border border-white/25 px-4 py-2 text-white"
            >
              Contact
            </a>
          ) : (
            <span />
          )}
        </nav>

        {/* Hero */}
        <header className="relative pt-6 @3xl:pt-12">
          <h1
            className="pf-rise text-[length:var(--pf-n1)] leading-[0.82] tracking-[-0.04em] @3xl:text-[length:var(--pf-n2)]"
            style={{
              ...heavy,
              ["--pf-n1" as string]: fitName(`${top} ${bottom}`, 21, 0.72),
              ["--pf-n2" as string]: fitName(`${top} ${bottom}`, 15, 0.72),
            }}
          >
            {top}
            {bottom && (
              <>
                <br />
                {bottom}
              </>
            )}
          </h1>
          <div className="mt-6 grid gap-6 @3xl:max-w-[420px]">
            <div>
              {v.role && (
                <p className="text-[13px] font-bold uppercase tracking-[0.12em]">{v.role}</p>
              )}
              {v.headline && (
                <p className="mt-2 text-[14px] leading-relaxed text-white/60">{v.headline}</p>
              )}
            </div>
          </div>
          <div className="relative mt-24 flex justify-center @3xl:mt-20">
            <RotatingBadge
              text={
                data.portfolio.show_stats && data.stats.ships > 0
                  ? `ZERO CLUB · ${data.stats.ships} PROJECTS SHIPPED · `
                  : `ZERO CLUB · PORTFOLIO · ${new Date().getFullYear()} · `
              }
              size={150}
              className="absolute -top-16 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#0e0e0e] text-white"
            >
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--pf-accent)] text-[color:var(--pf-ink)]">
                <ArrowUpRight className="h-6 w-6" />
              </span>
            </RotatingBadge>
            {fan.length > 0 ? (
              <div className="relative h-[260px] w-full @3xl:h-[400px]">
                {fan.map((g, i) => {
                  const pos = fan.length === 1 ? [0] : fan.length === 2 ? [-1, 1] : [-1, 0, 1];
                  const p = pos[i];
                  return (
                    <img
                      key={g.url}
                      src={g.url}
                      alt=""
                      className="absolute left-1/2 top-6 h-[220px] w-[66%] rounded-2xl border border-white/10 object-cover shadow-2xl @3xl:h-[340px] @3xl:w-[46%]"
                      style={{
                        transform: `translateX(calc(-50% + ${p * 28}%)) rotate(${p * 7}deg)`,
                        zIndex: p === 0 ? 3 : 1,
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="h-24" />
            )}
          </div>
        </header>

        {/* Skills as a stack of giant words */}
        {v.on("skills") && (
          <section id="pf-skills" className="mt-16 border-t border-white/10 pt-10">
            <Kicker>{SECTION_LABELS.skills}</Kicker>
            <ul className="mt-6">
              {v.skills.slice(0, 8).map((s, i) => (
                <li
                  key={s}
                  className={`leading-[0.95] tracking-[-0.03em] text-[11cqw] @3xl:text-[7cqw] ${i % 2 ? "text-transparent [-webkit-text-stroke:1px_rgb(255_255_255/0.35)]" : ""}`}
                  style={heavy}
                >
                  {s.toUpperCase()}
                </li>
              ))}
            </ul>
            {v.skills.length > 8 && (
              <p className="mt-4 text-[13px] text-white/50">+ {v.skills.slice(8).join(" · ")}</p>
            )}
          </section>
        )}

        {/* Featured work */}
        {v.on("work") && (
          <section id="pf-work" className="mt-20">
            <Rule>{"Featured works"}</Rule>
            <div className="mt-10 grid gap-x-8 gap-y-14 @3xl:grid-cols-12">
              {v.projects.map((item, i) => {
                const { title, summary, ship } = describePost(item.post);
                const img = postImages(item.post)[0];
                const big = i % 3 === 0;
                return (
                  <article
                    key={item.id}
                    className={big ? "@3xl:col-span-7" : "@3xl:col-span-5 @3xl:mt-24"}
                  >
                    {img && (
                      <img
                        src={img}
                        alt={title}
                        loading="lazy"
                        className={`w-full rounded-2xl object-cover ${big ? "aspect-[4/3]" : "aspect-square"}`}
                      />
                    )}
                    <div className="mt-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-[26px] leading-none tracking-[-0.02em]" style={heavy}>
                          {title.toUpperCase()}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {[ship?.category, ...(ship?.tools.slice(0, 3) || [])]
                            .filter(Boolean)
                            .map((t) => (
                              <span
                                key={t as string}
                                className="rounded border border-white/15 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/60"
                              >
                                {t}
                              </span>
                            ))}
                        </div>
                      </div>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] text-white/40">
                      <WorkMeta item={item} />
                    </p>
                    {summary && (
                      <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-white/60">
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

        {/* About + numbers */}
        {v.on("about") && (
          <section id="pf-about" className="mt-24">
            <p
              className="leading-[0.92] tracking-[-0.03em] text-[10cqw] @3xl:text-[6.5cqw]"
              style={heavy}
            >
              {(v.role || "Builder").toUpperCase()}
              <span className="text-[var(--pf-accent)]"> /</span>
            </p>
            <AboutBlock v={v} skin={skin} className="mt-6 max-w-[620px]" />
            {v.numbers.length > 0 && (
              <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-white/10 pt-6 @3xl:grid-cols-4">
                {v.numbers.map((n) => (
                  <div key={n.label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                      {n.label}
                    </dt>
                    <dd className="mt-2 text-[52px] leading-none tracking-tight" style={heavy}>
                      {n.value.toLocaleString()}
                      {n.value >= 10 ? "+" : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}

        {rest.map((s) => (
          <section key={s.key} id={`pf-${s.key}`} className="mt-24">
            {s.key === "contact" ? (
              <div className="relative overflow-hidden pb-40 pt-6 text-center">
                <p
                  className="leading-[0.9] tracking-[-0.03em] text-[12cqw] @3xl:text-[8cqw]"
                  style={heavy}
                >
                  READY TO
                  <br />
                  COLLABORATE?
                </p>
                <div className="mt-8 flex justify-center">
                  <ContactButtons v={v} dark size="lg" />
                </div>
                <div className="mt-6 flex justify-center">
                  <SectionBody k="contact" v={v} skin={skin} />
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full blur-[2px] @3xl:h-96 @3xl:w-96"
                  style={{
                    background: `radial-gradient(circle at 50% 30%, #ffd59a, ${v.accent} 55%, transparent 72%)`,
                  }}
                />
              </div>
            ) : (
              <>
                <Rule>{SECTION_LABELS[s.key]}</Rule>
                <div className="mt-8">
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

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--pf-accent)]">
      {children}
    </p>
  );
}
function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 text-[12px] font-bold uppercase tracking-[0.18em] text-white/80">
      <span className="text-white/30">//</span>
      <span className="h-px flex-1 bg-white/10" />
      {children}
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-white/30">//</span>
    </div>
  );
}
