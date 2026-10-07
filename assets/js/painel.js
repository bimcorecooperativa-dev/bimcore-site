/* Área do cooperado: início, horas, documentos, perfil */
(function () {
  "use strict";
  const { $, esc, data, dataHora, horas, bytes, hoje, mesAtual, acao, confirmar, toast } = window.UI;
  const API = window.API;
  const TIPOS = API.TIPOS_HORA;
  const LIMITE_FTI = 0.10;

  const resumo = (lista) => {
    const t = { produtiva: 0, formacao: 0, ociosidade_estrategica: 0, ociosidade_operacional: 0 };
    lista.forEach((h) => { t[h.tipo] = (t[h.tipo] || 0) + Number(h.horas || 0); });
    const base = t.produtiva + t.formacao;
    t.fti = base ? t.formacao / base : 0;
    return t;
  };
  const seloFti = (fti) => fti > LIMITE_FTI
    ? `<span class="selo warn">${Math.round(fti * 100)}% em formação</span>`
    : `<span class="selo ok">${Math.round(fti * 100)}% em formação</span>`;

  const paginas = {
    inicio: {
      titulo: "Início",
      async render(el, ctx) {
        const [coms, minhas] = await Promise.all([API.comunicados.listar(), API.producao.minhas()]);
        const mes = mesAtual();
        const t = resumo(minhas.filter((h) => h.data.startsWith(mes)));
        const nomeMes = new Date(mes + "-15").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">${esc(nomeMes)}</p><h1>Olá, ${esc((ctx.sessao.perfil.nome || "").split(" ")[0] || "cooperado")}</h1></div>
            <a class="btn btn-primary" href="#horas">Lançar horas</a></div>
          <div class="kpis">
            <div class="kpi"><span class="rot">Produção técnica</span><span class="val">${horas(t.produtiva)}</span><span class="det">Base do cálculo das sobras</span></div>
            <div class="kpi"><span class="rot">Formação integrada</span><span class="val">${horas(t.formacao)}</span><span class="det">${seloFti(t.fti)} · limite 10%</span></div>
            <div class="kpi"><span class="rot">Pendência externa</span><span class="val">${horas(t.ociosidade_estrategica)}</span><span class="det">Não afeta o seu IEO</span></div>
          </div>
          <section class="painel"><h2>Comunicados da coordenação</h2>
            ${coms.length ? `<div class="comunicados">${coms.map((c) => `
              <article class="comunicado"><h3>${esc(c.titulo)}</h3><span class="meta">${esc(c.autor_nome || "Coordenação")} · ${dataHora(c.publicado_em)}</span><p>${esc(c.corpo)}</p></article>`).join("")}</div>`
              : '<p class="vazio">Nenhum comunicado publicado ainda.</p>'}
          </section>`;
      }
    },

    horas: {
      titulo: "Minhas horas",
      async render(el) {
        const [projetos, minhas] = await Promise.all([API.projetos.listar(), API.producao.minhas()]);
        const ativos = projetos.filter((p) => p.status !== "Concluído" && p.status !== "Suspenso");
        let filtroMes = mesAtual();

        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Produção</p><h1>Minhas horas</h1></div></div>
          <section class="painel">
            <h2>Novo lançamento</h2>
            <form id="f-hora" class="form-grid" novalidate>
              <div class="field"><label for="h-proj">Projeto</label>
                <select class="input" id="h-proj">${ativos.length ? ativos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("") : ""}<option value="">Sem projeto (atividade interna)</option></select></div>
              <div class="field"><label for="h-tipo">Tipo de hora</label>
                <select class="input" id="h-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
              <div class="field"><label for="h-data">Data</label><input class="input" id="h-data" type="date" value="${hoje()}" max="${hoje()}"></div>
              <div class="field"><label for="h-horas">Horas</label><input class="input" id="h-horas" type="number" min="0.25" max="12" step="0.25" inputmode="decimal" placeholder="Ex.: 6"></div>
              <div class="field full"><label for="h-desc">O que foi feito</label><input class="input" id="h-desc" maxlength="300" placeholder="Ex.: Compatibilização arquitetura x estrutura do bloco A"></div>
              <p class="hint full">Pendência externa (ociosidade estratégica) é o tempo parado por atraso do órgão público. Registre o número do protocolo ou o e-mail na descrição.</p>
              <div class="full"><button class="btn btn-primary" id="h-btn" type="submit">Lançar</button></div>
            </form>
          </section>
          <section class="painel">
            <div class="painel-cab"><h2>Lançamentos</h2>
              <div class="field"><label for="h-mes" class="sr-only">Mês</label><input class="input" id="h-mes" type="month" value="${filtroMes}"></div></div>
            <div id="h-lista"></div>
          </section>`;

        const lista = $("#h-lista");
        const desenhar = () => {
          const doMes = minhas.filter((h) => !filtroMes || h.data.startsWith(filtroMes));
          const t = resumo(doMes);
          if (!doMes.length) { lista.innerHTML = '<p class="vazio">Nenhum lançamento neste mês.</p>'; return; }
          lista.innerHTML = `
            <div class="kpis" style="margin-bottom:1rem">
              ${Object.entries(TIPOS).map(([k, v]) => `<div class="kpi"><span class="rot">${esc(v.split(" (")[0])}</span><span class="val">${horas(t[k])}</span></div>`).join("")}
            </div>
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Data</th><th>Projeto</th><th>Tipo</th><th class="num">Horas</th><th><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${doMes.map((h) => `<tr>
                <td class="num" style="text-align:left">${data(h.data)}</td>
                <td>${esc(h.projeto_nome || "Atividade interna")}<span class="sub">${esc(h.descricao || "")}</span></td>
                <td>${esc(TIPOS[h.tipo] || h.tipo)}</td>
                <td class="num">${horas(h.horas)}</td>
                <td class="acoes-celula"><button class="btn btn-danger btn-sm" data-del="${h.id}">Excluir</button></td></tr>`).join("")}</tbody>
            </table></div>`;
        };
        desenhar();

        $("#h-mes").addEventListener("change", (e) => { filtroMes = e.target.value; desenhar(); });
        lista.addEventListener("click", async (e) => {
          const b = e.target.closest("[data-del]"); if (!b) return;
          if (!(await confirmar("Excluir este lançamento de horas?", "Excluir"))) return;
          const ok = await acao(b, () => API.producao.excluir(b.dataset.del), "Lançamento excluído.");
          if (ok) { const i = minhas.findIndex((h) => h.id === b.dataset.del); minhas.splice(i, 1); desenhar(); }
        });
        $("#f-hora").addEventListener("submit", async (e) => {
          e.preventDefault();
          const h = { projeto_id: $("#h-proj").value || null, tipo: $("#h-tipo").value, data: $("#h-data").value, horas: parseFloat(String($("#h-horas").value).replace(",", ".")), descricao: $("#h-desc").value.trim() };
          if (!h.data) return toast("Informe a data.", "err");
          if (!(h.horas > 0 && h.horas <= 12)) return toast("Informe entre 0,25 e 12 horas.", "err");
          if (!h.descricao) return toast("Descreva o que foi feito.", "err");
          const ok = await acao($("#h-btn"), () => API.producao.lancar(h), "Horas lançadas.");
          if (ok) {
            const novas = await API.producao.minhas();
            minhas.length = 0; minhas.push(...novas);
            $("#h-horas").value = ""; $("#h-desc").value = "";
            filtroMes = h.data.slice(0, 7); $("#h-mes").value = filtroMes; desenhar();
          }
        });
      }
    },

    conta: {
      titulo: "Minha conta",
      async render(el) {
        const { moeda } = window.UI;
        const pos = await API.financeiro.minhas();
        if (!pos.length) {
          el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Financeiro</p><h1>Minha conta na cooperativa</h1></div></div>
            <p class="vazio">A tesouraria ainda não registrou a sua posição financeira. Quando registrar, aqui aparecem seu capital, contribuições, fundos e eventuais pendências.</p>`;
          return;
        }
        const p = pos[0];
        const n = (k) => Number(p[k] || 0);
        const aIntegralizar = Math.max(0, n("capital_subscrito") - n("capital_integralizado"));
        const pct = n("capital_subscrito") ? Math.min(100, (n("capital_integralizado") / n("capital_subscrito")) * 100) : 0;
        const contribuido = p.contribuicoes_pagas != null ? n("contribuicoes_pagas") : n("capital_integralizado");
        const emDebito = n("valor_em_aberto") > 0;
        const fundosInd = n("fic_saldo") + n("fundo_13") + n("fundo_ferias") + n("sobras_a_receber") + n("outros_creditos");
        const restituivel = Math.max(0, n("capital_integralizado") + fundosInd - n("valor_em_aberto"));
        const linhaFundo = (rot, k, art) => `<tr><td>${rot}<span class="sub">${art}</span></td><td class="num">${moeda(n(k))}</td></tr>`;

        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Financeiro · posição em ${data(p.data_base)}</p><h1>Minha conta na cooperativa</h1></div>
            ${emDebito ? `<span class="selo err">Em débito: ${moeda(n("valor_em_aberto"))}</span>` : '<span class="selo ok">Em dia com a cooperativa</span>'}</div>

          <div class="kpis">
            <div class="kpi"><span class="rot">Contribuição mensal</span><span class="val">${moeda(n("contribuicao_mensal"))}</span><span class="det">Valor que você deve contribuir por mês</span></div>
            <div class="kpi"><span class="rot">Em aberto</span><span class="val" style="color:${emDebito ? "var(--err)" : "var(--ok)"}">${moeda(n("valor_em_aberto"))}</span><span class="det">${emDebito ? (p.meses_em_atraso ? p.meses_em_atraso + " mês(es) em atraso" : "Regularize com a tesouraria") : "Nenhuma pendência"}</span></div>
            <div class="kpi"><span class="rot">Total contribuído</span><span class="val">${moeda(contribuido)}</span><span class="det">Acumulado registrado pela tesouraria</span></div>
            <div class="kpi"><span class="rot">Seus fundos individuais</span><span class="val">${moeda(fundosInd)}</span><span class="det">FIC, 13º, férias e créditos</span></div>
          </div>

          <section class="painel">
            <h2>Capital social (quotas-parte)</h2>
            <dl class="sol-dados">
              <div><dt>Quotas subscritas</dt><dd class="num">${p.quotas_subscritas != null ? Number(p.quotas_subscritas).toLocaleString("pt-BR") : "—"}</dd></div>
              <div><dt>Capital subscrito</dt><dd class="num">${moeda(n("capital_subscrito"))}</dd></div>
              <div><dt>Capital integralizado</dt><dd class="num">${moeda(n("capital_integralizado"))}</dd></div>
              <div><dt>Falta integralizar</dt><dd class="num">${moeda(aIntegralizar)}</dd></div>
            </dl>
            <div class="barra" aria-hidden="true"><i style="width:${pct}%"></i></div>
            <p class="hint">Além da integralização inicial, a formação do capital continua todo mês: 1,5% das suas retiradas, ou o valor de 1 quota-parte nos meses sem retirada (Estatuto, art. 23, §4º).</p>
          </section>

          <section class="painel">
            <h2>Fundos e créditos individuais</h2>
            <div class="tabela-wrap"><table class="tabela"><tbody>
              ${linhaFundo("Fundo Individual de Capitalização (FIC)", "fic_saldo", "Aporte da cooperativa e aportes voluntários, com rendimentos (art. 78)")}
              ${linhaFundo("Fundo de 13º", "fundo_13", "Provisão mensal de 1/12 das retiradas, paga até 20 de dezembro (art. 79)")}
              ${linhaFundo("Fundo de férias", "fundo_ferias", "Provisão mensal de 1/12 das retiradas, paga no recesso anual (art. 79)")}
              ${linhaFundo("Sobras a receber", "sobras_a_receber", "Rateio aprovado em Assembleia Geral")}
              ${linhaFundo("Outros créditos", "outros_creditos", "Demais valores registrados a seu favor")}
            </tbody><tfoot><tr><td>Total</td><td class="num">${moeda(fundosInd)}</td></tr></tfoot></table></div>
          </section>

          <section class="painel">
            <h2>Se você sair da cooperativa</h2>
            <div class="kpis"><div class="kpi"><span class="rot">Valor restituível estimado</span><span class="val">${moeda(restituivel)}</span><span class="det">Capital integralizado + fundos individuais − valor em aberto</span></div></div>
            <ul class="hint" style="margin:0;padding-left:1.1rem;display:grid;gap:.3rem">
              <li>O capital integralizado é devolvido corrigido, junto com sobras e créditos registrados, depois que a Assembleia Geral aprovar o balanço do ano do desligamento. O Conselho de Administração pode parcelar em até 10 vezes (art. 19).</li>
              <li>O saldo do FIC é resgatado no desligamento, também após a aprovação do balanço (art. 78, §5º).</li>
              <li>Dívidas com a cooperativa vencem no desligamento e são descontadas (art. 21).</li>
              <li>Os fundos coletivos (Fundo de Reserva, FATES e FEI) são indivisíveis e não são restituídos.</li>
            </ul>
            <p class="hint">Esta é uma estimativa com base na última posição informada. O valor oficial é o apurado no balanço.</p>
          </section>

          ${p.observacao ? `<div class="notice"><b>Observação da tesouraria:</b> ${esc(p.observacao)}</div>` : ""}

          ${pos.length > 1 ? `<section class="painel"><h2>Histórico</h2><div class="tabela-wrap"><table class="tabela">
            <thead><tr><th>Data-base</th><th class="num">Capital integralizado</th><th class="num">Em aberto</th><th class="num">FIC</th><th class="num">13º</th><th class="num">Férias</th></tr></thead>
            <tbody>${pos.map((h) => `<tr><td>${data(h.data_base)}</td><td class="num">${moeda(h.capital_integralizado)}</td><td class="num">${moeda(h.valor_em_aberto)}</td><td class="num">${moeda(h.fic_saldo)}</td><td class="num">${moeda(h.fundo_13)}</td><td class="num">${moeda(h.fundo_ferias)}</td></tr>`).join("")}</tbody>
          </table></div></section>` : ""}

          <p class="hint">Valores registrados pela tesouraria da BIMCORE, conforme o art. 7º, IV do Estatuto. Dúvidas ou divergências: fale com a tesouraria.</p>`;
      }
    },

    documentos: {
      titulo: "Documentos",
      async render(el) {
        const docs = await API.documentos.listar();
        const grupos = {};
        docs.forEach((d) => { (grupos[d.categoria] = grupos[d.categoria] || []).push(d); });
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Cooperativa</p><h1>Documentos</h1></div></div>
          ${docs.length ? API.CATEGORIAS_DOC.filter((c) => grupos[c]).map((c) => `
            <section class="painel"><h2>${esc(c)}</h2><div class="docs">
              ${grupos[c].map((d) => `<div class="doc"><div><b>${esc(d.titulo)}</b><span>${esc(d.nome_arquivo)} · ${bytes(d.tamanho || 0)} · ${data(d.criado_em)}</span></div>
                <div class="doc-acoes"><button class="btn btn-ghost btn-sm" data-abrir="${d.id}">Abrir</button></div></div>`).join("")}
            </div></section>`).join("") : '<p class="vazio">A coordenação ainda não publicou documentos.</p>'}`;
        el.onclick = async (e) => {
          const b = e.target.closest("[data-abrir]"); if (!b) return;
          const doc = docs.find((d) => d.id === b.dataset.abrir);
          const url = await acao(b, () => API.documentos.link(doc));
          if (url) abrirArquivo(url, doc.nome_arquivo);
        };
      }
    },

    perfil: {
      titulo: "Meu perfil",
      separador: true,
      async render(el, ctx) {
        const p = ctx.sessao.perfil;
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Cadastro</p><h1>Meu perfil</h1></div></div>
          <section class="painel"><h2>Dados</h2>
            <form id="f-perfil" class="form-grid" novalidate>
              <div class="field"><label for="p-nome">Nome completo</label><input class="input" id="p-nome" value="${esc(p.nome)}" autocomplete="name"></div>
              <div class="field"><label for="p-tel">Telefone</label><input class="input" id="p-tel" value="${esc(p.telefone)}" type="tel" autocomplete="tel"></div>
              <div class="field full"><label for="p-esp">Especialidade</label><input class="input" id="p-esp" value="${esc(p.especialidade)}" placeholder="Ex.: Estrutural, MEP, orçamento, coordenação BIM"></div>
              <div class="field"><label>E-mail</label><input class="input" value="${esc(p.email)}" disabled></div>
              <div class="field"><label>Cooperado desde</label><input class="input" value="${data(p.data_ingresso)}" disabled></div>
              <div class="full"><button class="btn btn-primary" id="p-btn" type="submit">Salvar dados</button></div>
            </form>
          </section>
          <section class="painel"><h2>Trocar senha</h2>
            <form id="f-senha" class="form-grid" novalidate>
              <div class="field"><label for="s-nova">Nova senha</label><input class="input" id="s-nova" type="password" autocomplete="new-password" minlength="8"></div>
              <div class="field" style="align-self:end"><button class="btn btn-ghost" id="s-btn" type="submit">Trocar senha</button></div>
            </form>
          </section>`;
        $("#f-perfil").addEventListener("submit", async (e) => {
          e.preventDefault();
          const ok = await acao($("#p-btn"), () => API.perfil.atualizarMeu({ nome: $("#p-nome").value.trim(), telefone: $("#p-tel").value.trim(), especialidade: $("#p-esp").value.trim() }), "Dados salvos.");
          if (ok) await ctx.recarregarSessao();
        });
        $("#f-senha").addEventListener("submit", async (e) => {
          e.preventDefault();
          const s = $("#s-nova").value;
          if (s.length < 8) return toast("A senha precisa ter pelo menos 8 caracteres.", "err");
          const ok = await acao($("#s-btn"), () => API.updatePassword(s), "Senha alterada.");
          if (ok) $("#s-nova").value = "";
        });
      }
    }
  };

  function abrirArquivo(url, nome) {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    if (url.startsWith("data:")) a.download = nome || "documento";
    document.body.appendChild(a); a.click(); a.remove();
  }
  window.abrirArquivo = abrirArquivo;

  window.App.iniciar({
    area: "cooperado",
    paginas,
    async antes(ctx, el) {
      const p = ctx.sessao.perfil;
      if (p.status === "ativo") return false;
      const resumo = `<dl class="sol-dados">
          <div><dt>Área pretendida</dt><dd>${esc(p.area_atuacao || "—")}</dd></div>
          <div><dt>Formação</dt><dd>${esc(p.formacao || "—")}</dd></div>
          <div><dt>Enviada em</dt><dd>${data(p.criado_em)}</dd></div>
        </dl>`;
      const textos = {
        pendente: ["Solicitação em análise", `Olá, ${esc((p.nome || "").split(" ")[0])}. Recebemos sua solicitação de admissão. A coordenação da BIMCORE vai analisar seu perfil e entrar em contato pelo telefone ou e-mail informados.`],
        entrevista: ["Etapa de conversa", `Olá, ${esc((p.nome || "").split(" ")[0])}. Seu perfil passou pela primeira análise. A coordenação vai entrar em contato para marcar uma conversa sobre a admissão.`],
        recusado: ["Solicitação não aprovada", "Neste momento a cooperativa não vai prosseguir com a sua admissão. Agradecemos o interesse na BIMCORE."],
        desligado: ["Acesso encerrado", "Seu vínculo com a cooperativa foi encerrado."]
      };
      const [titulo, texto] = textos[p.status] || textos.pendente;
      el.innerHTML = `<section class="painel">
          <p class="eyebrow">Admissão</p>
          <h1 style="font-size:1.5rem">${titulo}</h1>
          <p class="muted">${texto}</p>
          ${p.status === "pendente" || p.status === "entrevista" ? resumo : ""}
          <p class="hint">Dúvidas: WhatsApp (22) 99874-5742 ou bimcorecooperativa@gmail.com.</p>
        </section>`;
      return true;
    }
  });
})();
