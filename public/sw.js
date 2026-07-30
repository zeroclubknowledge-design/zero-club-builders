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
    vibrate: [100, 50, 100],
    data: { url: payload.url || "/app" },
    actions: [{ action: "open", title: "Open app" }],
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
