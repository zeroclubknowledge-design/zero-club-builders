/*
 * Zero Club production service worker.
 *
 * Handles three jobs:
 *   1. Speed  - caches the app shell and static assets so repeat visits and
 *               navigations render without waiting on the network.
 *   2. Reliability - serves a cached page when the network is slow or offline.
 *   3. Push   - shows notifications and routes taps to the right screen.
 *
 * Caching strategy per request type:
 *   Navigations      network-first, falling back to the cached shell.
 *   Hashed JS/CSS    cache-first (filenames change on every deploy).
 *   Images/fonts     stale-while-revalidate, capped so storage stays sane.
 *   Supabase/API     never cached - always live data.
 */

const VERSION = "zc-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const IMAGE_CACHE = `${VERSION}-images`;
const OFFLINE_URL = "/";

// Kept small on purpose: everything else is cached the first time it is used.
const SHELL_ASSETS = ["/", "/logo.png", "/manifest.webmanifest"];

const MAX_IMAGE_ENTRIES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Trim a cache to a maximum number of entries, oldest first. */
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

  // Only GET requests are safe to cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Live data and auth must never be served from cache.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  // 1. Navigations: try the network, fall back to cache when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // 2. Build output: content-hashed, so cache-first is always safe and fastest.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })),
    );
    return;
  }

  // 3. Images and fonts: show the cached copy immediately, refresh in the background.
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

/* ── Push notifications ─────────────────────────────────────────────────── */

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

  event.waitUntil(self.registration.showNotification(payload.title || "Zero Club", {
    body: payload.body,
    icon: "/logo.png",
    badge: "/logo.png",
    vibrate: payload.type === "game_buzz" ? [250, 80, 250, 80, 400] : [100, 50, 100],
    requireInteraction: payload.type === "game_buzz",
    tag: payload.type === "game_buzz" ? `zero-game-buzz:${payload.url || ""}` : undefined,
    renotify: payload.type === "game_buzz",
    data: { url: payload.url || "/app" },
    actions: [{ action: "open", title: payload.type === "game_buzz" ? "Join game" : "Open app" }],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/app";

  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existingClient = clients.find((client) => client.url.startsWith(self.registration.scope));
    if (existingClient) return existingClient.navigate(targetUrl).then(() => existingClient.focus());
    return self.clients.openWindow(targetUrl);
  }));
});

/* Lets the page trigger an immediate update after a new deploy. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
