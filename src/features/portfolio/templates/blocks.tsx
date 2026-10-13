/**
 * Section bodies the templates share, dressed by a `Skin` of class names.
 * Work is the exception: every template lays out projects its own way.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Award,
  BriefcaseBusiness,
  GraduationCap,
  Mail,
} from "@/components/icons/glyphs";
import { SocialLinksRow } from "@/features/profile/ProfileCredentials";
import { experienceSpan, monthYear } from "@/features/profile/credentials";
import { clip, describeItem, itemImages } from "../parse";
import type { PortfolioItem } from "../types";
import { AchievementIcon, achievementSource, WorkLinks, year, type View } from "./kit";

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
      <p className={`whitespace-pre-line text-[16px] leading-[1.75] ${skin.muted}`}>
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

export function ExperienceBlock({ v, skin }: { v: View; skin: Skin }) {
  return (
    <ol className="relative space-y-3">
      {v.experiences.map((exp) => (
        <li key={exp.id} className={`flex gap-4 p-4 @2xl:p-5 ${skin.card}`}>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${skin.tile}`}>
            <BriefcaseBusiness className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-[15.5px] font-semibold">{exp.title}</p>
              <p className={`text-[12.5px] tabular-nums ${skin.faint}`}>{experienceSpan(exp)}</p>
            </div>
            <p className={`text-[14px] ${skin.muted}`}>
              {exp.company}
              {exp.employment_type ? ` · ${exp.employment_type}` : ""}
              {exp.location ? ` · ${exp.location}` : ""}
            </p>
            {exp.description && (
              <p className={`mt-2 whitespace-pre-line text-[14px] leading-relaxed ${skin.muted}`}>
                {exp.description}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function LearningBlock({ v, skin }: { v: View; skin: Skin }) {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {v.learning.map((entry) => (
        <div key={entry.id} className={`flex items-center gap-3.5 p-3.5 ${skin.card}`}>
          {entry.banner_url ? (
            <img
              src={entry.banner_url}
              alt=""
              className="h-12 w-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className={`grid h-12 w-16 shrink-0 place-items-center rounded-lg ${skin.tile}`}>
              <GraduationCap className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-semibold">{entry.title}</p>
            <p className={`text-[12.5px] ${skin.faint}`}>
              Zero Club bootcamp{entry.category ? ` · ${entry.category}` : ""}
              {entry.enrolled_at ? ` · ${monthYear(entry.enrolled_at)}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CertificatesBlock({ v, skin }: { v: View; skin: Skin }) {
  return (
    <ul className="grid gap-3 @2xl:grid-cols-2">
      {v.certificates.map((cert) => (
        <li key={cert.id} className={`flex gap-3.5 p-4 ${skin.card}`}>
          <Award className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pf-accent)]" />
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold">{cert.name}</p>
            <p className={`text-[13px] ${skin.muted}`}>
              {cert.issuer}
              {cert.issued_on ? ` · ${monthYear(cert.issued_on)}` : ""}
            </p>
            {cert.credential_url && (
              <a
                href={cert.credential_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--pf-accent)] hover:underline"
              >
                Show credential <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AchievementsBlock({ v, skin }: { v: View; skin: Skin }) {
  return (
    <ul className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
      {v.achievements.map((a, i) => (
        <li key={`${a.ref}-${i}`} className={`relative overflow-hidden p-5 ${skin.card}`}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--pf-accent)] text-[color:var(--pf-ink)]">
            <AchievementIcon kind={a.kind} className="h-5 w-5" />
          </span>
          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--pf-accent)]">
            {a.label}
          </p>
          <p className="mt-1 text-[16px] font-semibold leading-snug">{a.title}</p>
          <p className={`mt-1 text-[12.5px] ${skin.faint}`}>
            {achievementSource(a.kind)}
            {a.at ? ` · ${year(a.at)}` : ""}
          </p>
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
    <div className="grid gap-3 @2xl:grid-cols-2">
      {v.proofs.map((item) => {
        const { summary } = describeItem(item);
        const image = itemImages(item)[0];
        return (
          <article key={item.id} className={`flex gap-4 p-4 ${skin.card}`}>
            {image && (
              <img
                src={image}
                alt=""
                loading="lazy"
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className={`line-clamp-3 text-[14px] leading-relaxed ${skin.muted}`}>{summary}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className={`text-[12px] ${skin.faint}`}>
                  {monthYear(item.post.created_at)}
                </span>
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

/** The buttons every hero and contact block offers. */
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
      {v.email && (
        <a
          href={`mailto:${v.email}`}
          className={`inline-flex items-center gap-2 rounded-full font-semibold transition active:scale-[0.98] bg-[var(--pf-accent)] text-[color:var(--pf-ink)] ${h}`}
        >
          <Mail className="h-4 w-4" /> Let's talk
        </a>
      )}
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
        {v.email && (
          <a href={`mailto:${v.email}`} className="hover:text-[var(--pf-accent)]">
            {v.email}
          </a>
        )}
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
}: {
  k: string;
  v: View;
  skin: Skin;
  preview?: boolean;
  onOpen?: (i: PortfolioItem) => void;
}) {
  switch (k) {
    case "about":
      return <AboutBlock v={v} skin={skin} className="max-w-[720px]" />;
    case "experience":
      return <ExperienceBlock v={v} skin={skin} />;
    case "skills":
      return <SkillsBlock v={v} skin={skin} />;
    case "learning":
      return <LearningBlock v={v} skin={skin} />;
    case "certificates":
      return <CertificatesBlock v={v} skin={skin} />;
    case "proofs":
      return <ProofsBlock v={v} skin={skin} preview={preview} onOpen={onOpen} />;
    case "achievements":
      return <AchievementsBlock v={v} skin={skin} />;
    case "contact":
      return <ContactDetails v={v} skin={skin} />;
    default:
      return null;
  }
}
