import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Bell, Mail, Smartphone, Settings2, ChevronRight, Check, Loader2 } from "@/components/icons/solar";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { vapidKeyProblem, vapidApplicationServerKey } from "@/lib/webPush";

type NotificationSettingsItem = {
  icon: typeof Bell;
  label: string;
  desc: string;
  action: (() => void | Promise<void>) | null;
  rightElement?: ReactNode;
};

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

  const sections: { title: string; items: NotificationSettingsItem[] }[] = [
    {
      title: "Filters",
      items: [
        { icon: Settings2, label: "Quality filter", desc: "Filter lower-quality content from your notifications", action: null },
      ]
    },
    {
      title: "Preferences",
      items: [
        { 
          icon: Smartphone, 
          label: "Push notifications", 
          desc: pushStatus,
          action: handlePushToggle,
          rightElement: loading
            ? <Loader2 className="mt-1 h-4 w-4 animate-spin text-primary" />
            : isPushEnabled
              ? <Check className="h-4 w-4 text-primary" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
        },
        { 
          icon: Mail, 
          label: "Email notifications", 
          desc: "Choose which notifications you want in your inbox", 
          action: null,
          rightElement: <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
        },
      ]
    }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center">
        <Link to="/app/settings" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Notifications</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {sections.map((section) => (
          <div key={section.title} className="mt-4">
            <h2 className="px-5 py-3 text-sm text-muted-foreground">{section.title}</h2>
            <div className="flex flex-col border-b border-border">
              {section.items.map((item) => (
                <button 
                  type="button"
                  key={item.label} 
                  onClick={item.action || undefined}
                  disabled={loading && item.label === "Push notifications"}
                  className={`flex items-start gap-5 px-5 py-4 transition active:bg-accent/10 text-left group ${loading && item.label ==="Push notifications" ? "opacity-50" : ""}`}
                >
                  <div className="mt-1 shrink-0">
                    <item.icon className={`h-5 w-5 ${isPushEnabled && item.label ==="Push notifications" ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[15px] font-bold text-foreground">{item.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                  {item.rightElement}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
