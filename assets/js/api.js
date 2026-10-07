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
    ociosidade_estrategica: "Ociosidade estratégica (pendência externa)",
    ociosidade_operacional: "Ociosidade operacional"
  };
  const STATUS_PROJETO = ["Prospecção", "Proposta", "Em execução", "Concluído", "Suspenso"];
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
    const KEY = "bimcore-demo-v4";
    const SKEY = "bimcore-demo-sessao";
    const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    const hoje = new Date();
    const dia = (delta) => { const d = new Date(hoje); d.setDate(d.getDate() + delta); return d.toISOString().slice(0, 10); };

    function semente() {
      const p1 = novoId(), p2 = novoId(), p3 = novoId();
      return {
        perfis: [
          { id: "u-coord", nome: "Coordenação (exemplo)", email: "coordenacao@bimcore.demo", senha: "demo1234", telefone: "", especialidade: "Orçamento e planejamento", papel: "coordenacao", status: "ativo", data_ingresso: dia(-200), criado_em: dia(-200) },
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
      else if (coord === true && !(u.papel === "coordenacao" && u.status === "ativo")) falha("permission denied");
      return u;
    };
    const semSenha = (p) => { const c = { ...p }; delete c.senha; return c; };
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
      async signUp(dados) {
        const s = ler();
        const email = String(dados.email).trim(), senha = dados.senha;
        if (String(senha).length < 8) falha("Password should be at least 8");
        if (s.perfis.some((p) => p.email.toLowerCase() === email.toLowerCase())) falha("already registered");
        const p = { id: novoId(), email, senha, papel: "cooperado", status: "pendente", data_ingresso: null, criado_em: new Date().toISOString() };
        CAMPOS_SOLICITACAO.forEach((k) => { p[k] = dados[k] || ""; });
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
          ["nome", "telefone", "especialidade"].forEach((k) => { if (k in dados) u[k] = dados[k]; });
          gravar(s); return espera(semSenha(u));
        }
      },
      cooperados: {
        async listar() { const s = ler(); exigir(s, "tes"); return espera(s.perfis.map(semSenha).sort((a, b) => a.nome.localeCompare(b.nome))); },
        async atualizar(id, dados) {
          const s = ler(); exigir(s, true);
          const p = s.perfis.find((x) => x.id === id); if (!p) falha("Cadastro não encontrado.");
          if ("status" in dados && dados.status !== p.status) p.analisado_em = new Date().toISOString();
          ["papel", "status", "analise_obs", "tesouraria"].forEach((k) => { if (k in dados) p[k] = dados[k]; });
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
        async minhas() {
          const s = ler(); const u = exigir(s);
          return espera(s.producao.filter((h) => h.cooperado_id === u.id).map((h) => ({ ...h, projeto_nome: nomeProjeto(s, h.projeto_id) })).sort((a, b) => b.data.localeCompare(a.data)));
        },
        async todas() {
          const s = ler(); exigir(s, true);
          return espera(s.producao.map((h) => ({ ...h, projeto_nome: nomeProjeto(s, h.projeto_id), cooperado_nome: nomePessoa(s, h.cooperado_id) })).sort((a, b) => b.data.localeCompare(a.data)));
        },
        async lancar(h) {
          const s = ler(); const u = exigir(s);
          if (u.status !== "ativo") falha("permission denied");
          s.producao.push({ ...h, id: novoId(), cooperado_id: u.id }); gravar(s); return espera(true);
        },
        async excluir(id) {
          const s = ler(); const u = exigir(s);
          const h = s.producao.find((x) => x.id === id);
          if (!h || (h.cooperado_id !== u.id && u.papel !== "coordenacao")) falha("permission denied");
          s.producao = s.producao.filter((x) => x.id !== id); gravar(s); return espera(true);
        }
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
        async todos() { const s = ler(); exigir(s, "tes"); return espera((s.fin_movimentos || []).map((m) => ({ ...m, cooperado_nome: nomePessoa(s, m.cooperado_id) })).sort((a, b) => b.criado_em.localeCompare(a.criado_em))); },
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
          const pos = (s.fin_posicoes || []).filter((p) => p.cooperado_id === u.id).sort((a, b) => b.data_base.localeCompare(a.data_base) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")))[0];
          if (!pos) falha("Ainda não há posição financeira sua no site.");
          const c = window.Fin.componentes(pos, (s.fin_movimentos || []).filter((m) => m.cooperado_id === u.id));
          valor = window.Fin.centavos(valor);
          if (!(valor > 0)) falha("Informe um valor maior que zero.");
          if (valor > c.maxAbater + 0.005) falha("O valor máximo para abater agora é " + c.maxAbater.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + ".");
          s.fin_movimentos = s.fin_movimentos || [];
          s.fin_movimentos.push({ id: novoId(), codigo: window.Fin.novoCodigo(), cooperado_id: u.id, tipo: "compensacao", valor, alocacao: [{ destino: "integralizacao", valor }], status: "confirmado", decidido_em: new Date().toISOString(), decidido_nome: "Feito pelo cooperado no site", criado_em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async decidir(id, status, motivo) {
          const s = ler(); const u = exigir(s, "tes"); const m = (s.fin_movimentos || []).find((x) => x.id === id && x.status === "aguardando");
          if (!m) falha("Este Pix já foi decidido."); m.status = status; m.motivo = motivo || null; m.decidido_em = new Date().toISOString(); m.decidido_nome = u.nome; gravar(s); return espera(true);
        },
        async comprovante() { falha("No modo demonstração os comprovantes não são guardados."); }
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
        const meta = {}; CAMPOS_SOLICITACAO.forEach((k) => { if (dados[k]) meta[k] = String(dados[k]).trim(); });
        const data = ok(await sb.auth.signUp({ email: String(dados.email).trim(), password: dados.senha, options: { data: meta, emailRedirectTo: base() + "entrar.html" } }));
        return { precisaConfirmar: !data.session };
      },
      async signOut() { await sb.auth.signOut(); return true; },
      async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: base() + "entrar.html" })); return true; },
      async updatePassword(nova) { ok(await sb.auth.updateUser({ password: nova })); return true; },
      onRecovery(cb) { sb.auth.onAuthStateChange((evento) => { if (evento === "PASSWORD_RECOVERY") cb(); }); },

      perfil: {
        async atualizarMeu(dados) {
          const id = await meuId();
          const limpo = {}; ["nome", "telefone", "especialidade"].forEach((k) => { if (k in dados) limpo[k] = dados[k]; });
          return ok(await sb.from("perfis").update(limpo).eq("id", id).select().single());
        }
      },
      cooperados: {
        async listar() { return ok(await sb.from("perfis").select("*").order("nome")); },
        async atualizar(id, dados) {
          const limpo = {}; ["papel", "status", "analise_obs", "tesouraria"].forEach((k) => { if (k in dados) limpo[k] = dados[k]; });
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
        async excluir(id) { ok(await sb.from("producao").delete().eq("id", id)); return true; }
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
          const r = ok(await sb.from("financeiro_movimentos").update({ status, motivo: motivo || null, decidido_em: new Date().toISOString(), decidido_nome: eu.nome }).eq("id", id).eq("status", "aguardando").select());
          if (!r.length) falha("Este Pix já foi decidido.");
          return true;
        },
        async comprovante(m) {
          const d = ok(await sb.storage.from("comprovantes").createSignedUrl(m.comprovante, 120));
          return d.signedUrl;
        }
      },
      contatos: {
        async enviar(c) { ok(await sb.from("contatos").insert({ tipo: c.tipo || "contato", nome: c.nome || "Anônimo", email: c.email || null, orgao: c.orgao || null, telefone: c.telefone || null, mensagem: c.mensagem })); return true; },
        async listar() { return ok(await sb.from("contatos").select("*").order("criado_em", { ascending: false })); },
        async marcarLido(id, lido) { ok(await sb.from("contatos").update({ lido }).eq("id", id)); return true; }
      }
    };
  }

  const api = DEMO ? demoApi() : supaApi();
  api.TIPOS_HORA = TIPOS_HORA;
  api.STATUS_PROJETO = STATUS_PROJETO;
  api.MODALIDADES = MODALIDADES;
  api.CATEGORIAS_DOC = CATEGORIAS_DOC;
  api.AREAS = AREAS;
  api.CAMPOS_FIN = CAMPOS_FIN;
  api.STATUS_COOPERADO = STATUS_COOPERADO;
  window.API = api;
})();
