/* BIMCORE — Admissão de cooperados e Livro de Matrícula
   Lei 5.764/1971, arts. 4º, 22, 23 e 29; Estatuto, arts. 3º e 4º; Regimento Interno, arts. 16 a 20.
   Candidato: ficha cadastral → documentos → leitura e declaração → análise do CA → quotas e aceite do termo.
   CA/coordenação: decisão com a data da reunião → registro no Livro de Matrícula (ativa o cooperado).
   Quem já é cooperado e só criou a conta no site é vinculado à matrícula existente, sem nova adesão. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API;
  const { $, esc, data, dataHora, moeda, acao, confirmar, toast, bytes } = UI;
  const QUOTAS = 10, QUOTA = 50;
  const TIPOS_DOC = { identidade: "Documento de identidade (RG ou CNH)", cpf: "CPF (se não estiver no documento de identidade)", residencia: "Comprovante de residência", tecnico: "Registro profissional ou diploma (quando houver)" };
  const OBRIGATORIOS = ["identidade", "residencia"];
  const CAMPOS = [
    ["nome_completo", "Nome completo", "text", true], ["nacionalidade", "Nacionalidade", "text", true], ["estado_civil", "Estado civil", "estado", true],
    ["profissao", "Profissão", "text", true], ["data_nascimento", "Data de nascimento", "date", true], ["cpf", "CPF", "cpf", true],
    ["rg", "RG (número)", "text", true], ["rg_orgao", "Órgão emissor do RG", "text", false], ["endereco", "Endereço completo", "text", true], ["cep", "CEP", "cep", true]
  ];
  const ESTADOS = ["solteiro(a)", "casado(a)", "união estável", "divorciado(a)", "separado(a)", "viúvo(a)"];
  const soDig = (v) => String(v || "").replace(/\D/g, "");
  const fmtCpf = (v) => { const d = soDig(v).slice(0, 11); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : v; };
  const fmtCep = (v) => { const d = soDig(v).slice(0, 8); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v; };
  function cpfValido(v) {
    const d = soDig(v); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  const fichaCompleta = (f) => !!f && CAMPOS.every(([k, , , req]) => !req || String(f[k] || "").trim()) && cpfValido(f.cpf);
  const docsOk = (f) => !!f && OBRIGATORIOS.every((t) => (f.docs || []).some((d) => d.tipo === t));
  const qualificacao = (f) => `${esc(f.nome_completo)}, ${esc(f.nacionalidade)}, ${esc(f.estado_civil)}, ${esc(f.profissao)}, inscrito(a) no CPF sob o nº ${esc(fmtCpf(f.cpf))}, portador(a) do RG nº ${esc(f.rg)}${f.rg_orgao ? " " + esc(f.rg_orgao) : ""}, residente em ${esc(f.endereco)}, CEP ${esc(fmtCep(f.cep))}`;
  const formaTxt = (f) => f.forma_integralizacao === "parcelado" ? `em ${f.parcelas || 1} parcela(s) descontada(s) das minhas retiradas, conforme o art. 19, §1º, do Regimento Interno` : "à vista, por Pix à cooperativa, logo após o registro da matrícula";

  /* ===================== Candidato ===================== */
  async function renderCandidato(el, ctx) {
    const p = ctx.sessao.perfil;
    const [f0, docsLeitura] = await Promise.all([API.admissao.minhaFicha().catch(() => null), API.documentos.listar().catch(() => [])]);
    const f = f0 || { docs: [] };
    const recarregar = () => renderCandidato(el, ctx);
    const nome1 = esc((p.nome || "").split(" ")[0]);
    const passo = (n, titulo, feito, atual, corpo) => `<section class="painel adm-passo ${feito ? "feito" : ""} ${atual ? "atual" : ""}">
        <div class="painel-cab"><h2><span class="adm-num">${feito ? "✓" : n}</span> ${titulo}</h2>${feito ? '<span class="selo ok">concluído</span>' : atual ? '<span class="selo warn">sua vez</span>' : ""}</div>${corpo}</section>`;
    const ok1 = fichaCompleta(f), ok2 = docsOk(f), ok3 = !!f.declaracao_em, aprovado = p.status === "aprovado", ok5 = !!f.aceite_matricula_em;
    const leitura = docsLeitura.filter((d) => ["Estatuto e atas", "Regimentos e manuais"].includes(d.categoria));

    const corpo1 = `<p class="hint">Dados para a Ficha Cadastral de Matrícula (Estatuto, art. 4º; Regimento, art. 17, I). Ficam visíveis só para você, para o Conselho de Administração e para a coordenação.</p>
      <form id="adm-ficha" class="form-grid" novalidate>${CAMPOS.map(([k, rot, tipo, req]) => `<div class="field ${k === "endereco" ? "full" : ""}"><label for="af-${k}">${rot}${req ? "" : " (opcional)"}</label>
        ${tipo === "estado" ? `<select class="input" id="af-${k}"><option value="">Escolha</option>${ESTADOS.map((e) => `<option ${f[k] === e ? "selected" : ""}>${e}</option>`).join("")}</select>`
          : `<input class="input" id="af-${k}" type="${tipo === "date" ? "date" : "text"}" ${tipo === "cpf" || tipo === "cep" ? 'inputmode="numeric"' : ""} value="${esc(tipo === "cpf" ? fmtCpf(f[k] || "") : tipo === "cep" ? fmtCep(f[k] || "") : f[k] || (k === "nome_completo" ? p.nome || "" : ""))}">`}</div>`).join("")}
        <div class="full"><button class="btn btn-primary" type="submit" id="af-ok">Salvar ficha</button></div></form>`;
    const corpo2 = `<p class="hint">Envie em PDF ou foto (PNG ou JPG, até 10 MB cada). Regimento, art. 17, I e II.</p>
      <ul class="adm-docs">${Object.entries(TIPOS_DOC).map(([t, rot]) => { const ds = (f.docs || []).filter((d) => d.tipo === t); return `<li><div><b>${rot}</b>${OBRIGATORIOS.includes(t) ? "" : ' <span class="hint">recomendado</span>'}
          ${ds.map((d) => `<span class="sub">${esc(d.nome)} · ${bytes(d.tamanho || 0)} <button class="link-botao" data-ver-doc="${esc(d.caminho)}">abrir</button> <button class="link-botao" data-rm-doc="${esc(d.caminho)}">remover</button></span>`).join("")}</div>
          <label class="btn btn-ghost btn-sm">Enviar<input type="file" accept="application/pdf,image/png,image/jpeg" data-enviar="${t}" hidden></label></li>`; }).join("")}</ul>`;
    const corpo3 = `<p class="hint">Antes de decidir entrar, leia os documentos que regem a cooperativa (Estatuto, art. 4º, §1º; Regimento, art. 17, III).</p>
      ${leitura.length ? `<div class="docs">${leitura.map((d) => `<div class="doc"><div><b>${esc(d.titulo)}</b><span>${esc(d.categoria)}</span></div><div class="doc-acoes"><button class="btn btn-ghost btn-sm" data-ler="${d.id}">Abrir</button></div></div>`).join("")}</div>`
        : '<p class="notice">Os documentos ainda não foram disponibilizados aqui. A coordenação envia o Estatuto, o Regimento e o Manual do Cooperado por e-mail ou WhatsApp antes da sua declaração.</p>'}
      <div class="notice" style="margin-top:.8rem"><b>Declaração de livre adesão</b><p style="margin:.4rem 0 0">Declaro que optei livremente por me associar à BIMCORE Cooperativa de Trabalho; que recebi e li o Estatuto Social, o Regimento Interno e o Manual do Cooperado; que estou alinhado(a) aos princípios de autogestão, planejamento coletivo e governança democrática; e que me comprometo com o Sistema de Governança e com o Plano de Negócios e de Desenvolvimento da cooperativa (Estatuto, arts. 3º e 4º).</p></div>
      ${ok3 ? `<p class="hint">Declaração assinada em ${dataHora(f.declaracao_em)}.</p>` : `<label class="ciente" style="margin-top:.6rem"><input type="checkbox" id="adm-dec"> <span>Li e concordo com a declaração acima.</span></label>
        <p><button class="btn btn-primary" id="adm-dec-ok" ${ok1 && ok2 ? "" : "disabled"}>Assinar declaração</button>${ok1 && ok2 ? "" : ' <span class="hint">Complete a ficha e os documentos primeiro.</span>'}</p>`}`;
    const st = { pendente: "Aguardando a análise do Conselho de Administração, na próxima reunião ordinária.", entrevista: "O Conselho de Administração quer conversar com você. A coordenação vai entrar em contato para marcar.", aprovado: `Admissão aprovada pelo Conselho de Administração${p.ca_reuniao ? " na reunião de " + data(p.ca_reuniao) : ""}.` };
    const corpo4 = `<p>${st[p.status] || ""}</p><p class="hint">O CA analisa a proposta na primeira reunião ordinária depois que a sua documentação estiver completa e pode pedir informações complementares (Regimento, art. 18).</p>`;
    const corpo5 = !aprovado ? '<p class="hint">Liberado depois da aprovação do Conselho de Administração.</p>' : ok5
      ? `<p>Termo aceito em ${dataHora(f.aceite_matricula_em)}. Agora a coordenação registra a sua matrícula no Livro de Matrícula e assina com você. Quando isso acontecer, o seu acesso à área do cooperado é liberado.</p>`
      : `<p>Para completar a admissão, você subscreve <b>${QUOTAS} quotas-parte de ${moeda(QUOTA)}</b> (${moeda(QUOTAS * QUOTA)}) e assina o Livro de Matrícula (Lei 5.764/1971, art. 23; Regimento, art. 19).</p>
        <div class="form-grid"><div class="field"><label for="adm-forma">Forma de integralização</label><select class="input" id="adm-forma"><option value="vista" ${f.forma_integralizacao !== "parcelado" ? "selected" : ""}>À vista, por Pix, depois da matrícula</option><option value="parcelado" ${f.forma_integralizacao === "parcelado" ? "selected" : ""}>Parcelado, descontado das minhas retiradas</option></select></div>
          <div class="field" id="adm-parc-w" ${f.forma_integralizacao === "parcelado" ? "" : "hidden"}><label for="adm-parc">Número de parcelas</label><input class="input" id="adm-parc" type="number" min="1" max="20" value="${f.parcelas || 5}"><span class="hint">Combinado com o CA, sem comprometer o seu sustento (RI, art. 19, §1º).</span></div></div>
        <div class="adm-termo" id="adm-termo"></div>
        <label class="ciente"><input type="checkbox" id="adm-aceite"> <span>Li o termo de matrícula e aceito subscrever as quotas nas condições acima.</span></label>
        <p><button class="btn btn-primary" id="adm-aceite-ok">Aceitar o termo</button></p>`;

    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Admissão</p><h1>Sua entrada na BIMCORE</h1></div></div>
      <p class="muted">Olá, ${nome1}. A entrada na cooperativa segue o Estatuto Social e a lei do cooperativismo. Complete as etapas abaixo; o seu progresso fica salvo e você pode voltar quando quiser.</p>
      ${passo(1, "Ficha cadastral", ok1, !ok1, corpo1)}
      ${passo(2, "Documentos", ok2, ok1 && !ok2, corpo2)}
      ${passo(3, "Leitura e declaração de livre adesão", ok3, ok1 && ok2 && !ok3, corpo3)}
      ${passo(4, "Análise do Conselho de Administração", aprovado, false, corpo4)}
      ${passo(5, "Quotas-parte e termo de matrícula", ok5, aprovado && !ok5, corpo5)}
      <p class="hint">Dúvidas: WhatsApp (22) 99874-5742 ou bimcorecooperativa@gmail.com.</p>`;

    const termo = () => { const box = $("#adm-termo", el); if (!box) return; const forma = $("#adm-forma", el).value, parc = Number($("#adm-parc", el).value) || 1;
      $("#adm-parc-w", el).hidden = forma !== "parcelado";
      box.innerHTML = `<p><b>Termo de matrícula</b></p><p>Eu, ${qualificacao(f)}, admitido(a) por decisão do Conselho de Administração${p.ca_reuniao ? " em reunião de " + data(p.ca_reuniao) : ""}, subscrevo ${QUOTAS} (dez) quotas-parte do capital social da BIMCORE Cooperativa de Trabalho, de ${moeda(QUOTA)} cada, no total de ${moeda(QUOTAS * QUOTA)}, a integralizar ${formaTxt({ forma_integralizacao: forma, parcelas: parc })}, e requeiro a minha inscrição no Livro de Matrícula, comprometendo-me a cumprir o Estatuto Social, o Regimento Interno e as decisões da Assembleia Geral.</p>`; };
    if ($("#adm-termo", el)) { $("#adm-forma", el).onchange = termo; $("#adm-parc", el).oninput = termo; termo(); }

    const form = $("#adm-ficha", el);
    form.addEventListener("input", (e) => { if (e.target.id === "af-cpf") { const d = soDig(e.target.value); if (d.length === 11) e.target.value = fmtCpf(d); } if (e.target.id === "af-cep") { const d = soDig(e.target.value); if (d.length === 8) e.target.value = fmtCep(d); } });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const d = {}; CAMPOS.forEach(([k, , tipo]) => { let v = $("#af-" + k, el).value.trim(); if (tipo === "cpf" || tipo === "cep") v = soDig(v); d[k] = v || null; });
      const falta = CAMPOS.filter(([k, , , req]) => req && !d[k]).map(([, r]) => r);
      if (falta.length) return toast("Preencha: " + falta.join(", ") + ".", "err");
      if (!cpfValido(d.cpf)) return toast("CPF inválido. Confira os números.", "err");
      if (await acao($("#af-ok", el), () => API.admissao.salvarFicha(d), "Ficha salva.")) recarregar();
    };
    el.onchange = async (e) => {
      const inp = e.target.closest("[data-enviar]"); if (!inp || !inp.files[0]) return;
      const arq = inp.files[0]; if (arq.size > 10 * 1024 * 1024) return toast("O limite é 10 MB por arquivo.", "err");
      if (await acao(inp.closest("label"), () => API.admissao.enviarDoc(inp.dataset.enviar, arq), "Documento enviado.")) recarregar();
    };
    el.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.verDoc) { const url = await acao(b, () => API.admissao.linkDoc(b.dataset.verDoc)); if (url) window.open(url, "_blank", "noopener"); return; }
      if (b.dataset.rmDoc) { if (!(await confirmar("Remover este documento?", "Remover"))) return; if (await acao(b, () => API.admissao.removerDoc(b.dataset.rmDoc), "Documento removido.")) recarregar(); return; }
      if (b.dataset.ler) { const doc = leitura.find((d) => d.id === b.dataset.ler); const url = await acao(b, () => API.documentos.link(doc)); if (url) window.open(url, "_blank", "noopener"); return; }
      if (b.id === "adm-dec-ok") {
        if (!$("#adm-dec", el).checked) return toast("Marque que leu e concorda com a declaração.", "err");
        if (await acao(b, () => API.admissao.salvarFicha({ declaracao_em: new Date().toISOString() }), "Declaração assinada. Agora é aguardar a análise do Conselho de Administração.")) recarregar();
        return;
      }
      if (b.id === "adm-aceite-ok") {
        if (!$("#adm-aceite", el).checked) return toast("Marque que leu e aceita o termo.", "err");
        const forma = $("#adm-forma", el).value, parc = Math.max(1, Math.min(20, Number($("#adm-parc", el).value) || 1));
        if (await acao(b, () => API.admissao.salvarFicha({ forma_integralizacao: forma, parcelas: forma === "parcelado" ? parc : null, aceite_matricula_em: new Date().toISOString() }), "Termo aceito. A coordenação vai registrar a sua matrícula.")) recarregar();
      }
    };
  }

  /* ===================== Interno: solicitações ===================== */
  async function contador() {
    const todos = await API.cooperados.listar().catch(() => []);
    return todos.filter((c) => ["pendente", "entrevista", "aprovado"].includes(c.status)).length;
  }

  async function renderSolicitacoes(el, ctx) {
    const [todos, fichas, semConta] = await Promise.all([API.cooperados.listar(), API.admissao.fichas().catch(() => []), API.admissao.semConta().catch(() => [])]);
    const recarregar = () => { ctx.atualizarContadores && ctx.atualizarContadores(); renderSolicitacoes(el, ctx); };
    const fichaDe = (id) => fichas.find((f) => f.perfil_id === id) || { docs: [] };
    const abertas = todos.filter((c) => ["pendente", "entrevista", "aprovado"].includes(c.status)).sort((a, b) => (a.criado_em || "").localeCompare(b.criado_em || ""));
    const recusadas = todos.filter((c) => c.status === "recusado");
    const ST = { pendente: ["warn", "aguardando o CA"], entrevista: ["info", "conversa"], aprovado: ["ok", "aprovado: aguardando matrícula"] };
    const chk = (v, t) => `<li class="${v ? "ok" : ""}">${v ? "✓" : "○"} ${t}</li>`;
    const hoje = UI.hoje();
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Quadro social</p><h1>Solicitações de admissão</h1></div></div>
      <p class="muted">Quem pede para entrar completa a ficha, envia os documentos e assina a declaração de livre adesão. O Conselho de Administração decide na reunião ordinária (Regimento, art. 18). Aprovada a admissão, o candidato aceita o termo de matrícula e a coordenação ou o CA registra a matrícula no Livro, o que libera o acesso.</p>
      ${abertas.length ? abertas.map((c) => { const f = fichaDe(c.id); const [sc, st] = ST[c.status];
        return `<section class="painel solicitacao" data-id="${c.id}">
          <div class="painel-cab"><div><h2>${esc(f.nome_completo || c.nome || "(sem nome)")}</h2><span class="hint">Pedido de ${data(c.criado_em)} · ${esc(c.email)}${c.telefone ? " · " + esc(c.telefone) : ""}</span></div><span class="selo ${sc}">${st}</span></div>
          <ul class="adm-check">${chk(fichaCompleta(f), "Ficha cadastral")}${chk(docsOk(f), `Documentos (${(f.docs || []).length})`)}${chk(!!f.declaracao_em, "Declaração de livre adesão" + (f.declaracao_em ? " · " + data(f.declaracao_em) : ""))}${chk(c.status === "aprovado", "Decisão do CA" + (c.ca_reuniao ? " · reunião de " + data(c.ca_reuniao) : ""))}${chk(!!f.aceite_matricula_em, "Termo de matrícula aceito" + (f.forma_integralizacao ? " · " + (f.forma_integralizacao === "parcelado" ? `parcelado em ${f.parcelas}x` : "à vista") : ""))}</ul>
          <dl class="sol-dados">
            <div><dt>Área pretendida</dt><dd>${esc(c.area_atuacao || c.especialidade || "—")}</dd></div>
            <div><dt>Formação</dt><dd>${esc(c.formacao || "—")}</dd></div>
            <div><dt>Registro profissional</dt><dd>${esc(c.registro_profissional || "—")}</dd></div>
            <div><dt>Cidade</dt><dd>${esc(c.cidade || "—")}</dd></div>
            ${f.cpf ? `<div><dt>CPF</dt><dd>${esc(fmtCpf(f.cpf))}</dd></div>` : ""}
            ${f.profissao ? `<div><dt>Profissão</dt><dd>${esc(f.profissao)}</dd></div>` : ""}
          </dl>
          ${(f.docs || []).length ? `<p class="hint">Documentos: ${(f.docs || []).map((d) => `<button class="link-botao" data-ver-doc="${esc(d.caminho)}">${esc(TIPOS_DOC[d.tipo] ? TIPOS_DOC[d.tipo].split(" (")[0] : d.tipo)}</button>`).join(" · ")}</p>` : ""}
          <details><summary>Experiência e motivação</summary><div class="sol-texto"><b>Experiência</b><p>${esc(c.experiencia || "—")}</p></div><div class="sol-texto"><b>Motivação</b><p>${esc(c.motivacao || "—")}</p></div></details>
          ${c.status !== "aprovado" ? `
          <div class="form-grid" style="margin-top:.8rem">
            <div class="field"><label for="reu-${c.id}">Data da reunião do CA</label><input class="input" id="reu-${c.id}" type="date" max="${hoje}" value="${c.ca_reuniao || ""}"></div>
            <div class="field full"><label for="obs-${c.id}">Parecer do CA</label><textarea class="input" id="obs-${c.id}" style="min-height:4rem" maxlength="2000" placeholder="Registro da análise (o que consta na ata)">${esc(c.analise_obs || "")}</textarea></div>
          </div>
          <div class="sol-acoes">
            ${c.status === "pendente" ? '<button class="btn btn-ghost btn-sm" data-dec="entrevista">Chamar para conversa</button>' : ""}
            <button class="btn btn-primary btn-sm" data-dec="aprovado">Aprovado pelo CA</button>
            <button class="btn btn-danger btn-sm" data-dec="recusado">Não aprovado pelo CA</button>
            ${semConta.length ? `<span class="sep-v"></span><select class="input mini" id="vinc-${c.id}" aria-label="Matrícula existente"><option value="">Já é cooperado? Escolha a matrícula</option>${semConta.map((x) => `<option value="${x.fin_id}">${x.numero ? "nº " + x.numero + " · " : ""}${esc(x.nome)}</option>`).join("")}</select> <button class="btn btn-ghost btn-sm" data-vincular="1">Vincular sem nova adesão</button>` : ""}
          </div>` : `
          <div class="form-grid" style="margin-top:.8rem">
            <div class="field"><label for="ass-${c.id}">Data da assinatura no Livro</label><input class="input" id="ass-${c.id}" type="date" max="${hoje}" value="${hoje}"></div>
            <div class="field full"><label for="mobs-${c.id}">Observação no Livro (opcional)</label><input class="input" id="mobs-${c.id}" maxlength="300"></div>
          </div>
          <div class="sol-acoes"><button class="btn btn-ghost btn-sm" data-termo="1">Ver termo de matrícula</button>
            <button class="btn btn-primary btn-sm" data-matricular="1" ${f.aceite_matricula_em && f.declaracao_em ? "" : "disabled"}>Registrar no Livro de Matrícula</button>
            ${f.aceite_matricula_em ? "" : '<span class="hint">Aguardando o candidato aceitar o termo.</span>'}
            <button class="btn btn-ghost btn-sm" data-dec="entrevista">Voltar para análise</button></div>`}
        </section>`; }).join("") : '<p class="vazio">Nenhuma solicitação aberta.</p>'}
      ${recusadas.length ? `<section class="painel"><h2>Não aprovadas</h2><div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nome</th><th>Reunião do CA</th><th>Parecer</th><th></th></tr></thead>
        <tbody>${recusadas.map((c) => `<tr data-id="${c.id}"><td>${esc(c.nome)}<span class="sub">${esc(c.email)}</span></td><td>${c.ca_reuniao ? data(c.ca_reuniao) : data(c.analisado_em)}</td><td>${esc(c.analise_obs || "—")}</td>
          <td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-dec="pendente">Reabrir</button></td></tr>`).join("")}</tbody></table></div></section>` : ""}`;

    el.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.verDoc) { const url = await acao(b, () => API.admissao.linkDoc(b.dataset.verDoc)); if (url) window.open(url, "_blank", "noopener"); return; }
      const box = b.closest("[data-id]"); if (!box) return; const id = box.dataset.id; const c = todos.find((x) => x.id === id); const f = fichaDe(id);
      if (b.dataset.dec) {
        const novo = b.dataset.dec; const reu = $("#reu-" + id, el), obs = $("#obs-" + id, el);
        const d = { status: novo, ca_reuniao: reu ? reu.value || null : c.ca_reuniao, analise_obs: obs ? obs.value.trim() : c.analise_obs };
        if ((novo === "aprovado" || novo === "recusado") && !d.ca_reuniao) return toast("Informe a data da reunião do CA em que a decisão foi tomada.", "err");
        if (novo === "aprovado" && !f.declaracao_em && !(await confirmar("O candidato ainda não assinou a declaração de livre adesão. Aprovar assim mesmo? Ele só poderá ter a matrícula registrada depois de assinar.", "Aprovar"))) return;
        if (novo === "recusado" && !(await confirmar(`Registrar que a admissão de ${c.nome} não foi aprovada pelo CA?`, "Não aprovar"))) return;
        const msg = { aprovado: "Aprovação registrada. O candidato já pode aceitar o termo de matrícula.", recusado: "Registrado como não aprovado.", entrevista: "Marcado para conversa.", pendente: "Solicitação reaberta." }[novo];
        if (await acao(b, () => API.admissao.decidir(id, d), msg)) recarregar();
        return;
      }
      if (b.dataset.vincular) {
        const fin = $("#vinc-" + id, el).value; if (!fin) return toast("Escolha a matrícula existente.", "err");
        const x = semConta.find((y) => y.fin_id === fin);
        if (!(await confirmar(`Vincular a conta de ${c.nome} (${c.email}) à matrícula de ${x.nome}? A pessoa fica ativa sem nova adesão nem quotas.`, "Vincular"))) return;
        if (await acao(b, () => API.admissao.vincular(id, fin), "Conta vinculada à matrícula existente. Acesso liberado.")) recarregar();
        return;
      }
      if (b.dataset.termo) {
        const m = UI.modal(`<h2>Termo de matrícula</h2>${fichaCompleta(f) ? `<p>Eu, ${qualificacao(f)}, admitido(a) por decisão do Conselho de Administração${c.ca_reuniao ? " em reunião de " + data(c.ca_reuniao) : ""}, subscrevo ${QUOTAS} (dez) quotas-parte do capital social da BIMCORE Cooperativa de Trabalho, de ${moeda(QUOTA)} cada, no total de ${moeda(QUOTAS * QUOTA)}, a integralizar ${formaTxt(f)}, e requeiro a minha inscrição no Livro de Matrícula.</p><p class="hint">${f.aceite_matricula_em ? "Aceito pelo candidato em " + dataHora(f.aceite_matricula_em) + "." : "Ainda não aceito."}</p>` : '<p class="vazio">Ficha incompleta.</p>'}
          <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button></div>`);
        void m; return;
      }
      if (b.dataset.matricular) {
        const ass = $("#ass-" + id, el).value; if (!ass) return toast("Informe a data da assinatura.", "err");
        if (!(await confirmar(`Registrar a matrícula de ${f.nome_completo || c.nome} no Livro, com assinatura em ${data(ass)}? A pessoa passa a ser cooperada e ganha acesso à área do cooperado.`, "Registrar matrícula"))) return;
        const num = await acao(b, () => API.admissao.registrarMatricula(id, ass, $("#mobs-" + id, el).value.trim()));
        if (num) { toast(`Matrícula nº ${num} registrada.`, "ok"); recarregar(); }
      }
    };
  }

  /* ===================== Livro de Matrícula ===================== */
  async function renderLivro(el) {
    const linhas = await API.admissao.livro().catch(() => []);
    const ativos = linhas.filter((l) => l.situacao !== "desligado");
    const tot = (k, ls) => ls.reduce((t, l) => t + Number(l[k] || 0), 0);
    const q = (linhas[0] && Number(linhas[0].quota)) || QUOTA;
    const fq = (v) => (Math.round(v / q * 100) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Quadro social</p><h1>Livro de Matrícula</h1></div><button class="btn btn-ghost permitido" id="lv-imp">Imprimir</button></div>
      <p class="muted">O registro de todos os cooperados, com a data de admissão e o capital de cada um (Lei 5.764/1971, art. 23). O capital subscrito inclui as quotas iniciais e as contribuições mensais; o integralizado é o que já foi pago. Quota-parte: ${moeda(q)}.</p>
      <div class="kpis">
        <div class="kpi"><span class="rot">Cooperados ativos</span><span class="val">${ativos.length}</span><span class="det">${linhas.length} matrícula(s) no livro</span></div>
        <div class="kpi"><span class="rot">Capital subscrito</span><span class="val">${moeda(tot("capital_subscrito", ativos))}</span><span class="det">${fq(tot("capital_subscrito", ativos))} quotas</span></div>
        <div class="kpi"><span class="rot">Capital integralizado</span><span class="val">${moeda(tot("capital_integralizado", ativos))}</span><span class="det">${fq(tot("capital_integralizado", ativos))} quotas</span></div>
        <div class="kpi"><span class="rot">A integralizar</span><span class="val">${moeda(Math.max(0, tot("capital_subscrito", ativos) - tot("capital_integralizado", ativos)))}</span><span class="det">quotas subscritas ainda não pagas</span></div>
      </div>
      ${linhas.length ? `<div class="tabela-wrap"><table class="tabela" id="lv-tab">
        <thead><tr><th class="num">Nº</th><th>Cooperado</th><th>Admissão</th><th class="num">Quotas subscritas</th><th class="num">Capital subscrito</th><th class="num">Capital integralizado</th><th class="num">Quotas integralizadas</th><th>Situação</th></tr></thead>
        <tbody>${linhas.map((l) => `<tr${l.situacao === "desligado" ? ' style="opacity:.6"' : ""}><td class="num">${l.numero}</td><td>${esc(l.nome)}${l.fundador ? '<span class="sub">fundador(a)</span>' : ""}</td><td>${data(l.data_admissao)}</td>
          <td class="num">${fq(Number(l.capital_subscrito))}</td><td class="num">${moeda(l.capital_subscrito)}</td><td class="num">${moeda(l.capital_integralizado)}</td><td class="num">${fq(Number(l.capital_integralizado))}</td>
          <td>${l.situacao === "desligado" ? `desligado(a)${l.data_desligamento ? " em " + data(l.data_desligamento) : ""}` : "ativo(a)"}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td></td><td>Total (ativos)</td><td></td><td class="num">${fq(tot("capital_subscrito", ativos))}</td><td class="num">${moeda(tot("capital_subscrito", ativos))}</td><td class="num">${moeda(tot("capital_integralizado", ativos))}</td><td class="num">${fq(tot("capital_integralizado", ativos))}</td><td></td></tr></tfoot>
      </table></div>` : '<p class="vazio">Nenhuma matrícula registrada.</p>'}`;
    el.onclick = (e) => {
      if (!e.target.closest("#lv-imp")) return;
      const t = $("#lv-tab", el); if (!t) return;
      const w = window.open("", "_blank"); if (!w) return toast("Permita a abertura de janelas para imprimir.", "err");
      w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Livro de Matrícula — BIMCORE</title><style>body{font:13px Arial,Helvetica,sans-serif;margin:28px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}td.num,th.num{text-align:right}.sub{display:block;font-size:11px;color:#666}</style></head><body><h1 style="font-size:20px">BIMCORE Cooperativa de Trabalho · Livro de Matrícula</h1><p>CNPJ 66.004.522/0001-70 · emitido em ${data(UI.hoje())}</p>${t.outerHTML}</body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };
  }

  window.Admissao = { renderCandidato, renderSolicitacoes, renderLivro, contador };
})();
