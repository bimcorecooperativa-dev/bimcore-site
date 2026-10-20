/* BIMCORE — notificações no celular (Web Push) e número no ícone do app.
   Cada aparelho autoriza uma vez. No iPhone, só funciona no app instalado na tela inicial (iOS 16.4 ou mais novo). */
(function () {
  "use strict";
  const b64 = (t) => { t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return Uint8Array.from(atob(t), (c) => c.charCodeAt(0)); };
  const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
  const APP = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const Push = {
    suportado() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && location.protocol === "https:"; },
    precisaInstalar() { return iPhone && !APP; },
    permissao() { return "Notification" in window ? Notification.permission : "unsupported"; },
    async registro() { return navigator.serviceWorker.ready; },
    async inscricao() { if (!this.suportado()) return null; try { const r = await this.registro(); return await r.pushManager.getSubscription(); } catch (e) { return null; } },
    async ativado() { return this.permissao() === "granted" && !!(await this.inscricao()); },
    async ativar() {
      if (!this.suportado()) throw new Error(this.precisaInstalar() ? "No iPhone, instale o app na tela inicial e ative por ele." : "Este navegador não recebe notificações.");
      const p = await Notification.requestPermission();
      if (p !== "granted") throw new Error("As notificações não foram permitidas. Você pode liberar nos ajustes do celular.");
      const chave = await window.API.push.chave(); if (!chave) throw new Error("As notificações ainda não estão configuradas no servidor.");
      const r = await this.registro();
      let s = await r.pushManager.getSubscription();
      if (!s) s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(chave) });
      const j = s.toJSON();
      await window.API.push.inscrever({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho: (navigator.userAgent || "").slice(0, 160) });
      return true;
    },
    async desativar() { const s = await this.inscricao(); if (s) { try { await window.API.push.remover(s.endpoint); } catch (e) {} await s.unsubscribe(); } return true; },
    /* número no ícone: o que está pendente no menu (contadores e avisos) */
    async badge(n) {
      try {
        if ("setAppBadge" in navigator) { if (n > 0) await navigator.setAppBadge(n); else await navigator.clearAppBadge(); }
        const c = await caches.open("bimcore-badge"); await c.put("/__badge", new Response(String(n || 0)));
      } catch (e) {}
    }
  };
  window.Push = Push;
})();
