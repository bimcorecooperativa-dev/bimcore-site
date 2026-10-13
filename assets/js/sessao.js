/* BIMCORE — segurança da sessão
   • No app (instalado na tela inicial): depois de 5 minutos sem uso, a tela bloqueia e abre com a
     biometria do aparelho (Face ID / digital) ou com a senha. Sem uso por 7 dias, a sessão é encerrada.
   • No site (navegador): sem "Manter conectado", a sessão termina depois de 30 minutos sem uso
     e quando o navegador é fechado. Com "Manter conectado", continua até a pessoa clicar em Sair.
   A biometria é do próprio aparelho (WebAuthn): o site nunca recebe a digital nem o rosto. */
(function () {
  "use strict";
  const APP = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const MIN_APP = 5, DIAS_APP = 7, MIN_SITE = 30;
  const K_ATIV = "bimcore-ultima-atividade", K_MANTER = "bimcore-manter", K_BIO = "bimcore-biometria";
  const ler = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const agora = () => Date.now();
  const ultima = () => Number(ler(K_ATIV) || 0);
  const temCookie = () => /(?:^|;\s*)bimcore_aba=1/.test(document.cookie);
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const deB64 = (t) => { t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return Uint8Array.from(atob(t), (c) => c.charCodeAt(0)); };
  const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

  const Sessao = {
    APP,
    /* chamado no login (entrar.html) */
    aoEntrar(manter) {
      gravar(K_MANTER, !APP && manter ? "1" : null);
      document.cookie = "bimcore_aba=1; path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");   // cookie de sessão: some quando o navegador fecha
      gravar(K_ATIV, String(agora()));
    },
    async sair(motivo) {
      try { await window.API.signOut(); } catch (e) {}
      gravar(K_ATIV, null);
      location.replace("entrar.html" + (motivo ? "?saiu=" + motivo : ""));
    },
    /* ---------- biometria ---------- */
    bio() { try { return JSON.parse(ler(K_BIO) || "null"); } catch (e) { return null; } },
    async bioDisponivel() { try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; } },
    async ativarBio(perfil) {
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: aleatorio(32), rp: { name: "BIMCORE", id: location.hostname },
        user: { id: new TextEncoder().encode(perfil.id), name: perfil.email || perfil.id, displayName: perfil.nome || "Cooperado" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60000, attestation: "none" } });
      gravar(K_BIO, JSON.stringify({ perfil_id: perfil.id, id: b64(cred.rawId), em: new Date().toISOString() }));
      return true;
    },
    desativarBio() { gravar(K_BIO, null); },
    async verificarBio() {
      const b = this.bio(); if (!b) throw new Error("A biometria não está ativada neste aparelho.");
      await navigator.credentials.get({ publicKey: { challenge: aleatorio(32), rpId: location.hostname, allowCredentials: [{ type: "public-key", id: deB64(b.id) }], userVerification: "required", timeout: 60000 } });
      return true;
    },
    /* ---------- bloqueio ---------- */
    bloqueada: false,
    async bloquear() {
      if (this.bloqueada) return; this.bloqueada = true;
      const b = this.bio(), pode = b && await this.bioDisponivel();
      const d = document.createElement("div"); d.className = "trava"; d.id = "trava";
      d.innerHTML = `<div class="trava-in"><img src="assets/app/icone-192.png" alt="" width="72" height="72"><h1>Sessão bloqueada</h1>
        <p>Por segurança, o app bloqueia depois de ${MIN_APP} minutos sem uso.</p>
        ${pode ? '<button class="btn btn-primary" id="trava-bio" type="button">Desbloquear com Face ID ou digital</button>' : '<p class="hint">Ative o desbloqueio por biometria em Meu perfil para entrar sem digitar a senha.</p>'}
        <button class="btn btn-ghost" id="trava-senha" type="button">Entrar com e-mail e senha</button><p class="trava-msg" id="trava-msg"></p></div>`;
      document.body.appendChild(d); document.body.classList.add("travado");
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      d.querySelector("#trava-senha").onclick = () => this.sair("bloqueio");
      const bt = d.querySelector("#trava-bio");
      if (bt) bt.onclick = async () => {
        bt.disabled = true;
        try { await this.verificarBio(); this.desbloquear(); }
        catch (e) { d.querySelector("#trava-msg").textContent = "Não foi possível confirmar. Tente de novo ou entre com a senha."; bt.disabled = false; }
      };
    },
    desbloquear() { this.bloqueada = false; gravar(K_ATIV, String(agora())); const d = document.getElementById("trava"); if (d) d.remove(); document.body.classList.remove("travado"); },
    /* ---------- vigia de inatividade (área do cooperado e área interna) ---------- */
    vigiar() {
      const manter = ler(K_MANTER) === "1";
      const u = ultima();
      if (APP) {
        if (u && agora() - u > DIAS_APP * 864e5) return this.sair("inatividade");
        if (!u || agora() - u > MIN_APP * 60000) this.bloquear();
      } else if (!manter) {
        if (!temCookie() || (u && agora() - u > MIN_SITE * 60000)) return this.sair("inatividade");
      }
      if (!this.bloqueada) gravar(K_ATIV, String(agora()));
      let marcado = 0;
      const ativo = () => { if (this.bloqueada) return; const t = agora(); if (t - marcado > 15000) { marcado = t; gravar(K_ATIV, String(t)); } };
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, ativo, { passive: true }));
      const conferir = () => {
        if (this.bloqueada) return;
        const parado = agora() - ultima();
        if (APP && parado > MIN_APP * 60000) this.bloquear();
        else if (!APP && !manter && parado > MIN_SITE * 60000) this.sair("inatividade");
      };
      setInterval(conferir, 30000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") conferir(); });
    }
  };
  window.Sessao = Sessao;
})();
