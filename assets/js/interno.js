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
          <p class="muted">Cooperados admitidos. O papel <b>coordenação</b> dá acesso a toda a área interna; a marcação <b>Tesouraria</b> dá acesso só à aba Financeiro, para quem atualiza os valores. Novos pedidos de entrada ficam em Solicitações de admissão.</p>
          ${coops.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Nome</th><th>Área de atuação</th><th>Desde</th><th>Situação</th><th>Papel</th><th>Tesouraria</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${coops.map((c) => `<tr data-id="${c.id}">
              <td><b>${esc(c.nome || "(sem nome)")}</b><span class="sub">${esc(c.email)}${c.telefone ? " · " + esc(c.telefone) : ""}</span></td>
              <td>${esc(c.area_atuacao || c.especialidade || "—")}${c.registro_profissional ? `<span class="sub">${esc(c.registro_profissional)}</span>` : ""}</td>
              <td class="num" style="text-align:left">${data(c.data_ingresso)}</td>
              <td><select class="input mini" data-campo="status" aria-label="Situação de ${esc(c.nome)}" ${c.id === ctx.sessao.perfil.id ? "disabled" : ""}><option value="ativo" ${c.status === "ativo" ? "selected" : ""}>ativo</option><option value="desligado" ${c.status === "desligado" ? "selected" : ""}>desligado</option></select></td>
              <td><select class="input mini" data-campo="papel" aria-label="Papel de ${esc(c.nome)}" ${c.id === ctx.sessao.perfil.id ? "disabled" : ""}><option value="cooperado" ${c.papel === "cooperado" ? "selected" : ""}>cooperado</option><option value="coordenacao" ${c.papel === "coordenacao" ? "selected" : ""}>coordenação</option></select></td>
              <td><label class="ciente" style="margin:0"><input type="checkbox" data-campo="tesouraria" ${c.tesouraria ? "checked" : ""} ${c.id === ctx.sessao.perfil.id ? "disabled" : ""}> <span>acesso</span></label></td>
              <td class="acoes-celula">${c.id === ctx.sessao.perfil.id ? '<span class="hint">você</span>' : '<button class="btn btn-primary btn-sm" data-salvar>Salvar</button>'}</td></tr>`).join("")}</tbody>
          </table></div>` : '<p class="vazio">Nenhum cooperado admitido ainda.</p>'}`;
        el.onclick = async (e) => {
          const b = e.target.closest("[data-salvar]"); if (!b) return;
          const tr = b.closest("tr");
          const dados = { status: tr.querySelector('[data-campo="status"]').value, papel: tr.querySelector('[data-campo="papel"]').value, tesouraria: tr.querySelector('[data-campo="tesouraria"]').checked };
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
            por[k] = por[k] || { nome: h.cooperado_nome, produtiva: 0, formacao: 0, ociosidade_estrategica: 0, ociosidade_operacional: 0 };
            por[k][h.tipo] += Number(h.horas || 0);
          });
          const linhas = Object.values(por).sort((a, b) => b.produtiva - a.produtiva);
          const totalProd = linhas.reduce((a, l) => a + l.produtiva, 0);
          $("#pr-resumo").innerHTML = linhas.length ? `<div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Cooperado</th><th class="num">Produtivas</th><th class="num">Formação</th><th class="num">Pend. externa</th><th class="num">Ociosidade op.</th><th class="num">Participação</th></tr></thead>
            <tbody>${linhas.map((l) => { const fti = l.produtiva + l.formacao ? l.formacao / (l.produtiva + l.formacao) : 0; return `<tr>
              <td>${esc(l.nome)}</td><td class="num">${horas(l.produtiva)}</td>
              <td class="num">${horas(l.formacao)}${fti > 0.1 ? `<span class="sub"><span class="selo warn">${Math.round(fti * 100)}%</span></span>` : ""}</td>
              <td class="num">${horas(l.ociosidade_estrategica)}</td><td class="num">${horas(l.ociosidade_operacional)}</td>
              <td class="num">${totalProd ? ((l.produtiva / totalProd) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—"}</td></tr>`; }).join("")}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${horas(totalProd)}</td><td class="num">${horas(linhas.reduce((a, l) => a + l.formacao, 0))}</td><td class="num">${horas(linhas.reduce((a, l) => a + l.ociosidade_estrategica, 0))}</td><td class="num">${horas(linhas.reduce((a, l) => a + l.ociosidade_operacional, 0))}</td><td class="num">100%</td></tr></tfoot>
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
      async render(el, ctx) {
        const C = API.CAMPOS_FIN;
        const [coops, posicoes, imps] = await Promise.all([API.cooperados.listar(), API.financeiro.todas(), API.financeiro.importacoes()]);
        const ativos = coops.filter((c) => c.status === "ativo" || c.status === "desligado");
        const ultima = {};
        posicoes.forEach((p) => { const u = ultima[p.cooperado_id]; if (!u || p.data_base > u.data_base) ultima[p.cooperado_id] = p; });
        const linhasAtuais = Object.values(ultima).sort((a, b) => (a.cooperado_nome || "").localeCompare(b.cooperado_nome || ""));
        const soma = (k) => linhasAtuais.reduce((a, p) => a + Number(p[k] || 0), 0);
        let previa = null;

        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Tesouraria</p><h1>Financeiro dos cooperados</h1></div>
            <button class="btn btn-ghost" id="fin-modelo">Baixar planilha modelo</button></div>
          <p class="muted">Cada cooperado vê só a própria posição, na aba "Minha conta". Para atualizar, baixe a planilha modelo (ela já vem com todos os cooperados e os últimos valores), altere os números e envie de volta. O sistema identifica cada cooperado pelo e-mail.</p>

          <section class="painel">
            <h2>Enviar planilha atualizada</h2>
            <form id="fin-form" class="form-grid" novalidate>
              <div class="field"><label for="fin-data">Data-base dos valores</label><input class="input" id="fin-data" type="date" value="${UI.hoje()}"></div>
              <div class="field"><label for="fin-arq">Planilha (.xlsx, .xls ou .csv)</label><input class="input" id="fin-arq" type="file" accept=".xlsx,.xls,.csv"></div>
              <div class="full"><button class="btn btn-primary" id="fin-ler" type="submit">Ler planilha</button></div>
            </form>
            <div id="fin-previa"></div>
          </section>

          <section class="painel">
            <h2>Posição atual</h2>
            ${linhasAtuais.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Cooperado</th><th>Data-base</th><th class="num">Capital integralizado</th><th class="num">Contrib. mensal</th><th class="num">Em aberto</th><th class="num">FIC</th><th class="num">13º</th><th class="num">Férias</th></tr></thead>
              <tbody>${linhasAtuais.map((p) => `<tr><td>${esc(p.cooperado_nome)}</td><td class="num" style="text-align:left">${data(p.data_base)}</td>
                <td class="num">${moeda(p.capital_integralizado)}<span class="sub">de ${moeda(p.capital_subscrito)}</span></td>
                <td class="num">${moeda(p.contribuicao_mensal)}</td>
                <td class="num">${Number(p.valor_em_aberto) > 0 ? `<span class="selo err">${moeda(p.valor_em_aberto)}</span>` : '<span class="selo ok">em dia</span>'}</td>
                <td class="num">${moeda(p.fic_saldo)}</td><td class="num">${moeda(p.fundo_13)}</td><td class="num">${moeda(p.fundo_ferias)}</td></tr>`).join("")}</tbody>
              <tfoot><tr><td>Total</td><td></td><td class="num">${moeda(soma("capital_integralizado"))}</td><td class="num">${moeda(soma("contribuicao_mensal"))}</td><td class="num">${moeda(soma("valor_em_aberto"))}</td><td class="num">${moeda(soma("fic_saldo"))}</td><td class="num">${moeda(soma("fundo_13"))}</td><td class="num">${moeda(soma("fundo_ferias"))}</td></tr></tfoot>
            </table></div>` : '<p class="vazio">Nenhuma posição registrada ainda. Baixe a planilha modelo para começar.</p>'}
          </section>

          <section class="painel">
            <h2>Histórico de envios</h2>
            ${imps.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Enviado em</th><th>Data-base</th><th>Arquivo</th><th class="num">Cooperados</th><th>Por</th><th><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${imps.map((i) => `<tr><td>${dataHora(i.criado_em)}</td><td>${data(i.data_base)}</td><td>${esc(i.arquivo || "—")}</td><td class="num">${i.linhas}</td><td>${esc(i.criado_nome || "—")}</td>
                <td class="acoes-celula"><button class="btn btn-danger btn-sm" data-desfazer="${i.id}">Desfazer</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhum envio ainda.</p>'}
          </section>`;

        const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const mapa = {}; Object.entries(C).forEach(([k, r]) => { mapa[norm(r)] = k; mapa[norm(r.replace(/\s*\(R\$\)/, ""))] = k; mapa[norm(k)] = k; });
        const valor = (v) => {
          if (v === null || v === undefined || v === "") return null;
          if (typeof v === "number") return Math.round(v * 100) / 100;
          let t = String(v).replace(/R\$|\s/g, "");
          if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
          const n = parseFloat(t); return isNaN(n) ? NaN : Math.round(n * 100) / 100;
        };
        const porEmail = {}; coops.forEach((c) => { porEmail[String(c.email).toLowerCase().trim()] = c; });

        $("#fin-modelo").onclick = () => {
          if (!window.XLSX) return toast("Não foi possível carregar o gerador de planilhas. Recarregue a página.", "err");
          const cab = ["Nome", "E-mail", ...Object.values(C)];
          const linhas = ativos.map((c) => { const u = ultima[c.id] || {}; return [c.nome, c.email, ...Object.keys(C).map((k) => (u[k] == null ? "" : u[k]))]; });
          const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
          ws["!cols"] = cab.map((h, i) => ({ wch: i < 2 ? 30 : Math.max(14, h.length + 2) }));
          const inst = XLSX.utils.aoa_to_sheet([
            ["Como preencher"],
            ["1. Não altere a coluna E-mail: é por ela que o sistema identifica cada cooperado."],
            ["2. Valores em reais podem ser digitados como 1234,56 ou 1234.56."],
            ["3. Deixe em branco o que não se aplica."],
            ["4. Contribuição mensal: valor que o cooperado deve pagar por mês (art. 23, §4º: 1,5% das retiradas ou 1 quota-parte se não houver retiradas)."],
            ["5. Valor em aberto: total que o cooperado deve hoje à cooperativa."],
            ["6. Fundos individuais: FIC (art. 78), 13º e férias (art. 79)."],
            ["7. Salve e envie em bimcore.com.br, Área interna > Financeiro, informando a data-base."]
          ]);
          inst["!cols"] = [{ wch: 110 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Posição");
          XLSX.utils.book_append_sheet(wb, inst, "Instruções");
          XLSX.writeFile(wb, `bimcore-posicao-financeira-${UI.hoje()}.xlsx`);
        };

        $("#fin-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const arq = $("#fin-arq").files[0];
          if (!arq) return toast("Escolha a planilha.", "err");
          if (!$("#fin-data").value) return toast("Informe a data-base.", "err");
          if (!window.XLSX) return toast("Não foi possível carregar o leitor de planilhas. Recarregue a página.", "err");
          let wb;
          try { wb = XLSX.read(await arq.arrayBuffer(), { type: "array" }); } catch (err) { return toast("Não consegui ler esse arquivo. Envie em .xlsx, .xls ou .csv.", "err"); }
          const nomeAba = wb.SheetNames.find((n) => norm(n) === "posicao") || wb.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { defval: "", raw: true });
          if (!rows.length) return toast("A planilha está vazia.", "err");
          const cabs = Object.keys(rows[0]);
          const colEmail = cabs.find((h) => norm(h).includes("email"));
          if (!colEmail) return toast("Não encontrei a coluna E-mail. Use a planilha modelo.", "err");
          const colunas = {}; cabs.forEach((h) => { const k = mapa[norm(h)]; if (k) colunas[k] = h; });
          const reconhecidas = Object.keys(colunas).length;
          const vistos = new Set();
          previa = rows.filter((r) => String(r[colEmail]).trim()).map((r, i) => {
            const email = String(r[colEmail]).toLowerCase().trim();
            const c = porEmail[email];
            const lin = { _n: i + 2, _email: email, _coop: c, _erros: [] };
            if (!c) lin._erros.push("e-mail não cadastrado");
            else if (vistos.has(c.id)) lin._erros.push("cooperado repetido na planilha");
            if (c) vistos.add(c.id);
            Object.entries(colunas).forEach(([k, h]) => {
              if (k === "observacao") { lin[k] = String(r[h] || "").slice(0, 1000) || null; return; }
              const v = valor(r[h]);
              if (Number.isNaN(v)) lin._erros.push(`valor inválido em "${h}"`);
              else lin[k] = k === "meses_em_atraso" && v != null ? Math.round(v) : v;
            });
            return lin;
          });
          const boas = previa.filter((l) => !l._erros.length);
          $("#fin-previa").innerHTML = `
            <div class="notice ${boas.length === previa.length ? "ok" : "warn"}" style="margin-top:1rem">
              ${reconhecidas} colunas reconhecidas. ${boas.length} de ${previa.length} linhas prontas para importar${previa.length - boas.length ? `; ${previa.length - boas.length} com problema (não serão importadas)` : ""}.
            </div>
            <div class="tabela-wrap" style="margin-top:1rem"><table class="tabela">
              <thead><tr><th>Linha</th><th>Cooperado</th><th class="num">Capital integralizado</th><th class="num">Contrib. mensal</th><th class="num">Em aberto</th><th class="num">FIC</th><th>Situação</th></tr></thead>
              <tbody>${previa.map((l) => `<tr><td class="num" style="text-align:left">${l._n}</td>
                <td>${l._coop ? esc(l._coop.nome) : "—"}<span class="sub">${esc(l._email)}</span></td>
                <td class="num">${moeda(l.capital_integralizado)}</td><td class="num">${moeda(l.contribuicao_mensal)}</td><td class="num">${moeda(l.valor_em_aberto)}</td><td class="num">${moeda(l.fic_saldo)}</td>
                <td>${l._erros.length ? `<span class="selo err">${esc(l._erros.join("; "))}</span>` : '<span class="selo ok">ok</span>'}</td></tr>`).join("")}</tbody>
            </table></div>
            <div class="sol-acoes" style="margin-top:1rem">
              <button class="btn btn-primary" id="fin-confirmar" ${boas.length ? "" : "disabled"}>Confirmar importação de ${boas.length} cooperado(s)</button>
              <button class="btn btn-ghost" id="fin-cancelar">Cancelar</button>
            </div>`;
          $("#fin-cancelar").onclick = () => { previa = null; $("#fin-previa").innerHTML = ""; };
          $("#fin-confirmar").onclick = async (ev) => {
            const linhas = boas.map((l) => { const o = { cooperado_id: l._coop.id }; Object.keys(C).forEach((k) => { if (k in l) o[k] = l[k]; }); return o; });
            const ok = await acao(ev.currentTarget, () => API.financeiro.importar({ data_base: $("#fin-data").value, arquivo: arq.name, linhas }), "Posição financeira atualizada.");
            if (ok) paginas.financeiro.render(el, ctx);
          };
        });

        el.onclick = async (e) => {
          const b = e.target.closest("[data-desfazer]"); if (!b) return;
          if (!(await confirmar("Desfazer este envio? As posições dessa planilha deixam de aparecer para os cooperados.", "Desfazer"))) return;
          const ok = await acao(b, () => API.financeiro.excluirImportacao(b.dataset.desfazer), "Envio desfeito.");
          if (ok) paginas.financeiro.render(el, ctx);
        };
      }
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
    filtrar: (todas, { coord }) => (coord ? todas : { financeiro: { ...todas.financeiro, separador: false } })
  });
})();
