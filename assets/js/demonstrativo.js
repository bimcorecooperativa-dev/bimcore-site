/* BIMCORE — Demonstrativo mensal de retiradas (Estatuto, art. 24, §3º; Regimento, art. 94)
   e evolução dos fundos individuais. Usado na Minha conta e pela tesouraria. */
(function () {
  "use strict";
  const Fin = window.Fin;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num = (n, d) => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });
  const pct = (x) => num(Number(x || 0) * 100, Number(x || 0) * 100 % 1 ? 2 : 0) + "%";
  const data = (d) => { if (!d) return "—"; const t = new Date(String(d).length === 10 ? d + "T12:00:00" : d); return isNaN(t) ? "—" : t.toLocaleDateString("pt-BR"); };
  const EMPRESA = { nome: "BIMCORE Cooperativa de Trabalho", cnpj: "66.004.522/0001-70", end: "Rua Sambaíba, 33, Pontinha, Araruama/RJ" };

  function mesesComRetirada(c, base) {
    return [...new Set((base.retiradas || []).filter((r) => r.fin_cooperado_id === c.id && r.status === "paga" && r.pago_em).map((r) => Fin.mesDe(r.pago_em)))].sort().reverse();
  }

  function dados(c, base, m, calc) {
    calc = calc || Fin.calcularCooperado(c, base);
    const P = Fin.params(Fin.parametrosDoMes(base, m));
    const linha = (calc.detalhes.mensal || []).find((x) => x.mes === m) || {};
    const pagas = (base.retiradas || []).filter((r) => r.fin_cooperado_id === c.id && r.status === "paga" && r.pago_em && Fin.mesDe(r.pago_em) === m)
      .sort((a, b) => String(a.pago_em).localeCompare(String(b.pago_em)));
    const soma = (k) => Fin.centavos(pagas.reduce((t, r) => t + Number(r[k] || 0), 0));
    const bruto = soma("valor"), inss = soma("inss"), ir = soma("ir"), contribuicao = soma("contribuicao"), fic_vol = soma("fic_vol");
    const liquido = Fin.centavos(bruto - inss - ir - contribuicao - fic_vol);
    const enq = Fin.enquadramento(c, base, m) || {};
    const irDet = Fin.irDetalhe(bruto, inss, c.dependentes_ir, P);
    const gerado = (calc.detalhes.mensal || []).filter((x) => x.mes <= m).reduce((t, x) => t + Number(x.credito || 0), 0);
    const pagoAte = (base.retiradas || []).filter((r) => r.fin_cooperado_id === c.id && r.status === "paga" && r.pago_em && Fin.mesDe(r.pago_em) <= m).reduce((t, r) => t + Number(r.valor), 0);
    const saldoDepois = Fin.centavos(Math.max(0, gerado - pagoAte));
    return {
      mes: m, cooperado: c, enquadramento: enq, valor_hora: linha.valor_hora || 0, P,
      pagas, bruto, inss, ir, contribuicao, fic_vol, liquido,
      base_inss: Fin.centavos(Math.min(bruto, P.inss_teto)), ir_detalhe: irDet, ir_ajustado: Math.abs(irDet.ir - ir) > 0.01,
      credito: { gerado: Fin.centavos(gerado), antes: Fin.centavos(saldoDepois + bruto), depois: saldoDepois },
      horas: { produtivas: linha.horas_produtivas || 0, formacao: linha.horas_formacao || 0, formacao_credito: linha.horas_formacao_credito || 0, admin: linha.horas_admin || 0, credito: linha.credito || 0 },
      info: {
        fic_coop: Fin.centavos(bruto * P.fic_coop_pct), prov_13: Fin.centavos(bruto / 12), prov_ferias: Fin.centavos(bruto / 12),
        patronal: Fin.centavos(bruto * P.patronal_pct), aux_tele: linha.aux_tele || 0, aux_alim: linha.aux_alim || 0, dias: linha.dias || 0
      },
      fundos: { fic: calc.fic_saldo, f13: calc.fundo_13, ferias: calc.fundo_ferias, capital: calc.capital_integralizado }
    };
  }

  /* Contracheque: proventos, descontos, líquido, bases e informativos */
  function html(d) {
    const c = d.cooperado, P = d.P, ird = d.ir_detalhe;
    const desc = [
      ["INSS (contribuição individual)", pct(P.inss_pct), d.inss],
      ["Imposto de renda retido na fonte", ird.base > 0 ? pct(ird.aliquota) : "isento", d.ir],
      ["Contribuição ao capital social", pct(P.contrib_pct), d.contribuicao]
    ];
    if (d.fic_vol) desc.push(["FIC — aporte voluntário", pct(Number(c.fic_voluntario || 0)), d.fic_vol]);
    const totDesc = Fin.centavos(desc.reduce((t, x) => t + x[2], 0));
    return `
      <div class="dem">
        <header class="dem-cab">
          <div><b>${EMPRESA.nome}</b><span>CNPJ ${EMPRESA.cnpj} · ${EMPRESA.end}</span></div>
          <div class="dem-tit"><b>Demonstrativo de retirada</b><span>Competência ${Fin.nomeMes(d.mes)}</span></div>
        </header>
        <dl class="dem-id">
          <div><dt>Cooperado</dt><dd>${esc(c.nome)}</dd></div>
          <div><dt>Matrícula</dt><dd>${esc(String(c.id).slice(0, 8).toUpperCase())}</dd></div>
          <div><dt>Admissão</dt><dd>${data(c.data_admissao)}</dd></div>
          <div><dt>Categoria</dt><dd>${esc(d.enquadramento.categoria || c.categoria || "—")}${d.enquadramento.conselho || c.conselho ? " · " + esc(d.enquadramento.conselho || c.conselho) : ""}</dd></div>
          <div><dt>Valor-hora no mês</dt><dd>${moeda(d.valor_hora)}</dd></div>
          <div><dt>Dependentes (IR)</dt><dd>${Number(c.dependentes_ir || 0)}</dd></div>
        </dl>
        <div class="dem-rolar"><table class="dem-tab">
          <thead><tr><th>Descrição</th><th class="n ref">Referência</th><th class="n">Proventos</th><th class="n">Descontos</th></tr></thead>
          <tbody>
            ${d.pagas.map((r) => `<tr><td>Retirada de crédito de trabalho<small>paga em ${data(r.pago_em)} · pedido em ${data(r.solicitado_em)}</small></td><td class="n ref">—</td><td class="n">${num(r.valor)}</td><td class="n"></td></tr>`).join("")}
            ${desc.map(([t, ref, v]) => `<tr><td>${t}<small class="ref-m">${ref}</small></td><td class="n ref">${ref}</td><td class="n"></td><td class="n">${num(v)}</td></tr>`).join("")}
          </tbody>
          <tfoot>
            <tr><td>Totais</td><td class="ref"></td><td class="n">${num(d.bruto)}</td><td class="n">${num(totDesc)}</td></tr>
            <tr class="dem-liq"><td>Líquido transferido</td><td class="ref"></td><td></td><td class="n">${moeda(d.liquido)}</td></tr>
          </tfoot>
        </table></div>
        <div class="dem-bases">
          <div><span>Base do INSS</span><b>${moeda(d.base_inss)}</b><small>teto ${moeda(P.inss_teto)}</small></div>
          <div><span>Base do IR</span><b>${moeda(ird.base)}</b><small>${ird.simplificado ? "desconto simplificado de " + moeda(ird.desconto_simplificado) : "bruto − INSS" + (ird.dependentes ? " − " + ird.dependentes + " dependente(s)" : "")}</small></div>
          <div><span>IR pela tabela</span><b>${moeda(ird.imposto)}</b><small>${ird.base > 0 ? pct(ird.aliquota) + " − " + moeda(ird.parcela) : "faixa isenta"}${ird.reducao ? " · redução Lei 15.270: −" + moeda(ird.reducao) : ""}</small></div>
          <div><span>Saldo de crédito de trabalho</span><b>${moeda(d.credito.antes)} → ${moeda(d.credito.depois)}</b><small>antes e depois desta retirada · gerado até ${Fin.nomeMes(d.mes)}: ${moeda(d.credito.gerado)}</small></div>
        </div>
        ${d.ir_ajustado ? '<p class="dem-obs">O IR registrado pela tesouraria difere do cálculo pela tabela (ajuste no pagamento).</p>' : ""}
        <h4 class="dem-sub">Informativo — valores que não saem da sua retirada</h4>
        <table class="dem-tab dem-info"><tbody>
          <tr><td>FIC — aporte da cooperativa (${pct(P.fic_coop_pct)}, creditado no mês seguinte)</td><td class="n">${num(d.info.fic_coop)}</td></tr>
          <tr><td>Provisão de 13º (1/12)</td><td class="n">${num(d.info.prov_13)}</td></tr>
          <tr><td>Provisão de férias (1/12)</td><td class="n">${num(d.info.prov_ferias)}</td></tr>
          <tr><td>INSS patronal pago pela cooperativa (${pct(P.patronal_pct)})</td><td class="n">${num(d.info.patronal)}</td></tr>
          ${d.info.aux_tele || d.info.aux_alim ? `<tr><td>Auxílios indenizatórios do mês (teletrabalho e alimentação, ${d.info.dias} dia(s))</td><td class="n">${num(d.info.aux_tele + d.info.aux_alim)}</td></tr>` : ""}
        </tbody></table>
        <h4 class="dem-sub">Seus fundos individuais hoje</h4>
        <div class="dem-bases">
          <div><span>Capital integralizado</span><b>${moeda(d.fundos.capital)}</b></div>
          <div><span>FIC</span><b>${moeda(d.fundos.fic)}</b></div>
          <div><span>Fundo de 13º</span><b>${moeda(d.fundos.f13)}</b></div>
          <div><span>Fundo de férias</span><b>${moeda(d.fundos.ferias)}</b></div>
        </div>
        <p class="dem-rodape">Demonstrativo emitido pelo site da BIMCORE conforme o art. 24, §3º do Estatuto e o art. 94 do Regimento Interno. O INSS e o IR retidos são recolhidos pela cooperativa; o IR aparece no informe de rendimentos para a sua declaração anual. Dúvidas: tesouraria.</p>
      </div>`;
  }

  const CSS_IMPRESSAO = `
    *{box-sizing:border-box} body{font:12px/1.45 "Segoe UI",Arial,sans-serif;color:#111;margin:24px}
    .dem{max-width:780px;margin:0 auto} .dem-cab{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:8px}
    .dem-cab span{display:block;color:#444;font-size:11px} .dem-tit{text-align:right} .dem-tit b{font-size:15px}
    .dem-id{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin:12px 0} .dem-id dt{font-size:10px;color:#555;text-transform:uppercase} .dem-id dd{margin:0;font-weight:600}
    .dem-tab{width:100%;border-collapse:collapse;margin:8px 0} .dem-tab th,.dem-tab td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}
    .dem-tab th{background:#eee;font-size:11px} .dem-tab .n{text-align:right;white-space:nowrap} .dem-tab small{display:block;color:#555}
    .dem-tab tfoot td{font-weight:700} .dem-liq td{background:#eee;font-size:13px}
    .dem-bases{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0} .dem-bases div{border:1px solid #bbb;padding:6px}
    .dem-bases span,.dem-bases small{display:block;font-size:10px;color:#555} .dem-bases b{display:block}
    .dem-sub{margin:14px 0 4px;font-size:12px} .dem-obs,.dem-rodape{font-size:10px;color:#444} @page{margin:14mm}`;

  function imprimir(d) {
    const w = window.open("", "_blank");
    if (!w) { alertaBloqueio(); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Demonstrativo ${esc(d.cooperado.nome)} ${Fin.nomeMes(d.mes)}</title><style>${CSS_IMPRESSAO}</style></head><body>${html(d)}<script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }
  function alertaBloqueio() { if (window.UI && window.UI.toast) window.UI.toast("O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.", "err"); }

  /* Evolução dos fundos individuais mês a mês */
  function fundos(c, base, calc) {
    calc = calc || Fin.calcularCooperado(c, base);
    let fic = 0, f13 = 0, fer = 0, cap = 0;
    const linhas = (calc.detalhes.mensal || []).map((x) => {
      const aFic = Number(x._fic || 0), a13 = Number(x._p13 || 0) - Number(x.decimo_pago || 0), aFer = Number(x._pf || 0) - Number(x.ferias_pago || 0), aCap = Number(x._paga || 0);
      fic += aFic; f13 += a13; fer += aFer; cap += aCap;
      return { mes: x.mes, retirada: x.retirada, fic_mes: Fin.centavos(aFic), fic: Fin.centavos(fic), f13_mes: Fin.centavos(a13), f13: Fin.centavos(f13), fer_mes: Fin.centavos(aFer), fer: Fin.centavos(fer), cap_mes: Fin.centavos(aCap), cap: Fin.centavos(cap) };
    }).filter((l) => l.retirada || l.fic_mes || l.f13_mes || l.fer_mes || l.cap_mes);
    return { linhas, ajustes_fic: Fin.centavos(Number(c.fic_rendimentos || 0) - Number(c.fic_resgates || 0)), atual: { fic: calc.fic_saldo, f13: calc.fundo_13, ferias: calc.fundo_ferias, capital: calc.capital_integralizado } };
  }

  window.Demonstrativo = { mesesComRetirada, dados, html, imprimir, fundos };
})();
