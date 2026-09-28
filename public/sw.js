/*
 * Zero Club production service worker.
 *
 * This file is the worker shipped by the Vercel build. Updates deliberately
 * wait until the current app session closes, so a deploy cannot reload the app
 * while somebody is editing a profile or composing a Club.
 */

// Bump whenever navigation or shell behavior changes. Chrome keeps service
// worker caches longer than ordinary browser tabs, so a stable version here
// can leave an installed mobile app serving an old shell after a deployment.
const VERSION = "zc-v6-notification-taps";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const IMAGE_CACHE = `${VERSION}-images`;
const OFFLINE_URL = "/";
const SHELL_ASSETS = ["/", "/logo.png", "/manifest.webmanifest"];
const MAX_IMAGE_ENTRIES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

const isHashedAsset = (url) =>
  url.pathname.startsWith("/assets/") || /\.[0-9a-f]{8,}\.(js|css|woff2?)$/i.test(url.pathname);

const isImage = (request, url) =>
  request.destination === "image" || /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i.test(url.pathname);

const isFont = (request, url) =>
  request.destination === "font" || /\.(woff2?|ttf|otf)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match(OFFLINE_URL)) ||
            Response.error(),
        ),
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(ASSET_CACHE)
                .then((cache) => cache.put(request, copy))
                .catch(() => undefined);
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (isImage(request, url) || isFont(request, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
              trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES);
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Zero Club",
    body: "You have a new notification",
    url: "/app/notifications",
  };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  /* The count on the launcher icon.
   *
   * setAppBadge was only ever called from the page, so the number appeared
   * while the app was open — exactly when nobody needs it — and never while it
   * was closed, which is the whole point. The service worker is the only thing
   * running at that moment, so it has to set it.
   *
   * The number comes from the notifications the worker is already holding
   * rather than from a counter of its own: a service worker is killed between
   * pushes, so anything it counts in memory resets, and anything it stores has
   * to be reconciled with what the person has already seen. Outstanding
   * notifications are that state, kept for us by the system. */
  const updateBadge = async () => {
    if (!self.navigator || !("setAppBadge" in self.navigator)) return;
    try {
      const outstanding = await self.registration.getNotifications();
      const count = outstanding.length;
      if (count > 0) await self.navigator.setAppBadge(count);
      else await self.navigator.clearAppBadge();
    } catch {
      /* Unsupported or denied — the notification itself still lands, and on
         Android that alone puts a dot on the icon. */
    }
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Zero Club", {
      body: payload.body,
      // The sender's photo when the server sends one, the Zero logo otherwise.
      icon: payload.icon || "/logo.png",
      // Status-bar glyph: Android draws only its silhouette, so it must be the
      // monochrome mark — the full-colour logo renders as a white square.
      badge: "/icons/icon-monochrome-512.png",
      vibrate: payload.type === "game_buzz" ? [250, 80, 250, 80, 400] : [100, 50, 100],
      requireInteraction: payload.type === "game_buzz",
      // One notification per conversation that updates as new messages
      // arrive, like a chat app, instead of a new card for every line.
      tag: payload.tag || (payload.type === "game_buzz" ? `zero-game-buzz:${payload.url || ""}` : undefined),
      renotify: Boolean(payload.tag) || payload.type === "game_buzz",
      data: { url: payload.url || "/app" },
      actions: [
        { action: "open", title: payload.type === "game_buzz" ? "Join game" : "Open app" },
      ],
    }).then(updateBadge),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/app";

  // Opening one notification clears that one from the count, not all of them.
  if (self.navigator && "setAppBadge" in self.navigator) {
    event.waitUntil(
      self.registration
        .getNotifications()
        .then((rest) => (rest.length > 0 ? self.navigator.setAppBadge(rest.length) : self.navigator.clearAppBadge()))
        .catch(() => {}),
    );
  }

  /* Open exactly what the notification was about.
   *
   * This used to call client.navigate() and only then client.focus(). On
   * Android the tap's permission to bring the app forward expires while the
   * page reloads, so focus() failed; and navigate() rejects outright when the
   * page isn't controlled by this worker — either way the chain stopped and the
   * tap just left the app wherever it was (or did nothing at all).
   *
   * Now: bring the app forward first, while the tap still counts, then ask the
   * running app to route there itself (instant, no reload). If it doesn't
   * answer, do a full navigation; if there is no window, open one. */
  const target = new URL(targetUrl, self.location.origin).href;

  const askAppToRoute = (client) =>
    new Promise((resolve) => {
      try {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(false), 1500);
        channel.port1.onmessage = () => {
          clearTimeout(timer);
          resolve(true);
        };
        client.postMessage({ type: "NOTIFICATION_NAVIGATE", url: target }, [channel.port2]);
      } catch {
        resolve(false);
      }
    });

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const ours = windows.filter((client) => client.url.startsWith(self.registration.scope));
      const client = ours.find((c) => c.focused) || ours.find((c) => c.visibilityState === "visible") || ours[0];

      if (client) {
        const focused = await client.focus().catch(() => client);
        if (await askAppToRoute(focused)) return;
        try {
          if (await focused.navigate(target)) return;
        } catch {
          /* not controlled by this worker: fall through to a new window */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// An update can still be applied explicitly, but never just because a deploy
// was detected while the app was open.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
