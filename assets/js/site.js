/* Site público: menu móvel e formulário de contato */
(function () {
  "use strict";
  const botao = document.getElementById("menu-btn");
  const menu = document.getElementById("menu");
  if (botao && menu) {
    botao.addEventListener("click", () => {
      const aberto = menu.classList.toggle("aberto");
      botao.setAttribute("aria-expanded", String(aberto));
    });
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) { menu.classList.remove("aberto"); botao.setAttribute("aria-expanded", "false"); }
    });
  }

  const den = document.getElementById("form-denuncia");
  if (den) {
    const st = document.getElementById("d-status"), bt = document.getElementById("d-enviar");
    den.addEventListener("submit", async (e) => {
      e.preventDefault();
      const relato = document.getElementById("d-relato").value.trim();
      if (relato.length < 10) { st.textContent = "Descreva o ocorrido com um pouco mais de detalhe."; return; }
      bt.disabled = true; bt.textContent = "Enviando…";
      try {
        if (!window.API) throw new Error("Não foi possível conectar.");
        await window.API.contatos.enviar({
          tipo: "denuncia",
          nome: document.getElementById("d-nome").value.trim().slice(0, 120) || "Anônimo",
          email: document.getElementById("d-email").value.trim().slice(0, 160),
          mensagem: relato.slice(0, 4000)
        });
        den.reset();
        st.textContent = "Relato recebido. Ele será analisado pelo Conselho Fiscal com sigilo.";
      } catch (err) {
        st.textContent = (err && err.message) || "Não foi possível enviar. Tente novamente.";
      } finally { bt.disabled = false; bt.textContent = "Enviar relato"; }
    });
  }

  const form = document.getElementById("form-contato");
  if (!form) return;
  const status = document.getElementById("c-status");
  const enviar = document.getElementById("c-enviar");
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    if (d.site) return; // armadilha contra robôs
    status.className = "hint";
    if (!d.nome.trim() || !d.mensagem.trim()) { status.textContent = "Preencha nome e mensagem."; return; }
    if (!emailOk(d.email.trim())) { status.textContent = "Informe um e-mail válido para podermos responder."; return; }
    enviar.disabled = true; enviar.textContent = "Enviando…";
    try {
      if (!window.API) throw new Error("Não foi possível conectar. Use o WhatsApp ou o e-mail ao lado.");
      await window.API.contatos.enviar({
        nome: d.nome.trim().slice(0, 120),
        orgao: d.orgao.trim().slice(0, 160),
        email: d.email.trim().slice(0, 160),
        telefone: d.telefone.trim().slice(0, 40),
        mensagem: d.mensagem.trim().slice(0, 4000)
      });
      form.reset();
      status.textContent = "Mensagem recebida. Respondemos pelo e-mail informado.";
    } catch (err) {
      status.textContent = (err && err.message ? err.message : "Não foi possível enviar.") + " Se preferir, fale pelo WhatsApp (22) 99874-5742.";
    } finally {
      enviar.disabled = false; enviar.textContent = "Enviar mensagem";
    }
  });
})();
