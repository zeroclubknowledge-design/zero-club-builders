/*
 * Zero Club production service worker.
 *
 * This file is the worker shipped by the Vercel build. Updates deliberately
 * wait until the current app session closes, so a deploy cannot reload the app
 * while somebody is editing a profile or composing a Club.
 */

const VERSION = "zc-v4";
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

  event.waitUntil(
    self.registration.showNotification(payload.title || "Zero Club", {
      body: payload.body,
      icon: "/logo.png",
      badge: "/logo.png",
      vibrate: payload.type === "game_buzz" ? [250, 80, 250, 80, 400] : [100, 50, 100],
      requireInteraction: payload.type === "game_buzz",
      tag: payload.type === "game_buzz" ? `zero-game-buzz:${payload.url || ""}` : undefined,
      renotify: payload.type === "game_buzz",
      data: { url: payload.url || "/app" },
      actions: [
        { action: "open", title: payload.type === "game_buzz" ? "Join game" : "Open app" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) =>
        client.url.startsWith(self.registration.scope),
      );
      if (existingClient) {
        return existingClient.navigate(targetUrl).then(() => existingClient.focus());
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

// An update can still be applied explicitly, but never just because a deploy
// was detected while the app was open.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
