import type { ReactNode } from "react";
import { Hash, Lock } from "@/components/icons/solar";

/**
 * A club, presented the way a club actually gets chosen.
 *
 * The old cards led with a small round logo on a plain panel, which gave every
 * club the same silhouette and left the one image a club owner had actually
 * designed — the banner — unused on this page. People pick a community by
 * looking at it, so the banner leads, and the logo returns to what it is good
 * at: identifying the club once you are already reading its name.
 *
 * The order below is the order the question gets asked. What is this? Who runs
 * it? What is it about? What does it cost?
 */

type ClubCardProps = {
  club: any;
  /** Small label over the banner: MEMBER, FEATURED, and so on. */
  badge?: ReactNode;
  badgeClassName?: string;
  /** The line under the description. Members and price, usually. */
  meta?: ReactNode;
  /** Shown beside the name — a verified tick, an "Ended" pill. */
  nameSuffix?: ReactNode;
  className?: string;
};

export function ClubCard({
  club,
  badge,
  badgeClassName = "bg-[#171218] text-[#f8f1e7]",
  meta,
  nameSuffix,
  className,
}: ClubCardProps) {
  /*
   * The banner as the club set it, and only the banner. Falling back to the
   * logo here would stretch a small square across the whole header and look
   * like a mistake; a club without a banner is better served by a clean tint.
   */
  const banner = club?.banner_url || null;
  const logo = club?.logo_url || club?.banner_url || null;

  return (
    <article
      className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition hover:border-primary/30 ${className || ""}`}
    >
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-gradient-to-br from-primary/15 via-accent/20 to-background">
        {banner ? (
          <img
            src={banner}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-primary/40">
            <Hash className="h-9 w-9" />
          </span>
        )}

        {badge && (
          <span
            className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] ${badgeClassName}`}
          >
            {badge}
          </span>
        )}

        {club?.is_private && (
          <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md">
            <Lock className="h-3 w-3" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/50 bg-accent/25">
            {logo ? (
              <img src={logo} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <Hash className="h-4 w-4 text-primary/70" />
            )}
          </span>
          <h3 className="flex min-w-0 items-center gap-1.5 text-[14.5px] font-semibold tracking-tight text-foreground">
            <span className="truncate">{club?.name}</span>
            {nameSuffix}
          </h3>
        </div>

        <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-[1.5] text-muted-foreground">
          {club?.description || "A place to learn and build together."}
        </p>

        {/* mt-auto so the meta line sits on the bottom edge whatever length the
            description runs to, and a row of cards stays aligned. */}
        {meta && <div className="mt-auto pt-3 text-[12.5px] font-semibold text-foreground">{meta}</div>}
      </div>
    </article>
  );
}
