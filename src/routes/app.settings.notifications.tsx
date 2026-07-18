import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Bell, Mail, Smartphone, Settings2, ChevronRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

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

// Helper function to convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function NotificationsSettings() {
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ('Notification' in window && 'serviceWorker' in navigator) {
      setIsPushEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handlePushToggle = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      toast.error("Push notifications are not supported on this browser.");
      return;
    }

    try {
      setLoading(true);
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        toast.error("Permission denied for push notifications.");
        setLoading(false);
        return;
      }

      // If granted, let's subscribe to the PushManager
      const registration = await navigator.serviceWorker.ready;
      
      // Get the existing subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // We need the VAPID public key. If the user hasn't set it in .env, we show a helpful error.
        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          toast.error("Push setup incomplete. Missing VITE_VAPID_PUBLIC_KEY in .env");
          setLoading(false);
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
      }

      // Save to Supabase
      const { data: { session } } = await supabase.auth.getSession();
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
        toast.success("Push notifications enabled!");
        setIsPushEnabled(true);
      }
    } catch (err: any) {
      console.error(err);
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
          desc: isPushEnabled ? "Enabled on this device" : "Choose which notifications you want on your device", 
          action: handlePushToggle,
          rightElement: isPushEnabled ? <Check className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
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
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
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
