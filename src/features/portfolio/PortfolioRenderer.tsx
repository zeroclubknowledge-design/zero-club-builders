import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  GitBranch,
  GraduationCap,
  Mail,
  MapPin,
} from "@/components/icons/glyphs";
import { SocialLinksRow } from "@/features/profile/ProfileCredentials";
import { experienceSpan, monthYear } from "@/features/profile/credentials";
import { clip, describePost, postImages } from "./parse";
import {
  ACCENT_HEX,
  SECTION_LABELS,
  normaliseSections,
  type PortfolioItem,
  type PortfolioSectionKey,
  type PublicPortfolio,
} from "./types";

/**
 * Zero Minimal: the portfolio template.
 *
 * Always dark, whatever theme the visitor's app uses, so a shared link looks
 * the same everywhere. Layout follows the width of its own container rather
 * than the screen, so the builder's narrow preview pane shows the phone
 * layout and the public page shows the full one.
 *
 * Everything shown comes from the owner's own data. Zero Club-verified facts
 * (ships, tutor verification, bootcamps, XP) are labelled as such; experience
 * and certificates are self-reported and shown plainly.
 */
type Props = {
  data: PublicPortfolio;
  /** Builder preview: no view tracking, links still work. */
  preview?: boolean;
  onOpenItem?: (item: PortfolioItem) => void;
};

