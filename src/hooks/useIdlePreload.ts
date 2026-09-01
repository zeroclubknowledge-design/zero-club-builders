import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Fetch the code for the places people go next, while nothing else is happening.
 *
 * Every screen in the app is a separate file that is only downloaded when you
 * first open that screen. That keeps the initial download small, but it moves
 * the cost to the tap: press Clubs for the first time and the app has to go to
 * the network, wait for the file, parse it, and only then can it draw anything.
 * On a good connection that is a couple of hundred milliseconds. On a phone on
 * mobile data it is the pause people were describing as the app being slow.
 *
 * The router already preloads a destination when it can tell you are heading
 * there — but "can tell" means a mouse resting on a link. On a touchscreen the
 * gap between intent and tap is a few milliseconds, so in practice the phone
 * gets no head start at all, which is exactly where the wait was worst.
 *
 * So instead of waiting for a signal, this fetches the handful of destinations
 * that are one tap away — the bottom tabs and the menu card — once the app has
 * gone quiet. requestIdleCallback means it never competes with the first
 * render, and it yields between each one so a burst of downloads cannot make
 * the app janky while someone is reading. Each file is small and the browser
 * caches it, so by the time anyone taps, the screen is already there.
 *
 * Only routes are warmed, never their data: a preloaded route's loader is
 * cheap or absent for these paths, and anything genuinely live is fetched by
 * the screen itself when it mounts, so nothing here can serve a stale wallet
 * balance or an out-of-date message list.
 */

/** One tap away from anywhere in the app: the tab bar and the menu card. */
const PRIMARY_DESTINATIONS = [
  "/app",
  "/app/bootcamps",
  "/app/clubs",
  "/app/chat",
  "/app/notifications",
  "/app/wallet",
  "/app/tasks",
  "/app/quests",
  "/app/store",
  "/app/zerohub",
  "/app/notes",
  "/app/games",
  "/app/profile",
] as const;

type IdleHandle = number;

function onIdle(fn: () => void, timeout = 2000): IdleHandle {
  if (typeof window === "undefined") return 0;
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  return ric ? ric(fn, { timeout }) : window.setTimeout(fn, timeout);
}

function cancelIdle(handle: IdleHandle) {
  if (typeof window === "undefined" || !handle) return;
  const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
    .cancelIdleCallback;
  if (cic) cic(handle);
  else window.clearTimeout(handle);
}

export function useIdlePreload() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Someone on a metered or slow connection is better served by the bytes
    // they asked for than by bytes they might need. Both hints are advisory
    // and missing on some browsers, so the absence of the API means proceed.
    const connection = (
      navigator as unknown as {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData) return;
    if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return;

    let cancelled = false;
    let handle: IdleHandle = 0;
    let index = 0;

    const step = () => {
      if (cancelled || index >= PRIMARY_DESTINATIONS.length) return;
      const to = PRIMARY_DESTINATIONS[index++];
      // A destination that fails to preload is not a problem worth surfacing —
      // it just means the tap pays the download it would have paid anyway.
      void Promise.resolve(router.preloadRoute({ to })).catch(() => {});
      handle = onIdle(step);
    };

    handle = onIdle(step);

    return () => {
      cancelled = true;
      cancelIdle(handle);
    };
  }, [router]);
}
