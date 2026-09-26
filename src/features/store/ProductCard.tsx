import type { ReactNode } from "react";
import { typeLabelFor } from "./catalogue";

/**
 * A listing, shown the way a shop shows one: a square cover, the name, who
 * made it, and the price last.
 *
 * Most listings have no cover yet, and an empty tinted block made the shop
 * look unfinished. Without a cover the card sets the product's own name as
 * its cover, on ink or on a pink tint depending on the listing, so every card
 * still reads as a product rather than a placeholder.
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
  const dark = String(item?.id || item?.name || "").length % 2 === 0;

  return (
    <article
      onClick={onClick}
      className={`group flex min-w-0 flex-col ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-foreground/[0.05]">
        {item?.cover_url ? (
          <img
            src={item.cover_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className={`flex h-full w-full flex-col justify-between p-3.5 ${dark ? "bg-[#221d22] text-white" : "bg-accent/[0.08] text-foreground"}`}>
            <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${dark ? "text-[#f28fd0]" : "text-accent"}`}>{label}</span>
            <span className="line-clamp-4 font-display text-[19px] font-semibold leading-[1.1] tracking-[-0.01em]">{item?.name}</span>
          </div>
        )}
        {item?.cover_url && (
          <span className="absolute left-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold text-foreground">{label}</span>
        )}
        {item?.badge && (
          <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">{item.badge}</span>
        )}
      </div>

      <h3 className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug tracking-normal text-foreground [font-family:inherit] group-hover:underline">
        {item?.name}
      </h3>
      {seller && <div className="mt-0.5 min-w-0">{seller}</div>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0">{price}</div>
        {action}
      </div>
    </article>
  );
}
