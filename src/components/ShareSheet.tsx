import { useEffect, useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Link2, Mail, MessageSquare, Share2 } from "@/components/icons/glyphs";
import { ZERO_MARK_PATH } from "@/components/ZeroLoader";
import { copyToClipboard } from "@/lib/share";
import {
  rewardWhenSharedToLinkedIn,
  linkedInRewardFor,
  linkedInShareText,
  linkedInUrl,
  openLinkedInComposer,
  type LinkedInPayload,
} from "@/lib/linkedinShare";

/**
 * Zero Club's own share sheet, instead of the phone's.
 *
 * Call openShareSheet() from anywhere. The sheet is mounted once at the root
 * of the app. "Share via" still hands off to the system sheet where one exists,
 * for apps we don't list.
 */

export type ShareRequest = {
  url: string;
  title?: string;
  text?: string;
  /** The sheet's heading, e.g. "Share Ada's post". */
  heading?: string;
  /** Posts and projects: share half the post to LinkedIn with a read-more link. */
  linkedin?: LinkedInPayload;
};

const listeners = new Set<(request: ShareRequest) => void>();

/** True in the browser: the custom sheet is always available. */
export function hasShareSheet() {
  return typeof window !== "undefined";
}

/** Open the Zero Club share sheet. Resolves straight away. */
export async function openShareSheet(request: ShareRequest): Promise<void> {
  if (listeners.size === 0) {
    // Not mounted (shouldn't happen): fall back to copying.
    await copyToClipboard(request.url);
    return;
  }
  listeners.forEach((listener) => listener(request));
}

/* ── Brand marks for the targets (simple, recognisable glyphs) ─────────── */

const WhatsAppGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-7 w-7"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2Z" />
    <path
      d="M9.1 8.3c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.4.7 1 1.4 1.7 1.9.6.4 1 .6 1.2.7.2.1.4 0 .5-.1l.7-.8c.2-.2.3-.2.6-.1l1.6.8c.2.1.4.2.4.4 0 .6-.2 1.2-.7 1.5-.5.4-1.2.6-1.9.5-1-.2-2.4-.8-3.7-2-1.4-1.3-2.2-2.7-2.4-3.6-.2-.9 0-1.6.4-2.1Z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);
const XGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor">
    <path d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.5h2L6.5 3.2H4.3l13.3 17.5Z" />
  </svg>
);
const LinkedInGlyph = ({ className = "h-[22px] w-[22px]" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M5.3 8.4h3.1V19H5.3V8.4Zm1.6-5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6ZM10.3 8.4h3v1.5c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V19h-3.1v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V19h-3.2V8.4Z" />
  </svg>
);
const TelegramGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
    <path d="M20.7 4.3 2.9 11.2c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.8 5.5c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.5.2 1.7-.8l3.1-14.5c.3-1.3-.5-1.9-1.8-1.6ZM8.4 13.8l9.6-6.1c.5-.3.9-.1.5.2l-8 7.3-.3 3.3-1.8-4.7Z" />
  </svg>
);

type Target = {
  key: string;
  label: string;
  icon: ReactNode;
  className: string;
  onPick: (r: ShareRequest) => void | Promise<void>;
};

const enc = encodeURIComponent;
const message = (r: ShareRequest) => [r.text, r.url].filter(Boolean).join("\n\n");
const openOut = (href: string) => {
  window.open(href, "_blank", "noopener,noreferrer");
};

