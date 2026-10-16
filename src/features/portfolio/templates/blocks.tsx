/**
 * Section bodies the templates share, dressed by a `Skin` of class names.
 * Work is the exception: every template lays out projects its own way.
 */
import { useState, type CSSProperties } from "react";

const TINT =
  "linear-gradient(135deg, color-mix(in srgb, var(--pf-accent) 26%, transparent), color-mix(in srgb, var(--pf-accent) 5%, transparent))";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Award,
    GraduationCap,
  Mail,
  MessageCircle,
} from "@/components/icons/glyphs";
import { SocialLinksRow } from "@/features/profile/ProfileCredentials";
import { experienceSpan, monthYear } from "@/features/profile/credentials";
import { clip, describeItem, itemImages } from "../parse";
import type { PortfolioItem } from "../types";
import { AchievementIcon, achievementSource, ContactLink, WorkLinks, year, type View } from "./kit";

export type Skin = {
  /** A surface: border + background + radius. */
  card: string;
  /** Secondary text. */
  muted: string;
  /** Tertiary text. */
  faint: string;
  /** A skill chip. */
  chip: string;
  /** Hairline dividers. */
  line: string;
  /** Icon tile background. */
  tile: string;
};

export function AboutBlock({
  v,
  skin,
  className = "",
}: {
  v: View;
  skin: Skin;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const long = v.about.length > 600;
  return (
    <div className={className}>
      <p className={`whitespace-pre-line text-[16px] leading-[1.75] @3xl:text-[17px] ${skin.muted}`}>
        {open || !long ? v.about : clip(v.about, 600)}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-[13px] font-semibold text-[var(--pf-accent)]"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export function SkillsBlock({ v, skin }: { v: View; skin: Skin }) {
  return (
    <div className="flex flex-wrap gap-2">
      {v.skills.map((s) => (
        <span
          key={s}
          className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-medium ${skin.chip}`}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

export function ExperienceBlock({ v, skin, display }: { v: View; skin: Skin; display?: CSSProperties }) {
  return (
    <ol className="relative">
      {v.experiences.map((exp, i) => {
        const last = i === v.experiences.length - 1;
        return (
          <li key={exp.id} className="grid @2xl:grid-cols-[210px_1fr] @2xl:gap-8">
            <p className={`hidden pt-0.5 text-[13px] font-medium tabular-nums @2xl:block ${skin.faint}`}>
              {experienceSpan(exp)}
            </p>
            <div className={`relative border-l pl-7 ${last ? "pb-1" : "pb-10"} ${skin.line}`}>
              <span
                aria-hidden
                className={`absolute -left-[6px] top-[7px] h-[11px] w-[11px] rounded-full ${exp.is_current ? "bg-[var(--pf-accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--pf-accent)_22%,transparent)]" : "bg-current opacity-30"}`}
              />
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] @2xl:text-[20px]" style={display}>
                  {exp.title}
                </h3>
                {exp.is_current && (
                  <span className="rounded-full bg-[var(--pf-accent)]/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--pf-accent)]">
                    Current
                  </span>
                )}
              </div>
              <p className={`mt-0.5 text-[14.5px] ${skin.muted}`}>
                <span className="font-medium">{exp.company}</span>
                {exp.employment_type ? ` · ${exp.employment_type}` : ""}
                {exp.location ? ` · ${exp.location}` : ""}
              </p>
              <p className={`mt-1 text-[12.5px] tabular-nums @2xl:hidden ${skin.faint}`}>{experienceSpan(exp)}</p>
              {exp.description && (
                <p className={`mt-3 max-w-[680px] whitespace-pre-line text-[14.5px] leading-[1.7] ${skin.muted}`}>
                  {exp.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LearningBlock({ v, skin, display }: { v: View; skin: Skin; display?: CSSProperties }) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
      {v.learning.map((entry) => (
        <article key={entry.id} className={`pf-lift flex flex-col overflow-hidden ${skin.card}`}>
          {entry.banner_url ? (
            <img src={entry.banner_url} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
          ) : (
            <span
              className="grid aspect-[16/9] w-full place-items-center text-[var(--pf-accent)]"
              style={{ background: TINT }}
            >
              <GraduationCap className="h-8 w-8" />
            </span>
          )}
          <div className="flex flex-1 flex-col p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--pf-accent)]">
              Bootcamp{entry.category ? ` · ${entry.category}` : ""}
            </p>
            <p className="mt-1.5 line-clamp-2 text-[15.5px] font-semibold leading-snug tracking-tight" style={display}>
              {entry.title}
            </p>
            <p className={`mt-auto pt-3 text-[12.5px] ${skin.faint}`}>
              Zero Club{entry.enrolled_at ? ` · ${monthYear(entry.enrolled_at)}` : ""}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function CertificatesBlock({ v, skin, display }: { v: View; skin: Skin; display?: CSSProperties }) {
  return (
    <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
      {v.certificates.map((cert) => (
        <li key={cert.id} className={`pf-lift flex flex-col p-5 ${skin.card}`}>
          <div className="flex items-start justify-between gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${skin.tile}`}>
              <Award className="h-5 w-5 text-[var(--pf-accent)]" />
            </span>
            {cert.issued_on && (
              <span className={`text-[12px] tabular-nums ${skin.faint}`}>{monthYear(cert.issued_on)}</span>
            )}
          </div>
          <p className={`mt-5 text-[11px] font-bold uppercase tracking-[0.14em] ${skin.faint}`}>{cert.issuer}</p>
          <p className="mt-1 text-[16px] font-semibold leading-snug tracking-tight" style={display}>
            {cert.name}
          </p>
          {cert.credential_url && (
            <a
              href={cert.credential_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center gap-1 pt-4 text-[12.5px] font-semibold text-[var(--pf-accent)] hover:underline"
            >
              Show credential <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AchievementsBlock({ v, skin, display }: { v: View; skin: Skin; display?: CSSProperties }) {
  return (
    <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
      {v.achievements.map((a, i) => (
        <li key={`${a.ref}-${i}`} className={`pf-lift relative flex flex-col overflow-hidden p-6 ${skin.card}`}>
          <span
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-25 blur-2xl"
            style={{ background: "var(--pf-accent)" }}
          />
          <div className="relative flex items-center justify-between gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--pf-accent)] text-[color:var(--pf-ink)]">
              <AchievementIcon kind={a.kind} className="h-[18px] w-[18px]" />
            </span>
            {a.at && <span className={`text-[12px] tabular-nums ${skin.faint}`}>{year(a.at)}</span>}
          </div>
          <p className="relative mt-6 text-[26px] font-semibold leading-none tracking-[-0.02em]" style={display}>
            {a.label}
          </p>
          <p className="relative mt-2.5 text-[15px] font-medium leading-snug">{a.title}</p>
          <p className={`relative mt-auto pt-4 text-[12.5px] ${skin.faint}`}>{achievementSource(a.kind)}</p>
        </li>
      ))}
    </ul>
  );
}

export function ProofsBlock({
  v,
  skin,
  preview,
  onOpen,
}: {
  v: View;
  skin: Skin;
  preview?: boolean;
  onOpen?: (i: PortfolioItem) => void;
}) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
      {v.proofs.map((item) => {
        const { summary } = describeItem(item);
        const image = itemImages(item)[0];
        return (
          <article key={item.id} className={`pf-lift group flex flex-col overflow-hidden ${skin.card}`}>
            {image && (
              <div className="overflow-hidden">
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                />
              </div>
            )}
            <div className="flex flex-1 flex-col p-4">
              {!image && <span aria-hidden className="mb-1 text-[34px] leading-none text-[var(--pf-accent)]">“</span>}
              <p className={`line-clamp-4 text-[14px] leading-relaxed ${skin.muted}`}>{summary}</p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <span className={`text-[12px] ${skin.faint}`}>{monthYear(item.post.created_at)}</span>
                <WorkLinks
                  item={item}
                  preview={preview}
                  onOpen={onOpen}
                  proofLabel="View"
                  className="text-[12.5px]"
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ContactButtons({
  v,
  dark,
  size = "md",
}: {
  v: View;
  dark: boolean;
  size?: "md" | "lg";
}) {
  const h = size === "lg" ? "h-12 px-6 text-[15px]" : "h-11 px-5 text-[14px]";
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <ContactLink
        v={v}
        className={`inline-flex items-center gap-2 rounded-full font-semibold transition active:scale-[0.98] bg-[var(--pf-accent)] text-[color:var(--pf-ink)] ${h}`}
      >
        {v.contact.method === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} Let's talk
      </ContactLink>
      <Link
        to="/app/profile/$id"
        params={{ id: v.profile.id }}
        className={`inline-flex items-center gap-1.5 rounded-full border font-semibold transition active:scale-[0.98] ${h} ${dark ? "border-white/15 text-white/90 hover:border-white/35" : "border-black/15 text-black/85 hover:border-black/35"}`}
      >
        Zero Club profile <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function ContactDetails({ v, skin }: { v: View; skin: Skin }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] font-semibold">
        <ContactLink v={v} className="inline-flex items-center gap-1.5 hover:text-[var(--pf-accent)]">
          {v.contact.method === "email" ? v.contact.email : <><MessageCircle className="h-4 w-4" /> Message me on Zero Club</>}
        </ContactLink>
        {v.website && (
          <a
            href={v.website}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 hover:text-[var(--pf-accent)] ${skin.muted}`}
          >
            {v.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}{" "}
            <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
      </div>
      <SocialLinksRow links={v.profile.social_links} />
    </div>
  );
}

/** A project's facts: category, verification, versions, year. */
export function WorkMeta({ item }: { item: PortfolioItem }) {
  const { ship } = describeItem(item);
  const versions = Number(item.post.versions || 0);
  const bits = [
    ship?.category,
    item.post.is_verified_build ? "Tutor-verified" : null,
    versions > 0 ? `${versions + 1} versions` : null,
    String(year(item.post.created_at) || ""),
  ].filter(Boolean) as string[];
  return <>{bits.join(" · ")}</>;
}

/** Every non-work section, in one place; a template supplies the work and contact layouts. */
export function SectionBody({
  k,
  v,
  skin,
  preview,
  onOpen,
  display,
}: {
  k: string;
  v: View;
  skin: Skin;
  preview?: boolean;
  onOpen?: (i: PortfolioItem) => void;
  /** The template's display face, for titles inside cards. */
  display?: CSSProperties;
}) {
  switch (k) {
    case "about":
      return <AboutBlock v={v} skin={skin} className="max-w-[720px]" />;
    case "experience":
      return <ExperienceBlock v={v} skin={skin} display={display} />;
    case "skills":
      return <SkillsBlock v={v} skin={skin} />;
    case "learning":
      return <LearningBlock v={v} skin={skin} display={display} />;
    case "certificates":
      return <CertificatesBlock v={v} skin={skin} display={display} />;
    case "proofs":
      return <ProofsBlock v={v} skin={skin} preview={preview} onOpen={onOpen} />;
    case "achievements":
      return <AchievementsBlock v={v} skin={skin} display={display} />;
    case "contact":
      return <ContactDetails v={v} skin={skin} />;
    default:
      return null;
  }
}
