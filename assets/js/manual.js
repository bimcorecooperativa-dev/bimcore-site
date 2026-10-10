/* BIMCORE — Manual do site: sempre a versão mais recente, publicada pela manutenção do site */
(function () {
  "use strict";
  const UI = window.UI, API = window.API;
  const { esc, data } = UI;
  const PERMITIDAS = new Set(["H1", "H2", "H3", "P", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "BR", "SPAN", "A", "CODE"]);

  // limpa o HTML: só tags de texto, sem atributos (exceto id dos títulos e href seguro)
  function limpar(html) {
    const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
    const raiz = doc.body.firstChild;
    const passar = (n) => {
      [...n.childNodes].forEach((c) => {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1) { c.remove(); return; }
        if (c.tagName === "INPUT") { c.replaceWith(doc.createTextNode("☐ ")); return; }
        if (c.tagName === "TIME") { c.replaceWith(doc.createTextNode(c.textContent)); return; }
        if (!PERMITIDAS.has(c.tagName)) { c.replaceWith(...c.childNodes); passar(n); return; }
        [...c.attributes].forEach((a) => {
          const ok = (a.name === "id" && /^H[1-3]$/.test(c.tagName)) || (a.name === "href" && c.tagName === "A" && /^(https?:|#|mailto:)/i.test(a.value));
          if (!ok) c.removeAttribute(a.name);
        });
        if (c.tagName === "A" && /^https?:/i.test(c.getAttribute("href") || "")) { c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener"); }
        if (c.tagName === "TABLE") { c.className = "tabela"; const w = doc.createElement("div"); w.className = "tabela-wrap"; c.replaceWith(w); w.appendChild(c); }
        passar(c);
      });
    };
    passar(raiz);
    // tira o título e a linha de autoria do documento (a página já tem título e data)
    const h1 = raiz.querySelector("h1"); if (h1) { const nx = h1.nextElementSibling; h1.remove(); if (nx && nx.tagName === "P" && /@|\d{4}-\d{2}-\d{2}/.test(nx.textContent) && nx.textContent.length < 80) nx.remove(); }
    return raiz.innerHTML;
  }

  async function render(el) {
    const m = await API.manual.obter().catch(() => null);
    if (!m || !m.html) {
      el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Ajuda</p><h1>Manual do site</h1></div></div><p class="vazio">O manual ainda não foi publicado.</p>`;
      return;
    }
    const corpo = limpar(m.html);
    const tmp = document.createElement("div"); tmp.innerHTML = corpo;
    const secoes = [...tmp.querySelectorAll("h2")].map((h) => ({ id: h.id, t: h.textContent }));
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Ajuda</p><h1>Manual do site</h1></div>
        <button class="btn btn-ghost permitido" id="man-imp">Imprimir ou salvar em PDF</button></div>
      <p class="muted">Versão atualizada em <b>${data(String(m.atualizado_em).slice(0, 10))}</b>${m.observacao ? ` · ${esc(m.observacao)}` : ""}. Consulte sempre por aqui: quando o site muda, o manual é atualizado nesta página.</p>
      ${secoes.length ? `<nav class="painel manual-indice" aria-label="Seções do manual"><h2>Seções</h2><ul>${secoes.map((s) => `<li><a href="#manual" data-ir="${esc(s.id)}">${esc(s.t)}</a></li>`).join("")}</ul></nav>` : ""}
      <article class="painel manual-texto">${corpo}</article>`;
    el.onclick = (e) => {
      const a = e.target.closest("[data-ir]");
      if (a) { e.preventDefault(); const alvo = el.querySelector(`[id="${CSS.escape(a.dataset.ir)}"]`); if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (e.target.closest("#man-imp")) {
        const w = window.open("", "_blank"); if (!w) return UI.toast("Permita a abertura de janelas para imprimir.", "err");
        w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual do site da BIMCORE</title>
          <style>body{font:14px/1.55 Arial,Helvetica,sans-serif;color:#13202e;margin:32px auto;max-width:780px;padding:0 16px}h1{font-size:24px}h2{font-size:19px;margin-top:28px;border-bottom:1px solid #ccd;padding-bottom:4px}h3{font-size:16px}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #ccd;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eef2f7}@media print{h2{break-after:avoid}tr{break-inside:avoid}}</style></head>
          <body><h1>Manual do site da BIMCORE</h1><p>Versão de ${data(String(m.atualizado_em).slice(0, 10))}. A versão mais recente fica sempre em bimcore.com.br, na página Manual do site.</p>${corpo}</body></html>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
      }
    };
  }

  window.Manual = { render, limpar };
})();