function buildTargets(canNativeShare: boolean): Target[] {
  const targets: Target[] = [];
  if (canNativeShare) {
    targets.push({
      key: "native",
      label: "Share via",
      icon: <Share2 className="h-6 w-6" />,
      className: "bg-foreground/[0.06] text-foreground",
      onPick: async (r) => {
        try {
          await navigator.share({ title: r.title, text: r.text, url: r.url });
        } catch {
          /* dismissed */
        }
      },
    });
  }
  targets.push(
    {
      key: "copy",
      label: "Copy link",
      icon: <Link2 className="h-6 w-6" />,
      className: "bg-foreground/[0.06] text-foreground",
      onPick: (r) => void copyToClipboard(r.url, "Link copied"),
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <WhatsAppGlyph />,
      className: "bg-[#25D366] text-white",
      onPick: (r) => openOut(`https://wa.me/?text=${enc(message(r))}`),
    },
    {
      key: "x",
      label: "X",
      icon: <XGlyph />,
      className: "bg-black text-white ring-1 ring-white/10",
      onPick: (r) =>
        openOut(`https://x.com/intent/post?text=${enc(r.text || r.title || "")}&url=${enc(r.url)}`),
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      icon: <LinkedInGlyph />,
      className: "bg-[#0A66C2] text-white",
      onPick: async (r) => {
        if (!r.linkedin) {
          openOut(`https://www.linkedin.com/sharing/share-offsite/?url=${enc(r.url)}`);
          return;
        }
        // Half the post, then "Continue reading here" and the link back.
        const shared = await openLinkedInComposer(
          linkedInShareText(r.linkedin, linkedInUrl(r.url)),
        );
        // ZP is paid once they've posted on LinkedIn and come back, not on the tap.
        if (shared) rewardWhenSharedToLinkedIn(r.linkedin);
      },
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: <TelegramGlyph />,
      className: "bg-[#229ED9] text-white",
      onPick: (r) =>
        openOut(`https://t.me/share/url?url=${enc(r.url)}&text=${enc(r.text || r.title || "")}`),
    },
    {
      key: "sms",
      label: "Messages",
      icon: <MessageSquare className="h-6 w-6" />,
      className: "bg-[#34C759] text-white",
      onPick: (r) => {
        window.location.href = `sms:?&body=${enc(message(r))}`;
      },
    },
    {
      key: "email",
      label: "Email",
      icon: <Mail className="h-6 w-6" />,
      className: "bg-foreground/[0.06] text-foreground",
      onPick: (r) => {
        window.location.href = `mailto:?subject=${enc(r.title || "Shared from Zero Club")}&body=${enc(message(r))}`;
      },
    },
  );
  return targets;
}

function displayHost(url: string) {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

/** Mounted once at the root. */
export function ShareSheetHost() {
  const [request, setRequest] = useState<ShareRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    const listener = (next: ShareRequest) => {
      setRequest(next);
      setOpen(true);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const targets = buildTargets(canNativeShare);
  const pick = async (target: Target) => {
    if (!request) return;
    setOpen(false);
    // Let the sheet start closing before handing off to another app.
    await new Promise((r) =>
      setTimeout(r, target.key === "native" || target.key === "linkedin" ? 180 : 60),
    );
    await target.onPick(request);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent
        hideClose
        className="zc-share-sheet overflow-hidden rounded-t-[22px] border-border/40 bg-card pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        {/* The Zero Club mark, large and faint, behind the sheet's content. */}
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="zc-share-mark pointer-events-none absolute -right-10 -top-6 h-56 w-56 text-[#cc208f]"
        >
          <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
        </svg>

        <div className="relative px-5 pt-1">
          <DrawerTitle className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
            {request?.heading || "Share"}
          </DrawerTitle>
          {request && (
            <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{displayHost(request.url)}</span>
            </p>
          )}
          {request?.linkedin && linkedInRewardFor(request.linkedin) > 0 && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0A66C2]/10 px-3 py-1 text-[12.5px] font-semibold text-[#0A66C2] dark:text-[#5aa2ec]">
              <LinkedInGlyph className="h-4 w-4" />
              Share to LinkedIn and earn {linkedInRewardFor(request.linkedin)} ZP
            </p>
          )}
        </div>

        <div className="no-scrollbar relative mt-5 flex gap-1 overflow-x-auto px-3 pb-1">
          {targets.map((target) => (
            <button
              key={target.key}
              type="button"
              onClick={() => void pick(target)}
              className="group flex w-[76px] shrink-0 flex-col items-center gap-2 rounded-2xl py-1.5 tap"
            >
              <span
                className={`grid h-[58px] w-[58px] place-items-center rounded-full shadow-[0_6px_16px_-10px_rgba(0,0,0,0.45)] transition-transform duration-150 group-active:scale-90 ${target.className}`}
              >
                {target.icon}
              </span>
              <span className="w-full truncate text-center text-[12.5px] font-medium text-foreground/85">
                {target.label}
              </span>
            </button>
          ))}
        </div>

        <div className="relative mx-5 mt-4 flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
          <svg viewBox="0 0 100 100" className="h-3 w-3 text-[#cc208f]" aria-hidden="true">
            <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
          </svg>
          Shared from Zero Club
        </div>
      </DrawerContent>
    </Drawer>
  );
}
