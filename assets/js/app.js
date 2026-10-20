/* Estrutura comum das áreas restritas: proteção de acesso, topo, navegação por abas */
(function () {
  "use strict";
  const { $, esc } = window.UI;
  const API = window.API;

  /* App no celular (PWA): registra o service worker e guarda o convite de instalação do Android/Chrome */
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.BIMCORE_INSTALAR = e; document.dispatchEvent(new Event("bimcore-instalavel")); });
  window.addEventListener("appinstalled", () => { window.BIMCORE_INSTALAR = null; try { localStorage.setItem("bimcore-app-instalado", "1"); } catch (e) {} });

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
    if (window.Sessao) window.Sessao.vigiar();

    window.UI.barraDemo();
    const paginas = opcoes.filtrar ? opcoes.filtrar(opcoes.paginas, { coord, tes, fiscal, ca }) : opcoes.paginas;
    const chaves = Object.keys(paginas);
    /* menu em grupos: cada grupo vira um item do menu e as páginas dele viram sub-abas */
    const entradas = [], noGrupo = {};
    (opcoes.menu || chaves).forEach((e) => {
      const g = typeof e === "string" ? { itens: [e] } : e;
      const itens = g.itens.filter((k) => paginas[k] && !noGrupo[k]); if (!itens.length) return;
      const ent = { id: g.id || itens[0], titulo: itens.length > 1 && g.titulo ? g.titulo : paginas[itens[0]].titulo, itens, separador: !!(g.separador || paginas[itens[0]].separador) };
      itens.forEach((k) => { noGrupo[k] = ent; }); entradas.push(ent);
    });
    chaves.filter((k) => !noGrupo[k]).forEach((k) => { const ent = { id: k, titulo: paginas[k].titulo, itens: [k], separador: !!paginas[k].separador }; noGrupo[k] = ent; entradas.push(ent); });
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
          ${entradas.map((g) => (g.separador ? '<span class="sep" aria-hidden="true"></span>' : "") + `<a href="#${g.itens[0]}" data-g="${g.id}"><span>${esc(g.titulo)}<span class="sinal" data-sinal="${g.id}" hidden></span></span><span class="contador" data-cont="${g.id}" hidden></span></a>`).join("")}
        </nav>
        <main class="app-main" id="pagina" tabindex="-1"></main>
      </div>`;

    const navBotao = $("#app-nav-botao");
    const fecharNav = () => { $("#app-nav").classList.remove("aberta"); navBotao.setAttribute("aria-expanded", "false"); document.body.classList.remove("nav-aberta"); };
    navBotao.addEventListener("click", () => { const nav = $("#app-nav"); nav.style.top = Math.round(navBotao.getBoundingClientRect().bottom) + "px"; const ab = nav.classList.toggle("aberta"); navBotao.setAttribute("aria-expanded", String(ab)); document.body.classList.toggle("nav-aberta", ab); if (ab) nav.scrollTop = 0; });
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

    $("#sair").addEventListener("click", async () => { if (window.Sessao) return window.Sessao.sair(); await API.signOut(); location.replace("entrar.html"); });

    const ctx = {
      sessao, coord, tes, fiscal, ca, leitura: fiscal && !tes,
      async recarregarSessao() { ctx.sessao = await API.getSession(); return ctx.sessao; },
      ir(k) { location.hash = k; },
      sinais: {}, contagens: {},
      async atualizarContadores() {
        let pior = null;
        for (const k of chaves) {
          if (!paginas[k].sinal) continue;
          try { ctx.sinais[k] = await paginas[k].sinal(ctx); } catch (e) { ctx.sinais[k] = null; }
        }
        for (const k of chaves) {
          if (!paginas[k].contador) continue;
          try { ctx.contagens[k] = await paginas[k].contador(ctx); } catch (e) { ctx.contagens[k] = 0; }
        }
        const marcar = (el, r) => { if (!el) return; el.hidden = !r; el.className = "sinal" + (r ? " " + r.cor : ""); el.title = r ? r.texto : ""; el.setAttribute("aria-label", r ? r.texto : ""); };
        for (const g of entradas) {
          const rs = g.itens.map((k) => ctx.sinais[k]).filter(Boolean);
          const r = rs.find((x) => x.cor === "err") || rs[0] || null;
          marcar(document.querySelector(`[data-sinal="${g.id}"]`), r && rs.length > 1 ? { cor: r.cor, texto: rs.map((x) => x.texto).join(" · ") } : r);
          if (r && (r.cor === "err" || !pior)) pior = r.cor;
          const n = g.itens.reduce((t, k) => t + (Number(ctx.contagens[k]) || 0), 0);
          const ce = document.querySelector(`[data-cont="${g.id}"]`); if (ce) { ce.textContent = n; ce.hidden = !n; }
        }
        document.querySelectorAll("[data-subsinal]").forEach((el) => marcar(el, ctx.sinais[el.dataset.subsinal]));
        document.querySelectorAll("[data-subcont]").forEach((el) => { const n = Number(ctx.contagens[el.dataset.subcont]) || 0; el.textContent = n; el.hidden = !n; });
        const sb = document.querySelector("#app-nav-sinal"); if (sb) { sb.hidden = !pior; sb.className = "sinal" + (pior ? " " + pior : ""); }
        // número no ícone do app: contadores + avisos (cada aviso conta 1)
        if (window.Push) window.Push.badge(chaves.reduce((t, k) => t + (Number(ctx.contagens[k]) || 0) + (ctx.sinais[k] ? 1 : 0), 0));
      }
    };

    async function render() {
      let k = location.hash.replace("#", "");
      if (opcoes.apelidos && opcoes.apelidos[k] && paginas[opcoes.apelidos[k]]) k = opcoes.apelidos[k];
      if (!paginas[k]) k = chaves[0];
      const g = noGrupo[k];
      document.querySelectorAll("#app-nav a").forEach((a) => {
        if (a.dataset.g === g.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      $("#app-nav-atual").textContent = g.itens.length > 1 ? g.titulo + " · " + paginas[k].titulo : paginas[k].titulo;
      // cada abertura de página desenha num bloco próprio: se o usuário trocar de página antes de a anterior
      // terminar de carregar, a anterior escreve num bloco que já saiu da tela e não sobrescreve a nova
      const pag = $("#pagina");
      const alvo = document.createElement("div"); alvo.style.display = "contents";
      alvo.innerHTML = '<p class="carregando">Carregando…</p>';
      if (g.itens.length > 1) {
        const sub = document.createElement("nav"); sub.className = "grupo-abas"; sub.setAttribute("aria-label", g.titulo);
        sub.innerHTML = g.itens.map((x) => `<a href="#${x}"${x === k ? ' aria-current="page"' : ""}>${esc(paginas[x].subtitulo || paginas[x].titulo)}<span class="sinal" data-subsinal="${x}" hidden></span><span class="contador" data-subcont="${x}" hidden></span></a>`).join("");
        pag.replaceChildren(sub, alvo);
        const marcar = (el, r) => { el.hidden = !r; if (r) { el.className = "sinal " + r.cor; el.title = r.texto; } };
        sub.querySelectorAll("[data-subsinal]").forEach((el) => marcar(el, ctx.sinais[el.dataset.subsinal]));
        sub.querySelectorAll("[data-subcont]").forEach((el) => { const n = Number(ctx.contagens[el.dataset.subcont]) || 0; el.textContent = n; el.hidden = !n; });
      } else pag.replaceChildren(alvo);
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
