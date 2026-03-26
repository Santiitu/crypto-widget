self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("crypto-final").then(cache =>
      cache.addAll(["/", "/index.html", "/app.js", "/css/styles.css"])
    )
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
