import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Smartphone, Settings2, Loader2 } from "@/components/icons/glyphs";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { vapidKeyProblem, vapidApplicationServerKey } from "@/lib/webPush";


export const Route = createFileRoute("/app/settings/notifications")({
  component: NotificationsSettings,
});

function supportsWebPush() {
  return window.isSecureContext
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

async function getPushRegistration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active) return existing;

  const registration = existing || await navigator.serviceWorker.register('/sw.js', { type: 'module' });
  if (registration.active) return registration;

  let timeoutId: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Zero Club is still preparing notifications. Refresh the app and try again.")), 8000);
      })
    ]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

function NotificationsSettings() {
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState("Get instant alerts for messages and activity");

  useEffect(() => {
    if (!supportsWebPush()) {
      setPushStatus(window.isSecureContext ? "Push notifications are not supported on this browser" : "Push notifications require the secure deployed app");
      return;
    }

    let cancelled = false;
    void getPushRegistration()
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled) return;
        const enabled = Notification.permission === 'granted' && Boolean(subscription);
        setIsPushEnabled(enabled);
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

      if (isPushEnabled) {
        setPushStatus("Turning off notifications...");
        const registration = await getPushRegistration();
        const existingSubscription = await registration.pushManager.getSubscription();
        const { data: { session } } = await supabase.auth.getSession();

        if (!existingSubscription) {
          setIsPushEnabled(false);
          setPushStatus("Get instant alerts for messages and activity");
          return;
        }

        if (session) {
          const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('profile_id', session.user.id)
            .eq('endpoint', existingSubscription.endpoint);
          if (error) throw error;
        }
        await existingSubscription.unsubscribe();
        setIsPushEnabled(false);
        setPushStatus("Get instant alerts for messages and activity");
        toast.success("Push notifications disabled on this device.");
        return;
      }

      // Checked before asking for permission. Prompting someone and then
      // failing on a misconfigured key spends a permission request that
      // browsers only grant once.
      const keyProblem = vapidKeyProblem();
      if (keyProblem) throw new Error(keyProblem);

      setPushStatus("Waiting for browser permission...");
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      
      if (permission !== 'granted') {
        setPushStatus("Permission is blocked in your browser settings");
        toast.error("Notification permission is blocked. Allow it in your browser settings, then try again.");
        return;
      }

      setPushStatus("Connecting this device...");
      const [registration, sessionResult] = await Promise.all([
        getPushRegistration(),
        supabase.auth.getSession()
      ]);
      const { data: { session } } = sessionResult;
      let existingSubscription = await registration.pushManager.getSubscription();
      let subscription = existingSubscription;

      if (!subscription) {
        // Cannot be undefined here — vapidKeyProblem() already threw above if
        // the key was unusable — but the cast keeps that guarantee explicit.
        const applicationServerKey = vapidApplicationServerKey() as BufferSource;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      // Save to Supabase
      if (session && subscription) {
        const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')!) as unknown as number[]));
        const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')!) as unknown as number[]));

        const { error } = await supabase.from('push_subscriptions').upsert({
          profile_id: session.user.id,
          endpoint: subscription.endpoint,
          p256dh_key: p256dh,
          auth_key: auth
        }, { onConflict: 'profile_id, endpoint' });

        if (error) throw error;
        toast.success("Push notifications enabled on this device.");
        setIsPushEnabled(true);
        setPushStatus("Enabled on this device. Tap to turn off.");
      } else if (!session) {
        throw new Error("Sign in again to finish enabling push notifications.");
      }
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
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <Link to="/app/settings" aria-label="Back to settings" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </Link>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">Notifications</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <h2 className={SECTION_TITLE}>Push notifications</h2>
          <div className="flex items-center gap-3.5 border-t border-border/60 px-4 py-3.5">
            <Smartphone className={`h-5 w-5 shrink-0 ${isPushEnabled ? "text-[#1a7f4b]" : "text-foreground"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-foreground">On this device</p>
              <p className="text-[13px] text-muted-foreground">{pushStatus}</p>
            </div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Switch checked={isPushEnabled} onCheckedChange={() => void handlePushToggle()} aria-label="Push notifications on this device" />
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
