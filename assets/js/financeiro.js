/* BIMCORE — regras comuns do financeiro no site:
   saldos ajustados pelos lançamentos do site, distribuição de um pagamento,
   Pix "copia e cola" (BR Code) e gravação na aba "Lançamentos do site". */
(function () {
  "use strict";

  const PIX = { chave: "66004522000170", nome: "BIMCORE COOP DE TRABALHO", cidade: "ARARUAMA", chaveFormatada: "66.004.522/0001-70" };
  const ABA_LANC = "Lançamentos do site";
  const centavos = (v) => Math.round(Number(v || 0) * 100) / 100;
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const nomeMes = (m) => { if (!m) return "mês atual"; const [a, mm] = m.split("-"); return `${MESES[Number(mm) - 1]}/${a}`; };

  /* Movimento ainda não lançado na planilha enviada */
  const pendenteDePlanilha = (m) => !m.incorporado_em && !m.lancado;
  const vale = (m) => pendenteDePlanilha(m) && m.status === "confirmado";
  const reserva = (m) => pendenteDePlanilha(m) && (m.status === "confirmado" || (m.status === "aguardando" && m.tipo === "pix"));

  /* O que está em aberto, por parte, a partir da posição e dos movimentos */
  function componentes(p, movs, filtro) {
    const det = (p && p.detalhes) || {};
    const res = det.resumo || {};
    const n = (k) => Number((p && p[k]) || 0);
    let inicial = centavos(res.falta_inicial || 0);
    const faltaTotal = (res.falta_integralizar != null ? Number(res.falta_integralizar) : Math.max(0, n("capital_subscrito") - n("capital_integralizado"))) + Number(res.adiantado || 0);
    const mesBase = String((p && p.data_base) || "").slice(0, 7);
    let meses = (det.mensal || []).map((m) => ({ mes: m.mes, aberto: centavos(Math.max(0, (m.devida || 0) - (m.paga || 0))) })).filter((m) => m.aberto > 0);
    const somaMeses = meses.reduce((a, m) => a + m.aberto, 0);
    const restoCapital = centavos(Math.max(0, faltaTotal) - inicial - somaMeses);
    if (restoCapital > 0.005) meses.push({ mes: null, aberto: restoCapital });
    let despesa = centavos(Math.max(0, n("valor_em_aberto") - Math.max(0, faltaTotal)));
    let aportes = centavos(n("outros_creditos"));
    (movs || []).filter(filtro || reserva).forEach((m) => {
      if (m.tipo === "compensacao") aportes = centavos(aportes - m.valor);
      (m.alocacao || []).forEach((a) => {
        if (a.destino === "integralizacao") inicial = centavos(inicial - a.valor);
        else if (a.destino === "despesa") despesa = centavos(despesa - a.valor);
        else if (a.destino === "contribuicao" && !(a.mes && mesBase && a.mes > mesBase)) { const x = meses.find((mm) => mm.mes === (a.mes || null)) || meses.find((mm) => mm.aberto > 0); if (x) x.aberto = centavos(x.aberto - a.valor); }
      });
    });
    inicial = Math.max(0, inicial); despesa = Math.max(0, despesa); aportes = Math.max(0, aportes);
    meses = meses.map((m) => ({ ...m, aberto: Math.max(0, m.aberto) })).filter((m) => m.aberto > 0.005);
    const total = centavos(inicial + despesa + meses.reduce((a, m) => a + m.aberto, 0));
    return { inicial, meses, despesa, aportes, total, maxAbater: centavos(Math.min(aportes, inicial)) };
  }

  /* Distribui um pagamento: quotas iniciais, contribuições mais antigas, chamadas de despesa */
  function alocar(valor, c) {
    let resta = centavos(valor); const itens = [];
    const usa = (destino, aberto, mes) => { if (resta <= 0 || aberto <= 0) return; const v = centavos(Math.min(resta, aberto)); itens.push(mes !== undefined ? { destino, mes, valor: v } : { destino, valor: v }); resta = centavos(resta - v); };
    usa("integralizacao", c.inicial);
    [...c.meses].sort((a, b) => String(a.mes || "9999").localeCompare(String(b.mes || "9999"))).forEach((m) => usa("contribuicao", m.aberto, m.mes));
    usa("despesa", c.despesa);
    return { itens, sobra: resta };
  }
  const descreverItem = (a) => a.destino === "integralizacao" ? "Integralização das quotas iniciais" : a.destino === "despesa" ? "Chamada de despesa" : `Contribuição mensal de ${nomeMes(a.mes)}`;

  /* Posição mostrada = última planilha + lançamentos do site confirmados que ela ainda não tem */
  function ajustada(p, movs) {
    if (!p) return p;
    const conf = (movs || []).filter((m) => m.cooperado_id === p.cooperado_id && vale(m));
    if (!conf.length) return { ...p, _ajustes: [] };
    const q = { ...p, _ajustes: conf };
    const mesBase = String(p.data_base || "").slice(0, 7);
    let integ = 0, pix = 0, comp = 0, quitou = 0;
    conf.forEach((m) => {
      if (m.tipo === "pix") pix += Number(m.valor); else comp += Number(m.valor);
      (m.alocacao || []).forEach((a) => {
        if (a.destino !== "despesa") integ += Number(a.valor);
        if (!(a.destino === "contribuicao" && a.mes && a.mes > mesBase)) quitou += Number(a.valor);
      });
    });
    q.valor_em_aberto = centavos(Math.max(0, Number(p.valor_em_aberto || 0) - quitou));
    q.capital_integralizado = centavos(Number(p.capital_integralizado || 0) + integ);
    q.contribuicoes_pagas = p.contribuicoes_pagas == null ? p.contribuicoes_pagas : centavos(Number(p.contribuicoes_pagas) + pix);
    q.outros_creditos = centavos(Math.max(0, Number(p.outros_creditos || 0) - comp));
    const det = p.detalhes || {};
    if ((det.mensal || []).length) {
      const mensal = det.mensal.map((m) => ({ ...m }));
      conf.forEach((m) => (m.alocacao || []).forEach((a) => {
        if (a.destino !== "contribuicao") return;
        const x = mensal.find((mm) => mm.mes === a.mes); if (!x) return;
        x.paga = centavos((x.paga || 0) + a.valor); x.em_aberto = centavos(Math.max(0, (x.em_aberto || 0) - a.valor));
      }));
      q.detalhes = { ...det, mensal };
      q.meses_em_atraso = mensal.filter((m) => m.em_aberto > 0.005).length;
    }
    return q;
  }

  /* Próxima contribuição mensal: o mês seguinte ao fechamento da planilha enviada pela tesouraria */
  function proxima(p, movs) {
    if (!p || !p.data_base) return null;
    const av = ((p.detalhes || {}).mensal || []).filter((x) => x.a_vencer > 0.005).sort((a, b) => a.mes.localeCompare(b.mes))[0];
    if (av) {
      let conf = 0, ag = 0;
      (movs || []).filter((x) => x.cooperado_id === p.cooperado_id && !x.incorporado_em && (x.status === "confirmado" || x.status === "aguardando")).forEach((x) =>
        (x.alocacao || []).forEach((al) => { if (al.destino === "contribuicao" && al.mes === av.mes) { if (x.status === "confirmado") conf += Number(al.valor); else ag += Number(al.valor); } }));
      const valor = centavos(Number(av.a_vencer) + Number(av.paga || 0));
      return { mes: av.mes, vence: av.vence, valor, pago: centavos(Number(av.paga || 0) + conf), aguardando: centavos(ag), resta: centavos(Math.max(0, Number(av.a_vencer) - conf - ag)) };
    }
    const [a, m] = String(p.data_base).slice(0, 7).split("-").map(Number);
    const d = new Date(Date.UTC(a, m, 1));
    const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const valor = centavos(p.contribuicao_mensal || 0);
    if (!(valor > 0)) return null;
    const naPlanilha = ((p.detalhes || {}).mensal || []).filter((x) => x.mes === mes).reduce((s, x) => s + Number(x.paga || 0), 0);
    let confirmado = 0, aguardando = 0;
    (movs || []).filter((x) => x.cooperado_id === p.cooperado_id && !x.incorporado_em && (x.status === "confirmado" || x.status === "aguardando")).forEach((x) =>
      (x.alocacao || []).forEach((al) => { if (al.destino === "contribuicao" && al.mes === mes) { if (x.status === "confirmado") confirmado += Number(al.valor); else aguardando += Number(al.valor); } }));
    const pago = centavos(naPlanilha + confirmado);
    return { mes, valor, pago, aguardando: centavos(aguardando), resta: centavos(Math.max(0, valor - pago - aguardando)) };
  }


  /* ================================================================
     Sistema financeiro (etapa 1): cálculo pelo Estatuto a partir dos
     lançamentos da tesouraria. Reproduz as abas Resumo e Posição da
     planilha: capital, contribuições mensais, chamadas de despesa e aportes.
     ================================================================ */
  const mesDe = (d) => (d ? String(d).slice(0, 7) : null);
  const somaMes = (mes, n) => { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const fimDoMes = (mes) => { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m, 0)); return d.toISOString().slice(0, 10); };
  const hojeLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const mesHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const TIPOS_PAG = {
    despesa: "Pagamento de despesa", aporte: "Aporte à cooperativa", contribuicao: "Contribuição mensal",
    integralizacao: "Integralização de quotas", abatimento: "Abatimento com aportes", chamada: "Chamada de despesa (sem despesa definida)"
  };
  const mesFechamento = (par) => (par && par.fechamento ? mesDe(par.fechamento) : mesHoje());

  /* Parâmetros do Estatuto com os valores padrão da planilha */
  const PADRAO = { quota: 50, quotas_minimas: 10, contrib_inicio: "2026-04-01", sm: 1621, horas_ref: 120, contrib_pct: 0.015, inss_pct: 0.11, inss_teto: 8475.55,
    patronal_pct: 0.2, fic_coop_pct: 0.055, fic_vol_max: 0.025, tele_pct: 0.0925, alim_pct: 0.0278, custo_op_pct: 0.2, reserva_pct: 0.1, fates_pct: 0.05,
    // Piso Júnior dos demais conselhos, em salários-mínimos (base: piso regional do RJ, proposta Ceter/RJ 2027)
    piso_cft: 2.36, piso_cra: 2.97, piso_crc: 2.97, piso_oab: 2.97, piso_outro: 2.97,
    mult_junior: 8.5, mult_pleno: 11, mult_senior: 14, mult_coord: 17.5, sobras_mercado: 0, sobras_publicas: 0, rateio_pct: 1, fti_max: 0.1, retirada_minima: 0, retirada_dia_util: 5, reserva_caixa: 0, atraso_desconto_pct: 0.1,
    // IR retido na fonte (tabela mensal 2026 e redução da Lei 15.270/2025)
    ir_f1: 2428.80, ir_f2: 2826.65, ir_f3: 3751.05, ir_f4: 4664.68, ir_d1: 182.16, ir_d2: 394.16, ir_d3: 675.49, ir_d4: 908.73,
    ir_dep: 189.59, ir_simpl: 607.20, ir_red_lim1: 5000, ir_red_max1: 312.89, ir_red_lim2: 7350, ir_red_a: 978.62, ir_red_b: 0.133145 };
  /* Valores que mudam todo ano e valem a partir de um mês (não reescrevem o passado) */
  const VIG_KEYS = ["sm", "quota", "horas_ref", "mult_junior", "mult_pleno", "mult_senior", "mult_coord", "piso_cft", "piso_cra", "piso_crc", "piso_oab", "piso_outro", "contrib_pct", "inss_pct", "inss_teto", "patronal_pct",
    "fic_coop_pct", "fic_vol_max", "tele_pct", "alim_pct", "ir_f1", "ir_f2", "ir_f3", "ir_f4", "ir_d1", "ir_d2", "ir_d3", "ir_d4", "ir_dep", "ir_simpl", "ir_red_lim1", "ir_red_max1", "ir_red_lim2", "ir_red_a", "ir_red_b"];
  function parametrosDoMes(base, m) {
    const vs = (base.vigencias || []).filter((v) => mesDe(v.vigencia) <= m).sort((a, b) => String(b.vigencia).localeCompare(String(a.vigencia)));
    if (!vs.length) return base.parametros || {};
    // valor anual sem registro na vigência usa o padrão do Estatuto, nunca o valor mais novo
    const o = { ...(base.parametros || {}) }; VIG_KEYS.forEach((k) => { o[k] = vs[0].dados && vs[0].dados[k] != null ? vs[0].dados[k] : PADRAO[k]; });
    return o;
  }
  /* IR do mês sobre o total de retiradas do mês (alíquotas 7,5/15/22,5/27,5%) */
  function irDetalhe(bruto, inss, dependentes, par) {
    const p = params(par || {});
    const faixa = (b) => b <= p.ir_f1 ? [0, 0] : b <= p.ir_f2 ? [0.075, p.ir_d1] : b <= p.ir_f3 ? [0.15, p.ir_d2] : b <= p.ir_f4 ? [0.225, p.ir_d3] : [0.275, p.ir_d4];
    const tab = (b) => { const [a, d] = faixa(b); return Math.max(0, b * a - d); };
    const dep = (Number(dependentes) || 0) * p.ir_dep;
    const baseLegal = Math.max(0, bruto - inss - dep), baseSimpl = Math.max(0, bruto - p.ir_simpl);
    const simplificado = tab(baseSimpl) < tab(baseLegal);
    const base = simplificado ? baseSimpl : baseLegal;
    const [aliquota, parcela] = faixa(base);
    const imposto = tab(base);
    const reducao = !(bruto > 0) ? 0 : bruto <= p.ir_red_lim1 ? Math.min(imposto, p.ir_red_max1) : bruto <= p.ir_red_lim2 ? Math.min(imposto, Math.max(0, p.ir_red_a - p.ir_red_b * bruto)) : 0;
    return { bruto, inss, dependentes: Number(dependentes) || 0, deducao_dependentes: dep, simplificado, desconto_simplificado: p.ir_simpl,
      base: centavos(base), aliquota, parcela, imposto: centavos(imposto), reducao: centavos(reducao), ir: centavos(Math.max(0, imposto - reducao)) };
  }
  function irMensal(bruto, inss, dependentes, par) { return bruto > 0 ? irDetalhe(bruto, inss, dependentes, par).ir : 0; }
  const CATEGORIAS_SAL = [["Júnior", "mult_junior", "Até 5 anos"], ["Pleno", "mult_pleno", "6 a 10 anos"], ["Sênior", "mult_senior", "Acima de 10 anos"], ["Coordenador", "mult_coord", "Acima de 10 anos, com designação do Conselho"]];
  const CONSELHOS = ["CREA", "CAU", "CFT", "CRA", "OAB", "CRC", "Outro", "Nenhum"];
  const params = (par) => { const o = { ...PADRAO }; Object.keys(PADRAO).forEach((k) => { if (par && par[k] != null && par[k] !== "") o[k] = typeof PADRAO[k] === "number" ? Number(par[k]) : par[k]; }); return o; };
  /* Tabela salarial (art. 8º, II): o piso do conselho é a base do Júnior; as demais categorias aplicam
     os multiplicadores (Pleno = Júnior × 11 ÷ 8,5 etc.). CREA/CAU: 8,5 SM (Lei 4.950-A). Demais: piso em SM. */
  const PISO_CONSELHO = { CREA: null, CAU: null, CFT: "piso_cft", CRA: "piso_cra", CRC: "piso_crc", OAB: "piso_oab", Outro: "piso_outro", Nenhum: "piso_outro" };
  function pisoJunior(conselho, p) { const k = PISO_CONSELHO[conselho]; return (k ? p[k] : p.mult_junior) * p.sm; }
  function tabelaSalarial(par, conselho) {
    const p = params(par);
    const base = pisoJunior(conselho || "CREA", p);
    return CATEGORIAS_SAL.map(([cat, k, exp]) => {
      const mensal = base * p[k] / p.mult_junior;
      return { categoria: cat, experiencia: exp, multiplicador: p[k], mensal, hora: mensal / p.horas_ref,
        crea_mensal: p[k] * p.sm, crea_hora: p[k] * p.sm / p.horas_ref };
    });
  }
  function valorHoraDe(categoria, conselho, par) {
    if (!categoria) return 0;
    const t = tabelaSalarial(par, conselho || "Outro").find((x) => x.categoria === categoria); return t ? t.hora : 0;
  }

  /* ================================================================
     Enquadramento automático (art. 8º, IV e V do Estatuto)
     - Conta só a experiência comprovada e validada na função ligada à
       formação usada na cooperativa (períodos sobrepostos contam uma vez).
     - Nível técnico: conta a prática anterior ao diploma (parâmetro).
       Nível superior: conta só a partir do diploma/registro (parâmetro).
     - Até 5 anos completos: Júnior; 6 a 10: Pleno; 11 ou mais: Sênior (teto).
     - Coordenador só com designação formal do Conselho e mais de 10 anos.
     - A progressão é automática, mês a mês.
     ================================================================ */
  const DIA = 86400000;
  const diaUTC = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(a, m - 1, d || 1); };
  const isoDe = (ms) => new Date(ms).toISOString().slice(0, 10);
  const NIVEIS = { tecnico: "Técnico", superior: "Superior (graduação)", outro: "Outro" };
  function habilitacaoUsada(c, habs) {
    const aprov = (habs || []).filter((h) => h.fin_cooperado_id === c.id && h.status === "aprovada");
    const escolhida = aprov.find((h) => h.id === c.habilitacao_remuneracao);
    if (escolhida) return { hab: escolhida, definida: true };
    if (aprov.length === 1) return { hab: aprov[0], definida: true };
    return { hab: null, definida: false, opcoes: aprov };
  }
  function diasDeExperiencia(c, hab, exps, ateISO, par) {
    if (!hab) return { dias: 0, continua: false, intervalos: [] };
    const p = { exp_tecnico_antes: true, exp_superior_antes: false, ...(par || {}) };
    const antesConta = hab.nivel === "tecnico" ? p.exp_tecnico_antes !== false : p.exp_superior_antes === true;
    const piso = !antesConta && hab.data_habilitacao ? diaUTC(hab.data_habilitacao) : -Infinity;
    const teto = diaUTC(ateISO) + DIA;
    const ints = (exps || []).filter((e) => e.fin_cooperado_id === c.id && e.status === "aprovada" && e.habilitacao_id === hab.id && e.inicio)
      .map((e) => [Math.max(diaUTC(e.inicio), piso), Math.min(e.fim ? diaUTC(e.fim) + DIA : Infinity, teto), !e.fim])
      .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let dias = 0, cur = null, continua = false;
    const uniao = [];
    ints.forEach(([a, b, aberto]) => { if (aberto) continua = true; if (!cur || a > cur[1]) { if (cur) { dias += (cur[1] - cur[0]) / DIA; uniao.push(cur); } cur = [a, b]; } else cur[1] = Math.max(cur[1], b); });
    if (cur) { dias += (cur[1] - cur[0]) / DIA; uniao.push(cur); }
    return { dias, continua, intervalos: uniao };
  }
  /* ---------- Experiência interna (na BIMCORE), contada sozinha pelas horas ----------
     Mês de referência = dias úteis do mês × jornada (6 h, art. 8º, I). Dias úteis tiram sábados,
     domingos, feriados nacionais (fixos e móveis), os feriados estaduais/municipais configurados e,
     se marcado, os pontos facultativos de Carnaval e Corpus Christi. Cada mês vale no máximo 1
     "mês de experiência"; 11 meses completos = 1 ano (o 12º é o recesso de férias, art. 79). */
  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(ano, mes - 1, dia);
  }
  const FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
  function feriadosDoAno(ano, par) {
    const p = { feriados_extras: "20/01, 06/02, 23/04", facultativos_folga: true, ...(par || {}) };
    const set = new Map();
    const add = (ms, nome) => set.set(isoDe(ms), nome);
    FIXOS.forEach((md) => add(Date.UTC(ano, Number(md.slice(0, 2)) - 1, Number(md.slice(3))), "Feriado nacional"));
    const P = pascoa(ano);
    add(P - 2 * DIA, "Sexta-feira Santa");
    if (p.facultativos_folga !== false) { add(P - 48 * DIA, "Carnaval"); add(P - 47 * DIA, "Carnaval"); add(P + 60 * DIA, "Corpus Christi"); }
    String(p.feriados_extras || "").split(/[,;\s]+/).filter(Boolean).forEach((t) => { const [d, m] = t.split("/").map(Number); if (d && m) add(Date.UTC(ano, m - 1, d), "Feriado estadual/municipal"); });
    return set;
  }
  function diasUteis(mes, par) {
    const [a, m] = mes.split("-").map(Number); const fer = feriadosDoAno(a, par);
    let n = 0; for (let d = Date.UTC(a, m - 1, 1); new Date(d).getUTCMonth() === m - 1; d += DIA) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6 && !fer.has(isoDe(d))) n++; }
    return n;
  }
  function experienciaInterna(c, hab, base, ateMes, cobertura) {
    const par = base.parametros || {};
    const horasDia = Number(par.horas_dia || 6), mesesAno = Number(par.meses_ano || 11);
    const adm = mesDe(c.data_admissao);
    const p = { exp_tecnico_antes: true, exp_superior_antes: false, ...par };
    const antesConta = !hab || (hab.nivel === "tecnico" ? p.exp_tecnico_antes !== false : p.exp_superior_antes === true);
    const piso = !antesConta && hab.data_habilitacao ? mesDe(hab.data_habilitacao) : null;
    const meses = (base.internas || []).filter((x) => x.fin_cooperado_id === c.id && Number(x.horas) > 0)
      .map((x) => ({ mes: mesDe(x.mes), horas: Number(x.horas) }))
      .filter((x) => (!adm || x.mes >= adm) && (!ateMes || x.mes <= ateMes) && (!piso || x.mes >= piso)).sort((a, b) => a.mes.localeCompare(b.mes));
    const porAno = {};
    const linhas = meses.map((x) => {
      const du = diasUteis(x.mes, par), ref = du * horasDia;
      let credito = ref > 0 ? Math.min(1, x.horas / ref) : 0;
      const cob = cobertura ? cobertura(x.mes) : 0;
      const creditoValido = credito * (1 - cob);
      const ano = x.mes.slice(0, 4); porAno[ano] = (porAno[ano] || 0) + creditoValido;
      return { mes: x.mes, horas: x.horas, dias_uteis: du, referencia: ref, credito, coberto_externo: cob, credito_valido: creditoValido };
    });
    const mesesCreditados = Object.values(porAno).reduce((t, v) => t + Math.min(mesesAno, v), 0);
    return { linhas, meses: mesesCreditados, dias: mesesCreditados * 365.25 / mesesAno, recente: meses.length && meses[meses.length - 1].mes >= somaMes(mesHoje(), -1) };
  }

  const categoriaPorAnos = (anos) => (anos <= 5 ? "Júnior" : anos <= 10 ? "Pleno" : "Sênior");
  function enquadramento(c, base, mes) {
    const par = base.parametros || {};
    const ref = mes ? fimDoMes(mes) : isoDe(Date.now());
    const avisos = [];
    const { hab, definida, opcoes } = habilitacaoUsada(c, base.habilitacoes);
    if (!hab) {
      const varias = opcoes && opcoes.length > 1;
      const motivo = varias ? "Há mais de uma formação validada: defina em Cadastro → Experiência qual é usada na cooperativa." : "Sem formação validada: o cooperado precisa enviar diploma e experiências em Minha experiência.";
      if (c.categoria) return { categoria: c.categoria, conselho: c.conselho, anos: null, origem: "manual", habilitacao: null, avisos: [motivo + " Até lá vale a categoria informada manualmente."] };
      return { categoria: null, conselho: c.conselho, anos: 0, origem: "nenhum", habilitacao: null, avisos: [motivo] };
    }
    const ext = diasDeExperiencia(c, hab, base.experiencias, ref, par);
    const intervalos = ext.intervalos || [];
    const cobertura = (m) => { const [a, mm] = m.split("-").map(Number); const ini = Date.UTC(a, mm - 1, 1), fim = Date.UTC(a, mm, 1); let cob = 0; intervalos.forEach(([x, y]) => { cob += Math.max(0, Math.min(y, fim) - Math.max(x, ini)); }); return Math.min(1, cob / (fim - ini)); };
    const interna = experienciaInterna(c, hab, base, mes || mesHoje(), cobertura);
    const dias = ext.dias + interna.dias, continua = ext.continua || interna.recente;
    const anosExatos = dias / 365.25, anos = Math.floor(anosExatos + 1e-9);
    let categoria = categoriaPorAnos(anos);
    if (c.coordenador_designado) {
      const desde = c.coordenador_desde ? mesDe(c.coordenador_desde) : null;
      if (!desde || !mes || desde <= mes) {
        if (anos >= 11) categoria = "Coordenador";
        else avisos.push(`Designado coordenador, mas tem ${anos} ano(s) comprovados nesta formação: o Estatuto exige mais de 10. Fica como ${categoria}.`);
      }
    }
    let proxima = null;
    if (continua && categoria !== "Coordenador") {
      const alvo = anos <= 5 ? 6 : anos <= 10 ? 11 : null;
      if (alvo) proxima = { categoria: categoriaPorAnos(alvo), data: isoDe(diaUTC(ref) + DIA + Math.ceil(alvo * 365.25 - dias) * DIA) };
    }
    if (!definida) avisos.push("Defina a formação usada na cooperativa.");
    return { categoria, conselho: hab.conselho, anos, anos_exatos: anosExatos, origem: "automatico", habilitacao: hab, proxima, avisos, anos_externos: ext.dias / 365.25, interna };
  }
  /* Sinal para o cooperado: vermelho = nada enviado; amarelo = algo em exigência; nada = em dia ou só aguardando análise */
  function sinalExperiencia(d) {
    const habs = d.habilitacoes || [], exps = d.experiencias || [];
    const exig = habs.concat(exps).filter((x) => x.status === "recusada");
    if (exig.length) return { cor: "warn", texto: `${exig.length} registro(s) em exigência: veja o que falta e envie o documento`, exigencias: exig };
    if (!habs.length || !exps.length) return { cor: "err", texto: !habs.length ? "Envie sua formação e suas experiências" : "Envie suas experiências" };
    return null;
  }
  function valorHora(c, par, base, mes) {
    if (base && (base.habilitacoes || []).length) { const e = enquadramento(c, base, mes); return valorHoraDe(e.categoria, e.conselho, par); }
    return valorHoraDe(c.categoria, c.conselho, par);
  }
  const horasTotais = (base) => base.horas_total != null ? Number(base.horas_total) :
    (base.folha || []).reduce((t, f) => t + Number(f.horas_produtivas || 0) + Number(f.horas_formacao || 0), 0);

  function calcularCooperado(c, base) {
    const par = params(base.parametros || {});
    const quota = par.quota;
    const inicio = mesDe(par.contrib_inicio);
    const fech = mesFechamento(base.parametros || {});
    const desp = {}; (base.despesas || []).forEach((d) => { desp[d.id] = d; });
    const pags = (base.pagamentos || []).filter((p) => p.fin_cooperado_id === c.id);
    const folha = {}; (base.folha || []).filter((f) => f.fin_cooperado_id === c.id).forEach((f) => { folha[mesDe(f.mes)] = f; });
    const adm = mesDe(c.data_admissao), sai = mesDe(c.data_desligamento);
    const ativo = (m) => !!adm && adm <= m && (!sai || sai >= m);
    const partes = (base.despesas || []).filter((d) => d.cobrar && (d.participantes || []).includes(c.id))
      .map((d) => ({ mes: mesDe(d.data), valor: d.n_participantes ? centavos(Number(d.valor) / d.n_participantes) : centavos(Number(d.valor) / (d.participantes || []).length) }));
    const cobrada = (p) => (p.tipo === "despesa" && p.despesa_id && desp[p.despesa_id] && desp[p.despesa_id].cobrar) || p.tipo === "chamada";
    const ehAporte = (p) => p.tipo === "aporte" || (p.tipo === "despesa" && !(p.despesa_id && desp[p.despesa_id] && desp[p.despesa_id].cobrar));
    const soma = (arr, f) => centavos(arr.reduce((t, x) => t + Number(f ? f(x) : x.valor), 0));
    const somaBruta = (arr, f) => arr.reduce((t, x) => t + Number(f(x)), 0);
    const parMes = {};
    const parDe = (m) => parMes[m] || (parMes[m] = params(parametrosDoMes(base, m)));
    const vhMes = {};
    const vhDe = (m) => (vhMes[m] !== undefined ? vhMes[m] : (vhMes[m] = valorHora(c, parametrosDoMes(base, m), base, m)));
    // Horas lançadas por mês geram crédito de trabalho; a retirada só existe quando a tesouraria paga
    const hmes = {}; (base.horas_mes || []).filter((h) => h.fin_cooperado_id === c.id).forEach((h) => { hmes[mesDe(h.mes)] = h; });
    const rets = (base.retiradas || []).filter((r) => r.fin_cooperado_id === c.id);
    const pagasDe = (m) => rets.filter((r) => r.status === "paga" && r.pago_em && mesDe(r.pago_em) === m);
    // usa o desconto que a tesouraria registrou; se faltar, calcula
    const gravado = (m, k, calc) => { const ps = pagasDe(m); return ps.length && ps.every((r) => r[k] != null) ? ps.reduce((t, r) => t + Number(r[k]), 0) : calc; };
    const retPaga = {}; rets.filter((r) => r.status === "paga" && r.pago_em).forEach((r) => { const m = mesDe(r.pago_em); retPaga[m] = (retPaga[m] || 0) + Number(r.valor); });
    const retiradaDe = (m) => retPaga[m] || 0;
    /* Contribuição mensal (Estatuto, art. 23, §4º): a cota do mês M vence no dia seguinte ao último dia
       de pagamento das retiradas (Nº dia útil do mês M+1). Até lá o site espera: se a retirada pedida em M
       for paga até o vencimento, vale 1,5% dela; se o cooperado pagar a cota por Pix, vale o Pix; senão,
       a cota entra no valor em aberto. */
    const hojeIso = hojeLocal();
    const vencDe = (m) => { const pz = prazoRetirada(m + "-15", parametrosDoMes(base, m)); const d = new Date(Date.UTC(+pz.slice(0, 4), +pz.slice(5, 7) - 1, +pz.slice(8, 10) + 1)); return isoDe(d.getTime()); };
    const compDe = (r) => { const ms = mesDe(String(r.solicitado_em || r.pago_em)); return r.pago_em && String(r.pago_em) <= vencDe(ms) ? ms : mesDe(r.pago_em); };
    const contribComp = {}, quitadoMes = {};
    rets.filter((r) => r.status === "paga" && r.pago_em).forEach((r) => {
      const m = compDe(r); const P0 = params(parametrosDoMes(base, m));
      contribComp[m] = (contribComp[m] || 0) + (r.contribuicao != null ? Number(r.contribuicao) : Number(r.valor) * P0.contrib_pct);
      const mp = mesDe(r.pago_em); quitadoMes[mp] = (quitadoMes[mp] || 0) + Number(r.quitar_valor || 0);
    });
    const horasDe = (m) => {
      const h = hmes[m] || {};
      const hp = Number(h.produtivas || 0), hf = Number(h.formacao || 0), ha = Number(h.administrativas || 0);
      const hfc = Math.min(hf, (hp + ha) * PADRAO.fti_max / (1 - PADRAO.fti_max)); // formação: até 10% das horas (Regimento, art. 91)
      return { hp, hf, hfc, ha, dias: Number(h.dias || 0) };
    };

    const mesesSet = new Set();
    for (let m = inicio; m <= fech; m = somaMes(m, 1)) mesesSet.add(m);
    Object.keys(hmes).forEach((m) => { if (ativo(m)) mesesSet.add(m); });
    Object.keys(retPaga).forEach((m) => { mesesSet.add(m); mesesSet.add(somaMes(m, 1)); });
    Object.keys(contribComp).forEach((m) => mesesSet.add(m));
    pags.forEach((p) => { if (p.tipo === "contribuicao" && p.mes_ref) mesesSet.add(mesDe(p.mes_ref)); if (cobrada(p) && p.data) mesesSet.add(mesDe(p.data)); });
    partes.forEach((x) => { if (x.mes) mesesSet.add(x.mes); });
    const meses = [...mesesSet].sort();
    const mensal = meses.map((m) => {
      const f = folha[m] || {};
      const { hp, hf, hfc, ha, dias } = horasDe(m);
      const vh = vhDe(m);
      const cred = ativo(m) ? (hp + hfc + ha) * vh : 0;
      const ret = retiradaDe(m);
      const P = parDe(m);
      const inss = gravado(m, "inss", Math.min(ret, P.inss_teto) * P.inss_pct);
      const ir = gravado(m, "ir", irMensal(ret, inss, c.dependentes_ir, P));
      const pagaDireto = somaBruta(pags.filter((p) => p.tipo === "contribuicao" && mesDe(p.mes_ref) === m), (p) => p.valor);
      const cRet = contribComp[m] || 0;
      const conta = ativo(m) && m >= inicio && m <= fech;
      const vence = conta ? vencDe(m) : null;
      const aVencer = conta && !(cRet > 0) && hojeIso <= vence;
      const devida = !conta ? 0 : cRet > 0 ? cRet + pagaDireto : aVencer ? Math.min(P.quota, pagaDireto) : P.quota;
      const descontada = conta ? cRet : 0;
      const paga = descontada + pagaDireto;
      const contribPagaNoMes = ret > 0 ? gravado(m, "contribuicao", ret * P.contrib_pct) : 0;
      const quitado = quitadoMes[m] || 0;
      const ficCoop = retiradaDe(somaMes(m, -1)) * P.fic_coop_pct;
      const ficV = gravado(m, "fic_vol", ret * Math.min(Number(c.fic_voluntario || 0), P.fic_vol_max));
      const p13 = ret / 12, pfer = ret / 12;
      const d13 = Number(f.decimo_pago || 0), dfer = Number(f.ferias_pago || 0);
      const tele = ativo(m) && c.teletrabalho && hp + hf + ha > 0 ? P.tele_pct * P.sm : 0;
      const alim = ativo(m) ? dias * P.alim_pct * P.sm : 0;
      const v = somaBruta(partes.filter((x) => x.mes === m), (x) => x.valor);
      const w = somaBruta(pags.filter((p) => cobrada(p) && mesDe(p.data) === m), (p) => p.valor);
      const liquido = ret - inss - ir - contribPagaNoMes - ficV - quitado;
      return { mes: m, valor_hora: vh, horas_produtivas: hp, horas_formacao: hf, horas_formacao_credito: hfc, horas_admin: ha, credito: centavos(cred), credito_admin: centavos(ativo(m) ? ha * vh : 0), dias, retirada: centavos(ret), inss: centavos(inss), ir: centavos(ir), devida: centavos(devida), descontada: centavos(descontada),
        paga: centavos(paga), fic_coop: centavos(ficCoop), fic_vol: centavos(ficV), prov_13: centavos(p13), prov_ferias: centavos(pfer), decimo_pago: d13, ferias_pago: dfer,
        aux_tele: centavos(tele), aux_alim: centavos(alim), liquido: centavos(liquido), em_aberto: centavos(devida - paga + Math.max(0, v - w)),
        vence, a_vencer: aVencer ? centavos(Math.max(0, P.quota - pagaDireto)) : 0, atrasadas_quitadas: centavos(quitado), contrib_paga_no_mes: centavos(contribPagaNoMes),
        _cred: cred, _ret: ret, _inss: inss, _dev: devida, _paga: paga, _fic: ficCoop + ficV, _p13: p13, _pf: pfer };
    });
    const H = centavos(somaBruta(mensal, (x) => x._dev));
    const I = centavos(somaBruta(mensal, (x) => x._paga));
    const J = soma(partes);
    const K = soma(pags.filter(cobrada));
    const AB = centavos(soma(pags.filter(ehAporte)) + Math.max(0, K - J));
    const pixInteg = soma(pags.filter((p) => p.tipo === "integralizacao"));
    const comp = soma(pags.filter((p) => p.tipo === "abatimento"));
    const qi = Number(c.quotas_iniciais || 0), L0 = Number(c.integralizado_admissao || 0);
    const AC = centavos(Math.min(AB, Math.max(0, qi * quota - L0 - pixInteg), (c.compensar_aportes ? AB : 0) + comp));
    const E = centavos(qi * quota + H);
    const F = centavos(L0 + I + AC + pixInteg);
    const G = centavos(E - F);
    const AE = centavos(somaBruta(mensal.filter((x) => x.mes > fech), (x) => x._paga));
    const L = centavos(Math.max(0, G + AE) + Math.max(0, J - K));
    const T = centavos(AB - AC);
    const U = centavos(F + K + T - Math.max(0, K - J));
    const AD = centavos(Math.max(0, qi * quota - L0 - pixInteg - AC));
    const fic = centavos(somaBruta(mensal, (x) => x._fic) + Number(c.fic_rendimentos || 0) - Number(c.fic_resgates || 0));
    const f13 = centavos(somaBruta(mensal, (x) => x._p13 - x.decimo_pago));
    const ffer = centavos(somaBruta(mensal, (x) => x._pf - x.ferias_pago));
    const horas = somaBruta(mensal, (x) => x.horas_produtivas + x.horas_formacao);
    /* Sobras e aposentadoria: cotas gravadas quando a apuração do exercício é lançada (RI 116 e 121) */
    const cotasS = (base.sobras_cotas || []).filter((x) => x.fin_cooperado_id === c.id);
    const sobras = centavos(somaBruta(cotasS.filter((x) => !x.pago_em), (x) => Number(x.rateio || 0)));
    const fapos = centavos(somaBruta(cotasS, (x) => Number(x.aposentadoria || 0)));
    const retFech = retiradaDe(fech);
    const aportes = pags.filter((p) => ehAporte(p) || cobrada(p)).map((p) => ({
      data: p.data, valor: Number(p.valor), tipo: cobrada(p) ? "Pagamento da sua parte" : "Aporte à cooperativa",
      descricao: (p.despesa_id && desp[p.despesa_id] ? desp[p.despesa_id].descricao : "") || p.observacao || TIPOS_PAG[p.tipo]
    })).sort((a, b) => String(a.data || "9").localeCompare(String(b.data || "9")));
    const creditoTotal = centavos(somaBruta(mensal, (x) => x._cred));
    const retirado = centavos(somaBruta(rets.filter((r) => r.status === "paga"), (r) => r.valor));
    const solicitado = centavos(somaBruta(rets.filter((r) => r.status === "solicitada"), (r) => r.valor));
    mensal.forEach((x) => ['_cred', '_ret', '_inss', '_dev', '_paga', '_fic', '_p13', '_pf'].forEach((k) => { const v = x[k]; delete x[k]; Object.defineProperty(x, k, { value: v, enumerable: false }); }));
    return {
      id: c.id, fin_cooperado_id: c.id, cooperado_id: c.perfil_id || null, cooperado_nome: c.nome, email: c.email || "",
      data_base: fimDoMes(fech), criado_em: new Date().toISOString(), valor_hora: vhDe(fech), enquadramento: enquadramento(c, base, fech),
      quotas_subscritas: centavos(E / quota), capital_subscrito: E, capital_integralizado: F, contribuicoes_pagas: U,
      contribuicao_mensal: quota, /* nos meses com retirada paga, a contribuição é 1,5% descontada dela */ valor_em_aberto: L, meses_em_atraso: mensal.filter((x) => x.em_aberto > 0.005).length,
      fic_saldo: fic, fundo_13: f13, fundo_ferias: ffer, sobras_a_receber: sobras, fundo_aposentadoria: fapos, sobras_cotas: cotasS, outros_creditos: T,
      credito: { gerado: creditoTotal, retirado, solicitado, saldo: centavos(Math.max(0, creditoTotal - retirado - solicitado)), retiradas: rets },
      observacao: T > 0 ? "Outros créditos = aportes que você adiantou à cooperativa. Não são sacáveis a qualquer momento: só são devolvidos no desligamento, após aprovação do balanço (art. 19)." : null,
      detalhes: { mensal, aportes, resumo: { contribuicoes_devidas: H, contribuicoes_pagas_mensais: I, falta_integralizar: G, aportes_brutos: AB, aportes_no_capital: AC, falta_inicial: AD, adiantado: AE,
        retiradas_ano: centavos(somaBruta(mensal, (x) => x.retirada)), horas: horas, chamadas: J, chamadas_pagas: K } }
    };
  }
  /* Retirada mínima: com 0 em Configurações, é automática = 1 quota-parte ÷ 1,5%, arredondado para cima
     (assim o desconto de capital de uma retirada nunca fica abaixo da quota; Estatuto, art. 23, §4º) */
  function retiradaMinima(par) {
    const p = params(par || {});
    if (p.retirada_minima > 0) return { valor: p.retirada_minima, auto: false };
    return { valor: p.contrib_pct > 0 ? Math.ceil(p.quota / p.contrib_pct - 1e-9) : 0, auto: true };
  }
  /* Prazo da retirada: N-ésimo dia útil do mês seguinte ao pedido */
  function prazoRetirada(dataPedido, par) {
    const p = params(par || {}); const n = Math.max(1, Number(p.retirada_dia_util || 5));
    const m = somaMes(mesDe(dataPedido), 1); const [a, mm] = m.split("-").map(Number); const fer = feriadosDoAno(a, par);
    let k = 0; for (let d = Date.UTC(a, mm - 1, 1); new Date(d).getUTCMonth() === mm - 1; d += DIA) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6 && !fer.has(isoDe(d)) && ++k === n) return isoDe(d); }
    return m + "-28";
  }
  /* O que sai do bruto de uma retirada (estimativa; a tesouraria confirma ao pagar) */
  /* Cotas mensais atrasadas (mais antigas primeiro) e o mínimo a quitar numa retirada: as que couberem em X% do líquido */
  function atrasadas(p, movs) { return componentes(p, movs).meses.filter((m) => m.mes && m.aberto > 0.005).sort((a, b) => a.mes.localeCompare(b.mes)); }
  function minimoQuitar(lista, liquido, pct) { let t = 0, k = 0; for (const m of lista) { if (t + m.aberto > liquido * pct + 0.005) break; t += m.aberto; k++; } return k; }
  function descontosRetirada(c, base, valor, mesPag, quitar) {
    const par = params(parametrosDoMes(base, mesPag));
    const pagas = (base.retiradas || []).filter((r) => r.fin_cooperado_id === c.id && r.status === "paga" && r.pago_em && mesDe(r.pago_em) === mesPag);
    const ja = pagas.reduce((t, r) => t + Number(r.valor), 0);
    const inssJa = Math.min(ja, par.inss_teto) * par.inss_pct, inssTot = Math.min(ja + valor, par.inss_teto) * par.inss_pct;
    const inss = centavos(inssTot - inssJa);
    // IR é mensal: calcula sobre o total do mês e tira o que já foi retido nas outras retiradas do mês
    const irJa = pagas.reduce((t, r) => t + Number(r.ir || 0), 0);
    const ir = centavos(Math.max(0, irMensal(ja + valor, inssTot, c.dependentes_ir, par) - irJa));
    const contribuicao = centavos(valor * par.contrib_pct);
    const fic_vol = centavos(valor * Math.min(Number(c.fic_voluntario || 0), par.fic_vol_max));
    const q = centavos(quitar || 0);
    return { valor: centavos(valor), inss, ir, contribuicao, fic_vol, quitar: q, liquido_antes: centavos(valor - inss - ir - contribuicao - fic_vol), liquido: centavos(valor - inss - ir - contribuicao - fic_vol - q) };
  }
  /* Caixa livre para retiradas = saldo informado − reserva − pedidos em aberto − retiradas pagas depois do saldo,
     contando os 20% de INSS patronal que a cooperativa paga sobre cada retirada */
  function caixaLivre(cx) {
    if (!cx || cx.saldo == null) return { informado: false, livre: 0, maxRetirada: 0 };
    const pat = 1 + Number(cx.patronal_pct != null ? cx.patronal_pct : PADRAO.patronal_pct);
    const livre = Number(cx.saldo) - Number(cx.reserva || 0) - (Number(cx.pedidos || 0) + Number(cx.pagas_depois || 0)) * pat;
    return { informado: true, data: cx.data, saldo: Number(cx.saldo), livre: centavos(livre), maxRetirada: Math.max(0, Math.floor(livre / pat * 100) / 100) };
  }
  /* Parte de administração do crédito de um cooperado (horas administrativas são pagas com os 20%, art. 23, §7º):
     a proporção entre crédito de administração e crédito total, aplicada ao que ainda não foi retirado */
  function creditoAdmin(p) {
    const cr = (p && p.credito) || {}; const mens = ((p && p.detalhes) || {}).mensal || [];
    const adm = mens.reduce((t, x) => t + Number(x.credito_admin || 0), 0), ger = Number(cr.gerado || 0);
    const share = ger > 0 ? Math.min(1, adm / ger) : 0;
    return { gerado: centavos(adm), share, pendente: centavos(Number(cr.saldo || 0) * share), usado: centavos(adm - Number(cr.saldo || 0) * share) };
  }
  /* Quanto um cooperado pode pedir: a parte de produção sai do livre da conta movimento; a parte de administração,
     da reserva dos 20% para a administração (na proporção em que os 20% recebidos cobrem os créditos de administração) */
  function maxRetiradaCooperado(p, cxl, cobertura) {
    const cr = (p && p.credito) || {}; const a = creditoAdmin(p);
    const prod = Math.min(Number(cr.saldo || 0) - a.pendente, cxl ? cxl.maxRetirada : 0);
    const adm = a.pendente * (cobertura == null ? 1 : Math.max(0, Math.min(1, Number(cobertura))));
    return Math.max(0, Math.floor((Math.max(0, prod) + adm) * 100) / 100);
  }
  function calcular(base) {
    const out = {};
    (base.cooperados || []).forEach((c) => { out[c.id] = calcularCooperado(c, base); });
    return out;
  }
  /* Visão da cooperativa por mês (aba Cooperativa da planilha) */
  function cooperativa(base, calc) {
    const par = params(base.parametros || {});
    const rec = {}; (base.receitas || []).forEach((r) => { rec[mesDe(r.mes)] = Number(r.receita_bruta || 0); });
    /* parcelas de contratos recebidas entram sozinhas na receita do mês (a receita manual fica para o que não é de contrato cadastrado) */
    const recC = {}; (base.parcelas || []).filter((x) => x.recebido_em).forEach((x) => { const m = mesDe(x.recebido_em); recC[m] = (recC[m] || 0) + Number(x.valor_recebido != null ? x.valor_recebido : x.valor); });
    Object.keys(recC).forEach((m) => { rec[m] = centavos((rec[m] || 0) + recC[m]); });
    const meses = new Set(Object.keys(rec));
    Object.values(calc).forEach((p) => p.detalhes.mensal.forEach((x) => meses.add(x.mes)));
    const linhas = [...meses].sort().map((m) => {
      const xs = Object.values(calc).map((p) => p.detalhes.mensal.find((x) => x.mes === m)).filter(Boolean);
      const s = (k) => centavos(xs.reduce((t, x) => t + Number(x[k] || 0), 0));
      const sb = (k) => xs.reduce((t, x) => t + Number(x[k] || 0), 0);
      const receita = rec[m] || 0, ret = xs.some((x) => x._ret !== undefined) ? centavos(sb("_ret")) : s("retirada");
      const admin = centavos(sb("credito_admin") * (1 + par.patronal_pct));
      return { mes: m, receita, custo_op: centavos(receita * par.custo_op_pct), admin_cog: admin, saldo_cog: centavos(receita * par.custo_op_pct - admin), retiradas: ret, inss_retido: s("inss"), inss_patronal: centavos((xs.some((x) => x._ret !== undefined) ? sb("_ret") : ret) * par.patronal_pct),
        fic_coop: s("fic_coop"), provisoes: centavos(xs.some((x) => x._p13 !== undefined) ? sb("_p13") + sb("_pf") : s("prov_13") + s("prov_ferias")), auxilios: centavos(s("aux_tele") + s("aux_alim")), contribuicoes: s("paga"), liquido: s("liquido") };
    });
    return { linhas };
  }

  /* ---------- Pix: BR Code estático ---------- */
  const campo = (id, v) => id + String(v.length).padStart(2, "0") + v;
  function crc16(s) {
    let crc = 0xffff;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  function pixCopiaECola(valor, txid) {
    const id = String(txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
    const corpo = campo("00", "01") + campo("26", campo("00", "br.gov.bcb.pix") + campo("01", PIX.chave)) +
      campo("52", "0000") + campo("53", "986") + (valor ? campo("54", centavos(valor).toFixed(2)) : "") +
      campo("58", "BR") + campo("59", PIX.nome) + campo("60", PIX.cidade) + campo("62", campo("05", id)) + "6304";
    return corpo + crc16(corpo);
  }

  /* ---------- carregamento sob demanda das bibliotecas ---------- */
  const carregados = {};
  function carregar(src) {
    if (!carregados[src]) carregados[src] = new Promise((ok, erro) => {
      const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => erro(new Error("Não foi possível carregar um componente da página. Verifique a conexão e tente de novo."));
      document.head.appendChild(s);
    });
    return carregados[src];
  }
  async function qrSvg(texto) {
    await carregar("assets/vendor/qrcode-generator-1.4.4.js");
    const q = window.qrcode(0, "M"); q.addData(texto); q.make();
    return q.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
  }

  /* ---------- planilha: grava os lançamentos na aba do site ---------- */
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const combina = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return false; if (a === b) return true; const pa = a.split(" "), pb = b.split(" "); return pa.length > 1 && pb.length > 1 && pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1]; };
  const valorCelula = (v) => (v && typeof v === "object" ? (v.result !== undefined ? v.result : v.text !== undefined ? v.text : v.richText ? v.richText.map((t) => t.text).join("") : "") : v);
  const dataUTC = (iso) => { const d = new Date(iso); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };

  async function planilhaComLancamentos(buffer, movs, pessoas) {
    const pend = (movs || []).filter(vale);
    if (!pend.length) return { buffer, adicionados: 0 };
    await carregar("assets/vendor/exceljs-4.4.0.min.js");
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(ABA_LANC);
    if (!ws) throw new Error('A planilha atual é de uma versão antiga, sem a aba "Lançamentos do site". Envie a versão nova da planilha financeira; depois disso os Pix e abatimentos entram nela sozinhos.');
    const coop = wb.getWorksheet("Cooperados");
    const nomesPlan = [];
    if (coop) for (let r = 6; r <= 30; r++) { const nome = String(valorCelula(coop.getCell("B" + r).value) || "").trim(); if (nome) nomesPlan.push({ nome, email: norm(valorCelula(coop.getCell("C" + r).value)) }); }
    const nomeNaPlanilha = (id) => {
      const p = pessoas[id] || {};
      const e = nomesPlan.find((x) => x.email && x.email === norm(p.email)) || nomesPlan.find((x) => norm(x.nome) === norm(p.nome)) || nomesPlan.find((x) => combina(x.nome, p.nome));
      return e ? e.nome : p.nome || "";
    };
    const jaTem = new Set(); let linha = 6;
    while (valorCelula(ws.getCell("G" + linha).value) || valorCelula(ws.getCell("B" + linha).value)) { const c = valorCelula(ws.getCell("G" + linha).value); if (c) jaTem.add(String(c)); linha++; }
    let adicionados = 0;
    pend.filter((m) => !jaTem.has(m.codigo)).forEach((m) => {
      const quando = m.decidido_em || m.criado_em;
      (m.alocacao || []).forEach((a) => {
        const tipo = a.destino === "integralizacao" ? "Integralização de quotas" : a.destino === "despesa" ? "Chamada de despesa" : "Contribuição mensal";
        let ref = null;
        if (a.destino === "contribuicao") ref = a.mes ? new Date(Date.UTC(Number(a.mes.slice(0, 4)), Number(a.mes.slice(5, 7)) - 1, 1)) : (() => { const d = dataUTC(quando); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); })();
        if (a.destino === "despesa") { const d = dataUTC(quando); ref = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
        const vals = [dataUTC(quando), nomeNaPlanilha(m.cooperado_id), tipo, ref, centavos(a.valor), m.tipo === "pix" ? "Pix" : "Aportes", m.codigo,
          m.tipo === "pix" ? `Pix confirmado por ${m.decidido_nome || "tesouraria"}` : "Abatimento com aportes feito pelo cooperado no site"];
        vals.forEach((v, i) => { ws.getCell(linha, i + 1).value = v; });
        linha++;
      });
      adicionados++;
    });
    if (!adicionados) return { buffer, adicionados: 0 };
    ws.getCell("J6").value = { formula: "COUNTA(G6:G505)", result: -1 };
    wb.calcProperties = wb.calcProperties || {}; wb.calcProperties.fullCalcOnLoad = true;
    return { buffer: await wb.xlsx.writeBuffer(), adicionados };
  }

  /* Na leitura de uma planilha enviada (SheetJS): códigos já lançados e se foi recalculada */
  function lerLancamentos(livroSheetJS) {
    const ws = livroSheetJS.Sheets[ABA_LANC];
    if (!ws) return { existe: false, codigos: [], recalculada: true };
    const linhas = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    const codigos = [];
    for (let i = 5; i < linhas.length; i++) { const c = String(linhas[i][6] || "").trim(); if (c) codigos.push(c); }
    const ctrl = ws["J6"];
    return { existe: true, codigos: [...new Set(codigos)], recalculada: !(ctrl && Number(ctrl.v) === -1) };
  }

  function novoCodigo() {
    const a = new Uint8Array(10); crypto.getRandomValues(a);
    return Array.from(a, (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  }

  window.Fin = { creditoAdmin, maxRetiradaCooperado, atrasadas, minimoQuitar, PISO_CONSELHO, irMensal, irDetalhe, parametrosDoMes, VIG_KEYS, caixaLivre, retiradaMinima, prazoRetirada, descontosRetirada, experienciaInterna, diasUteis, feriadosDoAno, sinalExperiencia, enquadramento, diasDeExperiencia, habilitacaoUsada, valorHoraDe, NIVEIS, calcular, calcularCooperado, cooperativa, tabelaSalarial, valorHora, params, PADRAO, CATEGORIAS_SAL, CONSELHOS, TIPOS_PAG, mesFechamento, mesDe, somaMes, PIX, ABA_LANC, centavos, nomeMes, componentes, alocar, proxima, descreverItem, ajustada, pixCopiaECola, crc16, qrSvg, planilhaComLancamentos, lerLancamentos, novoCodigo, vale };
})();
