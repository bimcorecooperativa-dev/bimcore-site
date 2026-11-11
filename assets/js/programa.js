/* BIMCORE Edificações: baixar o programa, baixar os modelos de projeto e relatar erros e problemas */
(function () {
  "use strict";
  const UI = window.UI;
  const { $, esc, data, dataHora, bytes, acao, toast } = UI;
  const API = window.API;

  const TIPOS = { erro: "Erro (falhou, travou ou deu mensagem)", problema: "Problema (diferente do Revit ou do esperado)", sugestao: "Sugestão de melhoria" };
  const TIPO_CURTO = { erro: "Erro", problema: "Problema", sugestao: "Sugestão" };
  const GRAV = { trava: "Trava ou fecha o programa", impede: "Impede de continuar o trabalho", atrapalha: "Atrapalha, mas dá para contornar", detalhe: "Detalhe" };
  const ST = { recebido: ["recebido", "info"], em_analise: ["em análise", "info"], em_correcao: ["em correção", "warn"], corrigido: ["corrigido", "ok"],
    nao_reproduzido: ["não reproduzido", ""], duplicado: ["duplicado", ""], recusado: ["não será feito", "err"] };
  const DISCIPLINAS = ["Arquitetura", "Estrutura", "Hidrossanitário", "Elétrica", "Climatização", "Prevenção e combate a incêndio", "Compatibilização"];
  const TIPOS_PROJETO = ["Todos os tipos", "Escola ou creche", "Unidade de saúde", "Habitação de interesse social", "Edifício administrativo", "Praça ou equipamento urbano", "Reforma ou levantamento (as-built)"];
  const selo = (s) => { const x = ST[s] || [s, ""]; return `<span class="selo ${x[1]}">${esc(x[0])}</span>`; };
  const opcoes = (lista, atual) => lista.map((v) => `<option ${v === atual ? "selected" : ""}>${esc(v)}</option>`).join("");
  const MAX = 3 * 1024 * 1024;
  const ABAS_COOP = [["baixar", "Baixar o programa"], ["modelos", "Modelos de projeto"], ["relatar", "Relatar problema"], ["relatos", "Meus relatos"]];
  const ABAS_COORD = [["relatos", "Relatos"], ["modelos", "Modelos de projeto"], ["versoes", "Versões do programa"]];
  const memo = { coop: "baixar", coord: "relatos" };

  const lerArquivo = (f) => new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok({ nome: f.name, tipo: f.type || "application/octet-stream", tamanho: f.size, dados: String(r.result) });
    r.onerror = () => erro(new Error("Não foi possível ler " + f.name));
    r.readAsDataURL(f);
  });

  const barraAbas = (abas, atual) => `<div class="abas-login" role="tablist" style="grid-template-columns:repeat(${abas.length},1fr);margin-bottom:1rem">
    ${abas.map(([id, rot]) => `<button type="button" role="tab" data-aba="${id}" aria-selected="${id === atual}">${esc(rot)}</button>`).join("")}</div>`;
  function ligarAbas(el, chave) {
    const mostrar = (id) => {
      memo[chave] = id;
      el.querySelectorAll("[data-aba]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === id)));
      el.querySelectorAll("[data-painel]").forEach((p) => { p.hidden = p.dataset.painel !== id; });
    };
    el.querySelectorAll("[data-aba]").forEach((b) => b.addEventListener("click", () => mostrar(b.dataset.aba)));
    mostrar(memo[chave]);
  }

  async function baixar(botao, caminho, nome) {
    await acao(botao, async () => { const u = await API.programa.link(caminho, nome); const a = document.createElement("a"); a.href = u; a.download = nome || ""; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); return true; });
  }

  async function verAnexos(relato, alvo) {
    const an = await API.programa.anexos(relato.id).catch(() => []);
    alvo.innerHTML = an.length ? an.map((a) => a.tipo.startsWith("image/")
      ? `<a href="${a.dados}" download="${esc(a.nome)}"><img src="${a.dados}" alt="${esc(a.nome)}" style="max-width:100%;border:1px solid var(--linha,#333);border-radius:6px;margin:.3rem 0"></a>`
      : `<p><a href="${a.dados}" download="${esc(a.nome)}">${esc(a.nome)}</a> <span class="muted">(${bytes(a.tamanho)})</span></p>`).join("") : '<p class="muted">Sem anexos.</p>';
  }

  function blocoDetalhe(r) {
    return `<dl class="sol-dados">
      <div><dt>Protocolo</dt><dd>${esc(r.protocolo || "")}</dd></div>
      <div><dt>Tipo</dt><dd>${esc(TIPO_CURTO[r.tipo] || r.tipo)}</dd></div>
      <div><dt>Gravidade</dt><dd>${esc(GRAV[r.gravidade] || r.gravidade)}</dd></div>
      <div><dt>Versão do programa</dt><dd>${esc(r.versao || "—")}</dd></div>
      <div><dt>Onde (comando ou aba)</dt><dd>${esc(r.modulo || "—")}</dd></div>
      <div><dt>Enviado em</dt><dd>${dataHora(r.criado_em)}${r.autor_nome ? " por " + esc(r.autor_nome) : ""}</dd></div>
    </dl>
    <p><b>O que aconteceu</b></p><p style="white-space:pre-wrap">${esc(r.descricao)}</p>
    ${r.passos ? `<p><b>Como repetir</b></p><p style="white-space:pre-wrap">${esc(r.passos)}</p>` : ""}`;
  }

  const botaoVersao = (v) => v.caminho
    ? `<button class="btn btn-primary btn-sm" type="button" data-arq="${esc(v.caminho)}" data-nome="${esc(v.caminho.split("/").pop().replace(/^\d+_/, ""))}">Baixar</button>`
    : `<a class="btn btn-primary btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">Baixar</a>`;

  function blocoDownload(vs) {
    const inst = vs.find((v) => v.tipo === "instalador");
    const atus = vs.filter((v) => v.tipo === "atualizacao" && (!inst || v.publicado_em > inst.publicado_em));
    if (!inst && !atus.length) return `<section class="painel"><h2>Baixar o programa</h2><p class="vazio">O instalador ainda não foi publicado. Assim que a coordenação publicar, ele aparece aqui.</p></section>`;
    const linha = (v, rot) => `<div class="painel-cab" style="margin:.6rem 0"><div><b>${rot} ${esc(v.versao)}</b><span class="sub">${data(v.publicado_em)}${v.tamanho ? " · " + bytes(v.tamanho) : ""}</span>${v.notas ? `<p class="muted" style="margin:.2rem 0 0;white-space:pre-wrap">${esc(v.notas)}</p>` : ""}</div>${botaoVersao(v)}</div>`;
    return `<section class="painel"><h2>Baixar o programa</h2>
      <p class="muted">BIMCORE Edificações para Windows 10 ou 11 (64 bits). Baixe o instalador, execute e siga as telas. Se o Windows avisar que o aplicativo não é reconhecido, clique em "Mais informações" e depois em "Executar assim mesmo".</p>
      ${inst ? linha(inst, "Instalador") : ""}
      ${atus.length ? `<h3 style="margin-top:1.2rem">Atualizações depois do instalador</h3><p class="muted">Baixe o pacote mais recente (ele já traz todas as correções anteriores). No BIMCORE, abra o menu do aplicativo, no canto superior esquerdo, e escolha Instalar atualização…; depois salve, feche e abra o programa.</p>${atus.map((v) => linha(v, "Atualização")).join("")}` : ""}
    </section>`;
  }

  function tabelaModelos(ms, coord) {
    if (!ms.length) return `<p class="vazio">${coord ? "Nenhum modelo publicado." : "Ainda não há modelos publicados. A coordenação publica aqui os modelos de cada disciplina e tipo de projeto."}</p>`;
    const grupos = {};
    ms.forEach((m) => { (grupos[m.disciplina] = grupos[m.disciplina] || []).push(m); });
    const ordem = Object.keys(grupos).sort((a, b) => (DISCIPLINAS.indexOf(a) + 1 || 99) - (DISCIPLINAS.indexOf(b) + 1 || 99) || a.localeCompare(b));
    return ordem.map((d) => `<h3 style="margin-top:1rem">${esc(d)}</h3><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Modelo</th><th>Tipo de projeto</th><th>Versão</th><th></th></tr></thead><tbody>
      ${grupos[d].map((m) => `<tr><td>${esc(m.nome)}${m.descricao ? `<span class="sub">${esc(m.descricao)}</span>` : ""}${coord && !m.ativo ? ' <span class="selo">oculto</span>' : ""}</td><td>${esc(m.tipo_projeto)}</td><td>${esc(m.versao || "—")}<span class="sub">${data(m.atualizado_em || m.criado_em)}${m.tamanho ? " · " + bytes(m.tamanho) : ""}</span></td>
        <td style="white-space:nowrap"><button class="btn btn-primary btn-sm" type="button" data-arq="${esc(m.caminho)}" data-nome="${esc(m.nome_arquivo)}">Baixar</button>${coord ? ` <button class="btn btn-ghost btn-sm" type="button" data-edm="${esc(m.id)}">Editar</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`).join("");
  }

  const cooperado = {
    titulo: "BIMCORE Edificações",
    async render(el) {
      const [meus, vs, ms] = await Promise.all([API.programa.meus().catch(() => []), API.programa.versoes().catch(() => []), API.programa.modelos().catch(() => [])]);
      const ultima = vs[0] ? vs[0].versao : "";
      const disc = [...new Set(ms.map((m) => m.disciplina))];
      const tipos = [...new Set(ms.map((m) => m.tipo_projeto))];
      el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Programa da cooperativa</p><h1>BIMCORE Edificações</h1></div></div>
        ${barraAbas(ABAS_COOP, memo.coop)}
        <div data-painel="baixar">${blocoDownload(vs)}</div>
        <div data-painel="modelos"><section class="painel"><h2>Modelos de projeto</h2>
          <p class="muted">Comece todo projeto da cooperativa a partir do modelo da disciplina e do tipo de projeto. Os modelos já trazem níveis, vistas, folhas, estilos de texto e cotas, tipos e configurações padronizados pela BIMCORE.</p>
          ${ms.length ? `<div class="form-grid" style="margin-bottom:.5rem"><div class="field"><label for="pm-d">Disciplina</label><select class="input" id="pm-d"><option value="">Todas</option>${opcoes(disc)}</select></div>
            <div class="field"><label for="pm-t">Tipo de projeto</label><select class="input" id="pm-t"><option value="">Todos</option>${opcoes(tipos)}</select></div></div>` : ""}
          <div id="pm-lista">${tabelaModelos(ms, false)}</div></section></div>
        <div data-painel="relatar"><section class="painel"><h2>Relatar erro ou problema</h2>
          <p class="muted">Conte o que aconteceu no programa. Cada relato vira uma tarefa de correção; a correção chega numa atualização do programa e você acompanha a situação em "Meus relatos".</p>
          <form id="pr-f" class="form-grid" novalidate>
            <div class="field"><label for="pr-tipo">Tipo</label><select class="input" id="pr-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
            <div class="field"><label for="pr-grav">Gravidade</label><select class="input" id="pr-grav">${Object.entries(GRAV).map(([k, v]) => `<option value="${k}" ${k === "atrapalha" ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
            <div class="field full"><label for="pr-tit">Resumo</label><input class="input" id="pr-tit" maxlength="150" placeholder="Ex.: Ctrl+Z não desfaz a cota alinhada"></div>
            <div class="field full"><label for="pr-desc">O que aconteceu</label><textarea class="input" id="pr-desc" rows="5" placeholder="O que você fez, o que esperava (como no Revit) e o que o programa fez. Copie a mensagem de erro, se apareceu."></textarea></div>
            <div class="field full"><label for="pr-passos">Como repetir (opcional)</label><textarea class="input" id="pr-passos" rows="4" placeholder="1. Abri o projeto…&#10;2. Na planta Térreo, cliquei em…&#10;3. …"></textarea></div>
            <div class="field"><label for="pr-ver">Versão do programa</label><input class="input" id="pr-ver" maxlength="30" value="${esc(ultima)}" placeholder="Ex.: 0.7.0"></div>
            <div class="field"><label for="pr-mod">Onde aconteceu (comando ou aba)</label><input class="input" id="pr-mod" maxlength="120" placeholder="Ex.: Arquitetura › Parede"></div>
            <div class="field full"><label for="pr-arq">Prints ou arquivos (até 3, 3 MB cada)</label><input class="input" type="file" id="pr-arq" multiple accept="image/*,.txt,.log,.ifc"></div>
            <div class="full"><button class="btn btn-primary" id="pr-btn" type="submit">Enviar relato</button></div>
          </form></section></div>
        <div data-painel="relatos"><section class="painel"><h2>Meus relatos</h2>
          ${meus.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Protocolo</th><th>Resumo</th><th>Situação</th><th>Resposta</th></tr></thead><tbody>
            ${meus.map((r) => `<tr><td>${esc(r.protocolo || "")}<span class="sub">${dataHora(r.criado_em)}</span></td><td>${esc(r.titulo)}<span class="sub">${esc(TIPO_CURTO[r.tipo] || r.tipo)}</span></td><td>${selo(r.status)}${r.versao_corrigida ? `<span class="sub">corrigido na ${esc(r.versao_corrigida)}</span>` : ""}</td><td>${r.resposta ? esc(r.resposta) : "—"}</td></tr>`).join("")}
          </tbody></table></div>` : '<p class="vazio">Você ainda não enviou relatos.</p>'}</section></div>`;
      ligarAbas(el, "coop");
      const filtrar = () => { const d = $("#pm-d").value, t = $("#pm-t").value;
        $("#pm-lista").innerHTML = tabelaModelos(ms.filter((m) => (!d || m.disciplina === d) && (!t || m.tipo_projeto === t || m.tipo_projeto === "Todos os tipos")), false); };
      if (ms.length) { $("#pm-d").addEventListener("change", filtrar); $("#pm-t").addEventListener("change", filtrar); }
      el.onclick = (e) => { const b = e.target.closest("[data-arq]"); if (b) baixar(b, b.dataset.arq, b.dataset.nome); };
      $("#pr-f").addEventListener("submit", async (e) => {
        e.preventDefault();
        const d = { tipo: $("#pr-tipo").value, gravidade: $("#pr-grav").value, titulo: $("#pr-tit").value.trim(), descricao: $("#pr-desc").value.trim(),
          passos: $("#pr-passos").value.trim(), versao: $("#pr-ver").value.trim(), modulo: $("#pr-mod").value.trim() };
        if (d.titulo.length < 3 || d.descricao.length < 3) return toast("Informe o resumo e o que aconteceu.", "err");
        const fs = [...$("#pr-arq").files];
        if (fs.length > 3) return toast("Envie no máximo 3 arquivos.", "err");
        const grande = fs.find((f) => f.size > MAX); if (grande) return toast(`${grande.name} passa de 3 MB.`, "err");
        let prot = null;
        const ok = await acao($("#pr-btn"), async () => { const arqs = await Promise.all(fs.map(lerArquivo)); prot = await API.programa.relatar(d, arqs); return true; }, "Relato enviado.");
        if (ok) { memo.coop = "relatos"; UI.modal(`<h2>Recebido</h2><p>Seu protocolo é <b style="font-size:1.2rem">${esc(prot || "")}</b>.</p><p class="muted">O relato entrou na fila de correção. A situação e a resposta aparecem em "Meus relatos".</p><div class="modal-acoes"><button class="btn btn-primary btn-sm" data-fechar>Entendi</button></div>`, () => cooperado.render(el)); }
      });
    }
  };

  function modalModelo(m, el) {
    const novo = !m;
    m = m || { disciplina: "Arquitetura", tipo_projeto: "Todos os tipos", ativo: true };
    UI.modal(`<h2>${novo ? "Publicar modelo" : "Editar modelo"}</h2>
      <form id="mm-f" class="form-grid" novalidate>
        <div class="field"><label for="mm-d">Disciplina</label><select class="input" id="mm-d">${opcoes(DISCIPLINAS.includes(m.disciplina) ? DISCIPLINAS : [...DISCIPLINAS, m.disciplina], m.disciplina)}</select></div>
        <div class="field"><label for="mm-t">Tipo de projeto</label><select class="input" id="mm-t">${opcoes(TIPOS_PROJETO.includes(m.tipo_projeto) ? TIPOS_PROJETO : [...TIPOS_PROJETO, m.tipo_projeto], m.tipo_projeto)}</select></div>
        <div class="field full"><label for="mm-n">Nome</label><input class="input" id="mm-n" maxlength="150" value="${esc(m.nome || "")}" placeholder="Ex.: Modelo de Arquitetura"></div>
        <div class="field full"><label for="mm-desc">O que traz (opcional)</label><textarea class="input" id="mm-desc" rows="3">${esc(m.descricao || "")}</textarea></div>
        <div class="field"><label for="mm-v">Versão do modelo</label><input class="input" id="mm-v" maxlength="30" value="${esc(m.versao || "")}" placeholder="Ex.: 2026.1"></div>
        <div class="field"><label for="mm-a">Visível para os cooperados</label><select class="input" id="mm-a"><option value="1" ${m.ativo ? "selected" : ""}>Sim</option><option value="0" ${m.ativo ? "" : "selected"}>Não</option></select></div>
        <div class="field full"><label for="mm-arq">${novo ? "Arquivo (.ifc, .blend ou .zip, até 50 MB)" : "Trocar o arquivo (opcional)"}</label><input class="input" type="file" id="mm-arq" accept=".ifc,.blend,.zip"></div>
      </form>
      <div class="modal-acoes">${novo ? "" : '<button class="btn btn-ghost btn-sm" id="mm-x" type="button">Excluir</button>'}<button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="mm-ok" type="button">Salvar</button></div>`, () => coordenacao.render(el));
    const fechar = () => { const f = document.querySelector("[data-fechar]"); if (f) f.click(); };
    $("#mm-ok").addEventListener("click", async (ev) => {
      const d = { id: m.id, disciplina: $("#mm-d").value, tipo_projeto: $("#mm-t").value, nome: $("#mm-n").value.trim(), descricao: $("#mm-desc").value.trim(), versao: $("#mm-v").value.trim(), ativo: $("#mm-a").value === "1" };
      const arq = $("#mm-arq").files[0] || null;
      if (d.nome.length < 2) return toast("Informe o nome do modelo.", "err");
      if (novo && !arq) return toast("Escolha o arquivo do modelo.", "err");
      if (arq && arq.size > 52428800) return toast("O arquivo passa de 50 MB.", "err");
      if (await acao(ev.currentTarget, () => API.programa.salvarModelo(d, arq), "Modelo salvo.")) fechar();
    });
    if (!novo) $("#mm-x").addEventListener("click", async (ev) => {
      if (!(await UI.confirmar("Excluir este modelo e o arquivo dele?"))) return;
      if (await acao(ev.currentTarget, () => API.programa.excluirModelo(m), "Modelo excluído.")) fechar();
    });
  }

  const coordenacao = {
    titulo: "BIMCORE Edificações",
    async render(el) {
      const [todos, vs, ms] = await Promise.all([API.programa.todos().catch(() => []), API.programa.versoes().catch(() => []), API.programa.modelos().catch(() => [])]);
      const abertos = todos.filter((r) => ["recebido", "em_analise", "em_correcao"].includes(r.status));
      el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">Programa da cooperativa</p><h1>BIMCORE Edificações</h1></div></div>
        ${barraAbas(ABAS_COORD, memo.coord)}
        <div data-painel="relatos"><section class="painel"><div class="painel-cab"><h2>Relatos dos cooperados</h2><span class="selo ${abertos.length ? "warn" : "ok"}">${abertos.length} em aberto</span></div>
          <div class="field" style="max-width:260px"><label for="prc-filtro">Mostrar</label><select class="input" id="prc-filtro"><option value="abertos">Em aberto</option><option value="todos">Todos</option></select></div>
          <div id="prc-lista"></div></section></div>
        <div data-painel="modelos"><section class="painel"><div class="painel-cab"><h2>Modelos de projeto</h2><button class="btn btn-primary btn-sm" id="pm-novo" type="button">Publicar modelo</button></div>
          <div>${tabelaModelos(ms, true)}</div></section></div>
        <div data-painel="versoes"><section class="painel"><h2>Versões publicadas</h2>
          ${vs.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Versão</th><th>Tipo</th><th>Publicada</th><th>Arquivo</th><th></th></tr></thead><tbody>
            ${vs.map((v) => `<tr><td>${esc(v.versao)}${v.notas ? `<span class="sub">${esc(v.notas)}</span>` : ""}</td><td>${v.tipo === "instalador" ? "Instalador" : "Atualização"}</td><td>${data(v.publicado_em)}${v.tamanho ? `<span class="sub">${bytes(v.tamanho)}</span>` : ""}</td><td>${botaoVersao(v)}</td><td><button class="link-botao" data-exv="${esc(v.id)}" type="button">excluir</button></td></tr>`).join("")}
          </tbody></table></div>` : '<p class="vazio">Nenhuma versão publicada.</p>'}
          <form id="prv-f" class="form-grid" novalidate style="margin-top:1rem">
            <div class="field"><label for="prv-ver">Versão</label><input class="input" id="prv-ver" maxlength="30" placeholder="0.7.0"></div>
            <div class="field"><label for="prv-tipo">Tipo</label><select class="input" id="prv-tipo"><option value="instalador">Instalador</option><option value="atualizacao">Atualização</option></select></div>
            <div class="field full"><label for="prv-url">Link do arquivo (instalador no Google Drive)</label><input class="input" id="prv-url" placeholder="https://drive.google.com/…"></div>
            <div class="field full"><label for="prv-arq">Ou envie o arquivo (até 50 MB; serve para as atualizações)</label><input class="input" type="file" id="prv-arq" accept=".zip,.exe"></div>
            <div class="field"><label for="prv-tam">Tamanho em MB (só para link)</label><input class="input" id="prv-tam" inputmode="decimal"></div>
            <div class="field full"><label for="prv-notas">O que mudou (opcional)</label><textarea class="input" id="prv-notas" rows="3"></textarea></div>
            <div class="full"><button class="btn btn-primary" id="prv-btn" type="submit">Publicar versão</button></div>
          </form></section></div>`;
      ligarAbas(el, "coord");
      const lista = () => {
        const f = $("#prc-filtro").value; const ls = f === "todos" ? todos : abertos;
        $("#prc-lista").innerHTML = ls.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Protocolo</th><th>Resumo</th><th>Gravidade</th><th>Situação</th><th></th></tr></thead><tbody>
          ${ls.map((r) => `<tr><td>${esc(r.protocolo || "")}<span class="sub">${dataHora(r.criado_em)} · ${esc(r.autor_nome || "")}</span></td><td>${esc(r.titulo)}<span class="sub">${esc(TIPO_CURTO[r.tipo] || r.tipo)}${r.modulo ? " · " + esc(r.modulo) : ""}</span></td><td>${esc((GRAV[r.gravidade] || r.gravidade).split(",")[0])}</td><td>${selo(r.status)}${r.versao_corrigida ? `<span class="sub">na ${esc(r.versao_corrigida)}</span>` : ""}</td><td><button class="btn btn-ghost btn-sm" data-abrir="${esc(r.id)}" type="button">Abrir</button></td></tr>`).join("")}
        </tbody></table></div>` : '<p class="vazio">Nenhum relato.</p>';
      };
      lista();
      $("#prc-filtro").addEventListener("change", lista);
      $("#pm-novo").addEventListener("click", () => modalModelo(null, el));
      el.onclick = async (e) => {
        const arq = e.target.closest("[data-arq]"); if (arq) return baixar(arq, arq.dataset.arq, arq.dataset.nome);
        const ed = e.target.closest("[data-edm]"); if (ed) return modalModelo(ms.find((m) => m.id === ed.dataset.edm), el);
        const b = e.target.closest("[data-abrir]"); if (b) {
          const r = todos.find((x) => x.id === b.dataset.abrir); if (!r) return;
          UI.modal(`<h2>${esc(r.titulo)}</h2>${blocoDetalhe(r)}<p><b>Anexos</b></p><div id="prm-an"><p class="muted">Carregando…</p></div>
            <form id="prm-f" class="form-grid" novalidate>
              <div class="field"><label for="prm-st">Situação</label><select class="input" id="prm-st">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${esc(v[0])}</option>`).join("")}</select></div>
              <div class="field"><label for="prm-vc">Corrigido na versão</label><input class="input" id="prm-vc" maxlength="30" value="${esc(r.versao_corrigida || "")}"></div>
              <div class="field full"><label for="prm-resp">Resposta ao cooperado</label><textarea class="input" id="prm-resp" rows="3">${esc(r.resposta || "")}</textarea></div>
            </form>
            <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-primary btn-sm" id="prm-ok" type="button">Salvar</button></div>`, () => coordenacao.render(el));
          verAnexos(r, $("#prm-an"));
          $("#prm-ok").addEventListener("click", async (ev) => {
            const d = { status: $("#prm-st").value, versao_corrigida: $("#prm-vc").value.trim() || null, resposta: $("#prm-resp").value.trim() || null };
            const ok = await acao(ev.currentTarget, () => API.programa.atualizar(r.id, d), "Relato atualizado.");
            if (ok) { const f = document.querySelector("[data-fechar]"); if (f) f.click(); }
          });
          return;
        }
        const x = e.target.closest("[data-exv]"); if (x) {
          if (!(await UI.confirmar("Excluir esta versão da lista? Arquivos enviados ao site são apagados; links externos continuam onde estão."))) return;
          await acao(x, () => API.programa.excluirVersao(x.dataset.exv), "Versão excluída."); coordenacao.render(el);
        }
      };
      $("#prv-f").addEventListener("submit", async (e) => {
        e.preventDefault();
        const arq = $("#prv-arq").files[0] || null;
        const v = { versao: $("#prv-ver").value.trim(), tipo: $("#prv-tipo").value, notas: $("#prv-notas").value.trim() || null };
        if (!v.versao) return toast("Informe a versão.", "err");
        let fazer;
        if (arq) { if (arq.size > 52428800) return toast("O arquivo passa de 50 MB; publique por link.", "err"); fazer = () => API.programa.enviarVersao(v, arq); }
        else {
          v.url = $("#prv-url").value.trim(); if (!/^https:\/\//.test(v.url)) return toast("Informe o link (https://…) ou envie o arquivo.", "err");
          const mb = parseFloat(String($("#prv-tam").value).replace(",", ".")); if (mb > 0) v.tamanho = Math.round(mb * 1024 * 1024);
          fazer = () => API.programa.salvarVersao(v);
        }
        if (await acao($("#prv-btn"), fazer, "Versão publicada.")) coordenacao.render(el);
      });
    }
  };

  window.Programa = { cooperado, coordenacao };
})();
