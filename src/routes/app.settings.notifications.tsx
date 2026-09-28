import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Smartphone, Settings2, Loader2 } from "@/components/icons/glyphs";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, isPushEnabled, supportsWebPush } from "@/lib/pushSubscription";

export const Route = createFileRoute("/app/settings/notifications")({
  component: NotificationsSettings,
});

function NotificationsSettings() {
  const [pushOn, setPushOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState("Get instant alerts for messages and activity");

  useEffect(() => {
    if (!supportsWebPush()) {
      setPushStatus(window.isSecureContext ? "Push notifications are not supported on this browser" : "Push notifications require the secure deployed app");
      return;
    }

    let cancelled = false;
    void isPushEnabled()
      .then((enabled) => {
        if (cancelled) return;
        setPushOn(enabled);
        setPushStatus(enabled ? "Enabled on this device. Tap to turn off." : "Get instant alerts for messages and activity");
      })
      .catch(() => {
        if (!cancelled) setPushStatus("Tap to finish setting up notifications");
      });

    return () => { cancelled = true; };
  }, []);

  const handlePushToggle = async () => {
    if (!supportsWebPush()) {
      toast.error("Push notifications are not supported on this browser.");
      return;
    }

    try {
      setLoading(true);

      if (pushOn) {
        setPushStatus("Turning off notifications...");
        await disablePush();
        setPushOn(false);
        setPushStatus("Get instant alerts for messages and activity");
        toast.success("Push notifications disabled on this device.");
        return;
      }

      setPushStatus("Waiting for permission...");
      const result = await enablePush();
      if (result === "denied") {
        setPushStatus("Permission is blocked in your phone settings");
        toast.error("Notification permission is blocked. Allow it for Zero Club in your phone settings, then try again.");
        return;
      }
      toast.success("Push notifications enabled on this device.");
      setPushOn(true);
      setPushStatus("Enabled on this device. Tap to turn off.");
    } catch (err: any) {
      console.error(err);
      setPushStatus(err.message || "Could not enable notifications");
      toast.error(err.message || "Failed to enable push notifications.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-50 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <Link to="/app/settings" aria-label="Back to settings" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </Link>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">Notifications</h1>
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <h2 className={SECTION_TITLE}>Push notifications</h2>
          <div className="flex items-center gap-3.5 border-t border-border/60 px-4 py-3.5">
            <Smartphone className={`h-5 w-5 shrink-0 ${pushOn ? "text-[#1a7f4b]" : "text-foreground"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-foreground">On this device</p>
              <p className="text-[13px] text-muted-foreground">{pushStatus}</p>
            </div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch checked={pushOn} onCheckedChange={() => void handlePushToggle()} aria-label="Push notifications on this device" />
            )}
          </div>
          <p className="border-t border-border/60 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
            Covers messages, mentions, replies, new followers, club live classes and wallet activity. Each phone or computer is switched on separately.
          </p>
        </section>

        {/* Not wired to anything yet, so they say so instead of looking like
            settings that silently do nothing. */}
        <section className="flex-1 bg-card pb-28 md:flex-none md:overflow-hidden md:rounded-xl md:border md:border-border md:pb-0">
          <h2 className={SECTION_TITLE}>More controls</h2>
          {[
            { icon: Settings2, label: "Quality filter", desc: "Hide lower-quality content from your notifications" },
            { icon: Mail, label: "Email notifications", desc: "Choose which notifications reach your inbox" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3.5 border-t border-border/60 px-4 py-3.5">
              <item.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-foreground">{item.label}</p>
                <p className="text-[13px] text-muted-foreground">{item.desc}</p>
              </div>
              <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[12px] font-semibold text-muted-foreground">Soon</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

const SECTION_TITLE = "px-4 pb-2 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground";
