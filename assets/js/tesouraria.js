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
  let mesSel = null;
  const pct = (v) => (v == null ? "" : (Number(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
  const lerPct = (t) => { const v = lerValor(t); return Number.isFinite(v) ? v / 100 : NaN; };
  const num = (t) => { const v = lerValor(t); return Number.isFinite(v) && v > 0 ? v : 0; };

  const lerValor = (t) => { t = String(t || "").replace(/[R$\s]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); return Fin.centavos(Number(t)); };
  const brl = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const hojeISO = () => UI.hoje();

  async function render(el, ctx) {
    const [base, movs, perfis, expAll] = await Promise.all([API.fin.tudo(), API.movimentos.todos().catch(() => []), API.cooperados.listar().catch(() => []), API.exp.todos().catch(() => ({ habilitacoes: [], experiencias: [], comprovantes: [] }))]);
    base.habilitacoes = expAll.habilitacoes; base.experiencias = expAll.experiencias;
    base.internas = await API.exp.internas().catch(() => []);
    const pendExp = expAll.habilitacoes.filter((h) => h.status === "pendente").length + expAll.experiencias.filter((x) => x.status === "pendente").length;
    const calc = Fin.calcular(base);
    const coops = base.cooperados;
    const porId = {}; coops.forEach((c) => { porId[c.id] = c; });
    const despPorId = {}; base.despesas.forEach((d) => { despPorId[d.id] = d; });
    const perfilPorId = {}; perfis.forEach((p) => { perfilPorId[p.id] = p; });
    const aguardando = movs.filter((m) => m.status === "aguardando");
    const semCadastro = movs.filter((m) => m.status === "confirmado" && !m.lancado && !m.incorporado_em);
    const fech = Fin.mesFechamento(base.parametros);
    const recarregar = () => render(el, ctx);

    const abas = [["resumo", "Resumo"], ["fechamento", "Fechamento do mês"], ["cooperativa", "Cooperativa"], ["despesas", "Despesas"], ["pagamentos", "Pagamentos e aportes"], ["cadastro", "Cadastro"], ["config", "Configurações"]];
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Tesouraria</p><h1>Financeiro</h1></div>
        <button class="btn btn-ghost" id="t-exportar">Exportar para Excel</button></div>
      <p class="muted">Contas calculadas pelo Estatuto até <b>${Fin.nomeMes(fech)}</b>${base.parametros.fechamento ? " (mês de fechamento fixado em Configurações)" : " (atualiza sozinho a cada mês)"}. Cada lançamento aparece na hora na "Minha conta" do cooperado.</p>
      <nav class="subabas" role="tablist">${abas.map(([k, t]) => `<button role="tab" data-aba="${k}" aria-selected="${aba === k}">${t}${k === "resumo" && aguardando.length ? ` <span class="contador">${aguardando.length}</span>` : ""}${k === "cadastro" && pendExp ? ` <span class="contador">${pendExp}</span>` : ""}</button>`).join("")}</nav>
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

    /* ---------------- Fechamento do mês ---------------- */
    if (aba === "fechamento") {
      const mes = mesSel || fech;
      const naFolha = new Set((base.folha || []).filter((f) => Fin.mesDe(f.mes) === mes).map((f) => f.fin_cooperado_id));
      const linhas = coops.filter((c) => naFolha.has(c.id) || (c.data_admissao && Fin.mesDe(c.data_admissao) <= mes && (!c.data_desligamento || Fin.mesDe(c.data_desligamento) >= mes)));
      const folhaDe = (id) => (base.folha || []).find((f) => f.fin_cooperado_id === id && Fin.mesDe(f.mes) === mes) || {};
      const rec = (base.receitas || []).find((r) => Fin.mesDe(r.mes) === mes) || {};
      const enqDe = {}; linhas.forEach((c) => { enqDe[c.id] = Fin.enquadramento(c, base, mes); });
      const semCat = linhas.filter((c) => !enqDe[c.id].categoria);
      corpo.innerHTML = `
        <section class="painel">
          <div class="painel-cab"><h2>Retiradas de ${Fin.nomeMes(mes)}</h2>
            <div class="sol-acoes"><div class="field"><label for="fm-mes">Mês</label><input class="input" id="fm-mes" type="month" value="${mes}"></div>
            <button class="btn btn-ghost btn-sm" id="fm-puxar" type="button">Puxar horas lançadas no site</button></div></div>
          <p class="hint">Preencha as horas de cada cooperado no mês (produtivas, de formação e de suporte administrativo), os dias trabalhados e, quando houver, o 13º e as férias pagas. O site calcula a retirada pelo valor-hora da categoria (art. 8º), o INSS (11% até o teto), a contribuição de capital (1,5% da retirada), o FIC, as provisões de 13º e férias e os auxílios. Ao salvar, tudo aparece na hora na Minha conta de cada um.</p>
          ${semCat.length ? `<div class="notice warn">Sem enquadramento (valor-hora zerado): ${semCat.map((c) => esc(c.nome)).join(", ")}. O cooperado precisa enviar formação e experiências em <b>Minha experiência</b> e alguém validar em <b>Cadastro → Experiência</b>.</div>` : ""}
          <div class="tabela-wrap"><table class="tabela folha">
            <thead><tr><th>Cooperado</th><th class="num">Horas produtivas</th><th class="num">Horas de formação</th><th class="num">Suporte adm. (20%)</th><th class="num">Dias trabalhados</th><th class="num">13º pago</th><th class="num">Férias pagas</th><th class="num">Retirada bruta</th><th class="num">INSS</th><th class="num">Contribuição</th><th class="num">Auxílios</th><th class="num">Líquido a pagar</th></tr></thead>
            <tbody>${linhas.map((c) => { const f = folhaDe(c.id); return `<tr data-coop="${c.id}">
              <td>${esc(c.nome)}<span class="sub">${enqDe[c.id].categoria ? esc(enqDe[c.id].categoria) + " · " + esc(enqDe[c.id].conselho || "sem conselho") + " · " + moeda(Fin.valorHoraDe(enqDe[c.id].categoria, enqDe[c.id].conselho, base.parametros)) + "/h" + (enqDe[c.id].origem === "automatico" ? " · " + enqDe[c.id].anos + " ano(s) comprovados" : " · manual") : "sem enquadramento"}</span></td>
              <td class="num"><input class="input mini-num" data-k="horas_produtivas" inputmode="decimal" value="${f.horas_produtivas ? brl(f.horas_produtivas) : ""}"></td>
              <td class="num"><input class="input mini-num" data-k="horas_formacao" inputmode="decimal" value="${f.horas_formacao ? brl(f.horas_formacao) : ""}"></td>
              <td class="num"><input class="input mini-num" data-k="horas_admin" inputmode="decimal" value="${f.horas_admin ? brl(f.horas_admin) : ""}"></td>
              <td class="num"><input class="input mini-num" data-k="dias" inputmode="numeric" value="${f.dias || ""}"></td>
              <td class="num"><input class="input mini-num" data-k="decimo_pago" inputmode="decimal" value="${f.decimo_pago ? brl(f.decimo_pago) : ""}"></td>
              <td class="num"><input class="input mini-num" data-k="ferias_pago" inputmode="decimal" value="${f.ferias_pago ? brl(f.ferias_pago) : ""}"></td>
              <td class="num" data-v="retirada">—</td><td class="num" data-v="inss">—</td><td class="num" data-v="devida">—</td><td class="num" data-v="aux">—</td><td class="num" data-v="liquido">—</td></tr>`; }).join("")}</tbody>
            <tfoot><tr><td>Total</td><td class="num" data-t="hp"></td><td class="num" data-t="hf"></td><td class="num" data-t="ha"></td><td></td><td></td><td></td><td class="num" data-t="retirada"></td><td class="num" data-t="inss"></td><td class="num" data-t="devida"></td><td class="num" data-t="aux"></td><td class="num" data-t="liquido"></td></tr></tfoot>
          </table></div>
          <div class="form-grid">
            <div class="field"><label for="fm-rec">Receita bruta de contratos no mês (R$)</label><input class="input" id="fm-rec" inputmode="decimal" value="${rec.receita_bruta ? brl(rec.receita_bruta) : ""}"><span class="hint">Base do Custo de Operação e Gestão (20%, art. 23, §7º).</span></div>
            <div class="field"><label>Custos da cooperativa no mês</label><div id="fm-custos" class="hint"></div></div>
          </div>
          <div class="sol-acoes"><button class="btn btn-primary" id="fm-salvar">Salvar fechamento de ${Fin.nomeMes(mes)}</button></div>
        </section>`;
      const lerLinhas = () => [...corpo.querySelectorAll("tr[data-coop]")].map((tr) => {
        const o = { fin_cooperado_id: tr.dataset.coop, mes: mes + "-01" };
        tr.querySelectorAll("input[data-k]").forEach((i) => { o[i.dataset.k] = i.dataset.k === "dias" ? Math.round(num(i.value)) : num(i.value); });
        return o;
      });
      const recalcular = () => {
        const novas = lerLinhas();
        const folha = (base.folha || []).filter((f) => Fin.mesDe(f.mes) !== mes).concat(novas);
        const tmp = { ...base, folha };
        const tot = { hp: 0, hf: 0, ha: 0, adm: 0, retirada: 0, inss: 0, devida: 0, aux: 0, liquido: 0 };
        corpo.querySelectorAll("tr[data-coop]").forEach((tr) => {
          const p = Fin.calcularCooperado(porId[tr.dataset.coop], tmp);
          const x = p.detalhes.mensal.find((mm) => mm.mes === mes) || {};
          const v = { retirada: x.retirada || 0, inss: x.inss || 0, devida: x.devida || 0, aux: (x.aux_tele || 0) + (x.aux_alim || 0), liquido: x.liquido || 0 };
          Object.entries(v).forEach(([k, val]) => { tr.querySelector(`[data-v="${k}"]`).textContent = moeda(val); tot[k] += val; });
          tot.hp += x.horas_produtivas || 0; tot.hf += x.horas_formacao || 0; tot.ha += x.horas_admin || 0; tot.adm += x.retirada_admin || 0;
        });
        Object.entries(tot).forEach(([k, val]) => { const td = corpo.querySelector(`[data-t="${k}"]`); if (td) td.textContent = k === "hp" || k === "hf" || k === "ha" ? brl(val) + " h" : moeda(val); });
        const pr = Fin.params(base.parametros), receita = num($("#fm-rec").value);
        const cog = receita * pr.custo_op_pct, admTotal = tot.adm * (1 + pr.patronal_pct), saldo = cog - admTotal;
        $("#fm-custos").innerHTML = `INSS patronal (20%): <b>${moeda(tot.retirada * pr.patronal_pct)}</b> · Custo de Operação e Gestão: <b>${moeda(cog)}</b>`
          + (tot.ha ? `<br>Suporte administrativo pago pelos 20%: <b>${moeda(tot.adm)}</b> + INSS patronal <b>${moeda(tot.adm * pr.patronal_pct)}</b> · ${saldo >= 0 ? `sobram <b>${moeda(saldo)}</b> dos 20%` : `<span style="color:var(--err)">faltam <b>${moeda(-saldo)}</b> nos 20% deste mês</span>`}` : "");
      };
      corpo.addEventListener("input", recalcular); recalcular();
      $("#fm-mes").onchange = (e) => { if (e.target.value) { mesSel = e.target.value; recarregar(); } };
      $("#fm-puxar").onclick = async (ev) => {
        const hs = await acao(ev.currentTarget, () => API.fin.horasLancadas(mes + "-01")); if (!hs) return;
        let n = 0;
        hs.forEach((h) => { const tr = corpo.querySelector(`tr[data-coop="${h.fin_cooperado_id}"]`); if (!tr) return; n++;
          tr.querySelector('[data-k="horas_produtivas"]').value = h.produtivas ? brl(h.produtivas) : "";
          tr.querySelector('[data-k="horas_formacao"]').value = h.formacao ? brl(h.formacao) : "";
          tr.querySelector('[data-k="horas_admin"]').value = h.administrativas ? brl(h.administrativas) : "";
          if (!tr.querySelector('[data-k="dias"]').value) tr.querySelector('[data-k="dias"]').value = h.dias || ""; });
        recalcular();
        toast(n ? `Horas de ${n} cooperado(s) puxadas de "Minhas horas". Confira e salve.` : "Ninguém lançou horas neste mês no site.");
      };
      $("#fm-salvar").onclick = async (ev) => {
        const linhasF = lerLinhas();
        const ok = await acao(ev.currentTarget, () => API.fin.salvarFolha(linhasF, { mes: mes + "-01", receita_bruta: num($("#fm-rec").value) }), `Fechamento de ${Fin.nomeMes(mes)} salvo.`);
        if (ok) recarregar();
      };
    }

    /* ---------------- Cooperativa ---------------- */
    if (aba === "cooperativa") {
      const vc = Fin.cooperativa(base, calc);
      const pr = Fin.params(base.parametros);
      const L = vc.linhas.filter((l) => l.receita || l.retiradas || l.admin_cog || l.contribuicoes || l.fic_coop);
      const tot = (k) => L.reduce((t, l) => t + l[k], 0);
      const cols = [["receita", "Receita de contratos"], ["custo_op", "Custo de Operação (20%)"], ["admin_cog", "Suporte adm. pago pelos 20% (com INSS patronal)"], ["saldo_cog", "Saldo dos 20%"], ["retiradas", "Retiradas brutas"], ["inss_retido", "INSS retido"], ["inss_patronal", "INSS patronal (20%)"], ["fic_coop", "FIC da cooperativa"], ["provisoes", "Provisões 13º e férias"], ["auxilios", "Auxílios"], ["contribuicoes", "Contribuições de capital"]];
      corpo.innerHTML = `
        <section class="painel"><h2>Movimento da cooperativa por mês</h2>
          ${L.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th>${cols.map(([, t]) => `<th class="num">${t}</th>`).join("")}</tr></thead>
            <tbody>${L.map((l) => `<tr><td>${Fin.nomeMes(l.mes)}</td>${cols.map(([k]) => `<td class="num">${moeda(l[k])}</td>`).join("")}</tr>`).join("")}</tbody>
            <tfoot><tr><td>Total</td>${cols.map(([k]) => `<td class="num">${moeda(tot(k))}</td>`).join("")}</tr></tfoot></table></div>` : '<p class="vazio">Ainda não há retiradas nem receitas lançadas.</p>'}
        </section>
        <section class="painel"><h2>Apuração das sobras do exercício</h2>
          <p class="hint">Preencha depois do balanço de 31/12 e da decisão da Assembleia Geral (art. 71). As sobras de mercado, depois do Fundo de Reserva e do FATES, são rateadas pelas horas produzidas no ano; as de parcerias públicas vão para o FEI e não são rateadas (art. 72).</p>
          <form id="t-sob" class="form-grid" novalidate>
            <div class="field"><label for="sb-m">Sobras de contratos de mercado e licitações (R$)</label><input class="input" id="sb-m" inputmode="decimal" value="${brl(pr.sobras_mercado)}"></div>
            <div class="field"><label for="sb-p">Sobras de parcerias com o Poder Público (R$)</label><input class="input" id="sb-p" inputmode="decimal" value="${brl(pr.sobras_publicas)}"></div>
            <div class="field"><label for="sb-r">Percentual aprovado para rateio (%)</label><input class="input" id="sb-r" inputmode="decimal" value="${pct(pr.rateio_pct)}"></div>
            <div class="full"><button class="btn btn-primary" id="sb-btn" type="submit">Salvar apuração</button></div>
          </form>
          <dl class="sol-dados">
            <div><dt>Fundo de Reserva (${pct(pr.reserva_pct)}%)</dt><dd>${moeda(vc.sobras.reserva)}</dd></div>
            <div><dt>FATES (${pct(pr.fates_pct)}%)</dt><dd>${moeda(vc.sobras.fates)}</dd></div>
            <div><dt>FEI (parcerias públicas)</dt><dd>${moeda(vc.sobras.fei)}</dd></div>
            <div><dt>A ratear entre os cooperados</dt><dd>${moeda(vc.sobras.a_ratear)}</dd></div>
          </dl>
        </section>`;
      $("#t-sob").addEventListener("submit", async (e) => {
        e.preventDefault();
        const r = lerPct($("#sb-r").value);
        if (!(r >= 0 && r <= 1)) return toast("O percentual de rateio vai de 0 a 100.", "err");
        if (await acao($("#sb-btn"), () => API.fin.salvarParametros({ sobras_mercado: num($("#sb-m").value), sobras_publicas: num($("#sb-p").value), rateio_pct: r }), "Apuração salva.")) recarregar();
      });
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
            <thead><tr><th>Cooperado</th><th>Conta no site</th><th>Enquadramento</th><th class="num">Quotas iniciais</th><th class="num">Integralizado na admissão</th><th>Admissão</th><th>Situação</th><th></th></tr></thead>
            <tbody>${coops.map((c) => `<tr><td>${esc(c.nome)}<span class="sub">${esc(c.cargo || "")}</span></td>
              <td>${c.perfil_id ? `<span class="selo ok">ligada</span><span class="sub">${esc((perfilPorId[c.perfil_id] || {}).email || c.email || "")}</span>` : `<span class="selo">sem conta</span><span class="sub">${esc(c.email || "e-mail não informado")}</span>`}</td>
              <td>${(() => { const e = Fin.enquadramento(c, base, fech); const pend = expAll.habilitacoes.concat(expAll.experiencias).filter((x) => x.fin_cooperado_id === c.id && x.status === "pendente").length;
                return (e.categoria ? `${esc(e.categoria)}<span class="sub">${esc(e.conselho || "")} · ${moeda(Fin.valorHoraDe(e.categoria, e.conselho, base.parametros))}/h · ${e.origem === "automatico" ? e.anos + " ano(s)" : "manual"}</span>` : '<span class="selo warn">sem enquadramento</span>') + (pend ? `<span class="sub"><span class="selo warn">${pend} para validar</span></span>` : ""); })()}</td>
              <td class="num">${c.quotas_iniciais}</td><td class="num">${moeda(c.integralizado_admissao)}${c.compensar_aportes ? '<span class="sub">aportes usados na integralização</span>' : ""}</td>
              <td>${data(c.data_admissao)}</td><td>${c.situacao === "ativo" ? '<span class="selo ok">ativo</span>' : `<span class="selo">desligado</span><span class="sub">${data(c.data_desligamento)}</span>`}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-exp-coop="${c.id}">Experiência</button> <button class="btn btn-ghost btn-sm" data-ed-coop="${c.id}">Editar</button></td></tr>`).join("")}</tbody>
          </table></div>` : '<p class="vazio">Nenhum cooperado cadastrado.</p>'}
        </section>`;
      $("#t-novo-coop").onclick = () => formCooperado(null);
    }

    /* ---------------- Configurações ---------------- */
    if (aba === "config") {
      const par = base.parametros, pr = Fin.params(par);
      const campoP = (id, rot, v, dica) => `<div class="field"><label for="${id}">${rot}</label><input class="input" id="${id}" inputmode="decimal" value="${v}">${dica ? `<span class="hint">${dica}</span>` : ""}</div>`;
      const tab = Fin.tabelaSalarial(par);
      corpo.innerHTML = `
        <form id="t-par" novalidate style="display:grid;gap:1.6rem">
        <section class="painel"><h2>Capital e contribuição</h2><div class="form-grid">
          ${campoP("cp-quota", "Valor da quota-parte (R$)", brl(pr.quota), "Art. 23. Reajuste em janeiro pelo INPC.")}
          <div class="field"><label for="cp-min">Quotas mínimas na admissão</label><input class="input" id="cp-min" type="number" min="1" value="${pr.quotas_minimas}"><span class="hint">Art. 25.</span></div>
          <div class="field"><label for="cp-ini">Início da contribuição mensal</label><input class="input" id="cp-ini" type="month" value="${Fin.mesDe(pr.contrib_inicio)}"><span class="hint">Art. 23, §4º.</span></div>
          <div class="field"><label for="cp-fech">Mês de fechamento</label><input class="input" id="cp-fech" type="month" value="${par.fechamento ? Fin.mesDe(par.fechamento) : ""}"><span class="hint">Vazio = atualiza sozinho no mês atual.</span></div>
          ${campoP("cp-contrib", "Contribuição sobre as retiradas (%)", pct(pr.contrib_pct), "Art. 23, §4º, I. Sem retirada: 1 quota.")}
        </div></section>
        <section class="painel"><h2>Retiradas, INSS e fundos</h2><div class="form-grid">
          ${campoP("cp-sm", "Salário-mínimo (R$)", brl(pr.sm), "Art. 8º, III. Atualize todo ano.")}
          <div class="field"><label for="cp-horas">Horas de referência por mês</label><input class="input" id="cp-horas" type="number" min="1" value="${pr.horas_ref}"><span class="hint">6 h/dia × 20 dias.</span></div>
          ${campoP("cp-inss", "INSS do cooperado (%)", pct(pr.inss_pct), "Art. 24, §1º.")}
          ${campoP("cp-teto", "Teto do INSS no ano (R$)", brl(pr.inss_teto), "Atualize todo ano.")}
          ${campoP("cp-patr", "INSS patronal (%)", pct(pr.patronal_pct), "Art. 24, §1º.")}
          ${campoP("cp-fic", "FIC — aporte da cooperativa (%)", pct(pr.fic_coop_pct), "Art. 78, §1º, a: sobre as retiradas do mês anterior.")}
          ${campoP("cp-ficv", "FIC — aporte voluntário máximo (%)", pct(pr.fic_vol_max), "Art. 78, §1º, b.")}
          ${campoP("cp-tele", "Auxílio-teletrabalho (% do SM por mês)", pct(pr.tele_pct), "Art. 80, §1º.")}
          ${campoP("cp-alim", "Auxílio-alimentação (% do SM por dia)", pct(pr.alim_pct), "Art. 80, §2º.")}
          ${campoP("cp-cop", "Custo de Operação e Gestão (%)", pct(pr.custo_op_pct), "Art. 23, §7º.")}
          ${campoP("cp-res", "Fundo de Reserva (%)", pct(pr.reserva_pct), "Mínimo legal; a Assembleia define (art. 71, §3º).")}
          ${campoP("cp-fates", "FATES (%)", pct(pr.fates_pct), "Mínimo legal; a Assembleia define.")}
        </div></section>
        <section class="painel"><h2>Enquadramento por experiência (art. 8º, IV e V)</h2>
          <p class="hint">Júnior até 5 anos completos de experiência comprovada; Pleno de 6 a 10; Sênior a partir de 11 (teto). Coordenador só com designação do Conselho e mais de 10 anos. Conta apenas a experiência validada na função ligada à formação usada na cooperativa.</p>
          <label class="ciente"><input type="checkbox" id="cp-exptec" ${par.exp_tecnico_antes === false ? "" : "checked"}> <span>Nível técnico: contar a prática na área anterior ao diploma</span></label>
          <label class="ciente"><input type="checkbox" id="cp-expsup" ${par.exp_superior_antes ? "checked" : ""}> <span>Nível superior: contar experiência anterior ao diploma/registro</span></label>
          <h3 class="mini-tit">Experiência na BIMCORE (automática, pelas horas)</h3>
          <p class="hint">Mês de referência = dias úteis do mês × jornada. Saem sábados, domingos, feriados nacionais (fixos, Sexta-feira Santa) e os feriados abaixo. Cada mês vale no máximo 1 mês de experiência; os meses do ano necessários para fechar 1 ano descontam o recesso de férias.</p>
          <div class="form-grid">
            ${campoP("cp-hdia", "Jornada de referência (horas por dia útil)", brl(par.horas_dia || 6), "Art. 8º, I: 6 h diárias.")}
            <div class="field"><label for="cp-mano">Meses trabalhados que valem 1 ano</label><input class="input" id="cp-mano" type="number" min="1" max="12" value="${par.meses_ano || 11}"><span class="hint">11 = um mês de recesso por ano.</span></div>
            <div class="field full"><label for="cp-fer">Feriados estaduais e municipais (dd/mm, separados por vírgula)</label><input class="input" id="cp-fer" value="${esc(par.feriados_extras != null ? par.feriados_extras : "20/01, 06/02, 23/04")}"><span class="hint">Araruama: 20/01 São Sebastião e 06/02 aniversário da cidade; RJ: 23/04 São Jorge.</span></div>
          </div>
          <label class="ciente"><input type="checkbox" id="cp-facult" ${par.facultativos_folga === false ? "" : "checked"}> <span>Carnaval (segunda e terça) e Corpus Christi sem expediente</span></label>
          <p class="hint" id="cp-prev"></p>
        </section>
        <section class="painel"><h2>Tabela salarial (art. 8º)</h2>
          <p class="hint">CREA/CAU: multiplicador × salário-mínimo. Demais conselhos: retirada de referência da categoria Pleno × (multiplicador ÷ multiplicador Pleno). A Assembleia aprova a tabela todo ano.</p>
          <div class="form-grid">
            ${campoP("cp-base", "Retirada de referência Pleno — demais conselhos (R$)", brl(pr.base_demais_pleno))}
            ${campoP("cp-mj", "Multiplicador Júnior (× SM)", brl(pr.mult_junior))}
            ${campoP("cp-mp", "Multiplicador Pleno (× SM)", brl(pr.mult_pleno))}
            ${campoP("cp-ms", "Multiplicador Sênior (× SM)", brl(pr.mult_senior))}
            ${campoP("cp-mc", "Multiplicador Coordenador (× SM)", brl(pr.mult_coord))}
          </div>
          <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Categoria</th><th>Experiência</th><th class="num">CREA/CAU — mês</th><th class="num">CREA/CAU — hora</th><th class="num">Demais — mês</th><th class="num">Demais — hora</th></tr></thead>
            <tbody>${tab.map((t) => `<tr><td>${t.categoria}</td><td>${t.experiencia}</td><td class="num">${moeda(t.crea_mensal)}</td><td class="num">${moeda(t.crea_hora)}</td><td class="num">${moeda(t.demais_mensal)}</td><td class="num">${moeda(t.demais_hora)}</td></tr>`).join("")}</tbody></table></div>
        </section>
        <div class="sol-acoes"><button class="btn btn-primary" id="cp-btn" type="submit">Salvar parâmetros</button></div>
        </form>
        ${par.atualizado_nome ? `<p class="hint">Última alteração: ${esc(par.atualizado_nome)}${par.atualizado_em ? " em " + dataHora(par.atualizado_em) : ""}.</p>` : ""}`;
      const prev = () => {
        const tmp = { feriados_extras: $("#cp-fer").value, facultativos_folga: $("#cp-facult").checked };
        const ano = new Date().getFullYear(); let du = 0; for (let m = 1; m <= 12; m++) du += Fin.diasUteis(`${ano}-${String(m).padStart(2, "0")}`, tmp);
        const hd = lerValor($("#cp-hdia").value) || 6, ma = Number($("#cp-mano").value) || 11;
        $("#cp-prev").innerHTML = `Em ${ano}: <b>${du} dias úteis</b>, média de <b>${brl(du * hd / 12)} h</b> por mês de referência. Com ${ma} meses por ano, 1 ano de experiência na BIMCORE equivale a cerca de <b>${brl(du * hd / 12 * ma)} h</b> trabalhadas.`;
      };
      ["cp-fer", "cp-facult", "cp-hdia", "cp-mano"].forEach((id) => $("#" + id).addEventListener("input", prev)); $("#cp-facult").addEventListener("change", prev); prev();
      $("#t-par").addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = (id) => lerValor($("#" + id).value), pc = (id) => lerPct($("#" + id).value);
        const d = { quota: v("cp-quota"), quotas_minimas: Number($("#cp-min").value), contrib_inicio: $("#cp-ini").value ? $("#cp-ini").value + "-01" : null,
          fechamento: $("#cp-fech").value ? $("#cp-fech").value + "-01" : null, contrib_pct: pc("cp-contrib"), sm: v("cp-sm"), horas_ref: Number($("#cp-horas").value),
          inss_pct: pc("cp-inss"), inss_teto: v("cp-teto"), patronal_pct: pc("cp-patr"), fic_coop_pct: pc("cp-fic"), fic_vol_max: pc("cp-ficv"), tele_pct: pc("cp-tele"),
          alim_pct: pc("cp-alim"), custo_op_pct: pc("cp-cop"), reserva_pct: pc("cp-res"), fates_pct: pc("cp-fates"), base_demais_pleno: v("cp-base"),
          mult_junior: v("cp-mj"), mult_pleno: v("cp-mp"), mult_senior: v("cp-ms"), mult_coord: v("cp-mc"),
          exp_tecnico_antes: $("#cp-exptec").checked, exp_superior_antes: $("#cp-expsup").checked,
          horas_dia: v("cp-hdia"), meses_ano: Number($("#cp-mano").value), feriados_extras: $("#cp-fer").value.trim(), facultativos_folga: $("#cp-facult").checked };
        const ruim = Object.entries(d).filter(([k, x]) => k !== "fechamento" && typeof x !== "boolean" && typeof x !== "string" && !(x === 0 || (x && Number.isFinite(Number(x)))));
        if (!d.contrib_inicio || ruim.length || !(d.quota > 0) || !(d.sm > 0) || !(d.horas_ref > 0) || !(d.mult_pleno > 0)) return toast("Confira os campos: há valor vazio ou inválido.", "err");
        if (await acao($("#cp-btn"), () => API.fin.salvarParametros(d), "Parâmetros salvos.")) recarregar();
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
          <div class="field"><label for="fc-cons">Conselho profissional</label><select class="input" id="fc-cons"><option value="">—</option>${Fin.CONSELHOS.map((x) => `<option ${c && c.conselho === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
          <div class="field"><label for="fc-cat">Categoria manual (só sem formação validada)</label><select class="input" id="fc-cat"><option value="">Automática pela experiência</option>${Fin.CATEGORIAS_SAL.map(([x, , exp]) => `<option value="${x}" ${c && c.categoria === x ? "selected" : ""}>${x} (${exp})</option>`).join("")}</select></div>
          <div class="field"><label for="fc-ficv">FIC voluntário (% das retiradas)</label><input class="input" id="fc-ficv" inputmode="decimal" value="${c ? pct(c.fic_voluntario || 0) : "0"}"><span class="hint">De 0 a ${pct(Fin.params(base.parametros).fic_vol_max)}% (art. 78).</span></div>
          <div class="field"><label for="fc-ficr">FIC — rendimentos creditados (R$)</label><input class="input" id="fc-ficr" inputmode="decimal" value="${brl(c ? c.fic_rendimentos || 0 : 0)}"></div>
          <div class="field"><label for="fc-ficg">FIC — resgates feitos (R$)</label><input class="input" id="fc-ficg" inputmode="decimal" value="${brl(c ? c.fic_resgates || 0 : 0)}"></div>
          <div class="field"><label for="fc-quotas">Quotas iniciais subscritas</label><input class="input" id="fc-quotas" type="number" min="0" value="${c ? c.quotas_iniciais : base.parametros.quotas_minimas}"></div>
          <div class="field"><label for="fc-integ">Integralizado na admissão (R$)</label><input class="input" id="fc-integ" inputmode="decimal" value="${brl(c ? c.integralizado_admissao : 0)}"></div>
          <div class="field"><label for="fc-adm">Data de admissão</label><input class="input" id="fc-adm" type="date" value="${c && c.data_admissao ? c.data_admissao : hojeISO()}"></div>
          <div class="field"><label for="fc-sit">Situação</label><select class="input" id="fc-sit"><option value="ativo">Ativo</option><option value="desligado" ${c && c.situacao === "desligado" ? "selected" : ""}>Desligado</option></select></div>
          <div class="field" id="fc-w-sai"><label for="fc-sai">Data de desligamento</label><input class="input" id="fc-sai" type="date" value="${c && c.data_desligamento ? c.data_desligamento : ""}"></div>
          <div class="field full"><label for="fc-perfil">Conta no site</label><select class="input" id="fc-perfil"><option value="">Sem conta ligada (liga sozinha quando ele se cadastrar)</option>${opcoes.map((p) => `<option value="${p.id}" ${c && c.perfil_id === p.id ? "selected" : ""}>${esc(p.nome)} · ${esc(p.email)}</option>`).join("")}</select></div>
        </div>
        <label class="ciente"><input type="checkbox" id="fc-tele" ${c && c.teletrabalho ? "checked" : ""}> <span>Trabalha em teletrabalho (recebe auxílio-teletrabalho nos meses com horas, art. 80)</span></label>
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
          perfil_id: $("#fc-perfil", m.el).value || null, compensar_aportes: $("#fc-comp", m.el).checked, observacao: $("#fc-obs", m.el).value.trim() || null,
          conselho: $("#fc-cons", m.el).value || null, categoria: $("#fc-cat", m.el).value || null, teletrabalho: $("#fc-tele", m.el).checked,
          fic_voluntario: lerPct($("#fc-ficv", m.el).value) || 0, fic_rendimentos: lerValor($("#fc-ficr", m.el).value) || 0, fic_resgates: lerValor($("#fc-ficg", m.el).value) || 0 };
        if (reg.fic_voluntario > Fin.params(base.parametros).fic_vol_max + 1e-9) return toast(`O FIC voluntário vai até ${pct(Fin.params(base.parametros).fic_vol_max)}%.`, "err");
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

    function experiencia(id) {
      const c = porId[id];
      const habs = expAll.habilitacoes.filter((h) => h.fin_cooperado_id === id);
      const exps = expAll.experiencias.filter((x) => x.fin_cooperado_id === id);
      const habPor = {}; habs.forEach((h) => { habPor[h.id] = h; });
      const docs = (rid) => expAll.comprovantes.filter((x) => x.ref_id === rid).map((x) => `<button class="link-botao" data-doc="${x.id}">${esc(x.nome_arquivo)}</button>`).join("<br>") || '<span class="sub">sem documento</span>';
      const selo = (x) => x.status === "aprovada" ? `<span class="selo ok">validado</span><span class="sub">${esc(x.analise_nome || "")}</span>` : x.status === "recusada" ? `<span class="selo warn">em exigência</span><span class="sub">${esc(x.motivo || "")}</span>` : '<span class="selo warn">em análise</span>';
      const botoes = (tab, x) => `<button class="btn btn-primary btn-sm" data-val="${tab}:${x.id}:aprovada">Validar</button> <button class="btn btn-ghost btn-sm" data-val="${tab}:${x.id}:recusada">Pôr em exigência</button>`;
      const enq = Fin.enquadramento(c, base, fech);
      const aprov = habs.filter((h) => h.status === "aprovada");
      const md = UI.modal(`
        <h2>Experiência de ${esc(c.nome)}</h2>
        <div class="notice ${enq.categoria ? "ok" : "warn"}">Enquadramento em ${Fin.nomeMes(fech)}: <b>${esc(enq.categoria || "pendente")}</b>${enq.habilitacao ? ` · ${esc(enq.habilitacao.titulo)} (${esc(enq.conselho || "")}) · ${enq.anos} ano(s) comprovados (${(enq.anos_externos || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} fora + ${enq.interna ? enq.interna.meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0} mês(es) na BIMCORE)` : ""}${enq.proxima ? ` · vira ${esc(enq.proxima.categoria)} em ${data(enq.proxima.data)}` : ""}${enq.avisos.length ? "<br>" + enq.avisos.map(esc).join("<br>") : ""}</div>
        <p class="hint">Valide com base nos documentos (art. 8º, V). Conta só o que tiver relação com a formação indicada; períodos em outra atividade não contam. Se faltar algo, ponha em exigência dizendo o que falta. Ninguém valida o próprio registro.</p>
        <h3 class="mini-tit">Formações</h3>
        ${habs.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Formação</th><th>Diploma / registro</th><th>Documentos</th><th>Situação</th><th></th></tr></thead>
          <tbody>${habs.map((h) => `<tr><td>${esc(h.titulo)}<span class="sub">${esc(Fin.NIVEIS[h.nivel] || "")} · ${esc(h.conselho || "")}</span></td><td>${data(h.data_habilitacao)}${h.registro ? `<span class="sub">${esc(h.registro)}</span>` : ""}</td><td>${docs(h.id)}</td><td>${selo(h)}</td><td class="acoes-celula">${botoes("habilitacoes", h)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhuma formação enviada.</p>'}
        <h3 class="mini-tit">Experiências</h3>
        ${exps.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Experiência</th><th>Formação</th><th>Período</th><th>Documentos</th><th>Situação</th><th></th></tr></thead>
          <tbody>${exps.map((x) => `<tr><td>${esc(x.descricao)}</td><td>${esc((habPor[x.habilitacao_id] || {}).titulo || "—")}</td><td>${data(x.inicio)} a ${x.fim ? data(x.fim) : "hoje"}</td><td>${docs(x.id)}</td><td>${selo(x)}</td><td class="acoes-celula">${botoes("experiencias", x)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhuma experiência enviada.</p>'}
        <h3 class="mini-tit">Função na cooperativa</h3>
        <div class="form-grid">
          <div class="field full"><label for="xq-hab">Formação usada na remuneração</label><select class="input" id="xq-hab"><option value="">${aprov.length === 1 ? "Automática (única validada)" : "Escolha"}</option>${aprov.map((h) => `<option value="${h.id}" ${c.habilitacao_remuneracao === h.id ? "selected" : ""}>${esc(h.titulo)} (${esc(h.conselho || "")})</option>`).join("")}</select></div>
        </div>
        <label class="ciente"><input type="checkbox" id="xq-coord" ${c.coordenador_designado ? "checked" : ""}> <span>Designado coordenador pelo Conselho de Administração (só vale com mais de 10 anos comprovados)</span></label>
        <div class="form-grid" id="xq-cw" ${c.coordenador_designado ? "" : "hidden"}>
          <div class="field"><label for="xq-desde">A partir de</label><input class="input" id="xq-desde" type="date" value="${c.coordenador_desde || ""}"></div>
          <div class="field"><label for="xq-ato">Ato de designação (ata, data)</label><input class="input" id="xq-ato" maxlength="200" value="${esc(c.coordenador_ato || "")}"></div>
        </div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-primary btn-sm" id="xq-ok">Salvar função</button></div>`);
      $("#xq-coord", md.el).onchange = (e) => { $("#xq-cw", md.el).hidden = !e.target.checked; };
      $("#xq-ok", md.el).onclick = async (ev) => {
        const reg = { id: c.id, habilitacao_remuneracao: $("#xq-hab", md.el).value || null, coordenador_designado: $("#xq-coord", md.el).checked,
          coordenador_desde: $("#xq-coord", md.el).checked ? $("#xq-desde", md.el).value || null : null, coordenador_ato: $("#xq-coord", md.el).checked ? $("#xq-ato", md.el).value.trim() || null : null };
        if (reg.coordenador_designado && (!reg.coordenador_desde || !reg.coordenador_ato)) return toast("Informe a data e o ato de designação.", "err");
        if (await acao(ev.currentTarget, () => API.fin.salvar("cooperados", reg), "Função salva.")) { md.fechar(); recarregar(); }
      };
      md.el.addEventListener("click", async (e) => {
        const dv = e.target.closest("[data-doc]");
        if (dv) { const cp = expAll.comprovantes.find((y) => y.id === dv.dataset.doc); const url = await acao(null, () => API.exp.link(cp)); if (url) window.open(url, "_blank", "noopener"); return; }
        const b = e.target.closest("[data-val]"); if (!b) return;
        const [tab, rid, st] = b.dataset.val.split(":");
        const mot = st === "recusada" ? await new Promise((ok) => {
          const mm = UI.modal(`<h2>Pôr em exigência</h2><div class="field"><label for="mv-m">O que falta ou o que precisa ser corrigido (o cooperado verá)</label><input class="input" id="mv-m" maxlength="200" placeholder="Ex.: enviar a carteira de trabalho deste período; período fora da área não conta"></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-danger btn-sm" id="mv-ok">Confirmar</button></div>`, () => ok(undefined));
          $("#mv-ok", mm.el).onclick = () => { const v = $("#mv-m", mm.el).value.trim(); ok(v || "Ver com a tesouraria"); mm.fechar(); };
        }) : null;
        if (st === "recusada" && mot === undefined) return;
        if (await acao(b, () => API.exp.analisar(tab, rid, st, mot), st === "aprovada" ? "Validado." : "Colocado em exigência. O cooperado vê o que falta.")) {
          md.fechar(); await recarregar(); const bt = el.querySelector(`[data-exp-coop="${id}"]`); if (bt) bt.click();
        }
      });
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
          <div><dt>FIC</dt><dd>${moeda(p.fic_saldo)}</dd></div>
          <div><dt>Fundo de 13º / férias</dt><dd>${moeda(p.fundo_13)} / ${moeda(p.fundo_ferias)}</dd></div>
          <div><dt>Retiradas no período</dt><dd>${moeda(p.detalhes.resumo.retiradas_ano)}</dd></div>
          <div><dt>Sobras a receber</dt><dd>${moeda(p.sobras_a_receber)}</dd></div>
        </dl>
        <h3 class="mini-tit">Contribuição mensal</h3>
        <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Retirada</th><th class="num">Líquido</th><th class="num">Contribuição devida</th><th class="num">Paga</th><th class="num">Em aberto</th></tr></thead>
          <tbody>${p.detalhes.mensal.map((x) => `<tr><td>${Fin.nomeMes(x.mes)}</td><td class="num">${x.retirada ? moeda(x.retirada) : "—"}</td><td class="num">${x.retirada ? moeda(x.liquido) : "—"}</td><td class="num">${moeda(x.devida)}</td><td class="num">${moeda(x.paga)}</td><td class="num">${x.em_aberto > 0.005 ? moeda(x.em_aberto) : "—"}</td></tr>`).join("")}</tbody></table></div>
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
      if ((b = t("[data-exp-coop]"))) return experiencia(b.dataset.expCoop);
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
    aba("Posição", [["Nome", 32], ["E-mail", 30], ["Quotas subscritas", 11], ["Capital subscrito", 14, "m"], ["Capital integralizado", 14, "m"], ["Total contribuído", 14, "m"], ["Contribuição mensal", 13, "m"], ["Valor em aberto", 13, "m"], ["Meses em atraso", 9], ["Saldo FIC", 12, "m"], ["Fundo 13º", 12, "m"], ["Fundo de férias", 12, "m"], ["Sobras a receber", 12, "m"], ["Aportes (outros créditos)", 14, "m"], ["Falta integralizar das quotas iniciais", 16, "m"], ["Contribuições pagas antecipadamente", 16, "m"], ["Retiradas no período", 14, "m"], ["Horas no período", 10]],
      lista.map((p) => [p.cooperado_nome, p.email, p.quotas_subscritas, p.capital_subscrito, p.capital_integralizado, p.contribuicoes_pagas, p.contribuicao_mensal, p.valor_em_aberto, p.meses_em_atraso, p.fic_saldo, p.fundo_13, p.fundo_ferias, p.sobras_a_receber, p.outros_creditos, p.detalhes.resumo.falta_inicial, p.detalhes.resumo.adiantado, p.detalhes.resumo.retiradas_ano, p.detalhes.resumo.horas]));
    const mm = []; lista.forEach((p) => p.detalhes.mensal.forEach((x) => mm.push([p.cooperado_nome, dt(x.mes + "-01"), x.devida, x.paga, Math.max(0, x.em_aberto)])));
    aba("Mês a mês", [["Cooperado", 32], ["Mês", 11, "mes"], ["Contribuição devida", 14, "m"], ["Contribuição paga", 14, "m"], ["Em aberto no mês", 14, "m"]], mm);
    const rr = []; lista.forEach((p) => p.detalhes.mensal.filter((x) => x.retirada || x.horas_produtivas || x.horas_formacao || x.horas_admin || x.decimo_pago || x.ferias_pago).forEach((x) => rr.push([p.cooperado_nome, dt(x.mes + "-01"), x.horas_produtivas, x.horas_formacao, x.horas_admin || 0, x.dias, x.retirada, x.inss, x.descontada, x.fic_coop, x.fic_vol, x.prov_13, x.prov_ferias, x.decimo_pago, x.ferias_pago, x.aux_tele, x.aux_alim, x.liquido])));
    aba("Retiradas", [["Cooperado", 30], ["Mês", 11, "mes"], ["Horas produtivas", 10], ["Horas de formação", 10], ["Suporte adm. (20%)", 10], ["Dias", 7], ["Retirada bruta", 13, "m"], ["INSS 11%", 12, "m"], ["Contribuição descontada", 13, "m"], ["FIC cooperativa", 12, "m"], ["FIC voluntário", 12, "m"], ["Provisão 13º", 12, "m"], ["Provisão férias", 12, "m"], ["13º pago", 12, "m"], ["Férias pagas", 12, "m"], ["Auxílio-teletrabalho", 12, "m"], ["Auxílio-alimentação", 12, "m"], ["Líquido a pagar", 13, "m"]], rr);
    const vc = Fin.cooperativa(base, calc);
    aba("Cooperativa", [["Mês", 11, "mes"], ["Receita de contratos", 14, "m"], ["Custo de Operação", 14, "m"], ["Suporte adm. pago pelos 20%", 14, "m"], ["Saldo dos 20%", 14, "m"], ["Retiradas brutas", 14, "m"], ["INSS retido", 13, "m"], ["INSS patronal", 13, "m"], ["FIC da cooperativa", 13, "m"], ["Provisões 13º e férias", 14, "m"], ["Auxílios", 12, "m"], ["Contribuições de capital", 14, "m"]],
      vc.linhas.map((l) => [dt(l.mes + "-01"), l.receita, l.custo_op, l.admin_cog, l.saldo_cog, l.retiradas, l.inss_retido, l.inss_patronal, l.fic_coop, l.provisoes, l.auxilios, l.contribuicoes]));
    aba("Despesas", [["Data", 12, "d"], ["Descrição", 50], ["Categoria", 20], ["Valor", 13, "m"], ["Cobrada dos cooperados?", 12], ["Cooperados que dividem", 40], ["Valor por cooperado", 13, "m"], ["Observação", 50]],
      base.despesas.map((d) => [dt(d.data), d.descricao, d.categoria, Number(d.valor), d.cobrar ? "Sim" : "Não", d.participantes.map((i) => nome[i]).join(", "), d.cobrar ? Fin.centavos(d.valor / Math.max(1, d.participantes.length)) : null, d.observacao]));
    aba("Pagamentos", [["Data", 12, "d"], ["Cooperado", 32], ["Tipo", 30], ["Despesa", 40], ["Mês de referência", 11, "mes"], ["Valor", 13, "m"], ["Origem", 18], ["Observação", 40], ["Lançado por", 22]],
      base.pagamentos.map((p) => [dt(p.data), nome[p.fin_cooperado_id], Fin.TIPOS_PAG[p.tipo], p.despesa_id ? (desp[p.despesa_id] || {}).descricao : null, p.mes_ref ? dt(p.mes_ref) : null, Number(p.valor), ORIGEM[p.origem] || p.origem, p.observacao, p.criado_nome]));
    aba("Cadastro", [["Nome", 32], ["E-mail", 30], ["Cargo", 18], ["Conselho", 9], ["Categoria", 12], ["Valor-hora", 11, "m"], ["Teletrabalho", 9], ["FIC voluntário %", 9], ["Conta no site", 12], ["Quotas iniciais", 10], ["Integralizado na admissão", 14, "m"], ["Admissão", 12, "d"], ["Situação", 11], ["Desligamento", 12, "d"], ["Aportes usados na integralização", 14], ["Observação", 40]],
      base.cooperados.map((c) => [c.nome, c.email, c.cargo, c.conselho, c.categoria, Fin.valorHora(c, base.parametros), c.teletrabalho ? "Sim" : "Não", Number(c.fic_voluntario || 0) * 100, c.perfil_id ? "Ligada" : "Sem conta", c.quotas_iniciais, Number(c.integralizado_admissao), dt(c.data_admissao), c.situacao, dt(c.data_desligamento), c.compensar_aportes ? "Sim" : "Não", c.observacao]));
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
