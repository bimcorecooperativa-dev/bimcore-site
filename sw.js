/* BIMCORE — app da área do cooperado (PWA).
   Sempre busca a versão mais nova na rede; o cache só serve quando o celular está sem internet.
   Nada do banco (Supabase) nem de outros sites passa por aqui: dados pessoais não ficam guardados no aparelho. */
const CACHE = "bimcore-app-v4";
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/assets/app/icone-192.png"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== self.location.origin) return;
  if (!/\.(html|js|css|webp|png|jpg|ico|webmanifest|woff2?)$/.test(u.pathname) && u.pathname !== "/") return;
  e.respondWith(fetch(r).then((resp) => {
    if (resp.ok && !u.pathname.startsWith("/assets/manual/")) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(r, copia)); }
    return resp;
  }).catch(() => caches.match(r).then((m) => m || (r.mode === "navigate" ? caches.match(OFFLINE) : Response.error()))));
});
