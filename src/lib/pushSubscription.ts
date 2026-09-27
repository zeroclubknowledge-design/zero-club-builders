/**
 * Phone notifications (Web Push).
 *
 * The pipeline behind this already existed — the service worker shows the
 * notification, a database trigger calls the send-push function for every new
 * message and notification — but a phone only ever received anything if its
 * owner had found Settings → Notifications and flipped the switch. Almost
 * nobody had, so almost nobody got a notification with the app closed.
 *
 * This module is the one place that subscribes a device and records it, used
 * by the settings switch, by the "Turn on notifications" prompt, and by a
 * silent re-sync on every launch so a reinstall or a rotated endpoint never
 * leaves the database pointing at a dead subscription.
 */
import { supabase } from "@/lib/supabase";
import { vapidApplicationServerKey, vapidKeyProblem } from "@/lib/webPush";

export function supportsWebPush() {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

/** The app's service worker, registered the same way __root.tsx registers it. */
export async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active) return existing;

  const registration = existing || (await navigator.serviceWorker.register("/sw.js"));
  if (registration.active) return registration;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Zero Club is still preparing notifications. Reopen the app and try again.")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

const toBase64 = (buffer: ArrayBuffer | null) =>
  buffer ? btoa(String.fromCharCode(...new Uint8Array(buffer))) : "";

async function saveSubscription(subscription: PushSubscription, profileId: string) {
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profileId,
      endpoint: subscription.endpoint,
      p256dh_key: toBase64(subscription.getKey("p256dh")),
      auth_key: toBase64(subscription.getKey("auth")),
    },
    { onConflict: "profile_id, endpoint" },
  );
  if (error) throw error;
}

async function currentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

async function subscribeAndSave(profileId: string) {
  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidApplicationServerKey() as BufferSource,
    });
  }
  await saveSubscription(subscription, profileId);
}

/**
 * Ask for permission (when needed) and switch this device on.
 * Must be called from a tap: phones only show the permission dialog in
 * response to one.
 */
export async function enablePush(): Promise<"enabled" | "denied"> {
  if (!supportsWebPush()) throw new Error("This browser can't receive notifications.");

  // Checked before asking. Prompting and then failing on a misconfigured key
  // spends a permission request that the phone only grants once.
  const keyProblem = vapidKeyProblem();
  if (keyProblem) throw new Error(keyProblem);

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const profileId = await currentUserId();
  if (!profileId) throw new Error("Sign in again to finish turning on notifications.");
  await subscribeAndSave(profileId);
  return "enabled";
}

/** Switch this device off for the signed-in account. */
export async function disablePush() {
  const registration = await getPushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const profileId = await currentUserId();
  if (profileId) {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", profileId)
      .eq("endpoint", subscription.endpoint);
    if (error) throw error;
  }
  await subscription.unsubscribe();
}

/** Whether this device is currently switched on. */
export async function isPushEnabled() {
  if (!supportsWebPush() || Notification.permission !== "granted") return false;
  const registration = await getPushRegistration();
  return Boolean(await registration.pushManager.getSubscription());
}

/**
 * Runs on launch. When permission was already given, make sure this device is
 * subscribed and recorded against whoever is signed in now. Never prompts.
 */
export async function syncPushSubscription(profileId: string) {
  if (!supportsWebPush() || Notification.permission !== "granted" || vapidKeyProblem()) return;
  try {
    await subscribeAndSave(profileId);
  } catch (error) {
    console.warn("Could not refresh this device's notification subscription:", error);
  }
}

/**
 * Before signing out: stop this phone receiving the leaving account's
 * messages. The browser subscription itself stays, so the next account to
 * sign in on this device picks it up without being asked again.
 */
export async function forgetPushSubscription(profileId: string) {
  if (!supportsWebPush()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await supabase.from("push_subscriptions").delete().eq("profile_id", profileId).eq("endpoint", subscription.endpoint);
  } catch {
    /* Signing out must never fail because of this. */
  }
}
