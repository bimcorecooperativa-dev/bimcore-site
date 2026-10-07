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
    if (opcoes.area === "interno" && !coord) { location.replace("painel.html"); return; }

    window.UI.barraDemo();
    const paginas = opcoes.paginas;
    const chaves = Object.keys(paginas);
    const rotulo = opcoes.area === "interno" ? "Área interna" : "Área do cooperado";

    raiz.innerHTML = `
      <header class="app-topo"><div class="app-topo-in">
        <a class="app-marca" href="index.html">
          <picture><source srcset="assets/img/emblema-sm.webp" type="image/webp"><img src="assets/img/emblema-sm.png" alt="" width="38" height="31"></picture>
          <span><b>BIMCORE</b><small>${esc(rotulo)}</small></span>
        </a>
        <div class="app-usuario">
          <div class="quem"><b>${esc(p.nome || p.email || "")}</b><span>${coord ? "Coordenação" : "Cooperado"} · ${esc(p.email || "")}</span></div>
          ${coord ? `<a class="btn btn-ghost btn-sm" href="${opcoes.area === "interno" ? "painel.html" : "interno.html"}">${opcoes.area === "interno" ? "Minha área" : "Área interna"}</a>` : ""}
          <button class="btn btn-ghost btn-sm" id="sair">Sair</button>
        </div>
      </div></header>
      <div class="app-corpo">
        <nav class="app-nav" id="app-nav" aria-label="Seções">
          ${chaves.map((k) => (paginas[k].separador ? '<span class="sep" aria-hidden="true"></span>' : "") + `<a href="#${k}" data-k="${k}">${esc(paginas[k].titulo)}<span class="contador" data-cont="${k}" hidden></span></a>`).join("")}
        </nav>
        <main class="app-main" id="pagina" tabindex="-1"></main>
      </div>`;

    $("#sair").addEventListener("click", async () => { await API.signOut(); location.replace("entrar.html"); });

    const ctx = {
      sessao, coord,
      async recarregarSessao() { ctx.sessao = await API.getSession(); return ctx.sessao; },
      ir(k) { location.hash = k; },
      async atualizarContadores() {
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
      const alvo = $("#pagina");
      alvo.onclick = null;
      alvo.innerHTML = '<p class="carregando">Carregando…</p>';
      document.title = paginas[k].titulo + " | BIMCORE";
      try { await paginas[k].render(alvo, ctx); }
      catch (e) { alvo.innerHTML = `<div class="notice err">Não foi possível carregar esta seção. ${esc(e.message || "")}</div>`; }
    }

    if (opcoes.antes) {
      const parar = await opcoes.antes(ctx, $("#pagina"));
      if (parar) { $("#app-nav").hidden = true; return; }
    }
    window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
    await render();
    ctx.atualizarContadores();
  }

  window.App = { iniciar };
})();
