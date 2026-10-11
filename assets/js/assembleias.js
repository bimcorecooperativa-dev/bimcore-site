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
  let salaId = null, timer = null, chamada = null, gravador = null;

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
  const sairVideo = () => { if (chamada) { const c = chamada; chamada = null; try { c.destroy(); } catch (e) {} } };
  const parar = () => { if (timer) { clearInterval(timer); timer = null; } sairVideo(); };

  /* ---------- Vídeo dentro do site ---------- */
  const provedor = (url) => { try { const h = new URL(url).hostname; if (/\.daily\.co$/.test(h)) return "daily"; if (/jit\.si$|8x8\.vc$|jitsi/.test(h)) return "jitsi"; return "externo"; } catch (e) { return "externo"; } };
  let dailyCarregando = null;
  const carregarDaily = () => dailyCarregando || (dailyCarregando = new Promise((ok, erro) => {
    if (window.Daily) return ok(window.Daily);
    const sc = document.createElement("script"); sc.src = "assets/vendor/daily-js-0.92.2.js"; sc.onload = () => ok(window.Daily); sc.onerror = () => { dailyCarregando = null; erro(new Error("Não foi possível carregar o vídeo.")); }; document.head.appendChild(sc);
  }));
  let montagem = 0;
  async function montarVideo(box, url, nome) {
    const minha = ++montagem;
    sairVideo(); box.innerHTML = "";
    const tipo = provedor(url);
    if (tipo === "daily") {
      const Daily = await carregarDaily();
      const velha = Daily.getCallInstance && Daily.getCallInstance(); if (velha) { try { await velha.destroy(); } catch (e) {} }
      if (minha !== montagem) return;
      chamada = Daily.createFrame(box, { url, userName: nome, showLeaveButton: false, showFullscreenButton: true, iframeStyle: { width: "100%", height: "100%", border: "0", borderRadius: "8px" } });
      await chamada.join({ url, userName: nome }).catch(() => {});
    } else if (tipo === "jitsi") {
      const f = document.createElement("iframe");
      f.src = url + (url.includes("#") ? "&" : "#") + `userInfo.displayName=${encodeURIComponent(JSON.stringify(nome))}&config.prejoinConfig.enabled=false`;
      f.allow = "camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"; f.style.cssText = "width:100%;height:100%;border:0;border-radius:8px";
      box.appendChild(f);
    } else {
      box.innerHTML = `<div class="asm-video-fora"><p>Esta plataforma (${esc(new URL(url).hostname)}) não permite aparecer dentro do site. O vídeo abre numa janela ao lado; mantenha esta página aberta para votar e acompanhar.</p>
        <button class="btn btn-primary" type="button" data-janela="${esc(url)}">Abrir o vídeo em janela</button></div>`;
    }
  }
  /* Gravação gratuita no navegador de quem dirige: grava esta aba (vídeo e áudio de todos) + o seu microfone */
  async function gravar(botao, nomeArquivo) {
    if (gravador) { gravador.stop(); return; }
    try {
      const tela = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true, preferCurrentTab: true, selfBrowserSurface: "include" });
      let mic = null; try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {}
      const ac = new AudioContext(), dest = ac.createMediaStreamDestination();
      if (tela.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(tela.getAudioTracks())).connect(dest);
      if (mic) ac.createMediaStreamSource(mic).connect(dest);
      const fluxo = new MediaStream([...tela.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const tipo = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
      const partes = []; gravador = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : {});
      gravador.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
      gravador.onstop = () => {
        [tela, mic].forEach((m) => m && m.getTracks().forEach((t) => t.stop())); ac.close();
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(partes, { type: "video/webm" })); a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
        gravador = null; botao.textContent = "Gravar a assembleia"; botao.classList.remove("btn-danger");
        toast("Gravação salva no seu computador. Envie ao Google Drive da cooperativa e cole o link na ata (guarda por 5 anos).");
      };
      tela.getVideoTracks()[0].onended = () => { if (gravador && gravador.state !== "inactive") gravador.stop(); };
      gravador.start(10000); botao.textContent = "● Gravando: clique para parar e salvar"; botao.classList.add("btn-danger");
      toast("Gravando. Na janela do navegador, escolha ESTA aba e marque compartilhar o áudio da aba.");
    } catch (e) { gravador = null; toast("Gravação não iniciada: " + (e.message || "permissão negada."), "err"); }
  }
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
  const CARGO_CA = { presidente: "Presidente do Conselho de Administração", gestao_tecnica: "Conselheiro(a) de Gestão Técnica, BIM e Qualidade de Projetos", financeira: "Conselheiro(a) de Área Financeira e de Fundos", institucional: "Conselheiro(a) de Área Institucional, Contratos e Relações Externas", conselheiro: "Conselheiro(a) de Administração" };
  const nomeDe = (d, id) => ((d.membros || []).find((m) => m.id === id) || d.presencas.find((x) => x.perfil_id === id) || {}).nome || "—";
  const listaNomes = (d, ids) => (ids || []).map((x) => nomeDe(d, x)).join(", ");

  /* Quem assina a ata (Estatuto, art. 39, §1º): Mesa, administradores e conselheiros fiscais presentes e a comissão */
  function signatariosPadrao(d) {
    const a = d.assembleia, pres = new Set(d.presencas.map((x) => x.perfil_id)), out = [];
    const add = (id, q) => { if (!id) return; const x = out.find((o) => o.perfil_id === id); if (x) { if (!x.qualidade.includes(q)) x.qualidade += " / " + q; return; } out.push({ perfil_id: id, nome: nomeDe(d, id), qualidade: q, cpf: "" }); };
    add(a.mesa_presidente, "Presidente da Mesa");
    add(a.mesa_secretario, "Secretário(a) da Mesa");
    (d.membros || []).filter((m) => pres.has(m.id) && m.conselho_adm).forEach((m) => add(m.id, CARGO_CA[m.cargo_ca] || "Conselheiro(a) de Administração"));
    (d.membros || []).filter((m) => pres.has(m.id) && m.conselho_fiscal).forEach((m) => add(m.id, "Conselheiro(a) Fiscal"));
    (a.comissao || []).forEach((id) => add(id, "Comissão de assinatura da ata"));
    return out;
  }

  function rascunhoAta(d, signatarios) {
    const a = d.assembleia, pres = d.presencas, q = a.instalada_convocacao, notas = a.notas || {};
    const pautas = d.pautas.filter((p) => p.especial !== "comissao"), pc = d.pautas.find((p) => p.especial === "comissao");
    const nota = (k) => String(notas[k] || "").trim();
    const linhas = [];
    linhas.push(`ATA DA ${(a.tipo === "pre" ? "PRÉ-ASSEMBLEIA" : TIPOS[a.tipo].toUpperCase())} DA ${EMPRESA.nome} — CNPJ ${EMPRESA.cnpj}`);
    linhas.push("");
    linhas.push(`Em ${quando(a.data_hora)}, reuniram-se em ambiente digital${a.plataforma ? " (" + a.plataforma + ")" : ""}, nos termos do art. 31 do Estatuto Social, os cooperados da BIMCORE, convocados por edital publicado em ${a.edital_publicado_em ? data(a.edital_publicado_em) : "—"}${a.convocacao_enviada_em ? " e comunicado por e-mail em " + data(a.convocacao_enviada_em) : ""}.`);
    if (a.status === "sem_quorum") {
      linhas.push(`Durante o período mínimo da sessão registraram presença ${pres.filter((x) => x.apto).length} cooperado(s) apto(s), de um total de ${a.membros_na_data || "—"}, número insuficiente para a instalação (Estatuto, art. 32). A assembleia não foi instalada e deverá ser feita nova convocação, com antecedência mínima de 10 dias úteis.`);
      if (nota("abertura")) linhas.push(nota("abertura"));
    } else {
      linhas.push(`Registraram presença pela plataforma, com identificação individual, ${pres.length} cooperado(s), dos quais ${a.instalada_presentes} apto(s) a votar, de um total de ${a.membros_na_data || "—"} cooperados na data do edital${q ? `, atingindo o quórum da ${q}ª convocação (art. 32)` : ""}. A assembleia foi instalada às ${hora(a.instalada_em)}.`);
      linhas.push(`Presidiu os trabalhos ${nomeDe(d, a.mesa_presidente)}, que convidou ${nomeDe(d, a.mesa_secretario)} para secretariar (Estatuto, art. 36).`);
      if (pc && pc.resultado) {
        const r = pc.resultado;
        linhas.push(`Como primeiro ato, a assembleia ${r.resultado === "aprovada" ? "designou" : "não aprovou"} a comissão proposta para assinar a presente ata (art. 39, §1º)${r.resultado === "aprovada" ? ", composta por " + listaNomes(d, a.comissao_proposta) : ""}, por ${r.favor} voto(s) a favor, ${r.contra} contra e ${r.abstencao} abstenção(ões).`);
      }
      if (a.comissao && (!pc || !pc.resultado || pc.resultado.resultado !== "aprovada")) linhas.push(`A assembleia designou para assinar a presente ata a comissão composta por ${listaNomes(d, a.comissao)} (art. 39, §1º).`);
      if (nota("abertura")) linhas.push(nota("abertura"));
      linhas.push("");
      linhas.push("ORDEM DO DIA E DELIBERAÇÕES");
      pautas.forEach((p, i) => {
        const r = p.resultado;
        linhas.push(`${i + 1}. ${p.titulo}.${p.descricao ? " " + p.descricao + "." : ""}`);
        if (nota(p.id)) linhas.push("   " + nota(p.id).replace(/\n/g, "\n   "));
        if (!r) { linhas.push("   Não foi votada."); return; }
        linhas.push(`   Votação ${r.secreto ? "secreta" : "aberta"}${p.impedir_orgaos ? ", sem o voto dos membros dos órgãos de administração e fiscalização (arts. 37 e 42, §1º)" : ""}: ${r.favor} a favor, ${r.contra} contra, ${r.abstencao} abstenção(ões) e ${r.nao_votaram} sem voto, de ${r.aptos} aptos presentes. Resultado: ${RES[r.resultado] ? RES[r.resultado][0].toUpperCase() : r.resultado}${r.resultado === "adiada" ? " para apreciação em assembleia futura (art. 38, §3º)" : ""}.`);
        if (!r.secreto) {
          const vs = d.votos.filter((v) => v.pauta_id === p.id);
          if (vs.length) linhas.push("   Votos: " + vs.map((v) => `${v.nome} (${VOTO[v.voto] || "—"})`).join("; ") + ".");
        }
      });
      linhas.push("");
      linhas.push("ASSUNTOS GERAIS");
      linhas.push(nota("gerais") || "Não houve manifestações em assuntos gerais. Nenhuma deliberação foi tomada fora da ordem do dia (art. 38, §1º).");
      linhas.push("");
      linhas.push(`Nada mais havendo a tratar, a assembleia foi encerrada às ${hora(a.encerrada_em)}. A gravação integral integra a documentação desta ata (art. 39, §3º)${a.gravacao_url ? ": " + a.gravacao_url : ""}. Eu, ${nomeDe(d, a.mesa_secretario)}, secretário(a), lavrei a presente ata, que, lida e achada conforme, vai assinada eletronicamente pelos abaixo indicados, por meio do gov.br (Lei nº 14.063/2020).`);
    }
    linhas.push("");
    linhas.push("PRESENTES (registro na plataforma)");
    pres.forEach((x) => linhas.push(`- ${x.nome} — entrada às ${hora(x.entrou_em)}${x.apto ? "" : " (sem direito a voto, admitido após o edital)"}`));
    if (signatarios && signatarios.length) {
      linhas.push("");
      linhas.push("ASSINATURAS (Estatuto, art. 39, §1º)");
      signatarios.forEach((g) => { linhas.push(""); linhas.push(""); linhas.push("________________________________________________"); linhas.push(g.nome.toUpperCase()); linhas.push(g.qualidade + (g.cpf ? " — CPF " + g.cpf : "")); });
    }
    return linhas.join("\n");
  }

  /* ---------- PDF da ata (o mesmo arquivo para todos assinarem no gov.br) ---------- */
  let pdfCarregando = null;
  const carregarPdf = () => pdfCarregando || (pdfCarregando = new Promise((ok, erro) => {
    if (window.jspdf) return ok(window.jspdf);
    const sc = document.createElement("script"); sc.src = "assets/vendor/jspdf-2.5.1.umd.min.js"; sc.onload = () => ok(window.jspdf); sc.onerror = () => { pdfCarregando = null; erro(new Error("Não foi possível carregar o gerador de PDF.")); }; document.head.appendChild(sc);
  }));
  async function gerarPdf(texto, a) {
    const { jsPDF } = await carregarPdf();
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setProperties({ title: `Ata — ${a.titulo}`, subject: "Ata de assembleia", author: EMPRESA.nome, creator: "bimcore.com.br" });
    const M = 22, L = 210 - 2 * M, H = 297; let y = M;
    const linhas = texto.split("\n");
    linhas.forEach((ln, i) => {
      const titulo = i === 0 || /^(ORDEM DO DIA|ASSUNTOS GERAIS|PRESENTES|ASSINATURAS)/.test(ln);
      doc.setFont("times", titulo ? "bold" : "normal"); doc.setFontSize(titulo && i === 0 ? 12.5 : 11);
      const partes = ln ? doc.splitTextToSize(ln, L) : [""];
      partes.forEach((t) => { if (y > H - M - 6) { doc.addPage(); y = M; } doc.text(t, i === 0 ? 105 : M, y, i === 0 ? { align: "center" } : undefined); y += 5.2; });
      if (titulo && i > 0) y += 0.8;
    });
    const n = doc.getNumberOfPages();
    for (let k = 1; k <= n; k++) { doc.setPage(k); doc.setFont("times", "normal"); doc.setFontSize(8.5); doc.setTextColor(110); doc.text(`${EMPRESA.nome} · ${TIPOS[a.tipo]} de ${new Date(a.data_hora).toLocaleDateString("pt-BR")} · página ${k} de ${n}`, 105, H - 10, { align: "center" }); doc.setTextColor(0); }
    return new Uint8Array(doc.output("arraybuffer"));
  }
  const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const latin1 = (bytes) => { let t = ""; for (let i = 0; i < bytes.length; i += 65536) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 65536)); return t; };
  const contarAssinaturas = (bytes) => (latin1(bytes).match(/\/ByteRange\s*\[/g) || []).length;
  const comecaCom = (a, b) => { if (a.length < b.length) return false; for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false; return true; };
  const baixar = (bytes, nome) => { const u = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); const l = document.createElement("a"); l.href = u; l.download = nome; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };

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
    if (as.some((a) => a.ata_fechada_em && !a.ata_concluida_em)) return { cor: "warn", texto: "Ata aguardando assinaturas gov.br" };
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
        ${["encerrada", "sem_quorum"].includes(a.status) ? `<button class="btn btn-ghost btn-sm" data-sala="${a.id}">${a.ata_publicada_em ? "Ata" : a.ata_fechada_em ? "Ata: assinaturas gov.br" : "Ata"}</button>` : ""}
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
  const PASSO_A_PASSO = `<details class="explica asm-passo" open><summary><b>Passo a passo para convocar e realizar a assembleia</b> (clique para recolher)</summary>
    <h4>Parte 1 — Montar a convocação (agora)</h4>
    <ol>
      <li><b>Tipo.</b> Escolha conforme o assunto:
        <ul>
          <li><b>Ordinária (AGO):</b> uma vez por ano, em dezembro: prestação de contas com parecer do Conselho Fiscal, destinação das sobras, eleição do Presidente e do Vice (Estatuto, art. 42).</li>
          <li><b>Extraordinária (AGE):</b> sempre que necessário, sobre qualquer assunto do edital. É a que se usa para um assunto <b>urgente ou imprevisto</b>. É obrigatória para reforma do Estatuto, fusão, incorporação, desmembramento, mudança de objeto e dissolução, que exigem 2/3 (arts. 43 e 44).</li>
          <li><b>Especial:</b> pelo menos uma vez por ano: plano de trabalho e orçamento, planejamento, nomeação e destituição do Conselho de Administração e do Conselho Fiscal, organização do trabalho (art. 45).</li>
          <li><b>Pré-assembleia:</b> conversa consultiva para amadurecer um tema antes da assembleia. Não tem quórum e não decide (RI, art. 60).</li>
        </ul></li>
      <li><b>Título.</b> Curto e claro, por exemplo "AGE: reajuste da tabela de valor-hora".</li>
      <li><b>Data e hora.</b> No mínimo 10 dias depois do dia em que você publicar o edital; o ideal são uns 20 (art. 30; RI, art. 61). Se a pauta veio de uma <b>proposta de cooperado</b>, a proposta precisa ter sido apresentada pelo menos 30 dias antes da data da assembleia (art. 7º, §1º). Se for urgente e ainda não tiver 30 dias, você pode levá-la como pauta da própria administração.</li>
      <li><b>Duração mínima.</b> Deixe 120 minutos ou mais: numa assembleia digital, o quórum é verificado durante todo esse período (art. 30, §2º).</li>
      <li><b>Sala de vídeo.</b> Cole o link da sala do Daily (por exemplo https://seunome.daily.co/assembleia). Pode ser a mesma sala para todas as assembleias.</li>
      <li><b>Quem convoca.</b> Seu nome e o cargo, por exemplo "Felipe Oliveira Gamboni, Presidente". Vai no edital.</li>
      <li><b>Mesa e comissão.</b> Escolha quem preside e quem secretaria (art. 36) e proponha até 5 cooperados para a comissão que assina a ata. A assembleia confirma a comissão logo na instalação (art. 39, §1º).</li>
      <li>Clique em <b>Salvar</b>. A assembleia vira <b>rascunho</b> (só a gestão vê) e esta janela reabre para as pautas.</li>
      <li><b>Pautas da ordem do dia.</b> Inclua uma por vez, cada uma com um assunto só. Para cada uma:
        <ul>
          <li>marque <b>2/3</b> se for reforma do Estatuto, fusão, incorporação, desmembramento, mudança de objeto ou dissolução;</li>
          <li>marque <b>"administração e Conselho Fiscal não votam"</b> se for prestação de contas ou assunto que diga respeito a eles (arts. 37 e 42, §1º).</li>
        </ul>
        Só pode ser votado o que estiver no edital. Assunto novo no dia só é discutido e exige outra assembleia para decidir (art. 38).</li>
      <li>Feche e confira o rascunho. Quando estiver tudo certo, clique em <b>Publicar edital</b>. A partir daí, data, tipo e pautas <b>não mudam mais</b>; se algo estiver errado, cancele e convoque outra.</li>
      <li>Clique em <b>Enviar convocação</b>:
        <ol type="a">
          <li><b>Copiar edital</b>, depois <b>Abrir e-mail</b> (todos em cópia oculta). Cole o edital no corpo e envie (art. 34);</li>
          <li><b>Compartilhar no WhatsApp</b> no grupo da cooperativa (RI, art. 61);</li>
          <li><b>Marcar convocação como enviada</b>. A data vai para a ata.</li>
        </ol></li>
      <li>Lembre quem ainda não tem conta no site de criar a conta antes do dia. Sem conta, a pessoa não registra presença nem vota, e o quórum conta o quadro social inteiro.</li>
    </ol>
    <h4>Parte 2 — No dia</h4>
    <ol>
      <li>Até 30 minutos antes, entre em <b>Assembleias</b>, abra a assembleia e clique em <b>Abrir a sala</b>.</li>
      <li>Clique em <b>Registrar minha presença e entrar</b>. O vídeo aparece; permita câmera e microfone.</li>
      <li>Clique em <b>Gravar a assembleia</b> (Chrome ou Edge, no computador). Escolha <b>esta aba</b> e marque <b>compartilhar áudio da aba</b>. A gravação é obrigatória (art. 31, §1º, III).</li>
      <li>Acompanhe o quórum na tela: 2/3 na 1ª hora, metade + 1 na 2ª, mínimo de 4 a partir da 3ª. Quando atingir, clique em <b>Instalar a assembleia</b>. Antes do horário do edital não instala.</li>
      <li>Se houver comissão proposta, ela aparece como <b>primeiro item</b>: abra a votação e apure. Se for rejeitada, a assembleia indica outros nomes e a mesa usa <b>Registrar comissão escolhida</b>.</li>
      <li>O secretário escreve, no quadro <b>"Ata: o que está sendo registrado"</b>, o resumo da abertura, da discussão de cada pauta e dos assuntos gerais. As votações entram sozinhas. Em prestação de contas, passe a condução a um cooperado indicado pelo plenário; você e os conselheiros saem da mesa, mas continuam presentes para esclarecer (art. 37).</li>
      <li>Para cada pauta, na ordem:
        <ol type="a">
          <li>apresente e abra a discussão no vídeo;</li>
          <li>se alguém pedir voto secreto, decida com a assembleia; se for o caso, marque <b>Voto secreto</b> (art. 40, §2º);</li>
          <li>clique em <b>Abrir votação</b>. Todos veem o quadro de votação e votam A favor, Contra ou Abstenção;</li>
          <li>quando todos tiverem votado, ou o tempo combinado acabar, clique em <b>Encerrar e apurar</b>. O site aplica a regra: maioria absoluta dos presentes aptos (ou 2/3); se as abstenções passarem de 50%, a pauta é adiada (art. 38).</li>
        </ol></li>
      <li>Ao final, clique em <b>Encerrar a assembleia</b> e pare a gravação. O arquivo é salvo no seu computador: envie ao Google Drive da cooperativa, onde fica guardado por 5 anos.</li>
      <li><b>Se não der quórum:</b> espere todo o período mínimo da sessão e clique em <b>Encerrar sem quórum</b>. Faça nova convocação com pelo menos 10 dias úteis (art. 32).</li>
    </ol>
    <h4>Parte 3 — Ata (em até 10 dias)</h4>
    <ol>
      <li>Depois do encerramento, o texto da ata aparece montado: registros da sessão, votações e anotações da mesa. Não se edita à mão.</li>
      <li>A mesa cola o link da gravação, clica em <b>Fechar a ata e gerar o PDF</b> e confere quem assina e em que ordem (mesa, administradores e conselheiros fiscais presentes e comissão), com o CPF de cada um. O PDF fica travado.</li>
      <li>Cada signatário, na sua vez, baixa a versão atual, assina em <b>assinador.iti.gov.br</b> com a conta gov.br e envia de volta o PDF assinado. O site confere se há uma assinatura nova e se o conteúdo é o mesmo.</li>
      <li>Com todas as assinaturas, clique em <b>Publicar a ata</b> (RI, art. 63). Quando a matéria exigir registro, é esse PDF que vai para a JUCERJA.</li>
      <li>A <b>confirmação de presença</b> no site é outra coisa: registra quem participou, mas não substitui a assinatura da ata.</li>
    </ol>
  </details>`;
  function formAssembleia(a, aoSalvar, pre) {
    pre = pre || {};
    const min = new Date(Date.now() + 10 * 86400000 + 3600000);
    const m = UI.modal(`<h2>${a ? "Editar assembleia" : "Convocar assembleia"}</h2>
      ${a ? PASSO_A_PASSO.replace('class="explica asm-passo" open>', 'class="explica asm-passo">') : PASSO_A_PASSO}
      ${pre.proposta ? `<div class="notice">Convocando a partir da proposta <b>${esc(pre.proposta.titulo)}</b>, de ${esc(pre.proposta.autor_nome || "")}. Ela entra sozinha como pauta.</div>` : ""}
      <div class="form-grid">
        <div class="field"><label for="as-tipo">Tipo</label><select class="input" id="as-tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${(a ? a.tipo : pre.tipo) === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label for="as-tit">Título</label><input class="input" id="as-tit" maxlength="120" value="${esc(a ? a.titulo : pre.titulo || "")}" placeholder="Ex.: Aprovação do Plano Anual 2027"></div>
        <div class="field"><label for="as-dh">Data e hora</label><input class="input" id="as-dh" type="datetime-local" value="${a ? localDT(a.data_hora) : localDT(min.toISOString())}"></div>
        <div class="field"><label for="as-dur">Duração mínima (minutos)</label><input class="input" id="as-dur" type="number" min="120" step="30" value="${a ? a.duracao_min : 120}"><span class="hint">Digital: no mínimo 2 horas (art. 30, §2º).</span></div>
        <div class="field"><label for="as-plat">Plataforma de vídeo</label><input class="input" id="as-plat" maxlength="60" value="${esc(a ? a.plataforma || "" : "Daily")}"></div>
        <div class="field"><label for="as-link">Link da sala de vídeo</label><input class="input" id="as-link" type="url" value="${esc(a ? a.link_video || "" : "")}" placeholder="https://seunome.daily.co/assembleia"></div>
        <div class="field full"><label for="as-conv">Quem convoca (nome e qualidade, vai no edital)</label><input class="input" id="as-conv" maxlength="120" value="${esc(a ? a.convocante || "" : "")}" placeholder="Ex.: Felipe Oliveira Gamboni, Presidente"></div>
      </div>
      <h3 class="mini-tit">Mesa e comissão da ata</h3>
      <p class="hint">Quem preside e quem secretaria ficam definidos antes (Estatuto, art. 36); o secretário escreve a ata durante a sessão. A comissão de até 5 cooperados que assina a ata é <b>proposta</b> aqui e <b>confirmada pela assembleia</b> logo na instalação (art. 39, §1º). Dá para ajustar até a instalação.</p>
      <div class="form-grid" id="as-mesa"><p class="hint">Carregando cooperados…</p></div>
      ${a ? `<h3 class="mini-tit">Ordem do dia</h3><div id="as-pautas"></div>
        <div class="form-grid">
          <div class="field full"><label for="pa-tit">Nova pauta</label><input class="input" id="pa-tit" maxlength="200" placeholder="Ex.: Aprovação da Tabela de Referência Remuneratória 2027"></div>
          <div class="field full"><label for="pa-desc">Detalhes (opcional)</label><input class="input" id="pa-desc" maxlength="400"></div>
          <div class="field"><label for="pa-q">Aprovação exige</label><select class="input" id="pa-q"><option value="maioria">Maioria absoluta dos presentes (art. 38, §4º)</option><option value="dois_tercos">2/3 dos presentes: estatuto, fusão, dissolução etc. (art. 44)</option></select></div>
          <label class="ciente"><input type="checkbox" id="pa-imp"> <span>Membros da administração e do Conselho Fiscal não votam (prestação de contas ou assunto que lhes diga respeito, arts. 37 e 42, §1º)</span></label>
          <div class="full"><button class="btn btn-ghost btn-sm" id="pa-add" type="button">Adicionar pauta</button></div>
        </div>` : '<p class="hint">Depois de salvar, você inclui as pautas da ordem do dia.</p>'}
      <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Fechar</button><button class="btn btn-primary btn-sm" id="as-ok">Salvar</button></div>`, aoSalvar);
    let membros = [];
    (async () => {
      membros = (await API.cooperados.listar().catch(() => [])).filter((p) => p.status === "ativo").sort((x, y) => String(x.nome).localeCompare(String(y.nome)));
      const box = $("#as-mesa", m.el); if (!box) return;
      const opt = (sel) => `<option value="">— escolher —</option>${membros.map((p) => `<option value="${p.id}" ${sel === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}`;
      const com = new Set((a && a.comissao_proposta) || []);
      box.innerHTML = `<div class="field"><label for="as-mp">Preside a mesa</label><select class="input" id="as-mp">${opt(a && a.mesa_presidente)}</select></div>
        <div class="field"><label for="as-ms">Secretaria a mesa</label><select class="input" id="as-ms">${opt(a && a.mesa_secretario)}</select></div>
        <div class="field full"><label>Comissão proposta para assinar a ata (até 5)</label><div class="part-lista">${membros.map((p) => `<label class="ciente"><input type="checkbox" data-com value="${p.id}" ${com.has(p.id) ? "checked" : ""}> <span>${esc(p.nome)}</span></label>`).join("")}</div></div>`;
    })();
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
      if ($("#as-mp", m.el)) {
        d.mesa_presidente = $("#as-mp", m.el).value || null; d.mesa_secretario = $("#as-ms", m.el).value || null;
        d.comissao_proposta = [...m.el.querySelectorAll("[data-com]:checked")].map((i) => i.value);
        if (d.mesa_presidente && d.mesa_presidente === d.mesa_secretario) return toast("Presidente e secretário da mesa precisam ser pessoas diferentes.", "err");
        if (d.comissao_proposta.length > 5) return toast("A comissão tem no máximo 5 cooperados (art. 39, §1º).", "err");
        if (a && !["rascunho", "agendada", "aberta"].includes(a.status)) { delete d.mesa_presidente; delete d.mesa_secretario; delete d.comissao_proposta; }
      }
      if (d.tipo !== "pre" && new Date(d.data_hora) < new Date(Date.now() + 10 * 86400000)) toast("Atenção: para publicar o edital, a data precisa estar a pelo menos 10 dias.", "err");
      if (a) d.id = a.id;
      const ok = await acao(e.currentTarget, () => API.assembleias.salvar(d), a ? "Assembleia atualizada." : "Rascunho criado. Agora inclua as pautas.");
      if (ok) {
        m.fechar();
        if (!a) {
          const lista = await API.assembleias.listar(); let novo = lista.filter((x) => x.status === "rascunho" && x.titulo === d.titulo).sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0];
          if (novo && pre.proposta) {
            await API.assembleias.salvarPauta({ assembleia_id: novo.id, ordem: 1, titulo: pre.proposta.titulo, descricao: `Proposta de ${pre.proposta.autor_nome || "cooperado"}: ${pre.proposta.descricao}`.slice(0, 400) }).catch(() => {});
            await API.propostas.editar(pre.proposta.id, { status: "incluida", assembleia_id: novo.id, resposta: pre.resposta || "Incluída como pauta de assembleia." }).catch(() => {});
            novo = (await API.assembleias.listar()).find((x) => x.id === novo.id) || novo;
          }
          if (novo) formAssembleia(novo, aoSalvar);
        }
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
          <section class="painel asm-video" id="sa-video"><div class="asm-video-cab"><h2>Videoconferência</h2><div id="sa-vctl" class="sol-acoes"></div></div><div id="sa-frame" class="asm-frame"></div><div id="sa-vinfo"></div></section>
          <section class="painel" id="sa-topo"></section>
          <section class="painel" id="sa-pautas"></section>
          <section class="painel" id="sa-notas" hidden></section>
          <section class="painel" id="sa-ata"></section>
        </div>
        <aside class="asm-col asm-lado">
          <div id="sa-votacao" class="asm-votacao" hidden></div>
          <section class="painel asm-chat" id="sa-chat"><h2>Chat</h2><div class="asm-msgs" id="sa-msgs"></div>
            <form id="sa-cf" class="asm-chat-f" novalidate><input class="input" id="sa-ct" maxlength="1000" placeholder="Escreva e tecle Enter" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">Enviar</button></form></section>
          <section class="painel" id="sa-pres"></section>
        </aside>
      </div>`;
    let videoEstado = null;
    $("#asm-voltar").onclick = (e) => { e.preventDefault(); salaId = null; parar(); render(el, ctx); };

    const desenhar = () => {
      const a = d.assembleia, q = d.quorum || {}, presente = d.presencas.some((x) => x.perfil_id === eu), minha = d.presencas.find((x) => x.perfil_id === eu);
      const mesa = g || [a.mesa_presidente, a.mesa_secretario].includes(eu);
      $("#sa-tit").textContent = `${TIPOS[a.tipo]}: ${a.titulo}`;
      $("#sa-st").innerHTML = selo(a.status);
      // topo: horário, quórum, comandos
      const pct = q.necessario ? Math.min(100, (q.presentes / q.necessario) * 100) : 0;
      $("#sa-topo").innerHTML = `
        <p class="muted">${esc(quando(a.data_hora))} · edital de ${a.edital_publicado_em ? data(a.edital_publicado_em) : "—"} · ${a.membros_na_data || "—"} cooperados na data do edital ${a.status !== "rascunho" ? '<button class="btn btn-ghost btn-sm" id="sa-edital">Ver edital</button>' : ""}</p>
        ${a.tipo !== "pre" ? `<p class="hint">Mesa: preside <b>${esc(a.mesa_presidente ? nomeDe(d, a.mesa_presidente) : "a definir")}</b>, secretaria <b>${esc(a.mesa_secretario ? nomeDe(d, a.mesa_secretario) : "a definir")}</b> · Comissão da ata ${a.comissao ? "designada: <b>" + esc(listaNomes(d, a.comissao)) + "</b>" : (a.comissao_proposta || []).length ? "proposta: " + esc(listaNomes(d, a.comissao_proposta)) + " (a assembleia confirma na instalação)" : "ainda não proposta"}
          ${g && ["agendada", "aberta"].includes(a.status) ? ' <button class="btn btn-ghost btn-sm" id="sa-mesa">Mesa e comissão</button>' : ""}
          ${mesa && a.status === "instalada" && !a.comissao ? ' <button class="btn btn-ghost btn-sm" id="sa-com">Registrar comissão escolhida</button>' : ""}</p>` : ""}
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
      // vídeo: só remonta quando muda o link ou a situação (para não derrubar a chamada a cada atualização)
      const podeVer = ativa() && presente && !!a.link_video;
      const estado = (podeVer ? "on:" : "off:") + (a.link_video || "") + ":" + a.status + ":" + presente;
      if (estado !== videoEstado) {
        videoEstado = estado;
        const fr = $("#sa-frame");
        if (podeVer) { fr.classList.remove("vazia"); montarVideo(fr, a.link_video, (ctx.sessao.perfil.nome || "Cooperado")).catch((e) => { fr.innerHTML = `<p class="vazio">${esc(e.message)}</p>`; }); }
        else {
          sairVideo(); fr.classList.add("vazia");
          fr.innerHTML = `<p class="vazio">${!a.link_video ? "A sala de vídeo ainda não foi configurada." : ["encerrada", "sem_quorum", "cancelada"].includes(a.status) ? "A assembleia terminou." : !ativa() ? "O vídeo aparece aqui quando a sala abrir (30 minutos antes do horário)." : "Registre sua presença abaixo para entrar no vídeo."}</p>`;
        }
        $("#sa-vctl").innerHTML = g && ativa() ? `<button class="btn btn-ghost btn-sm permitido" id="sa-gravar" type="button">${gravador ? "● Gravando: clique para parar e salvar" : "Gravar a assembleia"}</button>` : "";
        $("#sa-vinfo").innerHTML = `<p class="hint">Câmera e microfone pedem permissão do navegador na primeira vez. A sessão é gravada integralmente (art. 31, §1º, III).${a.gravacao_url ? ` <a href="${esc(a.gravacao_url)}" target="_blank" rel="noopener">Ver gravação</a>` : ""}</p>
          ${g && !["encerrada", "sem_quorum", "cancelada"].includes(a.status) ? `<details class="explica"><summary>Configurar a sala de vídeo</summary><form id="sa-lf" class="asm-chat-f" novalidate style="margin-top:.5rem"><input class="input" id="sa-link" type="url" placeholder="https://bimcore.daily.co/assembleia" value="${esc(a.link_video || "")}"><button class="btn btn-ghost btn-sm" type="submit">Salvar link</button></form><p class="hint">Use uma sala do Daily (aparece dentro do site, gratuito até 10.000 minutos por mês). Links do Google Meet ou Zoom abrem em janela ao lado.</p></details>` : ""}`;
      }
      // presença
      const confirmou = (pid) => d.assinaturas.some((x) => x.perfil_id === pid);
      $("#sa-pres").innerHTML = `<h2>Presentes <span class="contador">${d.presencas.length}</span></h2>
        ${d.presencas.length ? `<ul class="asm-presentes">${d.presencas.map((x) => `<li>${esc(x.nome)}<span class="sub">${hora(x.entrou_em)}${x.apto ? "" : " · sem voto"}${x.orgao ? " · órgão" : ""}${confirmou(x.perfil_id) ? " · ✓ presença confirmada" : ""}</span></li>`).join("")}</ul>` : '<p class="vazio">Ninguém entrou ainda.</p>'}
        ${presente && !confirmou(eu) && !a.ata_publicada_em && ["aberta", "instalada", "encerrada", "sem_quorum"].includes(a.status) ? '<div class="sol-acoes"><button class="btn btn-ghost btn-sm" id="sa-assinar">Confirmar minha presença e participação</button></div>' : ""}
        <p class="hint">A confirmação de presença é feita no site. Ela não substitui a assinatura da ata, que é feita pelo gov.br.</p>`;
      // anotações da mesa (ata circunstanciada, escrita durante a sessão)
      const nt = $("#sa-notas"), notas = a.notas || {};
      const emSessao = ["aberta", "instalada"].includes(a.status);
      nt.hidden = !emSessao;
      if (!nt.hidden && !nt.contains(document.activeElement)) {
        const campo = (k, rot, dica) => mesa ? `<div class="field full"><label for="nt-${k}">${rot}</label><textarea class="input" id="nt-${k}" data-nota="${k}" rows="3" maxlength="20000" placeholder="${esc(dica)}">${esc(notas[k] || "")}</textarea></div>`
          : notas[k] ? `<p><b>${rot}</b><br>${esc(notas[k]).replace(/\n/g, "<br>")}</p>` : "";
        nt.innerHTML = `<h2>Ata: o que está sendo registrado</h2>
          <p class="hint">${mesa ? "Você é da mesa: escreva aqui, durante a sessão, o resumo do que for discutido (falas relevantes, propostas, declarações de voto, pedidos para constar em ata). O site salva ao sair de cada campo. As votações entram sozinhas. Quando a assembleia for encerrada, o texto trava." : "A mesa registra aqui o resumo da discussão, que entra na ata. As votações entram sozinhas."}</p>
          ${campo("abertura", "Abertura e informes", "Ex.: o Presidente apresentou a pauta e os informes da administração…")}
          ${d.pautas.map((p, i) => campo(p.id, p.especial === "comissao" ? "Designação da comissão" : `Pauta ${d.pautas.filter((x) => x.especial !== "comissao").indexOf(p) + 1}: ${esc(p.titulo)}`, "Resumo da discussão desta pauta")).join("")}
          ${campo("gerais", "Assuntos gerais", "O que foi falado fora da ordem do dia (sem deliberar, art. 38, §1º)")}
          ${mesa ? '<p class="hint" id="nt-st"></p>' : ""}`;
      }
      // pautas
      const votoMeu = (p) => d.votantes.some((v) => v.pauta_id === p.id && v.perfil_id === eu);
      const podeVotar = (p) => minha && minha.apto && !(p.impedir_orgaos && minha.orgao);
      const atual = d.pautas.find((p) => p.status === "em_votacao"), bar = $("#sa-votacao");
      if (atual) {
        const nv = d.votantes.filter((v) => v.pauta_id === atual.id).length, aptos = d.presencas.filter((x) => x.apto && !(atual.impedir_orgaos && x.orgao)).length;
        const meu = d.votos.filter((v) => v.pauta_id === atual.id && v.perfil_id === eu)[0];
        bar.hidden = false;
        bar.innerHTML = `<div><span class="eyebrow">Votação aberta · pauta ${d.pautas.indexOf(atual) + 1}</span><b>${esc(atual.titulo)}</b>
            <span class="hint">${nv} de ${aptos} aptos já votaram · ${atual.voto_secreto ? "voto secreto" : "voto aberto"} · ${atual.quorum === "dois_tercos" ? "exige 2/3" : "maioria absoluta"}</span></div>
          <div class="asm-votar">${votoMeu(atual) ? `<span class="selo ok">Seu voto foi registrado${meu && meu.voto ? ": " + VOTO[meu.voto] : ""}</span>`
            : podeVotar(atual) ? Object.entries(VOTO).map(([k, t]) => `<button class="btn ${k === "favor" ? "btn-primary" : k === "contra" ? "btn-danger" : "btn-ghost"}" data-votar="${atual.id}" data-voto="${k}">${t}</button>`).join("")
            : `<span class="hint">${!minha ? "Registre sua presença para votar." : !minha.apto ? "Você não vota nesta assembleia." : "Você não vota nesta pauta."}</span>`}
            ${g ? `<button class="btn btn-ghost btn-sm" data-encp="${atual.id}">Encerrar e apurar</button>` : ""}</div>`;
      } else { bar.hidden = true; bar.innerHTML = ""; }
      $("#sa-pautas").innerHTML = `<h2>Ordem do dia</h2>${d.pautas.map((p, i) => {
        const r = p.resultado, nv = d.votantes.filter((v) => v.pauta_id === p.id).length;
        const aptos = d.presencas.filter((x) => x.apto && !(p.impedir_orgaos && x.orgao)).length;
        const meus = d.votos.filter((v) => v.pauta_id === p.id && v.perfil_id === eu)[0];
        return `<article class="asm-pauta ${p.status === "em_votacao" ? "votando" : ""}">
          <div class="asm-card-cab"><div><b>${i + 1}. ${esc(p.titulo)}</b>${p.descricao ? `<span class="sub">${esc(p.descricao)}</span>` : ""}
            <span class="sub">${p.quorum === "dois_tercos" ? "Exige 2/3 dos presentes aptos" : "Maioria absoluta dos presentes aptos"}${p.impedir_orgaos ? " · administração e Conselho Fiscal não votam" : ""}${p.status !== "aguardando" ? (p.voto_secreto ? " · voto secreto" : " · voto aberto") : ""}</span></div>
            ${p.status === "em_votacao" ? '<span class="selo warn">votação aberta</span>' : r ? `<span class="selo ${RES[r.resultado][1]}">${RES[r.resultado][0]}</span>` : '<span class="selo">aguardando</span>'}</div>
          ${p.status === "em_votacao" ? `<p class="hint">${nv} de ${aptos} aptos já votaram${votoMeu(p) ? " · seu voto foi registrado" + (meus && meus.voto ? ": " + VOTO[meus.voto] : "") : ""}. Vote no quadro de votação (ao lado do vídeo; no celular, fixo embaixo da tela).</p>` : ""}
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
      if (enc && !($("#sa-ata").contains(document.activeElement) && document.activeElement.tagName === "INPUT")) {
        const sigs = a.ata_signatarios || [], vs = d.versoes || [], k = vs.length, vez = !a.ata_concluida_em && sigs[k];
        let h = `<h2>Ata ${a.ata_publicada_em ? `<span class="selo ok">publicada em ${data(a.ata_publicada_em)}</span>` : a.ata_concluida_em ? '<span class="selo ok">assinada por todos</span>' : a.ata_fechada_em ? `<span class="selo warn">coletando assinaturas gov.br (${k} de ${sigs.length})</span>` : '<span class="selo warn">a fechar</span>'}</h2>`;
        if (!a.ata_fechada_em) {
          h += `<p class="hint">O texto abaixo é montado sozinho com os registros da sessão e as anotações da mesa, e não se edita à mão. A mesa confere, informa o link da gravação e fecha a ata: o site gera o PDF, que fica travado, e organiza as assinaturas pelo gov.br (art. 39). Publique em até 10 dias (RI, art. 63).</p>
            <pre class="asm-edital">${esc(rascunhoAta(d))}</pre>
            ${mesa ? `<div class="form-grid"><div class="field full"><label for="sa-grav">Link da gravação (guardar por 5 anos, art. 31, §1º, III)</label><input class="input" id="sa-grav" type="url" value="${esc(a.gravacao_url || "")}"></div></div>
              <div class="sol-acoes"><button class="btn btn-ghost btn-sm" id="sa-salvagrav">Salvar link da gravação</button><button class="btn btn-primary btn-sm" id="sa-fechar">Fechar a ata e gerar o PDF para assinatura</button></div>` : '<p class="hint">A mesa está conferindo e vai fechar a ata.</p>'}`;
        } else {
          h += `<p class="hint">PDF travado em ${dataHora(a.ata_fechada_em)}. Impressão digital (SHA-256) do original: <code style="word-break:break-all">${esc(a.ata_hash)}</code>. Cada signatário assina <b>a versão mais recente</b>, na ordem abaixo, para que todas as assinaturas fiquem no mesmo arquivo.</p>
            <ol class="asm-assin">${sigs.map((sg, i) => { const v = vs[i]; return `<li class="${v ? "ok" : i === k ? "vez" : ""}"><b>${esc(sg.nome)}</b> <span class="sub">${esc(sg.qualidade)}${sg.cpf ? " · CPF " + esc(sg.cpf) : ""}</span>
              <span class="sub">${v ? `✓ assinou · enviado ${dataHora(v.enviado_em)}${v.enviado_por && v.enviado_por !== sg.perfil_id ? " por " + esc(v.enviado_nome || "") : ""}${v.prefixo_ok === false ? ' · <span class="selo warn">conferir no validar.iti.gov.br</span>' : ""}` : i === k ? "é a vez desta pessoa" : "aguardando"}</span></li>`; }).join("")}</ol>
            <div class="sol-acoes"><button class="btn btn-ghost btn-sm permitido" id="sa-baixar">${a.ata_concluida_em ? "Baixar a ata assinada" : "Baixar a versão atual"}</button>${k ? '<button class="btn btn-ghost btn-sm permitido" id="sa-baixar0">Baixar o original sem assinaturas</button>' : ""}</div>`;
          if (vez && (vez.perfil_id === eu || g)) {
            h += `<div class="notice"><b>${vez.perfil_id === eu ? "É a sua vez de assinar a ata." : `Enviar a assinatura de ${esc(vez.nome)} (quando ela não puder enviar pelo site).`}</b>
              <ol class="asm-passos"><li>Clique em <b>Baixar a versão atual</b>.</li>
              <li>Abra <a href="https://assinador.iti.gov.br" target="_blank" rel="noopener">assinador.iti.gov.br</a>, entre com a conta gov.br (nível prata ou ouro), envie o PDF, posicione a assinatura e assine.</li>
              <li>Baixe o PDF assinado que o gov.br gera e envie aqui. Não abra nem salve o arquivo em outro programa antes: isso pode invalidar as assinaturas.</li></ol>
              <div class="field"><label for="sa-arq">PDF assinado no gov.br</label><input class="input" id="sa-arq" type="file" accept="application/pdf"></div>
              <div class="sol-acoes"><button class="btn btn-primary btn-sm" id="sa-enviar">Enviar o PDF assinado</button></div></div>`;
          }
          if (g && k && !a.ata_publicada_em) h += '<div class="sol-acoes"><button class="btn btn-ghost btn-sm" id="sa-desfazer">Desfazer o último envio (arquivo errado)</button></div>';
          if (g && a.ata_concluida_em && !a.ata_publicada_em) h += '<div class="sol-acoes"><button class="btn btn-primary btn-sm" id="sa-pubata">Publicar a ata para todos</button></div><p class="hint">Antes de publicar, vale conferir o arquivo final em <a href="https://validar.iti.gov.br" target="_blank" rel="noopener">validar.iti.gov.br</a>. Esse arquivo é o que vai para a JUCERJA quando a matéria exigir registro.</p>';
        }
        $("#sa-ata").innerHTML = h;
      }
    };
    desenhar();

    const atualizar = async () => { try { d = await API.assembleias.obter(id); const f = document.activeElement; if (f && (f.closest("#sa-notas") || f.id === "sa-grav" || f.id === "sa-arq")) return; desenhar(); } catch (e) {} };
    if (ativa() || d.assembleia.status === "agendada") timer = setInterval(() => { if (!document.body.contains(el) || location.hash !== "#assembleias") return parar(); atualizar(); }, 4000);

    el.addEventListener("focusout", async (e) => {
      const t = e.target; if (!t.dataset || !t.dataset.nota) return;
      const antes = (d.assembleia.notas || {})[t.dataset.nota] || ""; if (t.value === antes) return;
      const st = $("#nt-st");
      try { await API.assembleias.nota(id, t.dataset.nota, t.value); d.assembleia.notas = { ...(d.assembleia.notas || {}), [t.dataset.nota]: t.value }; if (st) st.textContent = `Anotação salva às ${hora(new Date().toISOString())}.`; }
      catch (err) { toast(err.message || "Não consegui salvar a anotação.", "err"); }
    });
    const recarregarSala = async () => { d = await API.assembleias.obter(id); desenhar(); };
    function editarMesa() {
      const a = d.assembleia, ms = (d.membros || []).slice().sort((x, y) => String(x.nome).localeCompare(String(y.nome))), com = new Set(a.comissao_proposta || []);
      const opt = (sel) => `<option value="">— escolher —</option>${ms.map((p) => `<option value="${p.id}" ${sel === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}`;
      const m = UI.modal(`<h2>Mesa e comissão</h2><p class="hint">Ajustável até a instalação. A comissão proposta é votada pela assembleia como primeiro item (art. 39, §1º).</p>
        <div class="form-grid"><div class="field"><label for="me-p">Preside a mesa</label><select class="input" id="me-p">${opt(a.mesa_presidente)}</select></div>
        <div class="field"><label for="me-s">Secretaria a mesa</label><select class="input" id="me-s">${opt(a.mesa_secretario)}</select></div>
        <div class="field full"><label>Comissão proposta (até 5)</label><div class="part-lista">${ms.map((p) => `<label class="ciente"><input type="checkbox" data-com value="${p.id}" ${com.has(p.id) ? "checked" : ""}> <span>${esc(p.nome)}</span></label>`).join("")}</div></div></div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="me-ok">Salvar</button></div>`);
      $("#me-ok", m.el).onclick = async (ev) => {
        const x = { id, mesa_presidente: $("#me-p", m.el).value || null, mesa_secretario: $("#me-s", m.el).value || null, comissao_proposta: [...m.el.querySelectorAll("[data-com]:checked")].map((i) => i.value) };
        if (x.mesa_presidente && x.mesa_presidente === x.mesa_secretario) return toast("Presidente e secretário precisam ser pessoas diferentes.", "err");
        if (x.comissao_proposta.length > 5) return toast("No máximo 5 cooperados.", "err");
        if (await acao(ev.currentTarget, () => API.assembleias.salvar(x), "Mesa e comissão salvas.")) { m.fechar(); recarregarSala(); }
      };
    }
    function registrarComissao() {
      const m = UI.modal(`<h2>Comissão escolhida pela assembleia</h2><p class="hint">Use quando a proposta não foi aprovada e a assembleia indicou outros nomes. Só presentes; até 5 (art. 39, §1º). Registre na anotação da abertura como foi a escolha.</p>
        <div class="part-lista">${d.presencas.map((p) => `<label class="ciente"><input type="checkbox" data-com value="${p.perfil_id}"> <span>${esc(p.nome)}</span></label>`).join("")}</div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="rc-ok">Registrar</button></div>`);
      $("#rc-ok", m.el).onclick = async (ev) => { const ids = [...m.el.querySelectorAll("[data-com]:checked")].map((i) => i.value); if (!ids.length || ids.length > 5) return toast("Escolha de 1 a 5 cooperados.", "err"); if (await acao(ev.currentTarget, () => API.assembleias.comissao(id, ids), "Comissão registrada.")) { m.fechar(); recarregarSala(); } };
    }
    async function fecharAta() {
      const a = d.assembleia; let sigs = signatariosPadrao(d);
      const cpfs = await API.assembleias.cpfs(id).catch(() => []); sigs.forEach((g) => { const c = cpfs.find((x) => x.perfil_id === g.perfil_id); if (c) g.cpf = c.cpf; });
      const m = UI.modal(`<h2>Fechar a ata</h2>
        <p class="hint">Confira quem assina e em que ordem (Estatuto, art. 39, §1º: a mesa, os administradores e conselheiros fiscais presentes e a comissão). O CPF entra no bloco de assinaturas. Depois de fechar, o texto e o PDF <b>não mudam mais</b>.</p>
        <div id="fa-lista"></div>
        <div class="form-grid"><div class="field"><label for="fa-add">Incluir outro presente</label><select class="input" id="fa-add"><option value="">—</option>${d.presencas.map((p) => `<option value="${p.perfil_id}">${esc(p.nome)}</option>`).join("")}</select></div></div>
        <div class="modal-acoes"><button class="btn btn-ghost btn-sm" data-fechar>Cancelar</button><button class="btn btn-primary btn-sm" id="fa-ok">Fechar a ata e gerar o PDF</button></div>`);
      const lerLista = () => { m.el.querySelectorAll("[data-sg]").forEach((r) => { const g = sigs[Number(r.dataset.sg)]; g.qualidade = r.querySelector("[data-q]").value.trim(); g.cpf = r.querySelector("[data-c]").value.trim(); }); };
      const desenharLista = () => { $("#fa-lista", m.el).innerHTML = sigs.map((g, i) => `<div class="form-grid" data-sg="${i}" style="align-items:end;border-bottom:1px solid var(--line);padding-bottom:.4rem;margin-bottom:.4rem">
          <div class="field"><label>${i + 1}. ${esc(g.nome)}</label><input class="input" data-q maxlength="160" value="${esc(g.qualidade)}" aria-label="Qualidade de ${esc(g.nome)}"></div>
          <div class="field"><label>CPF</label><input class="input" data-c maxlength="14" value="${esc(g.cpf || "")}" placeholder="000.000.000-00"></div>
          <div class="sol-acoes">${i ? `<button class="btn btn-ghost btn-sm" type="button" data-sobe="${i}">↑</button>` : ""}<button class="btn btn-ghost btn-sm" type="button" data-tira="${i}">Retirar</button></div></div>`).join("") || '<p class="hint">Ninguém na lista.</p>'; };
      desenharLista();
      m.el.addEventListener("click", (e) => { const t = e.target.closest("[data-tira],[data-sobe]"); if (!t) return; lerLista(); if (t.dataset.tira) sigs.splice(Number(t.dataset.tira), 1); else { const i = Number(t.dataset.sobe); [sigs[i - 1], sigs[i]] = [sigs[i], sigs[i - 1]]; } desenharLista(); });
      $("#fa-add", m.el).onchange = (e) => { const pid = e.target.value; if (!pid) return; lerLista(); if (!sigs.some((g) => g.perfil_id === pid)) sigs.push({ perfil_id: pid, nome: nomeDe(d, pid), qualidade: "Cooperado(a) presente", cpf: "" }); e.target.value = ""; desenharLista(); };
      $("#fa-ok", m.el).onclick = async (ev) => {
        lerLista();
        if (!sigs.length) return toast("Inclua quem assina a ata.", "err");
        if (sigs.some((g) => !g.qualidade)) return toast("Informe a qualidade de cada signatário.", "err");
        if (sigs.some((g) => g.cpf && !/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(g.cpf))) return toast("Confira os CPFs (11 dígitos).", "err");
        if (a.tipo !== "pre" && !a.gravacao_url && !(await confirmar("A ata vai sair sem o link da gravação (art. 39, §3º). Fechar mesmo assim?", "Fechar sem o link"))) return;
        if (!(await confirmar("Fechar a ata? O texto e o PDF ficam travados e começa a coleta das assinaturas gov.br.", "Fechar a ata"))) return;
        const lista = sigs.map((g) => ({ perfil_id: g.perfil_id, nome: g.nome, qualidade: g.qualidade, cpf: g.cpf ? g.cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "" }));
        const ok = await acao(ev.currentTarget, async () => {
          const texto = rascunhoAta(d, lista), bytes = await gerarPdf(texto, a), hash = await sha256(bytes);
          await API.assembleias.fecharAta(id, texto, bytes, hash, lista); return true;
        }, "Ata fechada. Agora cada signatário assina no gov.br, na ordem.");
        if (ok) { m.fechar(); recarregarSala(); }
      };
    }
    async function enviarAssinada(btn) {
      const f = $("#sa-arq").files[0]; if (!f) return toast("Escolha o PDF assinado.", "err");
      if (f.size > 20 * 1048576) return toast("O arquivo passa de 20 MB.", "err");
      const a = d.assembleia, vs = d.versoes || [], ant = vs.length ? vs[vs.length - 1].arquivo : a.ata_pdf;
      let bytes, meta;
      try {
        bytes = new Uint8Array(await f.arrayBuffer());
        if (latin1(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("O arquivo não é um PDF.");
        const antes = await API.assembleias.baixarArquivoAta(ant);
        const nAntes = contarAssinaturas(antes), nAgora = contarAssinaturas(bytes);
        if (nAgora <= nAntes) throw new Error("Não encontrei uma assinatura digital nova neste PDF. Assine em assinador.iti.gov.br a versão atual e envie o arquivo que o gov.br gerar.");
        const prefixo = comecaCom(bytes, antes);
        if (!prefixo && !(await confirmar("Este PDF não começa exatamente com a versão anterior. Isso acontece se ele foi assinado sobre outra versão ou salvo por outro programa, e pode invalidar as assinaturas já feitas. Confira em validar.iti.gov.br. Enviar mesmo assim?", "Enviar mesmo assim"))) return;
        meta = { ordem: vs.length + 1, sha256: await sha256(bytes), assinaturas: nAgora, prefixo_ok: prefixo };
      } catch (err) { return toast(err.message || "Não consegui ler o arquivo.", "err"); }
      const ok = await acao(btn, () => API.assembleias.enviarVersao(id, bytes, meta), "PDF assinado recebido.");
      if (ok) recarregarSala();
    }
    el.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const fazer = async (fn, msg) => { if (await acao(b, fn, msg)) { d = await API.assembleias.obter(id); desenhar(); if (!timer && ativa()) timer = setInterval(atualizar, 4000); } };
      if (b.id === "sa-gravar") return gravar(b, `assembleia-${String(d.assembleia.data_hora).slice(0, 10)}.webm`);
      if (b.dataset.janela) { window.open(b.dataset.janela, "bimcore-video", "width=1100,height=720"); return; }
      if (b.id === "sa-edital") return mostrarEdital({ ...d.assembleia, pautas: d.pautas });
      if (b.id === "sa-entrar") return fazer(() => API.assembleias.entrar(id), "Presença registrada.");
      if (b.id === "sa-instalar") return fazer(() => API.assembleias.instalar(id), "Assembleia instalada. Abra a votação de cada pauta.");
      if (b.id === "sa-semq") { if (!(await confirmar("Encerrar sem quórum? A assembleia não será instalada e precisará de nova convocação.", "Encerrar sem quórum"))) return; return fazer(() => API.assembleias.encerrar(id, true), "Assembleia encerrada sem quórum."); }
      if (b.id === "sa-encerrar") { if (!(await confirmar("Encerrar a assembleia? Depois disso não há mais votação nem chat.", "Encerrar"))) return; parar(); return fazer(() => API.assembleias.encerrar(id, false), "Assembleia encerrada. Agora redija e publique a ata."); }
      if (b.dataset.abrirp) { const sec = el.querySelector(`[data-sec="${b.dataset.abrirp}"]`); return fazer(() => API.assembleias.pautaAbrir(b.dataset.abrirp, sec && sec.checked), "Votação aberta."); }
      if (b.dataset.votar) { if (!(await confirmar(`Confirmar voto: ${VOTO[b.dataset.voto]}? Depois de registrado, o voto não muda.`, "Confirmar voto"))) return; return fazer(() => API.assembleias.votar(b.dataset.votar, b.dataset.voto), "Voto registrado."); }
      if (b.dataset.encp) { if (!(await confirmar("Encerrar a votação desta pauta e apurar o resultado?", "Encerrar e apurar"))) return; return fazer(() => API.assembleias.pautaEncerrar(b.dataset.encp), "Votação apurada."); }
      if (b.id === "sa-assinar") return fazer(() => API.assembleias.assinar(id, "presença"), "Presença e participação confirmadas.");
      if (b.id === "sa-mesa") return editarMesa();
      if (b.id === "sa-com") return registrarComissao();
      if (b.id === "sa-salvagrav") return fazer(() => API.assembleias.salvar({ id, gravacao_url: $("#sa-grav").value.trim() || null }), "Link da gravação salvo.");
      if (b.id === "sa-fechar") return fecharAta();
      if (b.id === "sa-baixar" || b.id === "sa-baixar0") {
        const a = d.assembleia, vs = d.versoes || [], ult = b.id === "sa-baixar" && vs.length ? vs[vs.length - 1] : null;
        try { const bytes = await API.assembleias.baixarArquivoAta(ult ? ult.arquivo : a.ata_pdf); baixar(bytes, `ata-${String(a.data_hora).slice(0, 10)}${ult ? (a.ata_concluida_em ? "-assinada" : "-v" + ult.ordem) : ""}.pdf`); } catch (err) { toast(err.message || "Não consegui baixar.", "err"); }
        return;
      }
      if (b.id === "sa-enviar") return enviarAssinada(b);
      if (b.id === "sa-desfazer") { if (!(await confirmar("Desfazer o último PDF enviado? A pessoa precisará enviar de novo.", "Desfazer"))) return; return fazer(() => API.assembleias.desfazerVersao(id), "Último envio desfeito."); }
      if (b.id === "sa-pubata") { if (!(await confirmar("Publicar a ata assinada para todos os cooperados?", "Publicar ata"))) return; return fazer(() => API.assembleias.publicarAta(id), "Ata publicada."); }
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

  window.Assembleias = { render, anuncio, sinal, textoEdital, rascunhoAta, convocar: (pre, aoSalvar) => formAssembleia(null, aoSalvar || (() => {}), pre), formAssembleia };
})();
