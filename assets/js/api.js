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
    const KEY = "bimcore-demo-v7";
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
        async listar() { const s = ler(); exigir(s, "ver"); return espera(s.perfis.map(semSenha).sort((a, b) => a.nome.localeCompare(b.nome))); },
        async atualizar(id, dados) {
          const s = ler(); exigir(s, true);
          const p = s.perfis.find((x) => x.id === id); if (!p) falha("Cadastro não encontrado.");
          if ("status" in dados && dados.status !== p.status) p.analisado_em = new Date().toISOString();
          ["papel", "status", "analise_obs", "tesouraria", "conselho_fiscal"].forEach((k) => { if (k in dados) p[k] = dados[k]; });
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
          const s = ler(); exigir(s, "ver");
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
          s.producao_historico = s.producao_historico || [];
          s.producao_historico.push({ id: novoId(), producao_id: h.id, cooperado_id: h.cooperado_id, acao: "excluido", antes: { ...h }, depois: null, por_id: u.id, por_nome: u.nome, em: new Date().toISOString() });
          s.producao = s.producao.filter((x) => x.id !== id); gravar(s); return espera(true);
        },
        async editar(id, d) {
          const s = ler(); const u = exigir(s);
          const h = s.producao.find((x) => x.id === id);
          if (!h || (h.cooperado_id !== u.id && u.papel !== "coordenacao")) falha("permission denied");
          const antes = { ...h }; Object.assign(h, d);
          s.producao_historico = s.producao_historico || [];
          s.producao_historico.push({ id: novoId(), producao_id: h.id, cooperado_id: h.cooperado_id, acao: "editado", antes, depois: { ...h }, por_id: u.id, por_nome: u.nome, em: new Date().toISOString() });
          gravar(s); return espera(true);
        },
        async historico() {
          const s = ler(); const u = exigir(s); const ve = u.papel === "coordenacao" || u.conselho_fiscal;
          return espera((s.producao_historico || []).filter((x) => ve || x.cooperado_id === u.id).map((x) => ({ ...x, cooperado_nome: nomePessoa(s, x.cooperado_id) })).sort((a, b) => b.em.localeCompare(a.em)));
        }
      },
      assembleias: {
        _s(s) { s.asm = s.asm || { assembleias: [], pautas: [], presencas: [], votos: [], secretos: [], chat: [], assinaturas: [] }; return s.asm; },
        _gestor(u) { return u.status === "ativo" && (u.papel === "coordenacao" || u.conselho_fiscal); },
        _quorum(s, a) {
          const A = this._s(s); const n = a.membros_na_data || s.perfis.filter((p) => p.status === "ativo").length;
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
          Object.assign(a, { status: "agendada", edital_publicado_em: new Date().toISOString(), membros_na_data: s.perfis.filter((p) => p.status === "ativo").length }); gravar(s); return espera(true);
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
          if (!m) falha("Este Pix já foi decidido."); m.status = status; m.motivo = motivo || null; m.decidido_em = new Date().toISOString(); m.decidido_nome = u.nome; lancarDemo(s, m); gravar(s); return espera(true);
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
        async todos() { const s = ler(); exigir(s, "ver"); return espera({ habilitacoes: s.fin.habilitacoes || [], experiencias: s.fin.experiencias || [], comprovantes: s.fin.comprovantes || [] }); },
        async internas() {
          const s = ler(); const u = exigir(s); const valida = u.papel === "coordenacao" || u.tesouraria || u.conselho_fiscal;
          const out = {};
          s.fin.cooperados.filter((c) => valida || c.perfil_id === u.id).forEach((c) => {
            (s.producao || []).filter((h) => c.perfil_id && h.cooperado_id === c.perfil_id && (h.tipo === "produtiva" || h.tipo === "formacao")).forEach((h) => {
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
          if (d.id) { const x = lista.find((r) => r.id === d.id); if (!x) falha("Registro não encontrado."); if (x.status === "aprovada" && meu && x.fin_cooperado_id === meu.id) falha("Registro já validado: peça à tesouraria para alterar."); Object.assign(x, d, { status: "pendente", analise_nome: null, motivo: null }); }
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
          const s = ler(); const u = exigir(s, "tes"); const x = (s.fin[tabela] || []).find((r) => r.id === id); if (!x) falha("Registro não encontrado.");
          const meu = s.fin.cooperados.find((c) => c.perfil_id === u.id); if (meu && x.fin_cooperado_id === meu.id) falha("Você não pode validar o seu próprio registro.");
          Object.assign(x, { status, motivo: motivo || null, analise_nome: u.nome, analise_em: new Date().toISOString() }); gravar(s); return espera(true);
        }
      },
      fin: {
        _horasMes(s, coopIds) {
          const out = {};
          s.fin.cooperados.filter((c) => c.perfil_id && (!coopIds || coopIds.includes(c.id))).forEach((c) => {
            s.producao.filter((h) => h.cooperado_id === c.perfil_id && ["produtiva", "formacao", "administrativa"].includes(h.tipo)).forEach((h) => {
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
          s.fin.retiradas.push({ id: novoId(), fin_cooperado_id: c.id, valor: d.valor, prazo: d.prazo, status: "solicitada", solicitado_em: new Date().toISOString(), solicitado_nome: u.nome });
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
          Object.assign(r, d, { status: "paga", pago_nome: u.nome, atualizado_em: new Date().toISOString() }); gravar(s); return espera(true);
        },
        async desfazerPagamento(id) {
          const s = ler(); exigir(s, "tes"); const r = (s.fin.retiradas || []).find((x) => x.id === id); if (!r) falha("Solicitação não encontrada.");
          Object.assign(r, { status: "solicitada", pago_em: null, pago_nome: null, inss: null, contribuicao: null, fic_vol: null, liquido: null }); gravar(s); return espera(true);
        },
        _caixa(s) {
          const sal = (s.fin.saldos || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criado_em).localeCompare(String(a.criado_em)))[0];
          const rs = s.fin.retiradas || [];
          return { data: sal ? sal.data : null, saldo: sal ? Number(sal.saldo) : null, reserva: Number(s.fin.parametros.reserva_caixa || 0), patronal_pct: s.fin.parametros.patronal_pct != null ? s.fin.parametros.patronal_pct : 0.2,
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
          return espera(JSON.parse(JSON.stringify({ parametros: { ...s.fin.parametros }, cooperado: c, pagamentos: pags, despesas, folha, horas_total, habilitacoes, experiencias, horas_mes, retiradas, vigencias: s.fin.vigencias || [], caixa: this._caixa(s) })));
        },
        async tudo() {
          const s = ler(); exigir(s, "ver"); s.fin.folha = s.fin.folha || []; s.fin.receitas = s.fin.receitas || []; s.fin.retiradas = s.fin.retiradas || [];
          const horas_total = s.producao.filter((h) => h.tipo === "produtiva" || h.tipo === "formacao").reduce((t, h) => t + Number(h.horas), 0);
          return espera(JSON.parse(JSON.stringify({ ...s.fin, saldos: s.fin.saldos || [], vigencias: s.fin.vigencias || [], horas_mes: this._horasMes(s), horas_total, caixa: this._caixa(s) })));
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
          const limpo = {}; ["papel", "status", "analise_obs", "tesouraria", "conselho_fiscal"].forEach((k) => { if (k in dados) limpo[k] = dados[k]; });
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
          const uid = await meuId(); const eu = ok(await sb.from("perfis").select("nome").eq("id", uid).single());
          const q = await sb.from(t).update({ status, motivo: motivo || null, analise_nome: eu.nome, analise_em: new Date().toISOString() }).eq("id", id).select("id");
          if (q.error && /row-level security|permission/i.test(q.error.message || "")) falha("Você não pode validar o seu próprio registro.");
          const r = ok(q);
          if (!r.length) falha("Você não pode validar o seu próprio registro.");
          return true;
        }
      },
      fin: {
        async parametros() { const r = await sb.from("fin_parametros").select("*").eq("id", 1).maybeSingle(); return r.error || !r.data ? { modo: "planilha" } : r.data; },
        async extrato() {
          const ext = ok(await sb.rpc("meu_extrato"));
          if (!ext || !ext.cooperado) return ext;
          const [hm, rt, ht, vg, cx] = await Promise.all([sb.rpc("horas_mensais"), sb.from("fin_retiradas").select("*").eq("fin_cooperado_id", ext.cooperado.id).order("solicitado_em"), sb.rpc("horas_produtivas_total"),
            sb.from("fin_vigencias").select("*").order("vigencia"), sb.rpc("caixa_retiradas")]);
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
          ok(await sb.from("fin_retiradas").insert({ fin_cooperado_id: c.id, valor: d.valor, prazo: d.prazo, solicitado_nome: eu.nome })); return true;
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
          const [par, coo, desp, pag, fol, rec, hab, exps, hm, rt, ht, sal, vg, cx] = await Promise.all([
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
            sb.rpc("caixa_retiradas")
          ]);
          return { parametros: ok(par), cooperados: ok(coo), despesas: ok(desp), pagamentos: ok(pag), folha: fol.error ? [] : fol.data, receitas: rec.error ? [] : rec.data, habilitacoes: hab.error ? [] : hab.data, experiencias: exps.error ? [] : exps.data,
            horas_mes: hm.error ? [] : hm.data, retiradas: rt.error ? [] : rt.data, horas_total: ht.error ? null : Number(ht.data),
            saldos: sal.error ? [] : sal.data, vigencias: vg.error ? [] : vg.data, caixa: cx.error ? null : cx.data };
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
      contatos: {
        async enviar(c) { ok(await sb.from("contatos").insert({ tipo: c.tipo || "contato", nome: c.nome || "Anônimo", email: c.email || null, orgao: c.orgao || null, telefone: c.telefone || null, mensagem: c.mensagem })); return true; },
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
  api.MODALIDADES = MODALIDADES;
  api.CATEGORIAS_DOC = CATEGORIAS_DOC;
  api.AREAS = AREAS;
  api.CAMPOS_FIN = CAMPOS_FIN;
  api.STATUS_COOPERADO = STATUS_COOPERADO;
  window.API = api;
})();
