/* Login, cadastro e recuperação de senha */
(function () {
  "use strict";
  const { $, acao, toast } = window.UI;
  const API = window.API;
  const forms = { entrar: $("#form-entrar"), cadastro: $("#form-cadastro"), recuperar: $("#form-recuperar"), nova: $("#form-nova-senha"), confirmar: $("#form-confirmar") };
  const aviso = $("#aviso");
  const abas = $(".abas-login");

  const mostrar = (qual) => {
    Object.entries(forms).forEach(([k, f]) => { f.hidden = k !== qual; });
    abas.hidden = qual === "recuperar" || qual === "nova" || qual === "confirmar";
    $("#aba-entrar").setAttribute("aria-selected", String(qual === "entrar"));
    $("#aba-cadastro").setAttribute("aria-selected", String(qual === "cadastro"));
    aviso.hidden = true;
    document.querySelector(".login-caixa").classList.toggle("largo", qual === "cadastro");
    const primeiro = forms[qual].querySelector("input");
    if (primeiro) primeiro.focus();
  };
  const avisar = (txt, tipo) => { aviso.className = "notice " + (tipo || ""); aviso.textContent = txt; aviso.hidden = false; };

  $("#aba-entrar").addEventListener("click", () => mostrar("entrar"));
  $("#aba-cadastro").addEventListener("click", () => mostrar("cadastro"));
  $("#esqueci").addEventListener("click", () => mostrar("recuperar"));
  $("#voltar-login").addEventListener("click", () => mostrar("entrar"));
  $("#voltar-login2").addEventListener("click", () => mostrar("entrar"));
  const abrirConfirmar = (email, msg, tipo) => { mostrar("confirmar"); if (email) $("#c-email").value = email; if (msg) avisar(msg, tipo); };
  $("#nao-confirmei").addEventListener("click", () => abrirConfirmar($("#e-email").value));
  $("#c-reenviar").addEventListener("click", async () => {
    const email = $("#c-email").value.trim(); if (!email) return avisar("Informe o e-mail.", "err");
    if (await acao($("#c-reenviar"), () => API.reenviarConfirmacao(email))) avisar("Enviamos um novo e-mail de confirmação. Pode levar alguns minutos; veja também a caixa de spam.", "ok");
  });
  forms.confirmar.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#c-email").value.trim(), cod = $("#c-codigo").value.replace(/\D/g, "");
    if (!email || cod.length < 6) return avisar("Informe o e-mail e o código de 6 dígitos.", "err");
    if (await acao($("#c-btn"), () => API.confirmarCodigo(email, cod))) { avisar("E-mail confirmado.", "ok"); const s = await API.getSession().catch(() => null); if (s) location.replace(destino(s)); else mostrar("entrar"); }
  });
  // volta do link do e-mail com erro (link expirado, já usado ou aberto em outro aparelho)
  const hashErro = new URLSearchParams(location.hash.replace(/^#/, "")).get("error_code") || new URLSearchParams(location.search).get("error_code");
  if (hashErro) abrirConfirmar("", hashErro === "otp_expired" ? "O link de confirmação expirou ou já foi usado. Peça um novo abaixo." : "Não foi possível confirmar pelo link. Peça um novo abaixo.", "err");

  if (API.demo) $("#demo-contas").hidden = false;
  if (location.hash === "#cadastro") mostrar("cadastro");

  const destino = (s) => (s && s.perfil && s.perfil.papel === "coordenacao" && s.perfil.status === "ativo" ? "interno.html" : "painel.html");

  // Já logado? Vai direto para o painel (exceto durante a troca de senha)
  let recuperando = /type=recovery/.test(location.hash);
  API.onRecovery(() => { recuperando = true; mostrar("nova"); });
  if (recuperando) mostrar("nova");
  else API.getSession().then((s) => { if (s && !recuperando) location.replace(destino(s)); }).catch(() => {});

  forms.entrar.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#e-email").value, senha = $("#e-senha").value;
    if (!email || !senha) return avisar("Preencha e-mail e senha.", "err");
    let naoConfirmado = false;
    const ok = await acao($("#e-btn"), async () => { try { return await API.signIn(email, senha); } catch (er) { if (/confirm/i.test(er.message || "")) naoConfirmado = true; throw er; } });
    if (ok) location.replace(destino(await API.getSession()));
    else if (naoConfirmado) abrirConfirmar(email, "Seu e-mail ainda não foi confirmado. Peça um novo e-mail de confirmação abaixo.", "warn");
  });

  // Lista de áreas de atuação
  const selArea = $("#k-area");
  API.AREAS.forEach((a) => { const o = document.createElement("option"); o.value = a; o.textContent = a; selArea.appendChild(o); });

  forms.cadastro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (id) => $(id).value.trim();
    const dados = {
      nome: v("#k-nome"), telefone: v("#k-tel"), cidade: v("#k-cidade"), area_atuacao: v("#k-area"),
      formacao: v("#k-form"), registro_profissional: v("#k-reg"), experiencia: v("#k-exp"),
      curriculo_url: v("#k-cv"), motivacao: v("#k-mot"), email: v("#k-email"), senha: $("#k-senha").value
    };
    const faltando = [["nome", "nome"], ["telefone", "telefone"], ["cidade", "cidade"], ["area_atuacao", "área de atuação"], ["formacao", "formação"], ["experiencia", "experiência"], ["motivacao", "motivação"], ["email", "e-mail"]]
      .filter(([k]) => !dados[k]).map(([, r]) => r);
    if (faltando.length) return avisar("Preencha: " + faltando.join(", ") + ".", "err");
    if (dados.curriculo_url && !/^https?:\/\//i.test(dados.curriculo_url)) return avisar("O link do currículo deve começar com https://", "err");
    if (dados.senha.length < 8) return avisar("A senha precisa ter pelo menos 8 caracteres.", "err");
    if (!$("#k-ciente").checked) return avisar("Confirme que leu a Política de Privacidade e as condições de admissão.", "err");
    const r = await acao($("#k-btn"), () => API.signUp(dados));
    if (!r) return;
    forms.cadastro.reset();
    mostrar("entrar");
    $("#e-email").value = dados.email;
    avisar(r.precisaConfirmar
      ? "Solicitação enviada. Abra o link que enviamos para " + dados.email + " para confirmar o e-mail. Depois disso, a coordenação analisa seu perfil e entra em contato."
      : "Solicitação enviada. A coordenação vai analisar seu perfil e entrar em contato. Você pode entrar para acompanhar.", "ok");
  });

  forms.recuperar.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#r-email").value.trim();
    if (!email) return avisar("Informe seu e-mail.", "err");
    const ok = await acao($("#r-btn"), () => API.resetPassword(email));
    if (ok) avisar(API.demo ? "No modo demonstração nenhum e-mail é enviado. A senha das contas de exemplo é demo1234." : "Se houver uma conta com este e-mail, o link chega em alguns minutos. Confira também o spam.", "ok");
  });

  forms.nova.addEventListener("submit", async (e) => {
    e.preventDefault();
    const s = $("#n-senha").value;
    if (s.length < 8) return avisar("A senha precisa ter pelo menos 8 caracteres.", "err");
    const ok = await acao($("#n-btn"), () => API.updatePassword(s));
    if (ok) { toast("Senha alterada."); history.replaceState(null, "", location.pathname); location.replace(destino(await API.getSession())); }
  });
})();
