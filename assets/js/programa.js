/* Programa BIMCORE Edificações: baixar o programa e relatar erros e problemas */
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
  const selo = (s) => { const x = ST[s] || [s, ""]; return `<span class="selo ${x[1]}">${esc(x[0])}</span>`; };
  const MAX = 3 * 1024 * 1024;

  const lerArquivo = (f) => new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok({ nome: f.name, tipo: f.type || "application/octet-stream", tamanho: f.size, dados: String(r.result) });
    r.onerror = () => erro(new Error("Não foi possível ler " + f.name));
    r.readAsDataURL(f);
  });

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

  async function blocoDownload() {
    const vs = await API.programa.versoes().catch(() => []);
    const inst = vs.find((v) => v.tipo === "instalador");
    const atu = vs.find((v) => v.tipo === "atualizacao");
    if (!inst && !atu) return `<section class="painel"><h2>Baixar o programa</h2><p class="vazio">O instalador ainda não foi publicado. Assim que a coordenação publicar, ele aparece aqui.</p></section>`;
    const linha = (v, rot) => v ? `<div class="painel-cab" style="margin:.4rem 0"><div><b>${rot} ${esc(v.versao)}</b><span class="sub">${data(v.publicado_em)}${v.tamanho ? " · " + bytes(v.tamanho) : ""}</span>${v.notas ? `<p class="muted" style="margin:.2rem 0 0;white-space:pre-wrap">${esc(v.notas)}</p>` : ""}</div>
      <a class="btn btn-primary btn-sm" href="${esc(v.url)}" rel="noopener">Baixar</a></div>` : "";
    return `<section class="painel"><h2>Baixar o programa</h2>
      <p class="muted">BIMCORE Edificações para Windows (64 bits). Instale uma vez; as correções chegam pelas atualizações.</p>
      ${linha(inst, "Instalador")}${linha(atu && (!inst || atu.publicado_em > inst.publicado_em) ? atu : null, "Atualização")}
    </section>`;
  }

  const cooperado = {
    titulo: "Programa BIMCORE",
    async render(el) {
      const [meus, vs] = await Promise.all([API.programa.meus().catch(() => []), API.programa.versoes().catch(() => [])]);
      const ultima = vs[0] ? vs[0].versao : "";
      el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">BIMCORE Edificações</p><h1>Programa BIMCORE</h1></div></div>
        ${await blocoDownload()}
        <section class="painel"><h2>Relatar erro ou problema</h2>
          <p class="muted">Conte o que aconteceu no programa. Cada relato vira uma tarefa de correção; você acompanha aqui a situação e a versão em que foi corrigido.</p>
          <form id="pr-f" class="form-grid" novalidate>
            <div class="field"><label for="pr-tipo">Tipo</label><select class="input" id="pr-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
            <div class="field"><label for="pr-grav">Gravidade</label><select class="input" id="pr-grav">${Object.entries(GRAV).map(([k, v]) => `<option value="${k}" ${k === "atrapalha" ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
            <div class="field full"><label for="pr-tit">Resumo</label><input class="input" id="pr-tit" maxlength="150" placeholder="Ex.: Ctrl+Z não desfaz a cota alinhada"></div>
            <div class="field full"><label for="pr-desc">O que aconteceu</label><textarea class="input" id="pr-desc" rows="5" placeholder="O que você fez, o que esperava (como no Revit) e o que o programa fez. Copie a mensagem de erro, se apareceu."></textarea></div>
            <div class="field full"><label for="pr-passos">Como repetir (opcional)</label><textarea class="input" id="pr-passos" rows="4" placeholder="1. Abri o projeto…&#10;2. Na planta Térreo, cliquei em…&#10;3. …"></textarea></div>
            <div class="field"><label for="pr-ver">Versão do programa</label><input class="input" id="pr-ver" maxlength="30" value="${esc(ultima)}" placeholder="Ex.: 0.7.0"></div>
            <div class="field"><label for="pr-mod">Onde aconteceu (comando ou aba)</label><input class="input" id="pr-mod" maxlength="120" placeholder="Ex.: Arquitetura > Parede"></div>
            <div class="field full"><label for="pr-arq">Prints ou arquivos (até 3, 3 MB cada)</label><input class="input" type="file" id="pr-arq" multiple accept="image/*,.txt,.log,.ifc"></div>
            <div class="full"><button class="btn btn-primary" id="pr-btn" type="submit">Enviar relato</button></div>
          </form>
        </section>
        <section class="painel"><h2>Meus relatos</h2>
          ${meus.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Protocolo</th><th>Resumo</th><th>Situação</th><th>Resposta</th></tr></thead><tbody>
            ${meus.map((r) => `<tr><td>${esc(r.protocolo || "")}<span class="sub">${dataHora(r.criado_em)}</span></td><td>${esc(r.titulo)}<span class="sub">${esc(TIPO_CURTO[r.tipo] || r.tipo)}</span></td><td>${selo(r.status)}${r.versao_corrigida ? `<span class="sub">corrigido na ${esc(r.versao_corrigida)}</span>` : ""}</td><td>${r.resposta ? esc(r.resposta) : "—"}</td></tr>`).join("")}
          </tbody></table></div>` : '<p class="vazio">Você ainda não enviou relatos.</p>'}
        </section>`;
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
        if (ok) UI.modal(`<h2>Recebido</h2><p>Seu protocolo é <b style="font-size:1.2rem">${esc(prot || "")}</b>.</p><p class="muted">O relato entrou na fila de correção. A situação e a resposta aparecem em "Meus relatos".</p><div class="modal-acoes"><button class="btn btn-primary btn-sm" data-fechar>Entendi</button></div>`, () => cooperado.render(el));
      });
    }
  };

  const coordenacao = {
    titulo: "Programa BIMCORE",
    async render(el) {
      const [todos, vs] = await Promise.all([API.programa.todos().catch(() => []), API.programa.versoes().catch(() => [])]);
      const abertos = todos.filter((r) => ["recebido", "em_analise", "em_correcao"].includes(r.status));
      el.innerHTML = `<div class="pag-cab"><div><p class="eyebrow">BIMCORE Edificações</p><h1>Programa BIMCORE</h1></div></div>
        <section class="painel"><div class="painel-cab"><h2>Relatos dos cooperados</h2><span class="selo ${abertos.length ? "warn" : "ok"}">${abertos.length} em aberto</span></div>
          <div class="field" style="max-width:260px"><label for="prc-filtro">Mostrar</label><select class="input" id="prc-filtro"><option value="abertos">Em aberto</option><option value="todos">Todos</option></select></div>
          <div id="prc-lista"></div>
        </section>
        <section class="painel"><h2>Versões publicadas</h2>
          ${vs.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Versão</th><th>Tipo</th><th>Publicada</th><th>Link</th><th></th></tr></thead><tbody>
            ${vs.map((v) => `<tr><td>${esc(v.versao)}${v.notas ? `<span class="sub">${esc(v.notas)}</span>` : ""}</td><td>${v.tipo === "instalador" ? "Instalador" : "Atualização"}</td><td>${data(v.publicado_em)}${v.tamanho ? `<span class="sub">${bytes(v.tamanho)}</span>` : ""}</td><td><a href="${esc(v.url)}" rel="noopener">baixar</a></td><td><button class="link-botao" data-exv="${esc(v.id)}" type="button">excluir</button></td></tr>`).join("")}
          </tbody></table></div>` : '<p class="vazio">Nenhuma versão publicada.</p>'}
          <form id="prv-f" class="form-grid" novalidate style="margin-top:1rem">
            <div class="field"><label for="prv-ver">Versão</label><input class="input" id="prv-ver" maxlength="30" placeholder="0.7.0"></div>
            <div class="field"><label for="prv-tipo">Tipo</label><select class="input" id="prv-tipo"><option value="instalador">Instalador</option><option value="atualizacao">Atualização</option></select></div>
            <div class="field full"><label for="prv-url">Link do arquivo</label><input class="input" id="prv-url" placeholder="https://github.com/…/releases/download/…"></div>
            <div class="field"><label for="prv-tam">Tamanho (MB, opcional)</label><input class="input" id="prv-tam" inputmode="decimal"></div>
            <div class="field full"><label for="prv-notas">O que mudou (opcional)</label><textarea class="input" id="prv-notas" rows="3"></textarea></div>
            <div class="full"><button class="btn btn-primary" id="prv-btn" type="submit">Publicar versão</button></div>
          </form>
        </section>`;
      const lista = () => {
        const f = $("#prc-filtro").value; const ls = f === "todos" ? todos : abertos;
        $("#prc-lista").innerHTML = ls.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Protocolo</th><th>Resumo</th><th>Gravidade</th><th>Situação</th><th></th></tr></thead><tbody>
          ${ls.map((r) => `<tr><td>${esc(r.protocolo || "")}<span class="sub">${dataHora(r.criado_em)} · ${esc(r.autor_nome || "")}</span></td><td>${esc(r.titulo)}<span class="sub">${esc(TIPO_CURTO[r.tipo] || r.tipo)}${r.modulo ? " · " + esc(r.modulo) : ""}</span></td><td>${esc((GRAV[r.gravidade] || r.gravidade).split(",")[0])}</td><td>${selo(r.status)}${r.versao_corrigida ? `<span class="sub">na ${esc(r.versao_corrigida)}</span>` : ""}</td><td><button class="btn btn-ghost btn-sm" data-abrir="${esc(r.id)}" type="button">Abrir</button></td></tr>`).join("")}
        </tbody></table></div>` : '<p class="vazio">Nenhum relato.</p>';
      };
      lista();
      $("#prc-filtro").addEventListener("change", lista);
      el.onclick = async (e) => {
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
          if (!(await UI.confirmar("Excluir esta versão da lista? O arquivo continua onde está."))) return;
          await acao(x, () => API.programa.excluirVersao(x.dataset.exv), "Versão excluída."); coordenacao.render(el);
        }
      };
      $("#prv-f").addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = { versao: $("#prv-ver").value.trim(), tipo: $("#prv-tipo").value, url: $("#prv-url").value.trim(), notas: $("#prv-notas").value.trim() || null };
        const mb = parseFloat(String($("#prv-tam").value).replace(",", ".")); if (mb > 0) v.tamanho = Math.round(mb * 1024 * 1024);
        if (!v.versao || !/^https:\/\//.test(v.url)) return toast("Informe a versão e o link (https://…).", "err");
        const ok = await acao($("#prv-btn"), () => API.programa.salvarVersao(v), "Versão publicada.");
        if (ok) coordenacao.render(el);
      });
    }
  };

  window.Programa = { cooperado, coordenacao };
})();
