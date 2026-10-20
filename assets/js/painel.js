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

  /* Lembrete de filiação sindical (Estatuto, art. 3º, §5º): só para quem não informou filiação; pode adiar por 30 dias */
  const FRASES_SINDICATO = [
    "Cooperativa e sindicato se completam: um organiza o trabalho, o outro defende direitos de toda a categoria.",
    "Os pisos que usamos como base do nosso valor-hora foram conquistados pela luta sindical. Fortaleça quem conquistou.",
    "Quem se organiza no trabalho também se organiza na categoria. Filie-se ao seu sindicato."
  ];
  // "Lembrar depois": esconde o balão por 30 dias, guardado na conta (vale em qualquer aparelho)
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#sind-adiar"); if (!b) return;
    const balao = b.closest(".balao-sindicato"); if (balao) balao.remove();
    try { await API.admissao.adiarLembrete("filiacao_sindical", 30); UI.toast("Combinado: lembramos de novo daqui a 30 dias."); } catch (err) { UI.toast("Não consegui guardar o adiamento; o lembrete pode voltar.", "err"); }
  });
  const CONSELHOS = [["", "— escolher —"], ["CREA", "CREA"], ["CAU", "CAU"], ["CFT", "CFT"], ["CRT", "CRT"], ["CRA", "CRA"], ["CRC", "CRC"], ["CORECON", "CORECON"], ["OAB", "OAB"], ["outro", "Outro conselho"], ["nenhum", "Não tenho conselho profissional"]];
  const cpfValido = (v) => { const c = String(v || "").replace(/\D/g, ""); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false; const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; return dv(9) === Number(c[9]) && dv(10) === Number(c[10]); };
  const seloCad = (f) => { const st = (f && f.dados_status) || "incompleto"; return { incompleto: '<span class="selo warn">incompleto</span>', enviado: '<span class="selo info">aguardando conferência</span>', aprovado: '<span class="selo ok">conferido</span>', devolvido: '<span class="selo err">devolvido para correção</span>' }[st]; };
  /* Lembrete dos dados cadastrais: sem eles completos e conferidos, não há retirada */
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#cad-adiar"); if (!b) return;
    const balao = b.closest(".balao-cadastro"); if (balao) balao.remove();
    try { await API.admissao.adiarLembrete("dados_cadastrais", 7); UI.toast("Lembramos de novo em 7 dias. As retiradas continuam bloqueadas até o cadastro ser conferido."); } catch (err) {}
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#cad-ok"); if (!b) return;
    const balao = b.closest(".balao-cadastro"); if (balao) balao.remove();
    try { await API.admissao.marcarLembrete("cadastro_conferido_visto", b.dataset.em); } catch (err) {}
  });
  /* Para quem confere (coordenação e CA): cadastros aguardando conferência */
  async function avisoConferencia(ctx) {
    const eu = ctx.sessao.perfil; if (!(eu.status === "ativo" && (eu.papel === "coordenacao" || eu.conselho_adm))) return "";
    const n = (await API.admissao.situacaoCadastros().catch(() => [])).filter((x) => x.dados_status === "enviado" && x.perfil_id !== eu.id).length;
    if (!n) return "";
    return `<div class="notice"><b>${n === 1 ? "1 cadastro aguardando" : n + " cadastros aguardando"} conferência</b><p style="margin:.3rem 0 .5rem">Sem a conferência, o cooperado não consegue pedir retiradas. Confira com os documentos e marque como conferido ou devolva para correção.</p>
      <a class="btn btn-primary btn-sm" href="interno.html#cooperados">Conferir agora</a></div>`;
  }
  async function balaoCadastro(ctx) {
    if (ctx.sessao.perfil.status !== "ativo") return "";
    const f = await API.admissao.minhaFicha().catch(() => null); const st = (f && f.dados_status) || "incompleto";
    if (st === "aprovado") {
      const visto = await API.admissao.lembreteAte("cadastro_conferido_visto").catch(() => null);
      if (!f.dados_conferido_em || (visto && new Date(visto) >= new Date(f.dados_conferido_em))) return "";
      return `<div class="notice balao-cadastro"><b>Dados cadastrais ${seloCad(f)}</b><p style="margin:.3rem 0 .5rem">Seus dados cadastrais foram conferidos${f.dados_conferido_nome ? " por " + esc(f.dados_conferido_nome) : ""} em ${data(f.dados_conferido_em)}. As retiradas estão liberadas.</p>
        <button class="btn btn-ghost btn-sm" id="cad-ok" type="button" data-em="${esc(f.dados_conferido_em)}">Entendi</button></div>`;
    }
    if (st === "incompleto") { const ate = await API.admissao.lembreteAte("dados_cadastrais").catch(() => null); if (ate && new Date(ate) > new Date()) return ""; }
    const txt = st === "enviado" ? "Seus dados foram enviados e aguardam a conferência da coordenação ou do CA. Assim que forem conferidos, as retiradas ficam liberadas."
      : st === "devolvido" ? `A conferência devolveu seus dados para correção: ${esc((f && f.dados_motivo) || "veja em Meu perfil")}. Sem os dados cadastrais atualizados e conferidos, não é possível pedir retiradas.`
      : "Complete seus dados cadastrais (qualificação para as atas, conselho profissional e chave Pix). Sem os dados cadastrais atualizados e conferidos, não é possível pedir retiradas.";
    return `<div class="notice ${st === "devolvido" ? "err" : st === "enviado" ? "" : "warn"} balao-cadastro"><b>Dados cadastrais ${seloCad(f)}</b><p style="margin:.3rem 0 .5rem">${txt}</p>
      ${st !== "enviado" ? `<a class="btn btn-primary btn-sm" href="#perfil">${st === "devolvido" ? "Corrigir agora" : "Completar agora"}</a>${st === "incompleto" ? ' <button class="link-botao" id="cad-adiar" type="button">Lembrar depois</button>' : ""}` : ""}</div>`;
  }
  /* Convite para instalar o app (só no celular, fora do app; "agora não" esconde por 60 dias) */
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#app-depois"); if (!b) return;
    const x = b.closest(".balao-app"); if (x) x.remove();
    try { await API.admissao.adiarLembrete("app_celular", 60); } catch (err) {}
  });
  /* No app, convite para ativar a biometria (uma vez; "agora não" esconde por 60 dias) */
  document.addEventListener("click", async (e) => {
    const on = e.target.closest("#bioc-on"), dep = e.target.closest("#bioc-depois"); if (!on && !dep) return;
    const x = (on || dep).closest(".balao-bio");
    if (dep) { if (x) x.remove(); try { await API.admissao.adiarLembrete("biometria_convite", 60); } catch (err) {} return; }
    try { const s = await API.getSession(); await window.Sessao.ativarBio(s.perfil); if (x) x.remove(); UI.toast("Biometria ativada. Quando o app bloquear, use o Face ID ou a digital."); }
    catch (err) { UI.toast("A biometria não foi ativada. Você pode tentar de novo em Meu perfil.", "err"); }
  });
  async function balaoBio(ctx) {
    const S = window.Sessao; if (!S || !S.APP) return "";
    const b = S.bio(); if (b && b.perfil_id === ctx.sessao.perfil.id) return "";
    if (!(await S.bioDisponivel())) return "";
    const ate = await API.admissao.lembreteAte("biometria_convite").catch(() => null); if (ate && new Date(ate) > new Date()) return "";
    return `<div class="notice balao-bio"><b>Entrar com Face ID ou digital</b><p style="margin:.3rem 0 .5rem">O app bloqueia depois de 5 minutos sem uso. Ative a biometria para desbloquear sem digitar a senha.</p>
      <button class="btn btn-primary btn-sm" id="bioc-on" type="button">Ativar agora</button> <button class="link-botao" id="bioc-depois" type="button">Agora não</button></div>`;
  }
  /* No app, convite para ativar as notificações (uma vez por aparelho; "agora não" esconde por 30 dias) */
  document.addEventListener("click", async (e) => {
    const on = e.target.closest("#notc-on"), dep = e.target.closest("#notc-depois"); if (!on && !dep) return;
    const x = (on || dep).closest(".balao-notif");
    if (dep) { if (x) x.remove(); try { localStorage.setItem("bimcore-notif-depois", String(Date.now() + 30 * 864e5)); } catch (err) {} return; }
    on.disabled = true;
    try { await window.Push.ativar(); if (x) x.remove(); UI.toast("Notificações ativadas. Você vai receber os avisos da BIMCORE neste celular."); }
    catch (err) { on.disabled = false; UI.toast(err.message, "err"); }
  });
  async function balaoNotif() {
    const P = window.Push; if (!P || !window.Sessao || !window.Sessao.APP || !P.suportado() || P.permissao() === "denied") return "";
    if (await P.ativado()) return "";
    try { if (Number(localStorage.getItem("bimcore-notif-depois") || 0) > Date.now()) return ""; } catch (e) {}
    return `<div class="notice balao-notif"><b>Receba os avisos no celular</b><p style="margin:.3rem 0 .5rem">Comunicados, assembleias e as suas pendências chegam como notificação, e o ícone do app mostra quantas pendências você tem.</p>
      <button class="btn btn-primary btn-sm" id="notc-on" type="button">Ativar notificações</button> <button class="link-botao" id="notc-depois" type="button">Agora não</button></div>`;
  }
  async function balaoApp() {
    const celular = /Android|iPhone|iPad|iPod/.test(navigator.userAgent || "");
    const app = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (!celular || app) return "";
    const ate = await API.admissao.lembreteAte("app_celular").catch(() => null); if (ate && new Date(ate) > new Date()) return "";
    return `<div class="notice balao-app"><b>Use a BIMCORE como app no celular</b><p style="margin:.3rem 0 .5rem">Instale a área do cooperado na tela inicial: abre em tela cheia, com ícone próprio, sem loja de aplicativos.</p>
      <a class="btn btn-primary btn-sm" href="#app">Como instalar</a> <button class="link-botao" id="app-depois" type="button">Agora não</button></div>`;
  }
  async function balaoSindicato(ctx) {
    const p = ctx.sessao.perfil; const f = await API.admissao.minhaFiliacao().catch(() => null); if (f && f.sindicato) return "";
    const ate = await API.admissao.lembreteAte("filiacao_sindical").catch(() => null);
    if (ate && new Date(ate) > new Date()) return "";
    try { if (Number(localStorage.getItem("bimcore-sindicato-adiar-" + p.id) || 0) > Date.now()) return ""; } catch (e) {}
    const frase = FRASES_SINDICATO[new Date().getDate() % FRASES_SINDICATO.length];
    return `<div class="notice balao-sindicato"><b>Filiação sindical</b><p style="margin:.3rem 0 .5rem">${frase} A BIMCORE incentiva cada cooperado a se filiar ao sindicato da sua categoria (Estatuto, art. 3º, §5º).</p>
      <a class="btn btn-ghost btn-sm" href="#perfil">Já sou filiado(a): informar</a> <button class="link-botao" id="sind-adiar" type="button">Lembrar depois</button></div>`;
  }

  /* Mudanças em Documentos desde a última vez que a pessoa abriu a página */
  const ACAO_DOC = { enviado: "novo documento", substituido: "arquivo substituído", excluido: "documento excluído", editado: "título ou categoria alterados" };
  async function avisoDocumentos() {
    const [hist, visto] = await Promise.all([API.documentos.historico().catch(() => []), API.documentos.visto().catch(() => null)]);
    const novos = hist.filter((h) => !visto || h.em > visto);
    if (!novos.length) return "";
    return `<div class="notice"><b>Documentos: ${novos.length} ${novos.length === 1 ? "mudança" : "mudanças"} desde a sua última visita</b>
      <ul style="margin:.3rem 0 .5rem 1.1rem">${novos.slice(0, 5).map((h) => `<li>${esc(h.titulo || "documento")} <span class="hint">(${ACAO_DOC[h.acao] || h.acao} · ${esc(h.categoria || "")} · ${data(h.em)}${h.por_nome ? " · " + esc(h.por_nome) : ""})</span></li>`).join("")}${novos.length > 5 ? `<li class="hint">e mais ${novos.length - 5}…</li>` : ""}</ul>
      <a class="btn btn-ghost btn-sm" href="#documentos">Ver documentos</a></div>`;
  }

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
          ${await avisoConferencia(ctx)}
          ${await balaoCadastro(ctx)}
          ${await balaoApp()}
          ${await balaoBio(ctx)}
          ${await balaoNotif()}
          ${await balaoSindicato(ctx)}
          ${await avisoDocumentos()}
          ${await window.Assembleias.anuncio()}
          ${window.Projetos ? await window.Projetos.anuncio(ctx) : ""}
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

    projetos: {
      titulo: "Projetos",
      async contador(ctx) { return window.Projetos.contador(ctx); },
      async render(el, ctx) { return window.Projetos.renderPainel(el, ctx); }
    },

    assembleias: {
      titulo: "Assembleias",
      async sinal() { return window.Assembleias.sinal(); },
      async render(el, ctx) { return window.Assembleias.render(el, ctx); }
    },

    propostas: {
      titulo: "Propostas e sugestões",
      async contador(ctx) { return window.Propostas.contador(ctx); },
      async render(el, ctx) { return window.Propostas.render(el, ctx); }
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
              <p class="hint full">Horas de <b>produção técnica</b> são lançadas no projeto de cuja equipe você faz parte e só viram crédito depois de aprovadas pelo coordenador do projeto. Se forem devolvidas, corrija aqui e elas voltam para aprovação.</p>
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
              <thead><tr><th>Data</th><th>Projeto</th><th>Tipo</th><th class="num">Horas</th><th>Aprovação</th><th><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${doMes.map((h) => `<tr>
                <td class="num" style="text-align:left">${data(h.data)}</td>
                <td>${esc(h.projeto_nome || "Atividade interna")}<span class="sub">${esc(h.descricao || "")}</span></td>
                <td>${esc(TIPOS[h.tipo] || h.tipo)}</td>
                <td class="num">${horas(h.horas)}</td>
                <td>${h.tipo !== "produtiva" ? '<span class="sub">não precisa</span>' : h.aprovacao === "pendente" ? '<span class="selo warn">aguardando</span>' : h.aprovacao === "devolvida" ? `<span class="selo err">devolvida</span><span class="sub">${esc(h.aprov_motivo || "")}</span>` : `<span class="selo ok">aprovada</span>${h.aprovado_nome ? `<span class="sub">${esc(h.aprovado_nome)}</span>` : ""}`}</td>
                <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-edit="${h.id}">Editar</button> <button class="btn btn-danger btn-sm" data-del="${h.id}">Excluir</button></td></tr>`).join("")}</tbody>
            </table></div>`;
        };
        desenhar();

        $("#h-tipo").addEventListener("change", (e) => { $("#h-tipo-desc").textContent = DESC[e.target.value] || ""; });
        $("#h-mes").addEventListener("change", (e) => { filtroMes = e.target.value; desenhar(); });
        lista.addEventListener("click", async (e) => {
          const be = e.target.closest("[data-edit]");
          if (be) {
            const h = minhas.find((x) => x.id === be.dataset.edit); if (!h) return;
            const m = UI.modal(`<h2>Corrigir lançamento</h2>
              <div class="form-grid">
                <div class="field"><label for="e-proj">Projeto</label><select class="input" id="e-proj">${ativos.map((p) => `<option value="${p.id}" ${p.id === h.projeto_id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}${h.projeto_id && !ativos.some((p) => p.id === h.projeto_id) ? `<option value="${h.projeto_id}" selected>${esc(h.projeto_nome || "Projeto")}</option>` : ""}<option value="" ${!h.projeto_id ? "selected" : ""}>Sem projeto (atividade interna)</option></select></div>
                <div class="field"><label for="e-tipo">Tipo de hora</label><select class="input" id="e-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === h.tipo ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
                <div class="field"><label for="e-data">Data</label><input class="input" id="e-data" type="date" value="${h.data}" max="${hoje()}"></div>
                <div class="field"><label for="e-horas">Horas</label><input class="input" id="e-horas" type="number" min="0.25" max="12" step="0.25" inputmode="decimal" value="${h.horas}"></div>
                <div class="field full"><label for="e-desc">O que foi feito</label><input class="input" id="e-desc" maxlength="300" value="${esc(h.descricao || "")}"></div>
              </div>
              <p class="hint">A correção fica registrada com o antes e o depois, e o Conselho Fiscal pode ver o histórico.</p>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="e-ok">Salvar correção</button></div>`);
            $("#e-ok", m.el).onclick = async (ev) => {
              const d = { projeto_id: $("#e-proj", m.el).value || null, tipo: $("#e-tipo", m.el).value, data: $("#e-data", m.el).value, horas: parseFloat(String($("#e-horas", m.el).value).replace(",", ".")), descricao: $("#e-desc", m.el).value.trim() };
              if (!d.data) return toast("Informe a data.", "err");
              if (!(d.horas > 0 && d.horas <= 12)) return toast("Informe entre 0,25 e 12 horas.", "err");
              if (!d.descricao) return toast("Descreva o que foi feito.", "err");
              const ok = await acao(ev.currentTarget, () => API.producao.editar(h.id, d), "Lançamento corrigido.");
              if (ok) { m.fechar(); const novas = await API.producao.minhas(); minhas.length = 0; minhas.push(...novas); desenhar(); }
            };
            return;
          }
          const b = e.target.closest("[data-del]"); if (!b) return;
          if (!(await confirmar("Excluir este lançamento de horas? A exclusão fica registrada no histórico de correções.", "Excluir"))) return;
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
      async sinal() {
        const Fin = window.Fin;
        const par = await API.fin.parametros().catch(() => ({ modo: "planilha" }));
        let bruta, movs = await API.movimentos.meus().catch(() => []);
        if (par.modo === "sistema") {
          const ext = await API.fin.extrato(); if (!ext || !ext.cooperado) return null;
          bruta = Fin.calcularCooperado(ext.cooperado, ext);
        } else { const pos = await API.financeiro.minhas(); if (!pos.length) return null; bruta = pos[0]; }
        const aberto = Number(Fin.ajustada(bruta, movs).valor_em_aberto || 0);
        return aberto > 0.005 ? { cor: "err", texto: "Pendência com a cooperativa: " + window.UI.moeda(aberto) + " em aberto" } : null;
      },
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
        const minhasNotif = sistema ? await API.notif.listar().catch(() => []) : [];
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
        const fundosInd = n("fic_saldo") + n("fundo_13") + n("fundo_ferias") + n("sobras_a_receber") + n("fundo_aposentadoria");
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
        // produção sai do livre da conta movimento; horas administrativas, da reserva dos 20% para a administração
        const maxPed = cr ? Math.min(cr.saldo, Fin.maxRetiradaCooperado(p.credito ? p : bruta, cxl, ext && ext.caixa ? ext.caixa.cobertura_admin : 1)) : 0;
        const fichaRet = await API.admissao.minhaFicha().catch(() => null), cadastroOk = !!(fichaRet && fichaRet.dados_status === "aprovado");
        const podePedir = cadastroOk && cr && maxPed > 0.005 && maxPed + 0.005 >= parR.retirada_minima;
        const motivoNao = !cr ? "" : !cadastroOk ? `Retirada bloqueada: complete seus <a href="#perfil">dados cadastrais</a> (Meu perfil). Eles precisam estar completos e conferidos pela coordenação ou pelo CA${fichaRet && fichaRet.dados_status === "enviado" ? "; os seus já foram enviados e aguardam conferência" : ""}.` : cr.saldo + 0.005 < Math.max(parR.retirada_minima, 0.01) ? (cr.saldo > 0.005 ? `Seu saldo ainda não chegou ao mínimo de ${moeda(parR.retirada_minima)} para pedir retirada.` : "Sem crédito disponível no momento.")
          : !cxl || !cxl.informado ? "Retiradas ainda não liberadas: a tesouraria não informou o saldo da conta da cooperativa."
          : Fin.creditoAdmin(p.credito ? p : bruta).share > 0.5 ? "Seu crédito é de horas administrativas, pagas com os 20% dos contratos (Custo de Operação e Gestão). Os 20% recebidos até agora ainda não cobrem esse valor. Seu crédito continua guardado; assim que entrar recurso de contrato, o pedido é liberado."
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
          atrasadas: "Contribuições mensais de meses anteriores que ficaram em aberto. Você escolhe quantas quitar com esta retirada, das mais antigas para as mais novas, ou paga por Pix. A partir da 2ª retirada, não quitar nenhuma gera notificação de inadimplência ao CA e ao CF.",
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
              <tbody>${cr.retiradas.slice().reverse().map((r) => { const d = r.status === "paga" ? r : Fin.descontosRetirada(ext.cooperado, ext, Number(r.valor), Fin.mesDe(r.prazo || hojeIso), Number(r.quitar_valor || 0)); const nq = (r.quitar_meses || []).length; return `<tr>
                <td>${dataHora(r.solicitado_em)}</td><td class="num">${moeda(r.valor)}</td>
                <td class="num">${moeda(d.liquido)}${r.status === "paga" ? `<span class="sub">INSS ${moeda(r.inss)}${Number(r.ir) ? " · IR " + moeda(r.ir) : ""} · capital ${moeda(r.contribuicao)}${Number(r.fic_vol) ? " · FIC " + moeda(r.fic_vol) : ""}${Number(r.quitar_valor) ? ` · ${nq} cota${nq > 1 ? "s" : ""} atrasada${nq > 1 ? "s" : ""} ${moeda(r.quitar_valor)}` : ""}</span>` : r.status === "solicitada" ? `<span class="sub">estimado${Number(r.quitar_valor) ? ` · quita ${nq} cota${nq > 1 ? "s" : ""} atrasada${nq > 1 ? "s" : ""}` : ""}</span>` : ""}</td>
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

          ${minhasNotif.length ? `<section class="painel">
            <h2>Notificações de inadimplência</h2>
            <p class="muted">Registradas pelo site quando uma retirada sua, a partir da 2ª, foi paga sem quitar nenhuma cota mensal atrasada. O Conselho de Administração e o Conselho Fiscal acompanham. A notificação não é advertência: qualquer sanção depende de processo disciplinar, com direito de defesa (Estatuto, arts. 15 e 16). Para regularizar, quite as cotas na próxima retirada ou por Pix.</p>
            <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Cotas em aberto</th><th class="num">Valor</th><th>Situação</th><th>Providência do CA</th></tr></thead>
              <tbody>${minhasNotif.map((n) => `<tr><td>${dataHora(n.criado_em)}<span class="sub">${n.numero}ª notificação</span></td><td>${esc(window.Notificacoes.meses(n))}</td><td class="num">${moeda(n.valor)}</td><td>${window.Notificacoes.selo(n.status)}</td><td>${n.providencia ? esc(n.providencia) : "—"}</td></tr>`).join("")}</tbody>
            </table></div>
          </section>` : ""}
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
                ${prox.vence ? `<span class="det">Vence em ${data(prox.vence)}${cr && cr.retiradas.some((r) => r.status === "solicitada" && Fin.mesDe(r.solicitado_em) === prox.mes) ? ". Você tem retirada pedida neste mês: se ela for paga até essa data, a contribuição passa a ser 1,5% dela e não precisa de Pix." : ". Se você pedir uma retirada neste mês e ela for paga até essa data, a contribuição passa a ser 1,5% dela."}</span>` : ""}
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
              ${linhaFundo("Sobras a receber", "sobras_a_receber", "Sua parte do rateio aprovado pela Assembleia Geral, pelas horas do ano (Estatuto, art. 7º)")}
              ${linhaFundo("Fundo de Aposentadoria", "fundo_aposentadoria", "Individual, resgatável no desligamento, aposentadoria, 1º imóvel ou veículo (Regimento, art. 121)")}
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
            <div id="rt-quitar"></div>
            <div id="rt-conta" class="pix-aloc"></div>
            <p class="hint">Estimativa. Os valores definitivos são registrados pela tesouraria quando ela fizer a transferência.</p>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="rt-ok">Solicitar</button></div>`);
          // cotas atrasadas que ainda não estão em outro pedido de retirada
          const jaPedidas = new Set(cr.retiradas.filter((r) => r.status === "solicitada").flatMap((r) => (r.quitar_meses || []).map((q) => q.mes)));
          const atr = Fin.atrasadas(bruta, movs).filter((x) => !jaPedidas.has(x.mes));
          const pctAtr = Number(parR.atraso_desconto_pct != null ? parR.atraso_desconto_pct : 0.1);
          const jaPagas = cr.retiradas.filter((r) => r.status === "paga").length;
          let nQuitar = null, sugQ = 0;
          const conta = () => {
            const v = lerValor($("#rt-valor", m.el).value), box = $("#rt-conta", m.el), qb = $("#rt-quitar", m.el);
            if (!(v > 0)) { box.innerHTML = '<p class="hint">Digite um valor.</p>'; return null; }
            if (v > maxPed + 0.005) { box.innerHTML = `<p class="hint" style="color:var(--err)">Passa do máximo disponível (${moeda(maxPed)}).</p>`; return null; }
            if (v + 0.005 < parR.retirada_minima) { box.innerHTML = `<p class="hint" style="color:var(--err)">O mínimo é ${moeda(parR.retirada_minima)}.</p>`; return null; }
            const d0 = Fin.descontosRetirada(ext.cooperado, ext, v, Fin.mesDe(prazoNovo));
            sugQ = Fin.minimoQuitar(atr, d0.liquido_antes, pctAtr);
            let maxQ = 0, acum = 0; for (const x of atr) { if (acum + x.aberto > d0.liquido_antes + 0.005) break; acum += x.aberto; maxQ++; }
            if (nQuitar == null) nQuitar = sugQ; if (nQuitar > maxQ) nQuitar = maxQ;
            const sel = atr.slice(0, nQuitar), qv = Fin.centavos(sel.reduce((t, x) => t + x.aberto, 0));
            if (atr.length) {
              const ops = []; for (let k = 0; k <= maxQ; k++) { const t = atr.slice(0, k).reduce((u, x) => u + x.aberto, 0); ops.push(`<option value="${k}" ${k === nQuitar ? "selected" : ""}>${k === 0 ? "Nenhuma agora" : `${k} cota${k > 1 ? "s" : ""} · ${moeda(t)}${k === atr.length ? " (todas)" : ""}`}${k === sugQ && k > 0 ? " — sugerido" : ""}</option>`); }
              qb.innerHTML = `<div class="field"><label for="rt-nq">Cotas mensais atrasadas a quitar com esta retirada ${i("atrasadas")}</label>
                <select class="input" id="rt-nq">${ops.join("")}</select>
                <span class="hint">Você tem ${atr.length} em aberto (${atr.map((x) => Fin.nomeMes(x.mes)).join(", ")}), ${moeda(atr.reduce((t, x) => t + x.aberto, 0))} no total. Quitar é opcional; a sugestão são as que cabem em ${Math.round(pctAtr * 100)}% do líquido.</span></div>
                <div class="notice ${jaPagas >= 1 && nQuitar === 0 ? "warn" : ""}" style="margin-top:.5rem">${jaPagas >= 1
                  ? (nQuitar === 0 ? "<b>Atenção:</b> esta será a sua " + (jaPagas + 1) + "ª retirada. Se ela for paga sem quitar nenhuma cota atrasada, o site registra uma notificação de inadimplência, que o Conselho de Administração e o Conselho Fiscal acompanham. Cumprir as contribuições é dever do cooperado (Estatuto, art. 9º)." : "Obrigado por regularizar. A partir da 2ª retirada, quem não quita nenhuma cota atrasada recebe uma notificação de inadimplência.")
                  : "Na primeira retirada, quitar é totalmente livre. A partir da 2ª, se a retirada for paga sem quitar nenhuma cota atrasada, o site registra uma notificação de inadimplência para o Conselho de Administração e o Conselho Fiscal."}</div>`;
              $("#rt-nq", qb).onchange = (e) => { nQuitar = Number(e.target.value); conta(); };
            } else qb.innerHTML = "";
            const d = Fin.descontosRetirada(ext.cooperado, ext, v, Fin.mesDe(prazoNovo), qv);
            d._sel = sel;
            box.innerHTML = `<ul>
              <li><span>Bruto ${i("bruto")}</span><b>${moeda(d.valor)}</b></li>
              <li><span>− INSS 11% ${i("inss")}</span><b>${moeda(d.inss)}</b></li>
              <li><span>− Imposto de renda ${i("ir")}</span><b>${moeda(d.ir)}</b></li>
              <li><span>− Contribuição de capital 1,5% ${i("contrib")}</span><b>${moeda(d.contribuicao)}</b></li>
              ${d.fic_vol ? `<li><span>− FIC voluntário ${i("ficvol")}</span><b>${moeda(d.fic_vol)}</b></li>` : ""}
              ${d.quitar ? `<li><span>− Cotas atrasadas quitadas (${sel.length}) ${i("atrasadas")}</span><b>${moeda(d.quitar)}</b></li>` : ""}
              <li><span><b>Líquido na sua conta</b> ${i("liquido")}</span><b>${moeda(d.liquido)}</b></li></ul>`;
            return { v, sel, qv };
          };
          $("#rt-valor", m.el).addEventListener("input", conta); conta();
          $("#rt-ok", m.el).onclick = async (ev) => {
            const r = conta(); if (!r) return;
            const quitar = r.sel.map((x) => ({ mes: x.mes, valor: x.aberto }));
            const ok = await acao(ev.currentTarget, () => API.fin.solicitarRetirada({ valor: r.v, prazo: prazoNovo, quitar_meses: quitar.length ? quitar : null, quitar_valor: quitar.length ? r.qv : null }), "Retirada solicitada. A tesouraria foi avisada pelo site.");
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

    transparencia: {
      titulo: "Prestação de contas",
      async render(el) {
        const T = window.Tesouraria;
        const ps = (await API.cf.prestacoes().catch(() => [])).filter((p) => p.status === "publicada");
        const nomeTri = (t) => { const [a, q] = t.split("-T"); return `${q}º trimestre de ${a}`; };
        el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Transparência</p><h1>Prestação de contas</h1></div></div>
          <p class="muted">A cada trimestre, a cooperativa mostra quanto entrou de Custo de Operação e Gestão (os 20% dos contratos) e como foi usado, depois da conferência do Conselho Fiscal (Estatuto, art. 23, §8º; Regimento, art. 170). Todos os cooperados têm acesso amplo às informações financeiras (Estatuto, art. 60, §7º).</p>
          ${ps.length ? ps.map((p) => `<section class="painel"><div class="painel-cab"><h2>${nomeTri(p.trimestre)}</h2><span class="hint">publicada em ${dataHora(p.publicado_em)}</span></div>
            ${T ? T.htmlPrestacao(p.dados) : ""}
            ${p.parecer ? `<div class="notice"><b>Parecer do Conselho Fiscal</b> (${esc(p.conferido_nome || "")}): ${esc(p.parecer)}</div>` : ""}</section>`).join("")
            : '<p class="vazio">Nenhuma prestação de contas publicada ainda. A primeira sai no fim do primeiro trimestre com contratos.</p>'}`;
        if (window.Sobras) el.insertAdjacentHTML("beforeend", await window.Sobras.htmlTransparencia());
      }
    },

    mapa: {
      titulo: "Mapa do dinheiro",
      async render(el) { return window.Caixa.renderPainel(el); }
    },

    denuncia: {
      titulo: "Denúncias e reclamações",
      async render(el) {
        const minhas = await API.cf.minhasDenuncias().catch(() => []);
        const ST = { recebida: "recebida", em_apuracao: "em apuração", procedente: "procedente", improcedente: "improcedente", arquivada: "arquivada" };
        el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Canal do Conselho Fiscal</p><h1>Denúncias e reclamações</h1></div></div>
          <p class="muted">Use este canal para denunciar assédio, discriminação, abuso de poder ou irregularidades, ou para reclamar de algo financeiro. Quem recebe e apura é o Conselho Fiscal, em até 30 dias (Regimento, arts. 46 e 47; Estatuto, art. 67, k).</p>
          <section class="painel"><h2>Enviar</h2>
            <form id="dn-f" class="form-grid" novalidate>
              <div class="field"><label for="dn-tipo">Tipo</label><select class="input" id="dn-tipo"><option value="reclamacao">Reclamação (financeira ou de serviço)</option><option value="denuncia">Denúncia</option></select></div>
              <div class="field"><label for="dn-ass">Assunto</label><input class="input" id="dn-ass" maxlength="150"></div>
              <div class="field full"><label for="dn-desc">O que aconteceu</label><textarea class="input" id="dn-desc" rows="5" placeholder="Descreva os fatos, quando e onde aconteceram e, se houver, provas ou testemunhas."></textarea></div>
              <div class="field full"><label for="dn-env">Pessoas envolvidas (opcional)</label><input class="input" id="dn-env" maxlength="200"></div>
              <label class="ciente full"><input type="checkbox" id="dn-sig"> <span>Enviar de forma sigilosa: seu nome não fica registrado. Você acompanha só pelo número de protocolo, então guarde-o.</span></label>
              <div class="full"><button class="btn btn-primary" id="dn-btn" type="submit">Enviar ao Conselho Fiscal</button></div>
            </form>
          </section>
          <section class="painel"><h2>Acompanhar pelo protocolo</h2>
            <form id="dn-ac" class="form-grid" novalidate><div class="field"><label for="dn-prot">Protocolo</label><input class="input" id="dn-prot" placeholder="BC-261008-XXXXX"></div><div class="full"><button class="btn btn-ghost" type="submit">Consultar</button></div></form>
            <div id="dn-res"></div>
          </section>
          ${minhas.length ? `<section class="painel"><h2>Enviadas por você (identificadas)</h2><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Protocolo</th><th>Assunto</th><th>Situação</th><th>Conclusão</th></tr></thead>
            <tbody>${minhas.map((d) => `<tr><td>${esc(d.protocolo)}<span class="sub">${dataHora(d.criado_em)}</span></td><td>${esc(d.assunto)}</td><td>${ST[d.status] || esc(d.status)}</td><td>${["procedente", "improcedente", "arquivada"].includes(d.status) && d.conclusao ? esc(d.conclusao) : "—"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
        $("#dn-f").addEventListener("submit", async (e) => {
          e.preventDefault();
          const d = { tipo: $("#dn-tipo").value, assunto: $("#dn-ass").value.trim(), descricao: $("#dn-desc").value.trim(), envolvidos: $("#dn-env").value.trim(), sigilosa: $("#dn-sig").checked };
          if (!d.assunto || !d.descricao) return toast("Informe o assunto e o que aconteceu.", "err");
          let prot = null;
          const ok = await acao($("#dn-btn"), async () => { prot = await API.cf.enviarDenuncia(d); return true; }, "Enviado ao Conselho Fiscal.");
          if (ok) UI.modal(`<h2>Recebido</h2><p>Seu protocolo é <b style="font-size:1.2rem">${esc(prot || "")}</b>.</p><p class="muted">${d.sigilosa ? "Como o envio foi sigiloso, este número é a única forma de acompanhar. Anote ou tire um print agora." : "Você também acompanha por esta página."} O Conselho Fiscal tem até 30 dias para apurar.</p><div class="modal-acoes"><button class="btn btn-primary btn-sm" data-fechar>Entendi</button></div>`, () => paginas.denuncia.render(el));
        });
        $("#dn-ac").addEventListener("submit", async (e) => {
          e.preventDefault(); const p = $("#dn-prot").value.trim(); if (!p) return;
          const r = await API.cf.acompanharDenuncia(p).catch(() => null);
          $("#dn-res").innerHTML = r ? `<dl class="sol-dados"><div><dt>Protocolo</dt><dd>${esc(r.protocolo)}</dd></div><div><dt>Assunto</dt><dd>${esc(r.assunto)}</dd></div><div><dt>Situação</dt><dd>${ST[r.status] || esc(r.status)}</dd></div><div><dt>Prazo</dt><dd>${data(r.prazo)}</dd></div></dl>${r.conclusao ? `<p><b>Conclusão:</b> ${esc(r.conclusao)}</p>` : ""}` : '<p class="vazio">Protocolo não encontrado.</p>';
        });
      }
    },

    documentos: {
      titulo: "Documentos",
      async render(el) {
        const [docs, hist, visto] = await Promise.all([API.documentos.listar(), API.documentos.historico().catch(() => []), API.documentos.visto().catch(() => null)]);
        API.documentos.marcarVisto().catch(() => {});
        const grupos = {};
        docs.forEach((d) => { (grupos[d.categoria] = grupos[d.categoria] || []).push(d); });
        const novo = (d) => visto && ((d.atualizado_em || d.criado_em) > visto) ? ' <span class="selo info">novo</span>' : "";
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Cooperativa</p><h1>Documentos</h1></div></div>
          ${hist.length ? `<details class="explica"><summary>Mudanças recentes</summary><ul style="margin:.4rem 0 0 1.1rem">${hist.slice(0, 15).map((h) => `<li>${data(h.em)}: ${esc(h.titulo || "documento")} <span class="hint">(${ACAO_DOC[h.acao] || h.acao} · ${esc(h.categoria || "")}${h.por_nome ? " · " + esc(h.por_nome) : ""})</span></li>`).join("")}</ul></details>` : ""}
          ${docs.length ? API.CATEGORIAS_DOC.filter((c) => grupos[c]).map((c) => `
            <section class="painel"><h2>${esc(c)}</h2><div class="docs">
              ${grupos[c].map((d) => `<div class="doc"><div><b>${esc(d.titulo)}</b>${novo(d)}<span>${esc(d.nome_arquivo)} · ${bytes(d.tamanho || 0)} · ${d.atualizado_em ? "atualizado em " + data(d.atualizado_em) : data(d.criado_em)}</span></div>
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
        const selo = (x) => x.status === "aprovada" ? `<span class="selo ok">validado</span>${x.analise_nome ? `<span class="sub">por ${esc(x.analise_nome)}${x.analise_cargo ? " — " + esc(x.analise_cargo) : ""}</span>` : ""}` : x.status === "recusada" ? `<span class="selo warn">em exigência</span>${x.motivo ? `<span class="sub">O que falta: ${esc(x.motivo)}</span>` : ""}` : '<span class="selo warn">em análise</span>';
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
              <li>Cada registro é validado pelo Conselho de Administração, com base nos documentos (Estatuto, art. 8º, V; Regimento, art. 89). Você vê quem analisou. A progressão é automática quando o tempo é atingido.</li>
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

    indice: {
      titulo: "Meu índice (IGCC)",
      async render(el) { return window.IGCC.renderMeu(el); }
    },

    livro: {
      titulo: "Livro de Matrícula",
      async render(el) { return window.Admissao.renderLivro(el); }
    },

    manual: {
      titulo: "Manual do site",
      async render(el) { return window.Manual.render(el); }
    },

    biblioteca: {
      titulo: "Biblioteca",
      async sinal() { const a = await API.biblioteca.aberta(); return a ? { cor: "warn", texto: "Cronômetro de leitura ligado" } : null; },
      async render(el, ctx) {
        const eu = ctx.sessao.perfil, g = eu.status === "ativo" && (eu.papel === "coordenacao" || !!eu.conselho_adm);
        const [livros, minhas, aberta, par, todas, pessoas] = await Promise.all([API.biblioteca.listar(), API.biblioteca.minhas().catch(() => ({ sessoes: [], leituras: [] })), API.biblioteca.aberta().catch(() => null),
          API.igcc && API.igcc.parametros ? API.igcc.parametros().catch(() => null) : null, g ? API.biblioteca.todas().catch(() => ({ sessoes: [], leituras: [] })) : null, g ? API.cooperados.listar().catch(() => []) : []]);
        const meses = par ? Number(par.meses || 12) : 12, meta = par ? Number(par.meta_leitura || 60) : 60, peso = par ? Number(par.peso_leitura || 0) : 0;
        const desde = Date.now() - meses * 30.44 * 864e5;
        const doPeriodo = (ss) => ss.filter((x) => x.fim && new Date(x.inicio) >= desde);
        const minutos = (ss) => ss.reduce((t, x) => t + Number(x.minutos || 0), 0);
        const meuMin = minutos(doPeriodo(minhas.sessoes)), meusPts = Math.floor(meuMin / 10);
        const ativos = livros.filter((l) => l.ativo !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        const leit = (id) => minhas.leituras.find((x) => x.livro_id === id) || {};
        const livroDe = (id) => livros.find((l) => l.id === id) || {};
        const hm = (m) => { m = Math.round(Number(m) || 0); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) + " min" : ""}`; };
        const relogio = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), mi = Math.floor((t % 3600) / 60), se = t % 60; return `${h}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}`; };
        const cartao = (l) => { const r = leit(l.id), arq = l.arquivos || {}, pct = l.paginas && r.pagina ? Math.min(100, Math.round(r.pagina / l.paginas * 100)) : 0;
          const tempo = minutos(minhas.sessoes.filter((x) => x.livro_id === l.id && x.fim));
          return `<article class="livro"><div class="curso-cab">${l.tema ? `<span class="selo info">${esc(l.tema)}</span>` : ""}${r.concluido_em ? `<span class="selo ok">lido em ${data(r.concluido_em)}</span>` : ""}${aberta && aberta.livro_id === l.id ? '<span class="selo warn">lendo agora</span>' : ""}</div>
            <h3>${esc(l.titulo)}</h3><p class="hint">${esc([l.autor, l.tradutor ? "trad. " + l.tradutor : "", l.ano, l.paginas ? l.paginas + " páginas" : ""].filter(Boolean).join(" · "))}</p>
            ${l.descricao ? `<p>${esc(l.descricao)}</p>` : ""}
            ${r.pagina || tempo ? `<div class="livro-barra" title="${pct}%"><i style="width:${pct}%"></i></div><p class="hint">${r.pagina ? `Você parou na página ${r.pagina}${l.paginas ? " de " + l.paginas : ""}` : "Ainda sem página registrada"} · ${hm(tempo)} de leitura</p>` : ""}
            <div class="sol-acoes">
              ${!aberta ? `<button class="btn btn-primary btn-sm" data-ler="${l.id}">Começar a ler</button>` : ""}
              ${arq.pdf ? `<button class="btn btn-ghost btn-sm" data-abrir="${l.id}|pdf">Abrir PDF</button><button class="btn btn-ghost btn-sm" data-baixar="${l.id}|pdf">Baixar PDF</button>` : ""}
              ${arq.epub ? `<button class="btn btn-ghost btn-sm" data-baixar="${l.id}|epub">Baixar EPUB</button>` : ""}
              ${!arq.pdf && !arq.epub ? '<span class="hint">Arquivo ainda não enviado.</span>' : ""}
              <button class="link-btn" type="button" data-concl="${l.id}">${r.concluido_em ? "desmarcar como lido" : "terminei este livro"}</button>
              ${g ? `<button class="link-btn" type="button" data-env="${l.id}|pdf">${arq.pdf ? "trocar" : "enviar"} PDF</button><button class="link-btn" type="button" data-env="${l.id}|epub">${arq.epub ? "trocar" : "enviar"} EPUB</button><button class="link-btn" type="button" data-edl="${l.id}">editar</button>` : ""}
            </div></article>`; };
        const crono = aberta ? `<section class="cronometro" id="crono"><div class="painel-cab"><h2>Lendo: ${esc(livroDe(aberta.livro_id).titulo || "livro")}</h2><span class="hint">desde ${dataHora(aberta.inicio)}</span></div>
            <div class="tempo" id="crono-t">${relogio(Date.now() - new Date(aberta.inicio))}</div>
            <p class="hint" id="crono-h">O cronômetro continua contando mesmo se você sair do site para ler no leitor de PDF ou de EPUB. Cada sessão conta no máximo 90 minutos, e cada dia no máximo 180.</p>
            <div class="sol-acoes"><button class="btn btn-primary btn-sm" id="crono-parar">Parar e registrar</button>${(livroDe(aberta.livro_id).arquivos || {}).pdf ? `<button class="btn btn-ghost btn-sm" data-abrir="${aberta.livro_id}|pdf">Abrir PDF</button>` : ""}<button class="link-btn" type="button" id="crono-desc">descartar esta leitura</button></div></section>`
          : `<section class="cronometro"><h2>Cronômetro de leitura</h2><div class="tempo parado">0:00:00</div><p class="hint">Escolha um livro e toque em <b>Começar a ler</b>. Ao terminar, toque em <b>Parar e registrar</b> e diga a página em que parou. Cada 10 minutos lidos vale 1 ponto.</p></section>`;
        const hist = minhas.sessoes.filter((x) => x.fim).sort((a, b) => new Date(b.inicio) - new Date(a.inicio)).slice(0, 10);
        let gest = "";
        if (g && todas) {
          const lin = pessoas.filter((p) => p.status === "ativo").map((p) => { const ss = todas.sessoes.filter((x) => x.perfil_id === p.id && x.fim); const mi = minutos(doPeriodo(ss)); const ult = ss.sort((a, b) => new Date(b.inicio) - new Date(a.inicio))[0];
            return { p, mi, pts: Math.floor(mi / 10), liv: todas.leituras.filter((x) => x.perfil_id === p.id && x.concluido_em).length, ult }; }).sort((a, b) => b.mi - a.mi);
          gest = `<section class="painel"><h2>Leitura dos cooperados</h2><p class="hint">Só a coordenação e o CA veem esta lista. Últimos ${meses} meses.</p>
            <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th class="num">Tempo</th><th class="num">Pontos</th><th class="num">Livros lidos</th><th>Última leitura</th></tr></thead><tbody>
            ${lin.map((x) => `<tr><td>${esc(x.p.nome)}</td><td class="num">${hm(x.mi)}</td><td class="num">${x.pts} de ${meta}</td><td class="num">${x.liv}</td><td>${x.ult ? `${data(x.ult.inicio)} · ${esc(livroDe(x.ult.livro_id).titulo || "")}${x.ult.pagina ? " · p. " + x.ult.pagina : ""}` : '<span class="hint">ainda não leu</span>'}</td></tr>`).join("")}
            </tbody></table></div></section>`;
        }
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Educação cooperativista</p><h1>Biblioteca</h1></div>${g ? '<button class="btn btn-primary" id="lv-novo">Cadastrar livro</button>' : ""}</div>
          <p class="muted">Livros que a cooperativa considera importantes para os cooperados, para ler aqui ou baixar em PDF ou EPUB. São só para uso dos cooperados: não repasse os arquivos. Educação, formação e informação é o 5º princípio do cooperativismo (Regimento, Título XIII).</p>
          <div class="kpis"><div class="kpi"><span class="rot">Seus pontos de leitura</span><span class="val">${meusPts} de ${meta}</span><span class="det">últimos ${meses} meses · 1 ponto a cada 10 min</span></div>
            <div class="kpi"><span class="rot">Tempo lido</span><span class="val">${hm(meuMin)}</span><span class="det">${peso > 0 ? `conta no IGCC com peso ${peso}` : "ainda sem peso no IGCC (definido pelo CA)"}</span></div>
            <div class="kpi"><span class="rot">Livros lidos</span><span class="val">${minhas.leituras.filter((x) => x.concluido_em).length}</span><span class="det">de ${ativos.length} na biblioteca</span></div></div>
          ${crono}
          <section class="painel"><h2>Livros</h2>${ativos.length ? `<div class="livros">${ativos.map(cartao).join("")}</div>` : '<p class="vazio">Nenhum livro na biblioteca ainda.</p>'}</section>
          ${hist.length ? `<section class="painel"><h2>Suas últimas leituras</h2><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Dia</th><th>Livro</th><th class="num">Tempo contado</th><th class="num">Parou na página</th></tr></thead><tbody>
            ${hist.map((x) => `<tr><td>${dataHora(x.inicio)}</td><td>${esc(livroDe(x.livro_id).titulo || "")}${x.nota ? `<span class="sub">${esc(x.nota)}</span>` : ""}</td><td class="num">${hm(x.minutos)}</td><td class="num">${x.pagina || "—"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
          ${gest}`;
        const recarregar = async () => { await paginas.biblioteca.render(el, ctx); if (ctx.atualizarContadores) ctx.atualizarContadores(); };
        /* relógio */
        if (aberta) { const t0 = new Date(aberta.inicio).getTime(); const tick = () => { const t = $("#crono-t"); if (!t || !t.isConnected) return clearInterval(iv); const ms = Date.now() - t0; t.textContent = relogio(ms);
            if (ms > 90 * 60000) $("#crono-h").textContent = "Passou de 90 minutos: o que ler daqui em diante nesta sessão não conta. Pare e registre, e comece outra se continuar lendo."; };
          const iv = setInterval(tick, 1000); }
        /* abrir e baixar: a janela abre antes de buscar o link, para o celular não bloquear */
        const abrir = async (id, fmt, baixar) => { const l = livroDe(id); const cam = (l.arquivos || {})[fmt]; if (!cam) return;
          const nomeArq = `${l.titulo}.${fmt}`.replace(/[\\/:*?"<>|]/g, "");
          if (API.demo) { const a = document.createElement("a"); a.href = cam; if (baixar) a.download = nomeArq; else a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); return; }
          const w = baixar ? null : window.open("", "_blank");
          try { const u = await API.biblioteca.linkArquivo(cam, baixar ? nomeArq : null); if (w) w.location.href = u; else location.href = u; }
          catch (er) { if (w) w.close(); toast("Não foi possível abrir o arquivo.", "err"); } };
        const formLivro = (l) => { l = l || { ordem: 100 };
          const m = UI.modal(`<h2>${l.id ? "Editar livro" : "Cadastrar livro"}</h2><div class="form-grid">
            <div class="field full"><label for="lv-t">Título</label><input class="input" id="lv-t" maxlength="200" value="${esc(l.titulo || "")}"></div>
            <div class="field"><label for="lv-a">Autor</label><input class="input" id="lv-a" maxlength="120" value="${esc(l.autor || "")}"></div>
            <div class="field"><label for="lv-tr">Tradução</label><input class="input" id="lv-tr" maxlength="120" value="${esc(l.tradutor || "")}"></div>
            <div class="field"><label for="lv-an">Ano / edição</label><input class="input" id="lv-an" maxlength="60" value="${esc(l.ano || "")}"></div>
            <div class="field"><label for="lv-p">Páginas (do PDF)</label><input class="input" id="lv-p" type="number" min="1" value="${l.paginas || ""}"></div>
            <div class="field"><label for="lv-tm">Tema</label><input class="input" id="lv-tm" maxlength="60" value="${esc(l.tema || "")}" placeholder="História do cooperativismo"></div>
            <div class="field"><label for="lv-o">Ordem</label><input class="input" id="lv-o" type="number" min="1" value="${l.ordem || 100}"></div>
            <div class="field full"><label for="lv-d">Por que ler (aparece para o cooperado)</label><input class="input" id="lv-d" maxlength="500" value="${esc(l.descricao || "")}"></div></div>
            <p class="hint">Depois de salvar, envie os arquivos pelos links “enviar PDF” e “enviar EPUB” no cartão do livro. Eles ficam num depósito fechado, que só os cooperados acessam.</p>
            <div class="modal-acoes">${l.id ? '<button class="btn btn-danger btn-sm" id="lv-del">Remover</button>' : ""}<button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="lv-ok">Salvar</button></div>`);
          $("#lv-ok", m.el).onclick = async (ev) => { const d = { id: l.id, titulo: $("#lv-t", m.el).value.trim(), autor: $("#lv-a", m.el).value.trim() || null, tradutor: $("#lv-tr", m.el).value.trim() || null, ano: $("#lv-an", m.el).value.trim() || null,
              paginas: Number($("#lv-p", m.el).value) || null, tema: $("#lv-tm", m.el).value.trim() || null, ordem: Number($("#lv-o", m.el).value) || 100, descricao: $("#lv-d", m.el).value.trim() || null };
            if (d.titulo.length < 2) return toast("Informe o título.", "err"); if (!d.id) delete d.id;
            if (await acao(ev.currentTarget, () => API.biblioteca.salvar(d), "Livro salvo.")) { m.fechar(); recarregar(); } };
          if (l.id) $("#lv-del", m.el).onclick = async (ev) => { if (!(await confirmar("Remover este livro e os arquivos dele? O tempo de leitura registrado também sai.", "Remover"))) return; if (await acao(ev.currentTarget, () => API.biblioteca.excluir(l.id), "Livro removido.")) { m.fechar(); recarregar(); } }; };
        const nv = $("#lv-novo"); if (nv) nv.onclick = () => formLivro(null);
        const parar = $("#crono-parar");
        if (parar) parar.onclick = () => { const l = livroDe(aberta.livro_id), r = leit(aberta.livro_id);
          const m = UI.modal(`<h2>Registrar leitura</h2><p class="muted">${esc(l.titulo || "")} · ${hm((Date.now() - new Date(aberta.inicio)) / 60000)}</p><div class="form-grid">
              <div class="field"><label for="rl-tipo">Onde você parou</label><select class="input" id="rl-tipo"><option value="pag">Página (PDF)</option><option value="pct">Porcentagem (EPUB)</option></select></div>
              <div class="field"><label for="rl-v" id="rl-rot">Página</label><input class="input" id="rl-v" type="number" min="1" max="${l.paginas || 9999}" value="${r.pagina || ""}" inputmode="numeric"></div>
              <div class="field full"><label for="rl-n">O que achou mais importante (opcional)</label><input class="input" id="rl-n" maxlength="300"></div></div>
              <p class="hint">No EPUB a numeração de páginas muda com o tamanho da letra; por isso, informe a porcentagem que o leitor mostra.</p>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Continuar lendo</button><button class="btn btn-primary btn-sm" id="rl-ok">Registrar</button></div>`);
          $("#rl-tipo", m.el).onchange = (e) => { const pct = e.target.value === "pct"; $("#rl-rot", m.el).textContent = pct ? "Porcentagem lida" : "Página"; $("#rl-v", m.el).max = pct ? 100 : l.paginas || 9999; $("#rl-v", m.el).value = ""; };
          $("#rl-ok", m.el).onclick = async (ev) => { let v = Number($("#rl-v", m.el).value); const pct = $("#rl-tipo", m.el).value === "pct";
            if (!v || v < 1) return toast(pct ? "Informe a porcentagem." : "Informe a página em que parou.", "err");
            if (pct) { if (v > 100) return toast("A porcentagem vai até 100.", "err"); v = Math.max(1, Math.round(v / 100 * (l.paginas || 100))); }
            const b = ev.currentTarget; b.disabled = true;
            try { const res = await API.biblioteca.parar(aberta.id, v, $("#rl-n", m.el).value);
              m.fechar(); toast(res.contados > 0 ? `Leitura registrada: ${hm(res.contados)}${res.contados < res.bruto ? " contados (limite de 90 min por sessão ou 180 por dia)" : ""}.` : "Leitura registrada. Menos de 2 minutos não conta tempo.");
              if (l.paginas && v >= l.paginas && !r.concluido_em) await API.biblioteca.concluir(l.id, true).catch(() => {});
              recarregar(); } catch (er) { b.disabled = false; toast(er.message, "err"); } }; };
        const desc = $("#crono-desc");
        if (desc) desc.onclick = async (ev) => { if (!(await confirmar("Descartar esta leitura? O tempo não será registrado.", "Descartar"))) return; if (await acao(ev.currentTarget, () => API.biblioteca.descartar(aberta.id), "Leitura descartada.")) recarregar(); };
        el.onclick = async (e) => {
          const b = e.target.closest("button"); if (!b) return;
          if (b.dataset.edl) return formLivro(livros.find((l) => l.id === b.dataset.edl));
          if (b.dataset.abrir) { const [id, f] = b.dataset.abrir.split("|"); return abrir(id, f, false); }
          if (b.dataset.baixar) { const [id, f] = b.dataset.baixar.split("|"); return abrir(id, f, true); }
          if (b.dataset.ler) { const id = b.dataset.ler; if (await acao(b, () => API.biblioteca.iniciar(id), "Cronômetro ligado. Boa leitura!")) { await recarregar(); const l = livroDe(id); if ((l.arquivos || {}).pdf && !API.demo) { /* o PDF abre pelo botão, para o celular não bloquear */ } const c = $("#crono"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); } return; }
          if (b.dataset.concl) { const id = b.dataset.concl, sim = !leit(id).concluido_em; if (await acao(b, () => API.biblioteca.concluir(id, sim), sim ? "Parabéns pela leitura!" : "Marcação desfeita.")) recarregar(); return; }
          if (b.dataset.env) { const [id, fmt] = b.dataset.env.split("|");
            const inp = document.createElement("input"); inp.type = "file"; inp.accept = fmt === "pdf" ? "application/pdf,.pdf" : "application/epub+zip,.epub";
            inp.onchange = async () => { const f = inp.files[0]; if (!f) return; if (!f.name.toLowerCase().endsWith("." + fmt)) return toast(`Escolha um arquivo .${fmt}.`, "err");
              if (await acao(b, () => API.biblioteca.enviarArquivo(id, fmt, f), `${fmt.toUpperCase()} enviado.`)) recarregar(); };
            inp.click(); return; }
        };
      }
    },

    formacao: {
      titulo: "Formação",
      subtitulo: "Cursos e trilhas",
      async render(el, ctx) {
        const eu = ctx.sessao.perfil, g = eu.status === "ativo" && (eu.papel === "coordenacao" || !!eu.conselho_adm);
        const [cursos, prog, todosProg, pessoas, igcc] = await Promise.all([API.formacao.listar(), API.formacao.meuProgresso().catch(() => []), g ? API.formacao.progressoTodos().catch(() => []) : [], g ? API.cooperados.listar().catch(() => []) : [], API.igcc && API.igcc.parametros ? API.igcc.parametros().catch(() => null) : null]);
        const PUB = { todos: "todos os cooperados", ca: "Conselho de Administração", cf: "Conselho Fiscal", tesouraria: "tesouraria", coordenacao: "coordenação" };
        const PRI = { 1: ["Essencial", "err"], 2: ["Recomendado", "warn"], 3: ["Complementar", ""] };
        const NIV = { basico: "Básico", intermediario: "Intermediário", avancado: "Avançado" }, ORD = { basico: 1, intermediario: 2, avancado: 3 };
        const CONF = { pendente: ["certificado em conferência", "warn"], conferido: ["certificado conferido", "ok"], recusado: ["certificado não aceito", "err"] };
        const funcoes = (p) => { const f = ["todos"]; if (p.conselho_adm) f.push("ca"); if (p.conselho_fiscal) f.push("cf"); if (p.tesouraria) f.push("tesouraria"); if (p.papel === "coordenacao") f.push("coordenacao"); return f; };
        const meus = funcoes(eu);
        const ativos = cursos.filter((c) => c.ativo !== false).sort((x, y) => x.prioridade - y.prioridade || (ORD[x.nivel] || 0) - (ORD[y.nivel] || 0) || (x.ordem || 0) - (y.ordem || 0));
        const indicadoPara = (c, p, f) => (c.publicos || ["todos"]).some((x) => f.includes(x)) || (c.cooperados || []).includes(p.id);
        const paraMim = ativos.filter((c) => indicadoPara(c, eu, meus));
        const outros = ativos.filter((c) => !paraMim.includes(c));
        const st = (id) => prog.find((x) => x.curso_id === id);
        const conta = paraMim.filter((c) => c.prioridade <= 2), contaOk = conta.filter((c) => (st(c.id) || {}).conferencia === "conferido").length;
        const ess = paraMim.filter((c) => c.prioridade === 1), essOk = ess.filter((c) => (st(c.id) || {}).status === "concluido").length;
        const nome = (id) => (pessoas.find((p) => p.id === id) || {}).nome || "cooperado";
        const peso = igcc ? Number(igcc.peso_formacao || 0) : 0;
        /* próximo nível: em cada tema, o primeiro nível que eu ainda não concluí */
        const proximo = new Set(); [...new Set(paraMim.map((c) => c.tema || ""))].forEach((t) => { const p = paraMim.filter((c) => (c.tema || "") === t && c.nivel && (st(c.id) || {}).status !== "concluido").sort((a, b) => ORD[a.nivel] - ORD[b.nivel])[0]; if (p) proximo.add(p.id); });
        const cartao = (c) => { const x = st(c.id); const [pt, pc] = PRI[c.prioridade] || PRI[2]; const pub = (c.publicos || ["todos"]).filter((p) => p !== "todos").map((p) => PUB[p]);
          const cf = x && x.conferencia ? CONF[x.conferencia] : null; const cert = x && (x.certificado_arquivo || x.certificado_link);
          return `<article class="curso${proximo.has(c.id) ? " curso-prox" : ""}"><div class="curso-cab"><span class="selo ${pc}">${pt}</span>${c.tipo === "trilha" ? '<span class="selo info">trilha</span>' : ""}${c.nivel ? `<span class="selo">${NIV[c.nivel]}</span>` : ""}${proximo.has(c.id) ? '<span class="selo info">seu próximo passo</span>' : ""}
              ${x ? (x.status === "concluido" ? `<span class="selo ok">concluído${x.concluido_em ? " em " + data(x.concluido_em) : ""}</span>` : '<span class="selo info">fazendo</span>') : ""}${cf ? `<span class="selo ${cf[1]}">${cf[0]}</span>` : ""}</div>
            <h3>${esc(c.titulo)}</h3><p class="hint">${esc([c.plataforma, c.carga_horaria, c.tema].filter(Boolean).join(" · "))}${pub.length ? " · indicado para " + esc(pub.join(", ")) : ""}${(c.cooperados || []).includes(eu.id) ? " · indicado para você" : ""}</p>
            ${c.descricao ? `<p>${esc(c.descricao)}</p>` : ""}
            ${x && x.conferencia === "recusado" && x.conferencia_motivo ? `<p class="hint">Motivo: ${esc(x.conferencia_motivo)}. Envie o certificado de novo em “Concluí”.</p>` : ""}
            ${x && x.status === "concluido" && !cert ? '<p class="hint">Envie o certificado para a conclusão ser conferida.</p>' : ""}
            <div class="sol-acoes"><a class="btn btn-primary btn-sm" href="${esc(c.link)}" target="_blank" rel="noopener">Abrir ${c.tipo === "trilha" ? "a trilha" : "o curso"}</a>
              ${!x ? `<button class="btn btn-ghost btn-sm" data-fazendo="${c.id}">Estou fazendo</button>` : ""}${!x || x.status !== "concluido" || !cert || x.conferencia === "recusado" ? `<button class="btn btn-ghost btn-sm" data-conclui="${c.id}">${x && x.status === "concluido" ? "Enviar certificado" : "Concluí"}</button>` : ""}
              ${cert ? `<button class="btn btn-ghost btn-sm" type="button" data-cert="${eu.id}|${c.id}">Meu certificado</button>` : ""}${x && x.conferencia !== "conferido" ? `<button class="link-btn" type="button" data-desm="${c.id}">desfazer</button>` : ""}
              ${g ? `<button class="link-btn" type="button" data-edc="${c.id}">editar</button>` : ""}</div></article>`; };
        /* gestão: certificados a conferir e evolução por tema */
        const aConferir = g ? todosProg.filter((x) => x.status === "concluido" && x.conferencia === "pendente") : [];
        const temas = [...new Set(ativos.filter((c) => c.nivel).map((c) => c.tema || "Outros"))];
        const ativosP = pessoas.filter((p) => p.status === "ativo");
        const evol = (p, t) => { const ok = ativos.filter((c) => (c.tema || "Outros") === t && c.nivel && todosProg.some((x) => x.perfil_id === p.id && x.curso_id === c.id && x.conferencia === "conferido")).sort((a, b) => ORD[b.nivel] - ORD[a.nivel])[0];
          const fazendo = ativos.some((c) => (c.tema || "Outros") === t && todosProg.some((x) => x.perfil_id === p.id && x.curso_id === c.id && x.status === "fazendo"));
          return ok ? `<span class="selo ok">${NIV[ok.nivel]}</span>` : fazendo ? '<span class="selo info">começou</span>' : '<span class="hint">—</span>'; };
        const indic = (p) => { const f = funcoes(p); const al = ativos.filter((c) => c.prioridade <= 2 && indicadoPara(c, p, f)); const okk = al.filter((c) => todosProg.some((x) => x.perfil_id === p.id && x.curso_id === c.id && x.conferencia === "conferido")).length; return `${okk} de ${al.length}`; };
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Educação cooperativista</p><h1>Formação</h1></div>${g ? '<button class="btn btn-primary" id="fc-novo">Indicar curso ou trilha</button>' : ""}</div>
          <p class="muted">Cursos e trilhas gratuitos indicados pela cooperativa, em plataformas como o CapacitaCoop (Sistema OCB/Sescoop), que emite certificado. As trilhas vão do nível básico ao avançado: comece pelo básico de cada tema. Ao concluir, envie o certificado; a coordenação ou o CA confere (Regimento, Título XIII).</p>
          <div class="kpis">${ess.length ? `<div class="kpi"><span class="rot">Essenciais para você</span><span class="val">${essOk} de ${ess.length}</span><span class="det">concluídos</span></div>` : ""}
            ${conta.length ? `<div class="kpi"><span class="rot">Formação no IGCC</span><span class="val">${contaOk} de ${conta.length}</span><span class="det">${peso > 0 ? `conferidos · peso ${peso}` : "conferidos · ainda sem peso no índice (definido pelo CA)"}</span></div>` : ""}</div>
          <section class="painel"><h2>Para você</h2>${paraMim.length ? `<div class="cursos">${paraMim.map(cartao).join("")}</div>` : '<p class="vazio">Nenhum curso indicado ainda.</p>'}</section>
          ${outros.length ? `<section class="painel"><h2>Outros cursos indicados</h2><div class="cursos">${outros.map(cartao).join("")}</div></section>` : ""}
          ${g ? `<section class="painel"><h2>Certificados a conferir</h2><p class="hint">Abra o certificado e confira nome, curso e carga horária. Ninguém confere o próprio.</p>
            ${aConferir.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th><th>Curso</th><th>Concluído em</th><th></th></tr></thead><tbody>
            ${aConferir.map((x) => { const c = cursos.find((k) => k.id === x.curso_id) || {}; const k = x.perfil_id + "|" + x.curso_id; return `<tr><td>${esc(nome(x.perfil_id))}</td><td>${esc(c.titulo || "")}${c.nivel ? `<span class="sub">${NIV[c.nivel]}</span>` : ""}</td><td>${x.concluido_em ? data(x.concluido_em) : "—"}</td>
              <td class="sol-acoes"><button class="btn btn-ghost btn-sm" data-cert="${k}">Ver certificado</button>${x.perfil_id === eu.id ? '<span class="hint">seu: outra pessoa confere</span>' : `<button class="btn btn-primary btn-sm" data-conf="${k}">Conferido</button><button class="btn btn-ghost btn-sm" data-recusa="${k}">Recusar</button>`}</td></tr>`; }).join("")}
            </tbody></table></div>` : '<p class="vazio">Nenhum certificado esperando conferência.</p>'}</section>
          ${temas.length && ativosP.length ? `<section class="painel"><h2>Evolução dos cooperados</h2><p class="hint">Maior nível com certificado conferido em cada tema. “Indicados” conta os essenciais e recomendados da função de cada um (é o que entra no IGCC).</p>
            <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cooperado</th>${temas.map((t) => `<th>${esc(t)}</th>`).join("")}<th class="num">Indicados conferidos</th></tr></thead><tbody>
            ${ativosP.map((p) => `<tr><td>${esc(p.nome)}</td>${temas.map((t) => `<td>${evol(p, t)}</td>`).join("")}<td class="num">${indic(p)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
          <section class="painel"><h2>Acompanhamento por curso</h2><p class="hint">Só a coordenação e o CA veem esta lista.</p>
            <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Curso</th><th class="num">Fazendo</th><th>Concluíram</th></tr></thead><tbody>
            ${ativos.map((c) => { const ps = todosProg.filter((x) => x.curso_id === c.id); const ok = ps.filter((x) => x.status === "concluido"); return `<tr><td>${esc(c.titulo)}<span class="sub">${(PRI[c.prioridade] || PRI[2])[0]}${c.nivel ? " · " + NIV[c.nivel] : ""}</span></td><td class="num">${ps.length - ok.length}</td><td>${ok.length ? ok.map((x) => esc(nome(x.perfil_id)) + (x.conferencia === "conferido" ? " ✓" : "")).join(", ") : '<span class="hint">ninguém ainda</span>'}</td></tr>`; }).join("")}
            </tbody></table></div><p class="hint">✓ = certificado conferido.</p></section>` : ""}`;
        const recarregar = () => paginas.formacao.render(el, ctx);
        const formCurso = (c) => {
          c = c || { prioridade: 2, publicos: ["todos"], ordem: 100, tipo: "curso" };
          const m = UI.modal(`<h2>${c.id ? "Editar indicação" : "Indicar curso ou trilha"}</h2><div class="form-grid">
            <div class="field full"><label for="fc-t">Nome</label><input class="input" id="fc-t" maxlength="200" value="${esc(c.titulo || "")}"></div>
            <div class="field full"><label for="fc-l">Link</label><input class="input" id="fc-l" type="url" value="${esc(c.link || "")}" placeholder="https://capacita.coop.br/..."></div>
            <div class="field"><label for="fc-ti">Tipo</label><select class="input" id="fc-ti"><option value="curso" ${c.tipo !== "trilha" ? "selected" : ""}>Curso</option><option value="trilha" ${c.tipo === "trilha" ? "selected" : ""}>Trilha</option></select></div>
            <div class="field"><label for="fc-n">Nível</label><select class="input" id="fc-n"><option value="">sem nível</option>${Object.entries(NIV).map(([k, t]) => `<option value="${k}" ${c.nivel === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
            <div class="field"><label for="fc-p">Plataforma</label><input class="input" id="fc-p" maxlength="80" value="${esc(c.plataforma || "")}" placeholder="CapacitaCoop"></div>
            <div class="field"><label for="fc-c">Carga horária</label><input class="input" id="fc-c" maxlength="30" value="${esc(c.carga_horaria || "")}" placeholder="10 h"></div>
            <div class="field"><label for="fc-tm">Tema</label><input class="input" id="fc-tm" maxlength="60" value="${esc(c.tema || "")}" placeholder="Cooperativismo, Governança…"></div>
            <div class="field"><label for="fc-pr">Prioridade</label><select class="input" id="fc-pr">${[1, 2, 3].map((n) => `<option value="${n}" ${c.prioridade === n ? "selected" : ""}>${PRI[n][0]}</option>`).join("")}</select></div>
            <div class="field full"><label for="fc-d">Por que fazer (aparece para o cooperado)</label><input class="input" id="fc-d" maxlength="400" value="${esc(c.descricao || "")}"></div>
            <div class="field full"><label>Indicado para</label><div class="part-lista">${Object.entries(PUB).map(([k, t]) => `<label class="ciente"><input type="checkbox" data-pub value="${k}" ${(c.publicos || []).includes(k) ? "checked" : ""}> <span>${t}</span></label>`).join("")}</div></div>
            ${pessoas.length ? `<div class="field full"><label>E também para estes cooperados (opcional)</label><div class="part-lista">${pessoas.filter((p) => p.status === "ativo").map((p) => `<label class="ciente"><input type="checkbox" data-coop value="${p.id}" ${(c.cooperados || []).includes(p.id) ? "checked" : ""}> <span>${esc(p.nome)}</span></label>`).join("")}</div></div>` : ""}
            <div class="field"><label for="fc-o">Ordem dentro da prioridade</label><input class="input" id="fc-o" type="number" min="1" value="${c.ordem || 100}"></div></div>
            <p class="hint">Essenciais e recomendados contam na Formação do IGCC de quem foram indicados; complementares não.</p>
            <div class="modal-acoes">${c.id ? '<button class="btn btn-danger btn-sm" id="fc-del">Remover</button>' : ""}<button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="fc-ok">Salvar</button></div>`);
          $("#fc-ok", m.el).onclick = async (ev) => {
            const d = { id: c.id, titulo: $("#fc-t", m.el).value.trim(), link: $("#fc-l", m.el).value.trim(), plataforma: $("#fc-p", m.el).value.trim() || null, carga_horaria: $("#fc-c", m.el).value.trim() || null, tema: $("#fc-tm", m.el).value.trim() || null,
              tipo: $("#fc-ti", m.el).value, nivel: $("#fc-n", m.el).value || null, cooperados: [...m.el.querySelectorAll("[data-coop]:checked")].map((i) => i.value),
              prioridade: Number($("#fc-pr", m.el).value), descricao: $("#fc-d", m.el).value.trim() || null, publicos: [...m.el.querySelectorAll("[data-pub]:checked")].map((i) => i.value), ordem: Number($("#fc-o", m.el).value) || 100 };
            if (d.titulo.length < 3) return toast("Informe o nome.", "err"); if (!/^https?:\/\//.test(d.link)) return toast("Informe o link (https://…).", "err"); if (!d.publicos.length && !d.cooperados.length) d.publicos = ["todos"];
            if (!d.id) delete d.id;
            if (await acao(ev.currentTarget, () => API.formacao.salvar(d), "Indicação salva.")) { m.fechar(); recarregar(); } };
          if (c.id) $("#fc-del", m.el).onclick = async (ev) => { if (!(await confirmar("Remover esta indicação? O progresso marcado pelos cooperados também sai.", "Remover"))) return; if (await acao(ev.currentTarget, () => API.formacao.excluir(c.id), "Indicação removida.")) { m.fechar(); recarregar(); } };
        };
        const nv = $("#fc-novo"); if (nv) nv.onclick = () => formCurso(null);
        const progDe = (k) => { const [p, c] = k.split("|"); return (p === eu.id ? prog : todosProg).find((x) => x.perfil_id === p && x.curso_id === c) || prog.find((x) => x.curso_id === c); };
        el.onclick = async (e) => {
          const b = e.target.closest("button"); if (!b) return;
          if (b.dataset.edc) return formCurso(cursos.find((c) => c.id === b.dataset.edc));
          if (b.dataset.cert) { const x = progDe(b.dataset.cert); if (!x) return;
            if (x.certificado_arquivo) { try { const u = await API.formacao.linkCertificado(x.certificado_arquivo); window.open(u, "_blank", "noopener"); } catch (er) { toast("Não foi possível abrir o arquivo.", "err"); } }
            else if (x.certificado_link) window.open(x.certificado_link, "_blank", "noopener"); return; }
          if (b.dataset.conf) { const [p, c] = b.dataset.conf.split("|"); if (await acao(b, () => API.formacao.conferir(p, c, true, null), "Certificado conferido.")) recarregar(); return; }
          if (b.dataset.recusa) { const [p, c] = b.dataset.recusa.split("|");
            const m = UI.modal(`<h2>Recusar certificado</h2><div class="field"><label for="rc-m">Motivo (o cooperado vai ver)</label><input class="input" id="rc-m" maxlength="300" placeholder="Ex.: o certificado é de outro curso"></div>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-danger btn-sm" id="rc-ok">Recusar</button></div>`);
            $("#rc-ok", m.el).onclick = async (ev) => { const mo = $("#rc-m", m.el).value.trim(); if (!mo) return toast("Diga o motivo.", "err"); if (await acao(ev.currentTarget, () => API.formacao.conferir(p, c, false, mo), "Certificado recusado.")) { m.fechar(); recarregar(); } }; return; }
          if (b.dataset.fazendo) { if (await acao(b, () => API.formacao.marcar(b.dataset.fazendo, "fazendo"), "Bom estudo!")) recarregar(); return; }
          if (b.dataset.desm) { if (await acao(b, () => API.formacao.desmarcar(b.dataset.desm), "Marcação desfeita.")) recarregar(); return; }
          if (b.dataset.conclui) {
            const id = b.dataset.conclui, x = st(id) || {};
            const m = UI.modal(`<h2>Concluí</h2><div class="form-grid"><div class="field"><label for="cc-d">Concluído em</label><input class="input" id="cc-d" type="date" value="${x.concluido_em || hoje()}" max="${hoje()}"></div>
              <div class="field full"><label for="cc-a">Certificado (PDF ou imagem, até 10 MB)</label><input class="input" id="cc-a" type="file" accept="application/pdf,image/*"></div>
              <div class="field full"><label for="cc-l">ou o link do certificado</label><input class="input" id="cc-l" type="url" placeholder="https://..." value="${esc(x.certificado_link || "")}"></div></div>
              <p class="hint">No CapacitaCoop, o certificado fica em “Meus certificados”: baixe o PDF e envie aqui. Sem certificado, a conclusão fica registrada mas não é conferida nem conta no IGCC.</p>
              <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="cc-ok">Salvar</button></div>`);
            $("#cc-ok", m.el).onclick = async (ev) => { const l = $("#cc-l", m.el).value.trim(), arq = $("#cc-a", m.el).files[0]; if (l && !/^https?:\/\//.test(l)) return toast("O link precisa começar com https://", "err");
              if (await acao(ev.currentTarget, async () => { const cam = arq ? await API.formacao.enviarCertificado(arq) : null; return API.formacao.marcar(id, "concluido", $("#cc-d", m.el).value || null, arq ? null : l || null, cam); }, arq || l ? "Certificado enviado para conferência." : "Conclusão registrada.")) { m.fechar(); recarregar(); } };
          }
        };
      }
    },

    app: {
      titulo: "App no celular",
      async render(el) {
        const ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
        const app = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
        const link = "https://bimcore.com.br/painel.html?app=1";
        const passosIos = `<ol class="asm-passos"><li>Abra <b>bimcore.com.br/painel.html</b> no <b>Safari</b> (no iPhone, a instalação é feita pelo Safari).</li><li>Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima).</li><li>Role e toque em <b>Adicionar à Tela de Início</b>, depois em <b>Adicionar</b>.</li><li>Abra pelo ícone da BIMCORE e entre com seu e-mail e senha uma vez.</li></ol>`;
        const passosAndroid = `<div class="sol-acoes"><button class="btn btn-primary" id="app-instalar" ${window.BIMCORE_INSTALAR ? "" : "hidden"}>Instalar o app</button></div>
          <ol class="asm-passos"><li>Abra <b>bimcore.com.br/painel.html</b> no <b>Chrome</b>.</li><li>Toque em <b>Instalar o app</b> acima ou, se o botão não aparecer, no menu <b>⋮</b> → <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</li><li>Abra pelo ícone da BIMCORE e entre com seu e-mail e senha uma vez.</li></ol>`;
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Celular</p><h1>App no celular</h1></div></div>
          <section class="painel">
            ${app ? '<div class="notice"><b>Você já está usando o app da BIMCORE.</b> Ele se atualiza sozinho sempre que o site muda.</div>' : ""}
            <p class="muted">O app da BIMCORE é a própria área do cooperado instalada no celular, com ícone na tela inicial e tela cheia, sem passar pela App Store nem pelo Google Play. Tudo o que existe no site funciona no app: horas, projetos, conta e retiradas, assembleias com vídeo e votação, documentos. Ele se atualiza sozinho e só abre com o seu login de cooperado.</p>
            ${!app ? (ios ? `<h2>iPhone</h2>${passosIos}` : android ? `<h2>Android</h2>${passosAndroid}` : `<div class="app-qr"><div id="app-qr" aria-label="QR code para abrir no celular"></div><p>Aponte a câmera do celular para o código, ou abra <b>bimcore.com.br/painel.html</b> no navegador do celular. Depois siga os passos abaixo.</p></div>
              <h2>Android</h2>${passosAndroid}<h2>iPhone</h2>${passosIos}`) : ""}
            <p class="hint">Os dados continuam no servidor da cooperativa; o app não guarda seus dados no aparelho. Para sair, use Sair no menu. Se perder o celular, troque a senha em Meu perfil.</p>
          </section>
          <section class="painel" id="notif"><h2>Notificações e número no ícone</h2>
            <p class="muted">Receba no celular, mesmo com o app fechado: comunicados, assembleias convocadas e salas abertas, documentos novos ou atualizados, e as suas pendências (dados cadastrais, certificados e horas devolvidas). O ícone do app mostra o número de pendências, como nos aplicativos de mensagem. Os avisos continuam também dentro do site.</p>
            <div id="notif-estado"><p class="carregando">Verificando…</p></div>
            <p class="hint">A autorização vale para este aparelho. No iPhone, as notificações só funcionam no app instalado na tela inicial (iOS 16.4 ou mais novo). Para parar, toque em Desativar ou desligue nos ajustes do celular.</p>
          </section>`;
        const notif = async () => { const box = $("#notif-estado"); if (!box || !window.Push) return; const P = window.Push;
          if (P.precisaInstalar()) { box.innerHTML = '<div class="notice warn">Instale o app na tela inicial (passos acima) e abra por ele para ativar as notificações.</div>'; return; }
          if (!P.suportado()) { box.innerHTML = '<div class="notice">Este navegador não recebe notificações. No celular, use o app instalado.</div>'; return; }
          if (P.permissao() === "denied") { box.innerHTML = '<div class="notice warn">As notificações estão bloqueadas para a BIMCORE neste aparelho. Libere nos ajustes do celular (ou do navegador) e volte aqui.</div>'; return; }
          const on = await P.ativado();
          box.innerHTML = on ? '<p><span class="selo ok">ativadas neste aparelho</span></p><div class="sol-acoes"><button class="btn btn-ghost btn-sm" id="notif-off">Desativar</button></div>'
            : '<div class="sol-acoes"><button class="btn btn-primary" id="notif-on">Ativar notificações</button></div>';
          const bo = $("#notif-on"); if (bo) bo.onclick = async () => { bo.disabled = true; try { await P.ativar(); toast("Notificações ativadas neste aparelho."); } catch (er) { toast(er.message, "err"); } notif(); };
          const bf = $("#notif-off"); if (bf) bf.onclick = async () => { bf.disabled = true; await P.desativar(); toast("Notificações desativadas neste aparelho."); notif(); }; };
        notif();
        const bt = $("#app-instalar");
        const mostrar = () => { if (bt) bt.hidden = !window.BIMCORE_INSTALAR; };
        document.addEventListener("bimcore-instalavel", mostrar);
        if (bt) bt.onclick = async () => { const ev = window.BIMCORE_INSTALAR; if (!ev) return; ev.prompt(); const r = await ev.userChoice.catch(() => null); window.BIMCORE_INSTALAR = null; mostrar(); if (r && r.outcome === "accepted") toast("App instalado. Ele aparece na tela inicial do celular."); };
        const qr = $("#app-qr");
        if (qr) { try { if (!window.qrcode) await new Promise((ok, erro) => { const sc = document.createElement("script"); sc.src = "assets/vendor/qrcode-generator-1.4.4.js"; sc.onload = ok; sc.onerror = erro; document.head.appendChild(sc); }); const q = window.qrcode(0, "M"); q.addData(link); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch (e) { qr.textContent = link; } }
      }
    },

    perfil: {
      titulo: "Meu perfil",
      separador: true,
      async render(el, ctx) {
        const p = ctx.sessao.perfil;
        const [fil, ficha] = await Promise.all([API.admissao.minhaFiliacao().catch(() => null), API.admissao.minhaFicha().catch(() => null)]);
        const fv = (k) => (ficha && ficha[k]) || "";
        el.innerHTML = `
          <div class="pag-cab"><div><p class="eyebrow">Cadastro</p><h1>Meu perfil</h1></div></div>
          <section class="painel"><h2>Dados</h2>
            <form id="f-perfil" class="form-grid" novalidate>
              <div class="field"><label for="p-nome">Nome completo</label><input class="input" id="p-nome" value="${esc(p.nome)}" autocomplete="name"></div>
              <div class="field"><label for="p-tel">Telefone</label><input class="input" id="p-tel" value="${esc(API.formatarTelefone(p.telefone) || "")}" type="tel" autocomplete="tel" placeholder="(22) 90000-0000"><span class="hint">Fora do Brasil? Comece com + e o código do país (ex.: Canadá +1).</span></div>
              <div class="field full"><label for="p-esp">Especialidade</label><input class="input" id="p-esp" value="${esc(p.especialidade)}" placeholder="Ex.: Estrutural, MEP, orçamento, coordenação BIM"></div>
              <div class="field"><label>E-mail</label><input class="input" value="${esc(p.email)}" disabled></div>
              <div class="field"><label>Cooperado desde</label><input class="input" value="${data(p.data_ingresso)}" disabled></div>
              <div class="field full"><label for="p-sind">Sindicato a que sou filiado(a) (opcional)</label><input class="input" id="p-sind" value="${esc((fil && fil.sindicato) || "")}" maxlength="120" placeholder="Ex.: SENGE-RJ, Sindicato dos Arquitetos e Urbanistas do RJ">
                <span class="hint">Informação voluntária e protegida (LGPD, art. 5º, II): fica visível só para você. A cooperativa vê apenas quantos cooperados são filiados, sem nomes. Deixe em branco se não for filiado(a).</span></div>
              <div class="full"><button class="btn btn-primary" id="p-btn" type="submit">Salvar dados</button></div>
            </form>
          </section>
          <section class="painel" id="sec-dados"><h2>Dados cadastrais ${seloCad(ficha)}</h2>
            <p class="hint">Ficha de matrícula: vai para as atas, para a JUCERJA e para o pagamento das retiradas. Só você, a coordenação e o CA veem estes dados; a tesouraria vê apenas a chave Pix. Qualquer mudança volta para a conferência da coordenação ou do CA, e <b>sem o cadastro completo e conferido não é possível pedir retiradas</b>.</p>
            ${ficha && ficha.dados_status === "devolvido" && ficha.dados_motivo ? `<div class="notice err"><b>Corrigir:</b> ${esc(ficha.dados_motivo)}</div>` : ""}
            <form id="f-dados" class="form-grid" novalidate>
              <div class="field full"><label for="dc-nome">Nome completo (como no documento)</label><input class="input" id="dc-nome" maxlength="160" value="${esc(fv("nome_completo") || p.nome || "")}"></div>
              <div class="field"><label for="dc-nac">Nacionalidade</label><input class="input" id="dc-nac" maxlength="60" value="${esc(fv("nacionalidade") || "brasileira")}"></div>
              <div class="field"><label for="dc-civ">Estado civil</label><select class="input" id="dc-civ">${["", "solteiro(a)", "casado(a)", "casado(a) em comunhão parcial de bens", "casado(a) em comunhão universal de bens", "casado(a) em separação de bens", "união estável", "divorciado(a)", "viúvo(a)"].map((x) => `<option value="${x}" ${fv("estado_civil") === x ? "selected" : ""}>${x || "— escolher —"}</option>`).join("")}</select></div>
              <div class="field"><label for="dc-prof">Profissão</label><input class="input" id="dc-prof" maxlength="80" value="${esc(fv("profissao") || "")}" placeholder="Ex.: técnico em edificações"></div>
              <div class="field"><label for="dc-nasc">Data de nascimento</label><input class="input" id="dc-nasc" type="date" value="${esc(fv("data_nascimento") || "")}"></div>
              <div class="field"><label for="dc-cpf">CPF</label><input class="input" id="dc-cpf" inputmode="numeric" maxlength="14" value="${esc(fv("cpf") || "")}" placeholder="000.000.000-00"></div>
              <div class="field"><label for="dc-rg">RG (número)</label><input class="input" id="dc-rg" maxlength="30" value="${esc(fv("rg") || "")}"></div>
              <div class="field"><label for="dc-rgo">Órgão emissor do RG</label><input class="input" id="dc-rgo" maxlength="30" value="${esc(fv("rg_orgao") || "")}" placeholder="Ex.: DETRAN/RJ"></div>
              <div class="field full"><label for="dc-end">Endereço (rua, número, complemento, bairro)</label><input class="input" id="dc-end" maxlength="200" value="${esc(fv("endereco") || "")}"></div>
              <div class="field"><label for="dc-cid">Cidade/UF (ou cidade e país)</label><input class="input" id="dc-cid" maxlength="80" value="${esc(fv("cidade") || p.cidade || "")}" placeholder="Ex.: Araruama/RJ"></div>
              <div class="field"><label for="dc-cep">CEP</label><input class="input" id="dc-cep" inputmode="numeric" maxlength="9" value="${esc(fv("cep") || "")}" placeholder="00000-000"><span class="hint">Mora fora do Brasil? Use o CEP do seu último endereço no Brasil ou 00000-000 e explique à coordenação.</span></div>
              <div class="field"><label for="dc-cons">Conselho profissional</label><select class="input" id="dc-cons">${CONSELHOS.map(([v, t]) => `<option value="${v}" ${fv("conselho") === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
              <div class="field"><label for="dc-reg">Número do registro</label><input class="input" id="dc-reg" maxlength="40" value="${esc(fv("registro_numero") || "")}"><span class="hint">Mudou de conselho (ex.: do CFT para o CREA ao se formar)? Atualize aqui e cadastre a nova habilitação em Minha experiência, para o CA validar o enquadramento.</span></div>
              <div class="field"><label for="dc-pixt">Tipo da chave Pix (para receber as retiradas)</label><select class="input" id="dc-pixt">${[["", "— escolher —"], ["cpf", "CPF"], ["email", "E-mail"], ["telefone", "Telefone"], ["aleatoria", "Chave aleatória"]].map(([v, t]) => `<option value="${v}" ${fv("pix_tipo") === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
              <div class="field"><label for="dc-pix">Chave Pix</label><input class="input" id="dc-pix" maxlength="120" value="${esc(fv("pix_chave") || "")}"><span class="hint">A conta precisa estar no seu nome (CPF).</span></div>
              <div class="full"><button class="btn btn-primary" id="dc-btn" type="submit">Salvar dados cadastrais</button></div>
            </form>
          </section>
          <section class="painel" id="sec-bio" hidden><h2>Biometria neste aparelho</h2><div id="bio-corpo"></div></section>
          <section class="painel"><h2>Trocar senha</h2>
            <form id="f-senha" class="form-grid" novalidate>
              <div class="field"><label for="s-nova">Nova senha</label><input class="input" id="s-nova" type="password" autocomplete="new-password" minlength="8"></div>
              <div class="field" style="align-self:end"><button class="btn btn-ghost" id="s-btn" type="submit">Trocar senha</button></div>
            </form>
          </section>`;
        $("#f-perfil").addEventListener("submit", async (e) => {
          e.preventDefault();
          const ok = await acao($("#p-btn"), () => Promise.all([API.perfil.atualizarMeu({ nome: $("#p-nome").value.trim(), telefone: $("#p-tel").value.trim(), especialidade: $("#p-esp").value.trim() }), API.admissao.salvarFiliacao($("#p-sind").value.trim() || null)]), "Dados salvos.");
          if (ok) await ctx.recarregarSessao();
        });
        const mascara = (v, tipo) => { const d = String(v || "").replace(/\D/g, ""); return tipo === "cpf" ? d.slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2") : d.slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2"); };
        $("#dc-cpf").addEventListener("input", (e) => { e.target.value = mascara(e.target.value, "cpf"); });
        $("#dc-cep").addEventListener("input", (e) => { e.target.value = mascara(e.target.value, "cep"); });
        const regAt = () => { const c = $("#dc-cons").value; $("#dc-reg").disabled = c === "nenhum"; if (c === "nenhum") $("#dc-reg").value = ""; };
        $("#dc-cons").addEventListener("change", regAt); regAt();
        $("#f-dados").addEventListener("submit", async (e) => {
          e.preventDefault();
          const d = { nome_completo: $("#dc-nome").value.trim(), nacionalidade: $("#dc-nac").value.trim(), estado_civil: $("#dc-civ").value, profissao: $("#dc-prof").value.trim(), data_nascimento: $("#dc-nasc").value || null,
            cpf: $("#dc-cpf").value.trim(), rg: $("#dc-rg").value.trim(), rg_orgao: $("#dc-rgo").value.trim(), endereco: $("#dc-end").value.trim(), cidade: $("#dc-cid").value.trim(), cep: $("#dc-cep").value.trim(),
            conselho: $("#dc-cons").value || null, registro_numero: $("#dc-reg").value.trim(), pix_tipo: $("#dc-pixt").value || null, pix_chave: $("#dc-pix").value.trim() };
          if (d.cpf && !cpfValido(d.cpf)) return toast("Confira o CPF: os dígitos não batem.", "err");
          const ok = await acao($("#dc-btn"), () => API.admissao.salvarDados(d), API.fichaCompleta(d) ? "Dados salvos e enviados para conferência." : "Dados salvos. Ainda faltam campos para completar o cadastro.");
          if (ok) { await ctx.recarregarSessao(); paginas.perfil.render(el, ctx); }
        });
        (async () => {
          const S = window.Sessao; if (!S || !(await S.bioDisponivel())) return;
          const sec = $("#sec-bio"), corpo = $("#bio-corpo"); sec.hidden = false;
          const desenhar = () => { const b = S.bio(), minha = b && b.perfil_id === p.id;
            corpo.innerHTML = `<p class="hint">${S.APP ? "No app, a tela bloqueia depois de 5 minutos sem uso." : "No navegador, a sessão termina por inatividade se você não marcou Manter conectado."} Com a biometria ativada, o app desbloqueia com o Face ID ou a digital do celular, sem digitar a senha. A digital e o rosto ficam só no aparelho: o site nunca os recebe.</p>
              ${minha ? `<p><span class="selo ok">ativada</span> desde ${data(b.em)}</p><button class="btn btn-ghost btn-sm" id="bio-off" type="button">Desativar neste aparelho</button>` : '<button class="btn btn-primary btn-sm" id="bio-on" type="button">Ativar Face ID ou digital</button>'}`;
            const on = $("#bio-on"), off = $("#bio-off");
            if (on) on.onclick = async () => { if (await acao(on, () => S.ativarBio(p), "Biometria ativada neste aparelho.")) desenhar(); };
            if (off) off.onclick = () => { S.desativarBio(); toast("Biometria desativada neste aparelho."); desenhar(); }; };
          desenhar();
        })();
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
    /* menu agrupado por assunto, seguindo o Estatuto e o Regimento: trabalho, conta, participação (órgãos sociais),
       transparência (prestação de contas), educação (5º princípio, Título XIII), índice, documentos e perfil */
    menu: [
      "inicio",
      { id: "trabalho", titulo: "Meu trabalho", itens: ["projetos", "horas", "experiencia"] },
      { id: "minha-conta", titulo: "Minha conta", itens: ["conta", "demonstrativos"] },
      { id: "participacao", titulo: "Participação", itens: ["assembleias", "propostas", "denuncia"] },
      { id: "transparencia-g", titulo: "Transparência", itens: ["transparencia", "mapa"] },
      { id: "educacao", titulo: "Educação", itens: ["formacao", "biblioteca"] },
      "indice",
      { id: "docs", titulo: "Documentos", itens: ["documentos", "livro"] },
      { id: "eu", titulo: "Perfil e ajuda", itens: ["perfil", "app", "manual"], separador: true }
    ],
    apelidos: { educacao: "formacao", leitura: "biblioteca", livros: "biblioteca" },
    async antes(ctx, el) {
      const p = ctx.sessao.perfil;
      if (p.status === "ativo") return false;
      if (["pendente", "entrevista", "aprovado"].includes(p.status)) { await window.Admissao.renderCandidato(el, ctx); return true; }
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
