/* BIMCORE — Sobras do exercício e fundos coletivos.
   Estatuto, arts. 70 a 73; Regimento Interno, arts. 116 a 122 e 126.
   Ordem de destinação (RI 116): Reserva e FATES → Soberania (até a meta) → FEI → Aposentadoria.
   Sobras de parcerias públicas: depois de Reserva e FATES, tudo ao FEI (Estatuto, art. 72). */
(function () {
  "use strict";
  const UI = window.UI, API = window.API, Fin = window.Fin;
  const { $, esc, data, dataHora, moeda, acao, confirmar, toast } = UI;
  const c2 = (v) => Fin.centavos(Number(v) || 0);

  const FUNDOS = {
    reserva: { nome: "Fundo de Reserva", base: "Estatuto, art. 73; RI, art. 117", texto: "Repara perdas e garante o desenvolvimento das atividades. Indivisível." },
    fates: { nome: "FATES", base: "Estatuto, art. 71; RI, art. 118", texto: "Assistência técnica, educacional e social dos cooperados. Indivisível." },
    soberania: { nome: "Fundo de Soberania", base: "RI, arts. 116, II, e 120", texto: "Cobre as retiradas quando um cliente ou órgão público atrasa o pagamento; é recomposto quando o pagamento chega. Meta: 6 meses de custo operacional." },
    fei: { nome: "FEI — Expansão e Inovação", base: "Estatuto, art. 72; RI, art. 119", texto: "Expansão tecnológica, ATHIS e novas cooperativas. Recebe todas as sobras de parcerias públicas. Indivisível." },
    aposentadoria: { nome: "Fundo de Aposentadoria", base: "RI, art. 121", texto: "Individual por cooperado, gerido coletivamente. Resgate no desligamento, na aposentadoria, no 1º imóvel ou veículo, ou em período sem serviço." },
    apoio: { nome: "Fundo de Apoio ao Cooperado", base: "RI, art. 122", texto: "Rede de apoio: ajuda financeira pontual, apoio psicológico e adaptações. O extrato mostra só valores agregados, sem identificar ninguém." }
  };
  const ORDEM = ["reserva", "fates", "soberania", "fei", "aposentadoria", "apoio"];
  const MANUAIS = ["reserva", "fates", "soberania", "fei", "apoio"];

  const saldos = (movs, excetoEx) => {
    const o = {}; ORDEM.forEach((k) => { o[k] = 0; });
    (movs || []).forEach((m) => { if (excetoEx && m.exercicio === excetoEx) return; o[m.fundo] = c2(o[m.fundo] + Number(m.valor)); });
    return o;
  };

  /* Custo operacional médio do mês no exercício: retiradas brutas + INSS patronal + FIC da cooperativa
     + provisões de 13º e férias + auxílios + Custo de Operação e Gestão (20%) */
  function custoMensal(base, calc, ex) {
    const linhas = Fin.cooperativa(base, calc).linhas.filter((l) => l.mes.startsWith(String(ex)));
    const custos = linhas.map((l) => l.retiradas + l.inss_patronal + l.fic_coop + l.provisoes + l.auxilios + l.custo_op).filter((v) => v > 0);
    return custos.length ? c2(custos.reduce((t, v) => t + v, 0) / custos.length) : 0;
  }
  /* Horas de produção técnica e formação de cada cooperado no exercício (base do rateio, Plano Quinquenal) */
  function horasExercicio(base, calc, ex) {
    return (base.cooperados || []).map((c) => {
      const p = calc[c.id]; if (!p) return null;
      const h = (p.detalhes.mensal || []).filter((x) => x.mes.startsWith(String(ex))).reduce((t, x) => t + Number(x.horas_produtivas || 0) + Number(x.horas_formacao || 0), 0);
      return { fin_cooperado_id: c.id, nome: c.nome, horas: Math.round(h * 100) / 100 };
    }).filter((x) => x && x.horas > 0);
  }

  /* A cascata do RI 116 */
  function calcular(d) {
    const m = c2(d.mercado), p = c2(d.publicas), r = Number(d.reserva_pct), f = Number(d.fates_pct);
    const resM = c2(m * r), fatM = c2(m * f), resP = c2(p * r), fatP = c2(p * f);
    const out = { mercado: m, publicas: p, reserva_pct: r, fates_pct: f, reserva: c2(resM + resP), fates: c2(fatM + fatP),
      fei_publicas: c2(p - resP - fatP), disponivel: c2(m - resM - fatM), erros: [], avisos: [] };
    out.meta = c2(Number(d.custo_mensal || 0) * Number(d.meta_meses || 0));
    out.falta_meta = c2(Math.max(0, out.meta - Number(d.soberania_antes || 0)));
    out.soberania_minima = c2(Math.min(Math.max(0, out.disponivel), out.falta_meta));
    out.soberania = c2(d.soberania); out.fei_mercado = c2(d.fei_mercado); out.aposentadoria = c2(d.aposentadoria); out.apoio = c2(d.apoio);
    out.rateio = c2(out.disponivel - out.soberania - out.fei_mercado - out.aposentadoria - out.apoio);
    if (!(r >= 0.1)) out.erros.push("O Fundo de Reserva é de no mínimo 10% (Lei 5.764/71, art. 28, I).");
    if (!(f >= 0.05)) out.erros.push("O FATES é de no mínimo 5% (Lei 5.764/71, art. 28, II).");
    if (r + f > 1) out.erros.push("Reserva e FATES somados passam de 100%.");
    if (out.soberania > out.disponivel + 0.005) out.erros.push("O Fundo de Soberania não pode receber mais do que as sobras de mercado disponíveis.");
    if (out.soberania + 0.005 < out.soberania_minima) out.erros.push(`Pelo Regimento (art. 116, II), o Fundo de Soberania vem antes do FEI, da Aposentadoria e do rateio, até a meta. Destine pelo menos ${moeda(out.soberania_minima)} a ele.`);
    if (out.rateio < -0.005) out.erros.push("A soma das destinações passa das sobras de mercado disponíveis.");
    if (out.aposentadoria > 0 && Number(d.exercicio) < 2028) out.avisos.push("O Regimento (art. 121) prevê o Fundo de Aposentadoria a partir do 3º exercício. Confirme que a Assembleia aprovou antecipar.");
    if (out.apoio > 0) out.avisos.push("A dotação do Fundo de Apoio ao Cooperado é fixada por Resolução do Conselho de Administração (RI, art. 122).");
    if ((out.rateio > 0.005 || out.aposentadoria > 0) && !(Number(d.horas_total) > 0)) out.erros.push("Não há horas lançadas no exercício para dividir o rateio e a aposentadoria.");
    out.rateio = Math.max(0, out.rateio);
    return out;
  }
  /* Divide um valor pelas horas, sem perder centavos */
  function dividir(total, lista) {
    const H = lista.reduce((t, x) => t + x.horas, 0); if (!(H > 0) || !(total > 0)) return lista.map(() => 0);
    const cents = Math.round(total * 100);
    const brutos = lista.map((x) => cents * x.horas / H), base = brutos.map(Math.floor);
    let resto = cents - base.reduce((t, v) => t + v, 0);
    brutos.map((v, i) => [v - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (resto > 0) { base[i]++; resto--; } });
    return base.map((v) => v / 100);
  }
  function cotas(res, horas) {
    const r = dividir(res.rateio, horas), a = dividir(res.aposentadoria, horas);
    return horas.map((h, i) => ({ ...h, rateio: r[i], aposentadoria: a[i] }));
  }

  /* Tabela da destinação (usada na tesouraria e na transparência) */
  function htmlDestinacao(s0) {
    const s = {}; Object.keys(s0).forEach((k) => { const v = s0[k]; s[k] = typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; });
    const pct = (v) => (Number(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
    const L = [
      ["Sobras líquidas apuradas", s.mercado, s.publicas, true],
      [`Fundo de Reserva (${pct(s.reserva_pct)})`, -c2(s.mercado * s.reserva_pct), -c2(s.publicas * s.reserva_pct)],
      [`FATES (${pct(s.fates_pct)})`, -c2(s.mercado * s.fates_pct), -c2(s.publicas * s.fates_pct)],
      ["Fundo de Soberania", -s.soberania, 0],
      ["FEI — Expansão e Inovação", -s.fei_mercado, -s.fei_publicas],
      ["Fundo de Aposentadoria", -s.aposentadoria, 0],
      ["Fundo de Apoio ao Cooperado", -s.apoio, 0]
    ];
    const v = (x) => (x ? moeda(x) : "—");
    return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Destinação (RI, art. 116)</th><th class="num">Mercado e licitações</th><th class="num">Parcerias públicas</th><th class="num">Total</th></tr></thead>
      <tbody>${L.map(([t, a, b, neg]) => `<tr${neg ? ' style="font-weight:600"' : ""}><td>${t}</td><td class="num">${v(a)}</td><td class="num">${v(b)}</td><td class="num">${v(c2(a + b))}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Rateio entre os cooperados (pelas horas)</td><td class="num">${moeda(s.rateio)}</td><td class="num">—</td><td class="num">${moeda(s.rateio)}</td></tr></tfoot></table></div>`;
  }

  /* Saldos e extrato dos fundos coletivos (RI, art. 126) */
  function htmlFundos(movs, custo, opts) {
    opts = opts || {};
    const sd = saldos(movs);
    const cob = custo > 0 ? sd.soberania / custo : null;
    const cards = ORDEM.map((k) => `<div class="kpi"><span class="rot">${FUNDOS[k].nome} ${UI.info ? UI.info(FUNDOS[k].texto + " (" + FUNDOS[k].base + ")", FUNDOS[k].nome) : ""}</span><span class="val">${moeda(sd[k])}</span>
      <span class="det">${k === "soberania" ? (cob == null ? "Cobertura: sem custo de referência ainda" : `Cobre ${cob.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mês(es) de custo · meta 6`) : FUNDOS[k].base}</span></div>`).join("");
    const lista = (movs || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
    return `<div class="kpis">${cards}</div>
      ${cob != null && cob < 1 && sd.soberania >= 0 && (movs || []).some((m) => m.fundo === "soberania") ? '<div class="notice warn">O Fundo de Soberania cobre menos de 1 mês de custo operacional. Pelo Regimento (art. 180), isso aciona reunião extraordinária do Conselho de Administração e do Conselho Fiscal.</div>' : ""}
      ${lista.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Fundo</th><th>Descrição</th><th class="num">Valor</th>${opts.excluir ? "<th></th>" : ""}</tr></thead>
        <tbody>${lista.map((m) => `<tr><td>${data(m.data)}</td><td>${FUNDOS[m.fundo] ? FUNDOS[m.fundo].nome : esc(m.fundo)}</td><td>${esc(m.descricao)}${m.registrado_nome ? `<span class="sub">registrado por ${esc(m.registrado_nome)}</span>` : ""}</td>
          <td class="num" style="color:${Number(m.valor) < 0 ? "var(--err)" : "inherit"}">${moeda(m.valor)}</td>${opts.excluir ? `<td class="acoes-celula">${m.exercicio ? '<span class="sub">da apuração</span>' : `<button class="btn btn-ghost btn-sm so-tes" data-delmov="${m.id}">Apagar</button>`}</td>` : ""}</tr>`).join("")}</tbody></table></div>`
        : '<p class="vazio">Nenhum movimento nos fundos coletivos ainda. Os primeiros entram com a apuração das sobras do exercício.</p>'}`;
  }

  /* ---------------- Tesouraria: aba "Sobras e fundos" ---------------- */
  let exSel = null;
  async function renderTesouraria(corpo, ctx) {
    const { base, calc, recarregar } = ctx;
    const pub = await API.sobras.publico().catch(() => ({ sobras: [], movimentos: [] }));
    const anoAtual = Number(UI.hoje().slice(0, 4));
    const anos = new Set([anoAtual]); for (let a = 2026; a <= anoAtual; a++) anos.add(a); pub.sobras.forEach((s) => anos.add(Number(s.exercicio)));
    if (!exSel) exSel = anoAtual;
    const ex = exSel, reg = pub.sobras.find((s) => Number(s.exercicio) === ex) || null;
    const pr = Fin.params(base.parametros);
    const custoAuto = custoMensal(base, calc, ex);
    const horas = horasExercicio(base, calc, ex);
    const horasTot = horas.reduce((t, x) => t + x.horas, 0);
    const sobAntes = saldos(pub.movimentos, ex).soberania;
    const custoRef = (reg && Number(reg.custo_mensal)) || custoAuto;
    const lancada = reg && reg.status === "lancada";
    const d0 = reg || { exercicio: ex, mercado: 0, publicas: 0, reserva_pct: Math.max(0.1, pr.reserva_pct), fates_pct: Math.max(0.05, pr.fates_pct), custo_mensal: custoAuto, meta_meses: 6, soberania: null, fei_mercado: 0, aposentadoria: 0, apoio: 0, observacao: "" };
    const pctTxt = (v) => (Number(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const brl = (v) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const ler = (t) => { t = String(t || "").replace(/[R$\s%]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); const v = Number(t); return Number.isFinite(v) && v > 0 ? v : 0; };

    corpo.innerHTML = `
      <section class="painel">
        <div class="painel-cab"><h2>Apuração das sobras do exercício</h2>
          <div class="field" style="margin:0"><select class="input" id="sb-ex" aria-label="Exercício">${[...anos].sort((a, b) => b - a).map((a) => `<option value="${a}"${a === ex ? " selected" : ""}>Exercício ${a}</option>`).join("")}</select></div></div>
        <details class="asm-passo"><summary>Como funciona, passo a passo</summary><ol>
          <li>Em 31/12 o exercício fecha (Estatuto, art. 70). Com o balanço da contadora, preencha as sobras líquidas separando as de <b>mercado e licitações</b> das de <b>parcerias com o Poder Público</b>.</li>
          <li>O site aplica a ordem do Regimento (art. 116): primeiro Fundo de Reserva e FATES; depois o <b>Fundo de Soberania</b> até a meta de 6 meses de custo operacional; depois o FEI e o Fundo de Aposentadoria. O que sobra é rateado pelas horas de produção e formação do ano.</li>
          <li>As sobras de parcerias públicas, depois de Reserva e FATES, vão inteiras ao FEI e nunca são rateadas (Estatuto, art. 72).</li>
          <li>Salve o rascunho e leve a proposta à Assembleia Geral Ordinária, que decide os percentuais e o destino (art. 71, §3º).</li>
          <li>Depois da Assembleia, clique em <b>Lançar</b> com a data da AGO. Os valores entram nos fundos e na "Minha conta" de cada cooperado.</li>
          <li>Quando transferir o rateio, registre o pagamento. Se errar algo antes de pagar, use <b>Estornar</b> e lance de novo.</li></ol></details>
        ${lancada ? `<div class="notice ok">Lançada por ${esc(reg.lancado_nome || "")} em ${dataHora(reg.lancado_em)}. Aprovada na Assembleia Geral de ${data(reg.aprovado_em)}${reg.ata ? ` (${esc(reg.ata)})` : ""}.
            ${reg.rateio_pago_em ? `<br>Rateio pago em ${data(reg.rateio_pago_em)} por ${esc(reg.rateio_pago_nome || "")}.` : Number(reg.rateio) > 0 ? "<br>Rateio ainda não pago aos cooperados." : ""}</div>` : ""}
        <form id="sb-f" class="form-grid" novalidate${lancada ? ' style="display:none"' : ""}>
          <div class="field"><label for="sb-m">Sobras de mercado e licitações (R$)</label><input class="input" id="sb-m" inputmode="decimal" value="${brl(d0.mercado)}"></div>
          <div class="field"><label for="sb-p">Sobras de parcerias públicas (R$)</label><input class="input" id="sb-p" inputmode="decimal" value="${brl(d0.publicas)}"></div>
          <div class="field"><label for="sb-r">Fundo de Reserva (%)</label><input class="input" id="sb-r" inputmode="decimal" value="${pctTxt(d0.reserva_pct)}"><span class="hint">Mínimo 10%.</span></div>
          <div class="field"><label for="sb-f2">FATES (%)</label><input class="input" id="sb-f2" inputmode="decimal" value="${pctTxt(d0.fates_pct)}"><span class="hint">Mínimo 5%.</span></div>
          <div class="field"><label for="sb-c">Custo operacional médio do mês (R$)</label><input class="input" id="sb-c" inputmode="decimal" value="${brl(d0.custo_mensal)}"><span class="hint">Calculado do ano: ${moeda(custoAuto)} (retiradas, INSS patronal, FIC, provisões, auxílios e os 20%).</span></div>
          <div class="field"><label for="sb-mm">Meta do Fundo de Soberania (meses)</label><input class="input" id="sb-mm" inputmode="decimal" value="${String(d0.meta_meses).replace(".", ",")}"><span class="hint">RI 120: 6 meses. Saldo hoje: ${moeda(sobAntes)}.</span></div>
          <div class="field"><label for="sb-s">Fundo de Soberania (R$)</label><input class="input" id="sb-s" inputmode="decimal" value="${d0.soberania == null ? "" : brl(d0.soberania)}"><span class="hint" id="sb-s-h"></span></div>
          <div class="field"><label for="sb-fei">FEI, das sobras de mercado (R$)</label><input class="input" id="sb-fei" inputmode="decimal" value="${brl(d0.fei_mercado)}"></div>
          <div class="field"><label for="sb-ap">Fundo de Aposentadoria (R$)</label><input class="input" id="sb-ap" inputmode="decimal" value="${brl(d0.aposentadoria)}"><span class="hint">Dividido entre os cooperados pelas horas do ano.</span></div>
          <div class="field"><label for="sb-apo">Fundo de Apoio ao Cooperado (R$)</label><input class="input" id="sb-apo" inputmode="decimal" value="${brl(d0.apoio)}"></div>
          <div class="field full"><label for="sb-obs">Observações</label><input class="input" id="sb-obs" maxlength="300" value="${esc(d0.observacao || "")}"></div>
          <div class="full sol-acoes"><button class="btn btn-primary so-tes" type="submit" id="sb-salvar">Salvar rascunho</button>
            ${reg ? '<button class="btn btn-ghost so-tes" type="button" id="sb-lancar">Lançar (aprovada na Assembleia)</button> <button class="btn btn-danger btn-sm so-tes" type="button" id="sb-apagar">Apagar rascunho</button>' : ""}</div>
        </form>
        <div id="sb-prev"></div>
      </section>
      <section class="painel"><h2>Fundos coletivos</h2>
        <p class="hint">Saldos e movimentos visíveis a todos os cooperados (Regimento, art. 126). Os investimentos dos fundos devem ser de baixo risco e alta liquidez, sob supervisão do Conselho Fiscal.</p>
        ${htmlFundos(pub.movimentos, custoRef, { excluir: true })}
        <form id="fm-f" class="form-grid so-tes" novalidate style="margin-top:1rem">
          <div class="field"><label for="fm-fundo">Fundo</label><select class="input" id="fm-fundo">${MANUAIS.map((k) => `<option value="${k}">${FUNDOS[k].nome}</option>`).join("")}</select></div>
          <div class="field"><label for="fm-tipo">Movimento</label><select class="input" id="fm-tipo"><option value="1">Entrada (rendimento, recomposição, crédito não reclamado)</option><option value="-1">Saída (uso do fundo)</option></select></div>
          <div class="field"><label for="fm-data">Data</label><input class="input" id="fm-data" type="date" value="${UI.hoje()}" max="${UI.hoje()}"></div>
          <div class="field"><label for="fm-val">Valor (R$)</label><input class="input" id="fm-val" inputmode="decimal"></div>
          <div class="field full"><label for="fm-desc">Descrição</label><input class="input" id="fm-desc" maxlength="300" placeholder="Ex.: Retiradas de outubro cobertas pelo atraso do pagamento da Prefeitura X"><span class="hint">No Fundo de Apoio ao Cooperado, não escreva o nome de quem foi ajudado (RI 122, §2º).</span></div>
          <div class="full"><button class="btn btn-primary" type="submit" id="fm-btn">Registrar movimento</button></div>
        </form>
      </section>`;

    const ctxCalc = () => ({ exercicio: ex, mercado: ler($("#sb-m").value), publicas: ler($("#sb-p").value), reserva_pct: ler($("#sb-r").value) / 100, fates_pct: ler($("#sb-f2").value) / 100,
      custo_mensal: ler($("#sb-c").value), meta_meses: ler($("#sb-mm").value), soberania_antes: sobAntes, fei_mercado: ler($("#sb-fei").value), aposentadoria: ler($("#sb-ap").value), apoio: ler($("#sb-apo").value),
      soberania: $("#sb-s").value.trim() === "" ? null : ler($("#sb-s").value), horas_total: horasTot, observacao: $("#sb-obs").value.trim() });
    const resultado = () => {
      const d = ctxCalc(); const pre = calcular({ ...d, soberania: 0 });
      if (d.soberania == null) d.soberania = pre.soberania_minima;
      return { d, r: calcular(d) };
    };
    const tabelaCotas = (lista) => lista.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th class="num">Horas no ano</th><th class="num">Rateio</th><th class="num">Aposentadoria</th></tr></thead>
      <tbody>${lista.map((x) => `<tr><td>${esc(x.nome || "")}</td><td class="num">${Number(x.horas).toLocaleString("pt-BR")}</td><td class="num">${moeda(x.rateio)}</td><td class="num">${moeda(x.aposentadoria)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhuma hora de produção ou formação lançada neste exercício.</p>';
    const mostrar = () => {
      if (lancada) {
        $("#sb-prev").innerHTML = htmlDestinacao(reg) + `<h3 style="margin-top:1rem">Cotas dos cooperados</h3>${tabelaCotas(ctx.base.sobras_cotas ? ctx.base.sobras_cotas.filter((x) => Number(x.exercicio) === ex) : [])}
          <div class="sol-acoes">${Number(reg.rateio) > 0 ? (reg.rateio_pago_em ? '<button class="btn btn-ghost btn-sm so-tes" id="sb-despagar">Desfazer pagamento do rateio</button>' : '<button class="btn btn-primary btn-sm so-tes" id="sb-pagar">Registrar pagamento do rateio</button>') : ""}
          ${reg.rateio_pago_em ? "" : '<button class="btn btn-danger btn-sm so-tes" id="sb-estornar">Estornar lançamento</button>'}</div>`;
        return;
      }
      const { r } = resultado();
      $("#sb-s-h").textContent = r.meta > 0 ? `Meta ${moeda(r.meta)}; faltam ${moeda(r.falta_meta)}. Mínimo agora: ${moeda(r.soberania_minima)}.` : "Sem custo de referência, não há meta a cumprir.";
      const lista = cotas(r, horas);
      $("#sb-prev").innerHTML = `${r.erros.length ? `<div class="notice err">${r.erros.map(esc).join("<br>")}</div>` : ""}${r.avisos.length ? `<div class="notice warn">${r.avisos.map(esc).join("<br>")}</div>` : ""}
        ${htmlDestinacao(r)}<p class="hint">Rateio pelas horas de produção técnica e formação de ${ex} (${horasTot.toLocaleString("pt-BR")} h no total). Quando o Índice Global de Contribuição existir, 40% do rateio passará a segui-lo (Plano Quinquenal, cap. 5, item 5.4).</p>
        <h3 style="margin-top:1rem">Prévia das cotas</h3>${tabelaCotas(lista)}`;
    };
    mostrar();
    $("#sb-ex").onchange = (e) => { exSel = Number(e.target.value); recarregar(); };
    if (!lancada) {
      $("#sb-f").addEventListener("input", mostrar);
      $("#sb-f").addEventListener("submit", async (e) => {
        e.preventDefault(); const { d, r } = resultado();
        if (r.erros.length) return toast(r.erros[0], "err");
        const reg2 = { exercicio: ex, mercado: r.mercado, publicas: r.publicas, reserva_pct: r.reserva_pct, fates_pct: r.fates_pct, custo_mensal: d.custo_mensal, meta_meses: d.meta_meses, soberania_antes: sobAntes,
          reserva: r.reserva, fates: r.fates, soberania: r.soberania, fei_publicas: r.fei_publicas, fei_mercado: r.fei_mercado, aposentadoria: r.aposentadoria, apoio: r.apoio, rateio: r.rateio, horas_total: horasTot, observacao: d.observacao || null };
        if (await acao($("#sb-salvar"), () => API.sobras.salvar(reg2), "Rascunho salvo.")) recarregar();
      });
      if (reg) {
        $("#sb-apagar").onclick = async (e) => { if (!(await confirmar("Apagar o rascunho deste exercício?", "Apagar"))) return; if (await acao(e.currentTarget, () => API.sobras.excluir(ex), "Rascunho apagado.")) recarregar(); };
        $("#sb-lancar").onclick = () => {
          const { r } = resultado();
          if (r.erros.length) return toast(r.erros[0], "err");
          if (Math.abs(r.rateio - Number(reg.rateio)) > 0.005 || Math.abs(r.soberania - Number(reg.soberania)) > 0.005 || Math.abs(r.mercado - Number(reg.mercado)) > 0.005) return toast("Há mudanças não salvas. Salve o rascunho antes de lançar.", "err");
          const lista = cotas(reg, horas);
          const m = UI.modal(`<h2>Lançar as sobras de ${ex}</h2>
            <p>Os valores entram nos fundos coletivos e nas contas dos cooperados. Faça isso <b>só depois</b> que a Assembleia Geral aprovar a destinação.</p>
            ${htmlDestinacao(reg)}${tabelaCotas(lista)}
            <div class="form-grid"><div class="field"><label for="ln-data">Data da Assembleia Geral</label><input class="input" id="ln-data" type="date" max="${UI.hoje()}"></div>
              <div class="field"><label for="ln-ata">Ata (referência)</label><input class="input" id="ln-ata" maxlength="150" placeholder="Ex.: Ata da AGO de 2027"></div></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="ln-ok">Lançar</button></div>`);
          $("#ln-ok", m.el).onclick = async (e2) => {
            const dt = $("#ln-data", m.el).value; if (!dt) return toast("Informe a data da Assembleia Geral.", "err");
            if (await acao(e2.currentTarget, () => API.sobras.lancar(ex, lista, dt, $("#ln-ata", m.el).value.trim()), "Sobras lançadas.")) { m.fechar(); recarregar(); }
          };
        };
      }
    } else {
      const bp = $("#sb-pagar"), bd = $("#sb-despagar"), be = $("#sb-estornar");
      if (bp) bp.onclick = () => {
        const m = UI.modal(`<h2>Pagamento do rateio de ${ex}</h2><p>Registre depois de transferir a parte de cada cooperado (${moeda(reg.rateio)} no total).</p>
          <div class="field"><label for="rp-data">Transferido em</label><input class="input" id="rp-data" type="date" value="${UI.hoje()}" max="${UI.hoje()}"></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="rp-ok">Registrar</button></div>`);
        $("#rp-ok", m.el).onclick = async (e2) => { const dt = $("#rp-data", m.el).value; if (!dt) return toast("Informe a data.", "err"); if (await acao(e2.currentTarget, () => API.sobras.pagarRateio(ex, dt), "Pagamento registrado.")) { m.fechar(); recarregar(); } };
      };
      if (bd) bd.onclick = async (e) => { if (!(await confirmar("Desfazer o registro do pagamento do rateio?", "Desfazer"))) return; if (await acao(e.currentTarget, () => API.sobras.pagarRateio(ex, null), "Pagamento desfeito.")) recarregar(); };
      if (be) be.onclick = async (e) => { if (!(await confirmar("Estornar o lançamento? Os valores saem dos fundos e das contas dos cooperados, e a apuração volta a ser rascunho.", "Estornar"))) return; if (await acao(e.currentTarget, () => API.sobras.estornar(ex), "Lançamento estornado.")) recarregar(); };
    }
    corpo.querySelectorAll("[data-delmov]").forEach((b) => { b.onclick = async () => { if (!(await confirmar("Apagar este movimento?", "Apagar"))) return; if (await acao(b, () => API.sobras.excluirMov(b.dataset.delmov), "Movimento apagado.")) recarregar(); }; });
    $("#fm-f").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = ler($("#fm-val").value), desc = $("#fm-desc").value.trim(), fundo = $("#fm-fundo").value, sinal = Number($("#fm-tipo").value);
      if (!v) return toast("Informe o valor.", "err"); if (desc.length < 3) return toast("Descreva o movimento.", "err"); if (!$("#fm-data").value) return toast("Informe a data.", "err");
      if (sinal < 0 && v > saldos(pub.movimentos)[fundo] + 0.005) return toast(`O ${FUNDOS[fundo].nome} não tem saldo para essa saída.`, "err");
      if (await acao($("#fm-btn"), () => API.sobras.salvarMov({ fundo, data: $("#fm-data").value, valor: c2(sinal * v), descricao: desc }), "Movimento registrado.")) recarregar();
    });
  }

  /* ---------------- Área do cooperado: transparência ---------------- */
  async function htmlTransparencia() {
    const pub = await API.sobras.publico().catch(() => ({ sobras: [], movimentos: [] }));
    const lanc = pub.sobras.filter((s) => s.status === "lancada").sort((a, b) => b.exercicio - a.exercicio);
    const custo = lanc.length ? Number(lanc[0].custo_mensal) : 0;
    return `<section class="painel"><h2>Fundos coletivos</h2>
        <p class="hint">Saldo e movimento de cada fundo da cooperativa (Regimento, art. 126). Os fundos de Reserva, FATES e FEI são indivisíveis: não são divididos nem devolvidos a ninguém.</p>
        ${htmlFundos(pub.movimentos, custo)}</section>
      ${lanc.map((s) => `<section class="painel"><div class="painel-cab"><h2>Sobras do exercício ${s.exercicio}</h2><span class="hint">aprovadas na Assembleia de ${data(s.aprovado_em)}</span></div>
        ${htmlDestinacao(s)}${s.observacao ? `<p class="hint">${esc(s.observacao)}</p>` : ""}</section>`).join("")}`;
  }

  window.Sobras = { FUNDOS, calcular, cotas, saldos, custoMensal, horasExercicio, htmlDestinacao, htmlFundos, renderTesouraria, htmlTransparencia };
})();
