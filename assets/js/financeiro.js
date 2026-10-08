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
  const mesHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const TIPOS_PAG = {
    despesa: "Pagamento de despesa", aporte: "Aporte à cooperativa", contribuicao: "Contribuição mensal",
    integralizacao: "Integralização de quotas", abatimento: "Abatimento com aportes", chamada: "Chamada de despesa (sem despesa definida)"
  };
  const mesFechamento = (par) => (par && par.fechamento ? mesDe(par.fechamento) : mesHoje());

  /* Parâmetros do Estatuto com os valores padrão da planilha */
  const PADRAO = { quota: 50, quotas_minimas: 10, contrib_inicio: "2026-04-01", sm: 1621, horas_ref: 120, contrib_pct: 0.015, inss_pct: 0.11, inss_teto: 8475.55,
    patronal_pct: 0.2, fic_coop_pct: 0.055, fic_vol_max: 0.025, tele_pct: 0.0925, alim_pct: 0.0278, custo_op_pct: 0.2, reserva_pct: 0.1, fates_pct: 0.05,
    base_demais_pleno: 6600, mult_junior: 8.5, mult_pleno: 11, mult_senior: 14, mult_coord: 17.5, sobras_mercado: 0, sobras_publicas: 0, rateio_pct: 1 };
  const CATEGORIAS_SAL = [["Júnior", "mult_junior", "Até 5 anos"], ["Pleno", "mult_pleno", "6 a 10 anos"], ["Sênior", "mult_senior", "Acima de 10 anos"], ["Coordenador", "mult_coord", "Acima de 10 anos, com designação do Conselho"]];
  const CONSELHOS = ["CREA", "CAU", "CFT", "CRA", "OAB", "CRC", "Outro", "Nenhum"];
  const params = (par) => { const o = { ...PADRAO }; Object.keys(PADRAO).forEach((k) => { if (par && par[k] != null && par[k] !== "") o[k] = typeof PADRAO[k] === "number" ? Number(par[k]) : par[k]; }); return o; };
  /* Tabela salarial (art. 8º): CREA/CAU = multiplicador × SM; demais conselhos = base Pleno × multiplicador ÷ multiplicador Pleno */
  function tabelaSalarial(par) {
    const p = params(par);
    return CATEGORIAS_SAL.map(([cat, k, exp]) => {
      const crea = p[k] * p.sm, demais = p.base_demais_pleno * p[k] / p.mult_pleno;
      return { categoria: cat, experiencia: exp, multiplicador: p[k], crea_mensal: crea, crea_hora: crea / p.horas_ref, demais_mensal: demais, demais_hora: demais / p.horas_ref };
    });
  }
  function valorHoraDe(categoria, conselho, par) {
    if (!categoria) return 0;
    const t = tabelaSalarial(par).find((x) => x.categoria === categoria); if (!t) return 0;
    return conselho === "CREA" || conselho === "CAU" ? t.crea_hora : t.demais_hora;
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
    if (!hab) return { dias: 0, continua: false };
    const p = { exp_tecnico_antes: true, exp_superior_antes: false, ...(par || {}) };
    const antesConta = hab.nivel === "tecnico" ? p.exp_tecnico_antes !== false : p.exp_superior_antes === true;
    const piso = !antesConta && hab.data_habilitacao ? diaUTC(hab.data_habilitacao) : -Infinity;
    const teto = diaUTC(ateISO) + DIA;
    const ints = (exps || []).filter((e) => e.fin_cooperado_id === c.id && e.status === "aprovada" && e.habilitacao_id === hab.id && e.inicio)
      .map((e) => [Math.max(diaUTC(e.inicio), piso), Math.min(e.fim ? diaUTC(e.fim) + DIA : Infinity, teto), !e.fim])
      .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let dias = 0, cur = null, continua = false;
    ints.forEach(([a, b, aberto]) => { if (aberto) continua = true; if (!cur || a > cur[1]) { if (cur) dias += (cur[1] - cur[0]) / DIA; cur = [a, b]; } else cur[1] = Math.max(cur[1], b); });
    if (cur) dias += (cur[1] - cur[0]) / DIA;
    return { dias, continua };
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
    const { dias, continua } = diasDeExperiencia(c, hab, base.experiencias, ref, par);
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
    return { categoria, conselho: hab.conselho, anos, anos_exatos: anosExatos, origem: "automatico", habilitacao: hab, proxima, avisos };
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
    const vhMes = {};
    const vhDe = (m) => (vhMes[m] !== undefined ? vhMes[m] : (vhMes[m] = valorHora(c, base.parametros || {}, base, m)));
    const ficVol = Math.min(Number(c.fic_voluntario || 0), par.fic_vol_max);
    const retiradaDe = (m) => { const f = folha[m]; return f ? (Number(f.horas_produtivas || 0) + Number(f.horas_formacao || 0)) * vhDe(m) : 0; };

    const mesesSet = new Set();
    for (let m = inicio; m <= fech; m = somaMes(m, 1)) mesesSet.add(m);
    Object.keys(folha).forEach((m) => { mesesSet.add(m); if (retiradaDe(m) > 0) mesesSet.add(somaMes(m, 1)); });
    pags.forEach((p) => { if (p.tipo === "contribuicao" && p.mes_ref) mesesSet.add(mesDe(p.mes_ref)); if (cobrada(p) && p.data) mesesSet.add(mesDe(p.data)); });
    partes.forEach((x) => { if (x.mes) mesesSet.add(x.mes); });
    const meses = [...mesesSet].sort();
    const mensal = meses.map((m) => {
      const f = folha[m] || {};
      const hp = Number(f.horas_produtivas || 0), hf = Number(f.horas_formacao || 0), dias = Number(f.dias || 0);
      const vh = vhDe(m);
      const ret = (hp + hf) * vh;
      const inss = Math.min(ret, par.inss_teto) * par.inss_pct;
      const devida = ativo(m) && m >= inicio && m <= fech ? (ret > 0 ? ret * par.contrib_pct : quota) : 0;
      const descontada = ret > 0 ? devida : 0;
      const pagaDireto = somaBruta(pags.filter((p) => p.tipo === "contribuicao" && mesDe(p.mes_ref) === m), (p) => p.valor);
      const paga = descontada + pagaDireto;
      const ficCoop = retiradaDe(somaMes(m, -1)) * par.fic_coop_pct;
      const ficV = ret * ficVol;
      const p13 = ret / 12, pfer = ret / 12;
      const d13 = Number(f.decimo_pago || 0), dfer = Number(f.ferias_pago || 0);
      const tele = ativo(m) && c.teletrabalho && hp + hf > 0 ? par.tele_pct * par.sm : 0;
      const alim = ativo(m) ? dias * par.alim_pct * par.sm : 0;
      const v = somaBruta(partes.filter((x) => x.mes === m), (x) => x.valor);
      const w = somaBruta(pags.filter((p) => cobrada(p) && mesDe(p.data) === m), (p) => p.valor);
      const liquido = ret - inss - descontada - ficV + tele + alim + d13 + dfer;
      return { mes: m, valor_hora: vh, horas_produtivas: hp, horas_formacao: hf, dias, retirada: centavos(ret), inss: centavos(inss), devida: centavos(devida), descontada: centavos(descontada),
        paga: centavos(paga), fic_coop: centavos(ficCoop), fic_vol: centavos(ficV), prov_13: centavos(p13), prov_ferias: centavos(pfer), decimo_pago: d13, ferias_pago: dfer,
        aux_tele: centavos(tele), aux_alim: centavos(alim), liquido: centavos(liquido), em_aberto: centavos(devida - paga + Math.max(0, v - w)),
        _ret: ret, _inss: inss, _dev: devida, _paga: paga, _fic: ficCoop + ficV, _p13: p13, _pf: pfer };
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
    const totalH = horasTotais(base);
    const ratear = Math.max(0, par.sobras_mercado * (1 - par.reserva_pct - par.fates_pct)) * par.rateio_pct;
    const sobras = totalH > 0 ? centavos(ratear * horas / totalH) : 0;
    const retFech = retiradaDe(fech);
    const aportes = pags.filter((p) => ehAporte(p) || cobrada(p)).map((p) => ({
      data: p.data, valor: Number(p.valor), tipo: cobrada(p) ? "Pagamento da sua parte" : "Aporte à cooperativa",
      descricao: (p.despesa_id && desp[p.despesa_id] ? desp[p.despesa_id].descricao : "") || p.observacao || TIPOS_PAG[p.tipo]
    })).sort((a, b) => String(a.data || "9").localeCompare(String(b.data || "9")));
    mensal.forEach((x) => ['_ret', '_inss', '_dev', '_paga', '_fic', '_p13', '_pf'].forEach((k) => { const v = x[k]; delete x[k]; Object.defineProperty(x, k, { value: v, enumerable: false }); }));
    return {
      id: c.id, fin_cooperado_id: c.id, cooperado_id: c.perfil_id || null, cooperado_nome: c.nome, email: c.email || "",
      data_base: fimDoMes(fech), criado_em: new Date().toISOString(), valor_hora: vhDe(fech), enquadramento: enquadramento(c, base, fech),
      quotas_subscritas: centavos(E / quota), capital_subscrito: E, capital_integralizado: F, contribuicoes_pagas: U,
      contribuicao_mensal: centavos(retFech > 0 ? retFech * par.contrib_pct : quota), valor_em_aberto: L, meses_em_atraso: mensal.filter((x) => x.em_aberto > 0.005).length,
      fic_saldo: fic, fundo_13: f13, fundo_ferias: ffer, sobras_a_receber: sobras, outros_creditos: T,
      observacao: T > 0 ? "Outros créditos = aportes que você adiantou à cooperativa. Não são sacáveis a qualquer momento: só são devolvidos no desligamento, após aprovação do balanço (art. 19)." : null,
      detalhes: { mensal, aportes, resumo: { contribuicoes_devidas: H, contribuicoes_pagas_mensais: I, falta_integralizar: G, aportes_brutos: AB, aportes_no_capital: AC, falta_inicial: AD, adiantado: AE,
        retiradas_ano: centavos(somaBruta(mensal, (x) => x.retirada)), horas: horas, chamadas: J, chamadas_pagas: K } }
    };
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
    const meses = new Set(Object.keys(rec));
    Object.values(calc).forEach((p) => p.detalhes.mensal.forEach((x) => meses.add(x.mes)));
    const linhas = [...meses].sort().map((m) => {
      const xs = Object.values(calc).map((p) => p.detalhes.mensal.find((x) => x.mes === m)).filter(Boolean);
      const s = (k) => centavos(xs.reduce((t, x) => t + Number(x[k] || 0), 0));
      const sb = (k) => xs.reduce((t, x) => t + Number(x[k] || 0), 0);
      const receita = rec[m] || 0, ret = xs.some((x) => x._ret !== undefined) ? centavos(sb("_ret")) : s("retirada");
      return { mes: m, receita, custo_op: centavos(receita * par.custo_op_pct), retiradas: ret, inss_retido: s("inss"), inss_patronal: centavos((xs.some((x) => x._ret !== undefined) ? sb("_ret") : ret) * par.patronal_pct),
        fic_coop: s("fic_coop"), provisoes: centavos(xs.some((x) => x._p13 !== undefined) ? sb("_p13") + sb("_pf") : s("prov_13") + s("prov_ferias")), auxilios: centavos(s("aux_tele") + s("aux_alim")), contribuicoes: s("paga"), liquido: s("liquido") };
    });
    const sm = par.sobras_mercado, sp = par.sobras_publicas, r = par.reserva_pct, f = par.fates_pct;
    return { linhas, sobras: { mercado: sm, publicas: sp, reserva: centavos((sm + sp) * r), fates: centavos((sm + sp) * f), fei: centavos(Math.max(0, sp * (1 - r - f))),
      mercado_liquido: centavos(Math.max(0, sm * (1 - r - f))), rateio_pct: par.rateio_pct, a_ratear: centavos(Math.max(0, sm * (1 - r - f)) * par.rateio_pct) } };
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

  window.Fin = { enquadramento, diasDeExperiencia, habilitacaoUsada, valorHoraDe, NIVEIS, calcular, calcularCooperado, cooperativa, tabelaSalarial, valorHora, params, PADRAO, CATEGORIAS_SAL, CONSELHOS, TIPOS_PAG, mesFechamento, mesDe, somaMes, PIX, ABA_LANC, centavos, nomeMes, componentes, alocar, proxima, descreverItem, ajustada, pixCopiaECola, crc16, qrSvg, planilhaComLancamentos, lerLancamentos, novoCodigo, vale };
})();
