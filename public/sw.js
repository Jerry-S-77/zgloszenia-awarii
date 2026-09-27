// Service worker aplikacji: wyłącznie powiadomienia push (bez pamięci podręcznej — kolejką offline zajmuje się
// aplikacja przez IndexedDB). Treść przychodzi z serwera: { tytul, tresc, link, krytyczne, id }.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dane = {};
  try {
    dane = event.data ? event.data.json() : {};
  } catch {
    dane = { tresc: event.data ? event.data.text() : "" };
  }
  const tytul = dane.tytul || "Zgłaszanie awarii";
  event.waitUntil(
    self.registration.showNotification(tytul, {
      body: dane.tresc || "",
      icon: "/icons/icon-512.png",
      badge: "/icons/icon-512.png",
      tag: dane.id || undefined,
      requireInteraction: Boolean(dane.krytyczne),
      data: { link: dane.link || "/powiadomienia" },
      lang: "pl",
    }),
  );
});

// Dotknięcie powiadomienia: przełącz na otwartą kartę aplikacji albo otwórz nową, na właściwym ekranie.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const cel = new URL(event.notification.data?.link || "/powiadomienia", self.location.origin);
  if (cel.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((okna) => {
      for (const okno of okna) {
        if (new URL(okno.url).origin === self.location.origin && "focus" in okno) {
          return okno.focus().then((o) => ("navigate" in o ? o.navigate(cel.href) : o));
        }
      }
      return self.clients.openWindow(cel.href);
    }),
  );
});
