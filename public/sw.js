/* Zero Club production service worker. */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
