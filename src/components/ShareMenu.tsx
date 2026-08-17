import { useEffect, useRef, useState } from "react";
import { Copy, Mail, MessageCircle, Send, Share2, X } from "lucide-react";
import { copyToClipboard } from "@/lib/share";

/**
 * A share menu that does not depend on the browser having one.
 *
 * navigator.share is the nicest option where it exists, but it is not
 * dependable: Firefox on Android has no support at all, some in-app browsers
 * expose it and then reject the call, and any rejection is indistinguishable
 * from the person simply dismissing the sheet. The old behaviour was to fall
 * back to copying, which looks identical to a broken button — you press Share
 * and nothing appears to happen.
 *
 * So the system sheet is offered when it genuinely works, and this menu of
 * explicit targets is always available underneath it. Every entry is a plain
 * URL, so they behave the same in every browser on every platform.
 */

type ShareMenuProps = {
  url: string;
  text: string;
  title?: string;
  className?: string;
  label?: string;
};

export function ShareMenu({ url, text, title, className, label = "Share" }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onAway = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onAway);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const message = `${text} ${url}`;

  const targets = [
    {
      label: "WhatsApp",
      Icon: MessageCircle,
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
    },
    {
      label: "Telegram",
      Icon: Send,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
    {
      label: "X",
      Icon: Share2,
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
    {
      label: "Email",
      Icon: Mail,
      href: `mailto:?subject=${encodeURIComponent(title || "A Zero Club Gift for you")}&body=${encodeURIComponent(message)}`,
    },
  ];

  /*
   * Called straight from the click, with no await before it — navigator.share
   * requires transient user activation, and anything awaited first can lose it
   * and make the call throw for no visible reason.
   */
  const openSystemSheet = () => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      setOpen(true);
      return;
    }
    navigator
      .share({ title, text, url })
      .catch(() => {
        // Dismissed, unsupported target, or refused. Showing the menu is the
        // right answer to all three — it never leaves the button looking dead.
        setOpen(true);
      });
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={openSystemSheet}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
      >
        <Share2 className="h-3.5 w-3.5" /> {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-[210px] overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-[0_24px_54px_-24px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Share via
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close share menu"
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {targets.map(({ label: name, Icon, href }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent/50"
            >
              <Icon className="h-[15px] w-[15px] text-muted-foreground" />
              {name}
            </a>
          ))}

          <button
            onClick={() => {
              copyToClipboard(url, "Link copied");
              setOpen(false);
            }}
            role="menuitem"
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-border/60 px-2.5 pb-2 pt-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent/50"
          >
            <Copy className="h-[15px] w-[15px] text-muted-foreground" />
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}
