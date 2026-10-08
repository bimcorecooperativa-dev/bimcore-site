/* BIMCORE — Assembleias online (Estatuto, arts. 28 a 40 e 42 a 45; Regimento, arts. 56 a 63)
   Convocação com edital, sala com presença identificada, quórum, videoconferência, chat, votação e ata. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API;
  const { $, esc, data, dataHora, acao, confirmar, toast } = UI;
  const EMPRESA = { nome: "BIMCORE COOPERATIVA DE TRABALHO", cnpj: "66.004.522/0001-70", cidade: "Araruama/RJ", site: "https://bimcore.com.br/painel.html#assembleias" };
  const TIPOS = { ordinaria: "Assembleia Geral Ordinária", extraordinaria: "Assembleia Geral Extraordinária", especial: "Assembleia Geral Especial", pre: "Pré-assembleia (consultiva)" };
  const ST = { rascunho: ["rascunho", ""], agendada: ["edital publicado", "info"], aberta: ["sala aberta", "warn"], instalada: ["em andamento", "ok"], encerrada: ["encerrada", ""], sem_quorum: ["não instalada: sem quórum", "err"], cancelada: ["cancelada", "err"] };
  const RES = { aprovada: ["aprovada", "ok"], rejeitada: ["rejeitada", "err"], adiada: ["adiada: abstenções acima de 50%", "warn"], consulta: ["consulta registrada", "info"] };
  const VOTO = { favor: "A favor", contra: "Contra", abstencao: "Abstenção" };
  let salaId = null, timer = null;

  const gestor = (ctx) => { const p = ctx.sessao.perfil || {}; return p.status === "ativo" && (p.papel === "coordenacao" || !!p.conselho_fiscal); };
  const quando = (iso) => { const d = new Date(iso); return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
  const falta = (iso) => {
    const ms = new Date(iso) - Date.now(); if (ms <= 0) return "agora";
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return d ? `em ${d} dia${d > 1 ? "s" : ""}` : h ? `em ${h} h ${m} min` : `em ${m} min`;
  };
  const selo = (s) => { const [t, c] = ST[s] || [s, ""]; return `<span class="selo ${c}">${t}</span>`; };
  const localDT = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const parar = () => { if (timer) { clearInterval(timer); timer = null; } };
  window.addEventListener("hashchange", () => { if (location.hash !== "#assembleias") parar(); });

  /* ---------- Edital (Estatuto, art. 33) ---------- */
  function textoEdital(a, pautas, n) {
    const tipo = TIPOS[a.tipo].toUpperCase();
    return `${EMPRESA.nome} — CNPJ ${EMPRESA.cnpj}
EDITAL DE CONVOCAÇÃO DA ${a.tipo === "pre" ? "PRÉ-ASSEMBLEIA" : tipo}

${a.convocante || "O Presidente da BIMCORE"}, no uso das atribuições do art. 28 do Estatuto Social, convoca os cooperados para a ${TIPOS[a.tipo]}, a realizar-se em ${quando(a.data_hora)}, em ambiente integralmente digital${a.plataforma ? ", pela plataforma " + a.plataforma : ""}, com acesso pela área do cooperado no site ${EMPRESA.site}, nos termos do art. 31 do Estatuto Social.

${a.tipo === "pre" ? "A pré-assembleia tem caráter consultivo, para socializar informações e amadurecer as decisões (Regimento Interno, art. 60)." : `A sessão terá duração mínima de ${Math.max(a.duracao_min, 120) / 60} horas para a conexão dos cooperados e a verificação do quórum, que será considerado a qualquer momento durante esse período (Estatuto, art. 30, §2º): 2/3 dos cooperados na primeira hora, metade mais um na segunda hora e, a partir da terceira hora, no mínimo 4 cooperados (art. 32).`}

ORDEM DO DIA
${pautas.map((p, i) => `${i + 1}. ${p.titulo}${p.descricao ? " — " + p.descricao : ""}${p.quorum === "dois_tercos" ? " (exige 2/3 dos presentes, art. 44, §1º)" : ""}`).join("\n")}

Número de cooperados na data deste edital: ${n} (art. 33, V). Não poderá votar o cooperado admitido após a publicação deste edital (art. 28, §3º). Cada cooperado tem direito a 1 (um) voto, pessoal e intransferível (art. 40). A sessão será gravada (art. 31, §1º, III).

${EMPRESA.cidade}, ${a.edital_publicado_em ? new Date(a.edital_publicado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "(data da publicação)"}.
${a.convocante || ""}`;
  }

  /* ---------- Ata (Estatuto, art. 39) ---------- */
  function rascunhoAta(d) {
    const a = d.assembleia, pres = d.presencas, q = a.instalada_convocacao;
    const linhas = [];
    linhas.push(`ATA DA ${(a.tipo === "pre" ? "PRÉ-ASSEMBLEIA" : TIPOS[a.tipo].toUpperCase())} DA ${EMPRESA.nome} — CNPJ ${EMPRESA.cnpj}`);
    linhas.push("");
    linhas.push(`Em ${quando(a.data_hora)}, reuniram-se em ambiente digital${a.plataforma ? " (" + a.plataforma + ")" : ""}, nos termos do art. 31 do Estatuto Social, os cooperados da BIMCORE, convocados por edital publicado em ${a.edital_publicado_em ? data(a.edital_publicado_em) : "—"}${a.convocacao_enviada_em ? " e comunicado por e-mail em " + data(a.convocacao_enviada_em) : ""}.`);
    if (a.status === "sem_quorum") {
      linhas.push(`Durante o período mínimo da sessão registraram presença ${pres.filter((x) => x.apto).length} cooperado(s) apto(s), de um total de ${a.membros_na_data || "—"}, número insuficiente para a instalação (Estatuto, art. 32). A assembleia não foi instalada e deverá ser feita nova convocação, com antecedência mínima de 10 dias úteis.`);
    } else {
      linhas.push(`Registraram presença pela plataforma, com identificação individual, ${pres.length} cooperado(s), dos quais ${a.instalada_presentes} apto(s) a votar, de um total de ${a.membros_na_data || "—"} cooperados na data do edital${q ? `, atingindo o quórum da ${q}ª convocação (art. 32)` : ""}. A assembleia foi instalada às ${hora(a.instalada_em)}.`);
      linhas.push("Presidiu os trabalhos [nome], que convidou [nome] para secretariar.");
      linhas.push("");
      linhas.push("ORDEM DO DIA E DELIBERAÇÕES");
      d.pautas.forEach((p, i) => {
        const r = p.resultado;
        linhas.push(`${i + 1}. ${p.titulo}.${p.descricao ? " " + p.descricao + "." : ""}`);
        if (!r) { linhas.push("   Não foi votada."); return; }
        linhas.push(`   Votação ${r.secreto ? "secreta" : "aberta"}${p.impedir_orgaos ? ", sem o voto dos membros dos órgãos de administração e fiscalização (arts. 37 e 42, §1º)" : ""}: ${r.favor} a favor, ${r.contra} contra, ${r.abstencao} abstenção(ões) e ${r.nao_votaram} sem voto, de ${r.aptos} aptos presentes. Resultado: ${RES[r.resultado] ? RES[r.resultado][0].toUpperCase() : r.resultado}${r.resultado === "adiada" ? " para apreciação em assembleia futura (art. 38, §3º)" : ""}.`);
        if (!r.secreto) {
          const vs = d.votos.filter((v) => v.pauta_id === p.id);
          if (vs.length) linhas.push("   Votos: " + vs.map((v) => `${v.nome} (${VOTO[v.voto] || "—"})`).join("; ") + ".");
        }
      });
      linhas.push("");
      linhas.push(`Nada mais havendo a tratar, a assembleia foi encerrada às ${hora(a.encerrada_em)}.${a.gravacao_url ? " A gravação integral integra a documentação desta ata (art. 39, §3º): " + a.gravacao_url : " A gravação integral integra a documentação desta ata (art. 39, §3º)."}`);
    }
    linhas.push("");
    linhas.push("PRESENTES (registro na plataforma)");
    pres.forEach((x) => linhas.push(`- ${x.nome} — entrada às ${hora(x.entrou_em)}${x.apto ? "" : " (sem direito a voto, admitido após o edital)"}`));
    linhas.push("");
    linhas.push("A ata é assinada eletronicamente pela plataforma, com identificação inequívoca dos signatários (art. 39, §2º).");
    return linhas.join("\n");
  }

  /* ---------- Anúncio no Início ---------- */
  async function anuncio() {
    const as = await API.assembleias.listar().catch(() => []);
    const vivas = as.filter((a) => ["agendada", "aberta", "instalada"].includes(a.status)).sort((x, y) => new Date(x.data_hora) - new Date(y.data_hora));
    if (!vivas.length) return "";
    return vivas.map((a) => {
      const ao = a.status === "aberta" || a.status === "instalada";
      return `<section class="painel asm-anuncio ${ao ? "ao-vivo" : ""}">
        <div class="asm-anuncio-in"><div>
          <span class="eyebrow">${ao ? "● Acontecendo agora" : "Assembleia convocada · " + falta(a.data_hora)}</span>
          <h2>${esc(TIPOS[a.tipo])}${a.titulo ? ": " + esc(a.titulo) : ""}</h2>
          <p class="muted">${esc(quando(a.data_hora))} · ordem do dia: ${a.pautas.map((p) => esc(p.titulo)).join("; ")}</p></div>
          <div class="asm-acoes"><a class="btn ${ao ? "btn-primary" : "btn-ghost"}" href="#assembleias" data-ir-sala="${a.id}">${ao ? "Entrar na assembleia" : "Ver edital e detalhes"}</a></div></div>
      </section>`;
    }).join("");
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-ir-sala]"); if (b) salaId = b.dataset.irSala; });

  async function sinal() {
    const as = await API.assembleias.listar().catch(() => []);
    if (as.some((a) => a.status === "aberta" || a.status === "instalada")) return { cor: "err", texto: "Assembleia acontecendo agora" };
    if (as.some((a) => a.status === "agendada")) return { cor: "warn", texto: "Assembleia convocada" };
    return null;
  }

  /* ---------- Lista ---------- */
  async function render(el, ctx) {
    parar(); el.onsubmit = null;
    if (salaId) return sala(el, ctx, salaId);
    const g = gestor(ctx);
    const as = await API.assembleias.listar();
    const grupo = (f) => as.filter(f).sort((x, y) => new Date(x.data_hora) - new Date(y.data_hora));
    const vivas = grupo((a) => ["aberta", "instalada"].includes(a.status));
    const prox = grupo((a) => a.status === "agendada");
    const rasc = grupo((a) => a.status === "rascunho");
    const ant = grupo((a) => ["encerrada", "sem_quorum", "cancelada"].includes(a.status)).reverse();
    const cartao = (a) => `<article class="asm-card">
      <div class="asm-card-cab"><div><span class="eyebrow">${esc(TIPOS[a.tipo])}</span><h3>${esc(a.titulo)}</h3><span class="muted">${esc(quando(a.data_hora))}${a.status === "agendada" ? " · " + falta(a.data_hora) : ""}</span></div>${selo(a.status)}</div>
      ${a.pautas.length ? `<ol class="asm-pautas">${a.pautas.map((p) => `<li>${esc(p.titulo)}${p.resultado ? ` <span class="selo ${RES[p.resultado.resultado][1]}">${RES[p.resultado.resultado][0]}</span>` : ""}</li>`).join("")}</ol>` : '<p class="hint">Sem pautas ainda.</p>'}
      ${a.status === "cancelada" && a.motivo_cancelamento ? `<p class="hint">Motivo: ${esc(a.motivo_cancelamento)}</p>` : ""}
      <div class="sol-acoes">
        ${["aberta", "instalada"].includes(a.status) ? `<button class="btn btn-primary btn-sm" data-sala="${a.id}">Entrar na sala</button>` : ""}
        ${a.status !== "rascunho" && a.status !== "cancelada" ? `<button class="btn btn-ghost btn-sm" data-edital="${a.id}">Edital</button>` : ""}
        ${["encerrada", "sem_quorum"].includes(a.status) ? `<button class="btn btn-ghost btn-sm" data-sala="${a.id}">${a.ata_publicada_em ? "Ata" : "Ata e assinaturas"}</button>` : ""}
        ${g && a.status === "rascunho" ? `<button class="btn btn-ghost btn-sm" data-editar="${a.id}">Editar e pautas</button><button class="btn btn-primary btn-sm" data-publicar="${a.id}">Publicar edital</button><button class="btn btn-danger btn-sm" data-excluir="${a.id}">Excluir</button>` : ""}
        ${g && a.status === "agendada" ? `<button class="btn btn-ghost btn-sm" data-convocar="${a.id}">Enviar convocação</button><button class="btn btn-primary btn-sm" data-abrir="${a.id}">Abrir a sala</button><button class="btn btn-danger btn-sm" data-cancelar="${a.id}">Cancelar</button>` : ""}
      </div>
      ${g && a.status === "agendada" ? `<p class="hint">${a.convocacao_enviada_em ? "Convocação enviada por e-mail em " + data(a.convocacao_enviada_em) + "." : "Lembre de enviar a convocação por e-mail a todos (art. 34) e pelo aplicativo de mensagens (RI, art. 61)."} A sala pode ser aberta 30 minutos antes do horário.</p>` : ""}
    </article>`;
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Gestão democrática</p><h1>Assembleias</h1></div>${g ? '<button class="btn btn-primary" id="asm-nova">Convocar assembleia</button>' : ""}</div>
      <p class="muted">A Assembleia Geral é o órgão supremo da cooperativa (Estatuto, art. 26). Aqui você vê os editais, participa ao vivo, vota as pautas e lê as atas. Cada cooperado tem 1 voto, pessoal e intransferível (art. 40).</p>
      ${vivas.length ? `<section class="painel"><h2>Acontecendo agora</h2><div class="asm-lista">${vivas.map(cartao).join("")}</div></section>` : ""}
      <section class="painel"><h2>Próximas</h2>${prox.length ? `<div class="asm-lista">${prox.map(cartao).join("")}</div>` : '<p class="vazio">Nenhuma assembleia convocada.</p>'}</section>
      ${g && rasc.length ? `<section class="painel"><h2>Rascunhos (só a gestão vê)</h2><div class="asm-lista">${rasc.map(cartao).join("")}</div></section>` : ""}
      ${ant.length ? `<section class="painel"><h2>Anteriores</h2><div class="asm-lista">${ant.map(cartao).join("")}</div></section>` : ""}`;

    const recarregar = () => render(el, ctx);
    const nova = $("#asm-nova"); if (nova) nova.onclick = () => formAssembleia(null, recarregar);
    el.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const id = b.dataset.sala || b.dataset.edital || b.dataset.editar || b.dataset.publicar || b.dataset.excluir || b.dataset.convocar || b.dataset.abrir || b.dataset.cancelar;
      const a = as.find((x) => x.id === id); if (!a) return;
      if (b.dataset.sala) { salaId = id; return render(el, ctx); }
      if (b.dataset.edital) return mostrarEdital(a);
      if (b.dataset.editar) return formAssembleia(a, recarregar);
      if (b.dataset.publicar) {
        if (!(await confirmar(`Publicar o edital? A partir daí, data, tipo e ordem do dia não mudam mais (Estatuto, art. 38). ${a.tipo === "pre" ? "" : "A data precisa estar a pelo menos 10 dias (art. 30)."}`, "Publicar edital"))) return;
        if (await acao(b, () => API.assembleias.publicarEdital(id), "Edital publicado. Agora envie a convocação a todos.")) recarregar(); return;
      }
      if (b.dataset.excluir) { if (!(await confirmar("Excluir este rascunho?", "Excluir"))) return; if (await acao(b, () => API.assembleias.excluir(id), "Rascunho excluído.")) recarregar(); return; }
      if (b.dataset.convocar) return convocar(a, recarregar);
      if (b.dataset.abrir) { if (await acao(b, () => API.assembleias.abrir(id), "Sala aberta. Os cooperados já podem entrar.")) { salaId = id; render(el, ctx); } return; }
      if (b.dataset.cancelar) {
        const m = UI.modal(`<h2>Cancelar assembleia</h2><div class="field"><label for="cc-mot">Motivo (aparece para todos)</label><input class="input" id="cc-mot" maxlength="200"></div>
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Voltar</button><button class="btn btn-danger btn-sm" id="cc-ok">Cancelar assembleia</button></div>`);
        $("#cc-ok", m.el).onclick = async (ev) => { const mot = $("#cc-mot", m.el).value.trim(); if (!mot) return toast("Informe o motivo.", "err"); if (await acao(ev.currentTarget, () => API.assembleias.cancelar(id, mot), "Assembleia cancelada.")) { m.fechar(); recarregar(); } };
      }
    };
  }

  /* ---------- Convocar / editar rascunho e pautas ---------- */
  function formAssembleia(a, aoSalvar) {
    const min = new Date(Date.now() + 10 * 86400000 + 3600000);
    const m = UI.modal(`<h2>${a ? "Editar assembleia" : "Convocar assembleia"}</h2>
      <p class="muted">Fica como rascunho até você publicar o edital. O edital precisa sair com pelo menos 10 dias de antecedência; o Regimento recomenda cerca de 20 (Estatuto, art. 30; RI, art. 61).</p>
      <div class="form-grid">
        <div class="field"><label for="as-tipo">Tipo</label><select class="input" id="as-tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${a && a.tipo === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label for="as-tit">Título</label><input class="input" id="as-tit" maxlength="120" value="${esc(a ? a.titulo : "")}" placeholder="Ex.: Aprovação do Plano Anual 2027"></div>
        <div class="field"><label for="as-dh">Data e hora</label><input class="input" id="as-dh" type="datetime-local" value="${a ? localDT(a.data_hora) : localDT(min.toISOString())}"></div>
        <div class="field"><label for="as-dur">Duração mínima (minutos)</label><input class="input" id="as-dur" type="number" min="120" step="30" value="${a ? a.duracao_min : 120}"><span class="hint">Digital: no mínimo 2 horas (art. 30, §2º).</span></div>
        <div class="field"><label for="as-plat">Plataforma de vídeo</label><input class="input" id="as-plat" maxlength="60" value="${esc(a ? a.plataforma || "" : "Google Meet")}"></div>
        <div class="field"><label for="as-link">Link da sala de vídeo</label><input class="input" id="as-link" type="url" value="${esc(a ? a.link_video || "" : "")}" placeholder="https://meet.google.com/..."></div>
        <div class="field full"><label for="as-conv">Quem convoca (nome e qualidade, vai no edital)</label><input class="input" id="as-conv" maxlength="120" value="${esc(a ? a.convocante || "" : "")}" placeholder="Ex.: Felipe Oliveira Gamboni, Presidente"></div>
      </div>
      ${a ? `<h3 class="mini-tit">Ordem do dia</h3><div id="as-pautas"></div>
        <div class="form-grid">
          <div class="field full"><label for="pa-tit">Nova pauta</label><input class="input" id="pa-tit" maxlength="200" placeholder="Ex.: Aprovação da Tabela de Referência Remuneratória 2027"></div>
          <div class="field full"><label for="pa-desc">Detalhes (opcional)</label><input class="input" id="pa-desc" maxlength="400"></div>
          <div class="field"><label for="pa-q">Aprovação exige</label><select class="input" id="pa-q"><option value="maioria">Maioria absoluta dos presentes (art. 38, §4º)</option><option value="dois_tercos">2/3 dos presentes: estatuto, fusão, dissolução etc. (art. 44)</option></select></div>
          <label class="ciente"><input type="checkbox" id="pa-imp"> <span>Membros da administração e do Conselho Fiscal não votam (prestação de contas ou assunto que lhes diga respeito, arts. 37 e 42, §1º)</span></label>
          <div class="full"><button class="btn btn-ghost btn-sm" id="pa-add" type="button">Adicionar pauta</button></div>
        </div>` : '<p class="hint">Depois de salvar, você inclui as pautas da ordem do dia.</p>'}
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-primary btn-sm" id="as-ok">Salvar</button></div>`, aoSalvar);
    let pautas = a ? (a.pautas || []).slice() : [];
    const desenharPautas = () => {
      const box = $("#as-pautas", m.el); if (!box) return;
      box.innerHTML = pautas.length ? `<ol class="asm-pautas">${pautas.map((p) => `<li>${esc(p.titulo)}${p.quorum === "dois_tercos" ? ' <span class="selo warn">2/3</span>' : ""}${p.impedir_orgaos ? ' <span class="selo">órgãos não votam</span>' : ""} <button class="btn btn-ghost btn-sm" data-delp="${p.id}" type="button">Remover</button></li>`).join("")}</ol>` : '<p class="hint">Nenhuma pauta ainda.</p>';
    };
    desenharPautas();
    const recarregarPautas = async () => { const lista = await API.assembleias.listar(); const x = lista.find((y) => y.id === a.id); pautas = x ? x.pautas : []; desenharPautas(); };
    m.el.addEventListener("click", async (e) => {
      const d = e.target.closest("[data-delp]"); if (d) { if (await acao(d, () => API.assembleias.excluirPauta(d.dataset.delp), "Pauta removida.")) recarregarPautas(); }
    });
    const add = $("#pa-add", m.el);
    if (add) add.onclick = async () => {
      const t = $("#pa-tit", m.el).value.trim(); if (!t) return toast("Escreva a pauta.", "err");
      const ok = await acao(add, () => API.assembleias.salvarPauta({ assembleia_id: a.id, ordem: pautas.length + 1, titulo: t, descricao: $("#pa-desc", m.el).value.trim() || null, quorum: $("#pa-q", m.el).value, impedir_orgaos: $("#pa-imp", m.el).checked }), "Pauta incluída.");
      if (ok) { $("#pa-tit", m.el).value = ""; $("#pa-desc", m.el).value = ""; $("#pa-imp", m.el).checked = false; recarregarPautas(); }
    };
    $("#as-ok", m.el).onclick = async (e) => {
      const dh = $("#as-dh", m.el).value; if (!dh) return toast("Informe data e hora.", "err");
      const d = { tipo: $("#as-tipo", m.el).value, titulo: $("#as-tit", m.el).value.trim(), data_hora: new Date(dh).toISOString(), duracao_min: Math.max(120, Number($("#as-dur", m.el).value) || 120),
        plataforma: $("#as-plat", m.el).value.trim() || null, link_video: $("#as-link", m.el).value.trim() || null, convocante: $("#as-conv", m.el).value.trim() || null };
      if (!d.titulo) return toast("Dê um título.", "err");
      if (d.tipo !== "pre" && new Date(d.data_hora) < new Date(Date.now() + 10 * 86400000)) toast("Atenção: para publicar o edital, a data precisa estar a pelo menos 10 dias.", "err");
      if (a) d.id = a.id;
      const ok = await acao(e.currentTarget, () => API.assembleias.salvar(d), a ? "Assembleia atualizada." : "Rascunho criado. Agora inclua as pautas.");
      if (ok) {
        m.fechar();
        if (!a) { const lista = await API.assembleias.listar(); const novo = lista.filter((x) => x.status === "rascunho" && x.titulo === d.titulo).sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0]; if (novo) formAssembleia(novo, aoSalvar); }
      }
    };
  }

  function mostrarEdital(a) {
    const txt = textoEdital(a, a.pautas, a.membros_na_data || "—");
    const m = UI.modal(`<h2>Edital de convocação</h2><pre class="asm-edital">${esc(txt)}</pre>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-ghost btn-sm" id="ed-copiar">Copiar texto</button><button class="btn btn-primary btn-sm permitido" id="ed-imp">Imprimir ou salvar em PDF</button></div>`);
    $("#ed-copiar", m.el).onclick = async () => { try { await navigator.clipboard.writeText(txt); toast("Texto copiado."); } catch (e) { toast("Selecione e copie o texto.", "err"); } };
    $("#ed-imp", m.el).onclick = () => { const w = window.open("", "_blank"); if (!w) return toast("Permita pop-ups para imprimir.", "err"); w.document.write(`<!doctype html><meta charset="utf-8"><title>Edital</title><style>body{font:13px/1.6 Georgia,serif;margin:40px;white-space:pre-wrap;max-width:720px}</style>${esc(txt)}<script>onload=()=>print()<\/script>`); w.document.close(); };
  }

  async function convocar(a, aoSalvar) {
    const d = await API.assembleias.obter(a.id);
    const emails = d.membros.map((x) => x.email).filter(Boolean);
    const txt = textoEdital(d.assembleia, d.pautas, d.assembleia.membros_na_data || emails.length);
    const assunto = `Convocação: ${TIPOS[a.tipo]} em ${new Date(a.data_hora).toLocaleDateString("pt-BR")}`;
    const curto = `${assunto} às ${hora(a.data_hora)}.\nOrdem do dia: ${d.pautas.map((p, i) => `${i + 1}) ${p.titulo}`).join("; ")}.\nEdital completo e sala: ${EMPRESA.site}`;
    const m = UI.modal(`<h2>Enviar convocação</h2>
      <p class="muted">A convocação é feita primeiro por e-mail a todos os cooperados, e a data do envio vale como data da notificação (Estatuto, art. 34). O Regimento pede também o aplicativo de mensagens (art. 61).</p>
      <ol class="asm-passos">
        <li><b>E-mail.</b> Copie o edital, abra o e-mail com os ${emails.length} cooperados em cópia oculta e cole o texto no corpo. <div class="sol-acoes"><button class="btn btn-ghost btn-sm" id="cv-copiar">Copiar edital</button><a class="btn btn-ghost btn-sm" href="mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(assunto)}">Abrir e-mail</a></div></li>
        <li><b>WhatsApp.</b> <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(curto)}">Compartilhar no WhatsApp</a></li>
        <li><b>Registrar.</b> Depois de enviar o e-mail, marque abaixo. A data entra na ata.</li>
      </ol>
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-primary btn-sm" id="cv-ok">${a.convocacao_enviada_em ? "Atualizar data do envio para hoje" : "Marcar convocação como enviada hoje"}</button></div>`, aoSalvar);
    $("#cv-copiar", m.el).onclick = async () => { try { await navigator.clipboard.writeText(txt); toast("Edital copiado. Cole no corpo do e-mail."); } catch (e) { toast("Não consegui copiar; use o botão Edital e copie de lá.", "err"); } };
    $("#cv-ok", m.el).onclick = async (e) => { if (await acao(e.currentTarget, () => API.assembleias.salvar({ id: a.id, convocacao_enviada_em: new Date().toISOString() }), "Envio registrado.")) m.fechar(); };
  }

  /* ---------- Sala ---------- */
  async function sala(el, ctx, id) {
    const g = gestor(ctx), eu = ctx.sessao.perfil.id;
    let d = await API.assembleias.obter(id);
    const ativa = () => ["aberta", "instalada"].includes(d.assembleia.status);
    el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow"><a href="#assembleias" id="asm-voltar">← Assembleias</a></p><h1 id="sa-tit"></h1></div><div id="sa-st"></div></div>
      <div class="asm-sala">
        <div class="asm-col">
          <section class="painel" id="sa-topo"></section>
          <section class="painel" id="sa-pautas"></section>
          <section class="painel" id="sa-ata"></section>
        </div>
        <aside class="asm-col">
          <section class="painel" id="sa-video"></section>
          <section class="painel" id="sa-pres"></section>
          <section class="painel asm-chat" id="sa-chat"><h2>Chat</h2><div class="asm-msgs" id="sa-msgs"></div>
            <form id="sa-cf" class="asm-chat-f" novalidate><input class="input" id="sa-ct" maxlength="1000" placeholder="Escreva e tecle Enter" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">Enviar</button></form></section>
        </aside>
      </div>`;
    $("#asm-voltar").onclick = (e) => { e.preventDefault(); salaId = null; parar(); render(el, ctx); };

    const desenhar = () => {
      const a = d.assembleia, q = d.quorum || {}, presente = d.presencas.some((x) => x.perfil_id === eu), minha = d.presencas.find((x) => x.perfil_id === eu);
      $("#sa-tit").textContent = `${TIPOS[a.tipo]}: ${a.titulo}`;
      $("#sa-st").innerHTML = selo(a.status);
      // topo: horário, quórum, comandos
      const pct = q.necessario ? Math.min(100, (q.presentes / q.necessario) * 100) : 0;
      $("#sa-topo").innerHTML = `
        <p class="muted">${esc(quando(a.data_hora))} · edital de ${a.edital_publicado_em ? data(a.edital_publicado_em) : "—"} · ${a.membros_na_data || "—"} cooperados na data do edital ${a.status !== "rascunho" ? '<button class="btn btn-ghost btn-sm" id="sa-edital">Ver edital</button>' : ""}</p>
        ${a.status === "agendada" ? `<div class="notice">A sala abre 30 minutos antes do horário (${falta(a.data_hora)}). Quando abrir, registre aqui a sua presença: é ela que conta para o quórum e libera o seu voto.</div>` : ""}
        ${a.tipo !== "pre" && ["aberta", "agendada"].includes(a.status) ? `<div class="asm-quorum"><div><b>${q.presentes || 0}</b> presentes aptos de <b>${q.necessario || "—"}</b> necessários (${q.convocacao || 1}ª convocação)</div><div class="barra"><i style="width:${pct}%"></i></div>
          <p class="hint">Digital: 2/3 na 1ª hora, metade + 1 na 2ª, mínimo de 4 a partir da 3ª, contando a partir de ${hora(a.data_hora)} (Estatuto, arts. 30, §2º, e 32).</p></div>` : ""}
        ${a.status === "instalada" ? `<p><span class="selo ok">Instalada às ${hora(a.instalada_em)}</span> com ${a.instalada_presentes} presentes aptos${a.instalada_convocacao ? `, quórum da ${a.instalada_convocacao}ª convocação` : ""}.</p>` : ""}
        ${a.status === "sem_quorum" ? '<div class="notice">A assembleia não foi instalada por falta de quórum. É preciso nova convocação com pelo menos 10 dias úteis (art. 32).</div>' : ""}
        ${a.status === "encerrada" ? `<p>Encerrada às ${hora(a.encerrada_em)}.</p>` : ""}
        ${ativa() && !presente ? '<div class="sol-acoes"><button class="btn btn-primary" id="sa-entrar">Registrar minha presença e entrar</button></div><p class="hint">Sua presença é registrada com o seu login, o que identifica você para o quórum e para a votação (art. 31, §1º, I).</p>' : ""}
        ${minha ? `<p class="hint">Você está presente desde ${hora(minha.entrou_em)}${minha.apto ? "" : ". Você foi admitido depois do edital: participa e fala, mas não vota nesta assembleia (art. 28, §3º)"}.</p>` : ""}
        ${g ? `<div class="sol-acoes">
          ${a.status === "aberta" ? '<button class="btn btn-primary btn-sm" id="sa-instalar">Instalar a assembleia</button><button class="btn btn-danger btn-sm" id="sa-semq">Encerrar sem quórum</button>' : ""}
          ${a.status === "instalada" ? '<button class="btn btn-danger btn-sm" id="sa-encerrar">Encerrar a assembleia</button>' : ""}
        </div>` : ""}`;
      // vídeo
      $("#sa-video").innerHTML = `<h2>Videoconferência</h2>
        ${a.link_video ? `<a class="btn btn-primary" href="${esc(a.link_video)}" target="_blank" rel="noopener">Abrir a sala de vídeo${a.plataforma ? " (" + esc(a.plataforma) + ")" : ""}</a>` : '<p class="vazio">O link da sala de vídeo ainda não foi informado.</p>'}
        <p class="hint">O vídeo abre em outra aba; mantenha esta página aberta para presença, votação e chat. A sessão é gravada integralmente (art. 31, §1º, III).</p>
        ${g && !["encerrada", "sem_quorum", "cancelada"].includes(a.status) ? `<form id="sa-lf" class="asm-chat-f" novalidate><input class="input" id="sa-link" type="url" placeholder="Link da sala de vídeo" value="${esc(a.link_video || "")}"><button class="btn btn-ghost btn-sm" type="submit">Salvar link</button></form>` : ""}
        ${a.gravacao_url ? `<p><a href="${esc(a.gravacao_url)}" target="_blank" rel="noopener">Gravação da assembleia</a></p>` : ""}`;
      // presença
      $("#sa-pres").innerHTML = `<h2>Presentes <span class="contador">${d.presencas.length}</span></h2>
        ${d.presencas.length ? `<ul class="asm-presentes">${d.presencas.map((x) => `<li>${esc(x.nome)}<span class="sub">${hora(x.entrou_em)}${x.apto ? "" : " · sem voto"}${x.orgao ? " · órgão" : ""}</span></li>`).join("")}</ul>` : '<p class="vazio">Ninguém entrou ainda.</p>'}`;
      // pautas
      const votoMeu = (p) => d.votantes.some((v) => v.pauta_id === p.id && v.perfil_id === eu);
      const podeVotar = (p) => minha && minha.apto && !(p.impedir_orgaos && minha.orgao);
      $("#sa-pautas").innerHTML = `<h2>Ordem do dia</h2>${d.pautas.map((p, i) => {
        const r = p.resultado, nv = d.votantes.filter((v) => v.pauta_id === p.id).length;
        const aptos = d.presencas.filter((x) => x.apto && !(p.impedir_orgaos && x.orgao)).length;
        const meus = d.votos.filter((v) => v.pauta_id === p.id && v.perfil_id === eu)[0];
        return `<article class="asm-pauta ${p.status === "em_votacao" ? "votando" : ""}">
          <div class="asm-card-cab"><div><b>${i + 1}. ${esc(p.titulo)}</b>${p.descricao ? `<span class="sub">${esc(p.descricao)}</span>` : ""}
            <span class="sub">${p.quorum === "dois_tercos" ? "Exige 2/3 dos presentes aptos" : "Maioria absoluta dos presentes aptos"}${p.impedir_orgaos ? " · administração e Conselho Fiscal não votam" : ""}${p.status !== "aguardando" ? (p.voto_secreto ? " · voto secreto" : " · voto aberto") : ""}</span></div>
            ${p.status === "em_votacao" ? '<span class="selo warn">votação aberta</span>' : r ? `<span class="selo ${RES[r.resultado][1]}">${RES[r.resultado][0]}</span>` : '<span class="selo">aguardando</span>'}</div>
          ${p.status === "em_votacao" ? `<p class="hint">${nv} de ${aptos} aptos já votaram.</p>
            ${votoMeu(p) ? `<p><span class="selo ok">Seu voto foi registrado${meus && meus.voto ? ": " + VOTO[meus.voto] : ""}</span></p>`
              : podeVotar(p) ? `<div class="asm-votar">${Object.entries(VOTO).map(([k, t]) => `<button class="btn ${k === "favor" ? "btn-primary" : k === "contra" ? "btn-danger" : "btn-ghost"}" data-votar="${p.id}" data-voto="${k}">${t}</button>`).join("")}</div>`
              : `<p class="hint">${!minha ? "Registre sua presença para votar." : !minha.apto ? "Você não vota nesta assembleia." : "Você não vota nesta pauta."}</p>`}
            ${g ? `<button class="btn btn-ghost btn-sm" data-encp="${p.id}">Encerrar votação e apurar</button>` : ""}` : ""}
          ${p.status === "aguardando" && g && a.status === "instalada" ? `<div class="sol-acoes"><label class="ciente" style="margin:0"><input type="checkbox" data-sec="${p.id}"> <span>Voto secreto (se a assembleia decidiu assim, art. 40, §2º)</span></label><button class="btn btn-primary btn-sm" data-abrirp="${p.id}">Abrir votação</button></div>` : ""}
          ${r ? `<div class="asm-res"><span>A favor <b>${r.favor}</b></span><span>Contra <b>${r.contra}</b></span><span>Abstenções <b>${r.abstencao}</b></span><span>Sem voto <b>${r.nao_votaram}</b></span><span>Aptos <b>${r.aptos}</b></span><span>Necessário <b>${r.necessario}</b></span></div>
            ${!r.secreto ? `<p class="hint">${d.votos.filter((v) => v.pauta_id === p.id).map((v) => `${esc(v.nome)}: ${VOTO[v.voto] || "—"}`).join(" · ")}</p>` : ""}` : ""}
        </article>`;
      }).join("")}
      ${a.status === "instalada" ? '<p class="hint">Só se delibera sobre o que está no edital. Outros assuntos podem ser discutidos no fim, mas a decisão exige nova assembleia (art. 38, §1º). Se as abstenções passarem de 50% dos presentes, a pauta é adiada (art. 38, §3º).</p>' : ""}`;
      // chat
      const box = $("#sa-msgs"), noFim = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
      box.innerHTML = d.chat.length ? d.chat.map((c) => `<p class="asm-msg ${c.perfil_id === eu ? "minha" : ""}"><b>${esc(c.nome || "")}</b> <span class="hint">${hora(c.em)}</span><br>${esc(c.texto)}</p>`).join("") : '<p class="hint">Sem mensagens.</p>';
      if (noFim) box.scrollTop = box.scrollHeight;
      $("#sa-cf").style.display = ativa() && presente ? "" : "none";
      // ata
      const enc = ["encerrada", "sem_quorum"].includes(a.status);
      $("#sa-ata").style.display = enc ? "" : "none";
      if (enc) {
        const assinei = d.assinaturas.some((x) => x.perfil_id === eu);
        $("#sa-ata").innerHTML = `<h2>Ata ${a.ata_publicada_em ? `<span class="selo ok">publicada em ${data(a.ata_publicada_em)}</span>` : '<span class="selo warn">em elaboração</span>'}</h2>
          ${!a.ata_publicada_em ? `<p class="hint">Publique em até 10 dias, com acesso a todos os cooperados (RI, art. 63). Assinam a mesa, os administradores e conselheiros fiscais presentes e uma comissão de até 5 cooperados escolhida pela assembleia (art. 39, §1º).</p>` : ""}
          ${g && !a.ata_publicada_em ? `<textarea class="input asm-ata-txt" id="sa-atatxt" rows="16">${esc(a.ata || "")}</textarea>
            <div class="form-grid"><div class="field full"><label for="sa-grav">Link da gravação (guardar por 5 anos, art. 31, §1º, III)</label><input class="input" id="sa-grav" type="url" value="${esc(a.gravacao_url || "")}"></div></div>
            <div class="sol-acoes"><button class="btn btn-ghost btn-sm" id="sa-gerar">${a.ata ? "Gerar de novo a partir dos registros" : "Gerar rascunho a partir dos registros"}</button><button class="btn btn-primary btn-sm" id="sa-salvarata">Salvar ata</button>${d.assinaturas.length && a.ata ? '<button class="btn btn-primary btn-sm" id="sa-pubata">Publicar ata</button>' : ""}</div>`
            : a.ata ? `<pre class="asm-edital">${esc(a.ata)}</pre>` : '<p class="vazio">A ata ainda não foi redigida.</p>'}
          <h3 class="mini-tit">Assinaturas eletrônicas (art. 39, §2º)</h3>
          ${d.assinaturas.length ? `<ul class="asm-presentes">${d.assinaturas.map((x) => `<li>${esc(x.nome)}<span class="sub">${esc(x.qualidade)} · ${dataHora(x.em)}</span></li>`).join("")}</ul>` : '<p class="hint">Nenhuma assinatura ainda.</p>'}
          ${!a.ata_publicada_em && a.ata && presente ? `<div class="sol-acoes"><select class="input" id="sa-qual" style="max-width:20rem">${["Presidente (mesa)", "Secretário(a) (mesa)", "Administrador(a)", "Conselheiro(a) fiscal", "Comissão de assinatura", "Cooperado(a) presente"].map((x) => `<option>${x}</option>`).join("")}</select><button class="btn btn-primary btn-sm" id="sa-assinar">${assinei ? "Assinar de novo" : "Assinar a ata"}</button></div>` : ""}
          ${a.ata_publicada_em ? `<div class="sol-acoes"><button class="btn btn-ghost btn-sm permitido" id="sa-impata">Imprimir ou salvar em PDF</button></div>` : ""}`;
      }
    };
    desenhar();

    const atualizar = async () => { try { d = await API.assembleias.obter(id); const foco = document.activeElement && document.activeElement.id; if (foco === "sa-atatxt" || foco === "sa-grav") return; desenhar(); } catch (e) {} };
    if (ativa() || d.assembleia.status === "agendada") timer = setInterval(() => { if (!document.body.contains(el) || location.hash !== "#assembleias") return parar(); atualizar(); }, 4000);

    el.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const fazer = async (fn, msg) => { if (await acao(b, fn, msg)) { d = await API.assembleias.obter(id); desenhar(); if (!timer && ativa()) timer = setInterval(atualizar, 4000); } };
      if (b.id === "sa-edital") return mostrarEdital({ ...d.assembleia, pautas: d.pautas });
      if (b.id === "sa-entrar") return fazer(() => API.assembleias.entrar(id), "Presença registrada.");
      if (b.id === "sa-instalar") return fazer(() => API.assembleias.instalar(id), "Assembleia instalada. Abra a votação de cada pauta.");
      if (b.id === "sa-semq") { if (!(await confirmar("Encerrar sem quórum? A assembleia não será instalada e precisará de nova convocação.", "Encerrar sem quórum"))) return; return fazer(() => API.assembleias.encerrar(id, true), "Assembleia encerrada sem quórum."); }
      if (b.id === "sa-encerrar") { if (!(await confirmar("Encerrar a assembleia? Depois disso não há mais votação nem chat.", "Encerrar"))) return; parar(); return fazer(() => API.assembleias.encerrar(id, false), "Assembleia encerrada. Agora redija e publique a ata."); }
      if (b.dataset.abrirp) { const sec = el.querySelector(`[data-sec="${b.dataset.abrirp}"]`); return fazer(() => API.assembleias.pautaAbrir(b.dataset.abrirp, sec && sec.checked), "Votação aberta."); }
      if (b.dataset.votar) { if (!(await confirmar(`Confirmar voto: ${VOTO[b.dataset.voto]}? Depois de registrado, o voto não muda.`, "Confirmar voto"))) return; return fazer(() => API.assembleias.votar(b.dataset.votar, b.dataset.voto), "Voto registrado."); }
      if (b.dataset.encp) { if (!(await confirmar("Encerrar a votação desta pauta e apurar o resultado?", "Encerrar e apurar"))) return; return fazer(() => API.assembleias.pautaEncerrar(b.dataset.encp), "Votação apurada."); }
      if (b.id === "sa-gerar") { $("#sa-atatxt").value = rascunhoAta(d); toast("Rascunho gerado. Complete os nomes da mesa e salve."); return; }
      if (b.id === "sa-salvarata") return fazer(() => API.assembleias.salvar({ id, ata: $("#sa-atatxt").value, gravacao_url: $("#sa-grav").value.trim() || null }), "Ata salva. Agora os presentes podem assinar.");
      if (b.id === "sa-assinar") return fazer(() => API.assembleias.assinar(id, $("#sa-qual").value), "Ata assinada.");
      if (b.id === "sa-pubata") { if (!(await confirmar("Publicar a ata para todos os cooperados? Depois de publicada ela não muda.", "Publicar ata"))) return; return fazer(() => API.assembleias.publicarAta(id), "Ata publicada."); }
      if (b.id === "sa-impata") { const w = window.open("", "_blank"); if (!w) return toast("Permita pop-ups para imprimir.", "err"); w.document.write(`<!doctype html><meta charset="utf-8"><title>Ata</title><style>body{font:13px/1.6 Georgia,serif;margin:40px;white-space:pre-wrap;max-width:720px}</style>${esc(d.assembleia.ata)}\n\nASSINATURAS ELETRÔNICAS\n${d.assinaturas.map((x) => `${esc(x.nome)} — ${esc(x.qualidade)} — ${dataHora(x.em)}`).join("\n")}<script>onload=()=>print()<\/script>`); w.document.close(); }
    };
    el.onsubmit = async (e) => {
      if (e.target.id === "sa-cf") {
        e.preventDefault(); const t = $("#sa-ct").value.trim(); if (!t) return;
        $("#sa-ct").value = "";
        try { await API.assembleias.enviarChat(id, t); d.chat = await API.assembleias.chat(id); desenhar(); const box = $("#sa-msgs"); box.scrollTop = box.scrollHeight; } catch (err) { toast(err.message || "Não foi possível enviar.", "err"); }
      }
      if (e.target.id === "sa-lf") {
        e.preventDefault(); const l = $("#sa-link").value.trim();
        if (await acao(e.target.querySelector("button"), () => API.assembleias.salvar({ id, link_video: l || null }), "Link salvo.")) { d = await API.assembleias.obter(id); desenhar(); }
      }
    };
  }

  window.Assembleias = { render, anuncio, sinal, textoEdital, rascunhoAta };
})();
