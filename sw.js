// Service worker: cache the app shell (HTML/CSS/JS/icons) for fast loading and
// basic offline access. API calls (/api/...) always go to the network since
// reservation data is shared live between devices.
var CACHE_NAME = "hotel-resa-shell-v1";
var SHELL_FILES = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/apple-touch-icon.png"
  ];

self.addEventListener("install", function (event) {
    event.waitUntil(
          caches.open(CACHE_NAME).then(function (cache) {
                  return cache.addAll(SHELL_FILES);
          }).then(function () {
                  return self.skipWaiting();
          })
        );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
          caches.keys().then(function (names) {
                  return Promise.all(
                            names.filter(function (n) { return n !== CACHE_NAME; })
                                 .map(function (n) { return caches.delete(n); })
                          );
          }).then(function () { return self.clients.claim(); })
        );
});

self.addEventListener("fetch", function (event) {
    var url = new URL(event.request.url);

                        if (url.pathname.indexOf("/api/") === 0) {
                              event.respondWith(fetch(event.request));
                              return;
                        }

                       if (event.request.method !== "GET") return;

                        event.respondWith(
                              caches.match(event.request).then(function (cached) {
                                      var networkFetch = fetch(event.request).then(function (response) {
                                                if (response && response.status === 200) {
                                                            var copy = response.clone();
                                                            caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
                                                }
                                                return response;
                                      }).catch(function () { return cached; });
                                      return cached || networkFetch;
                              })
                            );
});
