/* BIMCORE — Financeiro como sistema (etapa 1): a tesouraria lança tudo no site.
   Abas: Resumo, Retiradas, Cooperativa, Sobras e fundos, Despesas, Pagamentos e aportes, Cadastro, Configurações. */
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
  let vigSel = null;
  const pct = (v) => (v == null ? "" : (Number(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
  const lerPct = (t) => { const v = lerValor(t); return Number.isFinite(v) ? v / 100 : NaN; };
  const num = (t) => { const v = lerValor(t); return Number.isFinite(v) && v > 0 ? v : 0; };

  const lerValor = (t) => { t = String(t || "").replace(/[R$\s]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); return Fin.centavos(Number(t)); };
  const brl = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const hojeISO = () => UI.hoje();

  /* Trimestre ("2026-T4") e meses */
  const trimestreDe = (m) => { const [a, mm] = m.split("-").map(Number); return a + "-T" + Math.ceil(mm / 3); };
  const mesesDoTri = (t) => { const [a, q] = t.split("-T").map(Number); return [1, 2, 3].map((k) => `${a}-${String((q - 1) * 3 + k).padStart(2, "0")}`); };
  const nomeTri = (t) => { const [a, q] = t.split("-T"); return `${q}º trimestre de ${a}`; };
  /* Retrato da prestação de contas dos 20% (Estatuto, art. 23, §8º; RI, art. 170) */
  function dadosTrimestre(base, calc, t) {
    const ms = mesesDoTri(t);
    const vc = Fin.cooperativa(base, calc);
    const meses = ms.map((m) => { const l = vc.linhas.find((x) => x.mes === m) || {}; return { mes: m, receita: l.receita || 0, custo_op: l.custo_op || 0, admin_cog: l.admin_cog || 0, saldo_cog: l.saldo_cog || 0 }; });
    const despesas = (base.despesas || []).filter((d) => d.data && ms.includes(Fin.mesDe(d.data))).map((d) => ({ data: d.data, descricao: d.descricao, categoria: d.categoria, valor: Number(d.valor) }));
    const soma = (k) => Fin.centavos(meses.reduce((x, m) => x + m[k], 0));
    const tDesp = Fin.centavos(despesas.reduce((x, d) => x + d.valor, 0));
    return { trimestre: t, meses, despesas, totais: { receita: soma("receita"), custo_op: soma("custo_op"), admin_cog: soma("admin_cog"), despesas: tDesp, saldo: Fin.centavos(soma("custo_op") - soma("admin_cog") - tDesp) } };
  }
  /* Guias esperadas por competência: INSS (11% retido + 20% patronal) e IRRF retido */
  function guiasEsperadas(base) {
    const pr = Fin.params(base.parametros); const out = {};
    (base.retiradas || []).filter((r) => r.status === "paga" && r.pago_em).forEach((r) => {
      const m = Fin.mesDe(r.pago_em); const o = out[m] = out[m] || { mes: m, INSS: 0, IRRF: 0 };
      o.INSS += Number(r.inss || 0) + Number(r.valor) * pr.patronal_pct; o.IRRF += Number(r.ir || 0);
    });
    return Object.values(out).map((o) => ({ ...o, INSS: Fin.centavos(o.INSS), IRRF: Fin.centavos(o.IRRF) })).sort((a, b) => b.mes.localeCompare(a.mes));
  }
  function htmlPrestacao(d) {
    return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Receita de contratos</th><th class="num">20% (Custo de Operação e Gestão)</th><th class="num">Suporte administrativo + INSS patronal</th></tr></thead>
      <tbody>${d.meses.map((m) => `<tr><td>${Fin.nomeMes(m.mes)}</td><td class="num">${moeda(m.receita)}</td><td class="num">${moeda(m.custo_op)}</td><td class="num">${moeda(m.admin_cog)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${moeda(d.totais.receita)}</td><td class="num">${moeda(d.totais.custo_op)}</td><td class="num">${moeda(d.totais.admin_cog)}</td></tr></tfoot></table></div>
      ${d.despesas.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Despesa</th><th>Categoria</th><th class="num">Valor</th></tr></thead>
        <tbody>${d.despesas.map((x) => `<tr><td>${data(x.data)}</td><td>${esc(x.descricao)}</td><td>${esc(x.categoria || "")}</td><td class="num">${moeda(x.valor)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhuma despesa registrada no trimestre.</p>'}
      <dl class="sol-dados"><div><dt>20% arrecadados</dt><dd>${moeda(d.totais.custo_op)}</dd></div><div><dt>Suporte administrativo</dt><dd>${moeda(d.totais.admin_cog)}</dd></div><div><dt>Despesas</dt><dd>${moeda(d.totais.despesas)}</dd></div><div><dt>Saldo do trimestre</dt><dd style="color:${d.totais.saldo < 0 ? "var(--err)" : "var(--ok)"}">${moeda(d.totais.saldo)}</dd></div></dl>`;
  }
  const STATUS_PREST = { aguardando_cf: '<span class="selo warn">aguardando o Conselho Fiscal</span>', devolvida: '<span class="selo err">devolvida pelo Conselho Fiscal</span>', conferida: '<span class="selo info">conferida, pronta para publicar</span>', publicada: '<span class="selo ok">publicada aos cooperados</span>' };

  async function render(el, ctx) {
    const leitura = !!(ctx && ctx.leitura);
    document.body.classList.toggle("so-leitura", leitura);
    const [base, movs, perfis, expAll, guias, confs, prests] = await Promise.all([API.fin.tudo(), API.movimentos.todos().catch(() => []), API.cooperados.listar().catch(() => []), API.exp.todos().catch(() => ({ habilitacoes: [], experiencias: [], comprovantes: [] })),
      API.cf.guias().catch(() => []), API.cf.conferencias().catch(() => []), API.cf.prestacoes().catch(() => [])]);
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

    const abas = [["resumo", "Resumo"], ["retiradas", "Retiradas"], ["cooperativa", "Cooperativa"], ["sobras", "Sobras e fundos"], ["despesas", "Despesas"], ["pagamentos", "Pagamentos e aportes"], ["cadastro", "Cadastro"], ["config", "Configurações"]];
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Tesouraria</p><h1>Financeiro</h1></div>
        <button class="btn btn-ghost" id="t-exportar">Exportar para Excel</button></div>
      <p class="muted">Contas calculadas pelo Estatuto até <b>${Fin.nomeMes(fech)}</b>${base.parametros.fechamento ? " (mês de fechamento fixado em Configurações)" : " (atualiza sozinho a cada mês)"}. Cada lançamento aparece na hora na "Minha conta" do cooperado.</p>
      <nav class="subabas" role="tablist">${abas.map(([k, t]) => `<button role="tab" data-aba="${k}" aria-selected="${aba === k}">${t}${k === "retiradas" && (base.retiradas || []).some((r) => r.status === "solicitada") ? ` <span class="contador">${(base.retiradas || []).filter((r) => r.status === "solicitada").length}</span>` : ""}${k === "resumo" && aguardando.length ? ` <span class="contador">${aguardando.length}</span>` : ""}${false && pendExp ? ` <span class="contador">${pendExp}</span>` : ""}</button>`).join("")}</nav>
      <div id="t-corpo"></div>`;
    el.querySelectorAll("[data-aba]").forEach((b) => { b.onclick = () => { aba = b.dataset.aba; recarregar(); }; });
    $("#t-exportar").onclick = (ev) => acao(ev.currentTarget, () => exportar(base, calc, perfilPorId), "Planilha exportada.");
    const corpo = $("#t-corpo");
    if (leitura) corpo.insertAdjacentHTML("beforebegin", '<div class="notice">Modo leitura do Conselho Fiscal: você vê tudo, mas não lança, paga nem valida nada (Estatuto, art. 67, §1º). Para registrar conferências e inconformidades, use a página Conselho Fiscal.</div>');

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
        ${(() => { const atr = (base.parcelas || []).filter((x) => !x.recebido_em && x.previsto_em && x.previsto_em < hojeISO()); const fat = (base.parcelas || []).filter((x) => !x.recebido_em && (base.marcos || []).some((m) => m.parcela_id === x.id && m.entregue_em));
          return (atr.length ? `<div class="notice err"><b>${atr.length} parcela(s) de contrato em atraso.</b> Veja em Cooperativa → Parcelas dos contratos; se faltar caixa para as retiradas, cubra com o Fundo de Soberania.</div>` : "")
            + (fat.length ? `<div class="notice ok"><b>${fat.length} parcela(s) liberada(s) por entrega concluída</b>: ${fat.map((x) => esc(x.descricao)).join(", ")}. Emita a nota fiscal e acompanhe o pagamento.</div>` : ""); })()}
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

    /* ---------------- Retiradas ---------------- */
    if (aba === "retiradas") {
      const rets = (base.retiradas || []).slice();
      const pend = rets.filter((r) => r.status === "solicitada").sort((x, y) => String(x.prazo).localeCompare(String(y.prazo)));
      const hist = rets.filter((r) => r.status !== "solicitada").sort((x, y) => String(y.pago_em || y.solicitado_em).localeCompare(String(x.pago_em || x.solicitado_em)));
      const hojeI = hojeISO();
      const lista = coops.map((c) => calc[c.id]).filter((p) => p.credito && (p.credito.gerado || p.credito.solicitado || p.credito.retirado)).sort((x, y) => x.cooperado_nome.localeCompare(y.cooperado_nome));
      const pr = Fin.params(base.parametros);
      const desc = (r) => Fin.descontosRetirada(porId[r.fin_cooperado_id], base, Number(r.valor), Fin.mesDe(hojeI));
      const cx = Fin.caixaLivre(base.caixa);
      const pat = 1 + pr.patronal_pct;
      const aPagar = lista.reduce((t, p) => t + p.credito.saldo, 0);
      const ult3 = [0, 1, 2].map((k) => Fin.somaMes(Fin.mesDe(hojeI), -k));
      const rec3 = (base.receitas || []).filter((x) => ult3.includes(Fin.mesDe(x.mes))).reduce((t, x) => t + Number(x.receita_bruta || 0), 0);
      const ret3 = rets.filter((x) => x.status === "paga" && x.pago_em && ult3.includes(Fin.mesDe(x.pago_em))).reduce((t, x) => t + Number(x.valor), 0) * pat;
      const diasSaldo = cx.informado ? Math.round((new Date(hojeI) - new Date(cx.data)) / 86400000) : null;
      const saldos = (base.saldos || []).slice(0, 6);
      corpo.innerHTML = `
        <section class="painel">
          <div class="painel-cab"><h2>Caixa da cooperativa</h2>${!cx.informado ? '<span class="selo err">saldo não informado</span>' : diasSaldo > 7 ? `<span class="selo warn">saldo de ${diasSaldo} dias atrás</span>` : '<span class="selo ok">saldo em dia</span>'}</div>
          <div class="kpis">
            <div class="kpi"><span class="rot">Saldo em conta</span><span class="val">${cx.informado ? moeda(cx.saldo) : "—"}</span><span class="det">${cx.informado ? "informado em " + data(cx.data) : "Informe abaixo o saldo do BTG"}</span></div>
            <div class="kpi"><span class="rot">Livre para retiradas</span><span class="val" style="color:${cx.livre > 0 ? "var(--ok)" : "var(--err)"}">${moeda(Math.max(0, cx.livre))}</span><span class="det">Saldo − reserva (${moeda(pr.reserva_caixa)}) − pedidos e pagamentos posteriores, com os 20% patronais</span></div>
            <div class="kpi"><span class="rot">Crédito acumulado a pagar</span><span class="val">${moeda(aPagar * pat)}</span><span class="det">Saldo de crédito de todos + 20% patronal: o que a cooperativa deve se todos pedirem</span></div>
            <div class="kpi"><span class="rot">Receita × retiradas (3 meses)</span><span class="val" style="color:${ret3 > rec3 * (1 - pr.custo_op_pct) + 0.005 ? "var(--err)" : "var(--ok)"}">${moeda(rec3)} × ${moeda(ret3)}</span><span class="det">${ret3 > rec3 * (1 - pr.custo_op_pct) + 0.005 ? "Retiradas acima dos 80% da receita: atenção" : "Retiradas dentro dos 80% da receita"}</span></div>
          </div>
          <form id="t-sal" class="form-grid" novalidate>
            <div class="field"><label for="sl-data">Data do saldo</label><input class="input" id="sl-data" type="date" value="${hojeI}" max="${hojeI}"></div>
            <div class="field"><label for="sl-val">Saldo da conta no BTG (R$)</label><input class="input" id="sl-val" inputmode="decimal"></div>
            <div class="field full"><label for="sl-obs">Observação (opcional)</label><input class="input" id="sl-obs" maxlength="200"></div>
            <div class="full"><button class="btn btn-primary" id="sl-btn" type="submit">Registrar saldo</button></div>
          </form>
          <p class="hint">Os cooperados só conseguem pedir retirada até o valor livre. Atualize o saldo depois de cada entrada de cliente e de cada lote de transferências; as retiradas pagas depois da data do saldo já são descontadas sozinhas.</p>
          ${saldos.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th class="num">Saldo</th><th>Registrado por</th><th>Conselho Fiscal</th><th></th></tr></thead>
            <tbody>${saldos.map((x) => { const cf = confs.find((k) => k.tipo === "saldo" && k.ref_id === x.id); return `<tr><td>${data(x.data)}${x.observacao ? `<span class="sub">${esc(x.observacao)}</span>` : ""}</td><td class="num">${moeda(x.saldo)}</td><td>${esc(x.registrado_nome || "")}</td>
              <td>${cf ? `<span class="selo ${cf.situacao === "conferido" ? "ok" : "err"}">${cf.situacao}</span>${cf.observacao ? `<span class="sub">${esc(cf.observacao)}</span>` : ""}` : '<span class="selo">não conferido</span>'}</td><td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-delsal="${x.id}">Excluir</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}
        </section>
        <section class="painel ${pend.length ? "acerto" : ""}">
          <div class="painel-cab"><h2>Retiradas solicitadas</h2>${pend.length ? `<span class="selo warn">${pend.length}</span>` : ""}</div>
          <p class="muted">Cada cooperado pede a retirada do crédito que acumulou com as horas lançadas. Faça a transferência do <b>líquido</b> até o prazo (${pr.retirada_dia_util}º dia útil do mês seguinte ao pedido) e marque como paga. O INSS retido (11%), o patronal (20%) e o IR retido você recolhe à parte, nas guias do mês.</p>
          ${pend.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Cooperado</th><th>Pedido em</th><th class="num">Bruto</th><th class="num">INSS 11%</th><th class="num">IR</th><th class="num">Capital 1,5%</th><th class="num">FIC vol.</th><th class="num">Líquido a transferir</th><th>Prazo</th><th></th></tr></thead>
            <tbody>${pend.map((r) => { const d = desc(r); const atr = r.prazo && r.prazo < hojeI; return `<tr>
              <td>${esc((porId[r.fin_cooperado_id] || {}).nome || "—")}<span class="sub">saldo restante ${moeda((calc[r.fin_cooperado_id] || {}).credito ? calc[r.fin_cooperado_id].credito.saldo : 0)}</span></td>
              <td>${dataHora(r.solicitado_em)}</td><td class="num">${moeda(r.valor)}</td><td class="num">${moeda(d.inss)}</td><td class="num">${moeda(d.ir)}</td><td class="num">${moeda(d.contribuicao)}</td><td class="num">${moeda(d.fic_vol)}</td>
              <td class="num"><b>${moeda(d.liquido)}</b></td>
              <td>${atr ? `<span class="selo err">${data(r.prazo)}</span>` : data(r.prazo)}</td>
              <td class="acoes-celula"><button class="btn btn-primary btn-sm" data-pagar="${r.id}">Registrar pagamento</button> <button class="btn btn-danger btn-sm" data-recret="${r.id}">Recusar</button></td></tr>`; }).join("")}</tbody>
          </table></div>` : '<p class="vazio">Nenhuma retirada aguardando transferência.</p>'}
        </section>
        <section class="painel">
          <h2>Crédito de cada cooperado</h2>
          ${lista.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Cooperado</th><th class="num">Crédito gerado</th><th class="num">Retirado</th><th class="num">Solicitado</th><th class="num">Saldo</th></tr></thead>
            <tbody>${lista.map((p) => `<tr><td>${esc(p.cooperado_nome)}<span class="sub">${p.enquadramento && p.enquadramento.categoria ? esc(p.enquadramento.categoria) + " · " + moeda(p.valor_hora) + "/h" : "sem enquadramento: valor-hora zerado"}</span></td>
              <td class="num">${moeda(p.credito.gerado)}</td><td class="num">${moeda(p.credito.retirado)}</td><td class="num">${moeda(p.credito.solicitado)}</td><td class="num">${moeda(p.credito.saldo)}</td></tr>`).join("")}</tbody>
          </table></div>` : '<p class="vazio">Ninguém tem crédito ainda. O crédito nasce das horas lançadas em Minhas horas (produção técnica, formação e suporte administrativo) × valor-hora da categoria.</p>'}
        </section>
        ${hist.length ? `<section class="painel"><h2>Histórico</h2><div class="tabela-wrap"><table class="tabela">
          <thead><tr><th>Cooperado</th><th>Situação</th><th class="num">Bruto</th><th class="num">INSS</th><th class="num">IR</th><th class="num">Capital</th><th class="num">FIC vol.</th><th class="num">Líquido</th><th></th></tr></thead>
          <tbody>${hist.map((r) => `<tr><td>${esc((porId[r.fin_cooperado_id] || {}).nome || "—")}<span class="sub">pedido em ${dataHora(r.solicitado_em)}</span></td>
            <td>${r.status === "paga" ? `<span class="selo ok">paga em ${data(r.pago_em)}</span><span class="sub">${esc(r.pago_nome || "")}</span>` : `<span class="selo">cancelada</span>${r.motivo ? `<span class="sub">${esc(r.motivo)}</span>` : ""}`}</td>
            <td class="num">${moeda(r.valor)}</td><td class="num">${r.status === "paga" ? moeda(r.inss) : "—"}</td><td class="num">${r.status === "paga" ? moeda(r.ir || 0) : "—"}</td><td class="num">${r.status === "paga" ? moeda(r.contribuicao) : "—"}</td><td class="num">${r.status === "paga" ? moeda(r.fic_vol) : "—"}</td><td class="num">${r.status === "paga" ? moeda(r.liquido) : "—"}</td>
            <td class="acoes-celula">${r.status === "paga" ? `<button class="btn btn-ghost btn-sm" data-dem="${r.id}">Demonstrativo</button> <button class="btn btn-ghost btn-sm" data-desfazer="${r.id}">Desfazer</button>` : ""}</td></tr>`).join("")}</tbody>
        </table></div></section>` : ""}
        <section class="painel"><h2>Guias recolhidas (INSS e IR)</h2>
          <p class="hint">Registre cada guia paga. O site mostra o valor esperado de cada competência pelas retiradas pagas: INSS = 11% retido + 20% patronal; IRRF = IR retido. O Conselho Fiscal confere (Estatuto, art. 67, m e n).</p>
          ${(() => { const esp = guiasEsperadas(base); return esp.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Competência</th><th class="num">INSS esperado</th><th class="num">INSS registrado</th><th class="num">IRRF esperado</th><th class="num">IRRF registrado</th></tr></thead>
            <tbody>${esp.map((e) => { const reg = (t) => Fin.centavos(guias.filter((g) => g.tipo === t && Fin.mesDe(g.competencia) === e.mes).reduce((x, g) => x + Number(g.valor), 0)); const ri = reg("INSS"), rr = reg("IRRF");
              const sel = (a, b) => `<span class="selo ${Math.abs(a - b) < 0.01 ? "ok" : "warn"}">${moeda(b)}</span>`; return `<tr><td>${Fin.nomeMes(e.mes)}</td><td class="num">${moeda(e.INSS)}</td><td class="num">${sel(e.INSS, ri)}</td><td class="num">${moeda(e.IRRF)}</td><td class="num">${sel(e.IRRF, rr)}</td></tr>`; }).join("")}</tbody></table></div>` : '<p class="vazio">Ainda não há retiradas pagas, então não há guias a recolher.</p>'; })()}
          <form id="t-guia" class="form-grid" novalidate>
            <div class="field"><label for="gu-comp">Competência</label><input class="input" id="gu-comp" type="month" value="${Fin.mesDe(hojeI)}"></div>
            <div class="field"><label for="gu-tipo">Tipo</label><select class="input" id="gu-tipo"><option>INSS</option><option>IRRF</option><option>Outro</option></select></div>
            <div class="field"><label for="gu-val">Valor pago (R$)</label><input class="input" id="gu-val" inputmode="decimal"></div>
            <div class="field"><label for="gu-pago">Pago em</label><input class="input" id="gu-pago" type="date" value="${hojeI}" max="${hojeI}"></div>
            <div class="field full"><label for="gu-obs">Observação (nº da guia, DARF, DCTFWeb)</label><input class="input" id="gu-obs" maxlength="200"></div>
            <div class="full"><button class="btn btn-primary" id="gu-btn" type="submit">Registrar guia</button></div>
          </form>
          ${guias.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Competência</th><th>Tipo</th><th class="num">Valor</th><th>Pago em</th><th>Conselho Fiscal</th><th></th></tr></thead>
            <tbody>${guias.map((g) => { const cf = confs.find((k) => k.tipo === "guia" && k.ref_id === g.id); return `<tr><td>${Fin.nomeMes(Fin.mesDe(g.competencia))}${g.observacao ? `<span class="sub">${esc(g.observacao)}</span>` : ""}</td><td>${esc(g.tipo)}</td><td class="num">${moeda(g.valor)}</td><td>${data(g.pago_em)}</td>
              <td>${cf ? `<span class="selo ${cf.situacao === "conferido" ? "ok" : "err"}">${cf.situacao}</span>${cf.observacao ? `<span class="sub">${esc(cf.observacao)}</span>` : ""}` : '<span class="selo">não conferida</span>'}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-delguia="${g.id}">Excluir</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}
        </section>`;
      $("#t-guia").addEventListener("submit", async (e) => {
        e.preventDefault(); const comp = $("#gu-comp").value, v = lerValor($("#gu-val").value);
        if (!comp) return toast("Informe a competência.", "err"); if (!(v >= 0) || $("#gu-val").value.trim() === "") return toast("Informe o valor.", "err");
        if (await acao($("#gu-btn"), () => API.cf.salvarGuia({ competencia: comp + "-01", tipo: $("#gu-tipo").value, valor: v, pago_em: $("#gu-pago").value || null, observacao: $("#gu-obs").value.trim() || null }), "Guia registrada.")) recarregar();
      });
      $("#t-sal").addEventListener("submit", async (e) => {
        e.preventDefault(); const dt = $("#sl-data").value, v = lerValor($("#sl-val").value);
        if (!dt) return toast("Informe a data.", "err"); if (!Number.isFinite(v) || $("#sl-val").value.trim() === "") return toast("Informe o saldo.", "err");
        if (await acao($("#sl-btn"), () => API.fin.salvarSaldo({ data: dt, saldo: v, observacao: $("#sl-obs").value.trim() || null }), "Saldo registrado.")) recarregar();
      });
      corpo.onclick = async (ev) => {
        const bdm = ev.target.closest("[data-dem]");
        if (bdm) {
          const r = rets.find((x) => x.id === bdm.dataset.dem), c = porId[r.fin_cooperado_id];
          const d = window.Demonstrativo.dados(c, base, Fin.mesDe(r.pago_em), calc[c.id]);
          const m = UI.modal(`${window.Demonstrativo.html(d)}<div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-primary btn-sm permitido" id="dm-imp">Imprimir ou salvar em PDF</button></div>`);
          $("#dm-imp", m.el).onclick = () => window.Demonstrativo.imprimir(d);
          return;
        }
        const bg = ev.target.closest("[data-delguia]");
        if (bg) { if (!(await confirmar("Excluir o registro desta guia?", "Excluir"))) return; if (await acao(bg, () => API.cf.excluirGuia(bg.dataset.delguia), "Registro excluído.")) recarregar(); return; }
        const bs = ev.target.closest("[data-delsal]");
        if (bs) { if (!(await confirmar("Excluir este registro de saldo?", "Excluir"))) return; if (await acao(bs, () => API.fin.excluirSaldo(bs.dataset.delsal), "Registro excluído.")) recarregar(); return; }
        const bp = ev.target.closest("[data-pagar]"), br = ev.target.closest("[data-recret]"), bd = ev.target.closest("[data-desfazer]");
        if (bp) {
          const r = rets.find((x) => x.id === bp.dataset.pagar); const c = porId[r.fin_cooperado_id];
          const m = UI.modal(`
            <h2>Retirada de ${esc(c.nome)}</h2>
            <p class="muted">Bruto de <b>${moeda(r.valor)}</b>. Confira os descontos e informe a data da transferência.</p>
            <div class="form-grid">
              <div class="field"><label for="pg-data">Transferência feita em</label><input class="input" id="pg-data" type="date" value="${hojeI}" max="${hojeI}"></div>
              <div class="field"><label for="pg-inss">INSS retido (R$)</label><input class="input" id="pg-inss" inputmode="decimal"></div>
              <div class="field"><label for="pg-ir">IR retido (R$)</label><input class="input" id="pg-ir" inputmode="decimal"></div>
              <div class="field"><label for="pg-cap">Contribuição de capital (R$)</label><input class="input" id="pg-cap" inputmode="decimal"></div>
              <div class="field"><label for="pg-fic">FIC voluntário (R$)</label><input class="input" id="pg-fic" inputmode="decimal"></div>
            </div>
            <p class="hint" id="pg-liq"></p>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="pg-ok">Confirmar pagamento</button></div>`);
          const preencher = () => { const d = Fin.descontosRetirada(c, base, Number(r.valor), Fin.mesDe($("#pg-data", m.el).value || hojeI)); $("#pg-inss", m.el).value = brl(d.inss); $("#pg-ir", m.el).value = brl(d.ir); $("#pg-cap", m.el).value = brl(d.contribuicao); $("#pg-fic", m.el).value = brl(d.fic_vol); liq(); };
          const liq = () => { const l = Fin.centavos(Number(r.valor) - num($("#pg-inss", m.el).value) - num($("#pg-ir", m.el).value) - num($("#pg-cap", m.el).value) - num($("#pg-fic", m.el).value)); $("#pg-liq", m.el).innerHTML = `Líquido transferido ao cooperado: <b>${moeda(l)}</b>`; return l; };
          $("#pg-data", m.el).addEventListener("change", preencher); ["pg-inss", "pg-ir", "pg-cap", "pg-fic"].forEach((k) => $("#" + k, m.el).addEventListener("input", liq)); preencher();
          $("#pg-ok", m.el).onclick = async (e2) => {
            const dt = $("#pg-data", m.el).value; if (!dt) return toast("Informe a data da transferência.", "err");
            const l = liq(); if (l < 0) return toast("Os descontos passam do bruto.", "err");
            const ok = await acao(e2.currentTarget, () => API.fin.pagarRetirada(r.id, { pago_em: dt, inss: num($("#pg-inss", m.el).value), ir: num($("#pg-ir", m.el).value), contribuicao: num($("#pg-cap", m.el).value), fic_vol: num($("#pg-fic", m.el).value), liquido: l }), "Retirada registrada como paga.");
            if (ok) { m.fechar(); recarregar(); }
          };
        }
        if (br) {
          const motivo = await new Promise((res) => {
            const m = UI.modal(`<h2>Recusar retirada</h2><div class="field"><label for="rc-mot">Motivo (o cooperado vê)</label><input class="input" id="rc-mot" maxlength="200"></div>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-danger btn-sm" id="rc-ok">Recusar</button></div>`, () => res(null));
            $("#rc-ok", m.el).onclick = () => { const v = $("#rc-mot", m.el).value.trim(); if (!v) return toast("Informe o motivo.", "err"); res(v); m.fechar(); };
          });
          if (!motivo) return;
          const ok = await acao(br, () => API.fin.cancelarRetirada(br.dataset.recret, motivo), "Solicitação recusada. O valor volta ao saldo do cooperado.");
          if (ok) recarregar();
        }
        if (bd) {
          if (!(await confirmar("Desfazer o pagamento? A retirada volta para 'solicitada'. Faça isso só se marcou por engano.", "Desfazer"))) return;
          const ok = await acao(bd, () => API.fin.desfazerPagamento(bd.dataset.desfazer), "Pagamento desfeito.");
          if (ok) recarregar();
        }
      };
    }

    /* ---------------- Cooperativa ---------------- */
    if (aba === "cooperativa") {
      const vc = Fin.cooperativa(base, calc);
      const pr = Fin.params(base.parametros);
      const L = vc.linhas.filter((l) => l.receita || l.retiradas || l.admin_cog || l.contribuicoes || l.fic_coop);
      const tot = (k) => L.reduce((t, l) => t + l[k], 0);
      const cols = [["receita", "Receita de contratos"], ["custo_op", "Custo de Operação (20%)"], ["admin_cog", "Suporte adm. (crédito + INSS patronal)"], ["saldo_cog", "Saldo dos 20%"], ["retiradas", "Retiradas brutas"], ["inss_retido", "INSS retido"], ["inss_patronal", "INSS patronal (20%)"], ["fic_coop", "FIC da cooperativa"], ["provisoes", "Provisões 13º e férias"], ["auxilios", "Auxílios"], ["contribuicoes", "Contribuições de capital"]];
      corpo.innerHTML = `
        <section class="painel"><h2>Movimento da cooperativa por mês</h2>
          ${L.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th>${cols.map(([, t]) => `<th class="num">${t}</th>`).join("")}</tr></thead>
            <tbody>${L.map((l) => `<tr><td>${Fin.nomeMes(l.mes)}</td>${cols.map(([k]) => `<td class="num">${moeda(l[k])}</td>`).join("")}</tr>`).join("")}</tbody>
            <tfoot><tr><td>Total</td>${cols.map(([k]) => `<td class="num">${moeda(tot(k))}</td>`).join("")}</tr></tfoot></table></div>` : '<p class="vazio">Ainda não há retiradas nem receitas lançadas.</p>'}
        </section>
        <section class="painel"><h2>Prestação de contas trimestral dos 20%</h2>
          <p class="hint">Mostra quanto entrou de Custo de Operação e Gestão no trimestre e como foi usado. Prepare e envie ao Conselho Fiscal; depois da conferência, publique para todos os cooperados (Estatuto, art. 23, §8º; Regimento, art. 170, até 15 dias após o fim do trimestre).</p>
          <div class="sol-acoes"><div class="field"><label for="pt-tri">Trimestre</label><select class="input" id="pt-tri">${(() => { const atual = trimestreDe(Fin.mesDe(hojeISO())); const ts = new Set([atual]); L.forEach((l) => ts.add(trimestreDe(l.mes))); prests.forEach((x) => ts.add(x.trimestre)); return [...ts].sort().reverse().map((t) => `<option value="${t}">${nomeTri(t)}</option>`).join(""); })()}</select></div>
            <button class="btn btn-primary btn-sm" type="button" data-preparar>Preparar e enviar ao Conselho Fiscal</button></div>
          ${prests.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Trimestre</th><th>Situação</th><th class="num">20% arrecadados</th><th class="num">Saldo</th><th>Conselho Fiscal</th><th></th></tr></thead>
            <tbody>${prests.map((x) => `<tr><td>${nomeTri(x.trimestre)}<span class="sub">preparada por ${esc(x.preparado_nome || "")} em ${dataHora(x.preparado_em)}</span></td><td>${STATUS_PREST[x.status] || esc(x.status)}</td>
              <td class="num">${moeda(x.dados.totais.custo_op)}</td><td class="num">${moeda(x.dados.totais.saldo)}</td>
              <td>${x.conferido_nome ? esc(x.conferido_nome) + " em " + dataHora(x.conferido_em) : "—"}${x.parecer ? `<span class="sub">${esc(x.parecer)}</span>` : ""}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-verprest="${x.trimestre}">Ver</button>${x.status === "conferida" ? ` <button class="btn btn-primary btn-sm" data-publicar="${x.trimestre}">Publicar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
        </section>
        <section class="painel"><h2>Parcelas dos contratos</h2>
          <p class="hint">Quando o pagamento de uma parcela cair na conta, registre aqui. O valor entra sozinho na receita do mês e nos 20% do Custo de Operação e Gestão (art. 23, §7º). Os contratos e as parcelas previstas são cadastrados em Contratos e projetos.</p>
          ${(() => { const pcs = (base.parcelas || []).slice().sort((a, b) => (!!a.recebido_em - !!b.recebido_em) || String(a.previsto_em || "9").localeCompare(String(b.previsto_em || "9"))); const ctr = {}; (base.contratos || []).forEach((c) => { ctr[c.id] = c; });
            return pcs.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Contrato</th><th>Parcela</th><th>Previsto</th><th class="num">Valor</th><th>Recebimento</th><th></th></tr></thead>
              <tbody>${pcs.map((x) => `<tr><td>${esc((ctr[x.contrato_id] || {}).objeto || "—")}<span class="sub">${esc((ctr[x.contrato_id] || {}).contratante || "")}</span></td><td>${esc(x.descricao)}</td><td>${x.previsto_em ? data(x.previsto_em) : "—"}</td><td class="num">${moeda(x.valor)}</td>
                <td>${x.recebido_em ? `<span class="selo ok">${data(x.recebido_em)}</span><span class="sub">${moeda(x.valor_recebido != null ? x.valor_recebido : x.valor)}${x.nota_fiscal ? " · NF " + esc(x.nota_fiscal) : ""}${x.registrado_nome ? " · " + esc(x.registrado_nome) : ""}${x.recomposto_em ? " · Soberania recomposta" : ""}</span>`
                  : x.previsto_em && x.previsto_em < hojeISO() ? `<span class="selo err">atrasada desde ${data(x.previsto_em)}</span>${x.coberto_soberania ? `<span class="sub">retiradas cobertas pelo Fundo de Soberania: ${moeda(x.coberto_soberania)}</span>` : ""}`
                  : '<span class="selo warn">a receber</span>'}${(() => { const mk = (base.marcos || []).find((m) => m.parcela_id === x.id); return mk ? `<span class="sub">entrega: ${esc(mk.titulo)} ${mk.entregue_em ? "— <b>feita em " + data(mk.entregue_em) + ", pode faturar</b>" : "— ainda não entregue"}</span>` : ""; })()}</td>
                <td class="acoes-celula">${x.recebido_em ? `<button class="btn btn-ghost btn-sm" data-desreceber="${x.id}">Desfazer</button>` : `<button class="btn btn-primary btn-sm" data-receber="${x.id}">Registrar recebimento</button>${x.previsto_em && x.previsto_em < hojeISO() && !x.coberto_soberania ? ` <button class="btn btn-ghost btn-sm" data-cobrir="${x.id}">Cobrir com o Fundo de Soberania</button>` : ""}`}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhuma parcela de contrato cadastrada.</p>'; })()}
        </section>
        <section class="painel"><h2>Outras receitas</h2>
          <p class="hint">Só o que <b>não</b> é parcela de contrato cadastrado (ex.: contrato antigo, serviço avulso). Entra na receita do mês junto com as parcelas recebidas.</p>
          <form id="t-rec" class="form-grid" novalidate>
            <div class="field"><label for="rc-mes">Mês</label><input class="input" id="rc-mes" type="month" value="${Fin.mesDe(hojeISO())}"></div>
            <div class="field"><label for="rc-val">Receita bruta (R$)</label><input class="input" id="rc-val" inputmode="decimal"></div>
            <div class="full"><button class="btn btn-primary" id="rc-btn" type="submit">Salvar receita do mês</button></div>
          </form>
        </section>`;
      corpo.addEventListener("click", async (ev) => {
        const br = ev.target.closest("[data-receber]"), bdr = ev.target.closest("[data-desreceber]"), bc = ev.target.closest("[data-cobrir]");
        if (bc) {
          const x = (base.parcelas || []).find((y) => y.id === bc.dataset.cobrir); const ct = (base.contratos || []).find((c) => c.id === x.contrato_id) || {};
          const pub = await API.sobras.publico().catch(() => ({ movimentos: [] })); const saldoS = Fin.centavos(pub.movimentos.filter((m) => m.fundo === "soberania").reduce((t, m) => t + Number(m.valor), 0));
          const sugerido = Math.min(saldoS, Fin.centavos(Number(x.valor) * (1 - Number(ct.retencao_pct || 0)) * (1 - Fin.params(base.parametros).custo_op_pct)));
          const m = UI.modal(`<h2>Cobrir retiradas com o Fundo de Soberania</h2><p>A parcela <b>${esc(x.descricao)}</b> de ${esc(ct.contratante || "")} está atrasada. O Regimento (art. 120) usa o Fundo de Soberania para manter as retiradas enquanto o pagamento não chega; ele é recomposto sozinho quando você registrar o recebimento.</p>
            <dl class="sol-dados"><div><dt>Saldo do fundo</dt><dd>${moeda(saldoS)}</dd></div><div><dt>Parcela</dt><dd>${moeda(x.valor)}</dd></div></dl>
            ${saldoS <= 0 ? '<div class="notice warn">O Fundo de Soberania ainda não tem saldo. Ele se forma com as sobras do exercício (Regimento, arts. 116 e 120). Enquanto isso, as retiradas dependem do caixa livre.</div>' : ""}
            <div class="field"><label for="cb-v">Valor a usar (R$)</label><input class="input" id="cb-v" inputmode="decimal" value="${brl(sugerido)}"><span class="hint">Sugestão: o que a parcela pagaria à equipe (sem retenções e sem os 20%). Depois, transfira esse valor da aplicação do fundo para a conta e atualize o saldo em Retiradas.</span></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="cb-ok">Registrar cobertura</button></div>`);
          $("#cb-ok", m.el).onclick = async (e2) => { const v = lerValor($("#cb-v", m.el).value); if (!(v > 0)) return toast("Informe o valor.", "err"); if (await acao(e2.currentTarget, () => API.proj.cobrirSoberania(x.id, v), "Cobertura registrada no Fundo de Soberania.")) { m.fechar(); recarregar(); } };
          return;
        }
        if (bdr) { if (!(await confirmar("Desfazer o registro do recebimento?", "Desfazer"))) return; if (await acao(bdr, () => API.proj.salvarParcela({ id: bdr.dataset.desreceber, recebido_em: null, valor_recebido: null, nota_fiscal: null }), "Recebimento desfeito.")) recarregar(); return; }
        if (!br) return;
        const x = (base.parcelas || []).find((y) => y.id === br.dataset.receber);
        const m = UI.modal(`<h2>Registrar recebimento</h2><p>${esc(x.descricao)}: ${moeda(x.valor)} previstos.</p>
          <div class="form-grid"><div class="field"><label for="rp-d">Recebido em</label><input class="input" id="rp-d" type="date" value="${hojeISO()}" max="${hojeISO()}"></div>
          <div class="field"><label for="rp-v">Valor recebido (R$)</label><input class="input" id="rp-v" inputmode="decimal" value="${brl(x.valor)}"><span class="hint">Se o órgão reteve impostos, informe o valor que caiu na conta.</span></div>
          <div class="field"><label for="rp-nf">Nota fiscal</label><input class="input" id="rp-nf" maxlength="40"></div></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="rp-ok">Registrar</button></div>`);
        $("#rp-ok", m.el).onclick = async (e2) => { const dt = $("#rp-d", m.el).value; const v = lerValor($("#rp-v", m.el).value); if (!dt || !(v > 0)) return toast("Informe a data e o valor.", "err");
          if (await acao(e2.currentTarget, () => API.proj.salvarParcela({ id: x.id, recebido_em: dt, valor_recebido: v, nota_fiscal: $("#rp-nf", m.el).value.trim() || null }), "Recebimento registrado.")) { m.fechar(); recarregar(); } };
      });
      corpo.onclick = async (ev) => {
        const bp = ev.target.closest("[data-preparar]"), bv = ev.target.closest("[data-verprest]"), bu = ev.target.closest("[data-publicar]");
        if (bp) {
          const t = $("#pt-tri").value, d = dadosTrimestre(base, calc, t), ex = prests.find((x) => x.trimestre === t);
          if (ex && ex.status === "publicada") return toast("Esta prestação já foi publicada.", "err");
          const m = UI.modal(`<h2>Prestação do ${nomeTri(t)}</h2>${htmlPrestacao(d)}<p class="hint">${ex ? "Enviar de novo substitui a versão anterior e volta para a conferência do Conselho Fiscal." : "Depois de enviada, o Conselho Fiscal confere e dá o parecer."}</p>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="pt-ok">Enviar ao Conselho Fiscal</button></div>`);
          $("#pt-ok", m.el).onclick = async (e2) => { if (await acao(e2.currentTarget, () => API.cf.prepararPrestacao(t, d), "Prestação enviada ao Conselho Fiscal.")) { m.fechar(); recarregar(); } };
        }
        if (bv) { const x = prests.find((p) => p.trimestre === bv.dataset.verprest); UI.modal(`<h2>Prestação do ${nomeTri(x.trimestre)}</h2>${STATUS_PREST[x.status] || ""}${htmlPrestacao(x.dados)}${x.parecer ? `<div class="notice"><b>Parecer do Conselho Fiscal:</b> ${esc(x.parecer)}</div>` : ""}<div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button></div>`); }
        if (bu) { if (!(await confirmar("Publicar a prestação para todos os cooperados? Depois de publicada ela não pode ser alterada.", "Publicar"))) return; if (await acao(bu, () => API.cf.publicarPrestacao(bu.dataset.publicar), "Prestação publicada.")) recarregar(); }
      };
      const recDe = (m) => (base.receitas || []).find((x) => Fin.mesDe(x.mes) === m);
      const mostrarRec = () => { const x = recDe($("#rc-mes").value); $("#rc-val").value = x && Number(x.receita_bruta) ? brl(x.receita_bruta) : ""; };
      $("#rc-mes").addEventListener("change", mostrarRec); mostrarRec();
      $("#t-rec").addEventListener("submit", async (e) => {
        e.preventDefault(); const m = $("#rc-mes").value; if (!m) return toast("Escolha o mês.", "err");
        if (await acao($("#rc-btn"), () => API.fin.salvarReceita({ mes: m + "-01", receita_bruta: num($("#rc-val").value) }), "Receita salva.")) recarregar();
      });
    }

    /* ---------------- Sobras e fundos coletivos ---------------- */
    if (aba === "sobras") await window.Sobras.renderTesouraria(corpo, { base, calc, recarregar });

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
      const vigs = (base.vigencias || []).map((v) => Fin.mesDe(v.vigencia)).sort();
      if (!vigSel) vigSel = vigs.length ? vigs[vigs.length - 1] : Fin.mesDe(hojeISO());
      const par = Fin.parametrosDoMes(base, vigSel), pr = Fin.params(par);
      const campoP = (id, rot, v, dica) => `<div class="field"><label for="${id}">${rot}</label><input class="input" id="${id}" inputmode="decimal" value="${v}">${dica ? `<span class="hint">${dica}</span>` : ""}</div>`;
      const tab = Fin.tabelaSalarial(par);
      corpo.innerHTML = `
        <form id="t-par" novalidate style="display:grid;gap:1.6rem">
        <section class="painel acerto"><h2>Valores anuais e vigência</h2>
          <p class="hint">Salário-mínimo, quota, tabela salarial, INSS, IR e percentuais mudam todo ano. Ao salvar, eles valem <b>a partir do mês escolhido</b>; os meses anteriores continuam com os valores da época. Para um reajuste, escolha o mês em que ele começa (ex.: janeiro) e altere os campos.</p>
          <div class="form-grid">
            <div class="field"><label for="cp-vig">Estes valores valem a partir de</label><input class="input" id="cp-vig" type="month" value="${vigSel}"></div>
            <div class="field"><label>Vigências registradas</label><div class="hint">${vigs.length ? vigs.map((v) => `<button type="button" class="btn btn-ghost btn-sm" data-vig="${v}" ${v === vigSel ? 'aria-pressed="true"' : ""}>${Fin.nomeMes(v)}</button>`).join(" ") : "Nenhuma ainda (a primeira será criada ao salvar)."}</div></div>
          </div>
        </section>
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
          ${campoP("cp-rmin", "Valor mínimo para pedir retirada (R$)", brl(pr.retirada_minima), `0 = automático: 1 quota ÷ 1,5% = ${moeda(Fin.retiradaMinima({ ...base.parametros, retirada_minima: 0 }).valor)}, que acompanha o reajuste da quota. Abaixo do mínimo, o crédito fica acumulando.`)}
          ${campoP("cp-rdia", "Prazo da transferência (dia útil do mês seguinte)", pr.retirada_dia_util, "Ex.: 5 = até o 5º dia útil.")}
          ${campoP("cp-res", "Fundo de Reserva (%)", pct(pr.reserva_pct), "Mínimo legal; a Assembleia define (art. 71, §3º).")}
          ${campoP("cp-fates", "FATES (%)", pct(pr.fates_pct), "Mínimo legal; a Assembleia define.")}
        </div></section>
        <section class="painel"><h2>Imposto de renda retido na fonte</h2>
          <p class="hint">A cooperativa retém o IR dos cooperados ao pagar as retiradas (Lei 8.541/1992, art. 45, §1º) e compensa com o IR de 1,5% que os clientes retêm nas notas. Tabela mensal e redução da Lei 15.270/2025; atualize quando a Receita mudar. Alíquotas fixas de 7,5%, 15%, 22,5% e 27,5%.</p>
          <div class="form-grid">
            ${campoP("cp-if1", "Isento até (R$)", brl(pr.ir_f1))}
            ${campoP("cp-if2", "7,5% até (R$)", brl(pr.ir_f2))}
            ${campoP("cp-if3", "15% até (R$)", brl(pr.ir_f3))}
            ${campoP("cp-if4", "22,5% até (R$); acima, 27,5%", brl(pr.ir_f4))}
            ${campoP("cp-id1", "Parcela a deduzir — 7,5% (R$)", brl(pr.ir_d1))}
            ${campoP("cp-id2", "Parcela a deduzir — 15% (R$)", brl(pr.ir_d2))}
            ${campoP("cp-id3", "Parcela a deduzir — 22,5% (R$)", brl(pr.ir_d3))}
            ${campoP("cp-id4", "Parcela a deduzir — 27,5% (R$)", brl(pr.ir_d4))}
            ${campoP("cp-idep", "Dedução por dependente (R$)", brl(pr.ir_dep))}
            ${campoP("cp-isim", "Desconto simplificado mensal (R$)", brl(pr.ir_simpl), "O site usa o que for melhor para o cooperado: INSS + dependentes ou o simplificado.")}
            ${campoP("cp-irl1", "Redução: imposto zerado até (R$ de rendimento)", brl(pr.ir_red_lim1))}
            ${campoP("cp-irm1", "Redução máxima nessa faixa (R$)", brl(pr.ir_red_max1))}
            ${campoP("cp-irl2", "Redução parcial até (R$ de rendimento)", brl(pr.ir_red_lim2))}
            ${campoP("cp-ira", "Redução parcial: valor fixo (R$)", brl(pr.ir_red_a))}
            <div class="field"><label for="cp-irb">Redução parcial: fator sobre o rendimento</label><input class="input" id="cp-irb" inputmode="decimal" value="${String(pr.ir_red_b).replace(".", ",")}"><span class="hint">Redução = valor fixo − fator × rendimento.</span></div>
          </div>
        </section>
        <section class="painel"><h2>Caixa para retiradas</h2><div class="form-grid">
          ${campoP("cp-rescx", "Reserva mínima em conta (R$)", brl(pr.reserva_caixa), "Valor que as retiradas nunca podem usar (ex.: guias de INSS e IR do mês, despesas fixas, Fundo de Soberania).")}
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
          <p class="hint">O piso de cada conselho é a base do Júnior; Pleno, Sênior e Coordenador aplicam os multiplicadores sobre ele (art. 8º, II). CREA/CAU: 8,5 SM (Lei 4.950-A). Demais: piso em salários-mínimos, um valor único para todo o estado, tomando como referência o piso regional do RJ. A Assembleia aprova a tabela todo ano (RI, art. 88).</p>
          <div class="form-grid">
            ${campoP("cp-pcft", "Piso Júnior — CFT/técnicos (× SM)", brl(pr.piso_cft), "Ref.: técnicos da construção civil, faixa III da proposta Ceter/RJ (R$ 3.821,40).")}
            ${campoP("cp-pcra", "Piso Júnior — CRA/administração (× SM)", brl(pr.piso_cra), "Ref.: faixa IV, nível superior (R$ 4.811,40).")}
            ${campoP("cp-pcrc", "Piso Júnior — CRC/contabilidade (× SM)", brl(pr.piso_crc), "Ref.: faixa IV.")}
            ${campoP("cp-poab", "Piso Júnior — OAB/direito (× SM)", brl(pr.piso_oab), "Ref.: faixa IV.")}
            ${campoP("cp-pout", "Piso Júnior — outros e sem conselho (× SM)", brl(pr.piso_outro), "Ref.: faixa IV (nível superior).")}
            ${campoP("cp-mj", "Multiplicador Júnior (× SM)", brl(pr.mult_junior))}
            ${campoP("cp-mp", "Multiplicador Pleno (× SM)", brl(pr.mult_pleno))}
            ${campoP("cp-ms", "Multiplicador Sênior (× SM)", brl(pr.mult_senior))}
            ${campoP("cp-mc", "Multiplicador Coordenador (× SM)", brl(pr.mult_coord))}
          </div>
          <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Valor-hora</th>${["CREA/CAU", "CFT", "CRA", "CRC", "OAB", "Outros"].map((c) => `<th class="num">${c}</th>`).join("")}</tr></thead>
            <tbody>${Fin.CATEGORIAS_SAL.map(([cat, , exp]) => `<tr><td>${cat}<span class="sub">${exp}</span></td>${["CREA", "CFT", "CRA", "CRC", "OAB", "Outro"].map((c) => `<td class="num">${moeda(Fin.valorHoraDe(cat, c, par))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
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
          alim_pct: pc("cp-alim"), custo_op_pct: pc("cp-cop"), retirada_minima: v("cp-rmin") || 0, retirada_dia_util: Math.round(Number($("#cp-rdia").value)) || 5, reserva_pct: pc("cp-res"), fates_pct: pc("cp-fates"), piso_cft: v("cp-pcft"), piso_cra: v("cp-pcra"), piso_crc: v("cp-pcrc"), piso_oab: v("cp-poab"), piso_outro: v("cp-pout"),
          mult_junior: v("cp-mj"), mult_pleno: v("cp-mp"), mult_senior: v("cp-ms"), mult_coord: v("cp-mc"),
          exp_tecnico_antes: $("#cp-exptec").checked, exp_superior_antes: $("#cp-expsup").checked,
          horas_dia: v("cp-hdia"), meses_ano: Number($("#cp-mano").value), feriados_extras: $("#cp-fer").value.trim(), facultativos_folga: $("#cp-facult").checked,
          reserva_caixa: v("cp-rescx") || 0, ir_f1: v("cp-if1"), ir_f2: v("cp-if2"), ir_f3: v("cp-if3"), ir_f4: v("cp-if4"), ir_d1: v("cp-id1"), ir_d2: v("cp-id2"), ir_d3: v("cp-id3"), ir_d4: v("cp-id4"),
          ir_dep: v("cp-idep"), ir_simpl: v("cp-isim"), ir_red_lim1: v("cp-irl1"), ir_red_max1: v("cp-irm1"), ir_red_lim2: v("cp-irl2"), ir_red_a: v("cp-ira"), ir_red_b: Number(String($("#cp-irb").value).replace(",", ".")) };
        const vig = $("#cp-vig").value; if (!vig) return toast("Informe a partir de que mês os valores valem.", "err");
        const ruim = Object.entries(d).filter(([k, x]) => k !== "fechamento" && typeof x !== "boolean" && typeof x !== "string" && !(x === 0 || (x && Number.isFinite(Number(x)))));
        if (!d.contrib_inicio || ruim.length || !(d.quota > 0) || !(d.sm > 0) || !(d.horas_ref > 0) || !(d.mult_pleno > 0)) return toast("Confira os campos: há valor vazio ou inválido.", "err");
        if (await acao($("#cp-btn"), () => API.fin.salvarParametros(d, vig + "-01", Fin.VIG_KEYS), `Parâmetros salvos, valendo a partir de ${Fin.nomeMes(vig)}.`)) { vigSel = vig; recarregar(); }
      });
      corpo.querySelectorAll("[data-vig]").forEach((b) => { b.onclick = () => { vigSel = b.dataset.vig; recarregar(); }; });
      $("#cp-vig").addEventListener("change", (e) => { if (e.target.value && (base.vigencias || []).some((v) => Fin.mesDe(v.vigencia) === e.target.value)) { vigSel = e.target.value; recarregar(); } });
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
          <div class="field"><label for="fc-dep">Dependentes para o IR</label><input class="input" id="fc-dep" type="number" min="0" max="20" value="${c ? Number(c.dependentes_ir || 0) : 0}"><span class="hint">Informados pelo cooperado; reduzem o IR retido.</span></div>
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
          dependentes_ir: Math.max(0, Math.round(Number($("#fc-dep", m.el).value) || 0)), fic_voluntario: lerPct($("#fc-ficv", m.el).value) || 0, fic_rendimentos: lerValor($("#fc-ficr", m.el).value) || 0, fic_resgates: lerValor($("#fc-ficg", m.el).value) || 0 };
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
      const selo = (x) => x.status === "aprovada" ? `<span class="selo ok">validado</span><span class="sub">por ${esc(x.analise_nome || "")}${x.analise_cargo ? " — " + esc(x.analise_cargo) : ""}</span>` : x.status === "recusada" ? `<span class="selo warn">em exigência</span><span class="sub">${esc(x.motivo || "")}</span>` : '<span class="selo warn">em análise</span>';
      const botoes = () => "";
      const enq = Fin.enquadramento(c, base, fech);
      const aprov = habs.filter((h) => h.status === "aprovada");
      const md = UI.modal(`
        <h2>Experiência de ${esc(c.nome)}</h2>
        <div class="notice ${enq.categoria ? "ok" : "warn"}">Enquadramento em ${Fin.nomeMes(fech)}: <b>${esc(enq.categoria || "pendente")}</b>${enq.habilitacao ? ` · ${esc(enq.habilitacao.titulo)} (${esc(enq.conselho || "")}) · ${enq.anos} ano(s) comprovados (${(enq.anos_externos || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} fora + ${enq.interna ? enq.interna.meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0} mês(es) na BIMCORE)` : ""}${enq.proxima ? ` · vira ${esc(enq.proxima.categoria)} em ${data(enq.proxima.data)}` : ""}${enq.avisos.length ? "<br>" + enq.avisos.map(esc).join("<br>") : ""}</div>
        <p class="hint">Quem valida formação e experiência é o Conselho de Administração, na página <b>Enquadramento (CA)</b> da área interna (Estatuto, art. 8º, V; Regimento, art. 89). Aqui a tesouraria só consulta e define a formação usada na remuneração e a designação de coordenador.</p>
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
          <div><dt>Fundo de Aposentadoria</dt><dd>${moeda(p.fundo_aposentadoria)}</dd></div>
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
    aba("Posição", [["Nome", 32], ["E-mail", 30], ["Quotas subscritas", 11], ["Capital subscrito", 14, "m"], ["Capital integralizado", 14, "m"], ["Total contribuído", 14, "m"], ["Contribuição mensal", 13, "m"], ["Valor em aberto", 13, "m"], ["Meses em atraso", 9], ["Saldo FIC", 12, "m"], ["Fundo 13º", 12, "m"], ["Fundo de férias", 12, "m"], ["Sobras a receber", 12, "m"], ["Fundo de Aposentadoria", 12, "m"], ["Aportes (outros créditos)", 14, "m"], ["Falta integralizar das quotas iniciais", 16, "m"], ["Contribuições pagas antecipadamente", 16, "m"], ["Retiradas no período", 14, "m"], ["Horas no período", 10]],
      lista.map((p) => [p.cooperado_nome, p.email, p.quotas_subscritas, p.capital_subscrito, p.capital_integralizado, p.contribuicoes_pagas, p.contribuicao_mensal, p.valor_em_aberto, p.meses_em_atraso, p.fic_saldo, p.fundo_13, p.fundo_ferias, p.sobras_a_receber, p.fundo_aposentadoria, p.outros_creditos, p.detalhes.resumo.falta_inicial, p.detalhes.resumo.adiantado, p.detalhes.resumo.retiradas_ano, p.detalhes.resumo.horas]));
    const mm = []; lista.forEach((p) => p.detalhes.mensal.forEach((x) => mm.push([p.cooperado_nome, dt(x.mes + "-01"), x.devida, x.paga, Math.max(0, x.em_aberto)])));
    aba("Mês a mês", [["Cooperado", 32], ["Mês", 11, "mes"], ["Contribuição devida", 14, "m"], ["Contribuição paga", 14, "m"], ["Em aberto no mês", 14, "m"]], mm);
    const rr = []; lista.forEach((p) => p.detalhes.mensal.filter((x) => x.retirada || x.credito || x.horas_produtivas || x.horas_formacao || x.horas_admin).forEach((x) => rr.push([p.cooperado_nome, dt(x.mes + "-01"), x.horas_produtivas, x.horas_formacao, x.horas_admin || 0, x.dias, x.credito || 0, x.retirada, x.inss, x.descontada, x.fic_coop, x.fic_vol, x.prov_13, x.prov_ferias, x.aux_tele, x.aux_alim, x.liquido])));
    aba("Mês a mês - crédito", [["Cooperado", 30], ["Mês", 11, "mes"], ["Horas produtivas", 10], ["Horas de formação", 10], ["Suporte adm. (20%)", 10], ["Dias", 7], ["Crédito gerado", 13, "m"], ["Retirada paga", 13, "m"], ["INSS 11%", 12, "m"], ["Contribuição descontada", 13, "m"], ["FIC cooperativa", 12, "m"], ["FIC voluntário", 12, "m"], ["Provisão 13º", 12, "m"], ["Provisão férias", 12, "m"], ["Auxílio-teletrabalho", 12, "m"], ["Auxílio-alimentação", 12, "m"], ["Líquido pago", 13, "m"]], rr);
    aba("Retiradas", [["Cooperado", 30], ["Pedido em", 12, "d"], ["Prazo", 12, "d"], ["Situação", 14], ["Bruto", 13, "m"], ["INSS 11%", 12, "m"], ["IR retido", 12, "m"], ["Contribuição de capital", 13, "m"], ["FIC voluntário", 12, "m"], ["Líquido", 13, "m"], ["Paga em", 12, "d"], ["Paga por", 22], ["Motivo", 30]],
      (base.retiradas || []).map((r) => [nome[r.fin_cooperado_id], dt(String(r.solicitado_em).slice(0, 10)), r.prazo ? dt(r.prazo) : null, r.status, Number(r.valor), r.inss != null ? Number(r.inss) : null, r.ir != null ? Number(r.ir) : null, r.contribuicao != null ? Number(r.contribuicao) : null, r.fic_vol != null ? Number(r.fic_vol) : null, r.liquido != null ? Number(r.liquido) : null, r.pago_em ? dt(r.pago_em) : null, r.pago_nome || null, r.motivo || null]));
    const vc = Fin.cooperativa(base, calc);
    aba("Cooperativa", [["Mês", 11, "mes"], ["Receita de contratos", 14, "m"], ["Custo de Operação", 14, "m"], ["Suporte adm. (crédito + INSS patronal)", 14, "m"], ["Saldo dos 20%", 14, "m"], ["Retiradas brutas", 14, "m"], ["INSS retido", 13, "m"], ["INSS patronal", 13, "m"], ["FIC da cooperativa", 13, "m"], ["Provisões 13º e férias", 14, "m"], ["Auxílios", 12, "m"], ["Contribuições de capital", 14, "m"]],
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

  window.Tesouraria = { render, dadosTrimestre, htmlPrestacao, nomeTri, trimestreDe, guiasEsperadas, STATUS_PREST };
})();
