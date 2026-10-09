/* BIMCORE — Notificações de inadimplência (cotas mensais atrasadas)
   O site registra sozinho: a partir da 2ª retirada paga, se o cooperado tinha cotas vencidas em aberto e não quitou nenhuma.
   A notificação NÃO é advertência. A advertência escrita é sanção e só o Conselho de Administração aplica, em processo
   disciplinar com prazo de defesa (Estatuto, arts. 15 e 16; Regimento, arts. 26 e 27). Aqui o CA registra a providência
   e o Conselho Fiscal acompanha. */
(function () {
  "use strict";
  const UI = window.UI, API = window.API, Fin = window.Fin;
  const { $, esc, dataHora, moeda, acao, toast } = UI;

  const ST = {
    aberta: ["warn", "aberta"],
    regularizada: ["ok", "regularizada"],
    processo: ["info", "processo disciplinar instaurado"],
    advertencia: ["err", "advertência aplicada pelo CA"],
    arquivada: ["", "arquivada"]
  };
  const selo = (s) => { const [c, t] = ST[s] || ["", s]; return `<span class="selo ${c}">${esc(t)}</span>`; };
  const meses = (n) => (n.meses || []).map(Fin.nomeMes).join(", ");

  async function contador(ctx) {
    if (!(ctx.ca || ctx.coord)) return 0;
    const l = await API.notif.listar(); return l.filter((n) => n.status === "aberta").length;
  }

  async function render(el, ctx) {
    const pode = !!(ctx.ca || ctx.coord);
    const lista = await API.notif.listar().catch(() => []);
    const recarregar = () => render(el, ctx);
    const porCoop = {}; lista.forEach((n) => { (porCoop[n.fin_cooperado_id] = porCoop[n.fin_cooperado_id] || []).push(n); });
    const reincidentes = Object.values(porCoop).filter((l) => l.length >= 2).length;
    el.innerHTML = `
      <div class="pag-cab"><div><p class="eyebrow">Fiscalização</p><h1>Notificações de inadimplência</h1></div></div>
      <p class="muted">O site registra uma notificação, sem ninguém precisar lançar, quando a retirada de um cooperado é paga sem quitar nenhuma cota mensal atrasada, a partir da 2ª retirada dele. O cooperado vê a notificação na conta dele.</p>
      <div class="notice">A notificação <b>não é advertência</b>. A advertência escrita é sanção: o CA instaura o processo disciplinar, o cooperado tem 15 dias para se defender e o CA decide por maioria absoluta (Estatuto, arts. 15 e 16; Regimento, art. 27). Duas advertências escritas permitem a eliminação. Use as notificações como prova no processo.${pode ? "" : " O Conselho Fiscal acompanha aqui e, se o CA não agir, registra inconformidade na página do Conselho Fiscal."}</div>
      <div class="kpis">
        <div class="kpi"><span class="rot">Em aberto</span><span class="val">${lista.filter((n) => n.status === "aberta").length}</span><span class="det">Aguardando providência do CA</span></div>
        <div class="kpi"><span class="rot">Em processo</span><span class="val">${lista.filter((n) => n.status === "processo").length}</span><span class="det">Processo disciplinar instaurado</span></div>
        <div class="kpi"><span class="rot">Cooperados com 2 ou mais</span><span class="val">${reincidentes}</span><span class="det">Reincidência</span></div>
      </div>
      ${lista.length ? `<div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Registrada em</th><th>Cooperado</th><th>Cotas em aberto no pagamento</th><th class="num">Valor</th><th>Situação</th><th>Providência</th>${pode ? "<th></th>" : ""}</tr></thead>
        <tbody>${lista.map((n) => `<tr>
          <td>${dataHora(n.criado_em)}</td>
          <td>${esc(n.cooperado_nome || "—")}<span class="sub">${n.numero}ª notificação · ${n.retiradas_pagas}ª retirada</span></td>
          <td>${esc(meses(n)) || "—"}</td>
          <td class="num">${moeda(n.valor)}</td>
          <td>${selo(n.status)}</td>
          <td>${n.providencia ? esc(n.providencia) : '<span class="hint">—</span>'}${n.decidido_nome ? `<span class="sub">${esc(n.decidido_nome)} · ${dataHora(n.decidido_em)}</span>` : ""}</td>
          ${pode ? `<td class="acoes-celula"><button class="btn btn-ghost btn-sm" data-dec="${n.id}">Registrar providência</button></td>` : ""}</tr>`).join("")}</tbody>
      </table></div>` : '<p class="vazio">Nenhuma notificação registrada.</p>'}`;

    if (!pode) return;
    el.onclick = (ev) => {
      const b = ev.target.closest("[data-dec]"); if (!b) return;
      const n = lista.find((x) => x.id === b.dataset.dec);
      const m = UI.modal(`
        <h2>Providência · ${esc(n.cooperado_nome || "")}</h2>
        <p class="muted">${n.numero}ª notificação: ${esc(meses(n))} (${moeda(n.valor)}) em aberto quando a ${n.retiradas_pagas}ª retirada foi paga.</p>
        <div class="field"><label for="nt-st">Situação</label><select class="input" id="nt-st">${Object.keys(ST).map((k) => `<option value="${k}" ${k === n.status ? "selected" : ""}>${ST[k][1]}</option>`).join("")}</select>
          <span class="hint">"Advertência aplicada" só depois do processo disciplinar julgado pelo CA.</span></div>
        <div class="field"><label for="nt-pv">Providência (o cooperado vê)</label><textarea class="input" id="nt-pv" rows="3" maxlength="600" placeholder="Ex.: Processo disciplinar nº 1/2026 instaurado em reunião do CA de 15/11/2026.">${esc(n.providencia || "")}</textarea></div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="nt-ok">Salvar</button></div>`);
      $("#nt-ok", m.el).onclick = async (e2) => {
        const st = $("#nt-st", m.el).value, pv = $("#nt-pv", m.el).value.trim();
        if (st !== "aberta" && !pv) return toast("Descreva a providência.", "err");
        const ok = await acao(e2.currentTarget, () => API.notif.decidir(n.id, { status: st, providencia: pv }), "Providência registrada.");
        if (ok) { m.fechar(); recarregar(); }
      };
    };
  }

  window.Notificacoes = { contador, render, selo, meses };
})();
