/* BIMCORE — Índice Global de Contribuição do Cooperado (IGCC)
   Regimento Interno, arts. 92 e 137; Plano Quinquenal, cap. 5.
   Cada cooperado vê o próprio; CA e Conselho Fiscal veem todos; o coordenador de projeto vê só a faixa. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API;
  const { $, esc, data, acao, confirmar, toast } = UI;
  const COMP = [
    ["eficiencia", "Eficiência", "peso_eficiencia", "Horas previstas na sua função ÷ horas aprovadas nos projetos. Usar menos ou o previsto dá 100."],
    ["pares", "Avaliação entre pares", "peso_pares", "Média das notas que a equipe deu ao concluir os projetos (qualidade, prazos, colaboração e conformidade com o BEP)."],
    ["retrabalho", "Sem retrabalho", "peso_retrabalho", "Começa em 100; cada apontamento que procedeu contra o seu trabalho tira 10 pontos (impeditivo tira 20). Janela maior (RI 137)."],
    ["assembleias", "Participação nas assembleias", "peso_assembleia", "Presença nas assembleias realizadas desde o seu ingresso. O RI 137 pede pelo menos 2/3."],
    ["contribuicoes", "Contribuições", "peso_contrib", "Biblioteca de objetos BIM, leitura, indicação de cooperados ou de contratos, registradas pelo Conselho de Administração (cada ponto vale 10, até 100)."]
  ];
  const nota = (v) => (v == null ? '<span class="hint">sem dados</span>' : `<b>${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>`);
  const cor = (v) => (v == null ? "" : v >= 75 ? "ok" : v >= 50 ? "warn" : "err");
  const det = (k, x) => ({
    eficiencia: x.eficiencia.realizadas ? `${UI.horas(x.eficiencia.previstas)} previstas · ${UI.horas(x.eficiencia.realizadas)} aprovadas` : "nenhum projeto com horas previstas",
    pares: `${x.pares.avaliacoes} avaliação(ões)`,
    retrabalho: `${x.retrabalho.apontamentos} apontamento(s) procedente(s) em ${x.periodo_retrabalho} meses`,
    assembleias: `${x.assembleias.presente} de ${x.assembleias.realizadas} · ${x.assembleias.reunioes_disciplina} Reunião(ões) de Disciplina`,
    contribuicoes: `${x.contribuicoes.pontos} ponto(s)`
  }[k]);

  function htmlComponentes(x, par) {
    return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Componente</th><th class="num">Peso</th><th class="num">Nota (0 a 100)</th><th>Base</th></tr></thead>
      <tbody>${COMP.map(([k, t, pk, h]) => `<tr><td>${esc(t)} ${UI.info(h, t)}</td><td class="num">${par ? Number(par[pk]).toLocaleString("pt-BR") : ""}</td><td class="num">${nota(x[k].nota)}</td><td>${esc(det(k, x))}</td></tr>`).join("")}</tbody></table></div>
      <p class="hint">Componentes sem dados ficam de fora e os pesos dos demais são redistribuídos. Período: últimos ${x.periodo_meses} meses (retrabalho: ${x.periodo_retrabalho}).</p>`;
  }

  /* Área do cooperado: o meu índice */
  async function renderMeu(el) {
    const [x, par, regs] = await Promise.all([API.igcc.meu(), API.igcc.parametros().catch(() => null), API.igcc.registros().catch(() => [])]);
    el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Desempenho</p><h1>Meu índice (IGCC)</h1></div></div>
      <p class="muted">O Índice Global de Contribuição combina eficiência, qualidade técnica e engajamento coletivo (Regimento, art. 92). Ele orienta a distribuição de trabalho, as bonificações coletivas, a avaliação entre pares e a candidatura à Presidência (art. 137). Só você, o Conselho de Administração e o Conselho Fiscal veem a sua nota; coordenadores de projeto veem apenas uma faixa (acima, na média ou abaixo).</p>
      <div class="kpis"><div class="kpi"><span class="rot">Seu índice</span><span class="val">${x.indice == null ? "—" : Number(x.indice).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span><span class="det">de 0 a 100${par && par.resolucao ? " · " + esc(par.resolucao) : " · pesos provisórios, a aprovar em Resolução do CA"}</span></div></div>
      <section class="painel"><h2>Como foi calculado</h2>${htmlComponentes(x, par)}</section>
      ${regs.length ? `<section class="painel"><h2>Registros</h2><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Qtde.</th></tr></thead>
        <tbody>${regs.map((r) => `<tr><td>${data(r.data)}</td><td>${esc({ retrabalho: "Retrabalho", eficiencia: "Eficiência de projeto", contribuicao: "Contribuição", disciplina: "Reunião de Disciplina" }[r.componente] || r.componente)}</td><td>${esc(r.descricao || "")}${r.registrado_nome ? `<span class="sub">${esc(r.registrado_nome)}</span>` : ""}</td><td class="num">${r.componente === "eficiencia" ? `${UI.horas(r.previstas)} / ${UI.horas(r.realizadas)}` : r.quantidade}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      <p class="hint">Discorda de algum registro? Fale com o Conselho de Administração ou use o canal de Denúncias e reclamações (Conselho Fiscal).</p>`;
  }

  /* Área interna: CA e Conselho Fiscal */
  async function renderTodos(el, ctx) {
    const me = ctx.sessao.perfil, ca = !!me.conselho_adm;
    let lista;
    try { lista = await API.igcc.todos(); } catch (e) { el.innerHTML = `<div class="pag-cab"><div><h1>Índice Global (IGCC)</h1></div></div><p class="vazio">${esc(e.message)}</p>`; return; }
    const [par, regs, pessoas] = await Promise.all([API.igcc.parametros(), API.igcc.registros().catch(() => []), API.proj.pessoas().catch(() => [])]);
    const media = (() => { const v = lista.map((l) => l.dados.indice).filter((x) => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null; })();
    el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Conselho de Administração e Conselho Fiscal</p><h1>Índice Global (IGCC)</h1></div></div>
      <p class="muted">Índice de cada cooperado (Regimento, arts. 92 e 137). O Conselho Fiscal valida o índice todo trimestre (Plano Quinquenal, 5.5). Média da cooperativa: <b>${media == null ? "—" : media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b>.</p>
      <section class="painel"><h2>Cooperados</h2>
        <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th class="num">Índice</th>${COMP.map(([, t]) => `<th class="num">${esc(t)}</th>`).join("")}<th></th></tr></thead>
          <tbody>${lista.map((l) => `<tr><td>${esc(l.nome)}</td><td class="num">${l.dados.indice == null ? "—" : `<span class="selo ${cor(l.dados.indice)}">${Number(l.dados.indice).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>`}</td>${COMP.map(([k]) => `<td class="num">${nota(l.dados[k].nota)}</td>`).join("")}<td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-ver="${l.perfil_id}">Detalhar</button></td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="painel"><h2>Pesos e período</h2>
        <p class="hint">Os pesos são fixados por Resolução do Conselho de Administração e divulgados com antecedência (RI 137, §2º). Os valores abaixo são uma proposta inicial.</p>
        <form id="ig-par" class="form-grid" novalidate>
          ${COMP.map(([, t, pk]) => `<div class="field"><label for="ig-${pk}">${esc(t)}</label><input class="input" id="ig-${pk}" type="number" min="0" max="100" step="1" value="${Number(par[pk])}"${ca ? "" : " disabled"}></div>`).join("")}
          <div class="field"><label for="ig-meses">Período (meses)</label><input class="input" id="ig-meses" type="number" min="3" max="36" value="${par.meses}"${ca ? "" : " disabled"}></div>
          <div class="field"><label for="ig-mr">Período do retrabalho (meses)</label><input class="input" id="ig-mr" type="number" min="3" max="36" value="${par.meses_retrabalho}"${ca ? "" : " disabled"}></div>
          <div class="field full"><label for="ig-res">Resolução do CA que aprovou</label><input class="input" id="ig-res" maxlength="200" value="${esc(par.resolucao || "")}" placeholder="Ex.: Resolução CA nº 01/2027"${ca ? "" : " disabled"}></div>
          ${ca ? '<div class="full"><button class="btn btn-primary" type="submit" id="ig-par-btn">Salvar pesos</button></div>' : ""}
        </form>${par.atualizado_nome ? `<p class="hint">Atualizado por ${esc(par.atualizado_nome)} em ${UI.dataHora(par.atualizado_em)}.</p>` : ""}
      </section>
      ${ca ? `<section class="painel"><h2>Registrar contribuição ou Reunião de Disciplina</h2>
        <form id="ig-reg" class="form-grid" novalidate>
          <div class="field"><label for="ir-p">Cooperado</label><select class="input" id="ir-p">${pessoas.filter((x) => x.id !== me.id).map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join("")}</select></div>
          <div class="field"><label for="ir-c">Tipo</label><select class="input" id="ir-c"><option value="contribuicao">Contribuição</option><option value="disciplina">Presença em Reunião de Disciplina</option></select></div>
          <div class="field"><label for="ir-q">Pontos</label><input class="input" id="ir-q" type="number" min="1" max="10" value="1"></div>
          <div class="field"><label for="ir-d">Data</label><input class="input" id="ir-d" type="date" value="${UI.hoje()}" max="${UI.hoje()}"></div>
          <div class="field full"><label for="ir-x">Descrição</label><input class="input" id="ir-x" maxlength="300" placeholder="Ex.: família paramétrica de esquadria para a biblioteca; indicou o contrato da Prefeitura X"></div>
          <div class="full"><button class="btn btn-primary" type="submit" id="ir-btn">Registrar</button></div></form>
        <p class="hint">Ninguém registra para si mesmo. O cooperado vê o registro no seu índice.</p></section>` : ""}
      <section class="painel"><h2>Registros</h2>${regs.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Cooperado</th><th>Tipo</th><th>Descrição</th><th class="num">Qtde.</th><th></th></tr></thead>
        <tbody>${regs.slice(0, 300).map((r) => `<tr><td>${data(r.data)}</td><td>${esc((pessoas.find((x) => x.id === r.perfil_id) || {}).nome || "")}</td><td>${esc({ retrabalho: "Retrabalho", eficiencia: "Eficiência", contribuicao: "Contribuição", disciplina: "Reunião de Disciplina" }[r.componente])}</td><td>${esc(r.descricao || "")}<span class="sub">${esc(r.registrado_nome || "")}</span></td>
          <td class="num">${r.componente === "eficiencia" ? `${UI.horas(r.previstas)} / ${UI.horas(r.realizadas)}` : r.quantidade}</td><td class="acoes-celula">${ca && ["contribuicao", "disciplina"].includes(r.componente) ? `<button class="btn btn-ghost btn-sm" data-delreg="${r.id}">Apagar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhum registro ainda.</p>'}</section>`;
    el.onclick = async (e) => {
      const bv = e.target.closest("[data-ver]"), bd = e.target.closest("[data-delreg]");
      if (bv) { const l = lista.find((x) => x.perfil_id === bv.dataset.ver); UI.modal(`<h2>${esc(l.nome)}</h2><p>Índice: <b>${l.dados.indice == null ? "—" : l.dados.indice}</b></p>${htmlComponentes(l.dados, par)}<div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button></div>`); }
      if (bd) { if (!(await confirmar("Apagar este registro?", "Apagar"))) return; if (await acao(bd, () => API.igcc.excluirRegistro(bd.dataset.delreg), "Registro apagado.")) renderTodos(el, ctx); }
    };
    if (ca) {
      $("#ig-par").addEventListener("submit", async (e) => {
        e.preventDefault(); const d = {}; COMP.forEach(([, , pk]) => { d[pk] = Number($("#ig-" + pk).value) || 0; });
        if (!Object.values(d).some((v) => v > 0)) return toast("Pelo menos um peso precisa ser maior que zero.", "err");
        Object.assign(d, { meses: Number($("#ig-meses").value) || 12, meses_retrabalho: Number($("#ig-mr").value) || 24, resolucao: $("#ig-res").value.trim() || null });
        if (await acao($("#ig-par-btn"), () => API.igcc.salvarParametros(d), "Pesos salvos.")) renderTodos(el, ctx);
      });
      $("#ig-reg").addEventListener("submit", async (e) => {
        e.preventDefault(); const d = { perfil_id: $("#ir-p").value, componente: $("#ir-c").value, quantidade: Math.max(1, Math.min(10, Number($("#ir-q").value) || 1)), data: $("#ir-d").value || UI.hoje(), descricao: $("#ir-x").value.trim() };
        if (d.descricao.length < 3) return toast("Descreva a contribuição.", "err");
        if (await acao($("#ir-btn"), () => API.igcc.registrar(d), "Registrado.")) renderTodos(el, ctx);
      });
    }
  }

  window.IGCC = { renderMeu, renderTodos };
})();
