/* BIMCORE — app da área do cooperado (PWA).
   Sempre busca a versão mais nova na rede; o cache só serve quando o celular está sem internet.
   Nada do banco (Supabase) nem de outros sites passa por aqui: dados pessoais não ficam guardados no aparelho. */
const CACHE = "bimcore-app-v6";
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/assets/app/icone-192.png"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== "bimcore-badge").map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== self.location.origin) return;
  if (!/\.(html|js|css|webp|png|jpg|ico|webmanifest|woff2?)$/.test(u.pathname) && u.pathname !== "/") return;
  e.respondWith(fetch(r).then((resp) => {
    if (resp.ok && !u.pathname.startsWith("/assets/manual/")) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(r, copia)); }
    return resp;
  }).catch(() => caches.match(r).then((m) => m || (r.mode === "navigate" ? caches.match(OFFLINE) : Response.error()))));
});

/* notificações no celular: o aviso chega do servidor, aparece na tela e soma 1 no número do ícone */
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { titulo: "BIMCORE", corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.titulo || "BIMCORE", { body: d.corpo || "", icon: "/assets/app/icone-192.png", badge: "/assets/app/icone-192.png", tag: "bimcore-" + (d.id || Date.now()), data: { url: d.url || "/painel.html" } });
    try {
      const c = await caches.open("bimcore-badge"); const r = await c.match("/__badge"); const n = (r ? Number(await r.text()) || 0 : 0) + 1;
      await c.put("/__badge", new Response(String(n))); if (self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
    } catch (err) {}
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "/painel.html", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.location.origin)); if (c) { c.navigate(alvo).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(alvo);
  }));
});
