/* BIMCORE — Página do Conselho Fiscal (Estatuto, arts. 60 e 67; Regimento, arts. 46-47, 82-86 e 170)
   O CF fiscaliza: confere, dá parecer, registra inconformidades e apura denúncias. Não lança nem aprova atos de gestão.
   A coordenação (Conselho de Administração) vê inconformidades e relatórios e responde aos pedidos de esclarecimento. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API, Fin = window.Fin;
  const { $, esc, data, dataHora, moeda, acao, confirmar, toast } = UI;
  let aba = null;

  const ORIGENS = ["Conferência do saldo", "Guias de INSS e IR", "Prestação dos 20%", "Isonomia remuneratória", "Correção de horas", "Denúncia ou reclamação", "Outro"];
  const ST_INC = { aberta: '<span class="selo warn">aberta</span>', arquivada: '<span class="selo">arquivada</span>', esclarecimento: '<span class="selo info">esclarecimento pedido ao CA</span>', respondida: '<span class="selo info">respondida pelo CA</span>', irregularidade: '<span class="selo err">irregularidade: levar à Assembleia</span>' };
  const ST_DEN = { recebida: '<span class="selo warn">recebida</span>', em_apuracao: '<span class="selo info">em apuração</span>', procedente: '<span class="selo err">procedente</span>', improcedente: '<span class="selo ok">improcedente</span>', arquivada: '<span class="selo">arquivada</span>' };
  const TIPO_HORA = (k) => (API.TIPOS_HORA[k] || k || "").split(" (")[0];
  const hoje = () => UI.hoje();

  function modalForm(titulo, corpoHtml, rotuloOk, aoConfirmar) {
    const m = UI.modal(`<h2>${titulo}</h2>${corpoHtml}<div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="mf-ok">${rotuloOk}</button></div>`);
    $("#mf-ok", m.el).onclick = async (e) => { const ok = await aoConfirmar(m, e.currentTarget); if (ok) m.fechar(); };
    return m;
  }

  async function render(el, ctx) {
    document.body.classList.remove("so-leitura");
    const cf = !!ctx.fiscal;
    const abas = cf
      ? [["conferencias", "Conferências do mês"], ["prestacoes", "Prestação dos 20%"], ["isonomia", "Isonomia"], ["correcoes", "Correções de horas"], ["inconformidades", "Inconformidades"], ["denuncias", "Denúncias e reclamações"], ["relatorios", "Relatórios ao CA"]]
      : [["inconformidades", "Inconformidades"], ["relatorios", "Relatórios do CF"], ["prestacoes", "Prestação dos 20%"]];
    if (!aba || !abas.some(([k]) => k === aba)) aba = abas[0][0];
    const recarregar = () => render(el, ctx);

    const [incs, rels, prests, dens] = await Promise.all([
      API.cf.inconformidades().catch(() => []), API.cf.relatorios().catch(() => []), API.cf.prestacoes().catch(() => []),
      cf ? API.cf.denuncias().catch(() => []) : Promise.resolve([])
    ]);
    const abertasInc = incs.filter((i) => i.status === "aberta").length;
    const esclar = incs.filter((i) => i.status === "esclarecimento").length;
    const aguardPrest = prests.filter((p) => p.status === "aguardando_cf").length;
    const denAbertas = dens.filter((d) => d.status === "recebida" || d.status === "em_apuracao").length;
    const cont = { inconformidades: cf ? abertasInc : esclar, prestacoes: cf ? aguardPrest : 0, denuncias: denAbertas };

    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">${cf ? "Fiscalização" : "Conselho de Administração"}</p><h1>Conselho Fiscal</h1></div></div>
      <p class="muted">${cf ? "O Conselho Fiscal confere, dá parecer, registra inconformidades e apura denúncias. Não lança nem aprova atos de gestão: isso é da administração, para que a fiscalização continue independente (Regimento, art. 82)." : "Aqui o Conselho de Administração acompanha as inconformidades e os relatórios do Conselho Fiscal e responde aos pedidos de esclarecimento (Regimento, arts. 85 e 86)."}</p>
      <nav class="subabas" role="tablist">${abas.map(([k, t]) => `<button role="tab" data-aba="${k}" aria-selected="${aba === k}">${t}${cont[k] ? ` <span class="contador">${cont[k]}</span>` : ""}</button>`).join("")}</nav>
      <div id="cf-corpo"></div>`;
    el.querySelectorAll("[data-aba]").forEach((b) => { b.onclick = () => { aba = b.dataset.aba; recarregar(); }; });
    const corpo = $("#cf-corpo", el);
    corpo.onclick = null;

    /* ---------- Conferências: saldo em caixa e guias ---------- */
    if (aba === "conferencias") {
      const [base, guias, confs] = await Promise.all([API.fin.tudo(), API.cf.guias().catch(() => []), API.cf.conferencias().catch(() => [])]);
      const saldos = (base.saldos || []).slice(0, 12);
      const confDe = (tipo, id) => confs.find((k) => k.tipo === tipo && k.ref_id === id);
      const selo = (k) => k ? `<span class="selo ${k.situacao === "conferido" ? "ok" : "err"}">${k.situacao}</span><span class="sub">${esc(k.conselheiro_nome || "")} · ${dataHora(k.criado_em)}${k.observacao ? " · " + esc(k.observacao) : ""}</span>` : '<span class="selo warn">a conferir</span>';
      const esp = window.Tesouraria.guiasEsperadas(base);
      const regDe = (t, m) => Fin.centavos(guias.filter((g) => g.tipo === t && Fin.mesDe(g.competencia) === m).reduce((x, g) => x + Number(g.valor), 0));
      corpo.innerHTML = `
        <section class="painel"><h2>Saldo em caixa</h2>
          <p class="hint">Todo mês, confira o saldo registrado pela tesouraria com o extrato do BTG (Estatuto, art. 67, b e c). Peça o extrato à tesouraria se precisar; você tem acesso a todos os documentos (art. 67, §1º).</p>
          ${saldos.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th class="num">Saldo registrado</th><th>Registrado por</th><th>Conferência</th><th></th></tr></thead>
            <tbody>${saldos.map((x) => { const k = confDe("saldo", x.id); return `<tr><td>${data(x.data)}${x.observacao ? `<span class="sub">${esc(x.observacao)}</span>` : ""}</td><td class="num">${moeda(x.saldo)}</td><td>${esc(x.registrado_nome || "")}</td><td>${selo(k)}</td>
              <td class="acoes-celula">${k ? "" : `<button class="btn btn-primary btn-sm" data-conf-saldo="${x.id}">Conferir</button>`}</td></tr>`; }).join("")}</tbody></table></div>` : '<p class="vazio">A tesouraria ainda não registrou nenhum saldo.</p>'}
        </section>
        <section class="painel"><h2>Guias de INSS e IR</h2>
          <p class="hint">Compare o esperado pelas retiradas pagas com o que a tesouraria registrou como recolhido (Estatuto, art. 67, m e n; Regimento, art. 84, IV). INSS = 11% retido + 20% patronal.</p>
          ${esp.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Competência</th><th class="num">INSS esperado</th><th class="num">INSS registrado</th><th class="num">IRRF esperado</th><th class="num">IRRF registrado</th></tr></thead>
            <tbody>${esp.map((e) => { const a = regDe("INSS", e.mes), b = regDe("IRRF", e.mes); const c = (x, y) => `<span class="selo ${Math.abs(x - y) < 0.01 ? "ok" : "err"}">${moeda(y)}</span>`;
              return `<tr><td>${Fin.nomeMes(e.mes)}</td><td class="num">${moeda(e.INSS)}</td><td class="num">${c(e.INSS, a)}</td><td class="num">${moeda(e.IRRF)}</td><td class="num">${c(e.IRRF, b)}</td></tr>`; }).join("")}</tbody></table></div>` : '<p class="vazio">Ainda não há retiradas pagas.</p>'}
          ${guias.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Competência</th><th>Tipo</th><th class="num">Valor</th><th>Pago em</th><th>Conferência</th><th></th></tr></thead>
            <tbody>${guias.map((g) => { const k = confDe("guia", g.id); return `<tr><td>${Fin.nomeMes(Fin.mesDe(g.competencia))}${g.observacao ? `<span class="sub">${esc(g.observacao)}</span>` : ""}</td><td>${esc(g.tipo)}</td><td class="num">${moeda(g.valor)}</td><td>${data(g.pago_em)}</td><td>${selo(k)}</td>
              <td class="acoes-celula">${k ? "" : `<button class="btn btn-primary btn-sm" data-conf-guia="${g.id}">Conferir</button>`}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
        </section>`;
      corpo.onclick = (ev) => {
        const b = ev.target.closest("[data-conf-saldo],[data-conf-guia]"); if (!b) return;
        const tipo = b.dataset.confSaldo ? "saldo" : "guia", id = b.dataset.confSaldo || b.dataset.confGuia;
        const item = tipo === "saldo" ? saldos.find((x) => x.id === id) : guias.find((x) => x.id === id);
        const ref = tipo === "saldo" ? `Saldo de ${data(item.data)}: ${moeda(item.saldo)}` : `Guia ${item.tipo} de ${Fin.nomeMes(Fin.mesDe(item.competencia))}: ${moeda(item.valor)}`;
        modalForm("Registrar conferência", `<p class="muted">${esc(ref)}</p>
          <div class="field"><label for="cf-sit">Resultado</label><select class="input" id="cf-sit"><option value="conferido">Conferido: bate com o extrato/comprovante</option><option value="divergente">Divergente</option></select></div>
          <div class="field"><label for="cf-obs">Observação</label><input class="input" id="cf-obs" maxlength="300" placeholder="Ex.: conferido com o extrato do BTG de 31/10"></div>
          <label class="ciente"><input type="checkbox" id="cf-inc" checked> <span>Se divergente, abrir uma inconformidade</span></label>`, "Registrar", async (m, btn) => {
          const sit = $("#cf-sit", m.el).value, obs = $("#cf-obs", m.el).value.trim();
          if (sit === "divergente" && !obs) { toast("Descreva a divergência.", "err"); return false; }
          const ok = await acao(btn, async () => {
            await API.cf.conferir({ tipo, ref_id: id, referencia: ref, situacao: sit, observacao: obs || null });
            if (sit === "divergente" && $("#cf-inc", m.el).checked) await API.cf.salvarInconformidade({ titulo: "Divergência: " + ref, descricao: obs, origem: tipo === "saldo" ? "Conferência do saldo" : "Guias de INSS e IR" });
            return true;
          }, "Conferência registrada.");
          if (ok) recarregar(); return ok;
        });
      };
    }

    /* ---------- Prestação de contas trimestral dos 20% ---------- */
    if (aba === "prestacoes") {
      const T = window.Tesouraria;
      corpo.innerHTML = `<section class="painel"><h2>Prestação de contas trimestral dos 20%</h2>
        <p class="hint">A tesouraria prepara; ${cf ? "você" : "o Conselho Fiscal"} confere e dá o parecer; só então ela pode publicar aos cooperados (Estatuto, art. 23, §8º; Regimento, art. 170).</p>
        ${prests.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Trimestre</th><th>Situação</th><th class="num">20% arrecadados</th><th class="num">Saldo</th><th>Parecer</th><th></th></tr></thead>
          <tbody>${prests.map((x) => `<tr><td>${T.nomeTri(x.trimestre)}<span class="sub">preparada por ${esc(x.preparado_nome || "")} em ${dataHora(x.preparado_em)}</span></td><td>${T.STATUS_PREST[x.status] || esc(x.status)}</td>
            <td class="num">${moeda(x.dados.totais.custo_op)}</td><td class="num">${moeda(x.dados.totais.saldo)}</td><td>${x.parecer ? esc(x.parecer) : "—"}</td>
            <td class="acoes-celula"><button class="btn ${cf && x.status === "aguardando_cf" ? "btn-primary" : "btn-ghost"} btn-sm" data-prest="${x.trimestre}">${cf && x.status === "aguardando_cf" ? "Conferir" : "Ver"}</button></td></tr>`).join("")}</tbody></table></div>`
          : '<p class="vazio">A tesouraria ainda não enviou nenhuma prestação.</p>'}</section>`;
      corpo.onclick = (ev) => {
        const b = ev.target.closest("[data-prest]"); if (!b) return;
        const x = prests.find((p) => p.trimestre === b.dataset.prest);
        const podeConferir = cf && x.status === "aguardando_cf";
        const m = UI.modal(`<h2>Prestação do ${T.nomeTri(x.trimestre)}</h2>${T.STATUS_PREST[x.status] || ""}${T.htmlPrestacao(x.dados)}
          ${x.parecer ? `<div class="notice"><b>Parecer:</b> ${esc(x.parecer)}</div>` : ""}
          ${podeConferir ? `<div class="field"><label for="pr-par">Parecer do Conselho Fiscal</label><textarea class="input" id="pr-par" rows="3" placeholder="Ex.: Conferido com os extratos e os comprovantes das despesas. Sem ressalvas."></textarea></div>` : ""}
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button>${podeConferir ? '<button class="btn btn-danger btn-sm" id="pr-dev">Devolver com divergência</button><button class="btn btn-primary btn-sm" id="pr-ok">Conferido: liberar publicação</button>' : ""}</div>`);
        if (podeConferir) {
          const enviar = async (st, btn) => {
            const p = $("#pr-par", m.el).value.trim(); if (!p) return toast(st === "conferida" ? "Escreva o parecer." : "Descreva a divergência.", "err");
            if (await acao(btn, () => API.cf.conferirPrestacao(x.trimestre, st, p), st === "conferida" ? "Prestação conferida. A tesouraria já pode publicar." : "Prestação devolvida à tesouraria.")) { m.fechar(); recarregar(); }
          };
          $("#pr-ok", m.el).onclick = (e) => enviar("conferida", e.currentTarget);
          $("#pr-dev", m.el).onclick = (e) => enviar("devolvida", e.currentTarget);
        }
      };
    }

    /* ---------- Isonomia remuneratória (Estatuto, art. 67, i) ---------- */
    if (aba === "isonomia") {
      const [base, perfis, expAll] = await Promise.all([API.fin.tudo(), API.cooperados.listar().catch(() => []), API.exp.todos().catch(() => ({ habilitacoes: [], experiencias: [] }))]);
      base.habilitacoes = expAll.habilitacoes; base.experiencias = expAll.experiencias;
      const calc = Fin.calcular(base);
      const perfil = {}; perfis.forEach((p) => { perfil[p.id] = p; });
      const m0 = Fin.mesDe(hoje()), meses = [0, 1, 2].map((k) => Fin.somaMes(m0, -k)), ano = Fin.somaMes(m0, -11);
      const linhas = (base.cooperados || []).filter((c) => c.situacao !== "desligado").map((c) => {
        const p = calc[c.id], pf = perfil[c.perfil_id] || {};
        const hs = (base.horas_mes || []).filter((h) => h.fin_cooperado_id === c.id && meses.includes(Fin.mesDe(h.mes)));
        const s = (k) => hs.reduce((t, h) => t + Number(h[k] || 0), 0);
        const ret12 = (base.retiradas || []).filter((r) => r.fin_cooperado_id === c.id && r.status === "paga" && r.pago_em && Fin.mesDe(r.pago_em) >= ano).reduce((t, r) => t + Number(r.valor), 0);
        return { c, gestao: pf.papel === "coordenacao" || !!pf.tesouraria, papel: pf.papel === "coordenacao" ? "Conselho de Administração" : pf.tesouraria ? "Tesouraria" : "", enq: p.enquadramento || {}, vh: p.valor_hora, hp: s("produtivas"), hf: s("formacao"), ha: s("administrativas"), ret12 };
      });
      corpo.innerHTML = `<section class="painel"><h2>Isonomia remuneratória</h2>
        <p class="hint">Verifique se ninguém recebe vantagem por exercer cargo de gestão ou fiscalização (Estatuto, art. 67, i). O valor-hora deve sair só da categoria e do conselho. As horas de suporte administrativo de quem é da gestão merecem atenção: elas não podem ser pagamento pelo cargo, que é voluntário (Estatuto, art. 53, §1º; Regimento, art. 76).</p>
        <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th>Categoria</th><th class="num">Valor-hora</th><th class="num">Produção (3 meses)</th><th class="num">Formação</th><th class="num">Suporte adm.</th><th class="num">Retiradas (12 meses)</th></tr></thead>
          <tbody>${linhas.map((l) => `<tr><td>${esc(l.c.nome)}${l.papel ? `<span class="sub">${esc(l.papel)}${l.c.cargo ? " · " + esc(l.c.cargo) : ""}</span>` : l.c.cargo ? `<span class="sub">${esc(l.c.cargo)}</span>` : ""}</td>
            <td>${esc(l.enq.categoria || "—")}${l.enq.conselho ? `<span class="sub">${esc(l.enq.conselho)}</span>` : ""}</td><td class="num">${moeda(l.vh)}</td>
            <td class="num">${UI.horas(l.hp)}</td><td class="num">${UI.horas(l.hf)}</td><td class="num">${l.gestao && l.ha ? `<span class="selo warn">${UI.horas(l.ha)}</span>` : UI.horas(l.ha)}</td><td class="num">${moeda(l.ret12)}</td></tr>`).join("")}</tbody></table></div>
        <p class="hint">Em amarelo: horas de suporte administrativo de quem também tem papel de gestão. Peça a descrição dessas horas e confira se são execução técnica (planilhas, conciliação, documentos), e não atos do cargo.</p></section>`;
    }

    /* ---------- Correções de horas ---------- */
    if (aba === "correcoes") {
      const hist = await API.producao.historico().catch(() => []);
      const desc = (h) => h ? `${data(h.data)} · ${UI.horas(h.horas)} · ${esc(TIPO_HORA(h.tipo))}${h.descricao ? `<span class="sub">${esc(h.descricao)}</span>` : ""}` : "—";
      corpo.innerHTML = `<section class="painel"><h2>Correções de horas</h2>
        <p class="hint">Toda edição ou exclusão de horas lançadas fica registrada aqui, com o antes e o depois. Corrigir é normal; fique atento a correções grandes, repetidas ou feitas muito depois do lançamento.</p>
        ${hist.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Quando</th><th>Cooperado</th><th>Ação</th><th>Antes</th><th>Depois</th><th>Feita por</th></tr></thead>
          <tbody>${hist.map((h) => `<tr><td>${dataHora(h.em)}</td><td>${esc(h.cooperado_nome || "—")}</td><td><span class="selo ${h.acao === "excluido" ? "err" : "info"}">${h.acao === "excluido" ? "excluído" : "editado"}</span></td>
            <td>${desc(h.antes)}</td><td>${desc(h.depois)}</td><td>${esc(h.por_nome || "—")}${h.por_id && h.por_id !== h.cooperado_id ? '<span class="sub">outra pessoa</span>' : ""}</td></tr>`).join("")}</tbody></table></div>`
          : '<p class="vazio">Nenhuma correção de horas registrada.</p>'}</section>`;
    }

    /* ---------- Inconformidades (Regimento, art. 85) ---------- */
    if (aba === "inconformidades") {
      corpo.innerHTML = `${cf ? `<section class="painel"><h2>Nova inconformidade</h2>
          <form id="in-f" class="form-grid" novalidate>
            <div class="field full"><label for="in-tit">O que foi identificado</label><input class="input" id="in-tit" maxlength="200"></div>
            <div class="field"><label for="in-ori">Origem</label><select class="input" id="in-ori">${ORIGENS.map((o) => `<option>${o}</option>`).join("")}</select></div>
            <div class="field full"><label for="in-desc">Descrição e evidências</label><textarea class="input" id="in-desc" rows="3"></textarea></div>
            <div class="full"><button class="btn btn-primary" id="in-btn" type="submit">Registrar</button></div>
          </form>
          <p class="hint">Cada inconformidade vai para a próxima reunião do CF, que decide por maioria: arquivar, pedir esclarecimento ao Conselho de Administração ou classificar como irregularidade a ser levada à Assembleia Geral (Regimento, art. 85).</p></section>` : ""}
        <section class="painel"><h2>Inconformidades</h2>
          ${incs.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Registrada</th><th>Inconformidade</th><th>Situação</th><th>Decisão e resposta</th><th></th></tr></thead>
            <tbody>${incs.map((i) => `<tr><td>${dataHora(i.criado_em)}<span class="sub">${esc(i.criado_nome || "")}</span></td><td><b>${esc(i.titulo)}</b><span class="sub">${esc(i.origem || "")}${i.descricao ? " · " + esc(i.descricao) : ""}</span></td>
              <td>${ST_INC[i.status] || esc(i.status)}</td>
              <td>${i.decisao ? esc(i.decisao) : "—"}${i.resposta_ca ? `<span class="sub"><b>Resposta do CA</b> (${esc(i.respondido_nome || "")}, ${dataHora(i.respondido_em)}): ${esc(i.resposta_ca)}</span>` : ""}</td>
              <td class="acoes-celula">${cf && i.status !== "arquivada" && i.status !== "irregularidade" ? `<button class="btn btn-ghost btn-sm" data-decidir="${i.id}">Decidir</button>` : ""}${!cf && i.status === "esclarecimento" ? `<button class="btn btn-primary btn-sm" data-responder="${i.id}">Responder</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
            : '<p class="vazio">Nenhuma inconformidade registrada.</p>'}
        </section>`;
      const f = $("#in-f", el);
      if (f) f.addEventListener("submit", async (e) => {
        e.preventDefault(); const t = $("#in-tit", el).value.trim(); if (!t) return toast("Descreva o que foi identificado.", "err");
        if (await acao($("#in-btn", el), () => API.cf.salvarInconformidade({ titulo: t, origem: $("#in-ori", el).value, descricao: $("#in-desc", el).value.trim() || null }), "Inconformidade registrada.")) recarregar();
      });
      corpo.onclick = (ev) => {
        const bd = ev.target.closest("[data-decidir]"), br = ev.target.closest("[data-responder]");
        if (bd) {
          const i = incs.find((x) => x.id === bd.dataset.decidir);
          modalForm("Decisão do Conselho Fiscal", `<p class="muted"><b>${esc(i.titulo)}</b></p>
            <div class="field"><label for="dc-st">Decisão da reunião</label><select class="input" id="dc-st">
              <option value="arquivada">Arquivar</option><option value="esclarecimento">Pedir esclarecimento ao Conselho de Administração</option><option value="irregularidade">Classificar como irregularidade (levar à Assembleia Geral)</option></select></div>
            <div class="field"><label for="dc-txt">Fundamento da decisão</label><textarea class="input" id="dc-txt" rows="3">${esc(i.decisao || "")}</textarea></div>`, "Registrar decisão", async (m, btn) => {
            const st = $("#dc-st", m.el).value, txt = $("#dc-txt", m.el).value.trim(); if (!txt) { toast("Escreva o fundamento.", "err"); return false; }
            const ok = await acao(btn, () => API.cf.salvarInconformidade({ id: i.id, status: st, decisao: txt, decidido_em: new Date().toISOString() }), "Decisão registrada.");
            if (ok) recarregar(); return ok;
          });
        }
        if (br) {
          const i = incs.find((x) => x.id === br.dataset.responder);
          modalForm("Esclarecimento ao Conselho Fiscal", `<p class="muted"><b>${esc(i.titulo)}</b><br>${esc(i.decisao || "")}</p>
            <div class="field"><label for="rs-txt">Resposta do Conselho de Administração</label><textarea class="input" id="rs-txt" rows="4"></textarea></div>`, "Enviar resposta", async (m, btn) => {
            const t = $("#rs-txt", m.el).value.trim(); if (!t) { toast("Escreva a resposta.", "err"); return false; }
            const ok = await acao(btn, () => API.cf.responderInconformidade(i.id, t), "Resposta enviada ao Conselho Fiscal.");
            if (ok) recarregar(); return ok;
          });
        }
      };
    }

    /* ---------- Denúncias e reclamações (Regimento, arts. 46-47) ---------- */
    if (aba === "denuncias") {
      const h = hoje();
      corpo.innerHTML = `<section class="painel"><h2>Denúncias e reclamações</h2>
        <p class="hint">Apure em até 30 dias, prorrogáveis uma vez por igual período com decisão fundamentada, garantindo o direito de defesa (Regimento, art. 47, §1º). Se for improcedente, arquive preservando o sigilo das duas partes (§2º). Durante a apuração, o CF pode propor ao Conselho de Administração o afastamento cautelar do denunciado das funções de coordenação ou administração. Se a denúncia envolver alguém do próprio CF, essa pessoa não participa da apuração.</p>
        ${dens.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Protocolo</th><th>Assunto</th><th>Quem enviou</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
          <tbody>${dens.map((d) => { const aberta = d.status === "recebida" || d.status === "em_apuracao"; const atras = aberta && d.prazo < h; return `<tr><td>${esc(d.protocolo)}<span class="sub">${d.tipo === "denuncia" ? "denúncia" : "reclamação"} · ${dataHora(d.criado_em)}</span></td>
            <td>${esc(d.assunto)}</td><td>${d.sigilosa ? '<span class="selo">sigilosa</span>' : esc(d.autor_nome || "—")}</td>
            <td>${aberta ? `<span class="selo ${atras ? "err" : "warn"}">${data(d.prazo)}</span>${d.prorrogada ? '<span class="sub">prorrogado</span>' : ""}` : "—"}</td>
            <td>${ST_DEN[d.status] || esc(d.status)}${d.afastamento_proposto ? '<span class="sub">afastamento cautelar proposto</span>' : ""}</td>
            <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-den="${d.id}">Abrir</button></td></tr>`; }).join("")}</tbody></table></div>`
          : '<p class="vazio">Nenhuma denúncia ou reclamação recebida.</p>'}</section>`;
      corpo.onclick = (ev) => {
        const b = ev.target.closest("[data-den]"); if (!b) return;
        const d = dens.find((x) => x.id === b.dataset.den);
        const m = UI.modal(`<h2>${d.tipo === "denuncia" ? "Denúncia" : "Reclamação"} ${esc(d.protocolo)}</h2>
          <dl class="sol-dados"><div><dt>Enviada em</dt><dd>${dataHora(d.criado_em)}</dd></div><div><dt>Quem enviou</dt><dd>${d.sigilosa ? "Sigilosa" : esc(d.autor_nome || "—")}</dd></div><div><dt>Prazo</dt><dd>${data(d.prazo)}${d.prorrogada ? " (prorrogado)" : ""}</dd></div></dl>
          <p><b>${esc(d.assunto)}</b></p><p style="white-space:pre-line">${esc(d.descricao)}</p>${d.envolvidos ? `<p class="muted">Envolvidos: ${esc(d.envolvidos)}</p>` : ""}
          <div class="form-grid">
            <div class="field"><label for="dn-st">Situação</label><select class="input" id="dn-st">${Object.keys(ST_DEN).map((k) => `<option value="${k}" ${d.status === k ? "selected" : ""}>${{ recebida: "Recebida", em_apuracao: "Em apuração", procedente: "Procedente", improcedente: "Improcedente", arquivada: "Arquivada" }[k]}</option>`).join("")}</select></div>
            <div class="field full"><label for="dn-conc">Conclusão / andamento (quem enviou vê a conclusão quando encerrada)</label><textarea class="input" id="dn-conc" rows="3">${esc(d.conclusao || "")}</textarea></div>
          </div>
          <label class="ciente"><input type="checkbox" id="dn-af" ${d.afastamento_proposto ? "checked" : ""}> <span>Propor ao Conselho de Administração o afastamento cautelar do denunciado (art. 47)</span></label>
          ${!d.prorrogada && (d.status === "recebida" || d.status === "em_apuracao") ? '<label class="ciente"><input type="checkbox" id="dn-pr"> <span>Prorrogar o prazo por mais 30 dias (uma única vez, com decisão fundamentada na conclusão)</span></label>' : ""}
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-primary btn-sm" id="dn-ok">Salvar</button></div>`);
        $("#dn-ok", m.el).onclick = async (e) => {
          const st = $("#dn-st", m.el).value, conc = $("#dn-conc", m.el).value.trim();
          if (["procedente", "improcedente", "arquivada"].includes(st) && !conc) return toast("Escreva a conclusão antes de encerrar.", "err");
          const upd = { status: st, conclusao: conc || null, afastamento_proposto: $("#dn-af", m.el).checked };
          const pr = $("#dn-pr", m.el);
          if (pr && pr.checked) { if (!conc) return toast("Fundamente a prorrogação na conclusão/andamento.", "err"); const nd = new Date(d.prazo + "T12:00:00"); nd.setDate(nd.getDate() + 30); upd.prazo = nd.toISOString().slice(0, 10); upd.prorrogada = true; }
          if (await acao(e.currentTarget, () => API.cf.atualizarDenuncia(d.id, upd), "Registro atualizado.")) { m.fechar(); recarregar(); }
        };
      };
    }

    /* ---------- Relatórios trimestrais ao CA (Regimento, art. 86) ---------- */
    if (aba === "relatorios") {
      const T = window.Tesouraria;
      corpo.innerHTML = `${cf ? `<section class="painel"><h2>Novo relatório trimestral</h2>
          <form id="rl-f" class="form-grid" novalidate>
            <div class="field"><label for="rl-per">Período</label><select class="input" id="rl-per">${[0, 1, 2, 3].map((k) => T.trimestreDe(Fin.somaMes(Fin.mesDe(hoje()), -3 * k))).map((t) => `<option value="${t}">${T.nomeTri(t)}</option>`).join("")}</select></div>
            <div class="field full"><label for="rl-conc">Conclusões</label><textarea class="input" id="rl-conc" rows="4" placeholder="O que foi conferido no trimestre e o que se encontrou."></textarea></div>
            <div class="field full"><label for="rl-rec">Recomendações</label><textarea class="input" id="rl-rec" rows="3"></textarea></div>
            <div class="full"><button class="btn btn-primary" id="rl-btn" type="submit">Enviar ao Conselho de Administração</button></div>
          </form></section>` : ""}
        <section class="painel"><h2>Relatórios</h2>
          ${rels.length ? rels.map((r) => `<article class="comunicado"><h3>${esc(T.nomeTri(r.periodo))}</h3><span class="meta">${esc(r.criado_nome || "")} · ${dataHora(r.criado_em)}</span>
            <p style="white-space:pre-line"><b>Conclusões.</b> ${esc(r.conclusoes)}</p>${r.recomendacoes ? `<p style="white-space:pre-line"><b>Recomendações.</b> ${esc(r.recomendacoes)}</p>` : ""}</article>`).join("") : '<p class="vazio">Nenhum relatório enviado ainda.</p>'}
        </section>`;
      const f = $("#rl-f", el);
      if (f) f.addEventListener("submit", async (e) => {
        e.preventDefault(); const c = $("#rl-conc", el).value.trim(); if (!c) return toast("Escreva as conclusões.", "err");
        if (await acao($("#rl-btn", el), () => API.cf.salvarRelatorio({ periodo: $("#rl-per", el).value, conclusoes: c, recomendacoes: $("#rl-rec", el).value.trim() || null }), "Relatório enviado ao Conselho de Administração.")) recarregar();
      });
    }
  }

  async function contador(ctx) {
    if (ctx.fiscal) {
      const [i, p, d] = await Promise.all([API.cf.inconformidades().catch(() => []), API.cf.prestacoes().catch(() => []), API.cf.denuncias().catch(() => [])]);
      return i.filter((x) => x.status === "aberta").length + p.filter((x) => x.status === "aguardando_cf").length + d.filter((x) => x.status === "recebida" || x.status === "em_apuracao").length;
    }
    const i = await API.cf.inconformidades().catch(() => []); return i.filter((x) => x.status === "esclarecimento").length;
  }

  window.ConselhoFiscal = { render, contador };
})();
