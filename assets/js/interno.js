/* Área interna da coordenação */
(function () {
  "use strict";
  const UI = window.UI;
  const { $, esc, data, dataHora, horas, moeda, bytes, mesAtual, acao, confirmar, toast } = UI;
  const API = window.API;
  const TIPOS = API.TIPOS_HORA;

  /* Índice de Eficiência Operacional: horas orçadas ÷ horas produtivas executadas */
  const produtivasPorProjeto = (prod) => {
    const m = {};
    prod.forEach((h) => { if (h.tipo === "produtiva" && h.projeto_id) m[h.projeto_id] = (m[h.projeto_id] || 0) + Number(h.horas || 0); });
    return m;
  };
  const seloIeo = (p, exec) => {
    if (!p.horas_orcadas || !exec) return '<span class="selo">sem dados</span>';
    if (p.status !== "Concluído") {
      const uso = exec / p.horas_orcadas;
      const cls = uso > 1 ? "err" : uso > 0.85 ? "warn" : "info";
      return `<span class="selo ${cls}">${Math.round(uso * 100)}% do orçado</span>`;
    }
    const ieo = p.horas_orcadas / exec;
    const cls = ieo < 0.8 ? "err" : ieo < 0.95 ? "warn" : "ok";
    return `<span class="selo ${cls}">IEO ${ieo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
  };
  const seloStatus = (s) => {
    const m = { "Em execução": "info", "Concluído": "ok", "Proposta": "warn", "Prospecção": "", "Suspenso": "err" };
    return `<span class="selo ${m[s] || ""}">${esc(s)}</span>`;
  };
  const opcoes = (lista, atual) => lista.map((v) => `<option ${v === atual ? "selected" : ""}>${esc(v)}</option>`).join("");

  const paginas = {
    visao: {
      titulo: "Visão geral",
      async render(el) {
        const [coops, projetos, prod, contatos] = await Promise.all([API.cooperados.listar(), API.projetos.listar(), API.producao.todas(), API.contatos.listar()]);
        const mes = mesAtual();
        const prodMes = prod.filter((h) => h.data.startsWith(mes));
        const hp = prodMes.filter((h) => h.tipo === "produtiva").reduce((a, h) => a + Number(h.horas), 0);
        const execPor = produtivasPorProjeto(prod);
        const emExec = projetos.filter((p) => p.status === "Em execução");
        const pend = coops.filter((c) => c.status === "pendente" || c.status === "entrevista").length;
        const naoLidas = contatos.filter((c) => !c.lido).length;
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Coordenação</p><h1>Visão geral</h1></div></div>
          <div class="kpis">
            <div class="kpi"><span class="rot">Cooperados ativos</span><span class="val">${coops.filter((c) => c.status === "ativo").length}</span><span class="det">${pend ? `<a href="#solicitacoes">${pend} solicitação(ões) em análise</a>` : "Nenhuma solicitação pendente"}</span></div>
            <div class="kpi"><span class="rot">Projetos em execução</span><span class="val">${emExec.length}</span><span class="det">${projetos.filter((p) => p.status === "Proposta").length} em proposta</span></div>
            <div class="kpi"><span class="rot">Produção no mês</span><span class="val">${horas(hp)}</span><span class="det">Horas técnicas produtivas</span></div>
            <div class="kpi"><span class="rot">Mensagens do site</span><span class="val">${naoLidas}</span><span class="det">${naoLidas ? '<a href="#mensagens">Ver não lidas</a>' : "Tudo lido"}</span></div>
          </div>
          <section class="painel"><div class="painel-cab"><h2>Projetos em execução</h2><a class="btn btn-ghost btn-sm" href="#projetos">Gerenciar projetos</a></div>
            ${emExec.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Projeto</th><th class="num">Orçado</th><th class="num">Executado</th><th>Consumo</th></tr></thead><tbody>
              ${emExec.map((p) => { const ex = execPor[p.id] || 0; const pct = p.horas_orcadas ? Math.min(100, (ex / p.horas_orcadas) * 100) : 0; return `<tr>
                <td>${esc(p.nome)}<span class="sub">${esc(p.orgao || "")}</span></td>
                <td class="num">${horas(p.horas_orcadas)}</td><td class="num">${horas(ex)}</td>
                <td style="min-width:10rem"><div class="barra"><i style="width:${pct}%"></i></div><span class="sub">${seloIeo(p, ex)}</span></td></tr>`; }).join("")}
            </tbody></table></div>` : '<p class="vazio">Nenhum projeto em execução.</p>'}
          </section>`;
      }
    },

    solicitacoes: {
      titulo: "Solicitações de admissão",
      async contador() { return (await API.cooperados.listar()).filter((c) => c.status === "pendente" || c.status === "entrevista").length; },
      async render(el, ctx) {
        const todos = await API.cooperados.listar();
        const abertas = todos.filter((c) => c.status === "pendente" || c.status === "entrevista")
          .sort((a, b) => (a.criado_em || "").localeCompare(b.criado_em || ""));
        const recusadas = todos.filter((c) => c.status === "recusado");
        const ST = API.STATUS_COOPERADO;
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Quadro social</p><h1>Solicitações de admissão</h1></div></div>
          <p class="muted">Quem pede para entrar na cooperativa aparece aqui e não tem acesso a nada até ser aprovado. Registre o parecer e escolha o próximo passo.</p>
          ${abertas.length ? abertas.map((c) => `
            <section class="painel solicitacao" data-id="${c.id}">
              <div class="painel-cab"><div><h2>${esc(c.nome || "(sem nome)")}</h2><span class="hint">Solicitação de ${data(c.criado_em)} · ${esc(c.email)}</span></div>
                <span class="selo ${c.status === "entrevista" ? "info" : "warn"}">${esc(ST[c.status])}</span></div>
              <dl class="sol-dados">
                <div><dt>Área pretendida</dt><dd>${esc(c.area_atuacao || c.especialidade || "—")}</dd></div>
                <div><dt>Formação</dt><dd>${esc(c.formacao || "—")}</dd></div>
                <div><dt>Registro profissional</dt><dd>${esc(c.registro_profissional || "—")}</dd></div>
                <div><dt>Cidade</dt><dd>${esc(c.cidade || "—")}</dd></div>
                <div><dt>Telefone</dt><dd>${c.telefone ? `<a href="https://wa.me/55${esc(String(c.telefone).replace(/\D/g, "").replace(/^55/, ""))}" target="_blank" rel="noopener">${esc(c.telefone)}</a>` : "—"}</dd></div>
                <div><dt>Currículo</dt><dd>${c.curriculo_url && /^https?:\/\//i.test(c.curriculo_url) ? `<a href="${esc(c.curriculo_url)}" target="_blank" rel="noopener">Abrir link</a>` : "—"}</dd></div>
              </dl>
              <div class="sol-texto"><b>Experiência</b><p>${esc(c.experiencia || "—")}</p></div>
              <div class="sol-texto"><b>Motivação</b><p>${esc(c.motivacao || "—")}</p></div>
              <div class="sol-acoes">
                <div class="field"><label for="obs-${c.id}">Parecer da coordenação</label><textarea class="input" id="obs-${c.id}" style="min-height:4.5rem" maxlength="2000" placeholder="Registro interno da análise">${esc(c.analise_obs || "")}</textarea></div>
              </div>
              <div class="sol-acoes">
                ${c.status === "pendente" ? '<button class="btn btn-ghost btn-sm" data-acao="entrevista">Chamar para conversa</button>' : ""}
                <button class="btn btn-primary btn-sm" data-acao="ativo">Aprovar admissão</button>
                <button class="btn btn-danger btn-sm" data-acao="recusado">Não aprovar</button>
              </div>
            </section>`).join("") : '<p class="vazio">Nenhuma solicitação aguardando análise.</p>'}
          ${recusadas.length ? `<section class="painel"><h2>Não aprovadas</h2><div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Nome</th><th>Área</th><th>Análise</th><th>Parecer</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${recusadas.map((c) => `<tr data-id="${c.id}"><td>${esc(c.nome)}<span class="sub">${esc(c.email)}</span></td><td>${esc(c.area_atuacao || "—")}</td>
              <td class="num" style="text-align:left">${data(c.analisado_em)}</td><td>${esc(c.analise_obs || "—")}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-acao="pendente">Reabrir</button></td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
        el.onclick = async (e) => {
          const b = e.target.closest("[data-acao]"); if (!b) return;
          const box = b.closest("[data-id]"); const id = box.dataset.id;
          const novo = b.dataset.acao;
          const c = todos.find((x) => x.id === id);
          const obsEl = document.getElementById("obs-" + id);
          const dados = { status: novo };
          if (obsEl) dados.analise_obs = obsEl.value.trim();
          const textos = { ativo: `Aprovar a admissão de ${c.nome}? A pessoa passa a ter acesso à área do cooperado.`, recusado: `Registrar que a admissão de ${c.nome} não foi aprovada?` };
          if (textos[novo] && !(await confirmar(textos[novo], novo === "ativo" ? "Aprovar" : "Não aprovar"))) return;
          const msg = { ativo: "Admissão aprovada.", recusado: "Solicitação registrada como não aprovada.", entrevista: "Marcado para conversa.", pendente: "Solicitação reaberta." }[novo];
          const ok = await acao(b, () => API.cooperados.atualizar(id, dados), msg);
          if (ok) { ctx.atualizarContadores(); paginas.solicitacoes.render(el, ctx); }
        };
      }
    },

    cooperados: {
      titulo: "Cooperados",
      async render(el, ctx) {
        const coops = (await API.cooperados.listar()).filter((c) => c.status === "ativo" || c.status === "desligado");
        coops.sort((a, b) => (a.status === b.status ? 0 : a.status === "ativo" ? -1 : 1) || a.nome.localeCompare(b.nome));
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Quadro social</p><h1>Cooperados</h1></div><a class="btn btn-ghost" href="#solicitacoes">Ver solicitações</a></div>
          <p class="muted">Cooperados admitidos. O papel <b>coordenação</b> dá acesso a toda a área interna; a marcação <b>Tesouraria</b> dá acesso só à aba Financeiro, para quem atualiza os valores; <b>Conselho Fiscal</b> dá leitura de todo o Financeiro e a página do Conselho Fiscal, sem poder lançar nada. Novos pedidos de entrada ficam em Solicitações de admissão.</p>
          ${coops.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Nome</th><th>Área de atuação</th><th>Desde</th><th>Situação</th><th>Papel</th><th>Tesouraria</th><th>Conselho Fiscal</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${coops.map((c) => `<tr data-id="${c.id}">
              <td><b>${esc(c.nome || "(sem nome)")}</b><span class="sub">${esc(c.email)}${c.telefone ? " · " + esc(c.telefone) : ""}</span></td>
              <td>${esc(c.area_atuacao || c.especialidade || "—")}${c.registro_profissional ? `<span class="sub">${esc(c.registro_profissional)}</span>` : ""}</td>
              <td class="num" style="text-align:left">${data(c.data_ingresso)}</td>
              <td><select class="input mini" data-campo="status" aria-label="Situação de ${esc(c.nome)}" ${c.id === ctx.sessao.perfil.id ? "disabled" : ""}><option value="ativo" ${c.status === "ativo" ? "selected" : ""}>ativo</option><option value="desligado" ${c.status === "desligado" ? "selected" : ""}>desligado</option></select></td>
              <td><select class="input mini" data-campo="papel" aria-label="Papel de ${esc(c.nome)}" ${c.id === ctx.sessao.perfil.id ? "disabled" : ""}><option value="cooperado" ${c.papel === "cooperado" ? "selected" : ""}>cooperado</option><option value="coordenacao" ${c.papel === "coordenacao" ? "selected" : ""}>coordenação</option></select></td>
              <td><label class="ciente" style="margin:0"><input type="checkbox" data-campo="tesouraria" ${c.tesouraria ? "checked" : ""} ${c.id === ctx.sessao.perfil.id ? "disabled" : ""}> <span>acesso</span></label></td>
              <td><label class="ciente" style="margin:0"><input type="checkbox" data-campo="conselho_fiscal" ${c.conselho_fiscal ? "checked" : ""} ${c.id === ctx.sessao.perfil.id ? "disabled" : ""}> <span>membro</span></label></td>
              <td class="acoes-celula">${c.id === ctx.sessao.perfil.id ? '<span class="hint">você</span>' : '<button class="btn btn-primary btn-sm" data-salvar>Salvar</button>'}</td></tr>`).join("")}</tbody>
          </table></div>` : '<p class="vazio">Nenhum cooperado admitido ainda.</p>'}`;
        el.onclick = async (e) => {
          const b = e.target.closest("[data-salvar]"); if (!b) return;
          const tr = b.closest("tr");
          const dados = { status: tr.querySelector('[data-campo="status"]').value, papel: tr.querySelector('[data-campo="papel"]').value, tesouraria: tr.querySelector('[data-campo="tesouraria"]').checked, conselho_fiscal: tr.querySelector('[data-campo="conselho_fiscal"]').checked };
          if (dados.conselho_fiscal && (dados.tesouraria || dados.papel === "coordenacao")) return toast("Quem é do Conselho Fiscal não pode estar na coordenação nem na tesouraria: o CF fiscaliza essas funções (Estatuto, art. 60).", "err");
          if (dados.status === "desligado" && !(await confirmar("Desligar este cooperado? Ele perde o acesso à área do cooperado.", "Desligar"))) return;
          const ok = await acao(b, () => API.cooperados.atualizar(tr.dataset.id, dados), "Cadastro atualizado.");
          if (ok) paginas.cooperados.render(el, ctx);
        };
      }
    },

    projetos: {
      titulo: "Projetos",
      async render(el) {
        const [projetos, prod] = await Promise.all([API.projetos.listar(), API.producao.todas()]);
        const execPor = produtivasPorProjeto(prod);
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Carteira</p><h1>Projetos</h1></div><button class="btn btn-primary" id="novo-proj">Novo projeto</button></div>
          <section class="painel" id="form-proj-box" hidden>
            <h2 id="form-proj-tit">Novo projeto</h2>
            <form id="f-proj" class="form-grid" novalidate>
              <input type="hidden" id="pj-id">
              <div class="field full"><label for="pj-nome">Nome do projeto</label><input class="input" id="pj-nome" maxlength="160" placeholder="Ex.: Escola Municipal – projeto executivo"></div>
              <div class="field"><label for="pj-orgao">Órgão contratante</label><input class="input" id="pj-orgao" maxlength="160"></div>
              <div class="field"><label for="pj-mun">Município ou região</label><input class="input" id="pj-mun" maxlength="120"></div>
              <div class="field"><label for="pj-mod">Modalidade</label><select class="input" id="pj-mod">${opcoes(API.MODALIDADES)}</select></div>
              <div class="field"><label for="pj-status">Status</label><select class="input" id="pj-status">${opcoes(API.STATUS_PROJETO)}</select></div>
              <div class="field"><label for="pj-horas">Horas orçadas</label><input class="input" id="pj-horas" type="number" min="0" step="1" inputmode="numeric"></div>
              <div class="field"><label for="pj-lod">Nível de desenvolvimento</label><input class="input" id="pj-lod" maxlength="40" placeholder="LOD 400"></div>
              <div class="field"><label for="pj-valor">Valor (R$)</label><input class="input" id="pj-valor" type="number" min="0" step="0.01" inputmode="decimal"></div>
              <div class="field"><label for="pj-ini">Início</label><input class="input" id="pj-ini" type="date"></div>
              <div class="field"><label for="pj-fim">Término previsto</label><input class="input" id="pj-fim" type="date"></div>
              <div class="full" style="display:flex;gap:.6rem;flex-wrap:wrap"><button class="btn btn-primary" id="pj-btn" type="submit">Salvar projeto</button><button class="btn btn-ghost" id="pj-cancelar" type="button">Cancelar</button></div>
            </form>
          </section>
          ${projetos.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Projeto</th><th>Modalidade</th><th>Status</th><th class="num">Valor</th><th class="num">Horas</th><th>Eficiência</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${projetos.map((p) => `<tr>
              <td><b>${esc(p.nome)}</b><span class="sub">${esc([p.orgao, p.municipio].filter(Boolean).join(" · "))}${p.lod ? " · " + esc(p.lod) : ""}</span></td>
              <td>${esc(p.modalidade || "—")}</td><td>${seloStatus(p.status)}</td>
              <td class="num">${moeda(p.valor)}</td>
              <td class="num">${horas(execPor[p.id] || 0)}<span class="sub">de ${horas(p.horas_orcadas)}</span></td>
              <td>${seloIeo(p, execPor[p.id] || 0)}</td>
              <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-editar="${p.id}">Editar</button> <button class="btn btn-danger btn-sm" data-excluir="${p.id}">Excluir</button></td></tr>`).join("")}</tbody>
          </table></div>
          <p class="hint">Eficiência: durante a execução mostra quanto das horas orçadas já foi consumido. Ao concluir, mostra o IEO (horas orçadas ÷ executadas): faixa de controle entre 0,95 e 1,05; abaixo de 0,80 aciona o Conselho Fiscal.</p>`
          : '<p class="vazio">Nenhum projeto cadastrado. Use "Novo projeto" para começar.</p>'}`;

        const box = $("#form-proj-box");
        const campos = { id: "#pj-id", nome: "#pj-nome", orgao: "#pj-orgao", municipio: "#pj-mun", modalidade: "#pj-mod", status: "#pj-status", horas_orcadas: "#pj-horas", lod: "#pj-lod", valor: "#pj-valor", inicio: "#pj-ini", fim: "#pj-fim" };
        const abrir = (p) => {
          Object.entries(campos).forEach(([k, s]) => { $(s).value = p && p[k] != null ? p[k] : (k === "lod" ? "LOD 400" : k === "status" ? "Prospecção" : k === "modalidade" ? API.MODALIDADES[0] : ""); });
          $("#form-proj-tit").textContent = p ? "Editar projeto" : "Novo projeto";
          box.hidden = false; $("#pj-nome").focus(); box.scrollIntoView({ block: "start", behavior: "smooth" });
        };
        $("#novo-proj").onclick = () => abrir(null);
        $("#pj-cancelar").onclick = () => { box.hidden = true; };
        $("#f-proj").addEventListener("submit", async (e) => {
          e.preventDefault();
          const p = {}; Object.entries(campos).forEach(([k, s]) => { p[k] = $(s).value.trim(); });
          if (!p.nome) return toast("Informe o nome do projeto.", "err");
          p.horas_orcadas = p.horas_orcadas ? Number(p.horas_orcadas) : 0;
          p.valor = p.valor ? Number(p.valor) : null;
          if (!p.id) delete p.id;
          const ok = await acao($("#pj-btn"), () => API.projetos.salvar(p), "Projeto salvo.");
          if (ok) paginas.projetos.render(el);
        });
        el.onclick = async (e) => {
          const ed = e.target.closest("[data-editar]");
          if (ed) return abrir(projetos.find((p) => p.id === ed.dataset.editar));
          const ex = e.target.closest("[data-excluir]");
          if (ex) {
            if (!(await confirmar("Excluir este projeto? Esta ação não pode ser desfeita.", "Excluir"))) return;
            const ok = await acao(ex, () => API.projetos.excluir(ex.dataset.excluir), "Projeto excluído.");
            if (ok) paginas.projetos.render(el);
          }
        };
      }
    },

    producao: {
      titulo: "Produção",
      async render(el) {
        const prod = await API.producao.todas();
        let mes = mesAtual();
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Horas técnicas</p><h1>Produção</h1></div>
            <div class="filtros"><div class="field"><label for="pr-mes">Mês</label><input class="input" id="pr-mes" type="month" value="${mes}"></div>
            <div class="field"><label for="pr-ano">ou ano inteiro</label><select class="input" id="pr-ano"><option value="">—</option>${[...new Set(prod.map((h) => h.data.slice(0, 4)))].sort().reverse().map((a) => `<option>${a}</option>`).join("")}</select></div></div></div>
          <section class="painel"><h2>Resumo por cooperado</h2><div id="pr-resumo"></div>
            <p class="hint">A participação nas horas produtivas é a referência para a distribuição das sobras. Formação Técnica Integrada acima de 10% das horas fica destacada.</p></section>
          <section class="painel"><h2>Lançamentos</h2><div id="pr-lista"></div></section>`;

        const desenhar = () => {
          const ano = $("#pr-ano").value;
          const doPeriodo = prod.filter((h) => (ano ? h.data.startsWith(ano) : h.data.startsWith(mes)));
          const por = {};
          doPeriodo.forEach((h) => {
            const k = h.cooperado_id;
            por[k] = por[k] || { nome: h.cooperado_nome, produtiva: 0, formacao: 0, administrativa: 0, ociosidade_estrategica: 0, ociosidade_operacional: 0 };
            por[k][h.tipo] = (por[k][h.tipo] || 0) + Number(h.horas || 0);
          });
          const linhas = Object.values(por).sort((a, b) => b.produtiva - a.produtiva);
          const totalProd = linhas.reduce((a, l) => a + l.produtiva, 0);
          $("#pr-resumo").innerHTML = linhas.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Cooperado</th><th class="num">Produtivas</th><th class="num">Formação</th><th class="num">Suporte adm. (20%)</th><th class="num">Pend. externa</th><th class="num">Ociosidade op.</th><th class="num">Participação</th></tr></thead>
            <tbody>${linhas.map((l) => { const fti = l.produtiva + l.formacao ? l.formacao / (l.produtiva + l.formacao) : 0; return `<tr>
              <td>${esc(l.nome)}</td><td class="num">${horas(l.produtiva)}</td>
              <td class="num">${horas(l.formacao)}${fti > 0.1 ? `<span class="sub"><span class="selo warn">${Math.round(fti * 100)}%</span></span>` : ""}</td>
              <td class="num">${horas(l.administrativa)}</td><td class="num">${horas(l.ociosidade_estrategica)}</td><td class="num">${horas(l.ociosidade_operacional)}</td>
              <td class="num">${totalProd ? ((l.produtiva / totalProd) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"}</td></tr>`; }).join("")}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${horas(totalProd)}</td><td class="num">${horas(linhas.reduce((a, l) => a + l.formacao, 0))}</td><td class="num">${horas(linhas.reduce((a, l) => a + l.administrativa, 0))}</td><td class="num">${horas(linhas.reduce((a, l) => a + l.ociosidade_estrategica, 0))}</td><td class="num">${horas(linhas.reduce((a, l) => a + l.ociosidade_operacional, 0))}</td><td class="num">100%</td></tr></tfoot>
          </table></div>` : '<p class="vazio">Nenhuma hora lançada no período.</p>';

          $("#pr-lista").innerHTML = doPeriodo.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Data</th><th>Cooperado</th><th>Projeto</th><th>Tipo</th><th class="num">Horas</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${doPeriodo.map((h) => `<tr><td class="num" style="text-align:left">${data(h.data)}</td><td>${esc(h.cooperado_nome)}</td>
              <td>${esc(h.projeto_nome === "—" ? "Atividade interna" : h.projeto_nome)}<span class="sub">${esc(h.descricao || "")}</span></td>
              <td>${esc(TIPOS[h.tipo] || h.tipo)}</td><td class="num">${horas(h.horas)}</td>
              <td class="acoes-celula"><button class="btn btn-danger btn-sm" data-del="${h.id}">Excluir</button></td></tr>`).join("")}</tbody></table></div>`
            : '<p class="vazio">Nenhum lançamento no período.</p>';
        };
        desenhar();
        $("#pr-mes").onchange = (e) => { mes = e.target.value; $("#pr-ano").value = ""; desenhar(); };
        $("#pr-ano").onchange = desenhar;
        el.onclick = async (e) => {
          const b = e.target.closest("[data-del]"); if (!b) return;
          if (!(await confirmar("Excluir este lançamento?", "Excluir"))) return;
          const ok = await acao(b, () => API.producao.excluir(b.dataset.del), "Lançamento excluído.");
          if (ok) { prod.splice(prod.findIndex((h) => h.id === b.dataset.del), 1); desenhar(); }
        };
      }
    },

    financeiro: {
      titulo: "Financeiro",
      separador: true,
      async contador(ctx) { if (ctx && ctx.leitura) return 0; const m = await API.movimentos.todos(); return m.filter((x) => x.status === "aguardando").length; },
      async render(el, ctx) {
        const parFin = await API.fin.parametros().catch(() => ({ modo: "planilha" }));
        if (parFin.modo === "sistema") return window.Tesouraria.render(el, ctx);
        const C = API.CAMPOS_FIN;
        const Fin = window.Fin;
        const [coops, posicoes, imps, ultimaArq, movs] = await Promise.all([API.cooperados.listar(), API.financeiro.todas(), API.financeiro.importacoes(), API.financeiro.ultimaPlanilha().catch(() => null), API.movimentos.todos().catch(() => [])]);
        const pessoas = {}; coops.forEach((c) => { pessoas[c.id] = { nome: c.nome, email: c.email }; });
        movs.forEach((m) => { if (!pessoas[m.cooperado_id]) pessoas[m.cooperado_id] = { nome: m.cooperado_nome, email: m.cooperado_email }; });
        const aguardando = movs.filter((m) => m.status === "aguardando");
        const foraDaPlanilha = movs.filter((m) => Fin.vale(m));
        const ativos = coops.filter((c) => c.status === "ativo" || c.status === "desligado");
        const ultima = {};
        const maisNova = (p, u) => p.data_base > u.data_base || (p.data_base === u.data_base && String(p.criado_em || "") > String(u.criado_em || ""));
        posicoes.forEach((p) => { const u = ultima[p.cooperado_id]; if (!u || maisNova(p, u)) ultima[p.cooperado_id] = p; });
        const linhasAtuais = Object.values(ultima).map((p) => Fin.ajustada(p, movs)).sort((a, b) => (a.cooperado_nome || "").localeCompare(b.cooperado_nome || ""));
        const soma = (k) => linhasAtuais.reduce((a, p) => a + Number(p[k] || 0), 0);

        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Tesouraria</p><h1>Financeiro dos cooperados</h1></div>
            ${ultimaArq ? `<button class="btn btn-ghost" id="fin-modelo">Baixar planilha atual</button>` : ""}</div>
          <p class="muted">${ultimaArq
            ? `A planilha atual é a última enviada: <b>${esc(ultimaArq.nome || "")}</b>, data-base ${data(ultimaArq.data_base)}. Baixe, atualize no Excel e envie de volta: ela passa a ser a nova planilha atual.`
            : "Ainda não há planilha enviada. Envie a planilha financeira completa da BIMCORE; a partir daí, o botão Baixar planilha atual sempre entrega a última versão enviada, com todo o histórico de movimentações."}
            O site lê a aba <b>Posição</b> (identifica cada cooperado pelo e-mail ou pelo nome), as abas mensais e a aba <b>Pagamentos</b>. Cada cooperado vê só a própria conta.</p>

          ${aguardando.length ? `<section class="painel acerto">
            <div class="painel-cab"><h2>Pix aguardando confirmação</h2><span class="selo warn">${aguardando.length}</span></div>
            <p class="muted">Confira no extrato do BTG se o Pix caiu (valor, nome de quem pagou e, se aparecer, o identificador). Ao confirmar, o valor sai do em aberto do cooperado na hora e entra sozinho na planilha atual.</p>
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Cooperado</th><th>Avisado em</th><th class="num">Valor</th><th>Identificador</th><th>Quita</th><th></th></tr></thead>
              <tbody>${aguardando.map((m) => `<tr><td>${esc(m.cooperado_nome)}</td><td>${dataHora(m.criado_em)}</td><td class="num">${moeda(m.valor)}</td><td>BIMC${esc(m.codigo)}</td>
                <td>${(m.alocacao || []).map((a) => esc(Fin.descreverItem(a)) + " " + moeda(a.valor)).join("<br>")}</td>
                <td class="acoes-celula">${m.comprovante ? `<button class="btn btn-ghost btn-sm" data-comp="${m.id}">Comprovante</button> ` : ""}<button class="btn btn-primary btn-sm" data-confirmar="${m.id}">Confirmar</button> <button class="btn btn-danger btn-sm" data-recusar="${m.id}">Recusar</button></td></tr>`).join("")}</tbody>
            </table></div>
          </section>` : ""}

          <section class="painel">
            <h2>Enviar planilha atualizada</h2>
            <form id="fin-form" class="form-grid" novalidate>
              <div class="field"><label for="fin-arq">Planilha (.xlsx)</label><input class="input" id="fin-arq" type="file" accept=".xlsx,.xls,.csv"></div>
              <div class="field"><label for="fin-data">Data-base dos valores</label><input class="input" id="fin-data" type="date" value="${UI.hoje()}"><span class="hint">Preenchida pelo "Mês de fechamento" da planilha, quando houver.</span></div>
              <div class="full"><button class="btn btn-primary" id="fin-ler" type="submit">Ler planilha</button></div>
            </form>
            <div id="fin-previa"></div>
          </section>

          <section class="painel">
            <h2>Posição atual</h2>
            ${linhasAtuais.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Cooperado</th><th>Data-base</th><th class="num">Capital integralizado</th><th class="num">Em aberto</th><th class="num">Aportes</th><th class="num">Total contribuído</th></tr></thead>
              <tbody>${linhasAtuais.map((p) => `<tr><td>${esc(p.cooperado_nome)}</td><td class="num" style="text-align:left">${data(p.data_base)}</td>
                <td class="num">${moeda(p.capital_integralizado)}<span class="sub">de ${moeda(p.capital_subscrito)}</span></td>
                <td class="num">${Number(p.valor_em_aberto) > 0.005 ? `<span class="selo err">${moeda(p.valor_em_aberto)}</span>` : '<span class="selo ok">em dia</span>'}</td>
                <td class="num">${moeda(p.outros_creditos)}</td><td class="num">${moeda(p.contribuicoes_pagas)}</td></tr>`).join("")}</tbody>
              <tfoot><tr><td>Total</td><td></td><td class="num">${moeda(soma("capital_integralizado"))}</td><td class="num">${moeda(soma("valor_em_aberto"))}</td><td class="num">${moeda(soma("outros_creditos"))}</td><td class="num">${moeda(soma("contribuicoes_pagas"))}</td></tr></tfoot>
            </table></div>` : '<p class="vazio">Nenhuma posição registrada ainda.</p>'}
          </section>

          ${movs.length ? `<section class="painel">
            <h2>Pix e abatimentos feitos pelo site</h2>
            ${foraDaPlanilha.length ? `<p class="notice">${foraDaPlanilha.length} lançamento(s) confirmado(s) ainda não estão na planilha enviada. Eles entram sozinhos na aba <b>Lançamentos do site</b> quando você clicar em <b>Baixar planilha atual</b>. Abra no Excel, salve e envie de volta.</p>` : ""}
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Data</th><th>Cooperado</th><th>Tipo</th><th class="num">Valor</th><th>Situação</th><th>Planilha</th></tr></thead>
              <tbody>${movs.slice(0, 40).map((m) => `<tr><td>${dataHora(m.criado_em)}</td><td>${esc(m.cooperado_nome)}</td><td>${m.tipo === "pix" ? "Pix" : "Abatimento com aportes"}<span class="sub">BIMC${esc(m.codigo)}</span></td><td class="num">${moeda(m.valor)}</td>
                <td>${{ aguardando: '<span class="selo warn">aguardando</span>', confirmado: '<span class="selo ok">confirmado</span>', recusado: '<span class="selo err">recusado</span>', cancelado: '<span class="selo">cancelado</span>' }[m.status] || esc(m.status)}${m.decidido_nome && m.status !== "aguardando" ? `<span class="sub">${esc(m.decidido_nome)}</span>` : ""}</td>
                <td>${m.status !== "confirmado" ? "—" : m.incorporado_em ? "já na planilha" : "entra ao baixar"}</td></tr>`).join("")}</tbody>
            </table></div>
          </section>` : ""}

          <section class="painel">
            <h2>Histórico de envios</h2>
            ${imps.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Enviado em</th><th>Data-base</th><th>Arquivo</th><th class="num">Cooperados</th><th>Por</th><th><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${imps.map((i) => `<tr><td>${dataHora(i.criado_em)}</td><td>${data(i.data_base)}</td><td>${esc(i.arquivo || "—")}</td><td class="num">${i.linhas}</td><td>${esc(i.criado_nome || "—")}</td>
                <td class="acoes-celula"><button class="btn btn-danger btn-sm" data-desfazer="${i.id}">Desfazer</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhum envio ainda.</p>'}
          </section>`;

        const norm = (t) => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const mapa = {}; Object.entries(C).forEach(([k, r]) => { mapa[norm(r)] = k; mapa[norm(r.replace(/\s*\(R\$\)/, ""))] = k; mapa[norm(k)] = k; });
        const num = (v) => {
          if (v === null || v === undefined || v === "") return null;
          if (typeof v === "number") return Math.round(v * 100) / 100;
          let t = String(v).replace(/R\$|\s/g, "");
          if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
          const n = parseFloat(t); return isNaN(n) ? NaN : Math.round(n * 100) / 100;
        };
        const iso = (d) => (d instanceof Date && !isNaN(d) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null);
        const porEmail = {}; coops.forEach((c) => { porEmail[String(c.email).toLowerCase().trim()] = c; });
        const tabela = (ws, linhaCab) => XLSX.utils.sheet_to_json(ws, { defval: "", raw: true, range: linhaCab - 1 });
        const col = (row, ...nomes) => { const ks = Object.keys(row); for (const n of nomes) { const k = ks.find((x) => norm(x) === norm(n)); if (k) return row[k]; } return undefined; };

        /* Lê o resto da pasta de trabalho (abas mensais, Pagamentos, Resumo, Parâmetros) */
        function detalhesDaPasta(wb) {
          const det = {}; // por nome do cooperado
          const add = (nome) => (det[nome] = det[nome] || { mensal: [], aportes: [], resumo: {} });
          wb.SheetNames.filter((n) => /^\d{4}-\d{2}$/.test(n)).sort().forEach((aba) => {
            tabela(wb.Sheets[aba], 5).forEach((r) => {
              const nome = String(col(r, "Cooperado") || "").trim(); if (!nome) return;
              const devida = num(col(r, "Contribuição de capital devida")), paga = num(col(r, "Contribuição paga")), ret = num(col(r, "Retirada bruta")), aberto = num(col(r, "Em aberto no mês"));
              if (!devida && !paga && !ret && !aberto) return;
              add(nome).mensal.push({ mes: aba, retirada: ret || 0, devida: devida || 0, paga: paga || 0, em_aberto: aberto || 0 });
            });
          });
          if (wb.Sheets["Pagamentos"]) {
            tabela(wb.Sheets["Pagamentos"], 5).forEach((r) => {
              const nome = String(col(r, "Quem pagou") || "").trim(); const valor = num(col(r, "Valor (R$)"));
              if (!nome || !valor) return;
              const d = col(r, "Data");
              add(nome).aportes.push({ data: iso(d), descricao: String(col(r, "Despesa") || "").slice(0, 200), valor, tipo: String(col(r, "Tipo") || "") });
            });
          }
          if (wb.Sheets["Resumo"]) {
            tabela(wb.Sheets["Resumo"], 5).forEach((r) => {
              const nome = String(col(r, "Cooperado") || "").trim(); if (!nome) return;
              add(nome).resumo = {
                contribuicoes_devidas: num(col(r, "Contribuições mensais devidas")) || 0,
                contribuicoes_pagas_mensais: num(col(r, "Contribuições mensais pagas")) || 0,
                falta_integralizar: num(col(r, "Falta integralizar")) || 0,
                aportes_brutos: num(col(r, "Aportes brutos")) || 0,
                aportes_no_capital: num(col(r, "Aportes usados na integralização inicial")) || 0,
                falta_inicial: num(col(r, "Falta integralizar das quotas iniciais")) || 0,
                adiantado: num(col(r, "Contribuições pagas antecipadamente")) || 0,
                retiradas_ano: num(col(r, "Retiradas brutas no ano")) || 0
              };
            });
          }
          return det;
        }
        function dataFechamento(wb) {
          const ws = wb.Sheets["Parâmetros"] || wb.Sheets[wb.SheetNames.find((n) => norm(n) === "parametros")]; if (!ws) return null;
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
          for (const r of rows) { if (norm(r[1]).startsWith("mesdefechamento") && r[2] instanceof Date) { const d = r[2]; return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); } }
          return null;
        }

        if ($("#fin-modelo")) $("#fin-modelo").onclick = async (ev) => {
          const r = await acao(ev.currentTarget, async () => {
            const atual = await API.financeiro.ultimaPlanilha();
            if (!atual) throw new Error("Não foi possível baixar a planilha atual.");
            if (!foraDaPlanilha.length) return { url: atual.url, nome: atual.nome, n: 0 };
            const resp = await fetch(atual.url); if (!resp.ok) throw new Error("Não foi possível baixar a planilha atual.");
            const out = await Fin.planilhaComLancamentos(await resp.arrayBuffer(), foraDaPlanilha, pessoas);
            const blob = new Blob([out.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            return { url: URL.createObjectURL(blob), nome: atual.nome, n: out.adicionados, blob: true };
          });
          if (!r) return;
          const a = document.createElement("a"); a.href = r.url; a.download = r.nome || "planilha-financeira.xlsx"; if (!r.blob) a.target = "_blank";
          document.body.appendChild(a); a.click(); a.remove();
          if (r.blob) setTimeout(() => URL.revokeObjectURL(r.url), 60000);
          if (r.n) toast(`${r.n} lançamento(s) do site incluído(s) na aba Lançamentos do site. Abra no Excel, salve e envie de volta.`);
        };

        let wbAtual = null;
        $("#fin-arq").onchange = async (e) => {
          const arq = e.target.files[0]; wbAtual = null; if (!arq || !window.XLSX) return;
          try { wbAtual = XLSX.read(await arq.arrayBuffer(), { type: "array", cellDates: true }); } catch (err) { return; }
          const f = dataFechamento(wbAtual); if (f) $("#fin-data").value = f;
        };

        $("#fin-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const arq = $("#fin-arq").files[0];
          if (!arq) return toast("Escolha a planilha.", "err");
          if (!$("#fin-data").value) return toast("Informe a data-base.", "err");
          if (!window.XLSX) return toast("Não foi possível carregar o leitor de planilhas. Recarregue a página.", "err");
          let livro = wbAtual;
          if (!livro || !livro.SheetNames.length) { try { livro = XLSX.read(await arq.arrayBuffer(), { type: "array", cellDates: true }); } catch (err) { return toast("Não consegui ler esse arquivo. Envie em .xlsx.", "err"); } }
          const nomeAba = livro.SheetNames.find((n) => norm(n) === "posicao") || livro.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(livro.Sheets[nomeAba], { defval: "", raw: true });
          if (!rows.length) return toast("A aba Posição está vazia.", "err");
          const cabs = Object.keys(rows[0]);
          const colEmail = cabs.find((h) => norm(h).includes("email"));
          const colNome = cabs.find((h) => norm(h) === "nome");
          if (!colEmail && !colNome) return toast("Não encontrei as colunas Nome ou E-mail na aba Posição.", "err");
          const colunas = {}; cabs.forEach((h) => { const k = mapa[norm(h)]; if (k) colunas[k] = h; });
          const lanc = Fin.lerLancamentos(livro);
          if (!lanc.recalculada) return toast("Esta planilha foi baixada pelo site e ainda não foi aberta e salva no Excel. Abra no Excel, salve e envie de novo, para os totais incluírem os lançamentos do site.", "err");
          const det = detalhesDaPasta(livro);
          const vistos = new Set();
          const nn = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
          const combina = (a, b) => { a = nn(a); b = nn(b); if (!a || !b) return false; if (a === b) return true;
            const pa = a.split(" "), pb = b.split(" "); return pa.length > 1 && pb.length > 1 && pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1]; };
          const acharCoop = (email, nome) => (email && porEmail[email]) || coops.find((c) => nn(c.nome) === nn(nome)) || coops.find((c) => combina(c.nome, nome));
          const previa = rows.filter((r) => (colEmail && String(r[colEmail]).trim()) || (colNome && String(r[colNome]).trim())).map((r, i) => {
            const email = colEmail ? String(r[colEmail]).toLowerCase().trim() : "";
            const nomePlan = colNome ? String(r[colNome]).trim() : "";
            const c = acharCoop(email, nomePlan);
            const lin = { _n: i + 2, _email: email, _coop: c, _nome: nomePlan, _erros: [] };
            if (c && vistos.has(c.id)) lin._erros.push("cooperado repetido");
            if (c) vistos.add(c.id);
            Object.entries(colunas).forEach(([k, h]) => {
              if (k === "observacao") { lin[k] = String(r[h] || "").slice(0, 1000) || null; return; }
              const v = num(r[h]);
              if (Number.isNaN(v)) lin._erros.push(`valor inválido em "${h}"`);
              else lin[k] = k === "meses_em_atraso" && v != null ? Math.round(v) : v;
            });
            lin.detalhes = det[nomePlan] ? { ...det[nomePlan], nome_planilha: nomePlan } : null;
            return lin;
          });
          const boas = previa.filter((l) => !l._erros.length && l._coop);
          const aguardando = previa.filter((l) => !l._erros.length && !l._coop);
          const numericos = Object.keys(API.CAMPOS_FIN).filter((k) => k !== "observacao");
          const vazia = previa.length && previa.every((l) => numericos.every((k) => l[k] == null || l[k] === 0));
          const abasLidas = ["Posição", ...livro.SheetNames.filter((n) => /^\d{4}-\d{2}$/.test(n)).length ? ["abas mensais"] : [], ...(livro.Sheets["Pagamentos"] ? ["Pagamentos"] : []), ...(livro.Sheets["Resumo"] ? ["Resumo"] : [])];
          $("#fin-previa").innerHTML = `
            ${vazia ? `<div class="notice warn" style="margin-top:1rem"><strong>Atenção: esta planilha não tem nenhum valor preenchido.</strong> Ela não será importada, para não apagar os valores atuais. Envie a planilha financeira completa (com as abas Despesas, Pagamentos, meses etc.).</div>` : ""}
            <div class="notice ${boas.length + aguardando.length === previa.length && !vazia ? "ok" : "warn"}" style="margin-top:1rem">
              Abas lidas: ${esc(abasLidas.join(", "))}. ${boas.length} cooperado(s) já cadastrado(s) no site${aguardando.length ? ` e ${aguardando.length} aguardando cadastro` : ""}${previa.length - boas.length - aguardando.length ? `; ${previa.length - boas.length - aguardando.length} com problema` : ""}.
              ${aguardando.length ? `<br>Quem ainda não se cadastrou recebe os valores automaticamente assim que criar a conta no site (reconhecido pelo nome ou e-mail). Não é preciso reenviar a planilha.` : ""}
            </div>
            <div class="tabela-wrap" style="margin-top:1rem"><table class="tabela">
              <thead><tr><th>Cooperado</th><th class="num">Capital integralizado</th><th class="num">Em aberto</th><th class="num">Aportes</th><th class="num">Meses detalhados</th><th>Situação</th></tr></thead>
              <tbody>${previa.map((l) => `<tr>
                <td>${l._coop ? esc(l._coop.nome) : esc(l._nome || "—")}<span class="sub">${esc(l._email)}</span></td>
                <td class="num">${moeda(l.capital_integralizado)}</td><td class="num">${moeda(l.valor_em_aberto)}</td><td class="num">${moeda(l.outros_creditos)}</td>
                <td class="num">${l.detalhes ? l.detalhes.mensal.length : 0}</td>
                <td>${l._erros.length ? `<span class="selo err">${esc(l._erros.join("; "))}</span>` : l._coop ? '<span class="selo ok">ok</span>' : '<span class="selo">aguardando cadastro</span>'}</td></tr>`).join("")}</tbody>
            </table></div>
            <div class="sol-acoes" style="margin-top:1rem">
              <button class="btn btn-primary" id="fin-confirmar" ${boas.length + aguardando.length && !vazia ? "" : "disabled"}>Confirmar e tornar esta a planilha atual</button>
              <button class="btn btn-ghost" id="fin-cancelar">Cancelar</button>
            </div>`;
          $("#fin-cancelar").onclick = () => { $("#fin-previa").innerHTML = ""; };
          $("#fin-confirmar").onclick = async (ev) => {
            const dados = (l) => { const o = { detalhes: l.detalhes }; Object.keys(C).forEach((k) => { if (k in l) o[k] = l[k]; }); return o; };
            const linhas = boas.map((l) => ({ cooperado_id: l._coop.id, ...dados(l) }));
            const pendentes = aguardando.map((l) => ({ nome: l._nome, email: l._email, dados: dados(l) }));
            const ok = await acao(ev.currentTarget, () => API.financeiro.importar({ data_base: $("#fin-data").value, arquivo: arq, linhas, pendentes, incorporar: lanc.codigos }), "Posição financeira atualizada. Esta é agora a planilha atual.");
            if (ok) paginas.financeiro.render(el, ctx);
          };
        });

        el.onclick = async (e) => {
          const bc = e.target.closest("[data-confirmar]"), br = e.target.closest("[data-recusar]"), bv = e.target.closest("[data-comp]");
          if (bv) { const m = movs.find((x) => x.id === bv.dataset.comp); const url = await acao(bv, () => API.movimentos.comprovante(m)); if (url) window.open(url, "_blank", "noopener"); return; }
          if (bc) {
            const m = movs.find((x) => x.id === bc.dataset.confirmar);
            if (!(await confirmar(`Confirmar o Pix de ${moeda(m.valor)} de ${m.cooperado_nome}? Confirme só depois de ver o valor no extrato.`, "Confirmar Pix"))) return;
            const ok = await acao(bc, () => API.movimentos.decidir(m.id, "confirmado"), "Pix confirmado.");
            if (ok) { paginas.financeiro.render(el, ctx); ctx.atualizarContadores(); }
            return;
          }
          if (br) {
            const m = movs.find((x) => x.id === br.dataset.recusar);
            const md = UI.modal(`<h2>Recusar Pix</h2><p class="muted">Pix de ${moeda(m.valor)} avisado por ${esc(m.cooperado_nome)}. O cooperado verá o motivo.</p>
              <div class="field"><label for="rc-mot">Motivo</label><input class="input" id="rc-mot" maxlength="200" placeholder="Ex.: não encontrei o Pix no extrato"></div>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-danger btn-sm" id="rc-ok">Recusar</button></div>`);
            $("#rc-ok", md.el).onclick = async (ev) => {
              const ok = await acao(ev.currentTarget, () => API.movimentos.decidir(m.id, "recusado", $("#rc-mot", md.el).value.trim()), "Pix recusado.");
              if (ok) { md.fechar(); paginas.financeiro.render(el, ctx); ctx.atualizarContadores(); }
            };
            return;
          }
          const b = e.target.closest("[data-desfazer]"); if (!b) return;
          if (!(await confirmar("Desfazer este envio? As posições e a planilha desse envio são apagadas, e a planilha atual volta a ser a anterior.", "Desfazer"))) return;
          const ok = await acao(b, () => API.financeiro.excluirImportacao(b.dataset.desfazer), "Envio desfeito.");
          if (ok) paginas.financeiro.render(el, ctx);
        };
      }
    },

    conselho: {
      titulo: "Conselho Fiscal",
      async contador(ctx) { return window.ConselhoFiscal.contador(ctx); },
      async render(el, ctx) { return window.ConselhoFiscal.render(el, ctx); }
    },

    comunicados: {
      titulo: "Comunicados",
      async render(el) {
        const coms = await API.comunicados.listar();
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Para os cooperados</p><h1>Comunicados</h1></div></div>
          <section class="painel"><h2>Publicar comunicado</h2>
            <form id="f-com" novalidate style="display:grid;gap:1rem">
              <div class="field"><label for="cm-tit">Título</label><input class="input" id="cm-tit" maxlength="140"></div>
              <div class="field"><label for="cm-corpo">Texto</label><textarea class="input" id="cm-corpo" maxlength="5000"></textarea></div>
              <div><button class="btn btn-primary" id="cm-btn" type="submit">Publicar</button></div>
            </form></section>
          <section class="painel"><h2>Publicados</h2>
            ${coms.length ? `<div class="comunicados">${coms.map((c) => `<article class="comunicado"><div class="comunicado-linha"><div><h3>${esc(c.titulo)}</h3><span class="meta">${esc(c.autor_nome || "")} · ${dataHora(c.publicado_em)}</span></div>
              <button class="btn btn-danger btn-sm" data-del="${c.id}">Excluir</button></div><p>${esc(c.corpo)}</p></article>`).join("")}</div>` : '<p class="vazio">Nenhum comunicado publicado.</p>'}
          </section>`;
        $("#f-com").addEventListener("submit", async (e) => {
          e.preventDefault();
          const titulo = $("#cm-tit").value.trim(), corpo = $("#cm-corpo").value.trim();
          if (!titulo || !corpo) return toast("Preencha título e texto.", "err");
          const ok = await acao($("#cm-btn"), () => API.comunicados.criar({ titulo, corpo }), "Comunicado publicado.");
          if (ok) paginas.comunicados.render(el);
        });
        el.onclick = async (e) => {
          const b = e.target.closest("[data-del]"); if (!b) return;
          if (!(await confirmar("Excluir este comunicado?", "Excluir"))) return;
          const ok = await acao(b, () => API.comunicados.excluir(b.dataset.del), "Comunicado excluído.");
          if (ok) paginas.comunicados.render(el);
        };
      }
    },

    documentos: {
      titulo: "Documentos",
      async render(el) {
        const docs = await API.documentos.listar();
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Acervo</p><h1>Documentos</h1></div></div>
          <section class="painel"><h2>Enviar documento</h2>
            <form id="f-doc" class="form-grid" novalidate>
              <div class="field"><label for="d-tit">Título</label><input class="input" id="d-tit" maxlength="160" placeholder="Ex.: Ata da assembleia de constituição"></div>
              <div class="field"><label for="d-cat">Categoria</label><select class="input" id="d-cat">${opcoes(API.CATEGORIAS_DOC)}</select></div>
              <div class="field full"><label for="d-arq">Arquivo</label><input class="input" id="d-arq" type="file"><span class="hint">PDF, planilhas, modelos IFC, até 50 MB. Todos os cooperados ativos podem ver.</span></div>
              <div class="full"><button class="btn btn-primary" id="d-btn" type="submit">Enviar</button></div>
            </form></section>
          <section class="painel"><h2>Acervo</h2>
            ${docs.length ? `<div class="docs">${docs.map((d) => `<div class="doc"><div><b>${esc(d.titulo)}</b><span>${esc(d.categoria)} · ${esc(d.nome_arquivo)} · ${bytes(d.tamanho || 0)} · ${data(d.criado_em)}</span></div>
              <div class="doc-acoes"><button class="btn btn-ghost btn-sm" data-abrir="${d.id}">Abrir</button><button class="btn btn-danger btn-sm" data-del="${d.id}">Excluir</button></div></div>`).join("")}</div>` : '<p class="vazio">Nenhum documento enviado.</p>'}
          </section>`;
        $("#d-arq").onchange = (e) => { const f = e.target.files[0]; if (f && !$("#d-tit").value) $("#d-tit").value = f.name.replace(/\.[^.]+$/, ""); };
        $("#f-doc").addEventListener("submit", async (e) => {
          e.preventDefault();
          const arquivo = $("#d-arq").files[0];
          const titulo = $("#d-tit").value.trim();
          if (!arquivo) return toast("Escolha um arquivo.", "err");
          if (arquivo.size > 50 * 1024 * 1024) return toast("O arquivo passa de 50 MB.", "err");
          if (!titulo) return toast("Informe o título.", "err");
          const ok = await acao($("#d-btn"), () => API.documentos.enviar({ titulo, categoria: $("#d-cat").value, arquivo }), "Documento enviado.");
          if (ok) paginas.documentos.render(el);
        });
        el.onclick = async (e) => {
          const ab = e.target.closest("[data-abrir]");
          if (ab) { const doc = docs.find((d) => d.id === ab.dataset.abrir); const url = await acao(ab, () => API.documentos.link(doc)); if (url) abrirArquivo(url, doc.nome_arquivo); return; }
          const b = e.target.closest("[data-del]"); if (!b) return;
          if (!(await confirmar("Excluir este documento? O arquivo será apagado.", "Excluir"))) return;
          const ok = await acao(b, () => API.documentos.excluir(docs.find((d) => d.id === b.dataset.del)), "Documento excluído.");
          if (ok) paginas.documentos.render(el);
        };
      }
    },

    mensagens: {
      titulo: "Mensagens do site",
      async contador() { return (await API.contatos.listar()).filter((c) => !c.lido).length; },
      async render(el, ctx) {
        const msgs = await API.contatos.listar();
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Formulário de contato</p><h1>Mensagens do site</h1></div></div>
          ${msgs.length ? msgs.map((m) => `<section class="painel" style="${m.lido ? "opacity:.7" : ""}">
            <div class="painel-cab"><div><h2>${m.tipo === "denuncia" ? '<span class="selo err">Canal de denúncias</span> ' : ""}${esc(m.nome)}${m.orgao ? ` <span class="muted" style="font-weight:400">· ${esc(m.orgao)}</span>` : ""}</h2>
              <span class="hint">${dataHora(m.criado_em)}${m.email ? ` · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ""}${m.telefone ? " · " + esc(m.telefone) : ""}</span></div>
              <button class="btn ${m.lido ? "btn-ghost" : "btn-primary"} btn-sm" data-lido="${m.id}" data-v="${m.lido ? 0 : 1}">${m.lido ? "Marcar como não lida" : "Marcar como lida"}</button></div>
            <p style="white-space:pre-line">${esc(m.mensagem)}</p></section>`).join("") : '<p class="vazio">Nenhuma mensagem recebida pelo site.</p>'}`;
        el.onclick = async (e) => {
          const b = e.target.closest("[data-lido]"); if (!b) return;
          const ok = await acao(b, () => API.contatos.marcarLido(b.dataset.lido, b.dataset.v === "1"));
          if (ok) { ctx.atualizarContadores(); paginas.mensagens.render(el, ctx); }
        };
      }
    }
  };

  function abrirArquivo(url, nome) {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    if (url.startsWith("data:")) a.download = nome || "documento";
    document.body.appendChild(a); a.click(); a.remove();
  }

  window.App.iniciar({
    area: "interno",
    paginas,
    filtrar: (todas, { coord, tes, fiscal }) => {
      if (coord) return todas;
      const out = {};
      if (tes || fiscal) out.financeiro = { ...todas.financeiro, separador: false };
      if (fiscal) out.conselho = { ...todas.conselho, separador: false };
      return out;
    }
  });
})();
