/* Área do cooperado: início, horas, documentos, perfil */
(function () {
  "use strict";
  const UI = window.UI;
  const { $, esc, data, dataHora, horas, bytes, hoje, mesAtual, acao, confirmar, toast } = window.UI;
  const API = window.API;
  const TIPOS = API.TIPOS_HORA;
  const DESC = API.DESC_HORA || {};
  const iTipo = (k) => DESC[k] ? UI.info(DESC[k], "O que é " + (TIPOS[k] || k).split(" (")[0] + "?") : "";
  const LIMITE_FTI = 0.10;

  const resumo = (lista) => {
    const t = { produtiva: 0, formacao: 0, administrativa: 0, ociosidade_estrategica: 0, ociosidade_operacional: 0 };
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
            <div class="kpi"><span class="rot">Produção técnica ${iTipo("produtiva")}</span><span class="val">${horas(t.produtiva)}</span><span class="det">Base do cálculo das sobras</span></div>
            <div class="kpi"><span class="rot">Formação integrada ${iTipo("formacao")}</span><span class="val">${horas(t.formacao)}</span><span class="det">${seloFti(t.fti)} · limite 10%</span></div>
            <div class="kpi"><span class="rot">Pendência externa ${iTipo("ociosidade_estrategica")}</span><span class="val">${horas(t.ociosidade_estrategica)}</span><span class="det">Não afeta o seu IEO</span></div>
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
              <div class="field"><label for="h-tipo">Tipo de hora ${UI.info(Object.keys(TIPOS).map((k) => TIPOS[k].split(" (")[0] + ": " + DESC[k]).join("\n\n"), "O que significa cada tipo de hora?")}</label>
                <select class="input" id="h-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
              <div class="field"><label for="h-data">Data</label><input class="input" id="h-data" type="date" value="${hoje()}" max="${hoje()}"></div>
              <div class="field"><label for="h-horas">Horas</label><input class="input" id="h-horas" type="number" min="0.25" max="12" step="0.25" inputmode="decimal" placeholder="Ex.: 6"></div>
              <div class="field full"><label for="h-desc">O que foi feito</label><input class="input" id="h-desc" maxlength="300" placeholder="Ex.: Compatibilização arquitetura x estrutura do bloco A"></div>
              <p class="hint full" id="h-tipo-desc">${esc(DESC[Object.keys(TIPOS)[0]] || "")}</p>
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
              ${Object.entries(TIPOS).map(([k, v]) => `<div class="kpi"><span class="rot">${esc(v.split(" (")[0])} ${iTipo(k)}</span><span class="val">${horas(t[k])}</span></div>`).join("")}
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

        $("#h-tipo").addEventListener("change", (e) => { $("#h-tipo-desc").textContent = DESC[e.target.value] || ""; });
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
      async render(el, ctx) {
        const { moeda } = window.UI;
        const Fin = window.Fin;
        const par = await API.fin.parametros().catch(() => ({ modo: "planilha" }));
        const sistema = par.modo === "sistema";
        let pos, movs;
        if (sistema) {
          const [ext, mv] = await Promise.all([API.fin.extrato(), API.movimentos.meus().catch(() => [])]);
          movs = mv;
          if (!ext || !ext.cooperado) {
            el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Financeiro</p><h1>Minha conta na cooperativa</h1></div></div>
              <p class="vazio">Sua conta do site ainda não está ligada ao seu cadastro financeiro na cooperativa. A tesouraria faz essa ligação em poucos minutos; se demorar, fale com ela.</p>`;
            return;
          }
          const calc = Fin.calcularCooperado(ext.cooperado, ext);
          calc.cooperado_id = ctx.sessao.perfil.id;
          Object.defineProperty(calc, "_ext", { value: ext, enumerable: false });
          pos = [calc];
        } else {
          [pos, movs] = await Promise.all([API.financeiro.minhas(), API.movimentos.meus().catch(() => [])]);
        }
        if (!pos.length) {
          el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Financeiro</p><h1>Minha conta na cooperativa</h1></div></div>
            <p class="vazio">A tesouraria ainda não registrou a sua posição financeira. Quando registrar, aqui aparecem seu capital, contribuições, fundos e eventuais pendências.</p>`;
          return;
        }
        const bruta = pos[0];
        const p = Fin.ajustada(bruta, movs);
        const disp = Fin.componentes(bruta, movs);
        const aguardando = movs.filter((m) => m.status === "aguardando");
        const mesBase = String(bruta.data_base || "").slice(0, 7);
        const somaAguard = aguardando.reduce((t, m) => t + (m.alocacao || []).filter((a) => !(a.destino === "contribuicao" && a.mes && a.mes > mesBase)).reduce((u, a) => u + Number(a.valor), 0), 0);
        const prox = Fin.proxima(bruta, movs);
        const n = (k) => Number(p[k] || 0);
        const aIntegralizar = Math.max(0, n("capital_subscrito") - n("capital_integralizado"));
        const pct = n("capital_subscrito") ? Math.min(100, (n("capital_integralizado") / n("capital_subscrito")) * 100) : 0;
        const contribuido = p.contribuicoes_pagas != null ? n("contribuicoes_pagas") : n("capital_integralizado");
        const emDebito = n("valor_em_aberto") > 0;
        const fundosInd = n("fic_saldo") + n("fundo_13") + n("fundo_ferias") + n("sobras_a_receber");
        const aportes = n("outros_creditos");
        const det = p.detalhes || {};
        const res = det.resumo || {};
        const comRet = (det.mensal || []).some((m) => Number(m.retirada) > 0);
        const restituivel = Math.max(0, n("capital_integralizado") + fundosInd + aportes - n("valor_em_aberto"));
        const linhaFundo = (rot, k, art) => `<tr><td>${rot}<span class="sub">${art}</span></td><td class="num">${moeda(n(k))}</td></tr>`;
        const ext = sistema ? bruta._ext : null;
        const cr = sistema ? (p.credito || bruta.credito) : null;
        const parR = Fin.params(par);
        parR.retirada_minima = Fin.retiradaMinima(par).valor;
        const hojeIso = hoje();
        const prazoNovo = Fin.prazoRetirada(hojeIso, par);
        const cxl = sistema ? Fin.caixaLivre(ext && ext.caixa) : null;
        const maxPed = cr ? Math.min(cr.saldo, cxl ? cxl.maxRetirada : 0) : 0;
        const podePedir = cr && maxPed > 0.005 && maxPed + 0.005 >= parR.retirada_minima;
        const motivoNao = !cr ? "" : cr.saldo + 0.005 < Math.max(parR.retirada_minima, 0.01) ? (cr.saldo > 0.005 ? `Seu saldo ainda não chegou ao mínimo de ${moeda(parR.retirada_minima)} para pedir retirada.` : "Sem crédito disponível no momento.")
          : !cxl || !cxl.informado ? "Retiradas ainda não liberadas: a tesouraria não informou o saldo da conta da cooperativa."
          : "No momento o caixa da cooperativa não comporta novas retiradas. Seu crédito continua guardado; assim que entrar recurso de contrato, o pedido é liberado.";
        const STR = { solicitada: '<span class="selo warn">aguardando transferência</span>', paga: '<span class="selo ok">paga</span>', cancelada: '<span class="selo">cancelada</span>' };
        const INFO = {
          credito: "Cada hora de produção técnica, de formação (até 10% das horas do mês) e de suporte administrativo lançada em Minhas horas vale o valor-hora da sua categoria naquele mês (Estatuto, art. 8º; Regimento, art. 87). O total fica guardado como crédito até você pedir a retirada. Ociosidade não gera crédito.",
          bruto: "O valor do crédito que você pediu para retirar. É sobre ele que saem os descontos abaixo.",
          ir: "Imposto de renda retido na fonte pela cooperativa (Lei 8.541/1992, art. 45, §1º), pela tabela mensal da Receita, com a redução da Lei 15.270/2025 (isento até R$ 5.000 por mês). O site usa o que for melhor para você: INSS + dependentes ou o desconto simplificado. Você continua declarando no ajuste anual, e o valor retido aparece no informe de rendimentos.",
          inss: "Contribuição previdenciária individual de 11% sobre a retirada, até o teto do INSS. A cooperativa retém e recolhe para você (Estatuto, art. 24; Regimento, art. 94). Conta para a sua aposentadoria.",
          contrib: "1,5% da retirada vai para o seu capital social (quotas-parte). Continua sendo seu e volta no desligamento. Nos meses sem retirada, a contribuição é de 1 quota-parte, paga por Pix (Estatuto, art. 23, §4º).",
          ficvol: "Aporte voluntário que você escolheu para o seu Fundo Individual de Capitalização, até 2,5% da retirada. É seu e é resgatado no desligamento (Regimento, art. 123).",
          liquido: "O que cai na sua conta bancária.",
          ficcoop: "Além disso, a cooperativa deposita no seu FIC 5,5% da retirada do mês anterior. Não sai do seu bruto (Regimento, art. 123).",
          provisoes: "A cooperativa guarda 1/12 de cada retirada para o seu 13º (pago até 20 de dezembro) e 1/12 para as suas férias (pagas no recesso). Não sai do seu bruto (Regimento, art. 124).",
          auxilios: "Auxílio-teletrabalho (9,25% do salário-mínimo por mês) e auxílio-alimentação (2,78% do salário-mínimo por dia trabalhado). São indenizatórios, não saem do seu crédito e não fazem parte da retirada (Regimento, art. 125).",
          patronal: "A cooperativa ainda paga 20% de INSS patronal sobre a sua retirada. Esse custo é da cooperativa, não sai do seu bruto (Regimento, art. 94)."
        };
        const i = (k) => window.UI.info(INFO[k]);
        const blocoCredito = !cr ? "" : `
          <section class="painel">
            <h2>Crédito de trabalho e retiradas</h2>
            <div class="kpis">
              <div class="kpi"><span class="rot">Crédito gerado ${i("credito")}</span><span class="val">${moeda(cr.gerado)}</span><span class="det">Horas lançadas × valor-hora</span></div>
              <div class="kpi"><span class="rot">Já retirado</span><span class="val">${moeda(cr.retirado)}</span><span class="det">Retiradas pagas pela tesouraria</span></div>
              <div class="kpi"><span class="rot">Em solicitação</span><span class="val">${moeda(cr.solicitado)}</span><span class="det">Aguardando transferência</span></div>
              <div class="kpi"><span class="rot">Disponível para retirada</span><span class="val" style="color:var(--ok)">${moeda(cr.saldo)}</span><span class="det">${parR.retirada_minima > 0 ? "Mínimo para pedir: " + moeda(parR.retirada_minima) + " " + window.UI.info("Equivale a 1 quota-parte (" + moeda(parR.quota) + ") ÷ 1,5%. É uma regra da cooperativa: assim a contribuição de capital de 1,5% descontada de cada retirada nunca fica menor que a quota mensal do art. 23, §4º do Estatuto. Abaixo disso, o crédito fica acumulando.") : "Você pede quando quiser"}</span></div>
            </div>
            ${!bruta.enquadramento || !bruta.enquadramento.categoria ? '<div class="notice warn">Você ainda não tem categoria validada, então o valor-hora está zerado. Suas horas ficam guardadas: quando a formação e as experiências forem validadas em <b>Minha experiência</b>, o crédito delas aparece aqui.</div>' : ""}
            <div class="sol-acoes">${podePedir ? `<button class="btn btn-primary" id="bt-ret">Solicitar retirada</button>${maxPed + 0.005 < cr.saldo ? `<span class="hint">Pelo caixa atual, você pode pedir até ${moeda(maxPed)}.</span>` : ""}` : `<span class="hint">${motivoNao}</span>`}</div>
            <p class="hint">Ao pedir, a tesouraria tem até o ${parR.retirada_dia_util}º dia útil do mês seguinte para fazer a transferência. Quando ela marcar como paga, o valor vira retirada e os descontos são registrados.</p>
            ${cr.retiradas.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Pedido em</th><th class="num">Bruto</th><th class="num">Líquido</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
              <tbody>${cr.retiradas.slice().reverse().map((r) => { const d = r.status === "paga" ? r : Fin.descontosRetirada(ext.cooperado, ext, Number(r.valor), Fin.mesDe(r.prazo || hojeIso)); return `<tr>
                <td>${dataHora(r.solicitado_em)}</td><td class="num">${moeda(r.valor)}</td>
                <td class="num">${moeda(d.liquido)}${r.status === "paga" ? `<span class="sub">INSS ${moeda(r.inss)}${Number(r.ir) ? " · IR " + moeda(r.ir) : ""} · capital ${moeda(r.contribuicao)}${Number(r.fic_vol) ? " · FIC " + moeda(r.fic_vol) : ""}</span>` : r.status === "solicitada" ? '<span class="sub">estimado</span>' : ""}</td>
                <td>${r.status === "paga" ? "paga em " + data(r.pago_em) : data(r.prazo)}</td>
                <td>${STR[r.status] || esc(r.status)}${r.motivo ? `<span class="sub">${esc(r.motivo)}</span>` : ""}</td>
                <td class="acoes-celula">${r.status === "solicitada" ? `<button class="btn btn-ghost btn-sm" data-cancret="${r.id}">Cancelar</button>` : ""}</td></tr>`; }).join("")}</tbody>
            </table></div>` : ""}
            <details class="explica"><summary>O que é cada valor da retirada</summary>
              <ul class="hint" style="margin:.5rem 0 0;padding-left:1.1rem;display:grid;gap:.35rem">
                <li><b>INSS (11%)</b> ${i("inss")} — retido e recolhido pela cooperativa.</li>
                <li><b>Imposto de renda</b> ${i("ir")} — retido na fonte; isento até R$ 5.000 no mês.</li>
                <li><b>Contribuição de capital (1,5%)</b> ${i("contrib")} — vai para as suas quotas.</li>
                <li><b>FIC voluntário</b> ${i("ficvol")} — só se você escolheu aportar.</li>
                <li><b>FIC da cooperativa (5,5%)</b> ${i("ficcoop")} — pago pela cooperativa.</li>
                <li><b>13º e férias</b> ${i("provisoes")} — provisão de 1/12 cada.</li>
                <li><b>Auxílios</b> ${i("auxilios")} — indenizatórios, à parte.</li>
                <li><b>INSS patronal (20%)</b> ${i("patronal")} — custo da cooperativa.</li>
              </ul>
            </details>
          </section>`;

        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Financeiro · posição em ${data(p.data_base)}</p><h1>Minha conta na cooperativa</h1></div>
            ${emDebito ? `<span class="selo err">Em débito: ${moeda(n("valor_em_aberto"))}</span>` : '<span class="selo ok">Em dia com a cooperativa</span>'}</div>

          <div class="kpis">
            <div class="kpi"><span class="rot">Contribuição mensal</span><span class="val">${moeda(n("contribuicao_mensal"))}</span><span class="det">Valor que você deve contribuir por mês</span></div>
            <div class="kpi"><span class="rot">Em aberto</span><span class="val" style="color:${emDebito ? "var(--err)" : "var(--ok)"}">${moeda(n("valor_em_aberto"))}</span><span class="det">${emDebito ? (p.meses_em_atraso ? p.meses_em_atraso + " mês(es) em atraso" : "Regularize com a tesouraria") : "Nenhuma pendência"}${somaAguard ? ` · ${moeda(somaAguard)} em Pix aguardando confirmação` : ""}</span></div>
            <div class="kpi"><span class="rot">Total contribuído</span><span class="val">${moeda(contribuido)}</span><span class="det">Acumulado registrado pela tesouraria</span></div>
            <div class="kpi"><span class="rot">Aportes à cooperativa</span><span class="val">${moeda(aportes)}</span><span class="det">Devolvidos só no desligamento</span></div>
          </div>

          ${blocoCredito}

          <section class="painel acerto">
            <h2>Pagar à cooperativa por Pix</h2>
            <p class="muted">O Pix vai direto para a conta da BIMCORE (chave CNPJ ${Fin.PIX.chaveFormatada}). Depois de pagar, avise no site; a tesouraria confere e confirma.</p>
            <div class="pagar-grade">
              <div class="pagar-item">
                <span class="rot">Atrasados</span>
                <b class="${disp.total > 0.005 ? "err" : "ok"}">${disp.total > 0.005 ? moeda(disp.total) : "Nada em atraso"}</b>
                <span class="det">${disp.total > 0.005 ? "Você escolhe quanto pagar agora." : somaAguard ? "Há Pix aguardando confirmação." : "Tudo em dia até o último fechamento."}</span>
                ${disp.total > 0.005 ? '<button class="btn btn-primary" id="bt-pix">Pagar atrasados</button>' : ""}
              </div>
              ${prox ? `<div class="pagar-item">
                <span class="rot">Próxima contribuição · ${Fin.nomeMes(prox.mes)}</span>
                <b>${moeda(prox.valor)}</b>
                <span class="det">${prox.resta > 0.005 ? (prox.pago || prox.aguardando ? `Já pago ${moeda(prox.pago)}${prox.aguardando ? ` · aguardando ${moeda(prox.aguardando)}` : ""}. Falta ${moeda(prox.resta)}.` : "Valor definido pela tesouraria na última atualização.") : prox.aguardando ? "Pix aguardando confirmação da tesouraria." : "Já paga. Obrigado!"}</span>
                ${prox.resta > 0.005 ? '<button class="btn btn-primary" id="bt-prox">Pagar a próxima contribuição</button>' : ""}
              </div>` : ""}
            </div>
            ${disp.maxAbater > 0.005 ? `<div class="pagar-abater"><p class="hint">Você tem aportes à cooperativa e ainda falta integralizar parte das quotas iniciais. Pode usar os aportes para isso, sem Pix.</p>
              <button class="btn btn-ghost" id="bt-abater">Usar meus aportes na integralização (até ${moeda(disp.maxAbater)})</button></div>` : ""}
          </section>

          ${movs.length ? `<section class="painel">
            <h2>Pagamentos e abatimentos pelo site</h2>
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Data</th><th>O quê</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
              <tbody>${movs.map((m) => `<tr>
                <td>${dataHora(m.criado_em)}</td>
                <td>${m.tipo === "pix" ? "Pix" : "Abatimento com aportes"}<span class="sub">${(m.alocacao || []).map((a) => esc(Fin.descreverItem(a)) + " " + moeda(a.valor)).join("<br>")}</span></td>
                <td class="num">${moeda(m.valor)}</td>
                <td>${m.status === "aguardando" ? '<span class="selo warn">aguardando a tesouraria</span>' : m.status === "confirmado" ? '<span class="selo ok">confirmado</span>' : m.status === "recusado" ? `<span class="selo err">recusado</span>${m.motivo ? `<span class="sub">${esc(m.motivo)}</span>` : ""}` : '<span class="selo">cancelado</span>'}</td>
                <td class="acoes-celula">${m.status === "aguardando" ? `<button class="btn btn-ghost btn-sm" data-cancelar="${m.id}">Cancelar</button>` : ""}</td></tr>`).join("")}</tbody>
            </table></div>
            <p class="hint">Pix aparecem como "aguardando" até a tesouraria conferir o extrato. Depois de confirmados, já descontam do seu valor em aberto aqui e entram sozinhos na planilha da tesouraria.</p>
          </section>` : ""}

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
            </tbody><tfoot><tr><td>Total</td><td class="num">${moeda(fundosInd)}</td></tr></tfoot></table></div>
          </section>

          <section class="painel">
            <h2>Aportes à cooperativa</h2>
            <p class="muted">Valores que você pagou além das obrigações do Estatuto para a cooperativa andar. São um crédito seu com a cooperativa: <b>não podem ser sacados a qualquer momento</b> e só são devolvidos no desligamento, após a aprovação do balanço (art. 19).</p>
            ${(det.aportes || []).filter((a) => a.tipo !== "Pagamento da sua parte").length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Data</th><th>Para quê</th><th class="num">Valor</th></tr></thead>
              <tbody>${det.aportes.filter((a) => a.tipo !== "Pagamento da sua parte").map((a) => `<tr><td>${a.data ? data(a.data) : "—"}</td><td>${esc(a.descricao)}</td><td class="num">${moeda(a.valor)}</td></tr>`).join("")}</tbody>
              <tfoot>${res.aportes_no_capital ? `<tr><td></td><td>Usado para integralizar suas quotas</td><td class="num">− ${moeda(res.aportes_no_capital)}</td></tr>` : ""}${(p._ajustes || []).filter((m) => m.tipo === "compensacao").map((m) => `<tr><td></td><td>Usado para integralizar suas quotas (pelo site, ${data(m.criado_em)})</td><td class="num">− ${moeda(m.valor)}</td></tr>`).join("")}<tr><td></td><td>Saldo de aportes</td><td class="num">${moeda(aportes)}</td></tr></tfoot>
            </table></div>` : `<p class="vazio">${aportes ? "Saldo de aportes: " + moeda(aportes) : "Nenhum aporte registrado."}</p>`}
          </section>

          ${(det.mensal || []).length ? `<section class="painel">
            <h2>${comRet ? "Retiradas e contribuição de capital, mês a mês" : "Contribuição mensal de capital, mês a mês"}</h2>
            ${comRet ? '<p class="hint">Retirada = crédito que você pediu e a tesouraria pagou no mês. Do bruto saem o INSS (11%), o IR retido, a contribuição de capital (1,5%) e o FIC voluntário, se houver.</p>' : ""}
            <div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Mês</th><th class="num">Retirada</th>${comRet ? '<th class="num">INSS</th><th class="num">Líquido</th>' : ""}<th class="num">Devida</th><th class="num">Paga</th><th class="num">Em aberto</th></tr></thead>
              <tbody>${det.mensal.map((m) => { const [a, mm] = m.mes.split("-"); return `<tr><td>${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(mm) - 1]}/${a}</td><td class="num">${moeda(m.retirada)}</td>${comRet ? `<td class="num">${moeda(m.inss || 0)}</td><td class="num">${moeda(m.liquido || 0)}</td>` : ""}<td class="num">${moeda(m.devida)}</td><td class="num">${moeda(m.paga)}</td><td class="num">${m.em_aberto > 0.005 ? `<span class="selo err">${moeda(m.em_aberto)}</span>` : '<span class="selo ok">ok</span>'}</td></tr>`; }).join("")}</tbody>
            </table></div>
          </section>` : ""}

          <section class="painel">
            <h2>Se você sair da cooperativa</h2>
            <div class="kpis"><div class="kpi"><span class="rot">Valor restituível estimado</span><span class="val">${moeda(restituivel)}</span><span class="det">Capital integralizado + fundos + aportes − valor em aberto</span></div></div>
            <ul class="hint" style="margin:0;padding-left:1.1rem;display:grid;gap:.3rem">
              <li>O capital integralizado é devolvido corrigido, junto com sobras e créditos registrados, depois que a Assembleia Geral aprovar o balanço do ano do desligamento. O Conselho de Administração pode parcelar em até 10 vezes (art. 19).</li>
              <li>O saldo do FIC é resgatado no desligamento, também após a aprovação do balanço (art. 78, §5º).</li>
              <li>Os aportes que você fez à cooperativa também só são devolvidos nesse momento.</li>
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

        const recarregar = () => paginas.conta.render(el, ctx);
        const lerValor = (t) => { t = String(t || "").replace(/[R$\s]/g, ""); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); return Fin.centavos(Number(t)); };
        const brl = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const abrirPix = ({ titulo, texto, valorInicial, max, fixo, alocar }) => {
          const m = window.UI.modal(`
            <h2>${esc(titulo)}</h2>
            <p class="muted">${texto}</p>
            <div class="field"><label for="px-valor">Valor do Pix (R$)</label><input class="input" id="px-valor" inputmode="decimal" autocomplete="off" value="${brl(valorInicial)}" ${fixo ? "readonly" : ""}></div>
            <div id="px-aloc" class="pix-aloc"></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="px-gerar">Gerar QR code</button></div>`);
          const mostrar = () => {
            const v = lerValor($("#px-valor", m.el).value);
            const box = $("#px-aloc", m.el);
            if (!(v > 0)) { box.innerHTML = '<p class="hint">Digite um valor.</p>'; return null; }
            if (v > max + 0.005) { box.innerHTML = `<p class="hint" style="color:var(--err)">O valor passa do máximo (${moeda(max)}).</p>`; return null; }
            const itens = alocar(v);
            box.innerHTML = `<p class="hint">Este Pix quita:</p><ul>${itens.map((a) => `<li><span>${esc(Fin.descreverItem(a))}</span><b>${moeda(a.valor)}</b></li>`).join("")}</ul>`;
            return { v, itens };
          };
          $("#px-valor", m.el).addEventListener("input", mostrar); mostrar();
          $("#px-gerar", m.el).onclick = async (ev) => {
            const r = mostrar(); if (!r) return;
            const codigo = Fin.novoCodigo();
            const copia = Fin.pixCopiaECola(r.v, "BIMC" + codigo);
            const svg = await acao(ev.currentTarget, () => Fin.qrSvg(copia)); if (!svg) return;
            m.el.innerHTML = `
              <h2>Pix de ${moeda(r.v)}</h2>
              <div class="pix-qr">${svg}</div>
              <div class="field"><label for="px-copia">Pix copia e cola</label><textarea class="input pix-codigo" id="px-copia" readonly rows="3">${esc(copia)}</textarea></div>
              <button class="btn btn-ghost btn-sm" id="px-copiar" type="button">Copiar código</button>
              <dl class="sol-dados pix-dados">
                <div><dt>Favorecido</dt><dd>BIMCORE Cooperativa de Trabalho</dd></div>
                <div><dt>Chave Pix (CNPJ)</dt><dd>${Fin.PIX.chaveFormatada}</dd></div>
                <div><dt>Identificador</dt><dd>BIMC${codigo}</dd></div>
              </dl>
              <p class="hint">Abra o app do seu banco, escolha pagar com Pix (QR code ou copia e cola) e confira se o favorecido é a BIMCORE. Depois volte aqui e clique em <b>Já fiz o Pix</b>.</p>
              <div class="field"><label for="px-comp">Comprovante (opcional)</label><input class="input" id="px-comp" type="file" accept="image/*,.pdf"></div>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar sem avisar</button><button class="btn btn-primary btn-sm" id="px-feito">Já fiz o Pix</button></div>`;
            $("#px-copiar", m.el).onclick = async () => {
              try { await navigator.clipboard.writeText(copia); toast("Código copiado. Cole no app do seu banco."); }
              catch (e) { const t = $("#px-copia", m.el); t.focus(); t.select(); toast("Selecione e copie o código."); }
            };
            $("#px-feito", m.el).onclick = async (e2) => {
              const comp = $("#px-comp", m.el).files[0] || null;
              const ok = await acao(e2.currentTarget, () => API.movimentos.pagarPix({ codigo, valor: r.v, alocacao: r.itens, comprovante: comp }), "Pronto! A tesouraria vai conferir e confirmar o seu Pix.");
              if (ok) { m.fechar(); recarregar(); }
            };
          };
        };

        const btPix = $("#bt-pix");
        if (btPix) btPix.onclick = () => abrirPix({
          titulo: "Pagar atrasados", texto: `Em atraso: <b>${moeda(disp.total)}</b>. Você pode pagar tudo ou só uma parte; o valor quita primeiro o que é mais antigo.`,
          valorInicial: disp.total, max: disp.total, alocar: (v) => Fin.alocar(v, disp).itens
        });
        const btProx = $("#bt-prox");
        if (btProx) btProx.onclick = () => abrirPix({
          titulo: `Contribuição de ${Fin.nomeMes(prox.mes)}`, texto: `Contribuição mensal de capital de ${Fin.nomeMes(prox.mes)}, no valor definido pela tesouraria. Pagar antes não abate atrasados: este valor fica para ${Fin.nomeMes(prox.mes)}.`,
          valorInicial: prox.resta, max: prox.resta, fixo: true, alocar: (v) => [{ destino: "contribuicao", mes: prox.mes, valor: v }]
        });

        const btAb = $("#bt-abater");
        if (btAb) btAb.onclick = () => {
          const m = window.UI.modal(`
            <h2>Usar aportes na integralização</h2>
            <p class="muted">Seus aportes só podem ser usados para integralizar as <b>quotas iniciais</b>. O valor sai do seu saldo de aportes e entra no seu capital integralizado na hora. Isso não pode ser desfeito pelo site.</p>
            <dl class="sol-dados">
              <div><dt>Saldo de aportes</dt><dd>${moeda(disp.aportes)}</dd></div>
              <div><dt>Falta integralizar das quotas iniciais</dt><dd>${moeda(disp.inicial)}</dd></div>
            </dl>
            <div class="field"><label for="ab-valor">Valor a usar (R$)</label><input class="input" id="ab-valor" inputmode="decimal" autocomplete="off" value="${brl(disp.maxAbater)}"><span class="hint">Máximo: ${moeda(disp.maxAbater)}</span></div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="ab-ok">Confirmar abatimento</button></div>`);
          $("#ab-ok", m.el).onclick = async (ev) => {
            const v = lerValor($("#ab-valor", m.el).value);
            if (!(v > 0)) return toast("Informe o valor.", "err");
            if (v > disp.maxAbater + 0.005) return toast(`O máximo é ${moeda(disp.maxAbater)}.`, "err");
            const ok = await acao(ev.currentTarget, () => API.movimentos.abater(v), "Abatimento feito. Seu capital integralizado já foi atualizado.");
            if (ok) { m.fechar(); recarregar(); }
          };
        };

        const btRet = $("#bt-ret");
        if (btRet) btRet.onclick = () => {
          const m = window.UI.modal(`
            <h2>Solicitar retirada</h2>
            <p class="muted">Disponível: <b>${moeda(maxPed)}</b>${maxPed + 0.005 < cr.saldo ? ` (seu crédito é ${moeda(cr.saldo)}, mas o caixa atual comporta até ${moeda(maxPed)})` : ""}. A tesouraria transfere até <b>${data(prazoNovo)}</b> (${parR.retirada_dia_util}º dia útil do mês seguinte).</p>
            <div class="field"><label for="rt-valor">Valor bruto a retirar (R$)</label><input class="input" id="rt-valor" inputmode="decimal" autocomplete="off" value="${brl(maxPed)}"></div>
            <div id="rt-conta" class="pix-aloc"></div>
            <p class="hint">Estimativa. Os valores definitivos são registrados pela tesouraria quando ela fizer a transferência.</p>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="rt-ok">Solicitar</button></div>`);
          const conta = () => {
            const v = lerValor($("#rt-valor", m.el).value), box = $("#rt-conta", m.el);
            if (!(v > 0)) { box.innerHTML = '<p class="hint">Digite um valor.</p>'; return null; }
            if (v > maxPed + 0.005) { box.innerHTML = `<p class="hint" style="color:var(--err)">Passa do máximo disponível (${moeda(maxPed)}).</p>`; return null; }
            if (v + 0.005 < parR.retirada_minima) { box.innerHTML = `<p class="hint" style="color:var(--err)">O mínimo é ${moeda(parR.retirada_minima)}.</p>`; return null; }
            const d = Fin.descontosRetirada(ext.cooperado, ext, v, Fin.mesDe(prazoNovo));
            box.innerHTML = `<ul>
              <li><span>Bruto ${i("bruto")}</span><b>${moeda(d.valor)}</b></li>
              <li><span>− INSS 11% ${i("inss")}</span><b>${moeda(d.inss)}</b></li>
              <li><span>− Imposto de renda ${i("ir")}</span><b>${moeda(d.ir)}</b></li>
              <li><span>− Contribuição de capital 1,5% ${i("contrib")}</span><b>${moeda(d.contribuicao)}</b></li>
              ${d.fic_vol ? `<li><span>− FIC voluntário ${i("ficvol")}</span><b>${moeda(d.fic_vol)}</b></li>` : ""}
              <li><span><b>Líquido na sua conta</b> ${i("liquido")}</span><b>${moeda(d.liquido)}</b></li></ul>`;
            return v;
          };
          $("#rt-valor", m.el).addEventListener("input", conta); conta();
          $("#rt-ok", m.el).onclick = async (ev) => {
            const v = conta(); if (!v) return;
            const ok = await acao(ev.currentTarget, () => API.fin.solicitarRetirada({ valor: v, prazo: prazoNovo }), "Retirada solicitada. A tesouraria foi avisada pelo site.");
            if (ok) { m.fechar(); recarregar(); }
          };
        };

        el.onclick = async (e) => {
          const cr2 = e.target.closest("[data-cancret]");
          if (cr2) {
            if (!(await confirmar("Cancelar esta solicitação de retirada? O valor volta para o seu saldo.", "Cancelar solicitação"))) return;
            const ok = await acao(cr2, () => API.fin.cancelarRetirada(cr2.dataset.cancret), "Solicitação cancelada.");
            if (ok) recarregar(); return;
          }
          const b = e.target.closest("[data-cancelar]"); if (!b) return;
          if (!(await confirmar("Cancelar o aviso deste Pix? Faça isso só se você não chegou a pagar.", "Cancelar aviso"))) return;
          const ok = await acao(b, () => API.movimentos.cancelarPix(b.dataset.cancelar), "Aviso de Pix cancelado.");
          if (ok) recarregar();
        };
      }
    },

    demonstrativos: {
      titulo: "Demonstrativos",
      async render(el) {
        const { moeda } = window.UI;
        const Fin = window.Fin, D = window.Demonstrativo;
        const cab = `<div class="pag-cab"><div><p class="eyebrow">Financeiro</p><h1>Demonstrativos e fundos</h1></div></div>`;
        const par = await API.fin.parametros().catch(() => ({ modo: "planilha" }));
        if (par.modo !== "sistema") { el.innerHTML = cab + '<p class="vazio">Os demonstrativos aparecem quando o financeiro estiver funcionando pelo site.</p>'; return; }
        const ext = await API.fin.extrato();
        if (!ext || !ext.cooperado) { el.innerHTML = cab + '<p class="vazio">Sua conta do site ainda não está ligada ao seu cadastro financeiro. A tesouraria faz essa ligação.</p>'; return; }
        const c = ext.cooperado, calc = Fin.calcularCooperado(c, ext);
        const meses = D.mesesComRetirada(c, ext);
        let sel = meses[0] || null;
        const fu = D.fundos(c, ext, calc);
        el.innerHTML = cab + `
          <section class="painel">
            <div class="painel-cab"><h2>Demonstrativo de retirada</h2>
              ${meses.length ? `<div class="sol-acoes"><div class="field"><label for="dm-mes">Competência</label><select class="input" id="dm-mes">${meses.map((m) => `<option value="${m}">${Fin.nomeMes(m)}</option>`).join("")}</select></div>
              <button class="btn btn-ghost btn-sm" id="dm-imp" type="button">Imprimir ou salvar em PDF</button></div>` : ""}</div>
            <div id="dm-corpo">${meses.length ? "" : '<p class="vazio">Você ainda não teve retirada paga. Quando a tesouraria registrar o pagamento, o demonstrativo do mês aparece aqui, com bruto, descontos, líquido e bases de cálculo.</p>'}</div>
          </section>
          <section class="painel">
            <h2>Seus fundos individuais, mês a mês</h2>
            <div class="kpis">
              <div class="kpi"><span class="rot">Capital integralizado</span><span class="val">${moeda(fu.atual.capital)}</span><span class="det">Volta no desligamento (art. 19)</span></div>
              <div class="kpi"><span class="rot">FIC</span><span class="val">${moeda(fu.atual.fic)}</span><span class="det">${fu.ajustes_fic ? "Inclui rendimentos e resgates de " + moeda(fu.ajustes_fic) : "5,5% da cooperativa + seu voluntário"}</span></div>
              <div class="kpi"><span class="rot">Fundo de 13º</span><span class="val">${moeda(fu.atual.f13)}</span><span class="det">Pago até 20 de dezembro</span></div>
              <div class="kpi"><span class="rot">Fundo de férias</span><span class="val">${moeda(fu.atual.ferias)}</span><span class="det">Pago no recesso</span></div>
            </div>
            ${fu.linhas.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Mês</th><th class="num">Retirada</th><th class="num">FIC no mês</th><th class="num">FIC acumulado</th><th class="num">13º no mês</th><th class="num">13º acumulado</th><th class="num">Férias no mês</th><th class="num">Férias acumulado</th><th class="num">Capital no mês</th><th class="num">Contribuições acumuladas</th></tr></thead>
              <tbody>${fu.linhas.slice().reverse().map((l) => `<tr><td>${Fin.nomeMes(l.mes)}</td><td class="num">${moeda(l.retirada)}</td><td class="num">${moeda(l.fic_mes)}</td><td class="num">${moeda(l.fic)}</td><td class="num">${moeda(l.f13_mes)}</td><td class="num">${moeda(l.f13)}</td><td class="num">${moeda(l.fer_mes)}</td><td class="num">${moeda(l.fer)}</td><td class="num">${moeda(l.cap_mes)}</td><td class="num">${moeda(l.cap)}</td></tr>`).join("")}</tbody>
            </table></div>
            <p class="hint">O FIC recebe 5,5% da retirada do mês anterior (pago pela cooperativa) e o seu aporte voluntário. Os fundos de 13º e de férias guardam 1/12 de cada retirada e descontam quando são pagos. "Capital no mês" são as contribuições mensais (1,5% da retirada ou 1 quota); o capital integralizado acima inclui também a integralização inicial.</p>` : '<p class="vazio">Ainda não há movimento nos seus fundos.</p>'}
          </section>`;
        const mostrar = () => { if (!sel) return; $("#dm-corpo").innerHTML = D.html(D.dados(c, ext, sel, calc)); };
        mostrar();
        if (meses.length) {
          $("#dm-mes").addEventListener("change", (e) => { sel = e.target.value; mostrar(); });
          $("#dm-imp").onclick = () => D.imprimir(D.dados(c, ext, sel, calc));
        }
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

    experiencia: {
      titulo: "Minha experiência",
      async sinal() { const d = await API.exp.meu(); return d.cooperado ? window.Fin.sinalExperiencia(d) : null; },
      async render(el, ctx) {
        const Fin = window.Fin, { moeda } = window.UI;
        const d = await API.exp.meu();
        if (!d.cooperado) {
          el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Enquadramento</p><h1>Minha experiência</h1></div></div>
            <p class="vazio">Sua conta ainda não está ligada ao seu cadastro na cooperativa. A tesouraria faz essa ligação; depois disso você poderá enviar seus documentos aqui.</p>`;
          return;
        }
        const c = d.cooperado, recarregar = () => { ctx.atualizarContadores(); return paginas.experiencia.render(el, ctx); };
        const sinal = Fin.sinalExperiencia(d);
        const base = { parametros: d.parametros, habilitacoes: d.habilitacoes, experiencias: d.experiencias, internas: d.internas || [] };
        const enq = Fin.enquadramento(c, base, mesAtual());
        const comps = (id) => d.comprovantes.filter((x) => x.ref_id === id);
        const habPor = {}; d.habilitacoes.forEach((h) => { habPor[h.id] = h; });
        const selo = (x) => x.status === "aprovada" ? '<span class="selo ok">validado</span>' : x.status === "recusada" ? `<span class="selo warn">em exigência</span>${x.motivo ? `<span class="sub">O que falta: ${esc(x.motivo)}</span>` : ""}` : '<span class="selo warn">em análise</span>';
        const duracao = (ini, fim) => { const a = new Date(ini + "T12:00:00"), b = fim ? new Date(fim + "T12:00:00") : new Date(); const m = Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1); return (m >= 12 ? Math.floor(m / 12) + " ano(s)" + (m % 12 ? " e " : "") : "") + (m % 12 ? (m % 12) + " mês(es)" : ""); };
        const anosTxt = (e) => { if (e.anos_exatos == null) return "—"; const m = Math.floor(e.anos_exatos * 12 + 1e-9); return Math.floor(m / 12) + " ano(s)" + (m % 12 ? " e " + (m % 12) + " mês(es)" : ""); };
        const docs = (id, tipo, podeMexer) => `<div class="docs-mini">${comps(id).map((x) => `<button class="link-botao" data-doc="${x.id}">${esc(x.nome_arquivo)}</button>${podeMexer ? ` <button class="link-botao perigo" data-rmdoc="${x.id}" aria-label="Remover ${esc(x.nome_arquivo)}">remover</button>` : ""}`).join("<br>") || '<span class="sub">nenhum documento</span>'}</div>`;
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Enquadramento · art. 8º do Estatuto</p><h1>Minha experiência</h1></div></div>
          ${sinal ? `<div class="notice ${sinal.cor}"><b>${sinal.cor === "err" ? "Pendente:" : "Em exigência:"}</b> ${sinal.cor === "err" ? "você ainda não enviou " + (d.habilitacoes.length ? "suas experiências" : "sua formação e suas experiências") + ". Sem isso a sua categoria não pode ser definida e o valor-hora fica zerado e suas horas ainda não geram crédito." : sinal.exigencias.map((x) => `<br>• <b>${esc(x.titulo || x.descricao)}</b>: ${esc(x.motivo || "veja o motivo e envie o documento que falta")}`).join("") + "<br>Corrija ou anexe o documento pedido no próprio registro (Anexar ou Editar); ele volta para análise."}</div>` : ""}
          <section class="painel acerto">
            <h2>Seu enquadramento hoje</h2>
            <div class="kpis">
              <div class="kpi"><span class="rot">Categoria</span><span class="val">${esc(enq.categoria || "Pendente")}</span><span class="det">${enq.habilitacao ? esc(enq.habilitacao.titulo) + " · " + esc(enq.conselho || "") : "sem formação validada"}</span></div>
              <div class="kpi"><span class="rot">Experiência comprovada</span><span class="val">${anosTxt(enq)}</span><span class="det">${enq.origem === "manual" ? "categoria informada pela tesouraria" : `${(enq.anos_externos || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ano(s) validados fora + ${(enq.interna ? enq.interna.meses : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mês(es) na BIMCORE`}</span></div>
              <div class="kpi"><span class="rot">Valor-hora</span><span class="val">${moeda(Fin.valorHoraDe(enq.categoria, enq.conselho, d.parametros))}</span><span class="det">Tabela aprovada pela Assembleia</span></div>
              <div class="kpi"><span class="rot">Próxima progressão</span><span class="val">${enq.proxima ? esc(enq.proxima.categoria) : "—"}</span><span class="det">${enq.proxima ? "a partir de " + data(enq.proxima.data) + ", automática" : enq.categoria === "Sênior" ? "Sênior é o teto do Estatuto" : enq.categoria === "Coordenador" ? "função designada pelo Conselho" : "sem experiência em andamento"}</span></div>
            </div>
            ${enq.avisos.length ? `<div class="notice warn">${enq.avisos.map(esc).join("<br>")}</div>` : ""}
            <ul class="hint" style="margin:0;padding-left:1.1rem;display:grid;gap:.3rem">
              <li>Júnior: até 5 anos de experiência comprovada · Pleno: 6 a 10 anos · Sênior: acima de 10 anos (teto).</li>
              <li>Coordenador: acima de 10 anos na formação, só por necessidade da cooperativa e designação formal do Conselho de Administração.</li>
              <li>Conta só a experiência na função ligada à formação que você exerce na cooperativa. ${d.parametros.exp_tecnico_antes === false ? "" : "Em nível técnico, a prática na área antes do diploma também conta. "}${d.parametros.exp_superior_antes ? "" : "Em nível superior, conta a partir do diploma ou registro."}</li>
              <li>Cada registro é validado pela coordenação ou pela tesouraria, com base nos documentos (art. 8º, V). A progressão é automática quando o tempo é atingido.</li>
            </ul>
          </section>

          ${(() => {
            const it = enq.interna || Fin.experienciaInterna(c, null, base, mesAtual(), null);
            const pct = (v) => Math.round(v * 100) + "%";
            return `<section class="painel">
              <div class="painel-cab"><h2>Experiência na BIMCORE</h2><span class="selo info">${it.meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mês(es) de experiência</span></div>
              <p class="hint">Conta sozinha, a partir da sua entrada, pelas horas que você lança em Minhas horas. O mês de referência é o número de dias úteis do mês × ${Number(d.parametros.horas_dia || 6).toLocaleString("pt-BR")} h, já sem fins de semana e feriados nacionais, estaduais e de Araruama. Cada mês vale no máximo 1 mês de experiência, e ${d.parametros.meses_ano || 11} meses completos fecham 1 ano, por causa do recesso de férias. Se no mesmo período houver experiência externa validada, ele conta uma vez só.</p>
              ${it.linhas.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Horas lançadas</th><th class="num">Referência do mês</th><th class="num">Conta como</th></tr></thead>
                <tbody>${it.linhas.slice().reverse().map((l) => `<tr><td>${window.Fin.nomeMes(l.mes)}</td><td class="num">${horas(l.horas)}</td><td class="num">${horas(l.referencia)}<span class="sub">${l.dias_uteis} dias úteis</span></td><td class="num">${pct(l.credito_valido)} de 1 mês${l.coberto_externo > 0 ? '<span class="sub">já coberto por experiência externa</span>' : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Ainda não há horas lançadas desde a sua entrada.</p>'}
            </section>`;
          })()}

          <section class="painel">
            <div class="painel-cab"><h2>Formações</h2><button class="btn btn-primary btn-sm" id="ex-nova-hab">Adicionar formação</button></div>
            <p class="hint">Diploma, certificado de conclusão ou registro no conselho (CREA, CAU, CFT, CRA…).</p>
            ${d.habilitacoes.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Formação</th><th>Conselho</th><th>Diploma / registro</th><th>Documentos</th><th>Situação</th><th></th></tr></thead>
              <tbody>${d.habilitacoes.map((h) => `<tr><td>${esc(h.titulo)}<span class="sub">${esc(Fin.NIVEIS[h.nivel] || h.nivel)}</span></td><td>${esc(h.conselho || "—")}${h.registro ? `<span class="sub">${esc(h.registro)}</span>` : ""}</td>
                <td>${h.data_habilitacao ? data(h.data_habilitacao) : "—"}</td><td>${docs(h.id, "habilitacao", h.status !== "aprovada")}</td><td>${selo(h)}</td>
                <td class="acoes-celula">${h.status !== "aprovada" ? `<button class="btn btn-ghost btn-sm" data-anexar="habilitacao:${h.id}">Anexar</button> <button class="btn btn-ghost btn-sm" data-ed-hab="${h.id}">Editar</button> <button class="btn btn-danger btn-sm" data-rm-hab="${h.id}">Excluir</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="vazio">Nenhuma formação enviada.</p>'}
          </section>

          <section class="painel">
            <div class="painel-cab"><h2>Experiências</h2><button class="btn btn-primary btn-sm" id="ex-nova-exp" ${d.habilitacoes.length ? "" : "disabled"}>Adicionar experiência</button></div>
            <p class="hint">Cada período em que você trabalhou na área: cargo, empresa e atividades. Comprovantes aceitos: carteira de trabalho, contratos, ARTs/RRTs, declarações de empregadores, notas fiscais de serviço, currículo com referências. Períodos fora da área não contam.</p>
            ${d.experiencias.length ? `<div class="tabela-wrap"><table class="tabela">
              <thead><tr><th>Experiência</th><th>Formação ligada</th><th>Período</th><th>Documentos</th><th>Situação</th><th></th></tr></thead>
              <tbody>${d.experiencias.map((x) => `<tr><td>${esc(x.descricao)}</td><td>${esc((habPor[x.habilitacao_id] || {}).titulo || "—")}</td>
                <td>${data(x.inicio)} a ${x.fim ? data(x.fim) : "hoje"}<span class="sub">${duracao(x.inicio, x.fim)}</span></td><td>${docs(x.id, "experiencia", x.status !== "aprovada")}</td><td>${selo(x)}</td>
                <td class="acoes-celula">${x.status !== "aprovada" ? `<button class="btn btn-ghost btn-sm" data-anexar="experiencia:${x.id}">Anexar</button> <button class="btn btn-ghost btn-sm" data-ed-exp="${x.id}">Editar</button> <button class="btn btn-danger btn-sm" data-rm-exp="${x.id}">Excluir</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="vazio">${d.habilitacoes.length ? "Nenhuma experiência enviada." : "Adicione primeiro a sua formação."}</p>`}
          </section>`;

        const formHab = (h) => {
          const m = window.UI.modal(`
            <h2>${h ? "Editar formação" : "Adicionar formação"}</h2>
            <div class="form-grid">
              <div class="field full"><label for="h-tit">Formação</label><input class="input" id="h-tit" maxlength="120" placeholder="Ex.: Técnico em edificações, Engenharia civil" value="${esc(h ? h.titulo : "")}"></div>
              <div class="field"><label for="h-niv">Nível</label><select class="input" id="h-niv">${Object.entries(Fin.NIVEIS).map(([k, t]) => `<option value="${k}" ${h && h.nivel === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
              <div class="field"><label for="h-con">Conselho</label><select class="input" id="h-con">${Fin.CONSELHOS.map((x) => `<option ${h && h.conselho === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
              <div class="field"><label for="h-data">Data do diploma ou registro</label><input class="input" id="h-data" type="date" value="${h && h.data_habilitacao ? h.data_habilitacao : ""}"></div>
              <div class="field"><label for="h-reg">Nº do registro (se houver)</label><input class="input" id="h-reg" maxlength="40" value="${esc(h ? h.registro || "" : "")}"></div>
              ${h ? "" : '<div class="field full"><label for="h-arq">Documentos (diploma, carteira do conselho)</label><input class="input" id="h-arq" type="file" multiple accept="image/*,.pdf"></div>'}
            </div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="h-ok">Enviar para validação</button></div>`);
          $("#h-ok", m.el).onclick = async (ev) => {
            const reg = { fin_cooperado_id: c.id, titulo: $("#h-tit", m.el).value.trim(), nivel: $("#h-niv", m.el).value, conselho: $("#h-con", m.el).value, data_habilitacao: $("#h-data", m.el).value || null, registro: $("#h-reg", m.el).value.trim() || null };
            if (!reg.titulo || !reg.data_habilitacao) return toast("Informe a formação e a data do diploma ou registro.", "err");
            if (h) reg.id = h.id;
            const arqs = h ? [] : [...($("#h-arq", m.el).files || [])];
            const ok = await acao(ev.currentTarget, async () => { const id = await API.exp.salvar("habilitacoes", reg); for (const a of arqs) await API.exp.anexar(c.id, "habilitacao", id, a); return true; }, "Formação enviada para validação.");
            if (ok) { m.fechar(); recarregar(); }
          };
        };
        const formExp = (x) => {
          const m = window.UI.modal(`
            <h2>${x ? "Editar experiência" : "Adicionar experiência"}</h2>
            <div class="form-grid">
              <div class="field full"><label for="e-hab">Formação a que esta experiência se refere</label><select class="input" id="e-hab">${d.habilitacoes.map((h) => `<option value="${h.id}" ${x && x.habilitacao_id === h.id ? "selected" : ""}>${esc(h.titulo)} (${esc(h.conselho || "")})</option>`).join("")}</select></div>
              <div class="field full"><label for="e-desc">Cargo, empresa e principais atividades</label><textarea class="input" id="e-desc" maxlength="600" rows="3">${esc(x ? x.descricao : "")}</textarea></div>
              <div class="field"><label for="e-ini">Início</label><input class="input" id="e-ini" type="date" value="${x ? x.inicio : ""}"></div>
              <div class="field"><label for="e-fim">Fim</label><input class="input" id="e-fim" type="date" value="${x && x.fim ? x.fim : ""}" ${x && !x.fim ? "disabled" : ""}></div>
              <label class="ciente full"><input type="checkbox" id="e-atual" ${x && !x.fim ? "checked" : ""}> <span>Ainda trabalho nesta função</span></label>
              ${x ? "" : '<div class="field full"><label for="e-arq">Comprovantes</label><input class="input" id="e-arq" type="file" multiple accept="image/*,.pdf"></div>'}
            </div>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="e-ok">Enviar para validação</button></div>`);
          $("#e-atual", m.el).onchange = (e) => { $("#e-fim", m.el).disabled = e.target.checked; if (e.target.checked) $("#e-fim", m.el).value = ""; };
          $("#e-ok", m.el).onclick = async (ev) => {
            const atual = $("#e-atual", m.el).checked;
            const reg = { fin_cooperado_id: c.id, habilitacao_id: $("#e-hab", m.el).value, descricao: $("#e-desc", m.el).value.trim(), inicio: $("#e-ini", m.el).value, fim: atual ? null : $("#e-fim", m.el).value || null };
            if (!reg.descricao || !reg.inicio) return toast("Informe a experiência e o início.", "err");
            if (!atual && !reg.fim) return toast("Informe o fim ou marque que ainda trabalha nesta função.", "err");
            if (reg.fim && reg.fim < reg.inicio) return toast("O fim não pode ser antes do início.", "err");
            if (x) reg.id = x.id;
            const arqs = x ? [] : [...($("#e-arq", m.el).files || [])];
            const ok = await acao(ev.currentTarget, async () => { const id = await API.exp.salvar("experiencias", reg); for (const a of arqs) await API.exp.anexar(c.id, "experiencia", id, a); return true; }, "Experiência enviada para validação.");
            if (ok) { m.fechar(); recarregar(); }
          };
        };
        $("#ex-nova-hab").onclick = () => formHab(null);
        $("#ex-nova-exp").onclick = () => formExp(null);
        el.onclick = async (e) => {
          const b = (sel) => e.target.closest(sel); let x;
          if ((x = b("[data-doc]"))) { const cp = d.comprovantes.find((y) => y.id === x.dataset.doc); const url = await acao(null, () => API.exp.link(cp)); if (url) abrirArquivo(url, cp.nome_arquivo); return; }
          if ((x = b("[data-rmdoc]"))) { const cp = d.comprovantes.find((y) => y.id === x.dataset.rmdoc); if (!(await confirmar(`Remover o documento ${cp.nome_arquivo}?`, "Remover"))) return; if (await acao(null, () => API.exp.excluirComprovante(cp), "Documento removido.")) recarregar(); return; }
          if ((x = b("[data-anexar]"))) {
            const [tipo, id] = x.dataset.anexar.split(":");
            const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = "image/*,.pdf";
            inp.onchange = async () => { const arqs = [...inp.files]; if (!arqs.length) return; if (await acao(x, async () => { for (const a of arqs) await API.exp.anexar(c.id, tipo, id, a); return true; }, "Documento anexado.")) recarregar(); };
            inp.click(); return;
          }
          if ((x = b("[data-ed-hab]"))) return formHab(d.habilitacoes.find((y) => y.id === x.dataset.edHab));
          if ((x = b("[data-ed-exp]"))) return formExp(d.experiencias.find((y) => y.id === x.dataset.edExp));
          if ((x = b("[data-rm-hab]")) || (x = b("[data-rm-exp]"))) {
            const tab = x.dataset.rmHab ? "habilitacoes" : "experiencias";
            if (!(await confirmar("Excluir este registro e os documentos dele?", "Excluir"))) return;
            if (await acao(x, () => API.exp.excluir(tab, x.dataset.rmHab || x.dataset.rmExp), "Registro excluído.")) recarregar();
          }
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
