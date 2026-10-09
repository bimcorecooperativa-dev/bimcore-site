/* BIMCORE — Contratos e projetos
   Contrato assinado → coordenador do projeto designado em reunião interna → BEP e prazos →
   chamadas de adesão por função e disciplina → equipe → horas aprovadas → apontamentos de
   conformidade → entregas com relatório de conformidade → avaliação entre pares.
   A coordenação não é hierarquia: o que orienta o trabalho são o contrato, o BEP e os Manuais
   de Disciplina (RI, arts. 54, 90, 112 e 114; Lei 12.690/2012, art. 2º, §1º). */
(function () {
  "use strict";
  const UI = window.UI, API = window.API, Fin = window.Fin;
  const { $, esc, data, dataHora, moeda, horas, acao, confirmar, toast } = UI;

  const TIPOS_CONTRATO = {
    licitacao: { nome: "Licitação", natureza: "mercado", remunerado: true },
    emenda: { nome: "Emenda parlamentar", natureza: "parceria", remunerado: true, aviso: "Se a emenda vier por termo de fomento ou de colaboração (Lei 13.019), é parceria e as sobras vão ao FEI. Se a prefeitura contratar por licitação ou dispensa, é mercado. Confira o instrumento." },
    particular: { nome: "Contrato particular", natureza: "mercado", remunerado: true },
    cooperacao: { nome: "Acordo de cooperação técnica (gratuito)", natureza: "parceria", remunerado: false, aviso: "Sem pagamento: as horas contam como experiência, mas não geram crédito de retirada." },
    dispensa: { nome: "Dispensa de licitação", natureza: "mercado", remunerado: true },
    inexigibilidade: { nome: "Inexigibilidade", natureza: "mercado", remunerado: true }
  };
  const NATUREZA = { mercado: "Mercado (sobras podem ser rateadas)", parceria: "Parceria com o Poder Público, Lei 13.019 (sobras vão ao FEI)" };
  const FUNCOES = {
    coordenacao: { nome: "Coordenação BIM", cat: "Coordenador", texto: "Verifica compatibilização, interferências, padronização e conformidade com o BEP, e informa à equipe as falhas encontradas. Não dá ordens: aponta o que o contrato e o BEP exigem e pode sugerir." },
    supervisao: { nome: "Supervisão técnica e simulação", cat: "Sênior", texto: "Simula o projeto em situações reais (desempenho, custos, execução) e informa os resultados ao projetista. Pode sugerir; a decisão técnica é de quem projeta." },
    projeto: { nome: "Projeto da disciplina", cat: "Pleno", texto: "Concebe e desenvolve o projeto da disciplina e responde tecnicamente por ele (ART/RRT/TRT, Estatuto, art. 9º, XIII)." },
    orcamento: { nome: "Orçamento e planejamento", cat: "Pleno", texto: "Vincula os quantitativos do modelo às composições oficiais e monta orçamento e cronograma." },
    modelagem: { nome: "Modelagem BIM", cat: "Júnior", texto: "Modela e detalha no padrão do BEP e do Manual de Disciplina. O escopo, o nível de detalhe e os prazos vêm do BEP; o modo e o horário de trabalho são seus." },
    campo: { nome: "Levantamento e campo", cat: "Júnior", texto: "Levantamentos, visitas técnicas e retorno de campo para o modelo." },
    outra: { nome: "Outra função", cat: "", texto: "" }
  };
  const DISCIPLINAS = { geral: "Geral / todas", arquitetura: "Arquitetura", estrutura: "Estruturas", hidrossanitaria: "Instalações hidrossanitárias", eletrica: "Instalações elétricas", incendio: "Prevenção e combate a incêndio", climatizacao: "Climatização", infraestrutura: "Infraestrutura e pavimentação", topografia: "Topografia", orcamento: "Orçamento e planejamento", compatibilizacao: "Compatibilização" };
  const CATS = ["Júnior", "Pleno", "Sênior", "Coordenador"];
  const BEP = [
    ["objetivo", "Objetivo e escopo", "O que o contrato pede, área, etapas (estudo, básico, executivo)."],
    ["exigencias", "Exigências do cliente e do contrato", "Cláusulas, termo de referência, normas e entregáveis exigidos. É daqui que vêm os apontamentos, não de vontade pessoal."],
    ["usos", "Usos do BIM", "Modelagem, compatibilização, quantitativos e orçamento (5D), planejamento (4D)..."],
    ["lod", "Nível de desenvolvimento por disciplina e etapa", "Ex.: Arquitetura LOD 400 no executivo."],
    ["softwares", "Softwares, versões e formatos de troca", "Ex.: Revit 2025, IFC 4, BCF para apontamentos."],
    ["padroes", "Padrões, nomenclatura e Manuais de Disciplina", "Templates, famílias, códigos, nomes de arquivos."],
    ["responsabilidades", "Matriz de responsabilidades", "Quem entrega o quê em cada etapa."],
    ["coordenacao", "Rotina de coordenação", "Reuniões, frequência de verificação de interferências, tolerâncias."],
    ["qualidade", "Critérios de qualidade e aceite", "O que torna uma entrega conforme (o que o relatório de conformidade verifica)."]
  ];
  const TIPOS_APONT = { bep: "Não conformidade com o BEP", interferencia: "Interferência entre disciplinas", simulacao: "Resultado de simulação", cliente: "Exigência do cliente/contrato", sugestao: "Sugestão" };
  const ST_APONT = { aberto: '<span class="selo warn">aberto</span>', corrigido: '<span class="selo info">corrigido, aguardando conferência</span>', contestado: '<span class="selo err">contestado, aguardando o CA</span>', resolvido: '<span class="selo ok">resolvido</span>', cancelado: '<span class="selo">cancelado</span>' };
  const ST_ADES = { manifestada: '<span class="selo warn">adesão manifestada</span>', confirmada: '<span class="selo ok">na equipe</span>', nao_selecionada: '<span class="selo">não selecionada</span>', desistiu: '<span class="selo">desistiu</span>', encerrada: '<span class="selo">encerrada</span>' };
  const ATIVOS = ["Contratado", "Em execução"];
  /* mensagens já vistas por projeto (só neste navegador; serve para o contador de novas) */
  const visto = { ler(u, pid) { try { return localStorage.getItem(`bimcore-chat-visto-${u}-${pid}`) || ""; } catch (e) { return ""; } }, gravar(u, pid, t) { try { localStorage.setItem(`bimcore-chat-visto-${u}-${pid}`, t); } catch (e) {} } };
  const novasPorProjeto = (ult, meId) => { const o = {}; (ult || []).forEach((m) => { if (m.autor_id !== meId && m.criado_em > visto.ler(meId, m.projeto_id)) o[m.projeto_id] = (o[m.projeto_id] || 0) + 1; }); return o; };

  const lerValor = (t) => { t = String(t || "").replace(/[R$\s]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); const v = Number(t); return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0; };
  const brl = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(typeof v === "string" ? v : v.nome)}</option>`).join("");
  const nomeFuncao = (f) => (FUNCOES[f.funcao] || { nome: f.funcao }).nome + (f.disciplina && f.disciplina !== "geral" ? " — " + (DISCIPLINAS[f.disciplina] || f.disciplina) : "");

  /* ---------- contexto comum ---------- */
  async function carregar(ctx) {
    const [d, eu] = await Promise.all([API.proj.carregar(), meuPerfilTecnico()]);
    const me = ctx.sessao.perfil;
    d.me = me; d.eu = eu;
    d.novas = novasPorProjeto(await API.proj.ultimasMensagens().catch(() => []), me.id);
    d.par = Fin.params(await API.fin.parametros().catch(() => ({})));
    d.ca = !!(me.status === "ativo" && me.conselho_adm);
    d.gestorGeral = me.papel === "coordenacao" || d.ca;
    d.gere = (p) => d.gestorGeral || p.coordenador_id === me.id;
    d.membro = (p, uid) => p.coordenador_id === (uid || me.id) || d.adesoes.some((a) => a.projeto_id === p.id && a.perfil_id === (uid || me.id) && ["confirmada", "encerrada"].includes(a.status));
    d.contratoDe = (p) => d.contratos.find((c) => c.id === p.contrato_id) || null;
    d.limite = (f, p) => { const l = d.limites.find((x) => x.funcao === f) || { padrao: 1, complexo: 1 }; return p.complexidade === "complexo" ? l.complexo : l.padrao; };
    d.carga = (uid) => d.adesoes.filter((a) => a.perfil_id === uid && a.status === "confirmada").reduce((t, a) => {
      const f = d.funcoes.find((x) => x.id === a.funcao_id), p = d.projetos.find((x) => x.id === a.projeto_id);
      return f && p && ATIVOS.includes(p.status) ? t + 1 / d.limite(f.funcao, p) : t;
    }, 0);
    return d;
  }
  /* categoria e conselho do próprio cooperado, para saber se é compatível com a chamada (Estatuto, art. 9º, XIV) */
  async function meuPerfilTecnico() {
    try {
      const m = await API.exp.meu(); if (!m || !m.cooperado) return { categoria: null, conselho: null };
      const enq = Fin.enquadramento(m.cooperado, { parametros: m.parametros || {}, habilitacoes: m.habilitacoes, experiencias: m.experiencias, internas: m.internas || [] }, Fin.mesDe(UI.hoje()));
      return { categoria: enq.categoria || m.cooperado.categoria || null, conselho: enq.conselho || m.cooperado.conselho || null };
    } catch (e) { return { categoria: null, conselho: null }; }
  }
  const compativel = (f, eu) => {
    const okCat = !f.categoria_min || (eu.categoria && CATS.indexOf(eu.categoria) >= CATS.indexOf(f.categoria_min));
    const okCons = !(f.conselhos || []).length || (eu.conselho && f.conselhos.includes(eu.conselho));
    return okCat && okCons;
  };
  function abertas(d) {
    const hoje = UI.hoje();
    return d.funcoes.filter((f) => f.status === "aberta" && (!f.prazo_adesao || f.prazo_adesao >= hoje)).filter((f) => { const p = d.projetos.find((x) => x.id === f.projeto_id); return p && !["Concluído", "Suspenso"].includes(p.status); });
  }

  /* contador da navegação: chamadas compatíveis sem resposta + horas a aprovar + apontamentos a responder + contestações (CA) */
  async function contador(ctx) {
    try {
      const d = await API.proj.carregar(); const me = ctx.sessao.perfil; const eu = await meuPerfilTecnico();
      const ch = abertas({ ...d }).filter((f) => compativel(f, eu) && !d.adesoes.some((a) => a.funcao_id === f.id && a.perfil_id === me.id)).length;
      const ap = d.apontamentos.filter((a) => a.status === "aberto" && a.destinatario_id === me.id).length + d.apontamentos.filter((a) => a.status === "corrigido" && a.autor_id === me.id).length
        + (me.conselho_adm ? d.apontamentos.filter((a) => a.status === "contestado" && a.autor_id !== me.id && a.destinatario_id !== me.id).length : 0);
      const nv = Object.values(novasPorProjeto(await API.proj.ultimasMensagens().catch(() => []), me.id)).reduce((t, n) => t + n, 0);
      return ch + ap + nv;
    } catch (e) { return 0; }
  }
  /* aviso no Início */
  async function anuncio(ctx) {
    try {
      const d = await API.proj.carregar(); const me = ctx.sessao.perfil; const eu = await meuPerfilTecnico();
      const fs = abertas({ ...d }).filter((f) => compativel(f, eu) && !d.adesoes.some((a) => a.funcao_id === f.id && a.perfil_id === me.id));
      if (!fs.length) return "";
      return `<div class="notice ok"><b>${fs.length} chamada(s) de adesão aberta(s) compatível(is) com o seu perfil.</b> Veja o BEP e os prazos e, se quiser participar, manifeste adesão. <a href="#projetos">Ver chamadas</a></div>`;
    } catch (e) { return ""; }
  }

  /* ---------- Orçamento do projeto ----------
     Custo de 1 hora para a cooperativa = valor-hora da categoria × (1 + INSS patronal + FIC da cooperativa
     + 1/12 de 13º + 1/12 de férias) + auxílio-alimentação proporcional. O que sobra para a equipe =
     valor do projeto − retenções na nota − 20% do Custo de Operação e Gestão. */
  function orcamento(d, p, hs) {
    const par = d.par, c = d.contratoDe(p);
    const fator = 1 + Number(par.patronal_pct || 0) + Number(par.fic_coop_pct || 0) + 2 / 12;
    const alimHora = Number(par.alim_pct || 0) * Number(par.sm || 0) / Number(par.horas_dia || 6);
    const custoHora = (cat, cons) => Fin.valorHoraDe(cat || "Pleno", cons || "CREA", par) * fator + alimHora;
    const valor = Number(p.valor != null && p.valor !== "" ? p.valor : c ? c.valor : 0) || 0;
    const ret = c ? Number(c.retencao_pct || 0) : 0;
    const disponivel = c && c.remunerado ? valor * (1 - ret) * (1 - Number(par.custo_op_pct || 0.2)) : 0;
    const fs = d.funcoes.filter((f) => f.projeto_id === p.id && f.status !== "cancelada");
    const ads = d.adesoes.filter((a) => a.projeto_id === p.id && ["confirmada", "encerrada"].includes(a.status));
    const planejado = fs.reduce((t, f) => t + f.vagas * Number(f.horas_previstas || 0) * custoHora(f.categoria_min, (f.conselhos || [])[0]), 0);
    const prod = (hs || []).filter((h) => h.tipo === "produtiva");
    const pessoas = {};
    ads.forEach((a) => { const f = d.funcoes.find((x) => x.id === a.funcao_id);
      const o = pessoas[a.perfil_id] = pessoas[a.perfil_id] || { perfil_id: a.perfil_id, nome: a.nome, categoria: a.categoria || (f && f.categoria_min) || "Pleno", conselho: a.conselho, funcoes: [], previstas: 0, aprovadas: 0, pendentes: 0 };
      if (f) { o.funcoes.push(nomeFuncao(f)); o.previstas += Number(f.horas_previstas || 0); } });
    prod.forEach((h) => { const o = pessoas[h.cooperado_id] = pessoas[h.cooperado_id] || { perfil_id: h.cooperado_id, nome: h.cooperado_nome, categoria: "Pleno", funcoes: ["fora da equipe"], previstas: 0, aprovadas: 0, pendentes: 0 };
      if (h.aprovacao === "pendente") o.pendentes += Number(h.horas); else if ((h.aprovacao || "aprovada") === "aprovada") o.aprovadas += Number(h.horas); });
    const lista = Object.values(pessoas).map((o) => ({ ...o, custoHora: custoHora(o.categoria, o.conselho), consumido: o.aprovadas * custoHora(o.categoria, o.conselho), pendente: o.pendentes * custoHora(o.categoria, o.conselho) }));
    const consumido = lista.reduce((t, o) => t + o.consumido, 0), pendente = lista.reduce((t, o) => t + o.pendente, 0);
    const pcs = c ? d.parcelas.filter((x) => x.contrato_id === c.id) : [];
    const recebido = pcs.filter((x) => x.recebido_em).reduce((t, x) => t + Number(x.valor_recebido != null ? x.valor_recebido : x.valor), 0);
    const ms = d.marcos.filter((m) => m.projeto_id === p.id);
    const fisico = ms.length ? ms.filter((m) => m.entregue_em).length / ms.length : null;
    const horasAprov = prod.filter((h) => (h.aprovacao || "aprovada") === "aprovada").reduce((t, h) => t + Number(h.horas), 0);
    return { c, valor, ret, disponivel, planejado, consumido, pendente, saldo: disponivel - consumido, lista, pcs, recebido, ms, fisico, horasAprov, custoHora, fator };
  }
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  function alertasOrcamento(o, p) {
    const al = [];
    if (!o.c) al.push(["warn", "Projeto sem contrato: as horas não geram crédito de retirada e não há orçamento para comparar."]);
    else if (!o.c.remunerado) al.push(["warn", "Contrato gratuito: as horas contam como experiência, mas não geram crédito."]);
    else {
      if (o.planejado > o.disponivel + 0.5) al.push(["err", `A equipe planejada nas chamadas custa ${moeda(o.planejado)}, acima dos ${moeda(o.disponivel)} disponíveis. Reveja a equipe ou as horas previstas.`]);
      const uso = o.consumido + o.pendente;
      if (uso > o.disponivel + 0.5) al.push(["err", `Aprovando o que está pendente, o projeto passa do orçamento: ${moeda(uso)} de ${moeda(o.disponivel)} (${pct(uso, o.disponivel)}%).`]);
      else if (uso > o.disponivel * 0.8) al.push(["warn", `O projeto já usa ${pct(uso, o.disponivel)}% do orçamento da equipe (contando as horas pendentes).`]);
      if (o.fisico != null && o.disponivel > 0 && o.consumido / o.disponivel > o.fisico + 0.15) al.push(["warn", `O gasto (${pct(o.consumido, o.disponivel)}% do orçamento) está à frente do avanço físico (${Math.round(o.fisico * 100)}% das entregas feitas).`]);
      if (p.horas_orcadas && o.horasAprov > p.horas_orcadas) al.push(["err", `As horas aprovadas (${horas(o.horasAprov)}) já passaram das orçadas (${horas(p.horas_orcadas)}).`]);
      const hoje = UI.hoje(); const atr = o.pcs.filter((x) => !x.recebido_em && x.previsto_em && x.previsto_em < hoje);
      if (atr.length) al.push(["err", `${atr.length} parcela(s) do contrato em atraso: ${atr.map((x) => x.descricao + " (previsto " + data(x.previsto_em) + ")").join("; ")}. A tesouraria pode cobrir as retiradas com o Fundo de Soberania.`]);
    }
    o.lista.filter((x) => x.previstas > 0 && x.aprovadas + x.pendentes > x.previstas).forEach((x) => al.push(["warn", `${x.nome}: ${horas(x.aprovadas + x.pendentes)} lançadas de ${horas(x.previstas)} previstas.`]));
    return al;
  }
  function htmlOrcamento(d, p, o, me) {
    const al = alertasOrcamento(o, p);
    return `<section class="painel"><h2>Orçamento e andamento do contrato</h2>
      ${al.map(([t, m]) => `<div class="notice ${t}">${esc(m)}</div>`).join("")}
      <div class="kpis">
        <div class="kpi"><span class="rot">Valor do projeto</span><span class="val">${moeda(o.valor)}</span><span class="det">${o.ret ? `retenções na nota ${Math.round(o.ret * 1000) / 10}% · ` : ""}20% para o Custo de Operação</span></div>
        <div class="kpi"><span class="rot">Disponível para a equipe</span><span class="val">${moeda(o.disponivel)}</span><span class="det">planejado nas chamadas: ${moeda(o.planejado)}</span></div>
        <div class="kpi"><span class="rot">Consumido (aprovado)</span><span class="val" style="color:${o.consumido > o.disponivel ? "var(--err)" : "inherit"}">${moeda(o.consumido)}</span><span class="det">${pct(o.consumido, o.disponivel)}% · pendente ${moeda(o.pendente)}</span></div>
        <div class="kpi"><span class="rot">Saldo do orçamento</span><span class="val" style="color:${o.saldo < 0 ? "var(--err)" : "var(--ok)"}">${moeda(o.saldo)}</span><span class="det">antes das horas pendentes</span></div>
      </div>
      <div class="barras-fisfin">
        <div><span>Físico (entregas feitas)</span><div class="barra"><i style="width:${o.fisico == null ? 0 : Math.round(o.fisico * 100)}%"></i></div><b>${o.fisico == null ? "sem entregas cadastradas" : Math.round(o.fisico * 100) + "%"}</b></div>
        <div><span>Gasto com a equipe</span><div class="barra"><i style="width:${Math.min(100, pct(o.consumido, o.disponivel))}%"></i></div><b>${pct(o.consumido, o.disponivel)}%</b></div>
        <div><span>Financeiro (recebido do contrato)</span><div class="barra"><i style="width:${Math.min(100, pct(o.recebido, o.c ? Number(o.c.valor) : 0))}%"></i></div><b>${moeda(o.recebido)}</b></div>
      </div>
      <h3 class="mini-tit">Equipe</h3>
      ${o.lista.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th class="num">Previstas</th><th class="num">Aprovadas</th><th class="num">Pendentes</th><th class="num">Custo consumido</th><th>Uso</th></tr></thead>
        <tbody>${o.lista.map((x) => { const u = x.previstas ? pct(x.aprovadas + x.pendentes, x.previstas) : null;
          return `<tr><td>${esc(x.nome)}${x.perfil_id === me.id ? ' <span class="selo">você</span>' : ""}<span class="sub">${esc(x.funcoes.join(", "))} · ${esc(x.categoria)} · ${moeda(x.custoHora)}/h com encargos</span></td><td class="num">${horas(x.previstas)}</td><td class="num">${horas(x.aprovadas)}</td><td class="num">${horas(x.pendentes)}</td><td class="num">${moeda(x.consumido)}</td>
            <td>${u == null ? "—" : `<span class="selo ${u > 100 ? "err" : u > 80 ? "warn" : "ok"}">${u}%</span>`}</td></tr>`; }).join("")}</tbody></table></div>` : '<p class="hint">Sem equipe ainda.</p>'}
      <h3 class="mini-tit">Cronograma físico-financeiro</h3>
      ${o.pcs.length || o.ms.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Entrega</th><th>Prevista</th><th>Situação</th><th>Parcela que libera</th><th>Pagamento</th></tr></thead>
        <tbody>${o.ms.slice().sort((a, b) => String(a.previsto || "9").localeCompare(String(b.previsto || "9"))).map((m) => { const x = o.pcs.find((y) => y.id === m.parcela_id);
          return `<tr><td>${esc(m.titulo)}</td><td>${m.previsto ? data(m.previsto) : "—"}</td><td>${m.entregue_em ? `<span class="selo ok">entregue ${data(m.entregue_em)}</span>` : m.previsto && m.previsto < UI.hoje() ? '<span class="selo err">atrasada</span>' : '<span class="selo warn">a entregar</span>'}</td>
            <td>${x ? `${esc(x.descricao)}<span class="sub">${moeda(x.valor)}</span>` : "—"}</td><td>${x ? seloParcela(x) : ""}</td></tr>`; }).join("")}
        ${o.pcs.filter((x) => !o.ms.some((m) => m.parcela_id === x.id)).map((x) => `<tr><td><span class="sub">sem entrega vinculada</span></td><td>—</td><td>—</td><td>${esc(x.descricao)}<span class="sub">${moeda(x.valor)}</span></td><td>${seloParcela(x)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="hint">Cadastre as entregas (aba BEP e entregas) e ligue cada uma à parcela que ela libera.</p>'}
      <p class="hint">Valores estimados pelo valor-hora da categoria de cada um, com encargos (INSS patronal ${Math.round(Number(d.par.patronal_pct) * 100)}%, FIC ${(Number(d.par.fic_coop_pct) * 100).toLocaleString("pt-BR")}%, 13º e férias) e auxílio-alimentação. O auxílio-teletrabalho é mensal por pessoa e não entra aqui.</p>
    </section>`;
  }
  function seloParcela(x) {
    if (x.recebido_em) return `<span class="selo ok">recebida ${data(x.recebido_em)}</span>`;
    const dias = x.previsto_em ? Math.floor((new Date(UI.hoje()) - new Date(x.previsto_em)) / 864e5) : 0;
    if (dias > 0) return `<span class="selo err">atrasada ${dias} dia(s)</span>${x.coberto_soberania ? `<span class="sub">retiradas cobertas pelo Fundo de Soberania (${moeda(x.coberto_soberania)})</span>` : ""}`;
    return `<span class="selo warn">a receber${x.previsto_em ? " " + data(x.previsto_em) : ""}</span>`;
  }

  /* ---------- Área interna: contratos ---------- */
  async function renderInterno(el, ctx) {
    const d = await carregar(ctx);
    if (sel) return renderProjeto(el, ctx, d, sel, () => { sel = null; renderInterno(el, ctx); });
    const pode = d.gestorGeral;
    const semContrato = d.projetos.filter((p) => !p.contrato_id);
    const recebido = (c) => d.parcelas.filter((x) => x.contrato_id === c.id && x.recebido_em).reduce((t, x) => t + Number(x.valor_recebido != null ? x.valor_recebido : x.valor), 0);
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Carteira</p><h1>Contratos e projetos</h1></div>${pode ? '<button class="btn btn-primary" id="ct-novo">Novo contrato</button>' : ""}</div>
      <details class="asm-passo"><summary>Como funciona, passo a passo</summary><ol>
        <li><b>Contrato assinado:</b> cadastre o contrato com o tipo (licitação, emenda, particular, cooperação, dispensa, inexigibilidade) e a natureza. Parceria com o Poder Público manda as sobras ao FEI (Estatuto, art. 72); acordo gratuito não gera crédito de retirada.</li>
        <li><b>Parcelas:</b> cadastre as medições ou parcelas previstas. Quando o dinheiro cair, a tesouraria registra o recebimento e o valor entra sozinho na receita do mês e nos 20%.</li>
        <li><b>Projeto e coordenador:</b> crie o projeto do contrato e registre o coordenador escolhido na reunião interna, com o ato (ex.: ata de dd/mm).</li>
        <li><b>BEP e prazos:</b> o coordenador preenche o BEP, o link do ambiente de arquivos (CDE) e as entregas. Todos leem antes de decidir participar.</li>
        <li><b>Chamadas de adesão:</b> o coordenador abre uma chamada para cada função e disciplina (quantas pessoas, categoria mínima, conselho, horas previstas, prazo). Quem tem perfil compatível é avisado no site.</li>
        <li><b>Equipe:</b> o coordenador conversa com quem manifestou adesão e confirma a equipe. Se não selecionar alguém, escreve o motivo, que fica visível. O site respeita o limite de projetos simultâneos de cada função.</li>
        <li><b>Execução:</b> as horas de produção são lançadas no projeto e aprovadas pelo coordenador; as do próprio coordenador, por um membro do Conselho de Administração. Falhas são registradas como apontamentos, sempre com o item do BEP ou do contrato que as fundamenta.</li>
        <li><b>Entrega e encerramento:</b> cada entrega precisa do relatório de conformidade do coordenador. Ao concluir, a equipe faz a avaliação entre pares.</li></ol></details>
      ${d.contratos.length ? d.contratos.map((c) => {
        const ps = d.projetos.filter((p) => p.contrato_id === c.id); const pc = d.parcelas.filter((x) => x.contrato_id === c.id);
        const t = TIPOS_CONTRATO[c.tipo] || { nome: c.tipo };
        return `<section class="painel"><div class="painel-cab"><h2>${esc(c.objeto)}</h2>${pode ? `<span><button class="btn btn-ghost btn-sm" data-ct-ed="${c.id}">Editar</button> <button class="btn btn-primary btn-sm" data-pj-novo="${c.id}">Novo projeto</button></span>` : ""}</div>
          <dl class="sol-dados"><div><dt>Contratante</dt><dd>${esc(c.contratante)}${c.municipio ? " · " + esc(c.municipio) : ""}</dd></div><div><dt>Tipo</dt><dd>${esc(t.nome)}${c.numero ? " nº " + esc(c.numero) : ""}</dd></div>
            <div><dt>Natureza</dt><dd>${esc(NATUREZA[c.natureza] || c.natureza)}</dd></div><div><dt>Valor</dt><dd>${c.remunerado ? moeda(c.valor) : "gratuito"}</dd></div>
            <div><dt>Recebido</dt><dd>${moeda(recebido(c))}</dd></div><div><dt>Vigência</dt><dd>${c.assinatura ? data(c.assinatura) : "—"} a ${c.vigencia_fim ? data(c.vigencia_fim) : "—"}</dd></div></dl>
          ${c.remunerado ? `<h3 class="mini-tit">Parcelas e medições</h3>${pc.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Parcela</th><th>Previsto</th><th class="num">Valor</th><th>Recebimento</th>${pode ? "<th></th>" : ""}</tr></thead>
            <tbody>${pc.map((x) => `<tr><td>${esc(x.descricao)}</td><td>${x.previsto_em ? data(x.previsto_em) : "—"}</td><td class="num">${moeda(x.valor)}</td><td>${x.recebido_em ? `<span class="selo ok">recebida ${data(x.recebido_em)}</span><span class="sub">${moeda(x.valor_recebido != null ? x.valor_recebido : x.valor)}${x.nota_fiscal ? " · NF " + esc(x.nota_fiscal) : ""}</span>` : '<span class="selo warn">a receber</span>'}</td>
              ${pode ? `<td class="acoes-celula">${x.recebido_em ? "" : `<button class="btn btn-ghost btn-sm" data-pc-del="${x.id}">Apagar</button>`}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhuma parcela cadastrada.</p>'}
            ${pode ? `<form class="form-grid" data-pc-form="${c.id}" novalidate><div class="field"><label>Parcela</label><input class="input" name="descricao" maxlength="120" placeholder="Ex.: 1ª medição (30%)"></div><div class="field"><label>Valor (R$)</label><input class="input" name="valor" inputmode="decimal"></div><div class="field"><label>Previsto para</label><input class="input" name="previsto_em" type="date"></div><div class="field"><label>&nbsp;</label><button class="btn btn-ghost" type="submit">Adicionar parcela</button></div></form>` : ""}` : ""}
          <h3 class="mini-tit">Projetos</h3>${listaProjetos(d, ps)}</section>`;
      }).join("") : '<p class="vazio">Nenhum contrato cadastrado. Quando o primeiro for assinado, comece por "Novo contrato".</p>'}
      ${semContrato.length ? `<section class="painel"><h2>Projetos sem contrato</h2><p class="hint">Prospecção, propostas e projetos antigos. Horas de produção em projeto sem contrato não geram crédito de retirada.</p>${listaProjetos(d, semContrato)}
        ${pode ? '<button class="btn btn-ghost btn-sm" data-pj-novo="">Novo projeto sem contrato</button>' : ""}</section>` : pode ? '<p><button class="btn btn-ghost btn-sm" data-pj-novo="">Novo projeto sem contrato (prospecção ou proposta)</button></p>' : ""}
      ${pode ? htmlLimites(d) : ""}`;

    el.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.id === "ct-novo") return modalContrato(null, () => renderInterno(el, ctx));
      if (b.dataset.ctEd) return modalContrato(d.contratos.find((c) => c.id === b.dataset.ctEd), () => renderInterno(el, ctx));
      if ("pjNovo" in b.dataset) return modalProjeto(d, null, b.dataset.pjNovo || null, (id) => { sel = id; renderInterno(el, ctx); });
      if (b.dataset.abrir) { sel = b.dataset.abrir; return renderInterno(el, ctx); }
      if (b.dataset.pcDel) { if (await acao(b, () => API.proj.excluirParcela(b.dataset.pcDel), "Parcela apagada.")) renderInterno(el, ctx); return; }
      if (b.id === "lim-salvar") {
        const rows = [...el.querySelectorAll("[data-lim]")].map((tr) => ({ funcao: tr.dataset.lim, padrao: Number(tr.querySelector("[name=padrao]").value), complexo: Number(tr.querySelector("[name=complexo]").value) }));
        if (rows.some((r) => !(r.padrao >= 1 && r.complexo >= 1))) return toast("Os limites vão de 1 a 20.", "err");
        if (await acao(b, () => API.proj.salvarLimites(rows), "Limites salvos.")) renderInterno(el, ctx);
      }
    };
    el.querySelectorAll("[data-pc-form]").forEach((f) => f.addEventListener("submit", async (ev) => {
      ev.preventDefault(); const fd = new FormData(f); const v = lerValor(fd.get("valor"));
      if (!String(fd.get("descricao")).trim() || !v) return toast("Informe a parcela e o valor.", "err");
      if (await acao(f.querySelector("button"), () => API.proj.salvarParcela({ contrato_id: f.dataset.pcForm, descricao: String(fd.get("descricao")).trim(), valor: v, previsto_em: fd.get("previsto_em") || null }), "Parcela adicionada.")) renderInterno(el, ctx);
    }));
  }
  let sel = null;

  function listaProjetos(d, ps) {
    if (!ps.length) return '<p class="hint">Nenhum projeto ainda.</p>';
    return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Projeto</th><th>Situação</th><th>Coordenador</th><th>Equipe</th><th></th></tr></thead>
      <tbody>${ps.map((p) => { const eq = d.adesoes.filter((a) => a.projeto_id === p.id && a.status === "confirmada").length; const ab = d.funcoes.filter((f) => f.projeto_id === p.id && f.status === "aberta").length;
        return `<tr><td><b>${esc(p.nome)}</b>${d.novas && d.novas[p.id] ? ` <span class="contador">${d.novas[p.id]}</span>` : ""}<span class="sub">${p.complexidade === "complexo" ? "complexo" : "padrão"}${p.fim ? " · término " + data(p.fim) : ""}${d.novas && d.novas[p.id] ? " · mensagens novas no chat" : ""}</span></td><td>${esc(p.status)}</td><td>${esc(p.coordenador_nome || "a designar")}</td>
          <td>${eq} pessoa(s)${ab ? `<span class="sub">${ab} chamada(s) aberta(s)</span>` : ""}</td><td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-abrir="${p.id}">Abrir</button></td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function htmlLimites(d) {
    return `<section class="painel"><h2>Projetos simultâneos por função</h2>
      <p class="hint">Quantos projetos ativos (contratados ou em execução) cada pessoa pode ter em cada função. Base: Plano Quinquenal (Células de Produção): o Pleno se dedica a 1 projeto complexo, o Coordenador BIM a até 3 complexos ou 5 padrão, os Sêniores a até 5. O site soma a dedicação de todas as participações (cada uma vale 1 ÷ limite) e não deixa passar de 100%.</p>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Função</th><th class="num">Projetos padrão</th><th class="num">Projetos complexos</th></tr></thead>
      <tbody>${Object.keys(FUNCOES).map((k) => { const l = d.limites.find((x) => x.funcao === k) || { padrao: 1, complexo: 1 };
        return `<tr data-lim="${k}"><td>${esc(FUNCOES[k].nome)}</td><td class="num"><input class="input mini" name="padrao" type="number" min="1" max="20" value="${l.padrao}" style="width:5rem"></td><td class="num"><input class="input mini" name="complexo" type="number" min="1" max="20" value="${l.complexo}" style="width:5rem"></td></tr>`; }).join("")}</tbody></table></div>
      <button class="btn btn-ghost btn-sm" id="lim-salvar">Salvar limites</button></section>`;
  }

  function modalContrato(c, depois) {
    c = c || { tipo: "licitacao", natureza: "mercado", remunerado: true };
    const m = UI.modal(`<h2>${c.id ? "Editar contrato" : "Novo contrato"}</h2>
      <form class="form-grid" id="ct-f" novalidate>
        <div class="field full"><label for="ct-obj">Objeto</label><input class="input" id="ct-obj" maxlength="400" value="${esc(c.objeto || "")}" placeholder="Ex.: Projetos executivos em BIM da Escola Municipal X"></div>
        <div class="field"><label for="ct-cli">Contratante</label><input class="input" id="ct-cli" maxlength="160" value="${esc(c.contratante || "")}" placeholder="Ex.: Prefeitura de Araruama"></div>
        <div class="field"><label for="ct-mun">Município</label><input class="input" id="ct-mun" maxlength="120" value="${esc(c.municipio || "")}"></div>
        <div class="field"><label for="ct-tipo">Tipo de contratação</label><select class="input" id="ct-tipo">${opts(TIPOS_CONTRATO, c.tipo)}</select></div>
        <div class="field"><label for="ct-nat">Natureza</label><select class="input" id="ct-nat">${opts(NATUREZA, c.natureza)}</select></div>
        <p class="hint full" id="ct-aviso"></p>
        <div class="field"><label for="ct-num">Número do contrato</label><input class="input" id="ct-num" maxlength="60" value="${esc(c.numero || "")}"></div>
        <div class="field"><label for="ct-proc">Processo</label><input class="input" id="ct-proc" maxlength="80" value="${esc(c.processo || "")}"></div>
        <div class="field"><label for="ct-val">Valor total (R$)</label><input class="input" id="ct-val" inputmode="decimal" value="${brl(c.valor)}"></div>
        <div class="field"><label for="ct-ret">Retenções na nota (%)</label><input class="input" id="ct-ret" inputmode="decimal" value="${c.retencao_pct ? String(Math.round(c.retencao_pct * 10000) / 100).replace(".", ",") : ""}" placeholder="Ex.: 5"><span class="hint">ISS, IR e outros que o órgão retém. Confirme com a contadora.</span></div>
        <label class="ciente"><input type="checkbox" id="ct-rem" ${c.remunerado ? "checked" : ""}> <span>Contrato remunerado (gera crédito de retirada)</span></label>
        <div class="field"><label for="ct-ass">Assinatura</label><input class="input" id="ct-ass" type="date" value="${c.assinatura || ""}"></div>
        <div class="field"><label for="ct-fim">Fim da vigência</label><input class="input" id="ct-fim" type="date" value="${c.vigencia_fim || ""}"></div>
        <div class="field full"><label for="ct-obs">Observações</label><input class="input" id="ct-obs" maxlength="300" value="${esc(c.observacao || "")}"></div>
      </form>
      <div class="modal-acoes">${c.id ? '<button class="btn btn-danger btn-sm" id="ct-del">Excluir</button>' : ""}<button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="ct-ok">Salvar</button></div>`);
    const aviso = () => { const t = TIPOS_CONTRATO[$("#ct-tipo", m.el).value]; $("#ct-aviso", m.el).textContent = t.aviso || ""; };
    $("#ct-tipo", m.el).onchange = () => { const t = TIPOS_CONTRATO[$("#ct-tipo", m.el).value]; $("#ct-nat", m.el).value = t.natureza; $("#ct-rem", m.el).checked = t.remunerado; aviso(); };
    aviso();
    if (c.id) $("#ct-del", m.el).onclick = async (ev) => { if (!(await confirmar("Excluir o contrato? As parcelas também saem; os projetos ficam sem contrato.", "Excluir"))) return; if (await acao(ev.currentTarget, () => API.proj.excluirContrato(c.id), "Contrato excluído.")) { m.fechar(); depois(); } };
    $("#ct-ok", m.el).onclick = async (ev) => {
      const x = { id: c.id, objeto: $("#ct-obj", m.el).value.trim(), contratante: $("#ct-cli", m.el).value.trim(), municipio: $("#ct-mun", m.el).value.trim() || null, tipo: $("#ct-tipo", m.el).value, natureza: $("#ct-nat", m.el).value,
        numero: $("#ct-num", m.el).value.trim() || null, processo: $("#ct-proc", m.el).value.trim() || null, valor: lerValor($("#ct-val", m.el).value), remunerado: $("#ct-rem", m.el).checked,
        retencao_pct: Math.min(0.99, lerValor($("#ct-ret", m.el).value) / 100), assinatura: $("#ct-ass", m.el).value || null, vigencia_fim: $("#ct-fim", m.el).value || null, observacao: $("#ct-obs", m.el).value.trim() || null };
      if (x.objeto.length < 3 || !x.contratante) return toast("Informe o objeto e o contratante.", "err");
      if (x.remunerado && !x.valor) return toast("Informe o valor do contrato (ou desmarque 'remunerado').", "err");
      if (await acao(ev.currentTarget, () => API.proj.salvarContrato(x), "Contrato salvo.")) { m.fechar(); depois(); }
    };
  }

  function modalProjeto(d, p, contratoId, depois) {
    const c = contratoId ? d.contratos.find((x) => x.id === contratoId) : null;
    p = p || { nome: c ? c.objeto : "", orgao: c ? c.contratante : "", municipio: c ? c.municipio : "", status: c ? "Contratado" : "Prospecção", complexidade: "padrao", lod: "LOD 400", contrato_id: contratoId };
    const m = UI.modal(`<h2>${p.id ? "Editar projeto" : "Novo projeto"}</h2>
      <form class="form-grid" novalidate>
        ${d.gestorGeral ? `<div class="field full"><label for="pj-nome">Nome do projeto</label><input class="input" id="pj-nome" maxlength="160" value="${esc(p.nome || "")}"></div>
        <div class="field"><label for="pj-org">Órgão ou cliente</label><input class="input" id="pj-org" maxlength="160" value="${esc(p.orgao || "")}"></div>
        <div class="field"><label for="pj-mun">Município</label><input class="input" id="pj-mun" maxlength="120" value="${esc(p.municipio || "")}"></div>` : ""}
        <div class="field"><label for="pj-st">Situação</label><select class="input" id="pj-st">${API.STATUS_PROJETO.map((s) => `<option${s === p.status ? " selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label for="pj-cx">Complexidade</label><select class="input" id="pj-cx"><option value="padrao"${p.complexidade !== "complexo" ? " selected" : ""}>Padrão</option><option value="complexo"${p.complexidade === "complexo" ? " selected" : ""}>Complexo</option></select></div>
        <div class="field"><label for="pj-h">Horas orçadas (total)</label><input class="input" id="pj-h" type="number" min="0" step="1" value="${p.horas_orcadas || ""}"></div>
        <div class="field"><label for="pj-lod">Nível de desenvolvimento</label><input class="input" id="pj-lod" maxlength="40" value="${esc(p.lod || "")}"></div>
        <div class="field"><label for="pj-ini">Início</label><input class="input" id="pj-ini" type="date" value="${p.inicio || ""}"></div>
        <div class="field"><label for="pj-fim">Término previsto</label><input class="input" id="pj-fim" type="date" value="${p.fim || ""}"></div>
      </form>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="pj-ok">Salvar</button></div>`);
    $("#pj-ok", m.el).onclick = async (ev) => {
      const x = { id: p.id, status: $("#pj-st", m.el).value, complexidade: $("#pj-cx", m.el).value, horas_orcadas: Number($("#pj-h", m.el).value) || 0, lod: $("#pj-lod", m.el).value.trim() || null, inicio: $("#pj-ini", m.el).value || null, fim: $("#pj-fim", m.el).value || null };
      if (d.gestorGeral) Object.assign(x, { nome: $("#pj-nome", m.el).value.trim(), orgao: $("#pj-org", m.el).value.trim() || null, municipio: $("#pj-mun", m.el).value.trim() || null });
      if (!p.id) { x.contrato_id = contratoId || null; x.valor = c ? c.valor : null; x.modalidade = c ? TIPOS_CONTRATO[c.tipo].nome : null; }
      if (d.gestorGeral && !x.nome) return toast("Dê um nome ao projeto.", "err");
      let id = null; if (await acao(ev.currentTarget, async () => { id = await API.proj.salvarProjeto(x); return true; }, "Projeto salvo.")) { m.fechar(); depois(id || p.id); }
    };
  }

  /* ---------- Área do cooperado ---------- */
  let selP = null;
  async function renderPainel(el, ctx) {
    const d = await carregar(ctx);
    if (selP) return renderProjeto(el, ctx, d, selP, () => { selP = null; renderPainel(el, ctx); });
    const me = d.me;
    const abs = abertas(d);
    const minhas = d.projetos.filter((p) => d.membro(p));
    const minhasAd = d.adesoes.filter((a) => a.perfil_id === me.id && a.status === "manifestada");
    const ord = abs.map((f) => ({ f, ok: compativel(f, d.eu), ja: d.adesoes.find((a) => a.funcao_id === f.id && a.perfil_id === me.id) })).sort((a, b) => Number(b.ok) - Number(a.ok));
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Trabalho</p><h1>Projetos</h1></div></div>
      <p class="muted">Aqui ficam as chamadas de adesão dos projetos, os projetos de que você participa e o andamento de todos. Participar é uma escolha sua: leia o BEP e os prazos antes de manifestar adesão. Seu perfil no site: <b>${esc(d.eu.categoria || "categoria não definida")}</b>${d.eu.conselho ? " · " + esc(d.eu.conselho) : ""} · dedicação atual ${Math.round(d.carga(me.id) * 100)}%.</p>
      <section class="painel"><h2>Chamadas de adesão abertas</h2>
        ${ord.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Projeto</th><th>Função</th><th>Perfil pedido</th><th>Prazo</th><th></th></tr></thead>
          <tbody>${ord.map(({ f, ok, ja }) => { const p = d.projetos.find((x) => x.id === f.projeto_id);
            return `<tr><td><b>${esc(p.nome)}</b><span class="sub">${esc(p.orgao || "")}</span></td><td>${esc(nomeFuncao(f))}<span class="sub">${f.vagas} vaga(s) · ${horas(f.horas_previstas)} previstas por pessoa</span></td>
              <td>${esc(f.categoria_min || "qualquer categoria")}${(f.conselhos || []).length ? " · " + esc(f.conselhos.join("/")) : ""}${ok ? '<span class="sub"><span class="selo ok">compatível com você</span></span>' : ""}</td>
              <td>${f.prazo_adesao ? data(f.prazo_adesao) : "—"}</td><td class="acoes-celula">${ja ? ST_ADES[ja.status] : ""} <button class="btn btn-ghost btn-sm" data-ver="${p.id}">Ver projeto e BEP</button></td></tr>`; }).join("")}</tbody></table></div>`
          : '<p class="vazio">Nenhuma chamada aberta no momento.</p>'}
      </section>
      <section class="painel"><h2>Meus projetos</h2>${minhas.length || minhasAd.length ? listaProjetos(d, [...new Set([...minhas, ...minhasAd.map((a) => d.projetos.find((p) => p.id === a.projeto_id))])].filter(Boolean)).replace(/data-abrir=/g, "data-ver=") : '<p class="vazio">Você ainda não está em nenhum projeto.</p>'}</section>
      <section class="painel"><h2>Todos os projetos</h2>${listaProjetos(d, d.projetos.filter((p) => p.status !== "Prospecção")).replace(/data-abrir=/g, "data-ver=")}</section>`;
    el.onclick = (e) => { const b = e.target.closest("[data-ver]"); if (b) { selP = b.dataset.ver; renderPainel(el, ctx); } };
  }

  /* ---------- Página do projeto (as duas áreas) ---------- */
  const abaDe = {};
  async function renderProjeto(el, ctx, d, pid, voltar) {
    const p = d.projetos.find((x) => x.id === pid); if (!p) return voltar();
    const me = d.me, gere = d.gere(p), membro = d.membro(p), c = d.contratoDe(p);
    if (p.status === "Arquivado") return renderArquivado(el, d, p, voltar);
    const veChat = !!p.coordenador_id && (membro || gere || me.conselho_fiscal);
    const aba = abaDe[pid] || (veChat ? "chat" : "bep");
    const fs = d.funcoes.filter((f) => f.projeto_id === pid);
    const ads = d.adesoes.filter((a) => a.projeto_id === pid);
    const aps = d.apontamentos.filter((a) => a.projeto_id === pid);
    const ms = d.marcos.filter((x) => x.projeto_id === pid).sort((a, b) => String(a.previsto || "9").localeCompare(String(b.previsto || "9")));
    const equipe = ads.filter((a) => a.status === "confirmada");
    const pendAp = aps.filter((a) => ["aberto", "corrigido", "contestado"].includes(a.status)).length;
    const abas = [...(p.coordenador_id ? [["chat", `Chat${d.novas[pid] ? ` <span class="contador">${d.novas[pid]}</span>` : ""}`]] : []), ["bep", "BEP e entregas"], ["equipe", "Chamadas e equipe"], ["horas", "Horas"], ["apont", `Apontamentos${pendAp ? ` <span class="contador">${pendAp}</span>` : ""}`], ["aval", "Avaliação"]];
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow"><button class="link-botao" id="pj-voltar">← Projetos</button></p><h1>${esc(p.nome)}</h1></div>${gere ? '<button class="btn btn-ghost" id="pj-editar">Editar dados</button>' : ""}</div>
      <dl class="sol-dados">
        <div><dt>Situação</dt><dd>${esc(p.status)} · ${p.complexidade === "complexo" ? "complexo" : "padrão"}</dd></div>
        <div><dt>Contrato</dt><dd>${c ? `${esc(TIPOS_CONTRATO[c.tipo] ? TIPOS_CONTRATO[c.tipo].nome : c.tipo)}${c.remunerado ? "" : " (gratuito)"}` : "sem contrato"}</dd></div>
        <div><dt>Coordenador</dt><dd>${esc(p.coordenador_nome || "a designar")}${p.coordenador_ato ? `<span class="sub" style="display:block">${esc(p.coordenador_ato)}</span>` : ""}</dd></div>
        <div><dt>Prazo</dt><dd>${p.inicio ? data(p.inicio) : "—"} a ${p.fim ? data(p.fim) : "—"}</dd></div>
        <div><dt>Horas orçadas</dt><dd>${horas(p.horas_orcadas || 0)}</dd></div>
      </dl>
      <p>${d.gestorGeral ? `<button class="btn btn-ghost btn-sm" id="pj-coord">${p.coordenador_id ? "Trocar coordenador" : "Designar coordenador"}</button> ` : ""}${gere && p.status === "Concluído" ? '<button class="btn btn-primary btn-sm" id="pj-arquivar">Exportar e arquivar o projeto</button>' : ""}</p>
      <nav class="subabas" role="tablist">${abas.map(([k, t]) => `<button role="tab" data-pa="${k}" aria-selected="${aba === k}">${t}</button>`).join("")}</nav>
      <div id="pj-corpo"></div>`;
    $("#pj-voltar").onclick = voltar;
    el.querySelectorAll("[data-pa]").forEach((b) => { b.onclick = () => { abaDe[pid] = b.dataset.pa; renderProjeto(el, ctx, d, pid, voltar); }; });
    const recarregar = async () => { const d2 = await carregar(ctx); renderProjeto(el, ctx, d2, pid, voltar); };
    if (gere && $("#pj-editar")) $("#pj-editar").onclick = () => modalProjeto(d, p, p.contrato_id, recarregar);
    if ($("#pj-coord")) $("#pj-coord").onclick = async () => {
      const pessoas = await API.proj.pessoas();
      const m = UI.modal(`<h2>Coordenador do projeto</h2><p class="muted">Escolhido na reunião interna. O coordenador verifica a compatibilização e a conformidade com o BEP e aprova as horas da equipe; não é chefe de ninguém (Regimento, art. 114).</p>
        <div class="form-grid"><div class="field full"><label for="dc-p">Cooperado</label><select class="input" id="dc-p">${pessoas.map((x) => `<option value="${x.id}"${x.id === p.coordenador_id ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></div>
        <div class="field full"><label for="dc-a">Ato da designação</label><input class="input" id="dc-a" maxlength="200" placeholder="Ex.: ata da reunião interna de 15/11/2026"></div></div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="dc-ok">Designar</button></div>`);
      $("#dc-ok", m.el).onclick = async (ev) => { if (await acao(ev.currentTarget, () => API.proj.designarCoordenador(pid, $("#dc-p", m.el).value, $("#dc-a", m.el).value.trim()), "Coordenador designado.")) { m.fechar(); recarregar(); } };
    };
    const corpo = $("#pj-corpo");
    if ($("#pj-arquivar")) $("#pj-arquivar").onclick = () => modalArquivar(d, p, voltar);

    /* ---- Chat ---- */
    if (aba === "chat") {
      if (!veChat) { corpo.innerHTML = '<p class="vazio">O chat é da equipe do projeto. Ele abre quando o coordenador é designado e cada integrante entra ao ser confirmado na equipe.</p>'; return; }
      const podeEscrever = membro || gere;
      corpo.innerHTML = `<section class="painel pchat"><h2>Chat do projeto</h2>
          <p class="hint">Todos os assuntos do projeto ficam aqui: decisões, resultados de simulações, sugestões e documentos. Aprovações, entradas na equipe, apontamentos e entregas são registrados sozinhos. Ao arquivar o projeto, a conversa e os anexos são exportados e guardados pela cooperativa.</p>
          <div class="pchat-msgs" id="pc-msgs"><p class="hint">Carregando…</p></div>
          ${podeEscrever ? `<form id="pc-f" class="pchat-f" novalidate><textarea class="input" id="pc-t" rows="2" maxlength="4000" placeholder="Escreva sua mensagem (Enter envia, Shift+Enter quebra a linha)"></textarea>
            <div class="pchat-acoes"><label class="btn btn-ghost btn-sm pchat-anexo">Anexar PDF ou imagem<input type="file" id="pc-a" accept="application/pdf,image/png,image/jpeg" hidden></label><span class="hint" id="pc-an"></span><button class="btn btn-primary btn-sm" type="submit" id="pc-env">Enviar</button></div></form>` : '<p class="hint">Você está vendo o chat como Conselho Fiscal (só leitura).</p>'}
        </section>`;
      const box = $("#pc-msgs"); let msgs = [], ult = "";
      const hora = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const desenhar = () => {
        const fim = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        box.innerHTML = msgs.length ? msgs.map((m) => m.tipo === "sistema" ? `<p class="pchat-sis">${esc(m.texto)} <span class="hint">${hora(m.criado_em)}</span></p>`
          : `<div class="pchat-msg ${m.autor_id === me.id ? "minha" : ""}"><b>${esc(m.autor_nome || "")}</b> <span class="hint">${hora(m.criado_em)}</span>${m.texto ? `<p>${esc(m.texto).replace(/\n/g, "<br>")}</p>` : ""}
            ${m.anexo_caminho ? `<button class="pchat-arq" data-anexo="${m.id}">📎 ${esc(m.anexo_nome || "anexo")}${m.anexo_tamanho ? " · " + UI.bytes(m.anexo_tamanho) : ""}</button>` : ""}</div>`).join("") : '<p class="hint">Nenhuma mensagem ainda.</p>';
        if (fim || !ult) box.scrollTop = box.scrollHeight;
      };
      const buscar = async () => {
        const novas = await API.proj.mensagens(pid, ult || null).catch(() => []);
        if (novas.length) { msgs = msgs.concat(novas.filter((n) => !msgs.some((m) => m.id === n.id))); ult = msgs[msgs.length - 1].criado_em; visto.gravar(me.id, pid, ult); desenhar(); }
        else if (!msgs.length) desenhar();
      };
      await buscar();
      const timer = setInterval(() => { if (!document.body.contains(box)) return clearInterval(timer); buscar(); }, 5000);
      box.onclick = async (e) => { const b = e.target.closest("[data-anexo]"); if (!b) return; const m = msgs.find((x) => x.id === b.dataset.anexo); const url = await acao(null, () => API.proj.linkAnexo(m)); if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; if (url.startsWith("data:")) a.download = m.anexo_nome || "anexo"; document.body.appendChild(a); a.click(); a.remove(); } };
      if (podeEscrever) {
        const arq = $("#pc-a");
        arq.onchange = () => { const f = arq.files[0]; $("#pc-an").textContent = f ? `${f.name} (${UI.bytes(f.size)})` : ""; };
        const enviar = async () => {
          const t = $("#pc-t").value.trim(), f = arq.files[0] || null; if (!t && !f) return;
          const ok = await acao($("#pc-env"), () => API.proj.enviarMensagem(pid, t, f));
          if (ok !== false) { $("#pc-t").value = ""; arq.value = ""; $("#pc-an").textContent = ""; await buscar(); box.scrollTop = box.scrollHeight; }
        };
        $("#pc-f").addEventListener("submit", (e) => { e.preventDefault(); enviar(); });
        $("#pc-t").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } });
      }
      return;
    }

    /* ---- BEP e entregas ---- */
    if (aba === "bep") {
      const b = p.bep || {};
      corpo.innerHTML = `
        <section class="painel"><div class="painel-cab"><h2>Plano de Execução BIM (BEP)</h2>${gere ? '<button class="btn btn-ghost btn-sm" id="bep-ed">Editar BEP</button>' : ""}</div>
          <p class="hint">O BEP traduz o contrato em regras de trabalho. É ele, junto com o contrato e os Manuais de Disciplina, que orienta a equipe, e não a vontade de alguém (Lei 12.690/2012, art. 2º, §1º). Leia antes de manifestar adesão.</p>
          ${p.cde_url ? `<p>Arquivos do projeto (CDE): <a href="${esc(p.cde_url)}" target="_blank" rel="noopener">${esc(p.cde_url)}</a></p>` : ""}
          ${BEP.some(([k]) => (b[k] || "").trim()) ? `<dl class="bep-lista">${BEP.filter(([k]) => (b[k] || "").trim()).map(([k, t]) => `<div><dt>${esc(t)}</dt><dd>${esc(b[k]).replace(/\n/g, "<br>")}</dd></div>`).join("")}</dl>` : '<p class="vazio">O BEP ainda não foi preenchido.</p>'}
        </section>
        <section class="painel"><h2>Entregas e prazos</h2>
          <p class="hint">Nenhuma entrega sai sem o relatório de conformidade do coordenador (Plano Quinquenal, Protocolo de Auditoria) e sem apontamentos impeditivos em aberto.</p>
          ${ms.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Entrega</th><th>Previsto</th><th>Situação</th>${gere ? "<th></th>" : ""}</tr></thead>
            <tbody>${ms.map((x) => `<tr><td>${esc(x.titulo)}${x.observacao ? `<span class="sub">${esc(x.observacao)}</span>` : ""}${x.parcela_id && d.parcelas.find((y) => y.id === x.parcela_id) ? `<span class="sub">libera: ${esc(d.parcelas.find((y) => y.id === x.parcela_id).descricao)}</span>` : ""}</td><td>${x.previsto ? data(x.previsto) : "—"}</td>
              <td>${x.entregue_em ? `<span class="selo ok">entregue ${data(x.entregue_em)}</span><span class="sub">conformidade: ${esc(x.conformidade_nome || "")}</span>` : x.previsto && x.previsto < UI.hoje() ? '<span class="selo err">atrasada</span>' : '<span class="selo warn">a entregar</span>'}</td>
              ${gere ? `<td class="acoes-celula">${x.entregue_em ? "" : `<button class="btn btn-primary btn-sm" data-entregar="${x.id}">Registrar entrega</button> `}<button class="btn btn-ghost btn-sm" data-delmarco="${x.id}">Apagar</button></td>` : ""}</tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhuma entrega cadastrada.</p>'}
          ${gere ? `<form class="form-grid" id="mc-f" novalidate><div class="field"><label for="mc-t">Entrega</label><input class="input" id="mc-t" maxlength="160" placeholder="Ex.: Anteprojeto de arquitetura"></div><div class="field"><label for="mc-d">Previsto para</label><input class="input" id="mc-d" type="date"></div>
            <div class="field"><label for="mc-p">Parcela que esta entrega libera</label><select class="input" id="mc-p"><option value="">Nenhuma</option>${(c ? d.parcelas.filter((x) => x.contrato_id === c.id && !ms.some((m) => m.parcela_id === x.id)) : []).map((x) => `<option value="${x.id}">${esc(x.descricao)} · ${moeda(x.valor)}</option>`).join("")}</select></div>
            <div class="field"><label>&nbsp;</label><button class="btn btn-ghost" type="submit">Adicionar entrega</button></div></form>` : ""}
        </section>`;
      if ($("#bep-ed")) $("#bep-ed").onclick = () => {
        const m = UI.modal(`<h2>BEP — ${esc(p.nome)}</h2><div class="form-grid">
          <div class="field full"><label for="bp-cde">Link do ambiente de arquivos (CDE)</label><input class="input" id="bp-cde" maxlength="400" value="${esc(p.cde_url || "")}" placeholder="https://..."></div>
          ${BEP.map(([k, t, h]) => `<div class="field full"><label for="bp-${k}">${esc(t)}</label><textarea class="input" id="bp-${k}" rows="3" placeholder="${esc(h)}">${esc(b[k] || "")}</textarea></div>`).join("")}</div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="bp-ok">Salvar BEP</button></div>`);
        $("#bp-ok", m.el).onclick = async (ev) => {
          const nb = {}; BEP.forEach(([k]) => { const v = $("#bp-" + k, m.el).value.trim(); if (v) nb[k] = v; });
          const url = $("#bp-cde", m.el).value.trim(); if (url && !/^https?:\/\//i.test(url)) return toast("O link precisa começar com https://", "err");
          if (await acao(ev.currentTarget, () => API.proj.salvarProjeto({ id: p.id, bep: nb, cde_url: url || null }), "BEP salvo.")) { m.fechar(); recarregar(); }
        };
      };
      if ($("#mc-f")) $("#mc-f").addEventListener("submit", async (ev) => { ev.preventDefault(); const t = $("#mc-t").value.trim(); if (!t) return toast("Descreva a entrega.", "err"); if (await acao(ev.submitter, () => API.proj.salvarMarco({ projeto_id: pid, titulo: t, previsto: $("#mc-d").value || null, parcela_id: $("#mc-p").value || null }), "Entrega adicionada.")) recarregar(); });
      corpo.onclick = async (e) => {
        const be = e.target.closest("[data-entregar]"), bd = e.target.closest("[data-delmarco]");
        if (bd) { if (await acao(bd, () => API.proj.excluirMarco(bd.dataset.delmarco), "Entrega apagada.")) recarregar(); return; }
        if (be) {
          const imp = aps.filter((a) => a.impeditivo && ["aberto", "corrigido", "contestado"].includes(a.status));
          if (imp.length) return toast(`Há ${imp.length} apontamento(s) impeditivo(s) em aberto. Resolva antes de entregar.`, "err");
          if (p.coordenador_id !== me.id && !d.ca) return toast("Quem assina o relatório de conformidade é o coordenador do projeto.", "err");
          const m = UI.modal(`<h2>Registrar entrega</h2><p>Ao registrar, você assina o <b>relatório de conformidade</b>: confirma que a entrega atende ao BEP, sem interferências impeditivas e com o modelo e a planilha coerentes.</p>
            <div class="form-grid"><div class="field"><label for="en-d">Entregue em</label><input class="input" id="en-d" type="date" value="${UI.hoje()}" max="${UI.hoje()}"></div><div class="field full"><label for="en-o">Observações (opcional)</label><input class="input" id="en-o" maxlength="300"></div></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="en-ok">Assinar e registrar</button></div>`);
          $("#en-ok", m.el).onclick = async (ev) => { if (await acao(ev.currentTarget, () => API.proj.salvarMarco({ id: be.dataset.entregar, projeto_id: pid, entregue_em: $("#en-d", m.el).value, observacao: $("#en-o", m.el).value.trim() || null, conformidade: true }), "Entrega registrada.")) { m.fechar(); recarregar(); } };
        }
      };
    }

    /* ---- Chamadas e equipe ---- */
    if (aba === "equipe") {
      const pessoasEq = equipe.map((a) => a.nome);
      corpo.innerHTML = `
        <section class="painel"><h2>Equipe</h2>
          ${equipe.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th>Função</th><th class="num">Horas previstas</th><th class="num">Horas aprovadas</th></tr></thead>
            <tbody>${equipe.map((a) => { const f = fs.find((x) => x.id === a.funcao_id); return `<tr><td>${esc(a.nome)}${a.categoria ? `<span class="sub">${esc(a.categoria)}${a.conselho ? " · " + esc(a.conselho) : ""}</span>` : ""}</td><td>${f ? esc(nomeFuncao(f)) : "—"}</td><td class="num">${horas(f ? f.horas_previstas : 0)}</td><td class="num" data-hap="${a.perfil_id}">…</td></tr>`; }).join("")}</tbody></table></div>`
            : '<p class="vazio">Equipe ainda não formada.</p>'}
          <p class="hint">A coordenação não é hierarquia: cada um tem o seu papel. O coordenador e o supervisor apontam falhas e sugerem; o que orienta todos são o contrato, o BEP e os Manuais de Disciplina. O tamanho da equipe é combinado entre o coordenador e a própria equipe.</p>
        </section>
        <section class="painel"><div class="painel-cab"><h2>Chamadas de adesão</h2>${gere ? '<button class="btn btn-primary btn-sm" id="fn-nova">Abrir chamada</button>' : ""}</div>
          ${fs.filter((f) => f.funcao !== "coordenacao" || gere).length ? fs.filter((f) => f.funcao !== "coordenacao" || gere).map((f) => {
            const as = ads.filter((a) => a.funcao_id === f.id); const minha = as.find((a) => a.perfil_id === me.id);
            const ocup = as.filter((a) => a.status === "confirmada").length; const ok = compativel(f, d.eu);
            const prazoOk = !f.prazo_adesao || f.prazo_adesao >= UI.hoje();
            return `<div class="chamada"><div class="painel-cab"><h3>${esc(nomeFuncao(f))} <span class="sub">${ocup}/${f.vagas} confirmada(s)</span></h3>
                <span>${f.status === "aberta" ? (prazoOk ? `<span class="selo ok">aberta${f.prazo_adesao ? " até " + data(f.prazo_adesao) : ""}</span>` : '<span class="selo">prazo encerrado</span>') : `<span class="selo">${esc(f.status)}</span>`}
                ${gere ? ` <button class="btn btn-ghost btn-sm" data-fn-ed="${f.id}">Editar</button>` : ""}</span></div>
              <p>${esc(f.atribuicoes || (FUNCOES[f.funcao] || {}).texto || "")}</p>
              <p class="hint">Perfil: ${esc(f.categoria_min || "qualquer categoria")}${(f.conselhos || []).length ? " · registro " + esc(f.conselhos.join(" ou ")) : ""} · ${horas(f.horas_previstas)} previstas por pessoa · cada pessoa participa de até ${d.limite(f.funcao, p)} projeto(s) ${p.complexidade === "complexo" ? "complexo(s)" : "padrão"} nesta função</p>
              ${!gere && f.status === "aberta" && prazoOk ? (minha && minha.status !== "desistiu" ? `<p>${ST_ADES[minha.status]}${minha.motivo ? `<span class="sub">${esc(minha.motivo)}</span>` : ""} ${["manifestada", "confirmada"].includes(minha.status) ? `<button class="btn btn-ghost btn-sm" data-desistir="${minha.id}">Desistir</button>` : ""}</p>`
                : `<p>${ok ? '<span class="selo ok">compatível com o seu perfil</span>' : '<span class="selo warn">seu perfil não atende ao pedido</span>'} <button class="btn btn-primary btn-sm" data-aderir="${f.id}"${ok ? "" : " disabled"}>Manifestar adesão</button></p>`) : minha ? `<p>${ST_ADES[minha.status]}${minha.motivo ? `<span class="sub">${esc(minha.motivo)}</span>` : ""}</p>` : ""}
              ${as.length && (gere || membro) ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th>Mensagem</th><th>Situação</th>${gere ? "<th></th>" : ""}</tr></thead>
                <tbody>${as.map((a) => `<tr><td>${esc(a.nome)}${gere ? ` <span data-faixa="${a.perfil_id}"></span>` : ""}<span class="sub">${esc(a.categoria || "")}${a.conselho ? " · " + esc(a.conselho) : ""} · dedicação atual ${Math.round(d.carga(a.perfil_id) * 100)}%</span></td><td>${esc(a.mensagem || "")}</td><td>${ST_ADES[a.status]}${a.motivo ? `<span class="sub">${esc(a.motivo)}</span>` : ""}</td>
                  ${gere ? `<td class="acoes-celula">${a.status === "manifestada" ? `<button class="btn btn-primary btn-sm" data-dec="${a.id}:confirmada">Confirmar</button> <button class="btn btn-ghost btn-sm" data-dec="${a.id}:nao_selecionada">Não selecionar</button>` : a.status === "confirmada" && f.funcao !== "coordenacao" ? `<button class="btn btn-ghost btn-sm" data-dec="${a.id}:encerrada">Encerrar participação</button>` : ""}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : ""}
            </div>`; }).join("") : '<p class="vazio">Nenhuma chamada aberta ainda.</p>'}
        </section>`;
      if (gere) API.igcc.faixas(pid).then((fx) => fx.forEach((x) => corpo.querySelectorAll(`[data-faixa="${x.perfil_id}"]`).forEach((sp) => { sp.textContent = "IGCC: " + x.faixa; sp.className = "selo " + ({ "acima da média": "ok", "na média": "info", "abaixo da média": "warn" }[x.faixa] || ""); }))).catch(() => {});
      API.proj.horasProjeto(pid).then((hs) => { corpo.querySelectorAll("[data-hap]").forEach((td) => { td.textContent = horas(hs.filter((h) => h.cooperado_id === td.dataset.hap && h.tipo === "produtiva" && (h.aprovacao || "aprovada") === "aprovada").reduce((t, h) => t + Number(h.horas), 0)); }); }).catch(() => corpo.querySelectorAll("[data-hap]").forEach((td) => { td.textContent = "—"; }));
      ctxOrc = orcamento(d, p, []);
      if ($("#fn-nova")) $("#fn-nova").onclick = () => modalFuncao(p, null, recarregar);
      corpo.onclick = async (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.fnEd) return modalFuncao(p, fs.find((f) => f.id === b.dataset.fnEd), recarregar);
        if (b.dataset.aderir) {
          const f = fs.find((x) => x.id === b.dataset.aderir);
          const m = UI.modal(`<h2>Manifestar adesão</h2><p><b>${esc(nomeFuncao(f))}</b> em ${esc(p.nome)}.</p>
            <p class="muted">Ao manifestar adesão, você declara que leu o BEP e os prazos e que atua dentro da sua habilitação (Estatuto, art. 9º, XIV). A decisão de participar é sua; a confirmação da equipe é combinada com o coordenador do projeto.</p>
            <div class="field"><label for="ad-m">Conte em poucas linhas sua experiência com isso e sua disponibilidade (opcional)</label><textarea class="input" id="ad-m" rows="3" maxlength="600"></textarea></div>
            <label class="ciente"><input type="checkbox" id="ad-li"> <span>Li o BEP e os prazos deste projeto.</span></label>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="ad-ok">Manifestar adesão</button></div>`);
          $("#ad-ok", m.el).onclick = async (ev) => { if (!$("#ad-li", m.el).checked) return toast("Confirme que leu o BEP e os prazos.", "err");
            if (await acao(ev.currentTarget, () => API.proj.aderir(f.id, { projeto_id: pid, mensagem: $("#ad-m", m.el).value.trim(), categoria: d.eu.categoria, conselho: d.eu.conselho }), "Adesão manifestada. O coordenador do projeto vai conversar com você.")) { m.fechar(); recarregar(); } };
          return;
        }
        if (b.dataset.desistir) { if (!(await confirmar("Desistir desta função?", "Desistir"))) return; if (await acao(b, () => API.proj.decidirAdesao(b.dataset.desistir, "desistiu"), "Pronto.")) recarregar(); return; }
        if (b.dataset.dec) {
          const [id, st] = b.dataset.dec.split(":");
          let motivo = null;
          if (st === "nao_selecionada" || st === "encerrada") {
            motivo = await new Promise((ok) => { const mm = UI.modal(`<h2>${st === "encerrada" ? "Encerrar participação" : "Não selecionar"}</h2><div class="field"><label for="ds-m">Motivo (o cooperado vê, por transparência)</label><input class="input" id="ds-m" maxlength="300" placeholder="${st === "encerrada" ? "Ex.: etapa concluída" : "Ex.: vagas preenchidas por quem manifestou antes; perfil mais aderente à disciplina"}"></div>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-primary btn-sm" id="ds-ok">Confirmar</button></div>`, () => ok(undefined));
              $("#ds-ok", mm.el).onclick = () => { const v = $("#ds-m", mm.el).value.trim(); if (!v) return toast("Escreva o motivo.", "err"); ok(v); mm.fechar(); }; });
            if (motivo === undefined) return;
          }
          if (await acao(b, () => API.proj.decidirAdesao(id, st, motivo), st === "confirmada" ? "Confirmado na equipe." : "Registrado.")) recarregar();
        }
      };
    }

    /* ---- Horas ---- */
    if (aba === "horas") {
      corpo.innerHTML = '<p class="hint">Carregando…</p>';
      const hs = await API.proj.horasProjeto(pid).catch(() => []);
      const aprovador = (h) => h.cooperado_id !== me.id && ((p.coordenador_id === me.id && h.cooperado_id !== p.coordenador_id) || d.ca);
      const visiveis = hs.filter((h) => gere || d.ca || h.cooperado_id === me.id);
      const pend = visiveis.filter((h) => h.tipo === "produtiva" && h.aprovacao === "pendente" && aprovador(h));
      const exec = hs.filter((h) => h.tipo === "produtiva" && (h.aprovacao || "aprovada") === "aprovada").reduce((t, h) => t + Number(h.horas), 0);
      const ieo = p.horas_orcadas && exec ? p.horas_orcadas / exec : null;
      const orc = gere || d.ca || me.conselho_fiscal ? orcamento(d, p, hs) : null;
      const selo = (h) => h.tipo !== "produtiva" ? "" : h.aprovacao === "pendente" ? '<span class="selo warn">aguardando aprovação</span>' : h.aprovacao === "devolvida" ? `<span class="selo err">devolvida</span><span class="sub">${esc(h.aprov_motivo || "")}</span>` : `<span class="selo ok">aprovada</span>${h.aprovado_nome ? `<span class="sub">${esc(h.aprovado_nome)}</span>` : ""}`;
      corpo.innerHTML = `
        <div class="kpis"><div class="kpi"><span class="rot">Horas orçadas</span><span class="val">${horas(p.horas_orcadas || 0)}</span></div>
          <div class="kpi"><span class="rot">Horas aprovadas</span><span class="val">${horas(exec)}</span><span class="det">${p.horas_orcadas ? Math.round(exec / p.horas_orcadas * 100) + "% do orçado" : ""}</span></div>
          <div class="kpi"><span class="rot">IEO ${p.status === "Concluído" ? "" : "(parcial)"}</span><span class="val">${ieo ? ieo.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</span><span class="det">orçadas ÷ executadas · faixa 0,95 a 1,05</span></div></div>
        ${orc ? htmlOrcamento(d, p, orc, me) : ""}
        <section class="painel"><h2>${gere || d.ca ? "Horas da equipe" : "Suas horas neste projeto"}</h2>
          <p class="hint">Horas de produção técnica só viram crédito depois de aprovadas: pelo coordenador do projeto ou, no caso das horas do próprio coordenador, por um membro do Conselho de Administração. Ninguém aprova as próprias horas. Se a hora for devolvida, corrija em "Minhas horas"; ela volta para aprovação.</p>
          ${pend.length ? `<div class="sol-acoes" style="margin-bottom:.8rem"><button class="btn btn-primary btn-sm" id="hr-apr">Aprovar selecionadas</button> <button class="btn btn-ghost btn-sm" id="hr-dev">Devolver selecionadas</button></div>` : ""}
          ${visiveis.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr>${pend.length ? '<th><input type="checkbox" id="hr-todas" aria-label="Selecionar todas"></th>' : ""}<th>Data</th><th>Cooperado</th><th>O que foi feito</th><th class="num">Horas</th><th>Situação</th></tr></thead>
            <tbody>${visiveis.map((h) => `<tr>${pend.length ? `<td>${pend.includes(h) ? `<input type="checkbox" data-hsel="${h.id}">` : ""}</td>` : ""}<td>${data(h.data)}</td><td>${esc(h.cooperado_nome || "")}<span class="sub">${esc(API.TIPOS_HORA[h.tipo] || h.tipo)}</span></td><td>${esc(h.descricao || "")}</td><td class="num">${horas(h.horas)}</td><td>${selo(h)}</td></tr>`).join("")}</tbody></table></div>`
            : '<p class="vazio">Nenhuma hora lançada neste projeto.</p>'}
        </section>`;
      const marcadas = () => [...corpo.querySelectorAll("[data-hsel]:checked")].map((x) => x.dataset.hsel);
      if ($("#hr-todas")) $("#hr-todas").onchange = (e) => corpo.querySelectorAll("[data-hsel]").forEach((x) => { x.checked = e.target.checked; });
      if ($("#hr-apr")) $("#hr-apr").onclick = async (ev) => {
        const ids = marcadas(); if (!ids.length) return toast("Marque as horas.", "err");
        if (orc && orc.c && orc.c.remunerado) {
          const extra = hs.filter((h) => ids.includes(h.id)).reduce((t, h) => { const o = orc.lista.find((x) => x.perfil_id === h.cooperado_id); return t + Number(h.horas) * (o ? o.custoHora : orc.custoHora("Pleno")); }, 0);
          const depois = orc.consumido + extra;
          if (depois > orc.disponivel + 0.5 && !(await confirmar(`Com estas horas, o projeto passa do orçamento: ${moeda(depois)} de ${moeda(orc.disponivel)} disponíveis (${pct(depois, orc.disponivel)}%). As horas viram crédito dos cooperados mesmo assim. Avise o Conselho de Administração no chat do projeto. Aprovar?`, "Aprovar mesmo assim"))) return;
        }
        if (await acao(ev.currentTarget, () => API.proj.aprovarHoras(ids, "aprovada"), "Horas aprovadas.")) recarregar();
      };
      if ($("#hr-dev")) $("#hr-dev").onclick = () => {
        const ids = marcadas(); if (!ids.length) return toast("Marque as horas.", "err");
        const m = UI.modal(`<h2>Devolver horas</h2><div class="field"><label for="dv-m">O que precisa ser ajustado (o cooperado vê)</label><input class="input" id="dv-m" maxlength="300" placeholder="Ex.: descrever a atividade; lançar no projeto certo; horas acima do previsto para a etapa"></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-danger btn-sm" id="dv-ok">Devolver</button></div>`);
        $("#dv-ok", m.el).onclick = async (ev) => { if (await acao(ev.currentTarget, () => API.proj.aprovarHoras(ids, "devolvida", $("#dv-m", m.el).value.trim()), "Horas devolvidas.")) { m.fechar(); recarregar(); } };
      };
    }

    /* ---- Apontamentos ---- */
    if (aba === "apont") {
      const pode = membro || gere;
      const lista = aps.slice().sort((a, b) => (["aberto", "corrigido", "contestado"].includes(b.status) - ["aberto", "corrigido", "contestado"].includes(a.status)) || String(b.criado_em).localeCompare(String(a.criado_em)));
      corpo.innerHTML = `
        <section class="painel"><div class="painel-cab"><h2>Apontamentos</h2>${pode ? '<button class="btn btn-primary btn-sm" id="ap-novo">Novo apontamento</button>' : ""}</div>
          <details class="asm-passo"><summary>Como funciona (e por que não é ordem de chefe)</summary><ol>
            <li>Qualquer membro da equipe pode apontar uma falha ou sugerir. Todo apontamento precisa dizer <b>em que se apoia</b>: o item do BEP, a cláusula do contrato, a exigência do cliente ou a norma técnica. Sem fundamento, não é apontamento.</li>
            <li>Quem recebe <b>corrige</b> ou <b>contesta</b> com justificativa técnica. Quem apontou confere a correção.</li>
            <li>Se houver contestação, decide o <b>Conselho de Administração</b>, ouvidos os dois lados, por um conselheiro que não seja parte (como no Regimento, art. 112, §2º).</li>
            <li>Se alguém, depois da decisão, se recusar a cumprir o que o contrato e o BEP exigem, o caso vai ao Conselho de Administração como possível descumprimento de dever (Estatuto, art. 9º, II e XI), pelo processo disciplinar do Regimento (art. 27), com direito de defesa. A exigência é do contrato, não de um superior.</li>
            <li>Apontamento marcado como <b>impeditivo</b> bloqueia a entrega até ser resolvido.</li></ol></details>
          ${lista.length ? lista.map((a) => {
            const souDest = a.destinatario_id ? a.destinatario_id === me.id : (membro && a.autor_id !== me.id);
            const acoes = [];
            if (a.status === "aberto" && souDest) acoes.push(`<button class="btn btn-primary btn-sm" data-ap="${a.id}:corrigido">Corrigi</button>`, `<button class="btn btn-ghost btn-sm" data-ap="${a.id}:contestado">Contestar</button>`);
            if (a.status === "aberto" && a.autor_id === me.id) acoes.push(`<button class="btn btn-ghost btn-sm" data-ap="${a.id}:cancelado">Cancelar</button>`);
            if (a.status === "corrigido" && a.autor_id === me.id) acoes.push(`<button class="btn btn-primary btn-sm" data-ap="${a.id}:resolvido">Confere, resolvido</button>`, `<button class="btn btn-ghost btn-sm" data-ap="${a.id}:aberto">Reabrir</button>`);
            if (a.status === "contestado" && d.ca && a.autor_id !== me.id && a.destinatario_id !== me.id) acoes.push(`<button class="btn btn-primary btn-sm" data-ap="${a.id}:decidir">Decidir (CA)</button>`);
            return `<article class="apont ${a.impeditivo ? "imped" : ""}"><div class="painel-cab"><h3>${esc(TIPOS_APONT[a.tipo] || a.tipo)}${a.disciplina ? " · " + esc(DISCIPLINAS[a.disciplina] || a.disciplina) : ""}${a.impeditivo ? ' <span class="selo err">impeditivo</span>' : ""}</h3>${ST_APONT[a.status] || ""}</div>
              <p>${esc(a.descricao).replace(/\n/g, "<br>")}</p>
              <p class="hint"><b>Fundamento:</b> ${esc(a.fundamento)} · de ${esc(a.autor_nome || "")} para ${esc(a.destinatario_nome || "a equipe")} · ${dataHora(a.criado_em)}${a.prazo ? " · prazo " + data(a.prazo) : ""}</p>
              ${a.resposta ? `<p class="hint"><b>Resposta:</b> ${esc(a.resposta)}</p>` : ""}
              ${a.decisao ? `<p class="hint"><b>Decisão do CA</b> (${esc(a.decidido_nome || "")}): ${esc(a.decisao)}</p>` : ""}
              ${acoes.length ? `<p>${acoes.join(" ")}</p>` : ""}</article>`; }).join("") : '<p class="vazio">Nenhum apontamento.</p>'}
        </section>`;
      if ($("#ap-novo")) $("#ap-novo").onclick = () => {
        const m = UI.modal(`<h2>Novo apontamento</h2><div class="form-grid">
          <div class="field"><label for="an-t">Tipo</label><select class="input" id="an-t">${opts(TIPOS_APONT)}</select></div>
          <div class="field"><label for="an-d">Disciplina</label><select class="input" id="an-d">${opts(DISCIPLINAS)}</select></div>
          <div class="field"><label for="an-p">Para</label><select class="input" id="an-p"><option value="">Toda a equipe</option>${equipe.filter((a) => a.perfil_id !== me.id).map((a) => `<option value="${a.perfil_id}">${esc(a.nome)}</option>`).filter((v, i, arr) => arr.indexOf(v) === i).join("")}</select></div>
          <div class="field"><label for="an-pr">Prazo para resposta</label><input class="input" id="an-pr" type="date"></div>
          <div class="field full"><label for="an-f">Fundamento (item do BEP, cláusula do contrato, exigência do cliente ou norma)</label><input class="input" id="an-f" maxlength="300" placeholder="Ex.: BEP, item LOD: estrutura em LOD 400 no executivo; NBR 6118"></div>
          <div class="field full"><label for="an-x">O que foi encontrado</label><textarea class="input" id="an-x" rows="4" maxlength="3000"></textarea></div>
          <label class="ciente full"><input type="checkbox" id="an-i"> <span>Impeditivo: bloqueia a entrega até ser resolvido</span></label></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="an-ok">Registrar</button></div>`);
        $("#an-ok", m.el).onclick = async (ev) => {
          const x = { projeto_id: pid, tipo: $("#an-t", m.el).value, disciplina: $("#an-d", m.el).value, destinatario_id: $("#an-p", m.el).value || null, prazo: $("#an-pr", m.el).value || null, fundamento: $("#an-f", m.el).value.trim(), descricao: $("#an-x", m.el).value.trim(), impeditivo: $("#an-i", m.el).checked };
          if (x.fundamento.length < 3) return toast("Diga em que o apontamento se apoia (item do BEP, cláusula, norma).", "err");
          if (x.descricao.length < 3) return toast("Descreva o que foi encontrado.", "err");
          if (await acao(ev.currentTarget, () => API.proj.apontar(x), "Apontamento registrado.")) { m.fechar(); recarregar(); }
        };
      };
      corpo.onclick = async (e) => {
        const b = e.target.closest("[data-ap]"); if (!b) return;
        const [id, st] = b.dataset.ap.split(":");
        if (st === "corrigido" || st === "contestado" || st === "aberto") {
          const v = await new Promise((ok) => { const mm = UI.modal(`<h2>${st === "corrigido" ? "O que foi corrigido" : st === "contestado" ? "Contestar" : "Reabrir"}</h2><div class="field"><label for="rs-m">${st === "contestado" ? "Justificativa técnica (vai ao Conselho de Administração)" : "Comentário"}</label><textarea class="input" id="rs-m" rows="3" maxlength="2000"></textarea></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-primary btn-sm" id="rs-ok">Enviar</button></div>`, () => ok(undefined));
            $("#rs-ok", mm.el).onclick = () => { const t = $("#rs-m", mm.el).value.trim(); if (!t && st !== "aberto") return toast("Escreva a resposta.", "err"); ok(t); mm.fechar(); }; });
          if (v === undefined) return;
          if (await acao(b, () => API.proj.atualizarApontamento(id, { status: st, resposta: v || null }), "Registrado.")) recarregar();
          return;
        }
        if (st === "decidir") {
          const a = aps.find((x) => x.id === id);
          const mm = UI.modal(`<h2>Decidir contestação</h2><p class="hint"><b>Apontamento:</b> ${esc(a.descricao)}<br><b>Fundamento:</b> ${esc(a.fundamento)}<br><b>Contestação:</b> ${esc(a.resposta || "")}</p>
            <div class="field"><label for="dc-t">Decisão e fundamento (ouvidos os dois lados)</label><textarea class="input" id="dc-t" rows="3" maxlength="2000"></textarea></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-ghost btn-sm" id="dc-np">O apontamento não procede</button><button class="btn btn-primary btn-sm" id="dc-pr">Procede: corrigir</button></div>`);
          const decidir = async (stt, ev) => { const t = $("#dc-t", mm.el).value.trim(); if (!t) return toast("Escreva a decisão.", "err"); if (await acao(ev.currentTarget, () => API.proj.atualizarApontamento(id, { status: stt, decisao: t }), "Decisão registrada.")) { mm.fechar(); recarregar(); } };
          $("#dc-np", mm.el).onclick = (ev) => decidir("cancelado", ev); $("#dc-pr", mm.el).onclick = (ev) => decidir("aberto", ev);
          return;
        }
        if (await acao(b, () => API.proj.atualizarApontamento(id, { status: st }), "Registrado.")) recarregar();
      };
    }

    /* ---- Avaliação entre pares ---- */
    if (aba === "aval") {
      const concl = p.status === "Concluído";
      const [minhas, resumo] = await Promise.all([concl && membro ? API.proj.minhasAvaliacoes(pid).catch(() => []) : [], API.proj.resumoAvaliacoes(pid).catch(() => [])]);
      const colegas = [...new Map(equipe.concat(ads.filter((a) => a.status === "encerrada")).filter((a) => a.perfil_id !== me.id).map((a) => [a.perfil_id, a])).values()];
      const falta = colegas.filter((a) => !minhas.some((x) => x.avaliado_id === a.perfil_id));
      corpo.innerHTML = `
        <section class="painel"><h2>Avaliação entre pares</h2>
          <p class="hint">Ao concluir o projeto, cada membro avalia os colegas em quatro critérios (1 a 5): qualidade técnica, cumprimento de prazos, colaboração e conformidade com o BEP. O resultado entra no Índice Global de Contribuição (Regimento, art. 92). Cada um vê só as próprias notas recebidas, sem saber quem deu; o coordenador, o CA e o Conselho Fiscal veem o resumo. A eficiência do projeto (IEO) é medida pelas horas, à parte.</p>
          ${!concl ? '<p class="vazio">A avaliação abre quando o projeto for marcado como Concluído.</p>' : !membro ? "" : falta.length ? falta.map((a) => `<form class="form-grid aval" data-aval="${a.perfil_id}" novalidate><h3 class="full">${esc(a.nome)}</h3>
              ${["qualidade", "prazos", "colaboracao", "conformidade"].map((k) => `<div class="field"><label>${{ qualidade: "Qualidade técnica", prazos: "Prazos", colaboracao: "Colaboração", conformidade: "Conformidade com o BEP" }[k]}</label><select class="input" name="${k}">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join("")}</select></div>`).join("")}
              <div class="field full"><label>Comentário (anônimo, opcional)</label><input class="input" name="comentario" maxlength="500"></div>
              <div class="full"><button class="btn btn-primary btn-sm" type="submit">Enviar avaliação</button></div></form>`).join("") : '<p class="hint">Você já avaliou todos os colegas deste projeto.</p>'}
          ${resumo.length ? `<h3 class="mini-tit">Resumo</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th class="num">Avaliações</th><th class="num">Qualidade</th><th class="num">Prazos</th><th class="num">Colaboração</th><th class="num">BEP</th></tr></thead>
            <tbody>${resumo.map((r) => `<tr><td>${esc(r.nome)}${(r.comentarios || []).length ? `<span class="sub">${r.comentarios.map(esc).join(" · ")}</span>` : ""}</td><td class="num">${r.n}</td><td class="num">${r.qualidade}</td><td class="num">${r.prazos}</td><td class="num">${r.colaboracao}</td><td class="num">${r.conformidade}</td></tr>`).join("")}</tbody></table></div>` : ""}
        </section>`;
      corpo.querySelectorAll("[data-aval]").forEach((f) => f.addEventListener("submit", async (ev) => {
        ev.preventDefault(); const fd = new FormData(f);
        const x = { projeto_id: pid, avaliado_id: f.dataset.aval, qualidade: +fd.get("qualidade"), prazos: +fd.get("prazos"), colaboracao: +fd.get("colaboracao"), conformidade: +fd.get("conformidade"), comentario: String(fd.get("comentario") || "").trim() || null };
        if (await acao(f.querySelector("button"), () => API.proj.avaliar(x), "Avaliação enviada.")) recarregar();
      }));
    }
  }

  let ctxOrc = null;
  function modalFuncao(p, f, depois) {
    f = f || { funcao: "projeto", disciplina: "arquitetura", vagas: 1, horas_previstas: 0, conselhos: [], status: "aberta", categoria_min: "Pleno" };
    const m = UI.modal(`<h2>${f.id ? "Editar chamada" : "Abrir chamada de adesão"}</h2>
      <p class="muted">Defina com a equipe o que o BEP pede para esta função. Quem tiver o perfil compatível é avisado no site (Regimento, art. 54).</p>
      <div class="form-grid">
        <div class="field"><label for="fn-f">Função</label><select class="input" id="fn-f">${opts(FUNCOES, f.funcao)}</select></div>
        <div class="field"><label for="fn-d">Disciplina</label><select class="input" id="fn-d">${opts(DISCIPLINAS, f.disciplina)}</select></div>
        <div class="field"><label for="fn-c">Categoria mínima</label><select class="input" id="fn-c"><option value="">Qualquer</option>${CATS.map((c) => `<option${c === f.categoria_min ? " selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label>Registro profissional aceito</label><div>${["CREA", "CAU", "CFT"].map((c) => `<label class="ciente" style="display:inline-flex;margin-right:.8rem"><input type="checkbox" data-cons="${c}" ${(f.conselhos || []).includes(c) ? "checked" : ""}> <span>${c}</span></label>`).join("")}</div><span class="hint">Nenhum marcado = qualquer um.</span></div>
        <div class="field"><label for="fn-v">Quantas pessoas</label><input class="input" id="fn-v" type="number" min="1" max="50" value="${f.vagas}"></div>
        <div class="field"><label for="fn-h">Horas previstas por pessoa</label><input class="input" id="fn-h" type="number" min="0" step="1" value="${f.horas_previstas || ""}"></div>
        <div class="field"><label for="fn-pr">Prazo para manifestar adesão</label><input class="input" id="fn-pr" type="date" value="${f.prazo_adesao || ""}"></div>
        <div class="field"><label for="fn-s">Situação</label><select class="input" id="fn-s"><option value="aberta"${f.status === "aberta" ? " selected" : ""}>Aberta</option><option value="fechada"${f.status === "fechada" ? " selected" : ""}>Fechada (equipe completa)</option><option value="cancelada"${f.status === "cancelada" ? " selected" : ""}>Cancelada</option></select></div>
        <p class="hint full" id="fn-custo"></p>
        <div class="field full"><label for="fn-a">Atribuições nesta função (o que o BEP pede)</label><textarea class="input" id="fn-a" rows="3" maxlength="1500">${esc(f.atribuicoes || "")}</textarea><span class="hint" id="fn-dica"></span></div>
      </div>
      <div class="modal-acoes">${f.id ? '<button class="btn btn-danger btn-sm" id="fn-del">Apagar</button>' : ""}<button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="fn-ok">Salvar</button></div>`);
    const dica = () => { const F = FUNCOES[$("#fn-f", m.el).value]; $("#fn-dica", m.el).textContent = F.texto ? "Sugestão: " + F.texto : ""; if (!f.id && F.cat) $("#fn-c", m.el).value = F.cat; };
    $("#fn-f", m.el).onchange = () => { dica(); custo(); }; dica();
    const custo = () => { if (!ctxOrc) return; const o = ctxOrc; const cat = $("#fn-c", m.el).value || "Pleno"; const cons = (m.el.querySelector("[data-cons]:checked") || {}).dataset; const ch = o.custoHora(cat, cons ? cons.cons : "CREA");
      const esta = (Number($("#fn-v", m.el).value) || 1) * (Number($("#fn-h", m.el).value) || 0) * ch; const antes = o.planejado - (f.id ? f.vagas * Number(f.horas_previstas || 0) * o.custoHora(f.categoria_min, (f.conselhos || [])[0]) : 0);
      $("#fn-custo", m.el).innerHTML = o.disponivel ? `Custo estimado desta função: <b>${moeda(esta)}</b> (${moeda(ch)}/h com encargos). Equipe planejada passa a <b>${moeda(antes + esta)}</b> de ${moeda(o.disponivel)} disponíveis${antes + esta > o.disponivel ? ' — <span style="color:var(--err)">acima do orçamento</span>' : ""}.` : ""; };
    m.el.querySelectorAll("#fn-c, #fn-v, #fn-h, [data-cons]").forEach((x) => { x.addEventListener("input", custo); x.addEventListener("change", custo); }); custo();
    if (f.id) $("#fn-del", m.el).onclick = async (ev) => { if (!(await confirmar("Apagar a chamada? As adesões a ela também saem.", "Apagar"))) return; if (await acao(ev.currentTarget, () => API.proj.excluirFuncao(f.id), "Chamada apagada.")) { m.fechar(); depois(); } };
    $("#fn-ok", m.el).onclick = async (ev) => {
      const x = { id: f.id, projeto_id: p.id, funcao: $("#fn-f", m.el).value, disciplina: $("#fn-d", m.el).value, categoria_min: $("#fn-c", m.el).value || null,
        conselhos: [...m.el.querySelectorAll("[data-cons]:checked")].map((c) => c.dataset.cons), vagas: Math.max(1, Number($("#fn-v", m.el).value) || 1), horas_previstas: Number($("#fn-h", m.el).value) || 0,
        prazo_adesao: $("#fn-pr", m.el).value || null, status: $("#fn-s", m.el).value, atribuicoes: $("#fn-a", m.el).value.trim() || FUNCOES[$("#fn-f", m.el).value].texto || null };
      if (await acao(ev.currentTarget, () => API.proj.salvarFuncao(x), "Chamada salva.")) { m.fechar(); depois(); }
    };
  }

  /* ---------- Projeto arquivado: só o resumo fica no site ---------- */
  function renderArquivado(el, d, p, voltar) {
    const r = p.resumo_arquivo || {};
    el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow"><button class="link-botao" id="pj-voltar">← Projetos</button></p><h1>${esc(p.nome)}</h1></div></div>
      <div class="notice">Projeto arquivado em ${dataHora(p.arquivado_em)} por ${esc(p.arquivado_nome || "")}. O chat, os anexos, o BEP, os apontamentos e a equipe foram exportados e guardados em: <b>${esc(p.arquivo_local || "")}</b>. No site ficam só o contrato, as parcelas, as horas e este resumo.</div>
      <dl class="sol-dados"><div><dt>Horas orçadas</dt><dd>${horas(r.horas_orcadas || 0)}</dd></div><div><dt>Horas aprovadas</dt><dd>${horas(r.horas_aprovadas || 0)}</dd></div><div><dt>IEO</dt><dd>${r.ieo ? Number(r.ieo).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</dd></div>
        <div><dt>Mensagens e anexos</dt><dd>${r.mensagens || 0} mensagens · ${r.anexos || 0} anexos</dd></div></dl>
      ${(r.equipe || []).length ? `<section class="painel"><h2>Equipe</h2><ul>${r.equipe.map((x) => `<li>${esc(x.nome)} — ${esc(x.funcao)}</li>`).join("")}</ul></section>` : ""}
      ${(r.avaliacoes || []).length ? `<section class="painel"><h2>Avaliação entre pares (médias)</h2><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th class="num">Qualidade</th><th class="num">Prazos</th><th class="num">Colaboração</th><th class="num">BEP</th></tr></thead>
        <tbody>${r.avaliacoes.map((a) => `<tr><td>${esc(a.nome)}</td><td class="num">${a.qualidade}</td><td class="num">${a.prazos}</td><td class="num">${a.colaboracao}</td><td class="num">${a.conformidade}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
    $("#pj-voltar").onclick = voltar;
  }

  /* ---------- Exportar (.zip) e arquivar ---------- */
  let jszip = null;
  function carregarZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jszip) return jszip;
    jszip = new Promise((ok, er) => { const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; sc.onload = () => ok(window.JSZip); sc.onerror = () => { jszip = null; er(new Error("Não consegui carregar o gerador de .zip. Verifique a internet e tente de novo.")); }; document.head.appendChild(sc); });
    return jszip;
  }
  const slug = (t) => String(t || "projeto").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "projeto";
  const pagina = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
    <style>body{font:15px/1.55 system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#111}h1{font-size:1.5rem}h2{font-size:1.15rem;margin-top:2rem;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%;font-size:.9rem}td,th{border:1px solid #ccc;padding:.35rem .5rem;text-align:left;vertical-align:top}.sis{color:#555;font-style:italic}.msg{margin:.6rem 0;padding:.5rem .7rem;background:#f4f6fa;border-radius:6px}.meta{color:#666;font-size:.85rem}</style></head><body>${corpo}</body></html>`;

  async function exportarZip(d, p, progresso) {
    const JSZip = await carregarZip();
    progresso("Juntando a conversa e os registros…");
    const [msgs, hs, aval] = await Promise.all([API.proj.mensagens(p.id), API.proj.horasProjeto(p.id).catch(() => []), API.proj.resumoAvaliacoes(p.id).catch(() => [])]);
    const c = d.contratoDe(p), fs = d.funcoes.filter((f) => f.projeto_id === p.id), ads = d.adesoes.filter((a) => a.projeto_id === p.id);
    const aps = d.apontamentos.filter((a) => a.projeto_id === p.id), ms = d.marcos.filter((m) => m.projeto_id === p.id), pcs = c ? d.parcelas.filter((x) => x.contrato_id === c.id) : [];
    const zip = new JSZip(); const pasta = zip.folder("anexos"); const nomes = {};
    let i = 0;
    for (const m of msgs.filter((x) => x.anexo_caminho)) {
      i++; progresso(`Baixando anexo ${i} de ${msgs.filter((x) => x.anexo_caminho).length}…`);
      let nome = String(i).padStart(3, "0") + "_" + (m.anexo_nome || "anexo").replace(/[\\/:*?"<>|]+/g, "_");
      nomes[m.id] = nome; pasta.file(nome, await API.proj.baixarAnexo(m));
    }
    const dt = (t) => (t ? new Date(t).toLocaleString("pt-BR") : "");
    const chat = pagina("Chat — " + p.nome, `<h1>Chat do projeto: ${esc(p.nome)}</h1><p class="meta">Exportado em ${dt(new Date())} · ${msgs.length} mensagens · ${Object.keys(nomes).length} anexos</p>` +
      msgs.map((m) => m.tipo === "sistema" ? `<p class="sis">[${dt(m.criado_em)}] ${esc(m.texto)}</p>` : `<div class="msg"><div class="meta"><b>${esc(m.autor_nome || "")}</b> · ${dt(m.criado_em)}</div>${m.texto ? `<div>${esc(m.texto).replace(/\n/g, "<br>")}</div>` : ""}${nomes[m.id] ? `<div>📎 <a href="anexos/${encodeURIComponent(nomes[m.id])}">${esc(m.anexo_nome || nomes[m.id])}</a></div>` : ""}</div>`).join(""));
    const tab = (cab, linhas) => linhas.length ? `<table><tr>${cab.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${linhas.map((l) => `<tr>${l.map((x) => `<td>${esc(x == null ? "" : x)}</td>`).join("")}</tr>`).join("")}</table>` : "<p>—</p>";
    const b = p.bep || {};
    const dossie = pagina("Projeto — " + p.nome, `<h1>${esc(p.nome)}</h1><p class="meta">BIMCORE Cooperativa de Trabalho · dossiê exportado em ${dt(new Date())}</p>
      <h2>Contrato</h2>${c ? tab(["Objeto", "Contratante", "Tipo", "Natureza", "Número", "Valor", "Assinatura", "Vigência"], [[c.objeto, c.contratante, (TIPOS_CONTRATO[c.tipo] || {}).nome || c.tipo, NATUREZA[c.natureza] || c.natureza, c.numero, c.remunerado ? moeda(c.valor) : "gratuito", c.assinatura, c.vigencia_fim]]) +
        "<h3>Parcelas</h3>" + tab(["Parcela", "Previsto", "Valor", "Recebido em", "Valor recebido", "NF"], pcs.map((x) => [x.descricao, x.previsto_em, moeda(x.valor), x.recebido_em, x.valor_recebido != null ? moeda(x.valor_recebido) : "", x.nota_fiscal])) : "<p>Sem contrato.</p>"}
      <h2>Projeto</h2>${tab(["Situação", "Complexidade", "Coordenador", "Designação", "Início", "Término", "Horas orçadas", "LOD", "CDE"], [[p.status, p.complexidade, p.coordenador_nome, p.coordenador_ato, p.inicio, p.fim, p.horas_orcadas, p.lod, p.cde_url]])}
      <h2>BEP</h2>${BEP.map(([k, t]) => b[k] ? `<h3>${esc(t)}</h3><p>${esc(b[k]).replace(/\n/g, "<br>")}</p>` : "").join("") || "<p>—</p>"}
      <h2>Chamadas de adesão</h2>${tab(["Função", "Categoria mínima", "Conselhos", "Vagas", "Horas previstas", "Prazo", "Situação", "Atribuições"], fs.map((f) => [nomeFuncao(f), f.categoria_min, (f.conselhos || []).join("/"), f.vagas, f.horas_previstas, f.prazo_adesao, f.status, f.atribuicoes]))}
      <h2>Adesões e equipe</h2>${tab(["Cooperado", "Função", "Situação", "Mensagem", "Motivo", "Decidido por", "Em"], ads.map((a) => { const f = fs.find((x) => x.id === a.funcao_id); return [a.nome, f ? nomeFuncao(f) : "", a.status, a.mensagem, a.motivo, a.decidido_nome, dt(a.decidido_em)]; }))}
      <h2>Entregas</h2>${tab(["Entrega", "Previsto", "Entregue em", "Conformidade", "Observação"], ms.map((m) => [m.titulo, m.previsto, m.entregue_em, m.conformidade_nome, m.observacao]))}
      <h2>Apontamentos</h2>${tab(["Data", "Tipo", "De", "Para", "Fundamento", "Descrição", "Impeditivo", "Situação", "Resposta", "Decisão do CA"], aps.map((a) => [dt(a.criado_em), TIPOS_APONT[a.tipo] || a.tipo, a.autor_nome, a.destinatario_nome || "equipe", a.fundamento, a.descricao, a.impeditivo ? "sim" : "não", a.status, a.resposta, a.decisao ? a.decisao + " (" + (a.decidido_nome || "") + ")" : ""]))}
      <h2>Horas lançadas</h2>${tab(["Data", "Cooperado", "Tipo", "Horas", "Descrição", "Aprovação", "Por"], hs.map((h) => [h.data, h.cooperado_nome, API.TIPOS_HORA[h.tipo] || h.tipo, h.horas, h.descricao, h.aprovacao, h.aprovado_nome]))}
      <h2>Avaliação entre pares (médias)</h2>${tab(["Cooperado", "Avaliações", "Qualidade", "Prazos", "Colaboração", "Conformidade com o BEP"], aval.map((a) => [a.nome, a.n, a.qualidade, a.prazos, a.colaboracao, a.conformidade]))}`);
    zip.file("1-chat.html", chat); zip.file("2-dossie-do-projeto.html", dossie);
    zip.file("dados.json", JSON.stringify({ projeto: p, contrato: c, parcelas: pcs, chamadas: fs, adesoes: ads, entregas: ms, apontamentos: aps, horas: hs, avaliacoes: aval, mensagens: msgs.map((m) => ({ ...m, anexo_dados: undefined, anexo_arquivo: nomes[m.id] || null })) }, null, 2));
    zip.file("LEIA-ME.txt", `Arquivo do projeto "${p.nome}" — BIMCORE Cooperativa de Trabalho.\r\nAbra 1-chat.html para a conversa (os anexos estão na pasta anexos) e 2-dossie-do-projeto.html para contrato, BEP, equipe, entregas, apontamentos, horas e avaliação.\r\ndados.json tem os mesmos dados em formato aberto.\r\nExportado em ${dt(new Date())}.`);
    progresso("Compactando…");
    const blob = await zip.generateAsync({ type: "blob" });
    const nome = `projeto-${slug(p.nome)}-${UI.hoje()}.zip`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    const exec = hs.filter((h) => h.tipo === "produtiva" && (h.aprovacao || "aprovada") === "aprovada").reduce((t, h) => t + Number(h.horas), 0);
    return { nome, resumo: { horas_orcadas: Number(p.horas_orcadas || 0), horas_aprovadas: exec, ieo: p.horas_orcadas && exec ? Math.round(p.horas_orcadas / exec * 100) / 100 : null,
      equipe: ads.filter((a) => ["confirmada", "encerrada"].includes(a.status)).map((a) => { const f = fs.find((x) => x.id === a.funcao_id); return { nome: a.nome, funcao: f ? nomeFuncao(f) : "" }; }),
      avaliacoes: aval.map((a) => ({ nome: a.nome, n: a.n, qualidade: a.qualidade, prazos: a.prazos, colaboracao: a.colaboracao, conformidade: a.conformidade })),
      mensagens: msgs.length, anexos: Object.keys(nomes).length, arquivo: nome, exportado_em: new Date().toISOString() } };
  }

  function modalArquivar(d, p, depois) {
    const equipe = d.adesoes.filter((a) => a.projeto_id === p.id && ["confirmada", "encerrada"].includes(a.status));
    let exp = null;
    const m = UI.modal(`<h2>Exportar e arquivar</h2>
      <p>Ao final do projeto, tudo vai para o arquivo da cooperativa e sai do site, para não pesar.</p>
      <ol class="asm-passo-lista">
        <li><b>Antes:</b> confira se a equipe já fez a avaliação entre pares (${equipe.length} integrante(s)) — depois de arquivar, ela fecha.</li>
        <li><b>Baixe o arquivo do projeto (.zip)</b>: chat completo com os anexos, dossiê (contrato, BEP, equipe, entregas, apontamentos, horas, avaliação) e os dados em formato aberto.</li>
        <li><b>Guarde o .zip no armazenamento da cooperativa</b> e abra para conferir.</li>
        <li><b>Informe onde guardou</b> e confirme. O site apaga o chat, os anexos, o BEP, as chamadas, os apontamentos e as entregas. Ficam só o contrato, as parcelas, as horas lançadas (que sustentam as retiradas) e um resumo do projeto.</li></ol>
      <div class="sol-acoes"><button class="btn btn-primary btn-sm" id="aq-zip">1. Baixar arquivo do projeto (.zip)</button><span class="hint" id="aq-prog"></span></div>
      <div class="form-grid" style="margin-top:1rem"><div class="field full"><label for="aq-loc">Onde o arquivo foi guardado</label><input class="input" id="aq-loc" maxlength="300" placeholder="Ex.: Google Drive da BIMCORE / Projetos / 2027 / Escola X" disabled></div>
        <label class="ciente full"><input type="checkbox" id="aq-ok" disabled> <span>Guardei o .zip, abri e conferi o chat e os anexos. Entendo que o site vai apagar esses registros.</span></label></div>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-danger btn-sm" id="aq-apagar" disabled>2. Arquivar e apagar do site</button></div>`);
    const prog = (t) => { $("#aq-prog", m.el).textContent = t; };
    $("#aq-zip", m.el).onclick = async (ev) => {
      const ok = await acao(ev.currentTarget, async () => { exp = await exportarZip(d, p, prog); return true; }, "Arquivo baixado. Guarde-o e confira.");
      if (ok) { prog(`Baixado: ${exp.nome}`); ["#aq-loc", "#aq-ok"].forEach((s) => { $(s, m.el).disabled = false; }); }
      else prog("");
    };
    const liberar = () => { $("#aq-apagar", m.el).disabled = !(exp && $("#aq-ok", m.el).checked && $("#aq-loc", m.el).value.trim().length >= 3); };
    $("#aq-ok", m.el).onchange = liberar; $("#aq-loc", m.el).oninput = liberar;
    $("#aq-apagar", m.el).onclick = async (ev) => {
      if (!(await confirmar(`Apagar do site os registros de trabalho de "${p.nome}"? Isso não pode ser desfeito; o que vale daqui em diante é o arquivo guardado.`, "Arquivar e apagar"))) return;
      if (await acao(ev.currentTarget, () => API.proj.arquivar(p.id, $("#aq-loc", m.el).value.trim(), exp.resumo), "Projeto arquivado.")) { m.fechar(); depois(); }
    };
  }

  window.Projetos = { renderInterno, renderPainel, contador, anuncio, TIPOS_CONTRATO, NATUREZA, FUNCOES, DISCIPLINAS };
})();
