/* BIMCORE — utilitários de interface compartilhados */
(function () {
  "use strict";
  const UI = {};
  UI.$ = (s, r) => (r || document).querySelector(s);
  UI.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  UI.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  UI.data = (d) => {
    if (!d) return "—";
    const dt = new Date(String(d).length === 10 ? d + "T12:00:00" : d);
    return isNaN(dt) ? "—" : dt.toLocaleDateString("pt-BR");
  };
  UI.dataHora = (d) => {
    const dt = new Date(d);
    return isNaN(dt) ? "—" : dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  UI.horas = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " h";
  UI.moeda = (n) => (n == null || n === "" ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  UI.bytes = (n) => (n > 1048576 ? (n / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  UI.hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  UI.mesAtual = () => UI.hoje().slice(0, 7);

  UI.toast = (msg, tipo) => {
    let w = UI.$("#toasts");
    if (!w) { w = document.createElement("div"); w.id = "toasts"; w.className = "toast-wrap"; document.body.appendChild(w); }
    const t = document.createElement("div");
    t.className = "toast" + (tipo === "err" ? " err" : "");
    t.setAttribute("role", tipo === "err" ? "alert" : "status");
    t.textContent = msg;
    w.appendChild(t);
    setTimeout(() => t.remove(), tipo === "err" ? 6500 : 3500);
  };

  /* Executa uma ação com o botão travado e mostra erro amigável */
  UI.acao = async (botao, fn, sucesso) => {
    const txt = botao ? botao.textContent : "";
    if (botao) { botao.disabled = true; botao.textContent = "Aguarde…"; }
    try {
      const r = await fn();
      if (sucesso) UI.toast(sucesso);
      return r;
    } catch (e) {
      UI.toast(e.message || String(e), "err");
      return undefined;
    } finally {
      if (botao) { botao.disabled = false; botao.textContent = txt; }
    }
  };

  /* Confirmação dentro da página (sem confirm() do navegador) */
  UI.confirmar = (texto, rotuloOk) => new Promise((ok) => {
    const d = document.createElement("div");
    d.className = "modal-fundo";
    d.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <p id="modal-t">${UI.esc(texto)}</p>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-r="0">Cancelar</button><button class="btn btn-danger btn-sm" data-r="1">${UI.esc(rotuloOk || "Confirmar")}</button></div>
    </div>`;
    const fim = (v) => { d.remove(); document.removeEventListener("keydown", esc); ok(v); };
    const esc = (e) => { if (e.key === "Escape") fim(false); };
    d.addEventListener("click", (e) => { if (e.target === d) fim(false); const b = e.target.closest("[data-r]"); if (b) fim(b.dataset.r === "1"); });
    document.addEventListener("keydown", esc);
    document.body.appendChild(d);
    d.querySelector('[data-r="0"]').focus();
  });

  /* Janela dentro da página; devolve o elemento e a função de fechar */
  UI.modal = (html, aoFechar) => {
    const d = document.createElement("div");
    d.className = "modal-fundo";
    d.innerHTML = `<div class="modal modal-largo" role="dialog" aria-modal="true">${html}</div>`;
    const fechar = () => { d.remove(); document.removeEventListener("keydown", esc); if (aoFechar) aoFechar(); };
    const esc = (e) => { if (e.key === "Escape") fechar(); };
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-fechar]")) fechar(); });
    document.addEventListener("keydown", esc);
    document.body.appendChild(d);
    const foco = d.querySelector("input, button:not([data-fechar])"); if (foco) foco.focus();
    return { el: d.querySelector(".modal"), fechar };
  };

  UI.barraDemo = () => {
    if (!window.API || !window.API.demo) return;
    const b = document.createElement("div");
    b.className = "demo-bar";
    b.innerHTML = 'Modo demonstração: os dados ficam só neste navegador. O banco real é ligado no arquivo <code>config.js</code>.';
    document.body.prepend(b);
  };

  /* Ícone "i": explicação ao passar o mouse, focar ou tocar */
  UI.info = (texto, rotulo) => `<button type="button" class="info-i" data-info="${UI.esc(texto)}" aria-label="${UI.esc(rotulo || "O que é isto?")}">i</button>`;
  (function () {
    let pop = null, dono = null, fixo = false;
    const fechar = () => { if (pop) pop.remove(); pop = null; dono = null; fixo = false; };
    const abrir = (b) => {
      if (dono === b) return;
      fechar(); dono = b;
      pop = document.createElement("div");
      pop.className = "info-pop"; pop.setAttribute("role", "tooltip");
      pop.textContent = b.dataset.info;
      document.body.appendChild(pop);
      const r = b.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, m = 8;
      let x = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), window.innerWidth - w - m);
      let y = r.bottom + 8; if (y + h > window.innerHeight - m) y = Math.max(m, r.top - h - 8);
      pop.style.left = x + "px"; pop.style.top = y + "px";
    };
    document.addEventListener("mouseover", (e) => { const b = e.target.closest && e.target.closest(".info-i"); if (b) abrir(b); else if (dono && !fixo) fechar(); });
    document.addEventListener("focusin", (e) => { if (e.target.classList && e.target.classList.contains("info-i")) abrir(e.target); });
    document.addEventListener("focusout", (e) => { if (e.target === dono && !fixo) fechar(); });
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".info-i");
      if (b) { e.preventDefault(); e.stopPropagation(); if (dono === b && fixo) fechar(); else { abrir(b); fixo = true; } return; }
      fechar();
    }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    window.addEventListener("scroll", () => { if (!fixo) fechar(); else if (dono) { const b = dono; dono = null; fixo = false; abrir(b); fixo = true; } }, true);
  })();

  window.UI = UI;
})();
