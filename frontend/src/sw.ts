/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const handler = createHandlerBoundToURL("/index.html");
registerRoute(new NavigationRoute(handler));

// ── Notification Sound Helper ────────────────────────────────────────────────
async function notifyClientsToPlaySound() {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: "PLAY_NOTIFICATION_SOUND" });
  }
}

// ── Daily Essence Notification Scheduler ─────────────────────────────────────
let essenceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEssenceNotification(hour: number, minute: number) {
  if (essenceTimer !== null) clearTimeout(essenceTimer);

  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();

  essenceTimer = setTimeout(async () => {
    essenceTimer = null;
    try {
      await self.registration.showNotification("Pinapeg · Daily Essence", {
        body: "Your daily focus is ready. Tap to see what needs attention today.",
        tag: "daily-essence",
        renotify: true,
        requireInteraction: false,
        silent: false,
        vibrate: [200, 100, 200, 100, 300],
      } as NotificationOptions);
      await notifyClientsToPlaySound();
    } catch {
      // Notification API may not be available in all contexts
    }
    scheduleEssenceNotification(hour, minute);
  }, delay);
}

// ── Everyday App Opening / Check-in Scheduler ───────────────────────────
let appCheckinTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAppCheckinNotification(hour: number = 20, minute: number = 0) {
  if (appCheckinTimer !== null) clearTimeout(appCheckinTimer);

  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target.getTime() - now.getTime();

  appCheckinTimer = setTimeout(async () => {
    appCheckinTimer = null;
    try {
      await self.registration.showNotification("Pinapeg · Daily Check-in", {
        body: "Time for your daily reflection. Capture your thoughts, check habits, and close the loop today.",
        tag: "daily-app-checkin",
        renotify: true,
        requireInteraction: false,
        silent: false,
        vibrate: [300, 150, 300],
      } as NotificationOptions);
      await notifyClientsToPlaySound();
    } catch {
      // Ignore errors
    }
    scheduleAppCheckinNotification(hour, minute);
  }, delay);
}

// Default schedule check-in at 8:00 PM (20:00)
scheduleAppCheckinNotification(20, 0);

// ── Web Push Event Listener ──────────────────────────────────────────────────
self.addEventListener("push", (event: PushEvent) => {
  let data = { title: "Pinapeg Nudge", body: "You have a new update in Pinapeg.", tag: "push-nudge" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag,
        renotify: true,
        silent: false,
        vibrate: [200, 100, 200, 100, 300],
      } as NotificationOptions);
      await notifyClientsToPlaySound();
    })()
  );
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SCHEDULE_DAILY_NOTIFICATION") {
    const { hour, minute } = event.data as { hour: number; minute: number };
    scheduleEssenceNotification(hour, minute);
  }
  if (event.data?.type === "SCHEDULE_CHECKIN_NOTIFICATION") {
    const { hour, minute } = event.data as { hour: number; minute: number };
    scheduleAppCheckinNotification(hour, minute);
  }
  if (event.data?.type === "TRIGGER_TEST_NOTIFICATION") {
    const { title, body } = event.data;
    self.registration.showNotification(title || "Pinapeg Test Nudge", {
      body: body || "Notifications and audio chimes are active!",
      tag: "test-nudge",
      renotify: true,
      silent: false,
      vibrate: [200, 100, 200],
    } as NotificationOptions).then(() => notifyClientsToPlaySound());
  }
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return (client as WindowClient).focus();
        }
        return (self as unknown as ServiceWorkerGlobalScope).clients.openWindow("/");
      }),
  );
});
