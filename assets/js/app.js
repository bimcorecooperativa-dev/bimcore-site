/* Estrutura comum das áreas restritas: proteção de acesso, topo, navegação por abas */
(function () {
  "use strict";
  const { $, esc } = window.UI;
  const API = window.API;

  async function iniciar(opcoes) {
    const raiz = document.getElementById("app");
    let sessao;
    try { sessao = await API.getSession(); } catch (e) { sessao = null; }
    if (!sessao) { location.replace("entrar.html"); return; }
    const p = sessao.perfil || {};
    const coord = p.papel === "coordenacao" && p.status === "ativo";
    const tes = p.status === "ativo" && (coord || !!p.tesouraria);
    const fiscal = p.status === "ativo" && !!p.conselho_fiscal;
    const ca = p.status === "ativo" && !!p.conselho_adm;
    const interno = tes || fiscal || ca;
    if (opcoes.area === "interno" && !interno) { location.replace("painel.html"); return; }

    window.UI.barraDemo();
    const paginas = opcoes.filtrar ? opcoes.filtrar(opcoes.paginas, { coord, tes, fiscal, ca }) : opcoes.paginas;
    const chaves = Object.keys(paginas);
    const rotulo = opcoes.area === "interno" ? "Área interna" : "Área do cooperado";

    raiz.innerHTML = `
      <header class="app-topo"><div class="app-topo-in">
        <a class="app-marca" href="index.html">
          <picture><source srcset="assets/img/emblema-sm.webp" type="image/webp"><img src="assets/img/emblema-sm.png" alt="" width="38" height="31"></picture>
          <span><b>BIMCORE</b><small>${esc(rotulo)}</small></span>
        </a>
        <div class="app-usuario">
          <div class="quem"><b>${esc(p.nome || p.email || "")}</b><span>${coord ? "Coordenação" : tes ? "Tesouraria" : fiscal ? "Conselho Fiscal" : ca ? "Conselho de Administração" : "Cooperado"} · ${esc(p.email || "")}</span></div>
          ${interno ? `<a class="btn btn-ghost btn-sm" href="${opcoes.area === "interno" ? "painel.html" : "interno.html"}">${opcoes.area === "interno" ? "Minha área" : "Área interna"}</a>` : ""}
          <button class="btn btn-ghost btn-sm" id="sair">Sair</button>
        </div>
      </div></header>
      <div class="app-corpo">
        <button class="app-nav-botao" id="app-nav-botao" type="button" aria-expanded="false" aria-controls="app-nav"><span class="rot">Seção</span><b id="app-nav-atual"></b><span class="sinal" id="app-nav-sinal" hidden></span><i aria-hidden="true"></i></button>
        <nav class="app-nav" id="app-nav" aria-label="Seções">
          ${chaves.map((k) => (paginas[k].separador ? '<span class="sep" aria-hidden="true"></span>' : "") + `<a href="#${k}" data-k="${k}"><span>${esc(paginas[k].titulo)}<span class="sinal" data-sinal="${k}" hidden></span></span><span class="contador" data-cont="${k}" hidden></span></a>`).join("")}
        </nav>
        <main class="app-main" id="pagina" tabindex="-1"></main>
      </div>`;

    const navBotao = $("#app-nav-botao");
    const fecharNav = () => { $("#app-nav").classList.remove("aberta"); navBotao.setAttribute("aria-expanded", "false"); };
    navBotao.addEventListener("click", () => { const nav = $("#app-nav"); nav.style.top = Math.round(navBotao.getBoundingClientRect().bottom) + "px"; const ab = nav.classList.toggle("aberta"); navBotao.setAttribute("aria-expanded", String(ab)); });
    window.addEventListener("scroll", () => { if ($("#app-nav").classList.contains("aberta")) $("#app-nav").style.top = Math.round(navBotao.getBoundingClientRect().bottom) + "px"; }, { passive: true });
    $("#app-nav").addEventListener("click", (e) => { if (e.target.closest("a")) fecharNav(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharNav(); });

    // No celular, cada célula de tabela recebe o nome da coluna para virar ficha
    const rotularTabelas = (raizEl) => {
      raizEl.querySelectorAll("table.tabela").forEach((t) => {
        const cabs = [...t.querySelectorAll("thead th")].map((th) => th.textContent.trim());
        if (!cabs.length) return;
        t.classList.add("tabela-fichas");
        t.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
          let i = 0;
          [...tr.children].forEach((td) => { if (!td.hasAttribute("data-rot")) td.setAttribute("data-rot", cabs[i] || ""); i += td.colSpan || 1; });
        });
      });
    };
    new MutationObserver(() => rotularTabelas($("#pagina"))).observe($("#pagina"), { childList: true, subtree: true });

    $("#sair").addEventListener("click", async () => { await API.signOut(); location.replace("entrar.html"); });

    const ctx = {
      sessao, coord, tes, fiscal, ca, leitura: fiscal && !tes,
      async recarregarSessao() { ctx.sessao = await API.getSession(); return ctx.sessao; },
      ir(k) { location.hash = k; },
      async atualizarContadores() {
        let pior = null;
        for (const k of chaves) {
          if (!paginas[k].sinal) continue;
          const el = document.querySelector(`[data-sinal="${k}"]`);
          try {
            const r = await paginas[k].sinal(ctx);
            el.hidden = !r; el.className = "sinal" + (r ? " " + r.cor : ""); el.title = r ? r.texto : ""; el.setAttribute("aria-label", r ? r.texto : "");
            if (r && (r.cor === "err" || !pior)) pior = r.cor;
          } catch (e) { el.hidden = true; }
        }
        const sb = document.querySelector("#app-nav-sinal"); if (sb) { sb.hidden = !pior; sb.className = "sinal" + (pior ? " " + pior : ""); }
        for (const k of chaves) {
          if (!paginas[k].contador) continue;
          const el = document.querySelector(`[data-cont="${k}"]`);
          try { const n = await paginas[k].contador(ctx); el.textContent = n; el.hidden = !n; } catch (e) { el.hidden = true; }
        }
      }
    };

    async function render() {
      let k = location.hash.replace("#", "");
      if (!paginas[k]) k = chaves[0];
      document.querySelectorAll("#app-nav a").forEach((a) => {
        if (a.dataset.k === k) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      $("#app-nav-atual").textContent = paginas[k].titulo;
      // cada abertura de página desenha num bloco próprio: se o usuário trocar de página antes de a anterior
      // terminar de carregar, a anterior escreve num bloco que já saiu da tela e não sobrescreve a nova
      const pag = $("#pagina");
      const alvo = document.createElement("div"); alvo.style.display = "contents";
      alvo.innerHTML = '<p class="carregando">Carregando…</p>';
      pag.replaceChildren(alvo);
      document.title = paginas[k].titulo + " | BIMCORE";
      try { await paginas[k].render(alvo, ctx); }
      catch (e) { alvo.innerHTML = `<div class="notice err">Não foi possível carregar esta seção. ${esc(e.message || "")}</div>`; }
    }

    if (opcoes.antes) {
      const parar = await opcoes.antes(ctx, $("#pagina"));
      if (parar) { $("#app-nav").hidden = true; $("#app-nav-botao").hidden = true; return; }
    }
    window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
    await render();
    ctx.atualizarContadores();
  }

  window.App = { iniciar };
})();
