import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

type Preview = { url: string; title: string | null; description: string | null; image: string | null; siteName: string | null; favicon: string | null };

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\b(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"')\]]*/i;

/** The first web link in a message, or null. Media tokens are ignored. */
export function firstLink(text?: string | null) {
  if (!text) return null;
  const plain = text.split("$$MEDIA$$")[0];
  const m = plain.match(URL_RE);
  if (!m) return null;
  const raw = m[0].replace(/[.,!?;:]+$/, "");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

async function fetchPreview(url: string): Promise<Preview | null> {
  const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { preview: Preview | null };
  return body.preview;
}

/**
 * A rich card for the first link in a message: the site's own preview image,
 * title and description, the way WhatsApp and iMessage show them. Renders
 * nothing while loading or when the site has no preview.
 */
export function LinkPreview({ text, mine = false, className = "" }: { text?: string | null; mine?: boolean; className?: string }) {
  const url = firstLink(text);
  const navigate = useNavigate();
  const [imageFailed, setImageFailed] = useState(false);
  const { data } = useQuery({
    queryKey: ["link-preview", url],
    queryFn: () => fetchPreview(url!),
    enabled: Boolean(url),
    staleTime: 24 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: false,
  });
  if (!url || !data || (!data.title && !data.image)) return null;

  let host = "";
  try { host = new URL(data.url).hostname.replace(/^www\./, ""); } catch { /* keep empty */ }
  const internal = typeof window !== "undefined" && (() => {
    try { return new URL(url).origin === window.location.origin; } catch { return false; }
  })();

  return (
    <a
      href={url}
      target={internal ? undefined : "_blank"}
      rel="noreferrer noopener"
      onClick={(e) => {
        e.stopPropagation();
        if (internal) {
          e.preventDefault();
          const u = new URL(url);
          navigate({ to: u.pathname + u.search as any });
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`mt-1.5 block w-[min(72vw,300px)] overflow-hidden rounded-[14px] text-left transition active:scale-[0.99] ${
        mine ? "bg-white/15 ring-1 ring-white/20" : "bg-card ring-1 ring-foreground/[0.08]"
      } ${className}`}
    >
      {data.image && !imageFailed && (
        <img
          src={data.image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="aspect-[1.91/1] w-full bg-foreground/[0.06] object-cover"
        />
      )}
      <span className="block px-3 py-2.5">
        <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
          {data.favicon && <img src={data.favicon} alt="" className="h-3.5 w-3.5 rounded-sm" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
          <span className="truncate">{data.siteName || host}</span>
        </span>
        {data.title && <span className={`mt-0.5 line-clamp-2 block text-[14px] font-semibold leading-snug ${mine ? "text-white" : "text-foreground"}`}>{data.title}</span>}
        {data.description && <span className={`mt-0.5 line-clamp-2 block text-[12.5px] leading-snug ${mine ? "text-white/75" : "text-muted-foreground"}`}>{data.description}</span>}
      </span>
    </a>
  );
}
