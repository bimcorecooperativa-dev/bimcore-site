/* BIMCORE — camada de dados
 * Uma única interface (window.API) com dois motores:
 *  - Supabase (produção), quando config.js tem URL e chave;
 *  - Demonstração, com dados de exemplo guardados só neste navegador.
 */
(function () {
  "use strict";
  const cfg = window.BIMCORE_CONFIG || {};
  const DEMO = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY;

  const TIPOS_HORA = {
    produtiva: "Produção técnica",
    formacao: "Formação Técnica Integrada",
    administrativa: "Suporte administrativo (pago pelos 20%)",
    ociosidade_estrategica: "Ociosidade estratégica (pendência externa)",
    ociosidade_operacional: "Ociosidade operacional"
  };
  const STATUS_PROJETO = ["Prospecção", "Proposta", "Contratado", "Em execução", "Concluído", "Suspenso"];
  /* Projetos simultâneos por função (Plano Quinquenal, Células de Produção). Carga de cada participação = 1/limite. */
  const LIMITES_PADRAO = { coordenacao: [5, 3], supervisao: [5, 5], projeto: [2, 1], orcamento: [2, 1], modelagem: [1, 1], campo: [1, 1], outra: [2, 1] };
  const MODALIDADES = ["Acordo de cooperação técnica", "Convênio", "Licitação", "Contratação direta", "Mercado privado"];
  const CATEGORIAS_DOC = ["Estatuto e atas", "Regimentos e manuais", "Contratos e convênios", "Modelos técnicos", "Outros"];
  /* Frentes de atuação dos cooperados, a partir dos CNAEs da cooperativa */
  const AREAS = [
    "Projetos de arquitetura e urbanismo",
    "Projetos de engenharia (estrutural, instalações, infraestrutura)",
    "Modelagem e coordenação BIM",
    "Implantação de BIM e consultoria técnica",
    "Orçamento, planejamento e controle de obras",
    "Administração e fiscalização de obras",
    "Topografia, cartografia e geologia",
    "Segurança do trabalho e perícias",
    "Testes, ensaios e análises técnicas",
    "Desenho técnico e design",
    "Pesquisa, desenvolvimento e tecnologia",
    "Treinamento e capacitação profissional",
    "Administração, finanças e contabilidade",
    "Jurídico (licitações, contratos, cooperativismo)",
    "Comunicação e relações institucionais",
    "Tecnologia da informação",
    "Outra"
  ];
  const STATUS_COOPERADO = { pendente: "Em análise", entrevista: "Entrevista", ativo: "Ativo", recusado: "Não aprovado", desligado: "Desligado" };
  /* Colunas da planilha da tesouraria: chave no banco -> rótulo */
  const CAMPOS_FIN = {
    quotas_subscritas: "Quotas subscritas",
    capital_subscrito: "Capital subscrito (R$)",
    capital_integralizado: "Capital integralizado (R$)",
    contribuicoes_pagas: "Contribuições pagas (R$)",
    contribuicao_mensal: "Contribuição mensal (R$)",
    valor_em_aberto: "Valor em aberto (R$)",
    meses_em_atraso: "Meses em atraso",
    fic_saldo: "Saldo FIC (R$)",
    fundo_13: "Fundo 13º (R$)",
    fundo_ferias: "Fundo de férias (R$)",
    sobras_a_receber: "Sobras a receber (R$)",
    outros_creditos: "Outros créditos (R$)",
    observacao: "Observação"
  };
  /* Telefone no padrão (xx) xxxxx-xxxx (celular) ou (xx) xxxx-xxxx (fixo), digitado com ou sem máscara.
     Fora do Brasil: começa com + e o código do país. EUA/Canadá (+1): +1 (xxx) xxx-xxxx; demais países ficam como digitados. */
  function formatarTelefone(v) {
    if (v == null) return v;
    const bruto = String(v).trim();
    let d = bruto.replace(/\D/g, "");
    if (!d) return bruto;
    if (bruto.startsWith("+") || bruto.startsWith("00")) {
      if (bruto.startsWith("00")) d = d.slice(2);
      if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2); // +55 = Brasil
      else if (d.startsWith("1") && d.length === 11) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
      else return "+" + bruto.replace(/^(\+|00)\s*/, "").replace(/\s+/g, " "); // outros países: como digitado, com +
    } else if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
    if (d.length === 11 && d[2] !== "0") return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return bruto;
  }
  // máscara enquanto digita, em todo campo de telefone do site
  function mascaraTelefone(v) {
    const s0 = String(v);
    if (/^\s*(\+|00)/.test(s0)) {
      const d = s0.replace(/\D/g, "").replace(/^00/, "");
      if (d.startsWith("1")) { const n = d.slice(1, 11); let o = "+1"; if (n) o += " (" + n.slice(0, 3); if (n.length > 3) o += ") " + n.slice(3, 6); if (n.length > 6) o += "-" + n.slice(6); return o; }
      if (d.startsWith("55")) return "+55 " + mascaraTelefone(d.slice(2));
      return s0; // outros países: como digitado
    }
    const d = s0.replace(/\D/g, "").slice(0, 11);
    if (!d) return "";
    if (d.length <= 2) return `(${d}`;
    const meio = d.length === 11 ? 5 : 4;
    if (d.length <= 2 + meio) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 2 + meio)}-${d.slice(2 + meio)}`;
  }
  // link de WhatsApp para qualquer telefone gravado
  function whatsTelefone(t) {
    const d = String(t || "").replace(/\D/g, "");
    if (!d) return null;
    return "https://wa.me/" + (String(t).trim().startsWith("+") ? d : "55" + d.replace(/^55(?=\d{10,11}$)/, ""));
  }
  if (typeof document !== "undefined") {
    document.addEventListener("input", (e) => {
      const el = e.target; if (!(el && el.type === "tel") || (e.inputType || "").startsWith("delete")) return;
      el.value = mascaraTelefone(el.value);
    });
    document.addEventListener("blur", (e) => { const el = e.target; if (el && el.type === "tel" && el.value) el.value = formatarTelefone(el.value); }, true);
  }
  const CAMPOS_SOLICITACAO = ["nome", "telefone", "cidade", "area_atuacao", "formacao", "registro_profissional", "curriculo_url", "experiencia", "motivacao"];

  const traduzErro = (msg) => {
    const m = String(msg || "");
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    if (/already registered|already been registered/i.test(m)) return "Já existe uma conta com este e-mail. Use a opção de entrar.";
    if (/Password should be at least/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
    if (/rate limit/i.test(m)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
    if (/row-level security|permission denied/i.test(m)) return "Você não tem permissão para esta ação.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    return m || "Algo deu errado. Tente de novo.";
  };
  const falha = (e) => { throw new Error(traduzErro(e && e.message ? e.message : e)); };

  /* ------------------------------------------------------------------ */
  /* Motor de demonstração                                               */
  /* ------------------------------------------------------------------ */
  function demoApi() {
    const KEY = "bimcore-demo-v7";
    const SKEY = "bimcore-demo-sessao";
    const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    const hoje = new Date();
    const dia = (delta) => { const d = new Date(hoje); d.setDate(d.getDate() + delta); return d.toISOString().slice(0, 10); };

    function semente() {
      const p1 = novoId(), p2 = novoId(), p3 = novoId();
      return {
        perfis: [
          { id: "u-coord", nome: "Coordenação (exemplo)", email: "coordenacao@bimcore.demo", senha: "demo1234", telefone: "", especialidade: "Orçamento e planejamento", papel: "coordenacao", status: "ativo", conselho_adm: true, cargo_ca: "presidente", data_ingresso: dia(-200), criado_em: dia(-200) },
          { id: "u-coop", nome: "Cooperada Exemplo", email: "cooperado@bimcore.demo", senha: "demo1234", telefone: "", especialidade: "Modelagem de arquitetura", papel: "cooperado", status: "ativo", data_ingresso: dia(-90), criado_em: dia(-90) },
          { id: "u-pend", nome: "Candidato Exemplo", email: "novo@bimcore.demo", senha: "demo1234", telefone: "(22) 90000-0000", cidade: "Cabo Frio/RJ", area_atuacao: "Projetos de engenharia (estrutural, instalações, infraestrutura)", especialidade: "Projetos de engenharia (estrutural, instalações, infraestrutura)", formacao: "Engenharia elétrica", registro_profissional: "CREA-RJ (exemplo)", curriculo_url: "", experiencia: "Cinco anos em projetos elétricos prediais e modelagem MEP.", motivacao: "Quero trabalhar em projetos públicos com remuneração justa e formação continuada.", papel: "cooperado", status: "pendente", data_ingresso: null, criado_em: dia(-2) }
        ],
        projetos: [
          { id: p1, nome: "Piloto BIM – Escola municipal (exemplo)", orgao: "Prefeitura (exemplo)", municipio: "Baixada Litorânea", modalidade: "Acordo de cooperação técnica", status: "Em execução", lod: "LOD 400", horas_orcadas: 320, valor: null, inicio: dia(-40), fim: dia(50), criado_em: dia(-40) },
          { id: p2, nome: "Unidade básica de saúde – projeto executivo (exemplo)", orgao: "Secretaria de Obras (exemplo)", municipio: "Região Serrana", modalidade: "Licitação", status: "Proposta", lod: "LOD 400", horas_orcadas: 540, valor: 186000, inicio: null, fim: null, criado_em: dia(-10) },
          { id: p3, nome: "Diagnóstico de maturidade BIM (exemplo)", orgao: "Prefeitura (exemplo)", municipio: "Baixada Litorânea", modalidade: "Convênio", status: "Prospecção", lod: "", horas_orcadas: 60, valor: null, inicio: null, fim: null, criado_em: dia(-5) }
        ],
        producao: [
          { id: novoId(), cooperado_id: "u-coop", projeto_id: p1, data: dia(-6), horas: 6, tipo: "produtiva", descricao: "Modelagem das paredes e esquadrias do bloco A" },
          { id: novoId(), cooperado_id: "u-coop", projeto_id: p1, data: dia(-5), horas: 5.5, tipo: "produtiva", descricao: "Compatibilização arquitetura x estrutura (clash detection)" },
          { id: novoId(), cooperado_id: "u-coop", projeto_id: p1, data: dia(-4), horas: 1, tipo: "formacao", descricao: "Estudo de famílias paramétricas para esquadrias" },
          { id: novoId(), cooperado_id: "u-coop", projeto_id: p1, data: dia(-3), horas: 2, tipo: "ociosidade_estrategica", descricao: "Aguardando levantamento topográfico da prefeitura (protocolo enviado)" },
          { id: novoId(), cooperado_id: "u-coord", projeto_id: p1, data: dia(-3), horas: 4, tipo: "produtiva", descricao: "Vinculação de quantitativos às composições SINAPI/EMOP" },
          { id: novoId(), cooperado_id: "u-coord", projeto_id: p2, data: dia(-2), horas: 3, tipo: "produtiva", descricao: "Estudo do edital e da planilha de referência" }
        ],
        comunicados: [
          { id: novoId(), titulo: "Bem-vindos à área do cooperado", corpo: "Aqui ficam os comunicados da coordenação, os documentos da cooperativa e o registro das suas horas. Lance suas horas toda semana: elas são a base do cálculo das sobras e do Índice de Eficiência Operacional.", autor_nome: "Coordenação", publicado_em: dia(-7) + "T10:00:00" },
          { id: novoId(), titulo: "Assembleia trimestral", corpo: "A próxima assembleia trimestral vai apresentar o relatório de produtividade e o andamento do projeto-piloto. A pauta completa será publicada em Documentos.", autor_nome: "Coordenação", publicado_em: dia(-1) + "T18:30:00" }
        ],
        documentos: [],
        fin_importacoes: [{ id: "imp-1", data_base: dia(-35), arquivo: "posicao-exemplo.xlsx", linhas: 2, criado_nome: "Coordenação (exemplo)", criado_em: dia(-35) + "T10:00:00" },
                          { id: "imp-2", data_base: dia(-5), arquivo: "posicao-exemplo-2.xlsx", linhas: 2, criado_nome: "Coordenação (exemplo)", criado_em: dia(-5) + "T10:00:00" }],
        fin_posicoes: [
          { id: novoId(), importacao_id: "imp-1", cooperado_id: "u-coop", data_base: dia(-35), quotas_subscritas: 10, capital_subscrito: 500, capital_integralizado: 300, contribuicoes_pagas: 300, contribuicao_mensal: 50, valor_em_aberto: 0, meses_em_atraso: 0, fic_saldo: 120.5, fundo_13: 210, fundo_ferias: 210, sobras_a_receber: 0, outros_creditos: 0, observacao: "" },
          { id: novoId(), importacao_id: "imp-2", cooperado_id: "u-coop", data_base: dia(-5), quotas_subscritas: 10, capital_subscrito: 500, capital_integralizado: 350, contribuicoes_pagas: 350, contribuicao_mensal: 50, valor_em_aberto: 50, meses_em_atraso: 1, fic_saldo: 245.8, fundo_13: 420, fundo_ferias: 420, sobras_a_receber: 0, outros_creditos: 0, observacao: "Contribuição de setembro pendente (exemplo)." },
          { id: novoId(), importacao_id: "imp-2", cooperado_id: "u-coord", data_base: dia(-5), quotas_subscritas: 10, capital_subscrito: 500, capital_integralizado: 500, contribuicoes_pagas: 500, contribuicao_mensal: 50, valor_em_aberto: 0, meses_em_atraso: 0, fic_saldo: 310, fundo_13: 500, fundo_ferias: 500, sobras_a_receber: 0, outros_creditos: 0, observacao: "" }
        ],
        fin: {
          parametros: { id: 1, quota: 50, quotas_minimas: 10, contrib_inicio: "2026-04-01", fechamento: null, modo: "sistema" },
          cooperados: [
            { id: "fc-coop", nome: "Cooperada Exemplo", email: "cooperado@bimcore.demo", perfil_id: "u-coop", cargo: "", conselho: "CAU", categoria: "Júnior", teletrabalho: true, fic_voluntario: 0.01, quotas_iniciais: 10, integralizado_admissao: 200, data_admissao: "2026-01-28", situacao: "ativo", data_desligamento: null, compensar_aportes: false, observacao: "" },
            { id: "fc-coord", nome: "Coordenação (exemplo)", email: "coordenacao@bimcore.demo", perfil_id: "u-coord", cargo: "Presidente", conselho: "CRA", categoria: "Pleno", teletrabalho: false, fic_voluntario: 0, quotas_iniciais: 10, integralizado_admissao: 500, data_admissao: "2026-01-28", situacao: "ativo", data_desligamento: null, compensar_aportes: false, observacao: "" },
            { id: "fc-sem", nome: "Cooperado Sem Conta (exemplo)", email: "", perfil_id: null, cargo: "", quotas_iniciais: 10, integralizado_admissao: 500, data_admissao: "2026-01-28", situacao: "ativo", data_desligamento: null, compensar_aportes: false, observacao: "" }
          ],
          folha: [], receitas: [],
          habilitacoes: [
            { id: "fh-1", fin_cooperado_id: "fc-coop", titulo: "Arquitetura e urbanismo", nivel: "superior", conselho: "CAU", data_habilitacao: "2022-12-15", registro: "A000000-0", status: "aprovada", analise_nome: "Coordenação (exemplo)", criado_em: "2026-09-01T10:00:00Z" }
          ],
          experiencias: [
            { id: "fe-1", fin_cooperado_id: "fc-coop", habilitacao_id: "fh-1", descricao: "Arquiteta em escritório de projetos (exemplo)", inicio: "2023-02-01", fim: null, status: "aprovada", analise_nome: "Coordenação (exemplo)", criado_em: "2026-09-01T10:00:00Z" },
            { id: "fe-2", fin_cooperado_id: "fc-coop", habilitacao_id: "fh-1", descricao: "Estágio em arquitetura (exemplo)", inicio: "2021-01-01", fim: "2022-11-30", status: "pendente", criado_em: "2026-09-02T10:00:00Z" }
          ],
          comprovantes: [],
          despesas: [
            { id: "fd-1", data: "2026-02-10", descricao: "Registro na junta comercial (exemplo)", categoria: "Abertura e registro", valor: 300, cobrar: false, participantes: [], observacao: "", criado_nome: "Exemplo" },
            { id: "fd-2", data: "2026-09-15", descricao: "Taxa aprovada em assembleia (exemplo)", categoria: "Outras", valor: 90, cobrar: true, participantes: ["fc-coop", "fc-coord", "fc-sem"], observacao: "", criado_nome: "Exemplo" }
          ],
          pagamentos: [
            { id: novoId(), data: "2026-02-10", fin_cooperado_id: "fc-coop", tipo: "despesa", despesa_id: "fd-1", mes_ref: null, valor: 120, observacao: "", origem: "tesouraria", criado_nome: "Exemplo" },
            { id: novoId(), data: "2026-02-10", fin_cooperado_id: "fc-coord", tipo: "despesa", despesa_id: "fd-1", mes_ref: null, valor: 180, observacao: "", origem: "tesouraria", criado_nome: "Exemplo" },
            { id: novoId(), data: "2026-09-20", fin_cooperado_id: "fc-coord", tipo: "despesa", despesa_id: "fd-2", mes_ref: null, valor: 30, observacao: "", origem: "tesouraria", criado_nome: "Exemplo" },
            { id: novoId(), data: "2026-05-05", fin_cooperado_id: "fc-coord", tipo: "contribuicao", despesa_id: null, mes_ref: "2026-04-01", valor: 50, observacao: "", origem: "tesouraria", criado_nome: "Exemplo" }
          ]
        },
        contatos: [
          { id: novoId(), nome: "Servidor Exemplo", email: "obras@prefeitura.exemplo", orgao: "Secretaria Municipal de Obras", telefone: "", mensagem: "Gostaríamos de entender como funciona o acordo de cooperação técnica para um projeto-piloto.", lido: false, criado_em: dia(-1) + "T14:12:00" }
        ]
      };
    }
    const ler = () => {
      try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.perfis) return s; } catch (e) {}
      const s = semente(); gravar(s); return s;
    };
    const gravar = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
    const sessaoId = () => { try { return localStorage.getItem(SKEY); } catch (e) { return null; } };
    const eu = (s) => s.perfis.find((p) => p.id === sessaoId());
    const espera = (v) => new Promise((r) => setTimeout(() => r(v), 120));
    const exigir = (s, coord) => {
      const u = eu(s);
      if (!u) falha("Sua sessão expirou. Entre novamente.");
      if (coord === "tes" && !(u.status === "ativo" && (u.papel === "coordenacao" || u.tesouraria))) falha("permission denied");
      else if (coord === "ver" && !(u.status === "ativo" && (u.papel === "coordenacao" || u.tesouraria || u.conselho_fiscal))) falha("permission denied");
      else if (coord === "cf" && !(u.status === "ativo" && u.conselho_fiscal)) falha("Só o Conselho Fiscal pode fazer isso.");
      else if (coord === true && !(u.papel === "coordenacao" && u.status === "ativo")) falha("permission denied");
      else if (coord === "ca" && !(u.status === "ativo" && u.conselho_adm)) falha("Só o Conselho de Administração valida formação e experiência (Estatuto, art. 8º, V).");
      return u;
    };
    const semSenha = (p) => { const c = { ...p }; delete c.senha; return c; };
    const lancarDemo = (s, m) => {
      if (!s.fin || s.fin.parametros.modo !== "sistema" || m.status !== "confirmado" || m.lancado) return;
      const c = s.fin.cooperados.find((x) => x.perfil_id === m.cooperado_id); if (!c) return;
      const quando = (m.decidido_em || new Date().toISOString()).slice(0, 10);
      (m.alocacao || []).forEach((a) => s.fin.pagamentos.push({ id: novoId(), data: quando, fin_cooperado_id: c.id,
        tipo: a.destino === "integralizacao" ? (m.tipo === "pix" ? "integralizacao" : "abatimento") : a.destino === "contribuicao" ? "contribuicao" : "chamada",
        despesa_id: null, mes_ref: a.destino === "contribuicao" ? (a.mes || quando.slice(0, 7)) + "-01" : null, valor: a.valor,
        observacao: m.tipo === "pix" ? "Pix BIMC" + m.codigo : "Abatimento com aportes feito no site", origem: m.tipo === "pix" ? "pix" : "abatimento", movimento_id: m.id, criado_nome: m.decidido_nome }));
      m.lancado = true;
    };
    /* hora que gera crédito: aprovada e, se de projeto, de contrato remunerado (ou projeto antigo) */
    const geraCredito = (s, h) => {
      if (h.tipo !== "produtiva") return true;
      if ((h.aprovacao || "aprovada") !== "aprovada") return false;
      if (!h.projeto_id) return true;
      const p = s.projetos.find((x) => x.id === h.projeto_id); if (!p) return true;
      if (p.exige_contrato === false || p.exige_contrato == null) return true;
      const c = (s.contratos || []).find((x) => x.id === p.contrato_id); return !!(c && c.remunerado);
    };
    const UI_hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    const nomeProjeto = (s, id) => (s.projetos.find((p) => p.id === id) || {}).nome || "—";
    const nomePessoa = (s, id) => (s.perfis.find((p) => p.id === id) || {}).nome || "—";

    return {
      demo: true,
      async getSession() {
        const s = ler(); const u = eu(s);
        return espera(u ? { user: { id: u.id, email: u.email }, perfil: semSenha(u) } : null);
      },
      async signIn(email, senha) {
        const s = ler();
        const u = s.perfis.find((p) => p.email.toLowerCase() === String(email).trim().toLowerCase());
        if (!u || u.senha !== senha) falha("Invalid login credentials");
        try { localStorage.setItem(SKEY, u.id); } catch (e) {}
        return espera(true);
      },
      async reenviarConfirmacao() { return espera(true); },
      async confirmarCodigo() { return espera(true); },
      async signUp(dados) {
        const s = ler();
        const email = String(dados.email).trim(), senha = dados.senha;
        if (String(senha).length < 8) falha("Password should be at least 8");
        if (s.perfis.some((p) => p.email.toLowerCase() === email.toLowerCase())) falha("already registered");
        const p = { id: novoId(), email, senha, papel: "cooperado", status: "pendente", data_ingresso: null, criado_em: new Date().toISOString() };
        CAMPOS_SOLICITACAO.forEach((k) => { p[k] = k === "telefone" ? formatarTelefone(dados[k] || "") : dados[k] || ""; });
        p.especialidade = p.area_atuacao;
        s.perfis.push(p);
        gravar(s);
        return espera({ precisaConfirmar: false });
      },
      async signOut() { try { localStorage.removeItem(SKEY); } catch (e) {} return espera(true); },
      async resetPassword() { return espera(true); },
      async updatePassword(nova) {
        const s = ler(); const u = exigir(s);
        if (String(nova).length < 8) falha("Password should be at least 8");
        u.senha = nova; gravar(s); return espera(true);
      },
      onRecovery() {},
      async resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); } catch (e) {} },

      perfil: {
        async atualizarMeu(dados) {
          const s = ler(); const u = exigir(s);
          ["nome", "telefone", "especialidade"].forEach((k) => { if (k in dados) u[k] = k === "telefone" ? formatarTelefone(dados[k]) : dados[k]; });
          gravar(s); return espera(semSenha(u));
        }
      },
      cooperados: {
        async listar() { const s = ler(); exigir(s, "ver"); return espera(s.perfis.map(semSenha).sort((a, b) => a.nome.localeCompare(b.nome))); },
        async atualizar(id, dados) {
          const s = ler(); exigir(s, true);
          const p = s.perfis.find((x) => x.id === id); if (!p) falha("Cadastro não encontrado.");
          if ("status" in dados && dados.status !== p.status) p.analisado_em = new Date().toISOString();
          if (dados.conselho_adm && dados.conselho_fiscal) falha("Quem é do Conselho Fiscal não pode ser do Conselho de Administração (Estatuto, art. 60, §5º).");
          ["papel", "status", "analise_obs", "tesouraria", "conselho_fiscal", "conselho_adm", "cargo_ca"].forEach((k) => { if (k in dados) p[k] = dados[k]; });
          if (!p.conselho_adm) p.cargo_ca = null;
          if (p.status === "ativo" && !p.data_ingresso) p.data_ingresso = new Date().toISOString().slice(0, 10);
          gravar(s); return espera(semSenha(p));
        }
      },
      comunicados: {
        async listar() { const s = ler(); exigir(s); return espera([...s.comunicados].sort((a, b) => b.publicado_em.localeCompare(a.publicado_em))); },
        async criar({ titulo, corpo }) {
          const s = ler(); const u = exigir(s, true);
          s.comunicados.push({ id: novoId(), titulo, corpo, autor_nome: u.nome, publicado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async excluir(id) { const s = ler(); exigir(s, true); s.comunicados = s.comunicados.filter((c) => c.id !== id); gravar(s); return espera(true); }
      },
      documentos: {
        async listar() { const s = ler(); exigir(s); return espera([...s.documentos].sort((a, b) => b.criado_em.localeCompare(a.criado_em))); },
        async enviar({ titulo, categoria, arquivo }) {
          const s = ler(); exigir(s, true);
          if (arquivo.size > 1.5 * 1024 * 1024) falha("No modo demonstração o limite é 1,5 MB por arquivo. Com o banco real, o limite é 50 MB.");
          const dataUrl = await new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(arquivo); });
          s.documentos.push({ id: novoId(), titulo, categoria, nome_arquivo: arquivo.name, tamanho: arquivo.size, caminho: dataUrl, criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async link(doc) { return doc.caminho; },
        async excluir(doc) { const s = ler(); exigir(s, true); s.documentos = s.documentos.filter((d) => d.id !== doc.id); gravar(s); return espera(true); }
      },
      projetos: {
        async listar() { const s = ler(); exigir(s); return espera([...s.projetos].sort((a, b) => (b.criado_em || "").localeCompare(a.criado_em || ""))); },
        async salvar(p) {
          const s = ler(); exigir(s, true);
          if (p.id) { const i = s.projetos.findIndex((x) => x.id === p.id); s.projetos[i] = { ...s.projetos[i], ...p }; }
          else s.projetos.push({ ...p, id: novoId(), criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async excluir(id) {
          const s = ler(); exigir(s, true);
          if (s.producao.some((h) => h.projeto_id === id)) falha("Este projeto tem horas lançadas. Mude o status para Suspenso ou Concluído em vez de excluir.");
          s.projetos = s.projetos.filter((x) => x.id !== id); gravar(s); return espera(true);
        }
      },
      producao: {
        _aprov(s, h) {
          if (h.tipo !== "produtiva") return { aprovacao: "aprovada", aprovado_nome: null, aprovado_em: null, aprov_motivo: null };
          if (!h.projeto_id) falha("Hora de produção técnica precisa estar ligada a um projeto.");
          const p = s.projetos.find((x) => x.id === h.projeto_id); const ads = s.projeto_adesoes || [];
          const equipe = p.coordenador_id || ads.some((a) => a.projeto_id === p.id && a.status === "confirmada");
          const membro = p.coordenador_id === h.cooperado_id || ads.some((a) => a.projeto_id === p.id && a.perfil_id === h.cooperado_id && ["confirmada", "encerrada"].includes(a.status));
          if (equipe && !membro) falha("Você não está na equipe deste projeto. Manifeste adesão a uma das chamadas abertas.");
          return { aprovacao: "pendente", aprovado_nome: null, aprovado_em: null, aprov_motivo: null };
        },
        async minhas() {
          const s = ler(); const u = exigir(s);
          return espera(s.producao.filter((h) => h.cooperado_id === u.id).map((h) => ({ ...h, projeto_nome: nomeProjeto(s, h.projeto_id) })).sort((a, b) => b.data.localeCompare(a.data)));
        },
        async todas() {
          const s = ler(); exigir(s, "ver");
          return espera(s.producao.map((h) => ({ ...h, projeto_nome: nomeProjeto(s, h.projeto_id), cooperado_nome: nomePessoa(s, h.cooperado_id) })).sort((a, b) => b.data.localeCompare(a.data)));
        },
        async lancar(h) {
          const s = ler(); const u = exigir(s);
          if (u.status !== "ativo") falha("permission denied");
          s.producao.push({ ...h, id: novoId(), cooperado_id: u.id, ...this._aprov(s, { ...h, cooperado_id: u.id }) }); gravar(s); return espera(true);
        },
        async excluir(id) {
          const s = ler(); const u = exigir(s);
          const h = s.producao.find((x) => x.id === id);
          if (!h || (h.cooperado_id !== u.id && u.papel !== "coordenacao")) falha("permission denied");
          s.producao_historico = s.producao_historico || [];
          s.producao_historico.push({ id: novoId(), producao_id: h.id, cooperado_id: h.cooperado_id, acao: "excluido", antes: { ...h }, depois: null, por_id: u.id, por_nome: u.nome, em: new Date().toISOString() });
          s.producao = s.producao.filter((x) => x.id !== id); gravar(s); return espera(true);
        },
        async editar(id, d) {
          const s = ler(); const u = exigir(s);
          const h = s.producao.find((x) => x.id === id);
          if (!h || (h.cooperado_id !== u.id && u.papel !== "coordenacao")) falha("permission denied");
          const antes = { ...h }; const mudou = ["horas", "data", "tipo", "projeto_id"].some((k) => k in d && String(d[k] || "") !== String(h[k] || ""));
          Object.assign(h, d); if (mudou) Object.assign(h, this._aprov(s, h));
          s.producao_historico = s.producao_historico || [];
          s.producao_historico.push({ id: novoId(), producao_id: h.id, cooperado_id: h.cooperado_id, acao: "editado", antes, depois: { ...h }, por_id: u.id, por_nome: u.nome, em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async historico() {
          const s = ler(); const u = exigir(s); const ve = u.papel === "coordenacao" || u.conselho_fiscal;
          return espera((s.producao_historico || []).filter((x) => ve || x.cooperado_id === u.id).map((x) => ({ ...x, cooperado_nome: nomePessoa(s, x.cooperado_id) })).sort((a, b) => b.em.localeCompare(a.em)));
        }
      },
      propostas: {
        _s(s) { s.prop = s.prop || { propostas: [], apoios: [], comentarios: [] }; return s.prop; },
        _g(u) { return u.status === "ativo" && (u.papel === "coordenacao" || u.conselho_fiscal); },
        async quadro() { const s = ler(); exigir(s); return espera(Math.max(s.perfis.filter((p) => p.status === "ativo").length, ((s.fin && s.fin.cooperados) || []).filter((c) => (c.situacao || "ativo") === "ativo").length)); },
        async listar() {
          const s = ler(); exigir(s); const P = this._s(s);
          return espera(JSON.parse(JSON.stringify(P.propostas.map((p) => ({ ...p, apoios: P.apoios.filter((a) => a.proposta_id === p.id), n_comentarios: P.comentarios.filter((c) => c.proposta_id === p.id).length })).sort((a, b) => b.criado_em.localeCompare(a.criado_em)))));
        },
        async comentarios(id) { const s = ler(); exigir(s); return espera(JSON.parse(JSON.stringify(this._s(s).comentarios.filter((c) => c.proposta_id === id)))); },
        async enviar(d) { const s = ler(); const u = exigir(s); if (u.status !== "ativo") falha("permission denied"); this._s(s).propostas.push({ ...d, id: novoId(), autor_id: u.id, autor_nome: u.nome, status: "enviada", resposta: null, assembleia_id: null, criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async editar(id, d) {
          const s = ler(); const u = exigir(s); const p = this._s(s).propostas.find((x) => x.id === id); if (!p) falha("Proposta não encontrada.");
          if (this._g(u)) { if ("status" in d || "resposta" in d) Object.assign(d, { respondido_nome: u.nome, respondido_em: new Date().toISOString() }); Object.assign(p, d); }
          else if (p.autor_id === u.id && p.status === "enviada") { ["titulo", "descricao", "justificativa", "tipo"].forEach((k) => { if (k in d) p[k] = d[k]; }); }
          else falha("Depois que a avaliação começa, a proposta não pode mais ser editada.");
          gravar(s); return espera(true);
        },
        async excluir(id) { const s = ler(); const u = exigir(s); const P = this._s(s); const p = P.propostas.find((x) => x.id === id); if (!p || p.autor_id !== u.id || p.status !== "enviada") falha("Só o autor exclui, e só antes da avaliação."); P.propostas = P.propostas.filter((x) => x.id !== id); gravar(s); return espera(true); },
        async apoiar(id) { const s = ler(); const u = exigir(s); const P = this._s(s); if (!P.apoios.some((a) => a.proposta_id === id && a.perfil_id === u.id)) P.apoios.push({ proposta_id: id, perfil_id: u.id, nome: u.nome, em: new Date().toISOString() }); gravar(s); return espera(true); },
        async desapoiar(id) { const s = ler(); const u = exigir(s); const P = this._s(s); P.apoios = P.apoios.filter((a) => !(a.proposta_id === id && a.perfil_id === u.id)); gravar(s); return espera(true); },
        async comentar(id, texto) { const s = ler(); const u = exigir(s); this._s(s).comentarios.push({ id: novoId(), proposta_id: id, perfil_id: u.id, nome: u.nome, texto: String(texto).slice(0, 2000), em: new Date().toISOString() }); gravar(s); return espera(true); }
      },
      assembleias: {
        _s(s) { s.asm = s.asm || { assembleias: [], pautas: [], presencas: [], votos: [], secretos: [], chat: [], assinaturas: [] }; return s.asm; },
        _gestor(u) { return u.status === "ativo" && (u.papel === "coordenacao" || u.conselho_fiscal); },
        _quorum(s, a) {
          const A = this._s(s); const n = a.membros_na_data || Math.max(s.perfis.filter((p) => p.status === "ativo").length, ((s.fin && s.fin.cooperados) || []).filter((c) => (c.situacao || "ativo") === "ativo").length);
          const pres = A.presencas.filter((x) => x.assembleia_id === a.id && x.apto).length;
          const min = (Date.now() - new Date(a.data_hora).getTime()) / 60000;
          const conv = min < 60 ? 1 : min < 120 ? 2 : 3;
          const req = conv === 1 ? Math.ceil(n * 2 / 3) : conv === 2 ? Math.floor(n / 2) + 1 : (n <= 19 ? 4 : Math.min(50, Math.ceil(n * 0.2)));
          return { membros: n, presentes: pres, convocacao: conv, necessario: req, atingido: pres >= req, tipo: a.tipo };
        },
        async listar() {
          const s = ler(); const u = exigir(s); const A = this._s(s); const g = this._gestor(u);
          return espera(JSON.parse(JSON.stringify(A.assembleias.filter((a) => g || a.status !== "rascunho").map((a) => ({ ...a, pautas: A.pautas.filter((p) => p.assembleia_id === a.id).sort((x, y) => x.ordem - y.ordem) })))));
        },
        async obter(id) {
          const s = ler(); const u = exigir(s); const A = this._s(s);
          const a = A.assembleias.find((x) => x.id === id); if (!a || (a.status === "rascunho" && !this._gestor(u))) falha("Assembleia não encontrada.");
          const pautas = A.pautas.filter((p) => p.assembleia_id === id).sort((x, y) => x.ordem - y.ordem);
          const ids = pautas.map((p) => p.id);
          const votos = A.votos.filter((v) => ids.includes(v.pauta_id) && (v.perfil_id === u.id || pautas.some((p) => p.id === v.pauta_id && p.status === "encerrada" && !p.voto_secreto)));
          const secretos = A.secretos.filter((v) => pautas.some((p) => p.id === v.pauta_id && p.status === "encerrada"));
          return espera(JSON.parse(JSON.stringify({ assembleia: a, pautas, votos, secretos, votantes: A.votos.filter((v) => ids.includes(v.pauta_id)).map((v) => ({ pauta_id: v.pauta_id, perfil_id: v.perfil_id, nome: v.nome })),
            presencas: A.presencas.filter((x) => x.assembleia_id === id), chat: A.chat.filter((c) => c.assembleia_id === id), assinaturas: A.assinaturas.filter((x) => x.assembleia_id === id),
            quorum: this._quorum(s, a), membros: s.perfis.filter((p) => p.status === "ativo").map((p) => ({ id: p.id, nome: p.nome, email: p.email })) })));
        },
        async salvar(d) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("permission denied"); const A = this._s(s);
          if (d.id) {
            const a = A.assembleias.find((x) => x.id === d.id); if (!a) falha("Assembleia não encontrada.");
            if (a.status !== "rascunho" && ["data_hora", "tipo", "titulo", "duracao_min"].some((k) => k in d && d[k] !== a[k])) falha("Depois do edital publicado, data, tipo e ordem do dia não mudam. Cancele e convoque outra assembleia.");
            if (a.ata_publicada_em && "ata" in d && d.ata !== a.ata) falha("A ata já foi publicada.");
            Object.assign(a, d);
          } else A.assembleias.push({ duracao_min: 120, ...d, id: novoId(), status: "rascunho", criado_por: u.id, criado_nome: u.nome, criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async excluir(id) { const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("permission denied"); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id); if (!a || a.status !== "rascunho") falha("Só rascunhos podem ser excluídos; depois do edital, cancele."); A.assembleias = A.assembleias.filter((x) => x.id !== id); A.pautas = A.pautas.filter((p) => p.assembleia_id !== id); gravar(s); return espera(true); },
        async publicarEdital(id) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("permission denied"); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id);
          if (a.status !== "rascunho") falha("O edital já foi publicado.");
          if (a.tipo !== "pre" && new Date(a.data_hora) < new Date(Date.now() + 10 * 86400000)) falha("O edital precisa ser publicado com pelo menos 10 dias de antecedência (Estatuto, art. 30).");
          if (!A.pautas.some((p) => p.assembleia_id === id)) falha("Inclua ao menos uma pauta na ordem do dia (Estatuto, art. 33, IV).");
          Object.assign(a, { status: "agendada", edital_publicado_em: new Date().toISOString(), membros_na_data: Math.max(s.perfis.filter((p) => p.status === "ativo").length, ((s.fin && s.fin.cooperados) || []).filter((c) => (c.situacao || "ativo") === "ativo").length) }); gravar(s); return espera(true);
        },
        async cancelar(id, motivo) { const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("permission denied"); const a = this._s(s).assembleias.find((x) => x.id === id); if (!["rascunho", "agendada"].includes(a.status)) falha("Só assembleias ainda não abertas podem ser canceladas."); Object.assign(a, { status: "cancelada", motivo_cancelamento: motivo }); gravar(s); return espera(true); },
        async salvarPauta(p) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("permission denied"); const A = this._s(s);
          const a = A.assembleias.find((x) => x.id === p.assembleia_id); if (!a || a.status !== "rascunho") falha("A ordem do dia só muda antes de publicar o edital (Estatuto, art. 38).");
          if (p.id) Object.assign(A.pautas.find((x) => x.id === p.id), p); else A.pautas.push({ quorum: "maioria", impedir_orgaos: false, voto_secreto: false, ...p, id: novoId(), status: "aguardando", resultado: null });
          gravar(s); return espera(true);
        },
        async excluirPauta(id) { const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("permission denied"); const A = this._s(s); const p = A.pautas.find((x) => x.id === id); const a = A.assembleias.find((x) => x.id === p.assembleia_id); if (a.status !== "rascunho") falha("A ordem do dia só muda antes de publicar o edital."); A.pautas = A.pautas.filter((x) => x.id !== id); gravar(s); return espera(true); },
        async abrir(id) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("Só quem convoca abre a sala."); const a = this._s(s).assembleias.find((x) => x.id === id);
          if (a.status !== "agendada") falha("A assembleia não está agendada."); if (Date.now() < new Date(a.data_hora).getTime() - 30 * 60000) falha("A sala abre 30 minutos antes do horário do edital.");
          Object.assign(a, { status: "aberta", aberta_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async entrar(id) {
          const s = ler(); const u = exigir(s); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id);
          if (!["aberta", "instalada"].includes(a.status)) falha("A sala desta assembleia não está aberta."); if (u.status !== "ativo") falha("Só cooperados ativos participam.");
          if (!A.presencas.some((x) => x.assembleia_id === id && x.perfil_id === u.id)) A.presencas.push({ assembleia_id: id, perfil_id: u.id, nome: u.nome, entrou_em: new Date().toISOString(),
            apto: !u.data_ingresso || !a.edital_publicado_em || u.data_ingresso <= a.edital_publicado_em.slice(0, 10), orgao: u.papel === "coordenacao" || !!u.tesouraria || !!u.conselho_fiscal });
          gravar(s); return espera(true);
        },
        async instalar(id) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("Só quem dirige a assembleia a instala."); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id);
          if (a.status !== "aberta") falha("A sala precisa estar aberta."); let q;
          if (a.tipo !== "pre") { if (Date.now() < new Date(a.data_hora).getTime()) falha("A assembleia só pode ser instalada a partir do horário do edital."); q = this._quorum(s, a); if (!q.atingido) falha(`Quórum ainda não atingido: ${q.presentes} presentes aptos, ${q.necessario} necessários na ${q.convocacao}ª convocação.`); }
          else q = { presentes: A.presencas.filter((x) => x.assembleia_id === id).length, convocacao: 0 };
          Object.assign(a, { status: "instalada", instalada_em: new Date().toISOString(), instalada_presentes: q.presentes, instalada_convocacao: q.convocacao }); gravar(s); return espera(q);
        },
        async encerrar(id, semQuorum) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("Só quem dirige a assembleia a encerra."); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id);
          if (semQuorum) { if (a.status !== "aberta") falha("Só uma sala aberta e não instalada pode ser encerrada por falta de quórum."); if (a.tipo !== "pre" && Date.now() < new Date(a.data_hora).getTime() + Math.max(a.duracao_min, 120) * 60000) falha("Numa assembleia digital, o quórum pode ser alcançado durante todo o período mínimo da sessão (Estatuto, art. 30, §2º)."); }
          else { if (a.status !== "instalada") falha("A assembleia não está instalada."); if (A.pautas.some((p) => p.assembleia_id === id && p.status === "em_votacao")) falha("Encerre a votação em andamento antes."); }
          Object.assign(a, { status: semQuorum ? "sem_quorum" : "encerrada", encerrada_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async pautaAbrir(id, secreto) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("Só quem dirige a assembleia abre a votação."); const A = this._s(s); const p = A.pautas.find((x) => x.id === id); const a = A.assembleias.find((x) => x.id === p.assembleia_id);
          if (a.status !== "instalada") falha("A assembleia precisa estar instalada para votar."); if (p.status !== "aguardando") falha("Esta pauta já foi votada."); if (A.pautas.some((x) => x.assembleia_id === a.id && x.status === "em_votacao")) falha("Já há uma votação aberta.");
          Object.assign(p, { status: "em_votacao", aberta_em: new Date().toISOString(), voto_secreto: !!secreto }); gravar(s); return espera(true);
        },
        async votar(pautaId, voto) {
          const s = ler(); const u = exigir(s); const A = this._s(s); const p = A.pautas.find((x) => x.id === pautaId);
          if (p.status !== "em_votacao") falha("A votação desta pauta não está aberta.");
          const x = A.presencas.find((k) => k.assembleia_id === p.assembleia_id && k.perfil_id === u.id); if (!x) falha("Entre na sala para votar (sua presença identifica o seu voto).");
          if (!x.apto) falha("Quem foi admitido depois do edital não vota nesta assembleia (Estatuto, art. 28, §3º)."); if (p.impedir_orgaos && x.orgao) falha("Membros da administração e do Conselho Fiscal não votam nesta matéria (Estatuto, arts. 37 e 42, §1º).");
          if (A.votos.some((v) => v.pauta_id === pautaId && v.perfil_id === u.id)) falha("Você já votou nesta pauta. O voto não pode ser mudado.");
          if (p.voto_secreto) { A.votos.push({ pauta_id: pautaId, perfil_id: u.id, nome: u.nome, voto: null, em: new Date().toISOString() }); A.secretos.push({ id: novoId(), pauta_id: pautaId, voto }); }
          else A.votos.push({ pauta_id: pautaId, perfil_id: u.id, nome: u.nome, voto, em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async pautaEncerrar(id) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("Só quem dirige a assembleia encerra a votação."); const A = this._s(s); const p = A.pautas.find((x) => x.id === id); const a = A.assembleias.find((x) => x.id === p.assembleia_id);
          if (p.status !== "em_votacao") falha("A votação desta pauta não está aberta.");
          const aptos = A.presencas.filter((x) => x.assembleia_id === a.id && x.apto && !(p.impedir_orgaos && x.orgao)).length;
          const fonte = p.voto_secreto ? A.secretos.filter((v) => v.pauta_id === id) : A.votos.filter((v) => v.pauta_id === id);
          const c = (k) => fonte.filter((v) => v.voto === k).length; const fav = c("favor"), con = c("contra"), abs = c("abstencao"); const naov = Math.max(0, aptos - fav - con - abs);
          const minimo = p.quorum === "dois_tercos" ? Math.ceil(aptos * 2 / 3) : Math.floor(aptos / 2) + 1;
          const res = a.tipo === "pre" ? "consulta" : (abs + naov) * 2 > aptos ? "adiada" : fav >= minimo && aptos > 0 ? "aprovada" : "rejeitada";
          Object.assign(p, { status: "encerrada", encerrada_em: new Date().toISOString(), resultado: { aptos, favor: fav, contra: con, abstencao: abs, nao_votaram: naov, necessario: minimo, resultado: res, secreto: p.voto_secreto } });
          gravar(s); return espera(p.resultado);
        },
        async chat(id) { const s = ler(); exigir(s); return espera(this._s(s).chat.filter((c) => c.assembleia_id === id)); },
        async enviarChat(id, texto) {
          const s = ler(); const u = exigir(s); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id);
          if (!["aberta", "instalada"].includes(a.status) || !A.presencas.some((x) => x.assembleia_id === id && x.perfil_id === u.id)) falha("Entre na sala para usar o chat.");
          A.chat.push({ id: novoId(), assembleia_id: id, perfil_id: u.id, nome: u.nome, texto: String(texto).slice(0, 1000), em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async assinar(id, qualidade) {
          const s = ler(); const u = exigir(s); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id);
          if (!["encerrada", "sem_quorum"].includes(a.status)) falha("A ata é assinada depois do encerramento."); if (a.ata_publicada_em) falha("A ata já foi publicada."); if (!a.ata) falha("A ata ainda não foi redigida.");
          if (!A.presencas.some((x) => x.assembleia_id === id && x.perfil_id === u.id)) falha("Só quem esteve presente assina a ata.");
          A.assinaturas = A.assinaturas.filter((x) => !(x.assembleia_id === id && x.perfil_id === u.id)); A.assinaturas.push({ assembleia_id: id, perfil_id: u.id, nome: u.nome, qualidade: qualidade || "cooperado", em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async publicarAta(id) {
          const s = ler(); const u = exigir(s); if (!this._gestor(u)) falha("Só quem dirige a assembleia publica a ata."); const A = this._s(s); const a = A.assembleias.find((x) => x.id === id);
          if (!["encerrada", "sem_quorum"].includes(a.status)) falha("A assembleia ainda não foi encerrada."); if (!a.ata) falha("Redija a ata antes de publicar."); if (!A.assinaturas.some((x) => x.assembleia_id === id)) falha("A ata precisa de pelo menos uma assinatura.");
          a.ata_publicada_em = new Date().toISOString(); gravar(s); return espera(true);
        }
      },
      cf: {
        _l(s, k) { s.cf = s.cf || {}; s.cf[k] = s.cf[k] || []; return s.cf[k]; },
        async conferencias() { const s = ler(); exigir(s, "ver"); return espera(JSON.parse(JSON.stringify(this._l(s, "conferencias")))); },
        async conferir(d) { const s = ler(); const u = exigir(s, "cf"); this._l(s, "conferencias").push({ ...d, id: novoId(), conselheiro_nome: u.nome, criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async guias() { const s = ler(); exigir(s, "ver"); return espera(JSON.parse(JSON.stringify(this._l(s, "guias")))); },
        async salvarGuia(d) { const s = ler(); const u = exigir(s, "tes"); this._l(s, "guias").push({ ...d, id: novoId(), registrado_nome: u.nome, criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async excluirGuia(id) { const s = ler(); exigir(s, "tes"); s.cf.guias = this._l(s, "guias").filter((x) => x.id !== id); gravar(s); return espera(true); },
        async prestacoes() { const s = ler(); const u = exigir(s); const ve = u.papel === "coordenacao" || u.tesouraria || u.conselho_fiscal; return espera(JSON.parse(JSON.stringify(this._l(s, "prestacoes").filter((x) => ve || x.status === "publicada")))); },
        async prepararPrestacao(trimestre, dados) {
          const s = ler(); const u = exigir(s, "tes"); const l = this._l(s, "prestacoes"); const x = l.find((p) => p.trimestre === trimestre);
          if (x && x.status === "publicada") falha("Prestação já publicada não pode ser alterada.");
          const novo = { trimestre, dados, status: "aguardando_cf", preparado_nome: u.nome, preparado_em: new Date().toISOString(), conferido_nome: null, conferido_em: null, parecer: null, publicado_em: null };
          if (x) Object.assign(x, novo); else l.push(novo); gravar(s); return espera(true);
        },
        async conferirPrestacao(trimestre, status, parecer) {
          const s = ler(); const u = exigir(s, "cf"); if (u.tesouraria) falha("Quem acumula tesouraria e Conselho Fiscal não pode conferir a própria prestação.");
          const x = this._l(s, "prestacoes").find((p) => p.trimestre === trimestre); if (!x || x.status === "publicada") falha("Prestação não disponível.");
          Object.assign(x, { status, parecer, conferido_nome: u.nome, conferido_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async publicarPrestacao(trimestre) {
          const s = ler(); exigir(s, "tes"); const x = this._l(s, "prestacoes").find((p) => p.trimestre === trimestre);
          if (!x || x.status !== "conferida") falha("A prestação só pode ser publicada depois da conferência do Conselho Fiscal.");
          Object.assign(x, { status: "publicada", publicado_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async inconformidades() { const s = ler(); const u = exigir(s); if (!(u.conselho_fiscal || u.papel === "coordenacao")) falha("permission denied"); return espera(JSON.parse(JSON.stringify(this._l(s, "inconformidades")))); },
        async salvarInconformidade(d) {
          const s = ler(); const u = exigir(s, "cf"); const l = this._l(s, "inconformidades");
          if (d.id) { const x = l.find((i) => i.id === d.id); Object.assign(x, d); } else l.push({ status: "aberta", ...d, id: novoId(), criado_nome: u.nome, criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async responderInconformidade(id, resposta) {
          const s = ler(); const u = exigir(s, true); const x = this._l(s, "inconformidades").find((i) => i.id === id);
          if (!x || x.status !== "esclarecimento") falha("Esta inconformidade não aguarda esclarecimento.");
          Object.assign(x, { resposta_ca: resposta, respondido_nome: u.nome, respondido_em: new Date().toISOString(), status: "respondida" }); gravar(s); return espera(true);
        },
        async relatorios() { const s = ler(); const u = exigir(s); if (!(u.conselho_fiscal || u.papel === "coordenacao")) falha("permission denied"); return espera(JSON.parse(JSON.stringify(this._l(s, "relatorios")))); },
        async salvarRelatorio(d) { const s = ler(); const u = exigir(s, "cf"); this._l(s, "relatorios").push({ ...d, id: novoId(), criado_nome: u.nome, criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async enviarDenuncia(d) {
          const s = ler(); const u = exigir(s); if (u.status !== "ativo") falha("permission denied");
          const prot = "BC-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(16).slice(2, 7).toUpperCase();
          const prazo = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          this._l(s, "denuncias").push({ ...d, id: novoId(), protocolo: prot, prazo, status: "recebida", prorrogada: false, afastamento_proposto: false, conclusao: null,
            autor_id: d.sigilosa ? null : u.id, autor_nome: d.sigilosa ? null : u.nome, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() });
          gravar(s); return espera(prot);
        },
        async minhasDenuncias() { const s = ler(); const u = exigir(s); return espera(this._l(s, "denuncias").filter((x) => x.autor_id === u.id)); },
        async acompanharDenuncia(prot) {
          const s = ler(); exigir(s); const x = this._l(s, "denuncias").find((d) => d.protocolo === String(prot).trim().toUpperCase()); if (!x) return espera(null);
          return espera({ protocolo: x.protocolo, tipo: x.tipo, assunto: x.assunto, status: x.status, criado_em: x.criado_em, prazo: x.prazo, conclusao: ["procedente", "improcedente", "arquivada"].includes(x.status) ? x.conclusao : null });
        },
        async denuncias() { const s = ler(); exigir(s, "cf"); return espera(JSON.parse(JSON.stringify(this._l(s, "denuncias")))); },
        async atualizarDenuncia(id, d) { const s = ler(); exigir(s, "cf"); const x = this._l(s, "denuncias").find((i) => i.id === id); Object.assign(x, d, { atualizado_em: new Date().toISOString() }); gravar(s); return espera(true); }
      },
      financeiro: {
        async minhas() { const s = ler(); const u = exigir(s); return espera((s.fin_posicoes || []).filter((p) => p.cooperado_id === u.id).sort((a, b) => b.data_base.localeCompare(a.data_base) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")))); },
        async todas() { const s = ler(); exigir(s, "tes"); return espera((s.fin_posicoes || []).map((p) => ({ ...p, cooperado_nome: nomePessoa(s, p.cooperado_id) }))); },
        async importacoes() { const s = ler(); exigir(s, "tes"); return espera([...(s.fin_importacoes || [])].sort((a, b) => b.criado_em.localeCompare(a.criado_em))); },
        async importar({ data_base, arquivo, linhas, pendentes, incorporar }) {
          const s = ler(); const u = exigir(s, "tes");
          let dataUrl = null;
          if (arquivo && arquivo.size < 1.5 * 1024 * 1024) dataUrl = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(arquivo); });
          const imp = { id: novoId(), data_base, arquivo: arquivo ? arquivo.name : "", caminho_arquivo: dataUrl, linhas: linhas.length, criado_nome: u.nome, criado_em: new Date().toISOString() };
          s.fin_importacoes = s.fin_importacoes || []; s.fin_posicoes = s.fin_posicoes || [];
          s.fin_importacoes.push(imp);
          linhas.forEach((l) => s.fin_posicoes.push({ ...l, id: novoId(), importacao_id: imp.id, data_base, criado_em: imp.criado_em }));
          (s.fin_movimentos || []).forEach((m) => { if ((incorporar || []).includes(m.codigo) && m.status === "confirmado" && !m.incorporado_em) m.incorporado_em = imp.id; });
          gravar(s); return espera(true);
        },
        async ultimaPlanilha() {
          const s = ler(); exigir(s, "tes");
          const i = [...(s.fin_importacoes || [])].filter((x) => x.caminho_arquivo).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
          return espera(i ? { url: i.caminho_arquivo, nome: i.arquivo, data_base: i.data_base, criado_em: i.criado_em } : null);
        },
        async excluirImportacao(id) {
          const s = ler(); exigir(s, "tes");
          s.fin_importacoes = s.fin_importacoes.filter((i) => i.id !== id);
          s.fin_posicoes = s.fin_posicoes.filter((p) => p.importacao_id !== id);
          (s.fin_movimentos || []).forEach((m) => { if (m.incorporado_em === id) m.incorporado_em = null; });
          gravar(s); return espera(true);
        }
      },
      movimentos: {
        async meus() { const s = ler(); const u = exigir(s); return espera((s.fin_movimentos || []).filter((m) => m.cooperado_id === u.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em))); },
        async todos() { const s = ler(); exigir(s, "ver"); return espera((s.fin_movimentos || []).map((m) => ({ ...m, cooperado_nome: nomePessoa(s, m.cooperado_id) })).sort((a, b) => b.criado_em.localeCompare(a.criado_em))); },
        async pagarPix({ codigo, valor, alocacao, comprovante }) {
          const s = ler(); const u = exigir(s); if (u.status !== "ativo") falha("permission denied");
          s.fin_movimentos = s.fin_movimentos || [];
          s.fin_movimentos.push({ id: novoId(), codigo, cooperado_id: u.id, tipo: "pix", valor, alocacao, status: "aguardando", comprovante: comprovante ? comprovante.name : null, criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async cancelarPix(id) {
          const s = ler(); const u = exigir(s); const m = (s.fin_movimentos || []).find((x) => x.id === id && x.cooperado_id === u.id && x.status === "aguardando");
          if (!m) falha("Este Pix não pode mais ser cancelado."); m.status = "cancelado"; m.decidido_em = new Date().toISOString(); m.decidido_nome = "Cancelado pelo cooperado"; gravar(s); return espera(true);
        },
        async abater(valor) {
          const s = ler(); const u = exigir(s); if (u.status !== "ativo") falha("permission denied");
          let pos = (s.fin_posicoes || []).filter((p) => p.cooperado_id === u.id).sort((a, b) => b.data_base.localeCompare(a.data_base) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")))[0];
          if (s.fin && s.fin.parametros.modo === "sistema") { const c = s.fin.cooperados.find((x) => x.perfil_id === u.id); pos = c ? window.Fin.calcularCooperado(c, s.fin) : null; if (pos) pos.cooperado_id = u.id; }
          if (!pos) falha("Ainda não há posição financeira sua no site.");
          const c = window.Fin.componentes(pos, (s.fin_movimentos || []).filter((m) => m.cooperado_id === u.id));
          valor = window.Fin.centavos(valor);
          if (!(valor > 0)) falha("Informe um valor maior que zero.");
          if (valor > c.maxAbater + 0.005) falha("O valor máximo para abater agora é " + c.maxAbater.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + ".");
          s.fin_movimentos = s.fin_movimentos || [];
          const mv = { id: novoId(), codigo: window.Fin.novoCodigo(), cooperado_id: u.id, tipo: "compensacao", valor, alocacao: [{ destino: "integralizacao", valor }], status: "confirmado", decidido_em: new Date().toISOString(), decidido_nome: "Feito pelo cooperado no site", criado_em: new Date().toISOString() };
          s.fin_movimentos.push(mv); lancarDemo(s, mv);
          gravar(s); return espera(true);
        },
        async decidir(id, status, motivo) {
          const s = ler(); const u = exigir(s, "tes"); const m = (s.fin_movimentos || []).find((x) => x.id === id && x.status === "aguardando");
          if (!m) falha("Este Pix já foi decidido."); if (m.cooperado_id === u.id) falha("Ninguém confirma o próprio Pix: outra pessoa da tesouraria confirma.");
          m.status = status; m.motivo = motivo || null; m.decidido_em = new Date().toISOString(); m.decidido_nome = u.nome; lancarDemo(s, m); gravar(s); return espera(true);
        },
        async comprovante() { falha("No modo demonstração os comprovantes não são guardados."); }
      },
      exp: {
        async meu() {
          const s = ler(); const u = exigir(s); const c = s.fin.cooperados.find((x) => x.perfil_id === u.id) || null;
          const f = (k) => (c ? (s.fin[k] || []).filter((x) => x.fin_cooperado_id === c.id) : []);
          const internas = c ? (await this.internas()).filter((x) => x.fin_cooperado_id === c.id) : [];
          return espera({ parametros: { ...s.fin.parametros }, cooperado: c, habilitacoes: f("habilitacoes"), experiencias: f("experiencias"), comprovantes: f("comprovantes"), internas });
        },
        async todos() { const s = ler(); const u = exigir(s); if (!u.conselho_adm) exigir(s, "ver"); return espera({ habilitacoes: s.fin.habilitacoes || [], experiencias: s.fin.experiencias || [], comprovantes: s.fin.comprovantes || [] }); },
        async painelCA() {
          const s = ler(); const u = exigir(s); if (!u.conselho_adm) exigir(s, "ver"); const t = await this.todos();
          return espera(JSON.parse(JSON.stringify({ parametros: { ...s.fin.parametros }, cooperados: s.fin.cooperados, ...t, internas: await this.internas() })));
        },
        async internas() {
          const s = ler(); const u = exigir(s); const valida = u.papel === "coordenacao" || u.tesouraria || u.conselho_fiscal || u.conselho_adm;
          const out = {};
          s.fin.cooperados.filter((c) => valida || c.perfil_id === u.id).forEach((c) => {
            (s.producao || []).filter((h) => c.perfil_id && h.cooperado_id === c.perfil_id && (h.tipo === "produtiva" || h.tipo === "formacao") && (h.aprovacao || "aprovada") === "aprovada").forEach((h) => {
              const k = c.id + "|" + String(h.data).slice(0, 7); out[k] = out[k] || { fin_cooperado_id: c.id, mes: String(h.data).slice(0, 7) + "-01", horas: 0, origem: "lancado" }; out[k].horas += Number(h.horas);
            });
            (s.fin.folha || []).filter((f) => f.fin_cooperado_id === c.id).forEach((f) => { out[c.id + "|" + String(f.mes).slice(0, 7)] = { fin_cooperado_id: c.id, mes: f.mes, horas: Number(f.horas_produtivas || 0) + Number(f.horas_formacao || 0), origem: "fechamento" }; });
          });
          return espera(Object.values(out));
        },
        async salvar(tabela, d) {
          const s = ler(); const u = exigir(s); const lista = (s.fin[tabela] = s.fin[tabela] || []);
          const meu = s.fin.cooperados.find((x) => x.perfil_id === u.id);
          if (!meu || d.fin_cooperado_id !== meu.id) { if (!(u.papel === "coordenacao" || u.tesouraria)) falha("permission denied"); }
          if (d.id) { const x = lista.find((r) => r.id === d.id); if (!x) falha("Registro não encontrado."); if (x.status === "aprovada" && meu && x.fin_cooperado_id === meu.id) falha("Registro já validado: peça ao Conselho de Administração para alterar."); Object.assign(x, d, { status: "pendente", analise_nome: null, motivo: null }); }
          else lista.push({ ...d, id: novoId(), status: "pendente", criado_em: new Date().toISOString() });
          gravar(s); return espera(d.id || lista[lista.length - 1].id);
        },
        async excluir(tabela, id) { const s = ler(); exigir(s); s.fin[tabela] = (s.fin[tabela] || []).filter((r) => r.id !== id); s.fin.comprovantes = (s.fin.comprovantes || []).filter((c) => c.ref_id !== id); gravar(s); return espera(true); },
        async anexar(fin_cooperado_id, ref_tipo, ref_id, arquivo) {
          const s = ler(); exigir(s); s.fin.comprovantes = s.fin.comprovantes || [];
          s.fin.comprovantes.push({ id: novoId(), fin_cooperado_id, ref_tipo, ref_id, caminho: "demo/" + arquivo.name, nome_arquivo: arquivo.name, tamanho: arquivo.size, criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async link() { falha("No modo demonstração os arquivos não são guardados."); },
        async excluirComprovante(c) { const s = ler(); exigir(s); s.fin.comprovantes = (s.fin.comprovantes || []).filter((x) => x.id !== c.id); gravar(s); return espera(true); },
        async analisar(tabela, id, status, motivo) {
          const s = ler(); const u = exigir(s, "ca"); const x = (s.fin[tabela] || []).find((r) => r.id === id); if (!x) falha("Registro não encontrado.");
          const meu = s.fin.cooperados.find((c) => c.perfil_id === u.id); if (meu && x.fin_cooperado_id === meu.id) falha("Você não pode validar o seu próprio registro.");
          const CG = { presidente: "Presidente do Conselho de Administração", gestao_tecnica: "Conselheiro(a) de Gestão Técnica, BIM e Qualidade", financeira: "Conselheiro(a) de Área Financeira e de Fundos", institucional: "Conselheiro(a) de Área Institucional, Contratos e Relações Externas" };
          Object.assign(x, { status, motivo: motivo || null, analise_nome: u.nome, analise_cargo: CG[u.cargo_ca] || "Conselheiro(a) de Administração", analise_em: new Date().toISOString() }); gravar(s); return espera(true);
        }
      },
      fin: {
        _horasMes(s, coopIds) {
          const out = {};
          s.fin.cooperados.filter((c) => c.perfil_id && (!coopIds || coopIds.includes(c.id))).forEach((c) => {
            s.producao.filter((h) => h.cooperado_id === c.perfil_id && ["produtiva", "formacao", "administrativa"].includes(h.tipo) && geraCredito(s, h)).forEach((h) => {
              const k = c.id + "|" + String(h.data).slice(0, 7);
              const o = out[k] = out[k] || { fin_cooperado_id: c.id, mes: String(h.data).slice(0, 7) + "-01", produtivas: 0, formacao: 0, administrativas: 0, _dias: new Set() };
              o[{ produtiva: "produtivas", formacao: "formacao", administrativa: "administrativas" }[h.tipo]] += Number(h.horas); o._dias.add(h.data);
            });
          });
          return Object.values(out).map((o) => { const d = o._dias.size; delete o._dias; return { ...o, dias: d }; });
        },
        async parametros() { const s = ler(); exigir(s); return espera({ ...s.fin.parametros }); },
        async solicitarRetirada(d) {
          const s = ler(); const u = exigir(s); const c = s.fin.cooperados.find((x) => x.perfil_id === u.id); if (!c) falha("Cadastro financeiro não ligado.");
          s.fin.retiradas = s.fin.retiradas || [];
          s.fin.retiradas.push({ id: novoId(), fin_cooperado_id: c.id, valor: d.valor, prazo: d.prazo, quitar_meses: d.quitar_meses || null, quitar_valor: d.quitar_valor || null, status: "solicitada", solicitado_em: new Date().toISOString(), solicitado_nome: u.nome });
          gravar(s); return espera(true);
        },
        async cancelarRetirada(id, motivo) {
          const s = ler(); const u = exigir(s); const r = (s.fin.retiradas || []).find((x) => x.id === id); if (!r || r.status !== "solicitada") falha("Esta solicitação não pode mais ser cancelada.");
          const meu = s.fin.cooperados.find((x) => x.perfil_id === u.id);
          if (!(meu && meu.id === r.fin_cooperado_id) && !(u.papel === "coordenacao" || u.tesouraria)) falha("permission denied");
          Object.assign(r, { status: "cancelada", motivo: motivo || null }); gravar(s); return espera(true);
        },
        async pagarRetirada(id, d) {
          const s = ler(); const u = exigir(s, "tes"); const r = (s.fin.retiradas || []).find((x) => x.id === id); if (!r) falha("Solicitação não encontrada.");
          if ((s.fin.cooperados.find((x) => x.id === r.fin_cooperado_id) || {}).perfil_id === u.id) falha("Ninguém registra o pagamento da própria retirada: outra pessoa da tesouraria registra.");
          Object.assign(r, d, { status: "paga", pago_nome: u.nome, atualizado_em: new Date().toISOString() });
          // cotas atrasadas quitadas com a retirada viram pagamentos de contribuição (no banco, um gatilho faz isso)
          s.fin.pagamentos = s.fin.pagamentos.filter((p) => p.retirada_id !== r.id);
          s.fin.notificacoes = s.fin.notificacoes || [];
          const nPagas = s.fin.retiradas.filter((x) => x.fin_cooperado_id === r.fin_cooperado_id && x.status === "paga").length;
          if (nPagas >= 2 && !(Number(r.quitar_valor) > 0) && Number(r.atrasadas_valor) > 0) {
            const num = s.fin.notificacoes.filter((x) => x.fin_cooperado_id === r.fin_cooperado_id).reduce((m, x) => Math.max(m, x.numero), 0) + 1;
            s.fin.notificacoes.push({ id: novoId(), fin_cooperado_id: r.fin_cooperado_id, cooperado_nome: (s.fin.cooperados.find((x) => x.id === r.fin_cooperado_id) || {}).nome, retirada_id: r.id, tipo: "cotas_atrasadas", numero: num, meses: r.atrasadas_meses || [], valor: Number(r.atrasadas_valor), retiradas_pagas: nPagas, status: "aberta", criado_em: new Date().toISOString() });
          }
          (r.quitar_meses || []).forEach((q) => { if (Number(q.valor) > 0) s.fin.pagamentos.push({ id: novoId(), data: r.pago_em, fin_cooperado_id: r.fin_cooperado_id, tipo: "contribuicao", mes_ref: q.mes + "-01", valor: Number(q.valor), observacao: "Descontado da retirada", origem: "tesouraria", retirada_id: r.id, criado_nome: u.nome, criado_em: new Date().toISOString() }); });
          gravar(s); return espera(true);
        },
        async desfazerPagamento(id) {
          const s = ler(); exigir(s, "tes"); const r = (s.fin.retiradas || []).find((x) => x.id === id); if (!r) falha("Solicitação não encontrada.");
          Object.assign(r, { status: "solicitada", pago_em: null, pago_nome: null, inss: null, contribuicao: null, fic_vol: null, liquido: null });
          s.fin.pagamentos = s.fin.pagamentos.filter((p) => p.retirada_id !== r.id);
          s.fin.notificacoes = (s.fin.notificacoes || []).filter((n) => !(n.retirada_id === r.id && n.status === "aberta")); gravar(s); return espera(true);
        },
        _caixa(s) {
          const sal = (s.fin.saldos || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criado_em).localeCompare(String(a.criado_em)))[0];
          const rs = s.fin.retiradas || [];
          const mp = (s.fin.mapa || [])[0]; const reservado = mp && mp.dados ? Number(mp.dados.reservado_mov || 0) : 0;
          return { data: sal ? sal.data : null, saldo: sal ? Number(sal.saldo) : null, reserva: Math.max(Number(s.fin.parametros.reserva_caixa || 0), reservado), reservado_mov: reservado, cobertura_admin: mp && mp.dados && mp.dados.cobertura_admin != null ? Number(mp.dados.cobertura_admin) : 1, patronal_pct: s.fin.parametros.patronal_pct != null ? s.fin.parametros.patronal_pct : 0.2,
            pedidos: rs.filter((r) => r.status === "solicitada").reduce((t, r) => t + Number(r.valor), 0),
            pagas_depois: sal ? rs.filter((r) => r.status === "paga" && (r.pago_em > sal.data || (r.pago_em === sal.data && String(r.atualizado_em || "") > String(sal.criado_em || "")))).reduce((t, r) => t + Number(r.valor), 0) : 0 };
        },
        async salvarSaldo(d) {
          const s = ler(); const u = exigir(s, "tes"); s.fin.saldos = s.fin.saldos || [];
          s.fin.saldos.push({ ...d, id: novoId(), registrado_nome: u.nome, criado_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async excluirSaldo(id) { const s = ler(); exigir(s, "tes"); s.fin.saldos = (s.fin.saldos || []).filter((x) => x.id !== id); gravar(s); return espera(true); },
        async salvarReceita(receita) {
          const s = ler(); exigir(s, "tes"); s.fin.receitas = s.fin.receitas || [];
          const r = s.fin.receitas.find((x) => x.mes === receita.mes); if (r) Object.assign(r, receita); else s.fin.receitas.push({ ...receita }); gravar(s); return espera(true);
        },
        async extrato() {
          const s = ler(); const u = exigir(s); const c = s.fin.cooperados.find((x) => x.perfil_id === u.id) || null;
          const pags = c ? s.fin.pagamentos.filter((p) => p.fin_cooperado_id === c.id) : [];
          const despesas = c ? s.fin.despesas.filter((d) => (d.cobrar && d.participantes.includes(c.id)) || pags.some((p) => p.despesa_id === d.id))
            .map((d) => ({ id: d.id, data: d.data, descricao: d.descricao, valor: d.valor, cobrar: d.cobrar, n_participantes: d.participantes.length, participantes: d.participantes.includes(c.id) ? [c.id] : [] })) : [];
          const folha = c ? (s.fin.folha || []).filter((f) => f.fin_cooperado_id === c.id) : [];
          const habilitacoes = c ? (s.fin.habilitacoes || []).filter((f) => f.fin_cooperado_id === c.id) : [];
          const experiencias = c ? (s.fin.experiencias || []).filter((f) => f.fin_cooperado_id === c.id) : [];
          const horas_total = s.producao.filter((h) => h.tipo === "produtiva" || h.tipo === "formacao").reduce((t, h) => t + Number(h.horas), 0);
          const horas_mes = c ? this._horasMes(s, [c.id]) : [];
          const retiradas = c ? (s.fin.retiradas || []).filter((r) => r.fin_cooperado_id === c.id) : [];
          return espera(JSON.parse(JSON.stringify({ parametros: { ...s.fin.parametros }, cooperado: c, pagamentos: pags, despesas, folha, horas_total, habilitacoes, experiencias, horas_mes, retiradas, vigencias: s.fin.vigencias || [], caixa: this._caixa(s), sobras_cotas: c ? (s.fin.sobras_cotas || []).filter((x) => x.fin_cooperado_id === c.id) : [] })));
        },
        async tudo() {
          const s = ler(); exigir(s, "ver"); s.fin.folha = s.fin.folha || []; s.fin.receitas = s.fin.receitas || []; s.fin.retiradas = s.fin.retiradas || [];
          const horas_total = s.producao.filter((h) => h.tipo === "produtiva" || h.tipo === "formacao").reduce((t, h) => t + Number(h.horas), 0);
          return espera(JSON.parse(JSON.stringify({ ...s.fin, saldos: s.fin.saldos || [], vigencias: s.fin.vigencias || [], sobras: s.fin.sobras || [], sobras_cotas: s.fin.sobras_cotas || [], fundos_mov: s.fin.fundos_mov || [], parcelas: s.contrato_parcelas || [], contratos: s.contratos || [], marcos: s.projeto_marcos || [], horas_mes: this._horasMes(s), horas_total, caixa: this._caixa(s) })));
        },
        async horasLancadas(mes) {
          const s = ler(); exigir(s, "tes"); const m = String(mes).slice(0, 7);
          return espera(s.fin.cooperados.filter((c) => c.perfil_id).map((c) => {
            const hs = s.producao.filter((h) => h.cooperado_id === c.perfil_id && String(h.data).slice(0, 7) === m);
            return { fin_cooperado_id: c.id, produtivas: hs.filter((h) => h.tipo === "produtiva").reduce((t, h) => t + Number(h.horas), 0),
              formacao: hs.filter((h) => h.tipo === "formacao").reduce((t, h) => t + Number(h.horas), 0),
              administrativas: hs.filter((h) => h.tipo === "administrativa").reduce((t, h) => t + Number(h.horas), 0),
              dias: new Set(hs.filter((h) => h.tipo === "produtiva" || h.tipo === "formacao" || h.tipo === "administrativa").map((h) => h.data)).size };
          }).filter((x) => x.produtivas || x.formacao || x.administrativas));
        },
        async salvarFolha(linhas, receita) {
          const s = ler(); const u = exigir(s, "tes"); s.fin.folha = s.fin.folha || []; s.fin.receitas = s.fin.receitas || [];
          linhas.forEach((l) => { const x = s.fin.folha.find((f) => f.fin_cooperado_id === l.fin_cooperado_id && f.mes === l.mes); if (x) Object.assign(x, l, { atualizado_nome: u.nome }); else s.fin.folha.push({ ...l, id: novoId(), atualizado_nome: u.nome }); });
          if (receita) { const r = s.fin.receitas.find((x) => x.mes === receita.mes); if (r) Object.assign(r, receita); else s.fin.receitas.push({ ...receita }); }
          gravar(s); return espera(true);
        },
        async salvarParametros(d, vigencia, chaves) {
          const s = ler(); const u = exigir(s, "tes");
          if (vigencia && chaves) {
            s.fin.vigencias = s.fin.vigencias || [];
            if (!s.fin.vigencias.length) { const atual = window.Fin ? window.Fin.params(s.fin.parametros) : s.fin.parametros; const ini = {}; chaves.forEach((k) => { if (atual[k] != null) ini[k] = atual[k]; }); s.fin.vigencias.push({ vigencia: "2026-01-01", dados: ini }); }
            const dados = {}; chaves.forEach((k) => { if (k in d) dados[k] = d[k]; });
            const x = s.fin.vigencias.find((v) => v.vigencia === vigencia); if (x) Object.assign(x.dados, dados); else s.fin.vigencias.push({ vigencia, dados, salvo_nome: u.nome });
          }
          Object.assign(s.fin.parametros, d, { atualizado_nome: u.nome });
          gravar(s); return espera(true);
        },
        async salvar(tabela, d) {
          const s = ler(); const u = exigir(s, "tes"); const lista = s.fin[tabela];
          if (d.id) { const x = lista.find((r) => r.id === d.id); if (!x) falha("Registro não encontrado."); Object.assign(x, d); }
          else lista.push({ ...d, id: novoId(), criado_nome: u.nome, criado_em: new Date().toISOString() });
          if (tabela === "cooperados") s.fin.cooperados.forEach((c) => { if (!c.perfil_id) { const p = s.perfis.find((pp) => (c.email && pp.email.toLowerCase() === c.email.toLowerCase()) && !s.fin.cooperados.some((o) => o.perfil_id === pp.id)); if (p) c.perfil_id = p.id; } });
          gravar(s); return espera(true);
        },
        async excluir(tabela, id) {
          const s = ler(); exigir(s, "tes");
          if (tabela === "despesas" && s.fin.pagamentos.some((p) => p.despesa_id === id)) falha("Esta despesa tem pagamentos lançados. Apague os pagamentos dela antes.");
          s.fin[tabela] = s.fin[tabela].filter((r) => r.id !== id);
          if (tabela === "cooperados") s.fin.pagamentos = s.fin.pagamentos.filter((p) => p.fin_cooperado_id !== id);
          gravar(s); return espera(true);
        }
      },
      proj: {
        _sis(s, pid, texto) { s.projeto_mensagens = s.projeto_mensagens || []; s.projeto_mensagens.push({ id: novoId(), projeto_id: pid, autor_id: null, autor_nome: "Registro do site", tipo: "sistema", texto, criado_em: new Date().toISOString() }); },
        _st(s) { ["contratos", "contrato_parcelas", "projeto_funcoes", "projeto_adesoes", "projeto_marcos", "projeto_apontamentos", "projeto_avaliacoes", "projeto_mensagens"].forEach((k) => { s[k] = s[k] || []; });
          if (!s.projeto_limites) s.projeto_limites = Object.entries(LIMITES_PADRAO).map(([funcao, [padrao, complexo]]) => ({ funcao, padrao, complexo })); },
        _gere(s, u, pid) { const p = s.projetos.find((x) => x.id === pid); return u.papel === "coordenacao" || !!u.conselho_adm || (p && p.coordenador_id === u.id); },
        _membro(s, pid, uid) { const p = s.projetos.find((x) => x.id === pid); return (p && p.coordenador_id === uid) || s.projeto_adesoes.some((a) => a.projeto_id === pid && a.perfil_id === uid && ["confirmada", "encerrada"].includes(a.status)); },
        _carga(s, uid, excl) {
          return s.projeto_adesoes.filter((a) => a.perfil_id === uid && a.status === "confirmada" && a.id !== excl).reduce((t, a) => {
            const f = s.projeto_funcoes.find((x) => x.id === a.funcao_id), p = s.projetos.find((x) => x.id === a.projeto_id); if (!f || !p || !["Contratado", "Em execução"].includes(p.status)) return t;
            const l = s.projeto_limites.find((x) => x.funcao === f.funcao); return t + 1 / (p.complexidade === "complexo" ? l.complexo : l.padrao);
          }, 0);
        },
        async carregar() {
          const s = ler(); exigir(s); this._st(s); gravar(s);
          return espera(JSON.parse(JSON.stringify({ contratos: s.contratos, parcelas: s.contrato_parcelas, projetos: s.projetos, funcoes: s.projeto_funcoes, adesoes: s.projeto_adesoes, marcos: s.projeto_marcos, apontamentos: s.projeto_apontamentos, limites: s.projeto_limites })));
        },
        async pessoas() { const s = ler(); exigir(s); return espera(s.perfis.filter((p) => p.status === "ativo").map((p) => ({ id: p.id, nome: p.nome, especialidade: p.especialidade })).sort((a, b) => a.nome.localeCompare(b.nome))); },
        async salvarContrato(d) {
          const s = ler(); const u = exigir(s); this._st(s); if (!(u.papel === "coordenacao" || u.conselho_adm)) falha("permission denied");
          if (d.id) Object.assign(s.contratos.find((x) => x.id === d.id), d); else { d = { ...d, id: novoId(), criado_nome: u.nome, criado_em: new Date().toISOString() }; s.contratos.push(d); }
          gravar(s); return espera(d.id);
        },
        async excluirContrato(id) { const s = ler(); const u = exigir(s); this._st(s); if (!(u.papel === "coordenacao" || u.conselho_adm)) falha("permission denied"); s.contratos = s.contratos.filter((x) => x.id !== id); s.contrato_parcelas = s.contrato_parcelas.filter((x) => x.contrato_id !== id); s.projetos.forEach((p) => { if (p.contrato_id === id) p.contrato_id = null; }); gravar(s); return espera(true); },
        async salvarParcela(d) {
          const s = ler(); const u = exigir(s); this._st(s); if (!(u.papel === "coordenacao" || u.conselho_adm || u.tesouraria)) falha("permission denied");
          if (d.id) { const x = s.contrato_parcelas.find((y) => y.id === d.id);
            if (!d.recebido_em && x.recebido_em && x.recomposto_em && "recebido_em" in d) falha("Esta parcela recompôs o Fundo de Soberania. Para desfazer, registre a saída correspondente no fundo e peça ajuda à coordenação.");
            if (d.recebido_em && !x.recebido_em && x.coberto_soberania && !x.recomposto_em) { s.fin.fundos_mov = s.fin.fundos_mov || []; s.fin.fundos_mov.push({ id: novoId(), fundo: "soberania", data: d.recebido_em, valor: Number(x.coberto_soberania), descricao: `Recomposição: parcela "${x.descricao}" recebida`, exercicio: null, registrado_nome: "Registro do site", criado_em: new Date().toISOString() }); d.recomposto_em = d.recebido_em; }
            if (d.recebido_em && !x.recebido_em) s.projetos.filter((p) => p.contrato_id === x.contrato_id && p.coordenador_id).forEach((p) => this._sis(s, p.id, `Parcela recebida pela cooperativa: ${x.descricao}.`));
            delete d.coberto_soberania; delete d.coberto_em; Object.assign(x, d, d.recebido_em ? { registrado_nome: u.nome } : {}); }
          else s.contrato_parcelas.push({ ...d, id: novoId(), criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async cobrirSoberania(id, valor) {
          const s = ler(); const u = exigir(s, "tes"); this._st(s); const x = s.contrato_parcelas.find((y) => y.id === id); const ct = s.contratos.find((c) => c.id === x.contrato_id);
          if (x.recebido_em) falha("Esta parcela já foi recebida."); if (x.coberto_soberania) falha("Esta parcela já está coberta pelo Fundo de Soberania."); if (!(valor > 0)) falha("Informe o valor.");
          s.fin.fundos_mov = s.fin.fundos_mov || []; const saldo = s.fin.fundos_mov.filter((m) => m.fundo === "soberania").reduce((t, m) => t + Number(m.valor), 0);
          if (valor > saldo + 0.005) falha(`O Fundo de Soberania tem ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} disponíveis.`);
          s.fin.fundos_mov.push({ id: novoId(), fundo: "soberania", data: UI_hoje(), valor: -valor, descricao: `Cobertura de retiradas: atraso da parcela "${x.descricao}" de ${ct.contratante}`, exercicio: null, registrado_nome: u.nome, criado_em: new Date().toISOString() });
          Object.assign(x, { coberto_soberania: valor, coberto_em: UI_hoje() }); gravar(s); return espera(true);
        },
        async excluirParcela(id) { const s = ler(); exigir(s); this._st(s); s.contrato_parcelas = s.contrato_parcelas.filter((x) => x.id !== id); gravar(s); return espera(true); },
        async salvarProjeto(d) {
          const s = ler(); const u = exigir(s); this._st(s);
          if (d.id) { const p = s.projetos.find((x) => x.id === d.id); if (!this._gere(s, u, p.id)) falha("permission denied");
            if (!(u.papel === "coordenacao" || u.conselho_adm)) ["nome", "orgao", "municipio", "modalidade", "valor", "contrato_id", "exige_contrato"].forEach((k) => delete d[k]);
            Object.assign(p, d, { atualizado_em: new Date().toISOString() }); }
          else { if (!(u.papel === "coordenacao" || u.conselho_adm)) falha("permission denied"); d = { complexidade: "padrao", bep: {}, exige_contrato: true, ...d, id: novoId(), criado_em: new Date().toISOString() }; s.projetos.push(d); }
          gravar(s); return espera(d.id);
        },
        async designarCoordenador(pid, perfil, ato) {
          const s = ler(); const u = exigir(s); this._st(s); if (!(u.papel === "coordenacao" || u.conselho_adm)) falha("Só a coordenação ou o Conselho de Administração designa o coordenador do projeto.");
          if (!String(ato || "").trim()) falha("Informe o ato da designação (ex.: ata da reunião interna de dd/mm).");
          const pe = s.perfis.find((x) => x.id === perfil); const p = s.projetos.find((x) => x.id === pid);
          let f = s.projeto_funcoes.find((x) => x.projeto_id === pid && x.funcao === "coordenacao");
          if (!f) { f = { id: novoId(), projeto_id: pid, funcao: "coordenacao", disciplina: "compatibilizacao", vagas: 1, status: "fechada", conselhos: [], horas_previstas: 0, atribuicoes: "Verificar compatibilização, interferências, padronização e conformidade com o BEP, e informar à equipe as falhas encontradas.", criado_em: new Date().toISOString() }; s.projeto_funcoes.push(f); }
          s.projeto_adesoes.filter((a) => a.funcao_id === f.id && a.status === "confirmada" && a.perfil_id !== perfil).forEach((a) => { a.status = "encerrada"; a.motivo = "Coordenação passada a " + pe.nome; });
          const lim = s.projeto_limites.find((x) => x.funcao === "coordenacao"); const c = this._carga(s, perfil) + 1 / (p.complexidade === "complexo" ? lim.complexo : lim.padrao);
          if (c > 1.0001) falha(`Com este projeto, a dedicação de ${pe.nome} passaria de 100% (${Math.round(c * 100)}%).`);
          let a = s.projeto_adesoes.find((x) => x.funcao_id === f.id && x.perfil_id === perfil);
          if (a) Object.assign(a, { status: "confirmada", decidido_nome: u.nome, decidido_em: new Date().toISOString() });
          else s.projeto_adesoes.push({ id: novoId(), funcao_id: f.id, projeto_id: pid, perfil_id: perfil, nome: pe.nome, status: "confirmada", categoria: (s.fin.cooperados.find((c) => c.perfil_id === perfil) || {}).categoria || null, conselho: (s.fin.cooperados.find((c) => c.perfil_id === perfil) || {}).conselho || null, mensagem: "Designado(a) em reunião interna: " + ato, decidido_nome: u.nome, decidido_em: new Date().toISOString(), criado_em: new Date().toISOString() });
          this._sis(s, pid, (p.coordenador_id ? "" : "Chat do projeto aberto. ") + "Coordenador do projeto: " + pe.nome + " (" + ato + ").");
          Object.assign(p, { coordenador_id: perfil, coordenador_nome: pe.nome, coordenador_ato: ato }); gravar(s); return espera(true);
        },
        async salvarFuncao(d) {
          const s = ler(); const u = exigir(s); this._st(s); if (!this._gere(s, u, d.projeto_id)) falha("permission denied");
          if (d.id) Object.assign(s.projeto_funcoes.find((x) => x.id === d.id), d); else s.projeto_funcoes.push({ status: "aberta", conselhos: [], ...d, id: novoId(), criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async excluirFuncao(id) { const s = ler(); const u = exigir(s); this._st(s); const f = s.projeto_funcoes.find((x) => x.id === id); if (!this._gere(s, u, f.projeto_id)) falha("permission denied"); s.projeto_funcoes = s.projeto_funcoes.filter((x) => x !== f); s.projeto_adesoes = s.projeto_adesoes.filter((a) => a.funcao_id !== id); gravar(s); return espera(true); },
        async aderir(funcao_id, d) {
          const s = ler(); const u = exigir(s); this._st(s); const f = s.projeto_funcoes.find((x) => x.id === funcao_id);
          if (!f || f.status !== "aberta") falha("Esta chamada não está aberta."); if (f.prazo_adesao && UI_hoje() > f.prazo_adesao) falha("O prazo para manifestar adesão terminou.");
          const ja = s.projeto_adesoes.find((a) => a.funcao_id === funcao_id && a.perfil_id === u.id);
          if (ja && ja.status !== "desistiu") falha("Você já manifestou adesão a esta função.");
          if (ja) Object.assign(ja, { status: "manifestada", mensagem: d.mensagem, categoria: d.categoria, conselho: d.conselho, motivo: null });
          else s.projeto_adesoes.push({ id: novoId(), funcao_id, projeto_id: f.projeto_id, perfil_id: u.id, nome: u.nome, mensagem: d.mensagem, categoria: d.categoria, conselho: d.conselho, status: "manifestada", criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async decidirAdesao(id, status, motivo) {
          const s = ler(); const u = exigir(s); this._st(s); const a = s.projeto_adesoes.find((x) => x.id === id); const f = s.projeto_funcoes.find((x) => x.id === a.funcao_id); const p = s.projetos.find((x) => x.id === a.projeto_id);
          if (status === "desistiu") { if (a.perfil_id !== u.id) falha("permission denied"); a.status = "desistiu"; a.decidido_em = new Date().toISOString(); gravar(s); return espera(true); }
          if (!this._gere(s, u, a.projeto_id)) falha("Só quem coordena o projeto confirma a equipe.");
          if (status === "nao_selecionada" && !String(motivo || "").trim()) falha("Diga o motivo de não selecionar (fica visível para o cooperado, por transparência).");
          if (status === "confirmada") {
            if (s.projeto_adesoes.filter((x) => x.funcao_id === f.id && x.status === "confirmada" && x.id !== id).length >= f.vagas) falha(`As ${f.vagas} vaga(s) desta função já estão preenchidas.`);
            const l = s.projeto_limites.find((x) => x.funcao === f.funcao); const lim = p.complexidade === "complexo" ? l.complexo : l.padrao; const c = this._carga(s, a.perfil_id, id) + 1 / lim;
            if (c > 1.0001) falha(`Com este projeto, a dedicação de ${a.nome} passaria de 100% (${Math.round(c * 100)}%). Nesta função, cada um participa de até ${lim} projeto(s) ${p.complexidade === "complexo" ? "complexo(s)" : "padrão"}.`);
          }
          Object.assign(a, { status, motivo: motivo || null, decidido_nome: u.nome, decidido_em: new Date().toISOString() });
          if (status === "confirmada") this._sis(s, a.projeto_id, `${a.nome} entrou na equipe: ${f.funcao}${f.disciplina && f.disciplina !== "geral" ? " (" + f.disciplina + ")" : ""}. Confirmado por ${u.nome}.`);
          if (status === "encerrada") this._sis(s, a.projeto_id, `${a.nome} saiu da equipe${motivo ? ": " + motivo : ""}.`);
          gravar(s); return espera(true);
        },
        async salvarMarco(d) {
          const s = ler(); const u = exigir(s); this._st(s); if (!this._gere(s, u, d.projeto_id)) falha("permission denied");
          if (d.conformidade) { d.conformidade_nome = u.nome; d.conformidade_em = new Date().toISOString(); delete d.conformidade; }
          if (d.id) { const mk = s.projeto_marcos.find((x) => x.id === d.id); if (d.entregue_em && !mk.entregue_em) this._sis(s, mk.projeto_id, `Entrega registrada: ${mk.titulo}, com relatório de conformidade de ${u.nome}.`); Object.assign(mk, d); }
          else { s.projeto_marcos.push({ ...d, id: novoId(), criado_em: new Date().toISOString() }); this._sis(s, d.projeto_id, `Entrega prevista: ${d.titulo}.`); }
          gravar(s); return espera(true);
        },
        async excluirMarco(id) { const s = ler(); exigir(s); this._st(s); s.projeto_marcos = s.projeto_marcos.filter((x) => x.id !== id); gravar(s); return espera(true); },
        async apontar(d) {
          const s = ler(); const u = exigir(s); this._st(s); if (!(this._membro(s, d.projeto_id, u.id) || this._gere(s, u, d.projeto_id))) falha("Só quem está na equipe do projeto registra apontamentos.");
          const dest = d.destinatario_id ? s.perfis.find((x) => x.id === d.destinatario_id) : null;
          s.projeto_apontamentos.push({ ...d, id: novoId(), autor_id: u.id, autor_nome: u.nome, destinatario_nome: dest ? dest.nome : null, status: "aberto", criado_em: new Date().toISOString() });
          this._sis(s, d.projeto_id, `${u.nome} registrou um apontamento (${d.tipo}${d.impeditivo ? ", impeditivo" : ""}) para ${dest ? dest.nome : "a equipe"}. Fundamento: ${d.fundamento}. ${d.descricao}`);
          gravar(s); return espera(true);
        },
        async atualizarApontamento(id, d) {
          const s = ler(); const u = exigir(s); this._st(s); const a = s.projeto_apontamentos.find((x) => x.id === id); const de = a.status, para = d.status;
          if (de === "aberto" && ["corrigido", "contestado"].includes(para)) { if (a.destinatario_id ? a.destinatario_id !== u.id : u.id === a.autor_id) falha("Só quem recebeu o apontamento responde."); if (!String(d.resposta || "").trim()) falha("Escreva a resposta (o que foi corrigido ou o motivo técnico da contestação)."); }
          else if ((de === "corrigido" && ["resolvido", "aberto"].includes(para)) || (de === "aberto" && para === "cancelado")) { if (u.id !== a.autor_id) falha("Só quem fez o apontamento confere a correção ou cancela."); }
          else if (de === "contestado" && ["aberto", "cancelado"].includes(para)) { if (!u.conselho_adm || u.id === a.autor_id || u.id === a.destinatario_id) falha("A contestação é decidida pelo Conselho de Administração, por um conselheiro que não seja parte."); if (!String(d.decisao || "").trim()) falha("Escreva a decisão e o fundamento."); d.decidido_nome = u.nome; d.decidido_em = new Date().toISOString(); }
          else falha("Mudança de situação não permitida.");
          if (a.destinatario_id && a.tipo !== "sugestao" && ((para === "resolvido" && de === "corrigido") || (de === "contestado" && para === "aberto"))) {
            s.igcc_registros = s.igcc_registros || []; if (!s.igcc_registros.some((r) => r.ref === a.id)) s.igcc_registros.push({ id: novoId(), perfil_id: a.destinatario_id, data: UI_hoje(), componente: "retrabalho", quantidade: a.impeditivo ? 2 : 1, descricao: "Apontamento procedente: " + a.fundamento, projeto_id: a.projeto_id, ref: a.id, registrado_nome: "Registro do site" }); }
          Object.assign(a, d, { atualizado_em: new Date().toISOString() });
          this._sis(s, a.projeto_id, `Apontamento de ${a.autor_nome}: ${para}${d.decisao ? ". Decisão do CA: " + d.decisao : d.resposta ? ". " + d.resposta : ""}.`);
          gravar(s); return espera(true);
        },
        async horasProjeto(pid) {
          const s = ler(); exigir(s); return espera(s.producao.filter((h) => h.projeto_id === pid).map((h) => ({ ...h, cooperado_nome: nomePessoa(s, h.cooperado_id) })).sort((a, b) => b.data.localeCompare(a.data)));
        },
        async aprovarHoras(ids, decisao, motivo) {
          const s = ler(); const u = exigir(s); this._st(s);
          if (decisao === "devolvida" && !String(motivo || "").trim()) falha("Diga o que precisa ser ajustado para o cooperado corrigir.");
          ids.forEach((id) => { const h = s.producao.find((x) => x.id === id); const p = s.projetos.find((x) => x.id === h.projeto_id);
            if (h.cooperado_id === u.id) falha("Ninguém aprova as próprias horas.");
            if (!((p.coordenador_id === u.id && h.cooperado_id !== p.coordenador_id) || u.conselho_adm)) falha("Só o coordenador do projeto (ou o Conselho de Administração, para as horas do próprio coordenador) aprova estas horas.");
            Object.assign(h, { aprovacao: decisao, aprovado_nome: u.nome, aprovado_em: new Date().toISOString(), aprov_motivo: motivo || null }); });
          const g = {}; ids.forEach((id) => { const h = s.producao.find((x) => x.id === id); const k = h.projeto_id + "|" + h.cooperado_id; g[k] = (g[k] || 0) + Number(h.horas); });
          Object.entries(g).forEach(([k, hs]) => { const [pid, cid] = k.split("|"); this._sis(s, pid, `${u.nome} ${decisao === "aprovada" ? "aprovou" : "devolveu"} ${hs} h de ${nomePessoa(s, cid)}${decisao === "devolvida" ? ". Ajuste pedido: " + motivo : ""}.`); });
          gravar(s); return espera(ids.length);
        },
        async avaliar(d) {
          const s = ler(); const u = exigir(s); this._st(s); const p = s.projetos.find((x) => x.id === d.projeto_id);
          if (p.status !== "Concluído") falha("A avaliação entre pares abre quando o projeto é concluído.");
          if (d.avaliado_id === u.id || !this._membro(s, p.id, u.id) || !this._membro(s, p.id, d.avaliado_id)) falha("permission denied");
          if (s.projeto_avaliacoes.some((x) => x.projeto_id === p.id && x.avaliador_id === u.id && x.avaliado_id === d.avaliado_id)) falha("Você já avaliou esta pessoa neste projeto.");
          s.projeto_avaliacoes.push({ ...d, id: novoId(), avaliador_id: u.id, criado_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async minhasAvaliacoes(pid) { const s = ler(); const u = exigir(s); this._st(s); return espera(s.projeto_avaliacoes.filter((x) => x.projeto_id === pid && x.avaliador_id === u.id)); },
        async resumoAvaliacoes(pid) {
          const s = ler(); const u = exigir(s); this._st(s); const ve = this._gere(s, u, pid) || u.conselho_fiscal; const g = {};
          s.projeto_avaliacoes.filter((x) => x.projeto_id === pid && (ve || x.avaliado_id === u.id)).forEach((x) => { const o = g[x.avaliado_id] = g[x.avaliado_id] || { avaliado_id: x.avaliado_id, nome: nomePessoa(s, x.avaliado_id), n: 0, qualidade: 0, prazos: 0, colaboracao: 0, conformidade: 0, comentarios: [] };
            o.n++; ["qualidade", "prazos", "colaboracao", "conformidade"].forEach((k) => { o[k] += x[k]; }); if (x.comentario) o.comentarios.push(x.comentario); });
          return espera(Object.values(g).map((o) => ({ ...o, qualidade: +(o.qualidade / o.n).toFixed(1), prazos: +(o.prazos / o.n).toFixed(1), colaboracao: +(o.colaboracao / o.n).toFixed(1), conformidade: +(o.conformidade / o.n).toFixed(1) })));
        },
        async salvarLimites(rows) { const s = ler(); const u = exigir(s); this._st(s); if (!(u.papel === "coordenacao" || u.conselho_adm)) falha("permission denied"); rows.forEach((r) => Object.assign(s.projeto_limites.find((x) => x.funcao === r.funcao), r)); gravar(s); return espera(true); },
        async mensagens(pid, depois) { const s = ler(); exigir(s); this._st(s); return espera(s.projeto_mensagens.filter((m) => m.projeto_id === pid && (!depois || m.criado_em > depois)).sort((a, b) => a.criado_em.localeCompare(b.criado_em)).map((m) => ({ ...m }))); },
        async ultimasMensagens() { const s = ler(); const u = exigir(s); this._st(s); return espera(s.projeto_mensagens.filter((m) => this._membro(s, m.projeto_id, u.id) || this._gere(s, u, m.projeto_id)).map((m) => ({ projeto_id: m.projeto_id, criado_em: m.criado_em, autor_id: m.autor_id }))); },
        async enviarMensagem(pid, texto, arquivo) {
          const s = ler(); const u = exigir(s); this._st(s); const p = s.projetos.find((x) => x.id === pid);
          if (!p.coordenador_id || p.status === "Arquivado") falha("O chat abre quando o coordenador do projeto é designado.");
          if (!(this._membro(s, pid, u.id) || this._gere(s, u, pid))) falha("Só quem está na equipe do projeto escreve no chat.");
          let an = {};
          if (arquivo) {
            if (!/^(application\/pdf|image\/png|image\/jpeg)$/.test(arquivo.type)) falha("Anexe PDF, PNG ou JPG.");
            if (arquivo.size > 3 * 1024 * 1024) falha("No modo demonstração o anexo pode ter até 3 MB (no site real, 20 MB).");
            const url = await new Promise((ok, er) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = er; r.readAsDataURL(arquivo); });
            an = { anexo_caminho: pid + "/" + novoId() + "_" + arquivo.name, anexo_nome: arquivo.name, anexo_tamanho: arquivo.size, anexo_dados: url };
          }
          s.projeto_mensagens.push({ id: novoId(), projeto_id: pid, autor_id: u.id, autor_nome: u.nome, tipo: "msg", texto: texto || null, ...an, criado_em: new Date().toISOString() });
          try { gravar(s); localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { falha("Sem espaço no navegador para o anexo (modo demonstração)."); }
          return espera(true);
        },
        async linkAnexo(m) { return m.anexo_dados || null; },
        async baixarAnexo(m) { return await (await fetch(m.anexo_dados)).blob(); },
        async arquivar(pid, local, resumo) {
          const s = ler(); const u = exigir(s); this._st(s); const p = s.projetos.find((x) => x.id === pid);
          if (!this._gere(s, u, pid)) falha("Só o coordenador do projeto, a coordenação ou o CA arquiva o projeto.");
          if (p.status !== "Concluído") falha("Só um projeto concluído pode ser arquivado."); if (!String(local || "").trim()) falha("Informe onde o arquivo do projeto foi guardado.");
          s.igcc_registros = s.igcc_registros || []; const ef = {};
          s.projeto_adesoes.filter((a) => a.projeto_id === pid && ["confirmada", "encerrada"].includes(a.status)).forEach((a) => { const f = s.projeto_funcoes.find((x) => x.id === a.funcao_id); if (f && f.horas_previstas > 0) ef[a.perfil_id] = (ef[a.perfil_id] || 0) + Number(f.horas_previstas); });
          Object.entries(ef).forEach(([perfil, prev]) => s.igcc_registros.push({ id: novoId(), perfil_id: perfil, data: UI_hoje(), componente: "eficiencia", quantidade: 1, previstas: prev, realizadas: s.producao.filter((h) => h.projeto_id === pid && h.cooperado_id === perfil && h.tipo === "produtiva" && (h.aprovacao || "aprovada") === "aprovada").reduce((t, h) => t + Number(h.horas), 0), descricao: "Projeto arquivado: " + p.nome, projeto_id: pid, registrado_nome: "Registro do site" }));
          ["projeto_mensagens", "projeto_apontamentos", "projeto_marcos", "projeto_adesoes", "projeto_funcoes"].forEach((k) => { s[k] = s[k].filter((x) => x.projeto_id !== pid); });
          Object.assign(p, { status: "Arquivado", bep: {}, cde_url: null, arquivado_em: new Date().toISOString(), arquivado_nome: u.nome, arquivo_local: local.trim(), resumo_arquivo: resumo }); gravar(s); return espera(true);
        }
      },
      igcc: {
        _par(s) { s.igcc_parametros = s.igcc_parametros || { peso_eficiencia: 30, peso_pares: 25, peso_retrabalho: 15, peso_assembleia: 15, peso_contrib: 15, meses: 12, meses_retrabalho: 24, resolucao: null }; s.igcc_registros = s.igcc_registros || []; return s.igcc_parametros; },
        _calc(s, pid) {
          const par = this._par(s); const hoje = new Date(); const ini = new Date(hoje); ini.setMonth(ini.getMonth() - par.meses); const iniR = new Date(hoje); iniR.setMonth(iniR.getMonth() - par.meses_retrabalho);
          const di = ini.toISOString().slice(0, 10), dr = iniR.toISOString().slice(0, 10); const regs = s.igcc_registros.filter((r) => r.perfil_id === pid);
          let prev = 0, real = 0; const ads = (s.projeto_adesoes || []).filter((a) => a.perfil_id === pid && ["confirmada", "encerrada"].includes(a.status)); const porProj = {};
          ads.forEach((a) => { const f = (s.projeto_funcoes || []).find((x) => x.id === a.funcao_id); if (f && f.horas_previstas > 0) porProj[a.projeto_id] = (porProj[a.projeto_id] || 0) + Number(f.horas_previstas); });
          Object.entries(porProj).forEach(([pj, pv]) => { const r = s.producao.filter((h) => h.projeto_id === pj && h.cooperado_id === pid && h.tipo === "produtiva" && (h.aprovacao || "aprovada") === "aprovada").reduce((t, h) => t + Number(h.horas), 0); if (r > 0) { prev += pv; real += r; } });
          regs.filter((r) => r.componente === "eficiencia" && r.data >= di && r.realizadas > 0).forEach((r) => { prev += Number(r.previstas); real += Number(r.realizadas); });
          const sEf = real > 0 ? Math.min(100, Math.round(prev / real * 1000) / 10) : null;
          const av = (s.projeto_avaliacoes || []).filter((a) => a.avaliado_id === pid && a.criado_em >= di);
          const sPar = av.length ? Math.round(av.reduce((t, a) => t + ((a.qualidade + a.prazos + a.colaboracao + a.conformidade) / 4 - 1) / 4 * 100, 0) / av.length * 10) / 10 : null;
          const part = s.producao.some((h) => h.cooperado_id === pid && h.tipo === "produtiva" && h.projeto_id && h.data >= dr);
          const nRet = regs.filter((r) => r.componente === "retrabalho" && r.data >= dr).reduce((t, r) => t + Number(r.quantidade), 0);
          const sRet = part || nRet ? Math.max(0, 100 - 10 * nRet) : null;
          const pf = s.perfis.find((x) => x.id === pid) || {};
          const asm = ((s.asm || {}).assembleias || []).filter((a) => ["encerrada", "sem_quorum"].includes(a.status) && a.tipo !== "pre" && a.data_hora >= di && (!pf.data_ingresso || a.data_hora.slice(0, 10) >= pf.data_ingresso));
          const pres = asm.filter((a) => ((s.asm || {}).presencas || []).some((x) => x.assembleia_id === a.id && x.perfil_id === pid)).length;
          const sAsm = asm.length ? Math.round(pres / asm.length * 1000) / 10 : null;
          const nCon = regs.filter((r) => r.componente === "contribuicao" && r.data >= di).reduce((t, r) => t + Number(r.quantidade), 0); const sCon = Math.min(100, nCon * 10);
          const nDisc = regs.filter((r) => r.componente === "disciplina" && r.data >= di).reduce((t, r) => t + Number(r.quantidade), 0);
          let tot = 0, pes = 0; [[sEf, par.peso_eficiencia], [sPar, par.peso_pares], [sRet, par.peso_retrabalho], [sAsm, par.peso_assembleia]].forEach(([v, w]) => { if (v != null) { tot += v * w; pes += Number(w); } });
          if (pes > 0 || nCon > 0) { tot += sCon * par.peso_contrib; pes += Number(par.peso_contrib); }
          return { indice: pes ? Math.round(tot / pes * 10) / 10 : null, eficiencia: { nota: sEf, previstas: prev, realizadas: real }, pares: { nota: sPar, avaliacoes: av.length }, retrabalho: { nota: sRet, apontamentos: nRet },
            assembleias: { nota: sAsm, realizadas: asm.length, presente: pres, reunioes_disciplina: nDisc }, contribuicoes: { nota: sCon, pontos: nCon }, periodo_meses: par.meses, periodo_retrabalho: par.meses_retrabalho };
        },
        async meu() { const s = ler(); const u = exigir(s); return espera(this._calc(s, u.id)); },
        async todos() { const s = ler(); const u = exigir(s); if (!(u.conselho_adm || u.conselho_fiscal)) falha("O índice completo é visto pelo Conselho de Administração e pelo Conselho Fiscal."); return espera(s.perfis.filter((p) => p.status === "ativo").map((p) => ({ perfil_id: p.id, nome: p.nome, dados: this._calc(s, p.id) })).sort((a, b) => a.nome.localeCompare(b.nome))); },
        async faixas(pid) {
          const s = ler(); const u = exigir(s); const p = s.projetos.find((x) => x.id === pid); if (!(u.papel === "coordenacao" || u.conselho_adm || (p && p.coordenador_id === u.id))) falha("Só quem coordena o projeto vê as faixas.");
          const vals = s.perfis.filter((x) => x.status === "ativo").map((x) => this._calc(s, x.id).indice).filter((v) => v != null); const media = vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : null;
          return espera([...new Set((s.projeto_adesoes || []).filter((a) => a.projeto_id === pid).map((a) => a.perfil_id))].map((id) => { const v = this._calc(s, id).indice; return { perfil_id: id, faixa: v == null || media == null ? "sem dados" : v >= media + 10 ? "acima da média" : v <= media - 10 ? "abaixo da média" : "na média" }; }));
        },
        async parametros() { const s = ler(); exigir(s); return espera({ ...this._par(s) }); },
        async salvarParametros(d) { const s = ler(); const u = exigir(s, "ca"); Object.assign(this._par(s), d, { atualizado_nome: u.nome, atualizado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async registros(pid) { const s = ler(); const u = exigir(s); this._par(s); return espera(s.igcc_registros.filter((r) => (pid ? r.perfil_id === pid : true) && (r.perfil_id === u.id || u.conselho_adm || u.conselho_fiscal)).sort((a, b) => b.data.localeCompare(a.data))); },
        async registrar(d) { const s = ler(); const u = exigir(s, "ca"); this._par(s); if (d.perfil_id === u.id) falha("Ninguém registra contribuição para si mesmo."); s.igcc_registros.push({ ...d, id: novoId(), registrado_nome: u.nome, criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async excluirRegistro(id) { const s = ler(); exigir(s, "ca"); this._par(s); s.igcc_registros = s.igcc_registros.filter((r) => !(r.id === id && ["contribuicao", "disciplina"].includes(r.componente))); gravar(s); return espera(true); }
      },
      manual: { async obter() { const s = ler(); exigir(s); return s.site_manual || api.manualArquivo(); } },
      notif: {
        async listar() { const s = ler(); const u = exigir(s); const c = s.fin.cooperados.find((x) => x.perfil_id === u.id);
          const todos = u.papel === "coordenacao" || u.conselho_adm || u.conselho_fiscal || u.tesouraria;
          return espera(JSON.parse(JSON.stringify((s.fin.notificacoes || []).filter((n) => todos || (c && n.fin_cooperado_id === c.id)).sort((a, b) => b.criado_em.localeCompare(a.criado_em))))); },
        async decidir(id, d) { const s = ler(); const u = exigir(s); if (!(u.papel === "coordenacao" || u.conselho_adm)) falha("Só o Conselho de Administração trata as notificações.");
          const n = (s.fin.notificacoes || []).find((x) => x.id === id); if (!n) falha("Notificação não encontrada.");
          Object.assign(n, { status: d.status, providencia: d.providencia || null, decidido_nome: u.nome, decidido_em: new Date().toISOString() }); gravar(s); return espera(true); }
      },
      caixa: {
        _st(s) { s.fin.contas = s.fin.contas || []; s.fin.contas_saldos = s.fin.contas_saldos || []; s.fin.contas_pagar = s.fin.contas_pagar || []; s.fin.mapa = s.fin.mapa || []; },
        async dados() { const s = ler(); const u = exigir(s); this._st(s); const ve = u.papel === "coordenacao" || u.tesouraria || u.conselho_fiscal;
          return espera(JSON.parse(JSON.stringify({ contas: s.fin.contas, saldos: ve ? s.fin.contas_saldos : [], pagar: ve ? s.fin.contas_pagar : [] }))); },
        async salvarConta(d) { const s = ler(); exigir(s, "tes"); this._st(s); if (d.id) Object.assign(s.fin.contas.find((x) => x.id === d.id), d); else s.fin.contas.push({ ativa: true, ordem: s.fin.contas.length, ...d, id: novoId(), criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async registrarSaldo(d) {
          const s = ler(); const u = exigir(s, "tes"); this._st(s); s.fin.contas_saldos.push({ ...d, id: novoId(), registrado_nome: u.nome, criado_em: new Date().toISOString() });
          const c = s.fin.contas.find((x) => x.id === d.conta_id);
          if (c && c.tipo === "movimento") { const tot = s.fin.contas.filter((x) => x.tipo === "movimento" && x.ativa !== false).reduce((t, x) => { const ul = s.fin.contas_saldos.filter((y) => y.conta_id === x.id && y.data <= d.data).sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em)))[0]; return t + (ul ? Number(ul.saldo) : 0); }, 0);
            s.fin.saldos = s.fin.saldos || []; s.fin.saldos.push({ id: novoId(), data: d.data, saldo: tot, observacao: "Registrado em Contas e caixa", registrado_nome: u.nome, criado_em: new Date().toISOString() }); }
          gravar(s); return espera(true);
        },
        async excluirSaldo(id) { const s = ler(); exigir(s, "tes"); this._st(s); s.fin.contas_saldos = s.fin.contas_saldos.filter((x) => x.id !== id); gravar(s); return espera(true); },
        async salvarPagar(d) { const s = ler(); const u = exigir(s, "tes"); this._st(s); if (d.id) Object.assign(s.fin.contas_pagar.find((x) => x.id === d.id), d); else s.fin.contas_pagar.push({ status: "aberta", recorrencia: "unica", ...d, id: novoId(), registrado_nome: u.nome, criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async excluirPagar(id) { const s = ler(); exigir(s, "tes"); this._st(s); s.fin.contas_pagar = s.fin.contas_pagar.filter((x) => x.id !== id); gravar(s); return espera(true); },
        async publicarMapa(dados) { const s = ler(); const u = exigir(s, "tes"); this._st(s); s.fin.mapa.unshift({ id: Date.now(), dados, gerado_nome: u.nome, gerado_em: new Date().toISOString() }); s.fin.mapa = s.fin.mapa.slice(0, 60); gravar(s); return espera(true); },
        async mapa() { const s = ler(); exigir(s); this._st(s); return espera(s.fin.mapa[0] ? JSON.parse(JSON.stringify(s.fin.mapa[0])) : null); }
      },
      sobras: {
        _st(s) { s.fin.sobras = s.fin.sobras || []; s.fin.sobras_cotas = s.fin.sobras_cotas || []; s.fin.fundos_mov = s.fin.fundos_mov || []; },
        async publico() {
          const s = ler(); const u = exigir(s); this._st(s); const ver = u.papel === "coordenacao" || u.tesouraria || u.conselho_fiscal;
          return espera(JSON.parse(JSON.stringify({ sobras: s.fin.sobras.filter((x) => ver || x.status === "lancada"), movimentos: s.fin.fundos_mov })));
        },
        async salvar(d) {
          const s = ler(); const u = exigir(s, "tes"); this._st(s); const x = s.fin.sobras.find((r) => r.exercicio === d.exercicio);
          if (x && x.status !== "rascunho") falha("Esta apuração já foi lançada. Estorne antes de alterar.");
          const novo = { ...d, status: "rascunho", salvo_nome: u.nome, salvo_em: new Date().toISOString() };
          if (x) Object.assign(x, novo); else s.fin.sobras.push(novo); gravar(s); return espera(true);
        },
        async excluir(ex) {
          const s = ler(); exigir(s, "tes"); this._st(s); const x = s.fin.sobras.find((r) => r.exercicio === ex);
          if (!x || x.status !== "rascunho") falha("Só um rascunho pode ser apagado."); s.fin.sobras = s.fin.sobras.filter((r) => r !== x); gravar(s); return espera(true);
        },
        async lancar(ex, cotas, aprovado_em, ata) {
          const s = ler(); const u = exigir(s, "tes"); this._st(s); const x = s.fin.sobras.find((r) => r.exercicio === ex);
          if (!x) falha("Apuração não encontrada."); if (x.status !== "rascunho") falha("Esta apuração já foi lançada.");
          if (!aprovado_em) falha("Informe a data da Assembleia Geral que aprovou a destinação.");
          const sm = (k) => cotas.reduce((t, c) => t + Number(c[k] || 0), 0);
          if (Math.abs(sm("rateio") - x.rateio) > 0.05 || Math.abs(sm("aposentadoria") - x.aposentadoria) > 0.05) falha("As cotas dos cooperados não fecham com o total da apuração. Recarregue a página e tente de novo.");
          cotas.forEach((c) => s.fin.sobras_cotas.push({ exercicio: ex, fin_cooperado_id: c.fin_cooperado_id, nome: c.nome, horas: c.horas, rateio: c.rateio, aposentadoria: c.aposentadoria, pago_em: null }));
          const agora = new Date().toISOString();
          [["reserva", x.reserva], ["fates", x.fates], ["soberania", x.soberania], ["fei", x.fei_publicas + x.fei_mercado], ["aposentadoria", x.aposentadoria], ["apoio", x.apoio]].forEach(([f, v]) => {
            if (v > 0) s.fin.fundos_mov.push({ id: novoId(), fundo: f, data: aprovado_em, valor: Math.round(v * 100) / 100, descricao: "Sobras do exercício " + ex, exercicio: ex, registrado_nome: u.nome, criado_em: agora });
          });
          Object.assign(x, { status: "lancada", aprovado_em, ata: ata || null, lancado_nome: u.nome, lancado_em: agora }); gravar(s); return espera(true);
        },
        async estornar(ex) {
          const s = ler(); exigir(s, "tes"); this._st(s); const x = s.fin.sobras.find((r) => r.exercicio === ex);
          if (!x || x.status !== "lancada") falha("Esta apuração não está lançada."); if (x.rateio_pago_em) falha("O rateio já foi pago. Desfaça o pagamento antes de estornar.");
          s.fin.fundos_mov = s.fin.fundos_mov.filter((m) => m.exercicio !== ex); s.fin.sobras_cotas = s.fin.sobras_cotas.filter((c) => c.exercicio !== ex);
          Object.assign(x, { status: "rascunho", lancado_nome: null, lancado_em: null }); gravar(s); return espera(true);
        },
        async pagarRateio(ex, dataPag) {
          const s = ler(); const u = exigir(s, "tes"); this._st(s); const x = s.fin.sobras.find((r) => r.exercicio === ex);
          if (!x || x.status !== "lancada") falha("Lance a apuração antes de pagar o rateio.");
          Object.assign(x, { rateio_pago_em: dataPag || null, rateio_pago_nome: dataPag ? u.nome : null });
          s.fin.sobras_cotas.filter((c) => c.exercicio === ex).forEach((c) => { c.pago_em = dataPag || null; }); gravar(s); return espera(true);
        },
        async salvarMov(d) {
          const s = ler(); const u = exigir(s, "tes"); this._st(s); if (d.fundo === "aposentadoria") falha("permission denied");
          s.fin.fundos_mov.push({ ...d, id: novoId(), exercicio: null, registrado_nome: u.nome, criado_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async excluirMov(id) {
          const s = ler(); exigir(s, "tes"); this._st(s); const m = s.fin.fundos_mov.find((x) => x.id === id);
          if (!m || m.exercicio) falha("Movimentos da apuração só saem pelo estorno."); s.fin.fundos_mov = s.fin.fundos_mov.filter((x) => x !== m); gravar(s); return espera(true);
        }
      },
      contatos: {
        async enviar(c) { const s = ler(); s.contatos.push({ tipo: "contato", ...c, nome: c.nome || "Anônimo", id: novoId(), lido: false, criado_em: new Date().toISOString() }); gravar(s); return espera(true); },
        async listar() { const s = ler(); exigir(s, true); return espera([...s.contatos].sort((a, b) => b.criado_em.localeCompare(a.criado_em))); },
        async marcarLido(id, lido) { const s = ler(); exigir(s, true); const c = s.contatos.find((x) => x.id === id); if (c) c.lido = lido; gravar(s); return espera(true); }
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* Motor Supabase                                                      */
  /* ------------------------------------------------------------------ */
  function supaApi() {
    if (!window.supabase || !window.supabase.createClient) {
      console.error("Biblioteca do Supabase não carregou.");
    }
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const ok = ({ data, error }) => { if (error) falha(error); return data; };
    const base = () => location.origin + location.pathname.replace(/[^/]*$/, "");
    const meuId = async () => {
      const { data } = await sb.auth.getUser();
      if (!data || !data.user) falha("Sua sessão expirou. Entre novamente.");
      return data.user.id;
    };

    return {
      demo: false,
      client: sb,
      async getSession() {
        const { data } = await sb.auth.getSession();
        if (!data.session) return null;
        const perfil = ok(await sb.from("perfis").select("*").eq("id", data.session.user.id).maybeSingle());
        return { user: data.session.user, perfil: perfil || { id: data.session.user.id, email: data.session.user.email, nome: "", papel: "cooperado", status: "pendente" } };
      },
      async signIn(email, senha) { ok(await sb.auth.signInWithPassword({ email: String(email).trim(), password: senha })); return true; },
      async signUp(dados) {
        const meta = {}; CAMPOS_SOLICITACAO.forEach((k) => { if (dados[k]) meta[k] = k === "telefone" ? formatarTelefone(dados[k]) : String(dados[k]).trim(); });
        const data = ok(await sb.auth.signUp({ email: String(dados.email).trim(), password: dados.senha, options: { data: meta, emailRedirectTo: base() + "entrar.html" } }));
        return { precisaConfirmar: !data.session };
      },
      async reenviarConfirmacao(email) { ok(await sb.auth.resend({ type: "signup", email: String(email).trim(), options: { emailRedirectTo: base() + "entrar.html" } })); return true; },
      async confirmarCodigo(email, codigo) { ok(await sb.auth.verifyOtp({ email: String(email).trim(), token: String(codigo).replace(/\D/g, ""), type: "signup" })); return true; },
      async signOut() { await sb.auth.signOut(); return true; },
      async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: base() + "entrar.html" })); return true; },
      async updatePassword(nova) { ok(await sb.auth.updateUser({ password: nova })); return true; },
      onRecovery(cb) { sb.auth.onAuthStateChange((evento) => { if (evento === "PASSWORD_RECOVERY") cb(); }); },

      perfil: {
        async atualizarMeu(dados) {
          const id = await meuId();
          const limpo = {}; ["nome", "telefone", "especialidade"].forEach((k) => { if (k in dados) limpo[k] = k === "telefone" ? formatarTelefone(dados[k]) : dados[k]; });
          return ok(await sb.from("perfis").update(limpo).eq("id", id).select().single());
        }
      },
      cooperados: {
        async listar() { return ok(await sb.from("perfis").select("*").order("nome")); },
        async atualizar(id, dados) {
          const limpo = {}; ["papel", "status", "analise_obs", "tesouraria", "conselho_fiscal", "conselho_adm", "cargo_ca"].forEach((k) => { if (k in dados) limpo[k] = dados[k]; });
          return ok(await sb.from("perfis").update(limpo).eq("id", id).select().single());
        }
      },
      comunicados: {
        async listar() { return ok(await sb.from("comunicados").select("*").order("publicado_em", { ascending: false })); },
        async criar({ titulo, corpo }) {
          const s = await this._autor();
          ok(await sb.from("comunicados").insert({ titulo, corpo, autor_id: s.id, autor_nome: s.nome })); return true;
        },
        async excluir(id) { ok(await sb.from("comunicados").delete().eq("id", id)); return true; },
        async _autor() {
          const id = await meuId();
          const p = ok(await sb.from("perfis").select("id,nome").eq("id", id).single());
          return p;
        }
      },
      documentos: {
        async listar() { return ok(await sb.from("documentos").select("*").order("criado_em", { ascending: false })); },
        async enviar({ titulo, categoria, arquivo }) {
          const seguro = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");
          const caminho = `${new Date().getFullYear()}/${Date.now()}_${seguro}`;
          ok(await sb.storage.from("documentos").upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined }));
          const r = await sb.from("documentos").insert({ titulo, categoria, nome_arquivo: arquivo.name, tamanho: arquivo.size, caminho });
          if (r.error) { await sb.storage.from("documentos").remove([caminho]); falha(r.error); }
          return true;
        },
        async link(doc) {
          const data = ok(await sb.storage.from("documentos").createSignedUrl(doc.caminho, 120, { download: doc.nome_arquivo }));
          return data.signedUrl;
        },
        async excluir(doc) {
          ok(await sb.from("documentos").delete().eq("id", doc.id));
          await sb.storage.from("documentos").remove([doc.caminho]);
          return true;
        }
      },
      projetos: {
        async listar() { return ok(await sb.from("projetos").select("*").order("criado_em", { ascending: false })); },
        async salvar(p) {
          const campos = ["nome", "orgao", "municipio", "modalidade", "status", "lod", "horas_orcadas", "valor", "inicio", "fim"];
          const limpo = {}; campos.forEach((k) => { if (k in p) limpo[k] = p[k] === "" ? null : p[k]; });
          if (p.id) ok(await sb.from("projetos").update(limpo).eq("id", p.id));
          else ok(await sb.from("projetos").insert(limpo));
          return true;
        },
        async excluir(id) {
          const r = await sb.from("projetos").delete().eq("id", id);
          if (r.error && /foreign key/i.test(r.error.message)) falha("Este projeto tem horas lançadas. Mude o status para Suspenso ou Concluído em vez de excluir.");
          ok(r); return true;
        }
      },
      producao: {
        async minhas() {
          const id = await meuId();
          const rows = ok(await sb.from("producao").select("*, projetos(nome)").eq("cooperado_id", id).order("data", { ascending: false }));
          return rows.map((h) => ({ ...h, projeto_nome: h.projetos ? h.projetos.nome : "—" }));
        },
        async todas() {
          const rows = ok(await sb.from("producao").select("*, projetos(nome), perfis(nome)").order("data", { ascending: false }));
          return rows.map((h) => ({ ...h, projeto_nome: h.projetos ? h.projetos.nome : "—", cooperado_nome: h.perfis ? h.perfis.nome : "—" }));
        },
        async lancar(h) {
          const id = await meuId();
          ok(await sb.from("producao").insert({ cooperado_id: id, projeto_id: h.projeto_id || null, data: h.data, horas: h.horas, tipo: h.tipo, descricao: h.descricao }));
          return true;
        },
        async excluir(id) { ok(await sb.from("producao").delete().eq("id", id)); return true; },
        async editar(id, d) { ok(await sb.from("producao").update({ projeto_id: d.projeto_id || null, data: d.data, horas: d.horas, tipo: d.tipo, descricao: d.descricao }).eq("id", id)); return true; },
        async historico() {
          const rows = ok(await sb.from("producao_historico").select("*").order("em", { ascending: false }).limit(500));
          const ids = [...new Set(rows.map((r) => r.cooperado_id).filter(Boolean))];
          const ps = ids.length ? ok(await sb.from("perfis").select("id,nome").in("id", ids)) : [];
          const nome = {}; ps.forEach((p) => { nome[p.id] = p.nome; });
          return rows.map((r) => ({ ...r, cooperado_nome: nome[r.cooperado_id] || "—" }));
        }
      },
      propostas: {
        async quadro() { const r = await sb.rpc("quadro_social"); return r.error ? 0 : Number(r.data); },
        async listar() {
          const [ps, ap, co] = await Promise.all([sb.from("propostas").select("*").order("criado_em", { ascending: false }), sb.from("proposta_apoios").select("*"), sb.from("proposta_comentarios").select("proposta_id")]);
          const lista = ok(ps), apoios = ap.error ? [] : ap.data, coms = co.error ? [] : co.data;
          return lista.map((p) => ({ ...p, apoios: apoios.filter((a) => a.proposta_id === p.id), n_comentarios: coms.filter((c) => c.proposta_id === p.id).length }));
        },
        async comentarios(id) { return ok(await sb.from("proposta_comentarios").select("*").eq("proposta_id", id).order("em")); },
        async enviar(d) { ok(await sb.from("propostas").insert({ tipo: d.tipo, titulo: d.titulo, descricao: d.descricao, justificativa: d.justificativa || null })); return true; },
        async editar(id, d) { ok(await sb.from("propostas").update(d).eq("id", id)); return true; },
        async excluir(id) { ok(await sb.from("propostas").delete().eq("id", id)); return true; },
        async apoiar(id) { const uid = await meuId(); const r = await sb.from("proposta_apoios").insert({ proposta_id: id, perfil_id: uid }); if (r.error && !/duplicate/i.test(r.error.message)) ok(r); return true; },
        async desapoiar(id) { const uid = await meuId(); ok(await sb.from("proposta_apoios").delete().eq("proposta_id", id).eq("perfil_id", uid)); return true; },
        async comentar(id, texto) { const uid = await meuId(); ok(await sb.from("proposta_comentarios").insert({ proposta_id: id, perfil_id: uid, texto: String(texto).slice(0, 2000) })); return true; }
      },
      assembleias: {
        async listar() {
          const as = ok(await sb.from("assembleias").select("*").order("data_hora", { ascending: false }));
          const ps = as.length ? ok(await sb.from("assembleia_pautas").select("*").in("assembleia_id", as.map((a) => a.id)).order("ordem")) : [];
          return as.map((a) => ({ ...a, pautas: ps.filter((p) => p.assembleia_id === a.id) }));
        },
        async obter(id) {
          const [a, ps, pr, ch, as, q, mb] = await Promise.all([
            sb.from("assembleias").select("*").eq("id", id).single(), sb.from("assembleia_pautas").select("*").eq("assembleia_id", id).order("ordem"),
            sb.from("assembleia_presencas").select("*").eq("assembleia_id", id).order("entrou_em"), sb.from("assembleia_chat").select("*").eq("assembleia_id", id).order("em"),
            sb.from("assembleia_assinaturas").select("*").eq("assembleia_id", id).order("em"), sb.rpc("assembleia_quorum", { p_id: id }),
            sb.from("perfis").select("id,nome,email").eq("status", "ativo")]);
          const pautas = ok(ps); const ids = pautas.map((p) => p.id);
          const [vt, sc] = ids.length ? await Promise.all([sb.from("assembleia_votos").select("*").in("pauta_id", ids), sb.from("assembleia_votos_secretos").select("*").in("pauta_id", ids)]) : [{ data: [] }, { data: [] }];
          const votos = (vt.data || []);
          // quem já votou (sem o conteúdo) vem dos próprios votos visíveis e do resultado; para a contagem ao vivo usamos a RPC de votantes
          const vv = ids.length ? await sb.rpc("assembleia_votantes", { p_id: id }) : { data: [] };
          return { assembleia: ok(a), pautas, votos, secretos: sc.data || [], votantes: vv.error ? [] : vv.data || [], presencas: ok(pr), chat: ok(ch), assinaturas: ok(as), quorum: q.error ? null : q.data, membros: mb.error ? [] : mb.data };
        },
        async salvar(d) {
          const x = { ...d }; delete x.id; delete x.pautas;
          if (d.id) ok(await sb.from("assembleias").update(x).eq("id", d.id)); else ok(await sb.from("assembleias").insert(x));
          return true;
        },
        async excluir(id) { ok(await sb.from("assembleias").delete().eq("id", id).eq("status", "rascunho")); return true; },
        async publicarEdital(id) { ok(await sb.from("assembleias").update({ status: "agendada" }).eq("id", id)); return true; },
        async cancelar(id, motivo) { ok(await sb.from("assembleias").update({ status: "cancelada", motivo_cancelamento: motivo }).eq("id", id)); return true; },
        async salvarPauta(p) { const x = { ...p }; delete x.id; if (p.id) ok(await sb.from("assembleia_pautas").update(x).eq("id", p.id)); else ok(await sb.from("assembleia_pautas").insert(x)); return true; },
        async excluirPauta(id) { ok(await sb.from("assembleia_pautas").delete().eq("id", id)); return true; },
        async abrir(id) { ok(await sb.rpc("assembleia_abrir", { p_id: id })); return true; },
        async entrar(id) { ok(await sb.rpc("assembleia_entrar", { p_id: id })); return true; },
        async instalar(id) { return ok(await sb.rpc("assembleia_instalar", { p_id: id })); },
        async encerrar(id, semQuorum) { ok(await sb.rpc("assembleia_encerrar", { p_id: id, p_sem_quorum: !!semQuorum })); return true; },
        async pautaAbrir(id, secreto) { ok(await sb.rpc("pauta_abrir", { p_pauta: id, p_secreto: !!secreto })); return true; },
        async votar(pautaId, voto) { ok(await sb.rpc("pauta_votar", { p_pauta: pautaId, p_voto: voto })); return true; },
        async pautaEncerrar(id) { return ok(await sb.rpc("pauta_encerrar", { p_pauta: id })); },
        async chat(id) { return ok(await sb.from("assembleia_chat").select("*").eq("assembleia_id", id).order("em")); },
        async enviarChat(id, texto) { const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single()); ok(await sb.from("assembleia_chat").insert({ assembleia_id: id, perfil_id: uid, nome: eu.nome, texto: String(texto).slice(0, 1000) })); return true; },
        async assinar(id, qualidade) { ok(await sb.rpc("ata_assinar", { p_id: id, p_qualidade: qualidade })); return true; },
        async publicarAta(id) { ok(await sb.rpc("ata_publicar", { p_id: id })); return true; }
      },
      cf: {
        async _eu() { const uid = await meuId(); return ok(await sb.from("perfis").select("nome").eq("id", uid).single()).nome; },
        async conferencias() { const r = await sb.from("fin_conferencias").select("*").order("criado_em", { ascending: false }); return r.error ? [] : r.data; },
        async conferir(d) { ok(await sb.from("fin_conferencias").insert({ ...d, conselheiro_nome: await this._eu() })); return true; },
        async guias() { const r = await sb.from("fin_guias").select("*").order("competencia", { ascending: false }); return r.error ? [] : r.data; },
        async salvarGuia(d) { ok(await sb.from("fin_guias").insert({ ...d, registrado_nome: await this._eu() })); return true; },
        async excluirGuia(id) { ok(await sb.from("fin_guias").delete().eq("id", id)); return true; },
        async prestacoes() { const r = await sb.from("fin_prestacoes").select("*").order("trimestre", { ascending: false }); return r.error ? [] : r.data; },
        async prepararPrestacao(trimestre, dados) {
          const nome = await this._eu();
          const ex = await sb.from("fin_prestacoes").select("trimestre,status").eq("trimestre", trimestre).maybeSingle();
          if (ex.data) ok(await sb.from("fin_prestacoes").update({ dados, preparado_nome: nome }).eq("trimestre", trimestre));
          else ok(await sb.from("fin_prestacoes").insert({ trimestre, dados, preparado_nome: nome }));
          return true;
        },
        async conferirPrestacao(trimestre, status, parecer) { ok(await sb.from("fin_prestacoes").update({ status, parecer, conferido_nome: await this._eu() }).eq("trimestre", trimestre)); return true; },
        async publicarPrestacao(trimestre) { ok(await sb.from("fin_prestacoes").update({ status: "publicada" }).eq("trimestre", trimestre)); return true; },
        async inconformidades() { return ok(await sb.from("cf_inconformidades").select("*").order("criado_em", { ascending: false })); },
        async salvarInconformidade(d) {
          if (d.id) { const x = { ...d }; delete x.id; ok(await sb.from("cf_inconformidades").update(x).eq("id", d.id)); }
          else ok(await sb.from("cf_inconformidades").insert({ ...d, criado_nome: await this._eu() }));
          return true;
        },
        async responderInconformidade(id, resposta) { ok(await sb.from("cf_inconformidades").update({ resposta_ca: resposta, respondido_nome: await this._eu() }).eq("id", id)); return true; },
        async relatorios() { return ok(await sb.from("cf_relatorios").select("*").order("criado_em", { ascending: false })); },
        async salvarRelatorio(d) { ok(await sb.from("cf_relatorios").insert({ ...d, criado_nome: await this._eu() })); return true; },
        async enviarDenuncia(d) {
          return ok(await sb.rpc("enviar_denuncia", { p_tipo: d.tipo, p_sigilosa: !!d.sigilosa, p_assunto: d.assunto, p_descricao: d.descricao, p_envolvidos: d.envolvidos || null }));
        },
        async minhasDenuncias() { const uid = await meuId(); return ok(await sb.from("cf_denuncias").select("*").eq("autor_id", uid).order("criado_em", { ascending: false })); },
        async acompanharDenuncia(prot) { const r = await sb.rpc("acompanhar_denuncia", { p_protocolo: prot }); return r.error ? null : r.data; },
        async denuncias() { return ok(await sb.from("cf_denuncias").select("*").order("criado_em", { ascending: false })); },
        async atualizarDenuncia(id, d) { ok(await sb.from("cf_denuncias").update({ ...d, atualizado_em: new Date().toISOString() }).eq("id", id)); return true; }
      },
      financeiro: {
        async minhas() {
          const id = await meuId();
          return ok(await sb.from("financeiro_posicoes").select("*").eq("cooperado_id", id).order("data_base", { ascending: false }).order("criado_em", { ascending: false }));
        },
        async todas() {
          const rows = ok(await sb.from("financeiro_posicoes").select("*, perfis(nome)").order("data_base", { ascending: false }));
          return rows.map((p) => ({ ...p, cooperado_nome: p.perfis ? p.perfis.nome : "—" }));
        },
        async importacoes() { return ok(await sb.from("financeiro_importacoes").select("*").order("criado_em", { ascending: false })); },
        async importar({ data_base, arquivo, linhas, pendentes, incorporar }) {
          const uid = await meuId();
          const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          let caminho = null;
          if (arquivo) {
            const seguro = arquivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
            caminho = `planilhas/${Date.now()}_${seguro}`;
            const up = await sb.storage.from("financeiro").upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            if (up.error) { console.warn("Arquivo não guardado (migração 004 pendente?)", up.error); caminho = null; }
          }
          const base = { data_base, arquivo: arquivo ? arquivo.name : null, linhas: linhas.length, criado_por: uid, criado_nome: eu.nome, ...(pendentes && pendentes.length ? { pendentes } : {}) };
          let ins = await sb.from("financeiro_importacoes").insert(caminho ? { ...base, caminho_arquivo: caminho } : base).select().single();
          if (ins.error && caminho) { await sb.storage.from("financeiro").remove([caminho]); caminho = null; ins = await sb.from("financeiro_importacoes").insert(base).select().single(); }
          const imp = ok(ins);
          let r = await sb.from("financeiro_posicoes").insert(linhas.map((l) => ({ ...l, importacao_id: imp.id, data_base })));
          if (r.error && /detalhes/i.test(r.error.message || "")) {
            r = await sb.from("financeiro_posicoes").insert(linhas.map(({ detalhes, ...l }) => ({ ...l, importacao_id: imp.id, data_base })));
          }
          if (r.error) {
            await sb.from("financeiro_importacoes").delete().eq("id", imp.id);
            if (caminho) await sb.storage.from("financeiro").remove([caminho]);
            falha(r.error);
          }
          if (incorporar && incorporar.length) {
            const u = await sb.from("financeiro_movimentos").update({ incorporado_em: imp.id }).in("codigo", incorporar).eq("status", "confirmado").is("incorporado_em", null);
            if (u.error) console.warn("Lançamentos não marcados como incorporados", u.error);
          }
          return true;
        },
        async ultimaPlanilha() {
          const q = await sb.from("financeiro_importacoes").select("*").not("caminho_arquivo", "is", null).order("criado_em", { ascending: false }).limit(1);
          if (q.error || !q.data || !q.data.length) return null;
          const i = q.data[0];
          const d = await sb.storage.from("financeiro").createSignedUrl(i.caminho_arquivo, 120, { download: i.arquivo || "planilha-financeira.xlsx" });
          if (d.error) return null;
          return { url: d.data.signedUrl, nome: i.arquivo, data_base: i.data_base, criado_em: i.criado_em };
        },
        async excluirImportacao(id) {
          const q = await sb.from("financeiro_importacoes").select("caminho_arquivo").eq("id", id).maybeSingle();
          const i = q.error ? null : q.data;
          ok(await sb.from("financeiro_importacoes").delete().eq("id", id));
          if (i && i.caminho_arquivo) await sb.storage.from("financeiro").remove([i.caminho_arquivo]);
          return true;
        }
      },
      movimentos: {
        async meus() { const id = await meuId(); return ok(await sb.from("financeiro_movimentos").select("*").eq("cooperado_id", id).order("criado_em", { ascending: false })); },
        async todos() {
          const rows = ok(await sb.from("financeiro_movimentos").select("*, perfis(nome, email)").order("criado_em", { ascending: false }).limit(500));
          return rows.map((m) => ({ ...m, cooperado_nome: m.perfis ? m.perfis.nome : "—", cooperado_email: m.perfis ? m.perfis.email : "" }));
        },
        async pagarPix({ codigo, valor, alocacao, comprovante }) {
          const uid = await meuId();
          let caminho = null;
          if (comprovante) {
            if (comprovante.size > 10 * 1024 * 1024) falha("O comprovante pode ter no máximo 10 MB.");
            const seguro = comprovante.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
            caminho = `${uid}/${codigo}_${seguro}`;
            const up = await sb.storage.from("comprovantes").upload(caminho, comprovante, { upsert: false, contentType: comprovante.type || undefined });
            if (up.error) falha(up.error);
          }
          const r = await sb.from("financeiro_movimentos").insert({ codigo, cooperado_id: uid, tipo: "pix", valor, alocacao, status: "aguardando", comprovante: caminho });
          if (r.error) { if (caminho) await sb.storage.from("comprovantes").remove([caminho]); falha(r.error); }
          return true;
        },
        async cancelarPix(id) { ok(await sb.rpc("cancelar_pix", { p_id: id })); return true; },
        async abater(valor) { ok(await sb.rpc("abater_com_aportes", { p_valor: valor })); return true; },
        async decidir(id, status, motivo) {
          const uid = await meuId();
          const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          const mv = await sb.from("financeiro_movimentos").select("cooperado_id").eq("id", id).maybeSingle();
          if (mv.data && mv.data.cooperado_id === uid) falha("Ninguém confirma o próprio Pix: outra pessoa da tesouraria confirma.");
          const r = ok(await sb.from("financeiro_movimentos").update({ status, motivo: motivo || null, decidido_em: new Date().toISOString(), decidido_nome: eu.nome }).eq("id", id).eq("status", "aguardando").select());
          if (!r.length) falha("Este Pix já foi decidido.");
          return true;
        },
        async comprovante(m) {
          const d = ok(await sb.storage.from("comprovantes").createSignedUrl(m.comprovante, 120));
          return d.signedUrl;
        }
      },
      exp: {
        async meu() {
          const uid = await meuId();
          const [par, coo] = await Promise.all([sb.from("fin_parametros").select("*").eq("id", 1).maybeSingle(), sb.from("fin_cooperados").select("*").eq("perfil_id", uid).maybeSingle()]);
          const c = coo.error ? null : coo.data;
          if (!c) return { parametros: par.data || {}, cooperado: null, habilitacoes: [], experiencias: [], comprovantes: [] };
          const [h, e, d] = await Promise.all([
            sb.from("fin_habilitacoes").select("*").eq("fin_cooperado_id", c.id).order("data_habilitacao", { nullsFirst: false }),
            sb.from("fin_experiencias").select("*").eq("fin_cooperado_id", c.id).order("inicio"),
            sb.from("fin_comprovantes").select("*").eq("fin_cooperado_id", c.id).order("criado_em")]);
          const it = await sb.rpc("horas_internas");
          return { parametros: par.data || {}, cooperado: c, habilitacoes: ok(h), experiencias: ok(e), comprovantes: ok(d), internas: it.error ? [] : (it.data || []).filter((x) => x.fin_cooperado_id === c.id) };
        },
        async todos() {
          const [h, e, d] = await Promise.all([sb.from("fin_habilitacoes").select("*").order("criado_em"), sb.from("fin_experiencias").select("*").order("inicio"), sb.from("fin_comprovantes").select("*").order("criado_em")]);
          return { habilitacoes: ok(h), experiencias: ok(e), comprovantes: ok(d) };
        },
        async painelCA() {
          const [par, coo, t, it] = await Promise.all([sb.from("fin_parametros").select("*").eq("id", 1).maybeSingle(), sb.from("fin_cooperados").select("*").order("nome"), this.todos(), this.internas()]);
          return { parametros: par.data || {}, cooperados: ok(coo), ...t, internas: it };
        },
        async internas() { const r = await sb.rpc("horas_internas"); return r.error ? [] : r.data || []; },
        async salvar(tabela, d) {
          const t = { habilitacoes: "fin_habilitacoes", experiencias: "fin_experiencias" }[tabela];
          const dados = { ...d }; delete dados.id; delete dados.criado_em;
          if (d.id) { ok(await sb.from(t).update({ ...dados, status: "pendente", analise_nome: null, analise_em: null, motivo: null }).eq("id", d.id)); return d.id; }
          const r = ok(await sb.from(t).insert({ ...dados, status: "pendente" }).select("id").single()); return r.id;
        },
        async excluir(tabela, id) {
          const t = { habilitacoes: "fin_habilitacoes", experiencias: "fin_experiencias" }[tabela];
          const comps = ok(await sb.from("fin_comprovantes").select("*").eq("ref_id", id));
          ok(await sb.from(t).delete().eq("id", id));
          if (comps.length) { await sb.storage.from("experiencia").remove(comps.map((c) => c.caminho)); await sb.from("fin_comprovantes").delete().eq("ref_id", id); }
          return true;
        },
        async anexar(fin_cooperado_id, ref_tipo, ref_id, arquivo) {
          if (arquivo.size > 20 * 1024 * 1024) falha("Cada arquivo pode ter até 20 MB.");
          const seguro = arquivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_");
          const caminho = `${fin_cooperado_id}/${ref_tipo}/${Date.now()}_${seguro}`;
          ok(await sb.storage.from("experiencia").upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined }));
          const r = await sb.from("fin_comprovantes").insert({ fin_cooperado_id, ref_tipo, ref_id, caminho, nome_arquivo: arquivo.name, tamanho: arquivo.size });
          if (r.error) { await sb.storage.from("experiencia").remove([caminho]); falha(r.error); }
          return true;
        },
        async link(c) { const d = ok(await sb.storage.from("experiencia").createSignedUrl(c.caminho, 120)); return d.signedUrl; },
        async excluirComprovante(c) { ok(await sb.from("fin_comprovantes").delete().eq("id", c.id)); await sb.storage.from("experiencia").remove([c.caminho]); return true; },
        async analisar(tabela, id, status, motivo) {
          const t = { habilitacoes: "fin_habilitacoes", experiencias: "fin_experiencias" }[tabela];
          const q = await sb.from(t).update({ status, motivo: motivo || null }).eq("id", id).select("id");
          if (q.error && /row-level security|permission/i.test(q.error.message || "")) falha("Só o Conselho de Administração valida, e ninguém valida o próprio registro.");
          const r = ok(q);
          if (!r.length) falha("Só o Conselho de Administração valida, e ninguém valida o próprio registro.");
          return true;
        }
      },
      fin: {
        async parametros() { const r = await sb.from("fin_parametros").select("*").eq("id", 1).maybeSingle(); return r.error || !r.data ? { modo: "planilha" } : r.data; },
        async extrato() {
          const ext = ok(await sb.rpc("meu_extrato"));
          if (!ext || !ext.cooperado) return ext;
          const [hm, rt, ht, vg, cx, sc] = await Promise.all([sb.rpc("horas_mensais"), sb.from("fin_retiradas").select("*").eq("fin_cooperado_id", ext.cooperado.id).order("solicitado_em"), sb.rpc("horas_produtivas_total"),
            sb.from("fin_vigencias").select("*").order("vigencia"), sb.rpc("caixa_retiradas"), sb.from("fin_sobras_cotas").select("*").eq("fin_cooperado_id", ext.cooperado.id)]);
          ext.sobras_cotas = sc.error ? [] : sc.data;
          ext.vigencias = vg.error ? [] : vg.data;
          ext.caixa = cx.error ? null : cx.data;
          ext.horas_mes = hm.error ? [] : (hm.data || []).filter((h) => h.fin_cooperado_id === ext.cooperado.id);
          ext.retiradas = rt.error ? [] : rt.data;
          if (!ht.error && ht.data != null) ext.horas_total = Number(ht.data);
          return ext;
        },
        async solicitarRetirada(d) {
          const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          const c = ok(await sb.from("fin_cooperados").select("id").eq("perfil_id", uid).single());
          const q = d.quitar_meses && d.quitar_meses.length ? { quitar_meses: d.quitar_meses, quitar_valor: d.quitar_valor } : {};
          ok(await sb.from("fin_retiradas").insert({ fin_cooperado_id: c.id, valor: d.valor, prazo: d.prazo, solicitado_nome: eu.nome, ...q })); return true;
        },
        async cancelarRetirada(id, motivo) {
          const r = await sb.from("fin_retiradas").update({ status: "cancelada", motivo: motivo || null, atualizado_em: new Date().toISOString() }).eq("id", id).eq("status", "solicitada").select("id");
          ok(r); if (!r.data || !r.data.length) falha("Esta solicitação não pode mais ser cancelada."); return true;
        },
        async pagarRetirada(id, d) {
          const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          ok(await sb.from("fin_retiradas").update({ ...d, status: "paga", pago_nome: eu.nome, atualizado_em: new Date().toISOString() }).eq("id", id)); return true;
        },
        async desfazerPagamento(id) {
          ok(await sb.from("fin_retiradas").update({ status: "solicitada", pago_em: null, pago_nome: null, inss: null, contribuicao: null, fic_vol: null, liquido: null, atualizado_em: new Date().toISOString() }).eq("id", id)); return true;
        },
        async salvarSaldo(d) {
          const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          ok(await sb.from("fin_saldos").insert({ ...d, registrado_nome: eu.nome })); return true;
        },
        async excluirSaldo(id) { ok(await sb.from("fin_saldos").delete().eq("id", id)); return true; },
        async salvarReceita(receita) {
          const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          ok(await sb.from("fin_receitas").upsert({ ...receita, atualizado_nome: eu.nome, atualizado_em: new Date().toISOString() }, { onConflict: "mes" })); return true;
        },
        async tudo() {
          const [par, coo, desp, pag, fol, rec, hab, exps, hm, rt, ht, sal, vg, cx, sc, pcl, ctr, mrc] = await Promise.all([
            sb.from("fin_parametros").select("*").eq("id", 1).single(),
            sb.from("fin_cooperados").select("*").order("nome"),
            sb.from("fin_despesas").select("*").order("data", { ascending: false, nullsFirst: false }),
            sb.from("fin_pagamentos").select("*").order("data", { ascending: false, nullsFirst: false }),
            sb.from("fin_folha").select("*").order("mes"),
            sb.from("fin_receitas").select("*").order("mes"),
            sb.from("fin_habilitacoes").select("*"),
            sb.from("fin_experiencias").select("*"),
            sb.rpc("horas_mensais"),
            sb.from("fin_retiradas").select("*").order("solicitado_em"),
            sb.rpc("horas_produtivas_total"),
            sb.from("fin_saldos").select("*").order("data", { ascending: false }),
            sb.from("fin_vigencias").select("*").order("vigencia"),
            sb.rpc("caixa_retiradas"),
            sb.from("fin_sobras_cotas").select("*"),
            sb.from("contrato_parcelas").select("*"),
            sb.from("contratos").select("*"),
            sb.from("projeto_marcos").select("id,projeto_id,titulo,previsto,entregue_em,parcela_id")
          ]);
          return { parametros: ok(par), cooperados: ok(coo), despesas: ok(desp), pagamentos: ok(pag), folha: fol.error ? [] : fol.data, receitas: rec.error ? [] : rec.data, habilitacoes: hab.error ? [] : hab.data, experiencias: exps.error ? [] : exps.data,
            horas_mes: hm.error ? [] : hm.data, retiradas: rt.error ? [] : rt.data, horas_total: ht.error ? null : Number(ht.data),
            saldos: sal.error ? [] : sal.data, vigencias: vg.error ? [] : vg.data, caixa: cx.error ? null : cx.data, sobras_cotas: sc.error ? [] : sc.data, parcelas: pcl.error ? [] : pcl.data, contratos: ctr.error ? [] : ctr.data, marcos: mrc.error ? [] : mrc.data };
        },
        async horasLancadas(mes) { return ok(await sb.rpc("horas_lancadas", { p_mes: mes })); },
        async salvarFolha(linhas, receita) {
          const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          const agora = new Date().toISOString();
          if (linhas.length) ok(await sb.from("fin_folha").upsert(linhas.map((l) => ({ ...l, atualizado_nome: eu.nome, atualizado_em: agora })), { onConflict: "fin_cooperado_id,mes" }));
          if (receita) ok(await sb.from("fin_receitas").upsert({ ...receita, atualizado_nome: eu.nome, atualizado_em: agora }, { onConflict: "mes" }));
          return true;
        },
        async salvarParametros(d, vigencia, chaves) {
          const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          ok(await sb.from("fin_parametros").update({ ...d, atualizado_em: new Date().toISOString(), atualizado_nome: eu.nome }).eq("id", 1));
          if (vigencia && chaves) {
            const ant = await sb.from("fin_vigencias").select("dados").eq("vigencia", vigencia).maybeSingle();
            const dados = { ...((ant.data && ant.data.dados) || {}) }; chaves.forEach((k) => { if (k in d) dados[k] = d[k]; });
            ok(await sb.from("fin_vigencias").upsert({ vigencia, dados, salvo_nome: eu.nome, salvo_em: new Date().toISOString() }, { onConflict: "vigencia" }));
          }
          return true;
        },
        async salvar(tabela, d) {
          const t = { cooperados: "fin_cooperados", despesas: "fin_despesas", pagamentos: "fin_pagamentos" }[tabela];
          const dados = { ...d }; delete dados.id; delete dados.criado_em;
          if (d.id) { ok(await sb.from(t).update(dados).eq("id", d.id)); return true; }
          if (tabela !== "cooperados") { const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single()); dados.criado_nome = eu.nome; }
          ok(await sb.from(t).insert(dados)); return true;
        },
        async excluir(tabela, id) {
          const t = { cooperados: "fin_cooperados", despesas: "fin_despesas", pagamentos: "fin_pagamentos" }[tabela];
          const r = await sb.from(t).delete().eq("id", id);
          if (r.error && /foreign key|violates/i.test(r.error.message || "")) falha("Esta despesa tem pagamentos lançados. Apague os pagamentos dela antes.");
          ok(r); return true;
        }
      },
      proj: {
        async carregar() {
          const q = (t, o) => sb.from(t).select("*").order(o || "criado_em");
          const [c, pa, p, f, a, m, ap, l] = await Promise.all([q("contratos"), q("contrato_parcelas", "previsto_em"), sb.from("projetos").select("*").order("criado_em", { ascending: false }), q("projeto_funcoes"), q("projeto_adesoes"), q("projeto_marcos", "previsto"), sb.from("projeto_apontamentos").select("*").order("criado_em", { ascending: false }), sb.from("projeto_limites").select("*")]);
          return { contratos: ok(c), parcelas: ok(pa), projetos: ok(p), funcoes: ok(f), adesoes: ok(a), marcos: ok(m), apontamentos: ok(ap), limites: ok(l) };
        },
        async pessoas() { return ok(await sb.rpc("pessoas_ativas")); },
        async salvarContrato(d) {
          const x = { ...d }; delete x.id; delete x.criado_nome; delete x.criado_em;
          if (d.id) { ok(await sb.from("contratos").update(x).eq("id", d.id)); return d.id; }
          return ok(await sb.from("contratos").insert(x).select("id").single()).id;
        },
        async excluirContrato(id) { ok(await sb.from("contratos").delete().eq("id", id)); return true; },
        async salvarParcela(d) {
          const x = { ...d }; delete x.id; delete x.criado_em;
          if (d.recebido_em) { const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single()); x.registrado_nome = eu.nome; }
          if (d.id) ok(await sb.from("contrato_parcelas").update(x).eq("id", d.id)); else ok(await sb.from("contrato_parcelas").insert(x)); return true;
        },
        async excluirParcela(id) { ok(await sb.from("contrato_parcelas").delete().eq("id", id)); return true; },
        async cobrirSoberania(id, valor) { ok(await sb.rpc("cobrir_com_soberania", { p_parcela: id, p_valor: valor })); return true; },
        async salvarProjeto(d) {
          const x = { ...d }; delete x.id; delete x.criado_em; delete x.coordenador_id; delete x.coordenador_nome; delete x.coordenador_ato; delete x.atualizado_em;
          Object.keys(x).forEach((k) => { if (x[k] === "") x[k] = null; });
          if (d.id) { ok(await sb.from("projetos").update(x).eq("id", d.id)); return d.id; }
          return ok(await sb.from("projetos").insert(x).select("id").single()).id;
        },
        async designarCoordenador(pid, perfil, ato) { ok(await sb.rpc("designar_coordenador", { p_projeto: pid, p_perfil: perfil, p_ato: ato })); return true; },
        async salvarFuncao(d) { const x = { ...d }; delete x.id; delete x.criado_em; if (d.id) ok(await sb.from("projeto_funcoes").update(x).eq("id", d.id)); else ok(await sb.from("projeto_funcoes").insert(x)); return true; },
        async excluirFuncao(id) { ok(await sb.from("projeto_funcoes").delete().eq("id", id)); return true; },
        async aderir(funcao_id, d) {
          const uid = await meuId();
          const ja = await sb.from("projeto_adesoes").select("id,status").eq("funcao_id", funcao_id).eq("perfil_id", uid).maybeSingle();
          if (ja.data && ja.data.status !== "desistiu") falha("Você já manifestou adesão a esta função.");
          if (ja.data) { ok(await sb.from("projeto_adesoes").delete().eq("id", ja.data.id)); }
          ok(await sb.from("projeto_adesoes").insert({ funcao_id, perfil_id: uid, projeto_id: d.projeto_id, mensagem: d.mensagem || null, categoria: d.categoria || null, conselho: d.conselho || null }));
          return true;
        },
        async decidirAdesao(id, status, motivo) { ok(await sb.from("projeto_adesoes").update({ status, motivo: motivo || null }).eq("id", id)); return true; },
        async salvarMarco(d) {
          const x = { ...d }; delete x.id; delete x.criado_em;
          if (x.conformidade) { const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single()); x.conformidade_nome = eu.nome; x.conformidade_em = new Date().toISOString(); }
          delete x.conformidade;
          if (d.id) ok(await sb.from("projeto_marcos").update(x).eq("id", d.id)); else ok(await sb.from("projeto_marcos").insert(x)); return true;
        },
        async excluirMarco(id) { ok(await sb.from("projeto_marcos").delete().eq("id", id)); return true; },
        async apontar(d) { ok(await sb.from("projeto_apontamentos").insert(d)); return true; },
        async atualizarApontamento(id, d) { ok(await sb.from("projeto_apontamentos").update(d).eq("id", id)); return true; },
        async horasProjeto(pid) {
          const rows = ok(await sb.from("producao").select("*").eq("projeto_id", pid).order("data", { ascending: false }));
          const ids = [...new Set(rows.map((r) => r.cooperado_id))]; const ps = ids.length ? await sb.rpc("pessoas_ativas") : { data: [] };
          const nm = {}; (ps.data || []).forEach((p) => { nm[p.id] = p.nome; });
          return rows.map((r) => ({ ...r, cooperado_nome: nm[r.cooperado_id] || "—" }));
        },
        async aprovarHoras(ids, decisao, motivo) { return ok(await sb.rpc("aprovar_horas", { p_ids: ids, p_decisao: decisao, p_motivo: motivo || null })); },
        async avaliar(d) { ok(await sb.from("projeto_avaliacoes").insert(d)); return true; },
        async minhasAvaliacoes(pid) { return ok(await sb.from("projeto_avaliacoes").select("*").eq("projeto_id", pid)); },
        async resumoAvaliacoes(pid) { const r = await sb.rpc("avaliacoes_projeto", { p_projeto: pid }); return r.error ? [] : r.data; },
        async salvarLimites(rows) { for (const r of rows) ok(await sb.from("projeto_limites").update({ padrao: r.padrao, complexo: r.complexo }).eq("funcao", r.funcao)); return true; },
        async mensagens(pid, depois) {
          let q = sb.from("projeto_mensagens").select("*").eq("projeto_id", pid).order("criado_em").limit(2000);
          if (depois) q = q.gt("criado_em", depois);
          return ok(await q);
        },
        async ultimasMensagens() { const r = await sb.from("projeto_mensagens").select("projeto_id,criado_em,autor_id").order("criado_em", { ascending: false }).limit(500); return r.error ? [] : r.data; },
        async enviarMensagem(pid, texto, arquivo) {
          let an = {};
          if (arquivo) {
            if (!/^(application\/pdf|image\/png|image\/jpeg)$/.test(arquivo.type)) falha("Anexe PDF, PNG ou JPG.");
            if (arquivo.size > 20 * 1024 * 1024) falha("O anexo pode ter no máximo 20 MB.");
            const seguro = arquivo.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").slice(-120);
            const caminho = `${pid}/${Date.now()}_${seguro}`;
            const up = await sb.storage.from("projetos").upload(caminho, arquivo, { upsert: false, contentType: arquivo.type });
            if (up.error) falha(up.error);
            an = { anexo_caminho: caminho, anexo_nome: arquivo.name, anexo_tamanho: arquivo.size };
          }
          const r = await sb.from("projeto_mensagens").insert({ projeto_id: pid, texto: texto || null, ...an });
          if (r.error) { if (an.anexo_caminho) await sb.storage.from("projetos").remove([an.anexo_caminho]); falha(r.error); }
          return true;
        },
        async linkAnexo(m) { const d = ok(await sb.storage.from("projetos").createSignedUrl(m.anexo_caminho, 300)); return d.signedUrl; },
        async baixarAnexo(m) { const d = await sb.storage.from("projetos").download(m.anexo_caminho); if (d.error) falha(d.error); return d.data; },
        async arquivar(pid, local, resumo) {
          // apaga os arquivos do chat e depois o restante do projeto
          for (let i = 0; i < 20; i++) {
            const l = await sb.storage.from("projetos").list(pid, { limit: 1000 });
            if (l.error) falha(l.error); if (!l.data || !l.data.length) break;
            ok(await sb.storage.from("projetos").remove(l.data.map((f) => pid + "/" + f.name)));
          }
          ok(await sb.rpc("arquivar_projeto", { p_projeto: pid, p_local: local, p_resumo: resumo })); return true;
        }
      },
      igcc: {
        async meu() { return ok(await sb.rpc("igcc_meu")); },
        async todos() { return ok(await sb.rpc("igcc_todos")); },
        async faixas(pid) { const r = await sb.rpc("igcc_faixas", { p_projeto: pid }); return r.error ? [] : r.data; },
        async parametros() { return ok(await sb.from("igcc_parametros").select("*").eq("id", 1).single()); },
        async salvarParametros(d) { const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single()); ok(await sb.from("igcc_parametros").update({ ...d, atualizado_nome: eu.nome, atualizado_em: new Date().toISOString() }).eq("id", 1)); return true; },
        async registros(pid) { let q = sb.from("igcc_registros").select("*").order("data", { ascending: false }).limit(1000); if (pid) q = q.eq("perfil_id", pid); return ok(await q); },
        async registrar(d) { ok(await sb.from("igcc_registros").insert(d)); return true; },
        async excluirRegistro(id) { ok(await sb.from("igcc_registros").delete().eq("id", id)); return true; }
      },
      manual: { async obter() { return api.manualArquivo(); } },
      notif: {
        async listar() { const r = await sb.from("fin_notificacoes").select("*").order("criado_em", { ascending: false }).limit(500); return r.error ? [] : r.data; },
        async decidir(id, d) { ok(await sb.from("fin_notificacoes").update({ status: d.status, providencia: d.providencia || null }).eq("id", id)); return true; }
      },
      caixa: {
        async dados() {
          const [c, sd, pg] = await Promise.all([sb.from("fin_contas").select("*").order("ordem"), sb.from("fin_contas_saldos").select("*").order("data", { ascending: false }).limit(1000), sb.from("fin_contas_pagar").select("*").order("vencimento")]);
          return { contas: ok(c), saldos: sd.error ? [] : sd.data, pagar: pg.error ? [] : pg.data };
        },
        async salvarConta(d) { const x = { ...d }; delete x.id; delete x.criado_em; if (d.id) ok(await sb.from("fin_contas").update(x).eq("id", d.id)); else ok(await sb.from("fin_contas").insert(x)); return true; },
        async registrarSaldo(d) { ok(await sb.from("fin_contas_saldos").insert(d)); return true; },
        async excluirSaldo(id) { ok(await sb.from("fin_contas_saldos").delete().eq("id", id)); return true; },
        async salvarPagar(d) { const x = { ...d }; delete x.id; delete x.criado_em; delete x.registrado_nome; if (d.id) ok(await sb.from("fin_contas_pagar").update(x).eq("id", d.id)); else ok(await sb.from("fin_contas_pagar").insert(x)); return true; },
        async excluirPagar(id) { ok(await sb.from("fin_contas_pagar").delete().eq("id", id)); return true; },
        async publicarMapa(dados) { ok(await sb.from("fin_mapa").insert({ dados })); return true; },
        async mapa() { const r = await sb.from("fin_mapa").select("*").order("gerado_em", { ascending: false }).limit(1); return r.error || !r.data.length ? null : r.data[0]; }
      },
      sobras: {
        async publico() {
          const [a, b] = await Promise.all([sb.from("fin_sobras").select("*").order("exercicio", { ascending: false }), sb.from("fin_fundos_mov").select("*").order("data", { ascending: false })]);
          return { sobras: a.error ? [] : a.data, movimentos: b.error ? [] : b.data };
        },
        async salvar(d) {
          const r = await sb.from("fin_sobras").upsert(d, { onConflict: "exercicio" });
          if (r.error && /row-level security|permission/i.test(r.error.message || "")) falha("Esta apuração já foi lançada. Estorne antes de alterar.");
          ok(r); return true;
        },
        async excluir(ex) { const r = ok(await sb.from("fin_sobras").delete().eq("exercicio", ex).eq("status", "rascunho").select("exercicio")); if (!r.length) falha("Só um rascunho pode ser apagado."); return true; },
        async lancar(ex, cotas, aprovado_em, ata) { ok(await sb.rpc("lancar_sobras", { p_exercicio: ex, p_cotas: cotas, p_aprovado_em: aprovado_em, p_ata: ata || null })); return true; },
        async estornar(ex) { ok(await sb.rpc("estornar_sobras", { p_exercicio: ex })); return true; },
        async pagarRateio(ex, dataPag) { ok(await sb.rpc("pagar_rateio_sobras", { p_exercicio: ex, p_data: dataPag || null })); return true; },
        async salvarMov(d) { ok(await sb.from("fin_fundos_mov").insert(d)); return true; },
        async excluirMov(id) { const r = ok(await sb.from("fin_fundos_mov").delete().eq("id", id).is("exercicio", null).select("id")); if (!r.length) falha("Movimentos da apuração só saem pelo estorno."); return true; }
      },
      contatos: {
        async enviar(c) { ok(await sb.from("contatos").insert({ tipo: c.tipo || "contato", nome: c.nome || "Anônimo", email: c.email || null, orgao: c.orgao || null, telefone: c.telefone ? formatarTelefone(c.telefone) : null, mensagem: c.mensagem })); return true; },
        async listar() { return ok(await sb.from("contatos").select("*").order("criado_em", { ascending: false })); },
        async marcarLido(id, lido) { ok(await sb.from("contatos").update({ lido }).eq("id", id)); return true; }
      }
    };
  }

  const api = DEMO ? demoApi() : supaApi();
  api.TIPOS_HORA = TIPOS_HORA;
  api.DESC_HORA = {
    produtiva: "Trabalho técnico nos projetos da cooperativa: modelagem, compatibilização, desenhos, memoriais, relatórios. Gera crédito pelo valor-hora da sua categoria e é a base da divisão das sobras.",
    formacao: "Estudo ligado diretamente a um projeto em andamento, como aprender a ferramenta ou a norma necessária para entregar o trabalho. Gera crédito como a produção técnica, até 10% das suas horas do mês.",
    administrativa: "Execução das atividades administrativas, financeiras e de suporte da cooperativa: planilhas, conciliação bancária, documentos, controle das retiradas (art. 53, §4º e §5º). Gera crédito pelo valor-hora da sua categoria, custeado pelo Custo de Operação e Gestão (os 20%). Não inclui o exercício do cargo no Conselho, que é voluntário (art. 53, §1º). Não entra na divisão das sobras.",
    ociosidade_estrategica: "Tempo parado à espera de órgão público ou terceiro (prefeitura, concessionária, cliente). Não é remunerada, mas comprova o atraso e não pesa no seu IEO. Informe o número do protocolo ou o e-mail na descrição.",
    ociosidade_operacional: "Tempo disponível sem tarefa por motivo interno, como projeto parado ou espera de outra disciplina da equipe. Não é remunerada; serve para a coordenação ver a capacidade livre e redistribuir o trabalho."
  };
  api.STATUS_PROJETO = STATUS_PROJETO;
  api.LIMITES_PADRAO = LIMITES_PADRAO;
  api.formatarTelefone = formatarTelefone;
  // manual do site: arquivo publicado junto com o site, sempre a versão mais recente
  api.manualArquivo = async () => {
    const r = await fetch("assets/manual/manual.html?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) return null;
    const html = await r.text(); const m = html.match(/atualizado:\s*(\d{4}-\d{2}-\d{2})/);
    return { html, atualizado_em: m ? m[1] : null };
  };
  api.whatsTelefone = whatsTelefone;
  api.MODALIDADES = MODALIDADES;
  api.CATEGORIAS_DOC = CATEGORIAS_DOC;
  api.AREAS = AREAS;
  api.CAMPOS_FIN = CAMPOS_FIN;
  api.STATUS_COOPERADO = STATUS_COOPERADO;
  window.API = api;
})();
