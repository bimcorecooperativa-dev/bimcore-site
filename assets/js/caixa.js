/* BIMCORE — Contas, contas a pagar e mapa do dinheiro.
   Separa o dinheiro da cooperativa em: comprometido no curto prazo (guias, retiradas, contas a pagar,
   sobras), guardado por regra (FIC em conta segregada; fundos aplicados; provisões de 13º e férias;
   os 20% em conta específica — Estatuto, art. 23, §8º, e art. 72, §2º) e livre. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API, Fin = window.Fin;
  const { $, esc, data, dataHora, moeda, acao, confirmar, toast } = UI;
  const TIPOS_CONTA = { movimento: "Conta movimento", custo_op: "Conta dos 20% (Custo de Operação)", fic: "Conta do FIC (segregada)", aplicacao: "Aplicação (fundos e provisões)", outra: "Outra" };
  const CATEG = ["Taxas e registros", "Contabilidade", "Software e licenças", "Conselho profissional (anuidade/ART)", "Seguro", "Banco", "Material e divulgação", "Impostos", "Outras"];
  const c2 = (v) => Fin.centavos(Number(v) || 0);
  const lerValor = (t) => { t = String(t || "").replace(/[R$\s]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); const v = Number(t); return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0; };
  const brl = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const proximoMes = (iso, meses) => { const [a, m, d] = iso.split("-").map(Number); const dt = new Date(Date.UTC(a, m - 1 + meses, 1)); const ult = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate(); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`; };

  /* Previsões automáticas: guias, retiradas pedidas, 13º */
  function automaticos(base, calc, guias) {
    const out = []; const hoje = UI.hoje(); const pr = Fin.params(base.parametros);
    const T = window.Tesouraria;
    (T ? T.guiasEsperadas(base) : []).forEach((e) => {
      ["INSS", "IRRF"].forEach((tp) => {
        const reg = (guias || []).filter((g) => g.tipo === tp && Fin.mesDe(g.competencia) === e.mes).reduce((t, g) => t + Number(g.valor), 0);
        const falta = c2(e[tp] - reg);
        if (falta > 0.009) out.push({ auto: true, tipo: "guia", descricao: `Guia ${tp === "INSS" ? "do INSS (11% retido + 20% patronal)" : "de IR retido (DARF)"} — competência ${Fin.nomeMes(e.mes)}`, valor: falta, vencimento: Fin.somaMes(e.mes, 1) + "-20", onde: "Registre o pagamento em Retiradas → Guias recolhidas" });
      });
    });
    (base.retiradas || []).filter((r) => r.status === "solicitada").forEach((r) => {
      const c = (base.cooperados || []).find((x) => x.id === r.fin_cooperado_id) || {};
      out.push({ auto: true, tipo: "retirada", descricao: `Retirada pedida por ${c.nome || "cooperado"} (+ ${Math.round(pr.patronal_pct * 100)}% de INSS patronal na guia)`, valor: c2(Number(r.valor) * (1 + pr.patronal_pct)), vencimento: r.prazo || hoje, onde: "Pague em Retiradas" });
    });
    const f13 = Object.values(calc).reduce((t, p) => t + Number(p.fundo_13 || 0), 0);
    if (f13 > 0.009) { const ano = hoje.slice(0, 4); out.push({ auto: true, tipo: "13", descricao: "Pagamento do auxílio de 13º (provisão acumulada)", valor: c2(f13), vencimento: (hoje > ano + "-12-20" ? (+ano + 1) : ano) + "-12-20", onde: "Fundo de 13º (art. 79)" }); }
    return out;
  }

  /* O mapa */
  function calcular({ base, calc, guias, fundos, contas, saldos, pagar }) {
    const hoje = UI.hoje(), pr = Fin.params(base.parametros);
    const ult = {}; (saldos || []).forEach((x) => { const u = ult[x.conta_id]; if (!u || x.data > u.data || (x.data === u.data && String(x.criado_em) > String(u.criado_em))) ult[x.conta_id] = x; });
    const ativas = (contas || []).filter((c) => c.ativa !== false);
    const porTipo = {}; Object.keys(TIPOS_CONTA).forEach((k) => { porTipo[k] = 0; });
    const linhasContas = ativas.map((c) => { const u = ult[c.id]; porTipo[c.tipo] += u ? Number(u.saldo) : 0; return { nome: c.nome, tipo: c.tipo, banco: c.banco, saldo: u ? c2(u.saldo) : null, data: u ? u.data : null }; });
    const total = c2(Object.values(porTipo).reduce((t, v) => t + v, 0));
    const ps = Object.values(calc);
    const fic = c2(ps.reduce((t, p) => t + Math.max(0, Number(p.fic_saldo || 0)), 0));
    const provisoes = c2(ps.reduce((t, p) => t + Number(p.fundo_13 || 0) + Number(p.fundo_ferias || 0), 0));
    const sobrasPagar = c2(ps.reduce((t, p) => t + Number(p.sobras_a_receber || 0), 0));
    const capital = c2(ps.reduce((t, p) => t + Number(p.capital_integralizado || 0), 0));
    const aportes = c2(ps.reduce((t, p) => t + Number(p.outros_creditos || 0), 0));
    const sf = {}; (fundos || []).forEach((m) => { sf[m.fundo] = c2((sf[m.fundo] || 0) + Number(m.valor)); });
    const fundosTot = c2(Object.values(sf).reduce((t, v) => t + Math.max(0, v), 0));
    const vc = Fin.cooperativa(base, calc);
    const pagos = (pagar || []).filter((x) => x.status === "paga").reduce((t, x) => t + Number(x.valor_pago != null ? x.valor_pago : x.valor), 0);
    const saldo20 = c2(Math.max(0, vc.linhas.reduce((t, l) => t + l.custo_op - l.admin_cog, 0) - pagos));
    const autos = automaticos(base, calc, guias);
    const lim30 = somaDias(hoje, 30);
    const abertas = (pagar || []).filter((x) => x.status === "aberta");
    const curto = {
      guias: c2(autos.filter((a) => a.tipo === "guia").reduce((t, a) => t + a.valor, 0)),
      retiradas: c2(autos.filter((a) => a.tipo === "retirada").reduce((t, a) => t + a.valor, 0)),
      contas: c2(abertas.filter((x) => x.vencimento <= lim30).reduce((t, x) => t + Number(x.valor), 0)),
      sobras: sobrasPagar
    };
    const curtoTot = c2(Object.values(curto).reduce((t, v) => t + v, 0));
    const guardado = { fic, fundos: fundosTot, provisoes, saldo20 };
    const guardadoTot = c2(fic + fundosTot + provisoes + saldo20);
    const livre = c2(total - curtoTot - guardadoTot);
    const alertas = [];
    if (!ativas.length) alertas.push(["warn", "Cadastre as contas da cooperativa (conta movimento, conta dos 20%, conta do FIC e aplicação) e informe os saldos."]);
    ativas.forEach((c) => { const u = ult[c.id]; if (!u) alertas.push(["warn", `Informe o saldo de "${c.nome}".`]); else if (somaDias(u.data, 7) < hoje) alertas.push(["warn", `Saldo de "${c.nome}" desatualizado (informado em ${data(u.data)}).`]); });
    const temFic = ativas.some((c) => c.tipo === "fic"), temApl = ativas.some((c) => c.tipo === "aplicacao"), temCop = ativas.some((c) => c.tipo === "custo_op");
    if (fic > 0.009 && porTipo.fic + 0.009 < fic) alertas.push(["err", `O FIC dos cooperados soma ${moeda(fic)}, mas a conta do FIC tem ${moeda(porTipo.fic)}. Transfira ${moeda(fic - porTipo.fic)} para a conta segregada${temFic ? "" : " (cadastre a conta do FIC)"}.`]);
    const aplicar = c2(fundosTot + provisoes - porTipo.aplicacao);
    if (aplicar > 0.009) alertas.push(["warn", `Fundos coletivos e provisões de 13º e férias somam ${moeda(fundosTot + provisoes)}, e as aplicações têm ${moeda(porTipo.aplicacao)}. Aplique ${moeda(aplicar)} em renda fixa de baixo risco e liquidez diária${temApl ? "" : " (cadastre a conta de aplicação)"}.`]);
    if (saldo20 > 0.009 && porTipo.custo_op + 0.009 < saldo20) alertas.push(["warn", `O saldo dos 20% ainda não gasto é ${moeda(saldo20)}; a conta específica tem ${moeda(porTipo.custo_op)} (Estatuto, art. 23, §8º)${temCop ? "" : " — cadastre a conta dos 20%"}.`]);
    if (porTipo.movimento + 0.009 < curtoTot) alertas.push(["err", `Os pagamentos dos próximos 30 dias somam ${moeda(curtoTot)} e a conta movimento tem ${moeda(porTipo.movimento)}. Não aplique; ${livre < 0 ? "faltam " + moeda(-livre) + " no total" : "resgate " + moeda(curtoTot - porTipo.movimento) + " da aplicação"}.`]);
    else if (livre > 0.009 && aplicar <= 0.009) alertas.push(["ok", `Há ${moeda(livre)} livres. Podem pagar despesas da cooperativa ou ser aplicados sem prender dinheiro de ninguém.`]);
    if (livre < -0.009) alertas.push(["err", `O dinheiro em conta não cobre o que está comprometido e guardado: faltam ${moeda(-livre)}.`]);
    const venc = abertas.filter((x) => x.vencimento < hoje); if (venc.length) alertas.push(["err", `${venc.length} conta(s) vencida(s): ${venc.map((x) => x.descricao).join(", ")}.`]);
    return { data: hoje, total, porTipo, linhasContas, curto, curtoTot, guardado, guardadoTot, livre, sf, capital, aportes, alertas, autos };
  }

  function htmlMapa(m, publico) {
    const linha = (t, v, h) => `<tr><td>${esc(t)}${h ? `<span class="sub">${esc(h)}</span>` : ""}</td><td class="num">${moeda(v)}</td></tr>`;
    return `
      <div class="kpis">
        <div class="kpi"><span class="rot">Em contas</span><span class="val">${moeda(m.total)}</span><span class="det">movimento ${moeda(m.porTipo.movimento)} · aplicado ${moeda(m.porTipo.aplicacao)}</span></div>
        <div class="kpi"><span class="rot">Comprometido (30 dias)</span><span class="val">${moeda(m.curtoTot)}</span><span class="det">guias, retiradas, contas, sobras</span></div>
        <div class="kpi"><span class="rot">Guardado por regra</span><span class="val">${moeda(m.guardadoTot)}</span><span class="det">FIC, fundos, provisões, 20%</span></div>
        <div class="kpi"><span class="rot">Livre</span><span class="val" style="color:${m.livre < 0 ? "var(--err)" : "var(--ok)"}">${moeda(m.livre)}</span><span class="det">pode pagar despesas ou ser aplicado</span></div>
      </div>
      ${publico ? "" : m.alertas.map(([t, x]) => `<div class="notice ${t}">${esc(x)}</div>`).join("")}
      <div class="mapa-grade">
        <div><h3 class="mini-tit">Onde está o dinheiro</h3><div class="tabela-wrap"><table class="tabela"><tbody>
          ${m.linhasContas.length ? m.linhasContas.map((c) => `<tr><td>${esc(c.nome)}<span class="sub">${esc(TIPOS_CONTA[c.tipo] || c.tipo)}${c.banco ? " · " + esc(c.banco) : ""}${c.data ? " · saldo de " + data(c.data) : ""}</span></td><td class="num">${c.saldo == null ? "—" : moeda(c.saldo)}</td></tr>`).join("") : '<tr><td>Nenhuma conta cadastrada</td><td></td></tr>'}
          </tbody><tfoot><tr><td>Total</td><td class="num">${moeda(m.total)}</td></tr></tfoot></table></div></div>
        <div><h3 class="mini-tit">Para que ele está separado</h3><div class="tabela-wrap"><table class="tabela"><tbody>
          ${linha("Guias de INSS e IR a recolher", m.curto.guias, "retidos das retiradas e INSS patronal")}
          ${linha("Retiradas pedidas", m.curto.retiradas, "com o INSS patronal")}
          ${linha("Contas a pagar em 30 dias", m.curto.contas)}
          ${linha("Sobras a pagar aos cooperados", m.curto.sobras)}
          ${linha("FIC dos cooperados", m.guardado.fic, "de cada cooperado; conta segregada")}
          ${linha("Fundos coletivos", m.guardado.fundos, "Reserva, FATES, Soberania, FEI, Apoio, Aposentadoria")}
          ${linha("Provisões de 13º e férias", m.guardado.provisoes)}
          ${linha("Saldo dos 20% ainda não gasto", m.guardado.saldo20, "despesas administrativas (art. 23, §8º)")}
          </tbody><tfoot><tr><td>Livre</td><td class="num">${moeda(m.livre)}</td></tr></tfoot></table></div></div>
      </div>
      <p class="hint">Para saber: o <b>capital social</b> integralizado (${moeda(m.capital)}) é patrimônio da cooperativa e pode custear as atividades; é devolvido a cada cooperado no desligamento, depois do balanço. Os <b>aportes</b> feitos além das obrigações (${moeda(m.aportes)}) são créditos dos cooperados, também devolvidos no desligamento (art. 19). Nenhum dos dois é dinheiro parado na conta.</p>`;
  }

  /* ---------------- Tesouraria: aba "Contas e caixa" ---------------- */
  async function renderTesouraria(corpo, ctx) {
    const { base, calc, guias, recarregar, leitura } = ctx;
    const [cx, pub, ultimo] = await Promise.all([API.caixa.dados(), API.sobras.publico().catch(() => ({ movimentos: [] })), API.caixa.mapa().catch(() => null)]);
    const m = calcular({ base, calc, guias, fundos: pub.movimentos, contas: cx.contas, saldos: cx.saldos, pagar: cx.pagar });
    // publica o retrato para os cooperados quando muda
    const resumo = { ...m, alertas: undefined, autos: undefined };
    if (!leitura && (!ultimo || JSON.stringify({ ...ultimo.dados, data: 0 }) !== JSON.stringify({ ...resumo, data: 0 }))) API.caixa.publicarMapa(resumo).catch(() => {});
    const hoje = UI.hoje();
    const abertas = cx.pagar.filter((x) => x.status === "aberta");
    const lista = [...m.autos, ...abertas].sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    const selo = (v) => { const d = Math.round((new Date(v + "T12:00:00Z") - new Date(hoje + "T12:00:00Z")) / 864e5); return d < 0 ? `<span class="selo err">vencida há ${-d} dia(s)</span>` : d <= 7 ? `<span class="selo warn">vence em ${d} dia(s)</span>` : `<span class="selo">em ${d} dias</span>`; };
    const ultSaldo = (id) => cx.saldos.filter((s) => s.conta_id === id).sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em)))[0];
    corpo.innerHTML = `
      <section class="painel"><div class="painel-cab"><h2>Mapa do dinheiro</h2><span class="hint">publicado para todos os cooperados</span></div>${htmlMapa(m, false)}
        ${(() => { const pr = Fin.params(base.parametros); const sug = c2(m.curto.guias + m.curto.contas + m.curto.sobras + m.guardado.saldo20); return sug > Number(pr.reserva_caixa || 0) + 0.009
          ? `<div class="notice warn">A reserva mínima em conta (${moeda(pr.reserva_caixa || 0)}) é menor que guias, contas a pagar, sobras e os 20% ainda não gastos (${moeda(sug)}). Com ela baixa, o site pode liberar retiradas com dinheiro que já tem outro destino. <button class="btn btn-ghost btn-sm so-tes" id="cx-reserva" data-v="${sug}">Ajustar a reserva para ${moeda(sug)}</button></div>` : ""; })()}</section>
      <section class="painel"><div class="painel-cab"><h2>Contas a pagar</h2><button class="btn btn-primary btn-sm so-tes" id="cp-nova">Nova conta a pagar</button></div>
        <p class="hint">As guias, as retiradas pedidas e o 13º entram sozinhos (marcados como "automático"). Cadastre aqui o resto: taxas, contadora, softwares, anuidades, seguros. Contas mensais ou anuais se repetem sozinhas quando pagas.</p>
        ${lista.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Vencimento</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody>${lista.map((x) => `<tr><td>${data(x.vencimento)}</td><td>${esc(x.descricao)}<span class="sub">${x.auto ? "automático · " + esc(x.onde) : esc([x.categoria, x.fornecedor, x.recorrencia !== "unica" ? (x.recorrencia === "mensal" ? "mensal" : "anual") : ""].filter(Boolean).join(" · "))}</span></td>
            <td class="num">${moeda(x.valor)}</td><td>${selo(x.vencimento)}</td><td class="acoes-celula">${x.auto ? "" : `<button class="btn btn-primary btn-sm so-tes" data-pagar-cp="${x.id}">Pagar</button> <button class="btn btn-ghost btn-sm so-tes" data-ed-cp="${x.id}">Editar</button>`}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td></td><td>Total previsto</td><td class="num">${moeda(lista.reduce((t, x) => t + Number(x.valor), 0))}</td><td></td><td></td></tr></tfoot></table></div>` : '<p class="vazio">Nada a pagar previsto.</p>'}
        ${cx.pagar.some((x) => x.status === "paga") ? `<details style="margin-top:.8rem"><summary>Pagas</summary><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Pago em</th><th>Descrição</th><th class="num">Valor</th></tr></thead>
          <tbody>${cx.pagar.filter((x) => x.status === "paga").sort((a, b) => String(b.pago_em).localeCompare(String(a.pago_em))).slice(0, 60).map((x) => `<tr><td>${data(x.pago_em)}</td><td>${esc(x.descricao)}<span class="sub">${esc(x.categoria || "")}</span></td><td class="num">${moeda(x.valor_pago != null ? x.valor_pago : x.valor)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      </section>
      <section class="painel"><div class="painel-cab"><h2>Contas bancárias e saldos</h2><button class="btn btn-ghost btn-sm so-tes" id="ct-nova">Nova conta</button></div>
        <p class="hint">Informe o saldo de cada conta pelo extrato, pelo menos uma vez por semana. O saldo da conta movimento também alimenta o caixa livre das retiradas.${cx.contas.length ? "" : " Sugestão: comece com as quatro contas padrão."}</p>
        ${cx.contas.length ? "" : '<p><button class="btn btn-primary btn-sm so-tes" id="ct-padrao">Criar as quatro contas padrão</button></p>'}
        ${cx.contas.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Conta</th><th class="num">Último saldo</th><th>Informado</th><th></th></tr></thead>
          <tbody>${cx.contas.map((c) => { const u = ultSaldo(c.id); return `<tr${c.ativa === false ? ' style="opacity:.55"' : ""}><td>${esc(c.nome)}<span class="sub">${esc(TIPOS_CONTA[c.tipo])}${c.banco ? " · " + esc(c.banco) : ""}${c.finalidade ? " · " + esc(c.finalidade) : ""}</span></td><td class="num">${u ? moeda(u.saldo) : "—"}</td><td>${u ? data(u.data) + `<span class="sub">${esc(u.registrado_nome || "")}</span>` : "—"}</td>
            <td class="acoes-celula"><button class="btn btn-primary btn-sm so-tes" data-saldo="${c.id}">Informar saldo</button> <button class="btn btn-ghost btn-sm so-tes" data-ed-ct="${c.id}">Editar</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}
      </section>`;

    const modalConta = (c) => {
      c = c || { tipo: "movimento", ativa: true };
      const mm = UI.modal(`<h2>${c.id ? "Editar conta" : "Nova conta"}</h2><div class="form-grid">
        <div class="field"><label for="cn-n">Nome</label><input class="input" id="cn-n" maxlength="80" value="${esc(c.nome || "")}" placeholder="Ex.: BTG conta corrente"></div>
        <div class="field"><label for="cn-t">Tipo</label><select class="input" id="cn-t">${Object.entries(TIPOS_CONTA).map(([k, v]) => `<option value="${k}"${k === c.tipo ? " selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label for="cn-b">Banco</label><input class="input" id="cn-b" maxlength="60" value="${esc(c.banco || "")}"></div>
        <div class="field"><label for="cn-f">Finalidade ou aplicação</label><input class="input" id="cn-f" maxlength="120" value="${esc(c.finalidade || "")}" placeholder="Ex.: CDB liquidez diária"></div>
        <label class="ciente"><input type="checkbox" id="cn-a" ${c.ativa !== false ? "checked" : ""}> <span>Conta ativa</span></label></div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="cn-ok">Salvar</button></div>`);
      $("#cn-ok", mm.el).onclick = async (ev) => { const d = { id: c.id, nome: $("#cn-n", mm.el).value.trim(), tipo: $("#cn-t", mm.el).value, banco: $("#cn-b", mm.el).value.trim() || null, finalidade: $("#cn-f", mm.el).value.trim() || null, ativa: $("#cn-a", mm.el).checked };
        if (!d.nome) return toast("Dê um nome à conta.", "err"); if (await acao(ev.currentTarget, () => API.caixa.salvarConta(d), "Conta salva.")) { mm.fechar(); recarregar(); } };
    };
    const modalPagar = (x) => {
      x = x || { recorrencia: "unica", vencimento: hoje };
      const mm = UI.modal(`<h2>${x.id ? "Editar conta a pagar" : "Nova conta a pagar"}</h2><div class="form-grid">
        <div class="field full"><label for="pg-d">Descrição</label><input class="input" id="pg-d" maxlength="200" value="${esc(x.descricao || "")}" placeholder="Ex.: Honorários da contadora"></div>
        <div class="field"><label for="pg-c">Categoria</label><select class="input" id="pg-c">${CATEG.map((c) => `<option${c === x.categoria ? " selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label for="pg-f">Fornecedor</label><input class="input" id="pg-f" maxlength="120" value="${esc(x.fornecedor || "")}"></div>
        <div class="field"><label for="pg-v">Valor (R$)</label><input class="input" id="pg-v" inputmode="decimal" value="${brl(x.valor)}"></div>
        <div class="field"><label for="pg-vc">Vencimento</label><input class="input" id="pg-vc" type="date" value="${x.vencimento || ""}"></div>
        <div class="field"><label for="pg-r">Repetição</label><select class="input" id="pg-r"><option value="unica"${x.recorrencia === "unica" ? " selected" : ""}>Única</option><option value="mensal"${x.recorrencia === "mensal" ? " selected" : ""}>Todo mês</option><option value="anual"${x.recorrencia === "anual" ? " selected" : ""}>Todo ano</option></select></div>
        <div class="field"><label for="pg-ct">Sai da conta</label><select class="input" id="pg-ct"><option value="">—</option>${cx.contas.filter((c) => c.ativa !== false).map((c) => `<option value="${c.id}"${c.id === x.conta_id ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></div>
        <div class="field full"><label for="pg-o">Observação</label><input class="input" id="pg-o" maxlength="300" value="${esc(x.observacao || "")}"></div></div>
        <div class="modal-acoes">${x.id ? '<button class="btn btn-danger btn-sm" id="pg-del">Cancelar esta conta</button>' : ""}<button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-primary btn-sm" id="pg-ok">Salvar</button></div>`);
      if (x.id) $("#pg-del", mm.el).onclick = async (ev) => { if (!(await confirmar("Cancelar esta conta a pagar?", "Cancelar conta"))) return; if (await acao(ev.currentTarget, () => API.caixa.salvarPagar({ id: x.id, status: "cancelada" }), "Conta cancelada.")) { mm.fechar(); recarregar(); } };
      $("#pg-ok", mm.el).onclick = async (ev) => { const d = { id: x.id, descricao: $("#pg-d", mm.el).value.trim(), categoria: $("#pg-c", mm.el).value, fornecedor: $("#pg-f", mm.el).value.trim() || null, valor: lerValor($("#pg-v", mm.el).value), vencimento: $("#pg-vc", mm.el).value, recorrencia: $("#pg-r", mm.el).value, conta_id: $("#pg-ct", mm.el).value || null, observacao: $("#pg-o", mm.el).value.trim() || null };
        if (d.descricao.length < 3 || !d.valor || !d.vencimento) return toast("Informe descrição, valor e vencimento.", "err");
        if (await acao(ev.currentTarget, () => API.caixa.salvarPagar(d), "Conta a pagar salva.")) { mm.fechar(); recarregar(); } };
    };
    const pagarConta = (x) => {
      const mov = (cx.contas.find((c) => c.id === x.conta_id) || cx.contas.find((c) => c.tipo === "movimento") || {});
      const aviso = m.porTipo.movimento + 0.009 < m.curtoTot ? `<div class="notice err">Atenção: a conta movimento (${moeda(m.porTipo.movimento)}) não cobre os pagamentos dos próximos 30 dias (${moeda(m.curtoTot)}). Confira se este pagamento não vai faltar para guias e retiradas.</div>` : "";
      const mm = UI.modal(`<h2>Pagar: ${esc(x.descricao)}</h2>${aviso}<div class="form-grid">
        <div class="field"><label for="pp-d">Pago em</label><input class="input" id="pp-d" type="date" value="${hoje}" max="${hoje}"></div>
        <div class="field"><label for="pp-v">Valor pago (R$)</label><input class="input" id="pp-v" inputmode="decimal" value="${brl(x.valor)}"></div>
        <label class="ciente full"><input type="checkbox" id="pp-desp" checked> <span>Registrar também como despesa da cooperativa (entra na prestação de contas dos 20%)</span></label></div>
        <p class="hint">Sai de: ${esc(mov.nome || "conta não informada")}. Depois, atualize o saldo da conta.${x.recorrencia !== "unica" ? ` A próxima (${x.recorrencia}) será criada sozinha.` : ""}</p>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="pp-ok">Confirmar pagamento</button></div>`);
      $("#pp-ok", mm.el).onclick = async (ev) => {
        const dt = $("#pp-d", mm.el).value, v = lerValor($("#pp-v", mm.el).value); if (!dt || !(v > 0)) return toast("Informe a data e o valor.", "err");
        const ok = await acao(ev.currentTarget, async () => {
          let despesa_id = null;
          if ($("#pp-desp", mm.el).checked) { await API.fin.salvar("despesas", { data: dt, descricao: x.descricao, categoria: x.categoria || "Outras", valor: v, cobrar: false, participantes: [], observacao: [x.fornecedor, "paga pela tesouraria (contas a pagar)"].filter(Boolean).join(" · ") }); }
          await API.caixa.salvarPagar({ id: x.id, status: "paga", pago_em: dt, valor_pago: v, despesa_id });
          if (x.recorrencia !== "unica") await API.caixa.salvarPagar({ descricao: x.descricao, categoria: x.categoria, fornecedor: x.fornecedor, valor: x.valor, vencimento: proximoMes(x.vencimento, x.recorrencia === "mensal" ? 1 : 12), recorrencia: x.recorrencia, conta_id: x.conta_id, observacao: x.observacao });
          return true;
        }, "Pagamento registrado.");
        if (ok) { mm.fechar(); recarregar(); }
      };
    };
    corpo.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.id === "ct-nova") return modalConta(null);
      if (b.id === "cp-nova") return modalPagar(null);
      if (b.id === "cx-reserva") { if (await acao(b, () => API.fin.salvarParametros({ reserva_caixa: Number(b.dataset.v) }), "Reserva ajustada. As retiradas passam a respeitar esse valor.")) recarregar(); return; }
      if (b.id === "ct-padrao") {
        const ok = await acao(b, async () => { for (const [i, c] of [["Conta movimento", "movimento", "Pagamentos, retiradas e guias"], ["Conta dos 20%", "custo_op", "Custo de Operação e Gestão (art. 23, §8º)"], ["Conta do FIC", "fic", "Dinheiro dos cooperados, segregado"], ["Aplicação", "aplicacao", "Fundos e provisões — renda fixa de liquidez diária"]].entries()) await API.caixa.salvarConta({ nome: c[0], tipo: c[1], finalidade: c[2], banco: "BTG", ativa: true, ordem: i }); return true; }, "Contas criadas.");
        if (ok) recarregar(); return;
      }
      if (b.dataset.edCt) return modalConta(cx.contas.find((c) => c.id === b.dataset.edCt));
      if (b.dataset.edCp) return modalPagar(cx.pagar.find((x) => x.id === b.dataset.edCp));
      if (b.dataset.pagarCp) return pagarConta(cx.pagar.find((x) => x.id === b.dataset.pagarCp));
      if (b.dataset.saldo) {
        const c = cx.contas.find((x) => x.id === b.dataset.saldo);
        const mm = UI.modal(`<h2>Saldo — ${esc(c.nome)}</h2><div class="form-grid"><div class="field"><label for="sd-d">Data do extrato</label><input class="input" id="sd-d" type="date" value="${hoje}" max="${hoje}"></div>
          <div class="field"><label for="sd-v">Saldo (R$)</label><input class="input" id="sd-v" inputmode="decimal"></div><div class="field full"><label for="sd-o">Observação</label><input class="input" id="sd-o" maxlength="200"></div></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="sd-ok">Salvar</button></div>`);
        $("#sd-ok", mm.el).onclick = async (ev) => { const t = $("#sd-v", mm.el).value.trim(); if (!t) return toast("Informe o saldo.", "err");
          if (await acao(ev.currentTarget, () => API.caixa.registrarSaldo({ conta_id: c.id, data: $("#sd-d", mm.el).value || hoje, saldo: lerValor(t), observacao: $("#sd-o", mm.el).value.trim() || null }), "Saldo registrado.")) { mm.fechar(); recarregar(); } };
      }
    };
  }

  /* Alertas para o Resumo da tesouraria */
  async function alertasResumo(base, guias) {
    try {
      const cx = await API.caixa.dados(); const hoje = UI.hoje(), lim = somaDias(hoje, 7);
      const ab = cx.pagar.filter((x) => x.status === "aberta");
      const venc = ab.filter((x) => x.vencimento < hoje), prox = ab.filter((x) => x.vencimento >= hoje && x.vencimento <= lim);
      return (venc.length ? `<div class="notice err"><b>${venc.length} conta(s) vencida(s)</b>: ${venc.map((x) => esc(x.descricao)).join(", ")}. Veja em Contas e caixa.</div>` : "")
        + (prox.length ? `<div class="notice warn"><b>${prox.length} conta(s) vencem em até 7 dias</b>: ${prox.map((x) => esc(x.descricao) + " (" + data(x.vencimento) + ")").join(", ")}.</div>` : "");
    } catch (e) { return ""; }
  }

  /* Área do cooperado */
  async function renderPainel(el) {
    const r = await API.caixa.mapa().catch(() => null);
    el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Transparência</p><h1>Mapa do dinheiro</h1></div></div>
      <p class="muted">Quanto a cooperativa tem em conta e aplicado, e para que cada parte está separada: o que já tem destino certo (guias, retiradas, contas, sobras), o que é guardado por regra do Estatuto (FIC de cada cooperado, fundos, provisões de 13º e férias, os 20% em conta específica) e o que está livre.</p>
      ${r ? `<p class="hint">Atualizado em ${dataHora(r.gerado_em)} por ${esc(r.gerado_nome || "tesouraria")}.</p><section class="painel">${htmlMapa(r.dados, true)}</section>` : '<p class="vazio">A tesouraria ainda não publicou o mapa. Ele aparece quando as contas e os saldos forem cadastrados.</p>'}`;
  }

  window.Caixa = { calcular, htmlMapa, renderTesouraria, renderPainel, alertasResumo, TIPOS_CONTA };
})();
