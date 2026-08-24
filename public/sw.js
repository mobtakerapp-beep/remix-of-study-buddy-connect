const CACHE = "mulakhasy-v2";
const OFFLINE_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Cache each asset independently so one missing file can't fail install.
        Promise.all(OFFLINE_SHELL.map((url) => cache.add(url).catch(() => undefined))),
      )
      .then(() => self.skipWaiting()),
  );
});


self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  return (
    /\.(js|css|png|jpg|jpeg|webp|svg|gif|ico|woff|woff2|ttf|eot|otf|json|webmanifest)(\?.*)?$/.test(
      path,
    ) || path.startsWith("/assets/")
  );
}

function isApi(req) {
  const path = new URL(req.url).pathname;
  return path.startsWith("/api/") || path.startsWith("/_serverFn/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navigation / HTML requests: network-first, fallback to cached shell.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/") || Response.error()),
        ),
    );
    return;
  }

  // API / server functions: always network.
  if (isApi(req)) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // Static assets: cache-first, populate cache on miss.
  if (isStatic(req)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (!res || res.status !== 200 || res.type !== "basic") return res;
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
          return res;
        });
      }),
    );
    return;
  }

  // Everything else: try network, fall back to cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error())),
  );
});
