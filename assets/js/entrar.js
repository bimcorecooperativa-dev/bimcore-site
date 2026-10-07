/* Login, cadastro e recuperação de senha */
(function () {
  "use strict";
  const { $, acao, toast } = window.UI;
  const API = window.API;
  const forms = { entrar: $("#form-entrar"), cadastro: $("#form-cadastro"), recuperar: $("#form-recuperar"), nova: $("#form-nova-senha") };
  const aviso = $("#aviso");
  const abas = $(".abas-login");

  const mostrar = (qual) => {
    Object.entries(forms).forEach(([k, f]) => { f.hidden = k !== qual; });
    abas.hidden = qual === "recuperar" || qual === "nova";
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
    const ok = await acao($("#e-btn"), () => API.signIn(email, senha));
    if (ok) location.replace(destino(await API.getSession()));
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
