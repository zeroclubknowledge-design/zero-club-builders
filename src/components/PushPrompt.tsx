import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "@/components/icons/glyphs";
import { enablePush, supportsWebPush, syncPushSubscription } from "@/lib/pushSubscription";
import { vapidKeyProblem } from "@/lib/webPush";

const DISMISSED_KEY = "zc-push-prompt-dismissed-at";
const ASK_AGAIN_AFTER = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    return Date.now() - at < ASK_AGAIN_AFTER;
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    /* Private mode — the prompt simply returns next launch. */
  }
}

/**
 * Asks once, politely, to turn on phone notifications — the way WhatsApp or
 * Instagram do on first launch — and keeps an already-allowed device
 * subscribed. The system permission dialog can only be opened from a tap, so
 * this is a card with a button rather than an automatic prompt.
 */
export function PushPrompt({ userId, hidden }: { userId?: string; hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !supportsWebPush()) return;
    void syncPushSubscription(userId);

    if (Notification.permission !== "default" || vapidKeyProblem() || dismissedRecently()) return;
    // Let the first screen settle before asking for anything.
    const timer = window.setTimeout(() => setOpen(true), 4000);
    return () => window.clearTimeout(timer);
  }, [userId]);

  if (!open || hidden) return null;

  const close = () => {
    rememberDismissed();
    setOpen(false);
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === "enabled") {
        toast.success("Notifications are on for this phone.");
        setOpen(false);
      } else {
        toast.error("Notifications were not allowed. You can turn them on later in Settings → Notifications.");
        close();
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not turn on notifications.");
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Turn on notifications"
      className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-[420px] animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] md:bottom-6"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Not now"
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Turn on notifications</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            Get messages, mentions and replies on your phone, even when Zero Club is closed.
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={close}
          className="h-10 flex-1 rounded-full border border-foreground/25 text-[14px] font-semibold text-foreground"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => void turnOn()}
          disabled={busy}
          className="h-10 flex-1 rounded-full bg-foreground text-[14px] font-semibold text-background disabled:opacity-60"
        >
          {busy ? "Turning on…" : "Turn on"}
        </button>
      </div>
    </div>
  );
}