export function PortfolioRenderer({ data, preview, onOpenItem }: Props) {
  const { profile, portfolio, items, experiences, certificates, learning, stats } = data;
  const accent = ACCENT_HEX[portfolio.accent] || ACCENT_HEX.pink;
  const name = profile.full_name || profile.username;
  const headline = portfolio.headline?.trim() || clip(profile.bio || "", 140);
  const about = portfolio.about?.trim() || profile.bio?.trim() || "";
  const email = profile.social_links?.email || null;
  const projects = items.filter((item) => item.kind === "project");
  const proofs = items.filter((item) => item.kind === "proof");
  const skills = portfolio.skills || [];
  const sections = normaliseSections(portfolio.sections).filter((s) => s.visible);

  const style = {
    "--pf-accent": accent,
    // SocialLinksRow and friends read the app's theme tokens.
    "--border": "rgb(255 255 255 / 0.12)",
    "--foreground": "#fafafa",
    "--muted-foreground": "rgb(255 255 255 / 0.55)",
  } as CSSProperties;

  const has: Record<PortfolioSectionKey, boolean> = {
    work: projects.length > 0,
    about: about.length > 0,
    experience: experiences.length > 0,
    skills: skills.length > 0,
    learning: learning.length > 0,
    certificates: certificates.length > 0,
    proofs: proofs.length > 0,
    contact: Boolean(email || profile.website || Object.keys(profile.social_links || {}).length),
  };
  const shown = sections.filter((s) => has[s.key]);

  return (
    <div
      className="dark @container min-h-full bg-[#0a0a0b] text-[#fafafa] antialiased selection:bg-[var(--pf-accent)] selection:text-black"
      style={style}
    >
      <div className="mx-auto w-full max-w-[1040px] px-5 pb-16 pt-10 @2xl:px-10 @2xl:pt-16">
        {/* Hero */}
        <header className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl"
            style={{ background: accent }}
          />
          <div className="relative flex items-center gap-4">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-1 ring-white/10 @2xl:h-20 @2xl:w-20"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-white/[0.06] text-2xl font-semibold ring-1 ring-white/10">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] text-white/55">@{profile.username}</p>
              {profile.location && (
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-white/55">
                  <MapPin className="h-3.5 w-3.5" /> {profile.location}
                </p>
              )}
            </div>
          </div>
          <h1 className="relative mt-6 text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] @2xl:text-[64px]">
            {name}
          </h1>
          {headline && (
            <p className="relative mt-3 max-w-[640px] text-[17px] leading-relaxed text-white/70 @2xl:text-[20px]">
              {headline}
            </p>
          )}
          <div className="relative mt-6 flex flex-wrap items-center gap-2.5">
            {email ? (
              <a
                href={`mailto:${email}`}
                className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-black transition active:scale-[0.98]"
                style={{ background: accent }}
              >
                <Mail className="h-4 w-4" /> Get in touch
              </a>
            ) : null}
            <Link
              to="/app/profile/$id"
              params={{ id: profile.id }}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/15 px-5 text-[14px] font-medium text-white/90 transition hover:border-white/30 active:scale-[0.98]"
            >
              Zero Club profile <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          {portfolio.show_stats && (
            <dl className="relative mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] @lg:grid-cols-4">
              <Stat label="Projects shipped" value={stats.ships} />
              <Stat label="Tutor-verified" value={stats.verified} />
              <Stat label="Zero Proofs" value={stats.proofs} />
              <Stat label="XP earned" value={stats.xp} />
            </dl>
          )}
        </header>

        {shown.map((section, index) => (
          <Section
            key={section.key}
            id={section.key}
            number={index + 1}
            title={SECTION_LABELS[section.key]}
          >
            {section.key === "work" && (
              <div className="grid items-start gap-4 @2xl:grid-cols-2">
                {projects.map((item) => (
                  <ProjectCard
                    key={item.id}
                    item={item}
                    wide={item.featured}
                    preview={preview}
                    onOpen={onOpenItem}
                  />
                ))}
              </div>
            )}
            {section.key === "about" && (
              <p className="max-w-[680px] whitespace-pre-line text-[16px] leading-[1.7] text-white/75">
                {about}
              </p>
            )}
            {section.key === "experience" && (
              <ul className="divide-y divide-white/[0.07] rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                {experiences.map((exp) => (
                  <li key={exp.id} className="flex gap-4 p-4 @2xl:p-5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white/70">
                      <BriefcaseBusiness className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{exp.title}</p>
                      <p className="text-[14px] text-white/70">
                        {exp.company}
                        {exp.employment_type ? ` · ${exp.employment_type}` : ""}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-white/45">
                        {experienceSpan(exp)}
                        {exp.location ? ` · ${exp.location}` : ""}
                      </p>
                      {exp.description && (
                        <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-white/65">
                          {exp.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {section.key === "skills" && (
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[13.5px] text-white/80"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
            {section.key === "learning" && (
              <div className="grid gap-3 @2xl:grid-cols-2">
                {learning.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5"
                  >
                    {entry.banner_url ? (
                      <img
                        src={entry.banner_url}
                        alt=""
                        className="h-12 w-16 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
                        <GraduationCap className="h-5 w-5 text-white/60" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold">{entry.title}</p>
                      <p className="text-[12.5px] text-white/50">
                        Zero Club bootcamp{entry.category ? ` · ${entry.category}` : ""}
                        {entry.enrolled_at ? ` · ${monthYear(entry.enrolled_at)}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {section.key === "certificates" && (
              <ul className="grid gap-3 @2xl:grid-cols-2">
                {certificates.map((cert) => (
                  <li
                    key={cert.id}
                    className="flex gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
                  >
                    <Award className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-semibold">{cert.name}</p>
                      <p className="text-[13px] text-white/60">
                        {cert.issuer}
                        {cert.issued_on ? ` · ${monthYear(cert.issued_on)}` : ""}
                      </p>
                      {cert.credential_url && (
                        <a
                          href={cert.credential_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-white/80 underline-offset-4 hover:underline"
                        >
                          Show credential <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {section.key === "proofs" && (
              <div className="grid gap-3 @2xl:grid-cols-2">
                {proofs.map((item) => (
                  <ProofCard key={item.id} item={item} preview={preview} onOpen={onOpenItem} />
                ))}
              </div>
            )}
            {section.key === "contact" && (
              <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-6 @2xl:p-8">
                <p className="text-[22px] font-semibold tracking-tight @2xl:text-[28px]">
                  Let's build something.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {email && (
                    <a
                      href={`mailto:${email}`}
                      className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-black"
                      style={{ background: accent }}
                    >
                      <Mail className="h-4 w-4" /> {email}
                    </a>
                  )}
                  {profile.website && (
                    <a
                      href={
                        profile.website.startsWith("http")
                          ? profile.website
                          : `https://${profile.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[14px] text-white/85"
                    >
                      {profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <SocialLinksRow links={profile.social_links} className="mt-4" />
              </div>
            )}
          </Section>
        ))}

        <footer className="mt-16 flex flex-col items-center gap-2 border-t border-white/[0.07] pt-8 text-center">
          <a
            href="https://www.zeroclubs.xyz"
            className="text-[13px] text-white/45 transition hover:text-white/80"
          >
            Built with <span className="font-semibold text-white/80">Zero Club</span>
          </a>
          <p className="text-[12px] text-white/30">
            Projects and Zero Proofs are published on Zero Club. Experience and certificates are
            self-reported.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#0d0d0f] px-4 py-4">
      <dd className="text-[24px] font-semibold tabular-nums tracking-tight">
        {Number(value || 0).toLocaleString()}
      </dd>
      <dt className="mt-0.5 text-[12px] text-white/50">{label}</dt>
    </div>
  );
}

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={`pf-${id}`} className="mt-14 scroll-mt-6 @2xl:mt-20">
      <h2 className="mb-5 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
        <span className="tabular-nums" style={{ color: "var(--pf-accent)" }}>
          {String(number).padStart(2, "0")}
        </span>
        {title}
        <span className="h-px flex-1 bg-white/[0.07]" />
      </h2>
      {children}
    </section>
  );
}

function ProofLink({
  item,
  preview,
  onOpen,
  label = "View proof on Zero Club",
}: {
  item: PortfolioItem;
  preview?: boolean;
  onOpen?: (item: PortfolioItem) => void;
  label?: string;
}) {
  return (
    <Link
      to="/app/post/$id"
      params={{ id: item.post.id }}
      onClick={() => {
        if (!preview) onOpen?.(item);
      }}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
    >
      {label} <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function ProjectCard({
  item,
  wide,
  preview,
  onOpen,
}: {
  item: PortfolioItem;
  wide: boolean;
  preview?: boolean;
  onOpen?: (item: PortfolioItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { title, summary, ship } = describePost(item.post);
  const images = postImages(item.post);
  const limit = wide ? 420 : 220;
  const long = summary.length > limit;
  const versions = Number(item.post.versions || 0);

  return (
    <article
      className={`group overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] ${
        wide ? "@2xl:col-span-2" : ""
      }`}
    >
      {images[0] && (
        <div
          className={`relative overflow-hidden bg-white/[0.03] ${wide ? "aspect-[16/7.5]" : "aspect-[16/10]"}`}
        >
          <img
            src={images[0]}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
          />
        </div>
      )}
      <div className="p-5 @2xl:p-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/50">
          {ship?.category && <span>{ship.category}</span>}
          {item.post.is_verified_build && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 font-medium text-emerald-300">
              <BadgeCheck className="h-3.5 w-3.5" /> Tutor-verified
            </span>
          )}
          {versions > 0 && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" /> {versions + 1} versions
            </span>
          )}
          {item.featured && (
            <span className="font-semibold" style={{ color: "var(--pf-accent)" }}>
              Featured
            </span>
          )}
        </div>
        <h3
          className={`mt-2 font-semibold tracking-tight ${wide ? "text-[24px] @2xl:text-[30px]" : "text-[20px]"}`}
        >
          {title}
        </h3>
        {summary && (
          <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.65] text-white/65">
            {expanded || !long ? summary : clip(summary, limit)}
            {long && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 font-medium text-white/85 hover:underline"
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </p>
        )}
        {(item.problem || item.outcome) && (
          <div className="mt-4 grid gap-3 @lg:grid-cols-2">
            {item.problem && (
              <div className="rounded-2xl bg-white/[0.035] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Problem
                </p>
                <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-white/75">
                  {item.problem}
                </p>
              </div>
            )}
            {item.outcome && (
              <div className="rounded-2xl bg-white/[0.035] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Outcome
                </p>
                <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-white/75">
                  {item.outcome}
                </p>
              </div>
            )}
          </div>
        )}
        {wide && images.length > 1 && (
          <div className={`mt-4 grid gap-2 ${images.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
            {images.slice(1, 4).map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
            ))}
          </div>
        )}
        {ship && ship.tools.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ship.tools.slice(0, wide ? 12 : 6).map((tool) => (
              <span
                key={tool}
                className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px] text-white/70"
              >
                {tool}
              </span>
            ))}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          {ship?.links.slice(0, 3).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-semibold"
              style={{ color: "var(--pf-accent)" }}
            >
              {link.title} <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ))}
          <ProofLink item={item} preview={preview} onOpen={onOpen} />
        </div>
      </div>
    </article>
  );
}

function ProofCard({
  item,
  preview,
  onOpen,
}: {
  item: PortfolioItem;
  preview?: boolean;
  onOpen?: (item: PortfolioItem) => void;
}) {
  const { summary } = describePost(item.post);
  const image = postImages(item.post)[0];
  return (
    <article className="flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
      {image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 text-[14px] leading-relaxed text-white/75">{summary}</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[12px] text-white/40">{monthYear(item.post.created_at)}</span>
          <ProofLink item={item} preview={preview} onOpen={onOpen} label="View" />
        </div>
      </div>
    </article>
  );
}
