/* BIMCORE — Financeiro como sistema (etapa 1): a tesouraria lança tudo no site.
   Abas: Resumo, Despesas, Pagamentos e aportes, Cadastro, Configurações. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API, Fin = window.Fin;
  const { $, esc, data, dataHora, moeda, acao, confirmar, toast } = UI;
  const CATEGORIAS = ["Abertura e registro", "Conselho profissional", "Material e divulgação", "Capacitação", "Capital social", "Taxas e encargos", "Outras"];
  const TIPOS_FORM = [
    ["despesa", "Pagamento de despesa"], ["aporte", "Aporte à cooperativa (sem despesa)"], ["contribuicao", "Contribuição mensal"],
    ["integralizacao", "Integralização de quotas"], ["abatimento", "Abatimento com aportes (só quotas iniciais)"]
  ];
  const ORIGEM = { tesouraria: "Tesouraria", pix: "Pix pelo site", abatimento: "Abatimento pelo site", planilha: "Planilha antiga" };
  let aba = "resumo";
  let filtroCoop = "";

  const lerValor = (t) => { t = String(t || "").replace(/[R$\s]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); return Fin.centavos(Number(t)); };
  const brl = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const hojeISO = () => UI.hoje();

  async function render(el, ctx) {
    const [base, movs, perfis] = await Promise.all([API.fin.tudo(), API.movimentos.todos().catch(() => []), API.cooperados.listar().catch(() => [])]);
    const calc = Fin.calcular(base);
    const coops = base.cooperados;
    const porId = {}; coops.forEach((c) => { porId[c.id] = c; });
    const despPorId = {}; base.despesas.forEach((d) => { despPorId[d.id] = d; });
    const perfilPorId = {}; perfis.forEach((p) => { perfilPorId[p.id] = p; });
    const aguardando = movs.filter((m) => m.status === "aguardando");
    const semCadastro = movs.filter((m) => m.status === "confirmado" && !m.lancado && !m.incorporado_em);
    const fech = Fin.mesFechamento(base.parametros);
    const recarregar = () => render(el, ctx);

    const abas = [["resumo", "Resumo"], ["despesas", "Despesas"], ["pagamentos", "Pagamentos e aportes"], ["cadastro", "Cadastro"], ["config", "Configurações"]];
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Tesouraria</p><h1>Financeiro</h1></div>
        <button class="btn btn-ghost" id="t-exportar">Exportar para Excel</button></div>
      <p class="muted">Contas calculadas pelo Estatuto até <b>${Fin.nomeMes(fech)}</b>${base.parametros.fechamento ? " (mês de fechamento fixado em Configurações)" : " (atualiza sozinho a cada mês)"}. Cada lançamento aparece na hora na "Minha conta" do cooperado.</p>
      <nav class="subabas" role="tablist">${abas.map(([k, t]) => `<button role="tab" data-aba="${k}" aria-selected="${aba === k}">${t}${k === "resumo" && aguardando.length ? ` <span class="contador">${aguardando.length}</span>` : ""}</button>`).join("")}</nav>
      <div id="t-corpo"></div>`;
    el.querySelectorAll("[data-aba]").forEach((b) => { b.onclick = () => { aba = b.dataset.aba; recarregar(); }; });
    $("#t-exportar").onclick = (ev) => acao(ev.currentTarget, () => exportar(base, calc, perfilPorId), "Planilha exportada.");
    const corpo = $("#t-corpo");

    /* ---------------- Resumo ---------------- */
    if (aba === "resumo") {
      const lista = coops.map((c) => calc[c.id]).sort((a, b) => a.cooperado_nome.localeCompare(b.cooperado_nome));
      const soma = (k) => lista.reduce((t, p) => t + Number(p[k] || 0), 0);
      corpo.innerHTML = `
        <div class="kpis">
          <div class="kpi"><span class="rot">Em aberto (todos)</span><span class="val" style="color:${soma("valor_em_aberto") > 0.005 ? "var(--err)" : "var(--ok)"}">${moeda(soma("valor_em_aberto"))}</span><span class="det">${lista.filter((p) => p.valor_em_aberto > 0.005).length} cooperado(s) com pendência</span></div>
          <div class="kpi"><span class="rot">Capital integralizado</span><span class="val">${moeda(soma("capital_integralizado"))}</span><span class="det">de ${moeda(soma("capital_subscrito"))} subscritos</span></div>
          <div class="kpi"><span class="rot">Aportes dos cooperados</span><span class="val">${moeda(soma("outros_creditos"))}</span><span class="det">Devolvidos só no desligamento</span></div>
          <div class="kpi"><span class="rot">Pix aguardando</span><span class="val">${aguardando.length}</span><span class="det">${aguardando.length ? moeda(aguardando.reduce((t, m) => t + Number(m.valor), 0)) : "Nada para conferir"}</span></div>
        </div>
        ${semCadastro.length ? `<div class="notice warn">${semCadastro.length} Pix confirmado(s) de quem ainda não tem cadastro financeiro ligado à conta do site. Ligue a conta em <b>Cadastro</b> e eles entram sozinhos.</div>` : ""}
        ${aguardando.length ? `<section class="painel acerto">
          <div class="painel-cab"><h2>Pix aguardando confirmação</h2><span class="selo warn">${aguardando.length}</span></div>
          <p class="muted">Confira no extrato do BTG se o Pix caiu (valor, nome de quem pagou e, se aparecer, o identificador). Ao confirmar, o valor entra sozinho nos lançamentos do cooperado.</p>
          <div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Cooperado</th><th>Avisado em</th><th class="num">Valor</th><th>Identificador</th><th>Quita</th><th></th></tr></thead>
            <tbody>${aguardando.map((m) => `<tr><td>${esc(m.cooperado_nome)}</td><td>${dataHora(m.criado_em)}</td><td class="num">${moeda(m.valor)}</td><td>BIMC${esc(m.codigo)}</td>
              <td>${(m.alocacao || []).map((a) => esc(Fin.descreverItem(a)) + " " + moeda(a.valor)).join("<br>")}</td>
              <td class="acoes-celula">${m.comprovante ? `<button class="btn btn-ghost btn-sm" data-comp="${m.id}">Comprovante</button> ` : ""}<button class="btn btn-primary btn-sm" data-confirmar="${m.id}">Confirmar</button> <button class="btn btn-danger btn-sm" data-recusar="${m.id}">Recusar</button></td></tr>`).join("")}</tbody>
          </table></div>
        </section>` : ""}
        <section class="painel">
          <h2>Posição de cada cooperado</h2>
          ${lista.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Cooperado</th><th class="num">Capital integralizado</th><th class="num">Em aberto</th><th class="num">Aportes</th><th class="num">Total contribuído</th><th></th></tr></thead>
            <tbody>${lista.map((p) => `<tr>
              <td>${esc(p.cooperado_nome)}<span class="sub">${p.cooperado_id ? "conta no site ligada" : "ainda sem conta no site"}</span></td>
              <td class="num">${moeda(p.capital_integralizado)}<span class="sub">de ${moeda(p.capital_subscrito)}</span></td>
              <td class="num">${p.valor_em_aberto > 0.005 ? `<span class="selo err">${moeda(p.valor_em_aberto)}</span><span class="sub">${p.meses_em_atraso} mês(es)</span>` : '<span class="selo ok">em dia</span>'}</td>
              <td class="num">${moeda(p.outros_creditos)}</td><td class="num">${moeda(p.contribuicoes_pagas)}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-extrato="${p.fin_cooperado_id}">Extrato</button></td></tr>`).join("")}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${moeda(soma("capital_integralizado"))}</td><td class="num">${moeda(soma("valor_em_aberto"))}</td><td class="num">${moeda(soma("outros_creditos"))}</td><td class="num">${moeda(soma("contribuicoes_pagas"))}</td><td></td></tr></tfoot>
          </table></div>` : '<p class="vazio">Nenhum cooperado cadastrado. Comece pela aba Cadastro.</p>'}
        </section>`;
    }

    /* ---------------- Despesas ---------------- */
    if (aba === "despesas") {
      const pagoPor = (id) => base.pagamentos.filter((p) => p.despesa_id === id).reduce((t, p) => t + Number(p.valor), 0);
      corpo.innerHTML = `
        <section class="painel">
          <div class="painel-cab"><h2>Despesas da cooperativa</h2><button class="btn btn-primary btn-sm" id="t-nova-desp">Nova despesa</button></div>
          <p class="hint">Só gera débito o que for <b>cobrado dos cooperados</b> (chamada aprovada, art. 9º, I). Despesa não cobrada: quem pagar fica com crédito de aporte, devolvido só no desligamento. Quem pagou cada despesa é lançado em <b>Pagamentos e aportes</b>.</p>
          ${base.despesas.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Cobrança</th><th class="num">Pago por cooperados</th><th></th></tr></thead>
            <tbody>${base.despesas.map((d) => `<tr><td>${d.data ? data(d.data) : '<span class="selo warn">sem data</span>'}</td>
              <td>${esc(d.descricao)}<span class="sub">${esc(d.categoria || "")}${d.observacao ? " · " + esc(d.observacao) : ""}</span></td>
              <td class="num">${moeda(d.valor)}</td>
              <td>${d.cobrar ? `Cobrada de ${d.participantes.length}<span class="sub">${moeda(Fin.centavos(d.valor / Math.max(1, d.participantes.length)))} cada</span>` : "Não cobrada<span class=\"sub\">quem pagou fica com aporte</span>"}</td>
              <td class="num">${moeda(pagoPor(d.id))}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-ed-desp="${d.id}">Editar</button> <button class="btn btn-danger btn-sm" data-ex-desp="${d.id}">Excluir</button></td></tr>`).join("")}</tbody>
          </table></div>` : '<p class="vazio">Nenhuma despesa lançada.</p>'}
        </section>`;
      $("#t-nova-desp").onclick = () => formDespesa(null);
    }

    /* ---------------- Pagamentos ---------------- */
    if (aba === "pagamentos") {
      const lista = base.pagamentos.filter((p) => !filtroCoop || p.fin_cooperado_id === filtroCoop);
      const ref = (p) => p.tipo === "despesa" ? esc((despPorId[p.despesa_id] || {}).descricao || "despesa removida") : p.tipo === "contribuicao" ? Fin.nomeMes(Fin.mesDe(p.mes_ref)) : "";
      corpo.innerHTML = `
        <section class="painel">
          <div class="painel-cab"><h2>Pagamentos e aportes</h2><button class="btn btn-primary btn-sm" id="t-novo-pag">Novo lançamento</button></div>
          <div class="filtros"><div class="field"><label for="t-filtro">Cooperado</label><select class="input" id="t-filtro"><option value="">Todos</option>${coops.map((c) => `<option value="${c.id}" ${filtroCoop === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></div></div>
          <p class="hint">Pix confirmados e abatimentos feitos pelos cooperados entram aqui sozinhos.</p>
          ${lista.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Data</th><th>Cooperado</th><th>Tipo</th><th class="num">Valor</th><th>Origem</th><th></th></tr></thead>
            <tbody>${lista.map((p) => `<tr><td>${p.data ? data(p.data) : '<span class="selo warn">sem data</span>'}</td><td>${esc((porId[p.fin_cooperado_id] || {}).nome || "—")}</td>
              <td>${esc(Fin.TIPOS_PAG[p.tipo] || p.tipo)}<span class="sub">${ref(p)}${p.observacao ? (ref(p) ? " · " : "") + esc(p.observacao) : ""}</span></td>
              <td class="num">${moeda(p.valor)}</td><td>${esc(ORIGEM[p.origem] || p.origem)}<span class="sub">${esc(p.criado_nome || "")}</span></td>
              <td class="acoes-celula">${p.origem === "tesouraria" || p.origem === "planilha" ? `<button class="btn btn-ghost btn-sm" data-ed-pag="${p.id}">Editar</button> <button class="btn btn-danger btn-sm" data-ex-pag="${p.id}">Excluir</button>` : ""}</td></tr>`).join("")}</tbody>
            <tfoot><tr><td>Total</td><td></td><td></td><td class="num">${moeda(lista.reduce((t, p) => t + Number(p.valor), 0))}</td><td></td><td></td></tr></tfoot>
          </table></div>` : '<p class="vazio">Nenhum lançamento.</p>'}
        </section>`;
      $("#t-filtro").onchange = (e) => { filtroCoop = e.target.value; recarregar(); };
      $("#t-novo-pag").onclick = () => formPagamento(null);
    }

    /* ---------------- Cadastro ---------------- */
    if (aba === "cadastro") {
      corpo.innerHTML = `
        <section class="painel">
          <div class="painel-cab"><h2>Cadastro financeiro dos cooperados</h2><button class="btn btn-primary btn-sm" id="t-novo-coop">Adicionar cooperado</button></div>
          <p class="hint">Todo cooperado tem cadastro aqui, mesmo sem conta no site. Quando ele criar a conta, ela é ligada sozinha pelo e-mail ou pelo nome; você também pode ligar manualmente em Editar.</p>
          ${coops.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Cooperado</th><th>Conta no site</th><th class="num">Quotas iniciais</th><th class="num">Integralizado na admissão</th><th>Admissão</th><th>Situação</th><th></th></tr></thead>
            <tbody>${coops.map((c) => `<tr><td>${esc(c.nome)}<span class="sub">${esc(c.cargo || "")}</span></td>
              <td>${c.perfil_id ? `<span class="selo ok">ligada</span><span class="sub">${esc((perfilPorId[c.perfil_id] || {}).email || c.email || "")}</span>` : `<span class="selo">sem conta</span><span class="sub">${esc(c.email || "e-mail não informado")}</span>`}</td>
              <td class="num">${c.quotas_iniciais}</td><td class="num">${moeda(c.integralizado_admissao)}${c.compensar_aportes ? '<span class="sub">aportes usados na integralização</span>' : ""}</td>
              <td>${data(c.data_admissao)}</td><td>${c.situacao === "ativo" ? '<span class="selo ok">ativo</span>' : `<span class="selo">desligado</span><span class="sub">${data(c.data_desligamento)}</span>`}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-ed-coop="${c.id}">Editar</button></td></tr>`).join("")}</tbody>
          </table></div>` : '<p class="vazio">Nenhum cooperado cadastrado.</p>'}
        </section>`;
      $("#t-novo-coop").onclick = () => formCooperado(null);
    }

    /* ---------------- Configurações ---------------- */
    if (aba === "config") {
      const par = base.parametros;
      corpo.innerHTML = `
        <section class="painel"><h2>Parâmetros do Estatuto</h2>
          <form id="t-par" class="form-grid" novalidate>
            <div class="field"><label for="cp-quota">Valor da quota-parte (R$)</label><input class="input" id="cp-quota" inputmode="decimal" value="${brl(par.quota)}"><span class="hint">Art. 23. Reajuste em janeiro pelo INPC.</span></div>
            <div class="field"><label for="cp-min">Quotas mínimas na admissão</label><input class="input" id="cp-min" type="number" min="1" value="${par.quotas_minimas}"><span class="hint">Art. 25.</span></div>
            <div class="field"><label for="cp-ini">Início da contribuição mensal</label><input class="input" id="cp-ini" type="month" value="${Fin.mesDe(par.contrib_inicio)}"><span class="hint">Art. 23, §4º. Sem retirada, a contribuição é de 1 quota por mês.</span></div>
            <div class="field"><label for="cp-fech">Mês de fechamento</label><input class="input" id="cp-fech" type="month" value="${par.fechamento ? Fin.mesDe(par.fechamento) : ""}"><span class="hint">Deixe vazio para atualizar sozinho no mês atual. Preencha só para segurar as cobranças num mês já conferido.</span></div>
            <div class="full"><button class="btn btn-primary" id="cp-btn" type="submit">Salvar</button></div>
          </form>
          ${par.atualizado_nome ? `<p class="hint">Última alteração: ${esc(par.atualizado_nome)}${par.atualizado_em ? " em " + dataHora(par.atualizado_em) : ""}.</p>` : ""}
        </section>`;
      $("#t-par").addEventListener("submit", async (e) => {
        e.preventDefault();
        const quota = lerValor($("#cp-quota").value), min = Number($("#cp-min").value), ini = $("#cp-ini").value, fe = $("#cp-fech").value;
        if (!(quota > 0) || !(min > 0) || !ini) return toast("Preencha quota, quotas mínimas e início.", "err");
        const ok = await acao($("#cp-btn"), () => API.fin.salvarParametros({ quota, quotas_minimas: min, contrib_inicio: ini + "-01", fechamento: fe ? fe + "-01" : null }), "Parâmetros salvos.");
        if (ok) recarregar();
      });
    }

    /* ---------------- formulários ---------------- */
    function formDespesa(d) {
      const ativos = coops.filter((c) => c.situacao === "ativo");
      const part = new Set(d ? d.participantes : ativos.map((c) => c.id));
      const m = UI.modal(`
        <h2>${d ? "Editar despesa" : "Nova despesa"}</h2>
        <div class="form-grid">
          <div class="field"><label for="fd-data">Data</label><input class="input" id="fd-data" type="date" value="${d && d.data ? d.data : hojeISO()}"></div>
          <div class="field"><label for="fd-valor">Valor total (R$)</label><input class="input" id="fd-valor" inputmode="decimal" value="${d ? brl(d.valor) : ""}"></div>
          <div class="field full"><label for="fd-desc">Descrição</label><input class="input" id="fd-desc" maxlength="200" value="${esc(d ? d.descricao : "")}"></div>
          <div class="field full"><label for="fd-cat">Categoria</label><select class="input" id="fd-cat">${CATEGORIAS.map((c) => `<option ${d && d.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        </div>
        <label class="ciente"><input type="checkbox" id="fd-cobrar" ${d && d.cobrar ? "checked" : ""}> <span>Cobrar dos cooperados (chamada aprovada pela Assembleia ou pelo Conselho, art. 9º, I)</span></label>
        <div id="fd-part" class="part-lista" ${d && d.cobrar ? "" : "hidden"}>
          <p class="hint">Quem divide esta despesa: <b id="fd-cada"></b></p>
          ${coops.map((c) => `<label class="ciente"><input type="checkbox" value="${c.id}" ${part.has(c.id) ? "checked" : ""}> <span>${esc(c.nome)}${c.situacao !== "ativo" ? " (desligado)" : ""}</span></label>`).join("")}
        </div>
        <div class="field"><label for="fd-obs">Observação</label><input class="input" id="fd-obs" maxlength="500" value="${esc(d ? d.observacao || "" : "")}"></div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="fd-ok">Salvar</button></div>`);
      const atualiza = () => {
        $("#fd-part", m.el).hidden = !$("#fd-cobrar", m.el).checked;
        const n = m.el.querySelectorAll("#fd-part input:checked").length, v = lerValor($("#fd-valor", m.el).value);
        $("#fd-cada", m.el).textContent = n && v > 0 ? `${n} cooperado(s), ${moeda(Fin.centavos(v / n))} cada` : `${n} cooperado(s)`;
      };
      m.el.addEventListener("change", atualiza); m.el.addEventListener("input", atualiza); atualiza();
      $("#fd-ok", m.el).onclick = async (ev) => {
        const reg = { data: $("#fd-data", m.el).value || null, descricao: $("#fd-desc", m.el).value.trim(), categoria: $("#fd-cat", m.el).value,
          valor: lerValor($("#fd-valor", m.el).value), cobrar: $("#fd-cobrar", m.el).checked, observacao: $("#fd-obs", m.el).value.trim() || null,
          participantes: $("#fd-cobrar", m.el).checked ? [...m.el.querySelectorAll("#fd-part input:checked")].map((i) => i.value) : [] };
        if (!reg.descricao || !(reg.valor > 0)) return toast("Informe descrição e valor.", "err");
        if (reg.cobrar && !reg.participantes.length) return toast("Marque quem divide a despesa.", "err");
        if (d) reg.id = d.id;
        const ok = await acao(ev.currentTarget, () => API.fin.salvar("despesas", reg), "Despesa salva.");
        if (ok) { m.fechar(); recarregar(); }
      };
    }

    function formPagamento(p) {
      const m = UI.modal(`
        <h2>${p ? "Editar lançamento" : "Novo lançamento"}</h2>
        <div class="form-grid">
          <div class="field"><label for="fp-data">Data do pagamento</label><input class="input" id="fp-data" type="date" value="${p && p.data ? p.data : hojeISO()}"></div>
          <div class="field"><label for="fp-valor">Valor (R$)</label><input class="input" id="fp-valor" inputmode="decimal" value="${p ? brl(p.valor) : ""}"></div>
          <div class="field full"><label for="fp-coop">Cooperado</label><select class="input" id="fp-coop">${coops.map((c) => `<option value="${c.id}" ${(p ? p.fin_cooperado_id : filtroCoop) === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></div>
          <div class="field full"><label for="fp-tipo">O que foi pago</label><select class="input" id="fp-tipo">${TIPOS_FORM.map(([k, t]) => `<option value="${k}" ${p && p.tipo === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field full" id="fp-w-desp"><label for="fp-desp">Despesa</label><select class="input" id="fp-desp">${base.despesas.map((d) => `<option value="${d.id}" ${p && p.despesa_id === d.id ? "selected" : ""}>${esc(d.descricao)} · ${moeda(d.valor)}${d.cobrar ? " (cobrada)" : ""}</option>`).join("")}</select></div>
          <div class="field" id="fp-w-mes"><label for="fp-mes">Mês de referência</label><input class="input" id="fp-mes" type="month" value="${p && p.mes_ref ? Fin.mesDe(p.mes_ref) : fech}"></div>
          <div class="field full"><label for="fp-obs">Observação</label><input class="input" id="fp-obs" maxlength="500" value="${esc(p ? p.observacao || "" : "")}"></div>
        </div>
        <p class="hint" id="fp-dica"></p>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="fp-ok">Salvar</button></div>`);
      const atualiza = () => {
        const t = $("#fp-tipo", m.el).value, d = despPorId[$("#fp-desp", m.el).value];
        $("#fp-w-desp", m.el).hidden = t !== "despesa"; $("#fp-w-mes", m.el).hidden = t !== "contribuicao";
        const c = calc[$("#fp-coop", m.el).value];
        const max = c ? Fin.componentes(c, []).maxAbater : 0;
        $("#fp-dica", m.el).textContent = {
          despesa: !base.despesas.length ? "Cadastre a despesa antes, na aba Despesas." : d && d.cobrar ? "Despesa cobrada: o valor conta como a parte dele na chamada (o que passar da parte vira aporte)." : "Despesa não cobrada: o valor vira aporte (crédito devolvido só no desligamento).",
          aporte: "Aporte: crédito do cooperado com a cooperativa, devolvido só no desligamento (art. 19).",
          contribuicao: "Contribuição mensal de capital do mês de referência. Mês futuro conta como pagamento adiantado.",
          integralizacao: "Integralização das quotas-parte iniciais.",
          abatimento: `Usa aportes do cooperado para integralizar as quotas iniciais. Máximo agora: ${moeda(max)}.`
        }[t];
      };
      m.el.addEventListener("change", atualiza); atualiza();
      $("#fp-ok", m.el).onclick = async (ev) => {
        const t = $("#fp-tipo", m.el).value;
        const reg = { data: $("#fp-data", m.el).value || null, fin_cooperado_id: $("#fp-coop", m.el).value, tipo: t, valor: lerValor($("#fp-valor", m.el).value),
          despesa_id: t === "despesa" ? $("#fp-desp", m.el).value || null : null, mes_ref: t === "contribuicao" && $("#fp-mes", m.el).value ? $("#fp-mes", m.el).value + "-01" : null,
          observacao: $("#fp-obs", m.el).value.trim() || null };
        if (!reg.fin_cooperado_id || !(reg.valor > 0) || !reg.data) return toast("Informe data, cooperado e valor.", "err");
        if (t === "despesa" && !reg.despesa_id) return toast("Escolha a despesa.", "err");
        if (t === "contribuicao" && !reg.mes_ref) return toast("Informe o mês de referência.", "err");
        if (t === "abatimento") { const max = Fin.componentes(calc[reg.fin_cooperado_id], []).maxAbater + (p && p.tipo === "abatimento" ? Number(p.valor) : 0); if (reg.valor > max + 0.005) return toast(`O máximo para abater é ${moeda(max)}.`, "err"); }
        if (p) reg.id = p.id; else reg.origem = "tesouraria";
        const ok = await acao(ev.currentTarget, () => API.fin.salvar("pagamentos", reg), "Lançamento salvo.");
        if (ok) { m.fechar(); recarregar(); }
      };
    }

    function formCooperado(c) {
      const ligados = new Set(coops.filter((x) => x.perfil_id && (!c || x.id !== c.id)).map((x) => x.perfil_id));
      const opcoes = perfis.filter((p) => !ligados.has(p.id));
      const m = UI.modal(`
        <h2>${c ? "Editar cadastro" : "Adicionar cooperado"}</h2>
        <div class="form-grid">
          <div class="field full"><label for="fc-nome">Nome completo</label><input class="input" id="fc-nome" maxlength="160" value="${esc(c ? c.nome : "")}"></div>
          <div class="field"><label for="fc-email">E-mail</label><input class="input" id="fc-email" type="email" value="${esc(c ? c.email || "" : "")}"></div>
          <div class="field"><label for="fc-cargo">Cargo / função</label><input class="input" id="fc-cargo" maxlength="80" value="${esc(c ? c.cargo || "" : "")}"></div>
          <div class="field"><label for="fc-quotas">Quotas iniciais subscritas</label><input class="input" id="fc-quotas" type="number" min="0" value="${c ? c.quotas_iniciais : base.parametros.quotas_minimas}"></div>
          <div class="field"><label for="fc-integ">Integralizado na admissão (R$)</label><input class="input" id="fc-integ" inputmode="decimal" value="${brl(c ? c.integralizado_admissao : 0)}"></div>
          <div class="field"><label for="fc-adm">Data de admissão</label><input class="input" id="fc-adm" type="date" value="${c && c.data_admissao ? c.data_admissao : hojeISO()}"></div>
          <div class="field"><label for="fc-sit">Situação</label><select class="input" id="fc-sit"><option value="ativo">Ativo</option><option value="desligado" ${c && c.situacao === "desligado" ? "selected" : ""}>Desligado</option></select></div>
          <div class="field" id="fc-w-sai"><label for="fc-sai">Data de desligamento</label><input class="input" id="fc-sai" type="date" value="${c && c.data_desligamento ? c.data_desligamento : ""}"></div>
          <div class="field full"><label for="fc-perfil">Conta no site</label><select class="input" id="fc-perfil"><option value="">Sem conta ligada (liga sozinha quando ele se cadastrar)</option>${opcoes.map((p) => `<option value="${p.id}" ${c && c.perfil_id === p.id ? "selected" : ""}>${esc(p.nome)} · ${esc(p.email)}</option>`).join("")}</select></div>
        </div>
        <label class="ciente"><input type="checkbox" id="fc-comp" ${c && c.compensar_aportes ? "checked" : ""}> <span>Usar todos os aportes deste cooperado, automaticamente, para integralizar as quotas iniciais</span></label>
        <div class="field"><label for="fc-obs">Observação</label><input class="input" id="fc-obs" maxlength="500" value="${esc(c ? c.observacao || "" : "")}"></div>
        <div class="modal-acoes">${c ? '<button class="btn btn-danger btn-sm" id="fc-del">Excluir</button>' : ""}<button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="fc-ok">Salvar</button></div>`);
      const atualiza = () => { $("#fc-w-sai", m.el).hidden = $("#fc-sit", m.el).value !== "desligado"; };
      m.el.addEventListener("change", atualiza); atualiza();
      $("#fc-ok", m.el).onclick = async (ev) => {
        const reg = { nome: $("#fc-nome", m.el).value.trim(), email: $("#fc-email", m.el).value.trim().toLowerCase() || null, cargo: $("#fc-cargo", m.el).value.trim() || null,
          quotas_iniciais: Number($("#fc-quotas", m.el).value || 0), integralizado_admissao: lerValor($("#fc-integ", m.el).value) || 0,
          data_admissao: $("#fc-adm", m.el).value || null, situacao: $("#fc-sit", m.el).value,
          data_desligamento: $("#fc-sit", m.el).value === "desligado" ? $("#fc-sai", m.el).value || null : null,
          perfil_id: $("#fc-perfil", m.el).value || null, compensar_aportes: $("#fc-comp", m.el).checked, observacao: $("#fc-obs", m.el).value.trim() || null };
        if (!reg.nome) return toast("Informe o nome.", "err");
        if (reg.situacao === "desligado" && !reg.data_desligamento) return toast("Informe a data de desligamento.", "err");
        if (c) reg.id = c.id;
        const ok = await acao(ev.currentTarget, () => API.fin.salvar("cooperados", reg), "Cadastro salvo.");
        if (ok) { m.fechar(); recarregar(); }
      };
      if (c) $("#fc-del", m.el).onclick = async () => {
        const n = base.pagamentos.filter((p) => p.fin_cooperado_id === c.id).length;
        m.fechar();
        if (!(await confirmar(`Excluir o cadastro de ${c.nome}?${n ? ` Os ${n} lançamento(s) dele também serão apagados.` : ""} Para quem saiu da cooperativa, prefira marcar como desligado.`, "Excluir"))) return;
        const ok = await acao(null, () => API.fin.excluir("cooperados", c.id), "Cadastro excluído.");
        if (ok) recarregar();
      };
    }

    function extrato(id) {
      const p = calc[id];
      const pags = base.pagamentos.filter((x) => x.fin_cooperado_id === id);
      UI.modal(`
        <h2>${esc(p.cooperado_nome)}</h2>
        <dl class="sol-dados">
          <div><dt>Em aberto</dt><dd>${moeda(p.valor_em_aberto)}</dd></div>
          <div><dt>Capital integralizado</dt><dd>${moeda(p.capital_integralizado)} de ${moeda(p.capital_subscrito)}</dd></div>
          <div><dt>Falta das quotas iniciais</dt><dd>${moeda(p.detalhes.resumo.falta_inicial)}</dd></div>
          <div><dt>Aportes</dt><dd>${moeda(p.outros_creditos)}</dd></div>
        </dl>
        <h3 class="mini-tit">Contribuição mensal</h3>
        <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Devida</th><th class="num">Paga</th><th class="num">Em aberto</th></tr></thead>
          <tbody>${p.detalhes.mensal.map((x) => `<tr><td>${Fin.nomeMes(x.mes)}</td><td class="num">${moeda(x.devida)}</td><td class="num">${moeda(x.paga)}</td><td class="num">${x.em_aberto > 0.005 ? moeda(x.em_aberto) : "—"}</td></tr>`).join("")}</tbody></table></div>
        <h3 class="mini-tit">Lançamentos</h3>
        ${pags.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Tipo</th><th class="num">Valor</th></tr></thead>
          <tbody>${pags.map((x) => `<tr><td>${x.data ? data(x.data) : "—"}</td><td>${esc(Fin.TIPOS_PAG[x.tipo])}<span class="sub">${esc(x.tipo === "despesa" ? (despPorId[x.despesa_id] || {}).descricao || "" : x.tipo === "contribuicao" ? Fin.nomeMes(Fin.mesDe(x.mes_ref)) : x.observacao || "")}</span></td><td class="num">${moeda(x.valor)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhum lançamento.</p>'}
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button></div>`);
    }

    /* ---------------- cliques ---------------- */
    el.onclick = async (e) => {
      const t = (sel) => e.target.closest(sel);
      let b;
      if ((b = t("[data-extrato]"))) return extrato(b.dataset.extrato);
      if ((b = t("[data-ed-desp]"))) return formDespesa(despPorId[b.dataset.edDesp]);
      if ((b = t("[data-ed-pag]"))) return formPagamento(base.pagamentos.find((x) => x.id === b.dataset.edPag));
      if ((b = t("[data-ed-coop]"))) return formCooperado(porId[b.dataset.edCoop]);
      if ((b = t("[data-ex-desp]"))) {
        const d = despPorId[b.dataset.exDesp];
        if (!(await confirmar(`Excluir a despesa "${d.descricao}"?`, "Excluir"))) return;
        if (await acao(b, () => API.fin.excluir("despesas", d.id), "Despesa excluída.")) recarregar();
        return;
      }
      if ((b = t("[data-ex-pag]"))) {
        const p = base.pagamentos.find((x) => x.id === b.dataset.exPag);
        if (!(await confirmar(`Excluir o lançamento de ${moeda(p.valor)} de ${(porId[p.fin_cooperado_id] || {}).nome}?`, "Excluir"))) return;
        if (await acao(b, () => API.fin.excluir("pagamentos", p.id), "Lançamento excluído.")) recarregar();
        return;
      }
      if ((b = t("[data-comp]"))) { const m = movs.find((x) => x.id === b.dataset.comp); const url = await acao(b, () => API.movimentos.comprovante(m)); if (url) window.open(url, "_blank", "noopener"); return; }
      if ((b = t("[data-confirmar]"))) {
        const m = movs.find((x) => x.id === b.dataset.confirmar);
        if (!(await confirmar(`Confirmar o Pix de ${moeda(m.valor)} de ${m.cooperado_nome}? Confirme só depois de ver o valor no extrato.`, "Confirmar Pix"))) return;
        if (await acao(b, () => API.movimentos.decidir(m.id, "confirmado"), "Pix confirmado e lançado.")) { recarregar(); ctx.atualizarContadores(); }
        return;
      }
      if ((b = t("[data-recusar]"))) {
        const m = movs.find((x) => x.id === b.dataset.recusar);
        const md = UI.modal(`<h2>Recusar Pix</h2><p class="muted">Pix de ${moeda(m.valor)} avisado por ${esc(m.cooperado_nome)}. O cooperado verá o motivo.</p>
          <div class="field"><label for="rc-mot">Motivo</label><input class="input" id="rc-mot" maxlength="200" placeholder="Ex.: não encontrei o Pix no extrato"></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-danger btn-sm" id="rc-ok">Recusar</button></div>`);
        $("#rc-ok", md.el).onclick = async (ev) => {
          if (await acao(ev.currentTarget, () => API.movimentos.decidir(m.id, "recusado", $("#rc-mot", md.el).value.trim()), "Pix recusado.")) { md.fechar(); recarregar(); ctx.atualizarContadores(); }
        };
      }
    };
  }

  /* ---------------- exportação ---------------- */
  async function exportar(base, calc, perfilPorId) {
    await new Promise((ok, erro) => { if (window.ExcelJS) return ok(); const s = document.createElement("script"); s.src = "assets/vendor/exceljs-4.4.0.min.js"; s.onload = ok; s.onerror = () => erro(new Error("Não foi possível carregar o gerador de planilhas.")); document.head.appendChild(s); });
    const wb = new window.ExcelJS.Workbook(); wb.creator = "BIMCORE — site";
    const nome = {}; base.cooperados.forEach((c) => { nome[c.id] = c.nome; });
    const desp = {}; base.despesas.forEach((d) => { desp[d.id] = d; });
    const dt = (v) => { if (!v) return null; const [y, m, d] = String(v).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    const aba = (titulo, colunas, linhas) => {
      const ws = wb.addWorksheet(titulo);
      ws.columns = colunas.map(([h, w, f]) => ({ header: h, width: w, style: f === "m" ? { numFmt: MOEDA } : f === "d" ? { numFmt: "dd/mm/yyyy" } : f === "mes" ? { numFmt: "mmm/yyyy" } : {} }));
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1A2E" } };
      ws.getRow(1).alignment = { wrapText: true, vertical: "middle" }; ws.getRow(1).height = 30;
      linhas.forEach((l) => ws.addRow(l)); ws.views = [{ state: "frozen", ySplit: 1 }];
      return ws;
    };
    const lista = base.cooperados.map((c) => calc[c.id]).sort((a, b) => a.cooperado_nome.localeCompare(b.cooperado_nome));
    aba("Posição", [["Nome", 32], ["E-mail", 30], ["Quotas subscritas", 11], ["Capital subscrito", 14, "m"], ["Capital integralizado", 14, "m"], ["Total contribuído", 14, "m"], ["Contribuição mensal", 13, "m"], ["Valor em aberto", 13, "m"], ["Meses em atraso", 9], ["Aportes (outros créditos)", 14, "m"], ["Falta integralizar das quotas iniciais", 16, "m"], ["Contribuições pagas antecipadamente", 16, "m"]],
      lista.map((p) => [p.cooperado_nome, p.email, p.quotas_subscritas, p.capital_subscrito, p.capital_integralizado, p.contribuicoes_pagas, p.contribuicao_mensal, p.valor_em_aberto, p.meses_em_atraso, p.outros_creditos, p.detalhes.resumo.falta_inicial, p.detalhes.resumo.adiantado]));
    const mm = []; lista.forEach((p) => p.detalhes.mensal.forEach((x) => mm.push([p.cooperado_nome, dt(x.mes + "-01"), x.devida, x.paga, Math.max(0, x.em_aberto)])));
    aba("Mês a mês", [["Cooperado", 32], ["Mês", 11, "mes"], ["Contribuição devida", 14, "m"], ["Contribuição paga", 14, "m"], ["Em aberto no mês", 14, "m"]], mm);
    aba("Despesas", [["Data", 12, "d"], ["Descrição", 50], ["Categoria", 20], ["Valor", 13, "m"], ["Cobrada dos cooperados?", 12], ["Cooperados que dividem", 40], ["Valor por cooperado", 13, "m"], ["Observação", 50]],
      base.despesas.map((d) => [dt(d.data), d.descricao, d.categoria, Number(d.valor), d.cobrar ? "Sim" : "Não", d.participantes.map((i) => nome[i]).join(", "), d.cobrar ? Fin.centavos(d.valor / Math.max(1, d.participantes.length)) : null, d.observacao]));
    aba("Pagamentos", [["Data", 12, "d"], ["Cooperado", 32], ["Tipo", 30], ["Despesa", 40], ["Mês de referência", 11, "mes"], ["Valor", 13, "m"], ["Origem", 18], ["Observação", 40], ["Lançado por", 22]],
      base.pagamentos.map((p) => [dt(p.data), nome[p.fin_cooperado_id], Fin.TIPOS_PAG[p.tipo], p.despesa_id ? (desp[p.despesa_id] || {}).descricao : null, p.mes_ref ? dt(p.mes_ref) : null, Number(p.valor), ORIGEM[p.origem] || p.origem, p.observacao, p.criado_nome]));
    aba("Cadastro", [["Nome", 32], ["E-mail", 30], ["Cargo", 18], ["Conta no site", 12], ["Quotas iniciais", 10], ["Integralizado na admissão", 14, "m"], ["Admissão", 12, "d"], ["Situação", 11], ["Desligamento", 12, "d"], ["Aportes usados na integralização", 14], ["Observação", 40]],
      base.cooperados.map((c) => [c.nome, c.email, c.cargo, c.perfil_id ? "Ligada" : "Sem conta", c.quotas_iniciais, Number(c.integralizado_admissao), dt(c.data_admissao), c.situacao, dt(c.data_desligamento), c.compensar_aportes ? "Sim" : "Não", c.observacao]));
    const par = base.parametros;
    aba("Parâmetros", [["Parâmetro", 40], ["Valor", 18]], [["Valor da quota-parte", Number(par.quota)], ["Quotas mínimas na admissão", par.quotas_minimas], ["Início da contribuição mensal", Fin.nomeMes(Fin.mesDe(par.contrib_inicio))], ["Contas calculadas até", Fin.nomeMes(Fin.mesFechamento(par))], ["Exportado em", new Date().toLocaleString("pt-BR")]]);
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = `BIMCORE-financeiro-${UI.hoje()}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  window.Tesouraria = { render };
})();
