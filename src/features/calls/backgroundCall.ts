import { useEffect, useRef } from "react";

/**
 * Staying heard when the app is minimised during a call.
 *
 * On Android the app is Chrome showing our site (a Trusted Web Activity).
 * A few seconds after Chrome goes to the background, Android stops giving it
 * microphone sound unless an app holds a "microphone" foreground service.
 * The button still says "unmuted", but everyone else hears silence.
 *
 * Three pieces deal with that:
 *
 *  1. useOngoingCallNotification: while a call is up, an "Ongoing call"
 *     notification is shown through the service worker with the tag below.
 *     Chrome hands it to the Android app's DelegationService, which starts a
 *     microphone foreground service (android/native/CallForegroundService.java).
 *     Chrome is bound to the app with BIND_INCLUDE_CAPABILITIES, so it keeps
 *     the microphone while that service runs. Closing the notification (call
 *     ended) stops the service. The notification is re-shown every minute so
 *     the service can stop on its own if the page ever disappears.
 *
 *  2. useMicRecovery: coming back to the app, a microphone that Android ended
 *     or left muted is reopened at once, so nobody has to tap "restart mic".
 *
 *  3. The "away" flag in callSignals (presence), so others see that someone
 *     has the app in the background instead of wondering why they went quiet.
 */

export const ONGOING_CALL_TAG = "zc-ongoing-call";
const REFRESH_MS = 60_000;

const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

async function closeOngoingCallNotifications() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const open = (await registration?.getNotifications({ tag: ONGOING_CALL_TAG })) || [];
    open.forEach((notification) => notification.close());
  } catch {
    /* No service worker: nothing was shown. */
  }
}

/** Shows the "Ongoing call" notification for as long as `active` is true (Android only). */
export function useOngoingCallNotification({ active, title, body, url }: { active: boolean; title: string; body?: string; url: string }) {
  const latest = useRef({ title, body, url });
  latest.current = { title, body, url };

  useEffect(() => {
    if (!active || !isAndroid() || typeof Notification === "undefined" || !("serviceWorker" in navigator)) return;
    let stopped = false;

    const show = async () => {
      if (stopped || Notification.permission !== "granted") return;
      try {
        const registration = await navigator.serviceWorker.ready;
        if (stopped) return;
        const { title: heading, body: text, url: target } = latest.current;
        await registration.showNotification(heading, {
          tag: ONGOING_CALL_TAG,
          body: text || "Ongoing call · tap to return",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-monochrome-512.png",
          silent: true,
          requireInteraction: true,
          data: { url: target, ongoingCall: true },
        } as NotificationOptions);
      } catch {
        /* Notifications blocked or unavailable: the call still works in the foreground. */
      }
    };

    void show();
    const timer = window.setInterval(() => { void show(); }, REFRESH_MS);
    const onPageHide = () => { void closeOngoingCallNotifications(); };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      void closeOngoingCallNotifications();
    };
  }, [active]);
}

type MicTrack = {
  getMediaStreamTrack?: () => MediaStreamTrack | undefined;
  setEnabled: (enabled: boolean) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
} | null | undefined;

/** Reopens a microphone that the background ended or left muted, as soon as the app is back. */
export function useMicRecovery(track: MicTrack, micOn: boolean, onRecovered?: () => void) {
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;

  useEffect(() => {
    if (!track) return;
    let timer: number | undefined;
    let busy = false;

    const check = async () => {
      if (busy || !micOn || document.visibilityState !== "visible") return;
      const media = track.getMediaStreamTrack?.();
      const broken = !media || media.readyState === "ended" || media.muted;
      if (!broken) return;
      busy = true;
      try {
        await track.setEnabled(false);
        await track.setEnabled(true);
        await track.setMuted(false);
        onRecoveredRef.current?.();
      } catch (error) {
        console.warn("Could not reopen the microphone after the app was in the background", error);
      } finally {
        busy = false;
      }
    };

    const onVisibility = () => {
      window.clearTimeout(timer);
      // Give the system a moment: a mic that only paused unmutes by itself.
      if (document.visibilityState === "visible") timer = window.setTimeout(() => { void check(); }, 1200);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [track, micOn]);
}
