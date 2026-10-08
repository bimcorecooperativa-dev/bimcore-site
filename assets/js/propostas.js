/* BIMCORE — Propostas e sugestões dos cooperados (Estatuto, art. 7º, II e §1º; art. 28, §1º)
   Todo cooperado propõe pautas, melhorias e mudanças; todos veem, apoiam e discutem.
   O Presidente (coordenação) ou o Conselho Fiscal avalia e responde; o que for adiante vira pauta de assembleia. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API;
  const { $, esc, data, dataHora, acao, confirmar, toast } = UI;
  const TIPO = { pauta: "Pauta para assembleia", melhoria: "Melhoria", mudanca: "Mudança nas regras (Estatuto, Regimento, tabela...)" };
  const ST = { enviada: ["enviada", "warn"], em_analise: ["em análise", "info"], aceita: ["aceita: vai para assembleia", "ok"], incluida: ["incluída em assembleia", "ok"], arquivada: ["arquivada", ""] };
  let filtro = "abertas";

  const gestor = (ctx) => { const p = ctx.sessao.perfil || {}; return p.status === "ativo" && (p.papel === "coordenacao" || !!p.conselho_fiscal); };
  const selo = (s) => { const [t, c] = ST[s] || [s, ""]; return `<span class="selo ${c}">${t}</span>`; };
  const dias = (iso) => Math.floor((Date.now() - new Date(iso)) / 86400000);

  async function contador(ctx) {
    if (!gestor(ctx)) return 0;
    const ps = await API.propostas.listar().catch(() => []); return ps.filter((p) => p.status === "enviada").length;
  }

  async function render(el, ctx) {
    const g = gestor(ctx), eu = ctx.sessao.perfil.id;
    const [ps, quadro] = await Promise.all([API.propostas.listar(), API.propostas.quadro().catch(() => 0)]);
    const umQuinto = Math.max(1, Math.ceil(quadro / 5));
    const abertas = (p) => ["enviada", "em_analise", "aceita"].includes(p.status);
    const lista = ps.filter((p) => filtro === "abertas" ? abertas(p) : filtro === "minhas" ? p.autor_id === eu : !abertas(p));
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Gestão democrática</p><h1>Propostas e sugestões</h1></div><button class="btn btn-primary" id="pr-nova">Enviar proposta</button></div>
      <p class="muted">Todo cooperado pode propor medidas de interesse da cooperativa (Estatuto, art. 7º, II). Sugira pautas para assembleia, melhorias ou mudanças nas regras. Todos podem ler, apoiar e comentar. O Presidente avalia e responde aqui. O que for adiante entra na ordem do dia de uma assembleia.</p>
      <div class="notice"><b>Bom saber.</b> Para ser votada numa assembleia, a proposta de um cooperado precisa ser apresentada com pelo menos 30 dias de antecedência e constar do edital (art. 7º, §1º). Se ${umQuinto} cooperado(s), 1/5 do quadro social de ${quadro}, apoiarem uma proposta e pedirem a convocação, o Presidente deve convocar a assembleia em até 15 dias (art. 28, §1º).</div>
      <nav class="subabas" role="tablist">${[["abertas", "Em aberto"], ["minhas", "Minhas"], ["encerradas", "Decididas"]].map(([k, t]) => `<button role="tab" data-f="${k}" aria-selected="${filtro === k}">${t}${k === "abertas" ? ` <span class="contador">${ps.filter(abertas).length}</span>` : ""}</button>`).join("")}</nav>
      <div class="asm-lista" id="pr-lista">${lista.length ? lista.map((p) => {
        const apoiei = p.apoios.some((a) => a.perfil_id === eu), n = p.apoios.length, quinto = n >= umQuinto;
        const quando5 = quinto ? p.apoios.map((a) => a.em).sort()[umQuinto - 1] : null;
        return `<article class="asm-card" data-id="${p.id}">
          <div class="asm-card-cab"><div><span class="eyebrow">${esc(TIPO[p.tipo] || p.tipo)}</span><h3>${esc(p.titulo)}</h3>
            <span class="muted">por ${esc(p.autor_nome || "—")} em ${data(p.criado_em)} · há ${dias(p.criado_em)} dia(s)</span></div>${selo(p.status)}</div>
          <p style="white-space:pre-line">${esc(p.descricao)}</p>
          ${p.justificativa ? `<p class="hint" style="white-space:pre-line"><b>Por quê:</b> ${esc(p.justificativa)}</p>` : ""}
          ${p.resposta ? `<div class="notice"><b>Resposta${p.respondido_nome ? " de " + esc(p.respondido_nome) : ""}${p.respondido_em ? " em " + data(p.respondido_em) : ""}:</b> ${esc(p.resposta)}</div>` : ""}
          ${quinto && abertas(p) ? `<div class="notice warn">Apoiada por 1/5 do quadro social desde ${data(quando5)}. Se os apoiadores pedirem a convocação, o Presidente tem 15 dias para convocar (art. 28, §1º).</div>` : ""}
          <div class="sol-acoes">
            ${p.status !== "arquivada" ? `<button class="btn ${apoiei ? "btn-primary" : "btn-ghost"} btn-sm" data-apoio="${p.id}">${apoiei ? "✓ Você apoia" : "Apoiar"}</button>` : ""}
            <span class="hint">${n} apoio(s)${n ? ": " + p.apoios.map((a) => esc(a.nome || "")).join(", ") : ""}</span>
            <button class="btn btn-ghost btn-sm" data-coment="${p.id}">Discussão (${p.n_comentarios})</button>
            ${p.autor_id === eu && p.status === "enviada" ? `<button class="btn btn-ghost btn-sm" data-editar="${p.id}">Editar</button><button class="btn btn-danger btn-sm" data-excluir="${p.id}">Excluir</button>` : ""}
            ${g && p.status !== "incluida" ? `<button class="btn btn-primary btn-sm" data-avaliar="${p.id}">Avaliar</button>` : ""}
          </div>
        </article>`;
      }).join("") : `<p class="vazio">${filtro === "minhas" ? "Você ainda não enviou propostas." : filtro === "abertas" ? "Nenhuma proposta em aberto." : "Nenhuma proposta decidida ainda."}</p>`}</div>`;

    const recarregar = () => render(el, ctx);
    $("#pr-nova").onclick = () => formProposta(null, recarregar);
    el.querySelectorAll("[data-f]").forEach((b) => { b.onclick = () => { filtro = b.dataset.f; recarregar(); }; });
    el.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const id = b.dataset.apoio || b.dataset.coment || b.dataset.editar || b.dataset.excluir || b.dataset.avaliar; const p = ps.find((x) => x.id === id); if (!p) return;
      if (b.dataset.apoio) { const ja = p.apoios.some((a) => a.perfil_id === eu); if (await acao(b, () => (ja ? API.propostas.desapoiar(id) : API.propostas.apoiar(id)), ja ? "Apoio retirado." : "Apoio registrado.")) recarregar(); return; }
      if (b.dataset.coment) return discussao(p, recarregar);
      if (b.dataset.editar) return formProposta(p, recarregar);
      if (b.dataset.excluir) { if (!(await confirmar("Excluir sua proposta?", "Excluir"))) return; if (await acao(b, () => API.propostas.excluir(id), "Proposta excluída.")) recarregar(); return; }
      if (b.dataset.avaliar) return avaliar(p, recarregar);
    };
  }

  function formProposta(p, aoSalvar) {
    const m = UI.modal(`<h2>${p ? "Editar proposta" : "Enviar proposta"}</h2>
      <p class="muted">Seja específico: o que você propõe, por que e, se souber, qual artigo do Estatuto ou do Regimento muda. Todos os cooperados vão ler.</p>
      <div class="form-grid">
        <div class="field"><label for="pp-tipo">Tipo</label><select class="input" id="pp-tipo">${Object.entries(TIPO).map(([k, t]) => `<option value="${k}" ${p && p.tipo === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field full"><label for="pp-tit">Título</label><input class="input" id="pp-tit" maxlength="200" value="${esc(p ? p.titulo : "")}" placeholder="Ex.: Criar um fundo para cursos de especialização"></div>
        <div class="field full"><label for="pp-desc">O que você propõe</label><textarea class="input" id="pp-desc" rows="5">${esc(p ? p.descricao : "")}</textarea></div>
        <div class="field full"><label for="pp-just">Por que (justificativa, opcional)</label><textarea class="input" id="pp-just" rows="3">${esc(p ? p.justificativa || "" : "")}</textarea></div>
      </div>
      <p class="hint">Você pode editar ou excluir enquanto ela não for avaliada.</p>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="pp-ok">${p ? "Salvar" : "Enviar"}</button></div>`);
    $("#pp-ok", m.el).onclick = async (e) => {
      const d = { tipo: $("#pp-tipo", m.el).value, titulo: $("#pp-tit", m.el).value.trim(), descricao: $("#pp-desc", m.el).value.trim(), justificativa: $("#pp-just", m.el).value.trim() || null };
      if (d.titulo.length < 3 || !d.descricao) return toast("Preencha o título e o que você propõe.", "err");
      if (await acao(e.currentTarget, () => (p ? API.propostas.editar(p.id, d) : API.propostas.enviar(d)), p ? "Proposta atualizada." : "Proposta enviada. Todos os cooperados já podem ver e apoiar.")) { m.fechar(); aoSalvar(); }
    };
  }

  async function discussao(p, aoFechar) {
    const m = UI.modal(`<h2>Discussão: ${esc(p.titulo)}</h2><div id="pc-lista" class="asm-msgs" style="max-height:50vh"></div>
      <form id="pc-f" class="asm-chat-f" novalidate><input class="input" id="pc-t" maxlength="2000" placeholder="Sua opinião" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">Comentar</button></form>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button></div>`, aoFechar);
    const carregar = async () => { const cs = await API.propostas.comentarios(p.id).catch(() => []); const box = $("#pc-lista", m.el); box.innerHTML = cs.length ? cs.map((c) => `<p class="asm-msg"><b>${esc(c.nome || "")}</b> <span class="hint">${dataHora(c.em)}</span><br>${esc(c.texto)}</p>`).join("") : '<p class="hint">Ninguém comentou ainda.</p>'; box.scrollTop = box.scrollHeight; };
    await carregar();
    $("#pc-f", m.el).onsubmit = async (e) => { e.preventDefault(); const t = $("#pc-t", m.el).value.trim(); if (!t) return; $("#pc-t", m.el).value = ""; try { await API.propostas.comentar(p.id, t); await carregar(); } catch (err) { toast(err.message || "Não foi possível comentar.", "err"); } };
  }

  async function avaliar(p, aoSalvar) {
    const as = (await API.assembleias.listar().catch(() => [])).filter((a) => a.status === "rascunho");
    const idade = dias(p.criado_em);
    const m = UI.modal(`<h2>Avaliar proposta</h2>
      <p><b>${esc(p.titulo)}</b><br><span class="muted">de ${esc(p.autor_nome || "")}, enviada em ${data(p.criado_em)} · ${p.apoios.length} apoio(s)</span></p>
      <div class="field"><label for="av-txt">Resposta ao cooperado (todos leem)</label><textarea class="input" id="av-txt" rows="4" placeholder="Explique a decisão.">${esc(p.resposta || "")}</textarea></div>
      <div class="sol-acoes">
        <button class="btn btn-ghost btn-sm" data-st="em_analise">Marcar em análise</button>
        <button class="btn btn-danger btn-sm" data-st="arquivada">Arquivar (não segue)</button>
        <button class="btn btn-primary btn-sm" data-st="aceita">Aceitar para assembleia</button>
      </div>
      <h3 class="mini-tit">Levar para assembleia agora</h3>
      <p class="hint">A proposta tem ${idade} dia(s). Para entrar como proposta do cooperado, a data da assembleia precisa ficar pelo menos 30 dias depois do envio (${data(new Date(new Date(p.criado_em).getTime() + 30 * 86400000).toISOString())}; art. 7º, §1º). Para um assunto urgente, convoque uma <b>Assembleia Geral Extraordinária</b> (art. 43) com a pauta assumida pela administração: o edital continua exigindo 10 dias de antecedência (art. 30).</p>
      <div class="sol-acoes">
        <button class="btn btn-primary btn-sm" id="av-nova">Convocar assembleia com esta pauta</button>
        ${as.length ? `<select class="input" id="av-asm" style="max-width:18rem">${as.map((a) => `<option value="${a.id}">${esc(a.titulo)} (${new Date(a.data_hora).toLocaleDateString("pt-BR")})</option>`).join("")}</select><button class="btn btn-ghost btn-sm" id="av-incluir">Incluir num rascunho existente</button>` : ""}
      </div>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button></div>`);
    const resp = () => $("#av-txt", m.el).value.trim();
    m.el.querySelectorAll("[data-st]").forEach((b) => { b.onclick = async () => {
      if (!resp()) return toast("Escreva a resposta ao cooperado.", "err");
      if (await acao(b, () => API.propostas.editar(p.id, { status: b.dataset.st, resposta: resp() }), "Avaliação registrada.")) { m.fechar(); aoSalvar(); }
    }; });
    $("#av-nova", m.el).onclick = () => { m.fechar(); window.Assembleias.convocar({ tipo: "extraordinaria", titulo: p.titulo.slice(0, 120), proposta: p, resposta: resp() || "Levada à assembleia." }, aoSalvar); };
    const inc = $("#av-incluir", m.el);
    if (inc) inc.onclick = async () => {
      const a = as.find((x) => x.id === $("#av-asm", m.el).value);
      const limite = new Date(p.criado_em).getTime() + 30 * 86400000;
      if (new Date(a.data_hora).getTime() < limite && !(await confirmar("A data dessa assembleia fica a menos de 30 dias do envio da proposta (art. 7º, §1º). Incluir mesmo assim, como pauta assumida pela administração?", "Incluir"))) return;
      if (await acao(inc, async () => {
        await API.assembleias.salvarPauta({ assembleia_id: a.id, ordem: (a.pautas || []).length + 1, titulo: p.titulo, descricao: `Proposta de ${p.autor_nome || "cooperado"}: ${p.descricao}`.slice(0, 400) });
        await API.propostas.editar(p.id, { status: "incluida", assembleia_id: a.id, resposta: resp() || `Incluída na ordem do dia de "${a.titulo}".` });
        return true;
      }, "Pauta incluída na assembleia.")) { m.fechar(); aoSalvar(); }
    };
  }

  window.Propostas = { render, contador };
})();
