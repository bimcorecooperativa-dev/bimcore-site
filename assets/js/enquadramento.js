/* BIMCORE — Enquadramento: validação de formação e experiência pelo Conselho de Administração
   (Estatuto, art. 8º, V; Regimento Interno, arts. 71, I, d, e 89). */
(function () {
  "use strict";
  const UI = window.UI, API = window.API, Fin = window.Fin;
  const { $, esc, data, dataHora, acao, toast } = UI;
  const CARGOS = { presidente: "Presidente do CA", gestao_tecnica: "Gestão Técnica, BIM e Qualidade", financeira: "Área Financeira e de Fundos", institucional: "Área Institucional, Contratos e Relações Externas", conselheiro: "Conselheiro(a)" };
  let filtro = "pendentes";

  const quem = (x) => x.analise_nome ? `${esc(x.analise_nome)}${x.analise_cargo ? ` — ${esc(x.analise_cargo)}` : ""}${x.analise_em ? `, ${dataHora(x.analise_em)}` : ""}` : "";
  const selo = (x) => x.status === "aprovada" ? `<span class="selo ok">validado</span><span class="sub">por ${quem(x)}</span>`
    : x.status === "recusada" ? `<span class="selo warn">em exigência</span><span class="sub">${esc(x.motivo || "")}${x.analise_nome ? ` · por ${quem(x)}` : ""}</span>` : '<span class="selo warn">em análise</span>';

  async function contador(ctx) {
    if (!ctx.ca) return 0;
    const t = await API.exp.todos();
    return t.habilitacoes.filter((h) => h.status === "pendente").length + t.experiencias.filter((x) => x.status === "pendente").length;
  }

  async function render(el, ctx) {
    const d = await API.exp.painelCA();
    const base = { parametros: d.parametros || {}, habilitacoes: d.habilitacoes, experiencias: d.experiencias, internas: d.internas, cooperados: d.cooperados };
    const meu = d.cooperados.find((c) => c.perfil_id === ctx.sessao.perfil.id);
    const pode = !!ctx.ca;
    const pend = (c) => d.habilitacoes.concat(d.experiencias).filter((x) => x.fin_cooperado_id === c.id && x.status === "pendente").length;
    const lista = d.cooperados.filter((c) => c.situacao !== "desligado").filter((c) => filtro === "todos" || pend(c) > 0)
      .sort((a, b) => pend(b) - pend(a) || a.nome.localeCompare(b.nome));
    const docs = (rid) => d.comprovantes.filter((x) => x.ref_id === rid).map((x) => `<button class="link-botao" data-doc="${x.id}">${esc(x.nome_arquivo)}</button>`).join("<br>") || '<span class="sub">sem documento</span>';
    const botoes = (tab, x, c) => !pode ? "" : meu && meu.id === c.id ? '<span class="hint">seu registro</span>'
      : `<button class="btn btn-primary btn-sm" data-val="${tab}:${x.id}:aprovada">Validar</button> <button class="btn btn-ghost btn-sm" data-val="${tab}:${x.id}:recusada">Pôr em exigência</button>`;
    const totalPend = d.cooperados.reduce((t, c) => t + pend(c), 0);
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Conselho de Administração</p><h1>Enquadramento</h1></div></div>
      <p class="muted">A categoria de remuneração depende da formação e da experiência comprovada. Quem valida é o <b>Conselho de Administração</b> (Estatuto, art. 8º, V; Regimento, art. 89), com o apoio do Conselheiro de Gestão Técnica (art. 71, I, d). Cada análise fica registrada com o nome e o cargo de quem analisou. Ninguém valida o próprio registro.</p>
      ${pode ? "" : '<div class="notice warn">Você vê os registros, mas só membros do Conselho de Administração validam. A marcação é feita em Cooperados.</div>'}
      <details class="asm-passo"><summary>Como analisar</summary><ol>
        <li>Abra os documentos de cada formação (diploma, registro no conselho) e confirme a data de conclusão.</li>
        <li>Nas experiências, conte só o que tem relação com a formação indicada. Períodos em outra atividade não contam.</li>
        <li>Se faltar documento ou algo estiver errado, use <b>Pôr em exigência</b> e escreva o que falta: o cooperado vê na hora.</li>
        <li>Validado, o site recalcula sozinho a categoria e o valor-hora a partir do mês seguinte. A experiência na BIMCORE conta pelas horas lançadas.</li></ol></details>
      <div class="sol-acoes" style="margin:1rem 0"><div class="field" style="flex:0 1 16rem"><label for="eq-f">Mostrar</label><select class="input" id="eq-f">
        <option value="pendentes"${filtro === "pendentes" ? " selected" : ""}>Com análise pendente (${totalPend})</option><option value="todos"${filtro === "todos" ? " selected" : ""}>Todos os cooperados</option></select></div></div>
      ${lista.length ? lista.map((c) => {
        const habs = d.habilitacoes.filter((h) => h.fin_cooperado_id === c.id), exps = d.experiencias.filter((x) => x.fin_cooperado_id === c.id);
        const habPor = {}; habs.forEach((h) => { habPor[h.id] = h; });
        let enq = null; try { enq = Fin.enquadramento(c, base, Fin.mesDe(UI.hoje())); } catch (e) { enq = null; }
        return `<section class="painel"><div class="painel-cab"><h2>${esc(c.nome)}</h2>${pend(c) ? `<span class="selo warn">${pend(c)} pendente(s)</span>` : ""}</div>
          ${enq ? `<p class="hint">Enquadramento hoje: <b>${esc(enq.categoria || "pendente")}</b>${enq.anos != null ? ` · ${Number(enq.anos).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ano(s) comprovados` : ""}${enq.habilitacao ? ` · ${esc(enq.habilitacao.titulo)}` : ""}</p>` : ""}
          <h3 class="mini-tit">Formações</h3>
          ${habs.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Formação</th><th>Conclusão / registro</th><th>Documentos</th><th>Situação</th><th></th></tr></thead>
            <tbody>${habs.map((h) => `<tr><td>${esc(h.titulo)}<span class="sub">${esc(Fin.NIVEIS[h.nivel] || "")} · ${esc(h.conselho || "")}</span></td><td>${data(h.data_habilitacao)}${h.registro ? `<span class="sub">${esc(h.registro)}</span>` : ""}</td><td>${docs(h.id)}</td><td>${selo(h)}</td><td class="acoes-celula">${botoes("habilitacoes", h, c)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhuma formação enviada.</p>'}
          <h3 class="mini-tit">Experiências</h3>
          ${exps.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Experiência</th><th>Formação</th><th>Período</th><th>Documentos</th><th>Situação</th><th></th></tr></thead>
            <tbody>${exps.map((x) => `<tr><td>${esc(x.descricao)}</td><td>${esc((habPor[x.habilitacao_id] || {}).titulo || "—")}</td><td>${data(x.inicio)} a ${x.fim ? data(x.fim) : "hoje"}</td><td>${docs(x.id)}</td><td>${selo(x)}</td><td class="acoes-celula">${botoes("experiencias", x, c)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhuma experiência enviada.</p>'}
        </section>`;
      }).join("") : `<p class="vazio">${filtro === "pendentes" ? "Nenhuma análise pendente." : "Nenhum cooperado cadastrado."}</p>`}`;
    $("#eq-f").onchange = (e) => { filtro = e.target.value; render(el, ctx); };
    el.onclick = async (e) => {
      const dv = e.target.closest("[data-doc]");
      if (dv) { const cp = d.comprovantes.find((y) => y.id === dv.dataset.doc); const url = await acao(null, () => API.exp.link(cp)); if (url) window.open(url, "_blank", "noopener"); return; }
      const b = e.target.closest("[data-val]"); if (!b) return;
      const [tab, rid, st] = b.dataset.val.split(":");
      const mot = st === "recusada" ? await new Promise((okk) => {
        const mm = UI.modal(`<h2>Pôr em exigência</h2><div class="field"><label for="mv-m">O que falta ou o que precisa ser corrigido (o cooperado verá)</label><input class="input" id="mv-m" maxlength="200" placeholder="Ex.: enviar a carteira de trabalho deste período; período fora da área não conta"></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-danger btn-sm" id="mv-ok">Confirmar</button></div>`, () => okk(undefined));
        $("#mv-ok", mm.el).onclick = () => { const v = $("#mv-m", mm.el).value.trim(); if (!v) return toast("Escreva o que falta.", "err"); okk(v); mm.fechar(); };
      }) : null;
      if (st === "recusada" && mot === undefined) return;
      if (await acao(b, () => API.exp.analisar(tab, rid, st, mot), st === "aprovada" ? "Validado." : "Colocado em exigência. O cooperado vê o que falta.")) { if (ctx.atualizarContadores) ctx.atualizarContadores(); render(el, ctx); }
    };
  }

  window.Enquadramento = { render, contador, CARGOS };
})();
