import type { ReactNode } from "react";
import { Gift } from "@/components/icons/solar";
import { typeLabelFor } from "./catalogue";

/**
 * A listing, shown the way a shop shows one.
 *
 * The old card led with a 48px thumbnail beside two lines of text, which made
 * a template, an ebook and a Figma kit look identical — the only thing telling
 * them apart was a word in the corner. In a shop the picture is the product,
 * so the cover leads at full width and the price is the last thing read rather
 * than something tucked behind a rule.
 */

export function ProductCard({
  item,
  price,
  seller,
  action,
  onClick,
}: {
  item: any;
  /** Formatted by the caller: only it knows the wallet's currency. */
  price: ReactNode;
  seller?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
}) {
  const label = typeLabelFor(item?.category, item?.product_type);

  return (
    <article
      onClick={onClick}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-lift)] ${onClick ? "cursor-pointer active:scale-[0.99]" : ""}`}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-gradient-to-br from-primary/15 via-accent/20 to-background">
        {item?.cover_url ? (
          <img
            src={item.cover_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-primary/40">
            <Gift className="h-8 w-8" />
          </span>
        )}

        <span className="absolute left-2.5 top-2.5 rounded-full bg-background/90 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-foreground backdrop-blur-sm">
          {label}
        </span>

        {item?.badge && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-primary px-2 py-0.5 text-[9.5px] font-semibold text-primary-foreground">
            {item.badge}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <h3 className="line-clamp-1 text-[14px] font-semibold tracking-tight text-foreground">
          {item?.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-[12px] leading-[1.5] text-muted-foreground">
          {item?.description}
        </p>

        {seller && <div className="mt-2.5 min-w-0">{seller}</div>}

        {/* mt-auto so price and action land on the bottom edge whatever length
            the description runs to, and a row of cards stays aligned. */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="min-w-0">{price}</div>
          {action}
        </div>
      </div>
    </article>
  );
}
