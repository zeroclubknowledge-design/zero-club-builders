import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Award, BriefcaseBusiness, Plus } from "@/components/icons/glyphs";
import {
  experienceSpan,
  monthYear,
  orderedSocialLinks,
  socialHref,
  useProfileCredentials,
  type Experience,
} from "./credentials";

/** A row of link icons (LinkedIn, GitHub, X…) for the profile header. */
export function SocialLinksRow({
  links,
  className = "",
}: {
  links?: Record<string, string> | null;
  className?: string;
}) {
  const items = orderedSocialLinks(links);
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {items.map((item) => (
        <a
          key={item.key}
          href={socialHref(item.key, item.value)}
          target={item.key === "email" ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label={item.label}
          title={item.label}
          className="grid h-9 w-9 place-items-center rounded-full border border-border text-foreground/80 transition hover:border-foreground/30 hover:text-foreground active:scale-95"
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
}

function ExperienceRow({ exp }: { exp: Experience }) {
  const [open, setOpen] = useState(false);
  const long = (exp.description || "").length > 180;
  return (
    <li className="flex gap-3.5 py-3.5 first:pt-1">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-[15px] font-bold text-foreground/80">
        {exp.company.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug text-foreground">{exp.title}</p>
        <p className="text-[14px] text-foreground/85">
          {exp.company}
          {exp.employment_type ? ` · ${exp.employment_type}` : ""}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {experienceSpan(exp)}
          {exp.location ? ` · ${exp.location}` : ""}
        </p>
        {exp.description && (
          <p
            className={`mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/85 ${!open && long ? "line-clamp-3" : ""}`}
          >
            {exp.description}
          </p>
        )}
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-0.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {open ? "Show less" : "…see more"}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Experience and Certificates on a profile. Both are what the person added
 * themselves, and the note under each heading says so. Owners see an Add
 * link; visitors see nothing at all when a section is empty.
 */
export function ProfileCredentials({
  profileId,
  isOwner,
}: {
  profileId?: string | null;
  isOwner: boolean;
}) {
  const { data } = useProfileCredentials(profileId);
  const experiences = data?.experiences || [];
  const certificates = data?.certificates || [];
  const [showAllExp, setShowAllExp] = useState(false);

  if (!data) return null;
  if (!isOwner && experiences.length === 0 && certificates.length === 0) return null;

  const shownExp = showAllExp ? experiences : experiences.slice(0, 3);

  return (
    <>
      {(experiences.length > 0 || isOwner) && (
        <section className="mt-2 bg-card px-4 py-4 md:rounded-xl md:border md:border-border">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-foreground">
              <BriefcaseBusiness className="h-5 w-5 text-muted-foreground" /> Experience
            </h2>
            {isOwner && (
              <Link
                to="/app/profile/edit"
                hash="experience"
                className="flex h-8 items-center gap-1 rounded-full px-2.5 text-[13.5px] font-semibold text-accent hover:bg-accent/10"
              >
                <Plus className="h-4 w-4" /> {experiences.length ? "Edit" : "Add"}
              </Link>
            )}
          </div>
          {experiences.length === 0 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Add the roles you've held, so people (and your portfolio) can see where you've worked.
            </p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-border/70">
                {shownExp.map((exp) => (
                  <ExperienceRow key={exp.id} exp={exp} />
                ))}
              </ul>
              {experiences.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllExp((v) => !v)}
                  className="mt-1 text-[14px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  {showAllExp ? "Show fewer" : `Show all ${experiences.length}`}
                </button>
              )}
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Added by {isOwner ? "you" : "them"}
              </p>
            </>
          )}
        </section>
      )}

      {(certificates.length > 0 || isOwner) && (
        <section className="mt-2 bg-card px-4 py-4 md:rounded-xl md:border md:border-border">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-foreground">
              <Award className="h-5 w-5 text-muted-foreground" /> Licenses & certifications
            </h2>
            {isOwner && (
              <Link
                to="/app/profile/edit"
                hash="certificates"
                className="flex h-8 items-center gap-1 rounded-full px-2.5 text-[13.5px] font-semibold text-accent hover:bg-accent/10"
              >
                <Plus className="h-4 w-4" /> {certificates.length ? "Edit" : "Add"}
              </Link>
            )}
          </div>
          {certificates.length === 0 ? (
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Add certificates you've earned elsewhere, with a link so anyone can check them.
            </p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-border/70">
                {certificates.map((cert) => (
                  <li key={cert.id} className="flex gap-3.5 py-3.5 first:pt-1">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]">
                      <Award className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold leading-snug text-foreground">
                        {cert.name}
                      </p>
                      <p className="text-[14px] text-foreground/85">{cert.issuer}</p>
                      {(cert.issued_on || cert.expires_on) && (
                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                          {cert.issued_on ? `Issued ${monthYear(cert.issued_on)}` : ""}
                          {cert.expires_on ? ` · Expires ${monthYear(cert.expires_on)}` : ""}
                        </p>
                      )}
                      {cert.credential_id && (
                        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                          Credential ID {cert.credential_id}
                        </p>
                      )}
                      {cert.credential_url && (
                        <a
                          href={cert.credential_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/20 px-3 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.04]"
                        >
                          Show credential <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Added by {isOwner ? "you" : "them"}. Zero Club bootcamps are shown separately as
                verified.
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
