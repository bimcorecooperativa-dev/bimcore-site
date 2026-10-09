-- =====================================================================
-- BIMCORE — migração 021: contratos, projetos, chamadas de adesão, equipe,
-- aprovação das horas, apontamentos de conformidade, entregas e avaliação entre pares.
--
-- Estatuto, art. 9º (deveres: XI priorizar o sucesso dos projetos; XIII ART/RRT/TRT;
-- XIV atuar só dentro da habilitação); art. 72 (sobras de parcerias públicas → FEI).
-- Regimento Interno: art. 54 (o coordenador lança as competências necessárias e a
-- Plataforma notifica quem tem perfil compatível); arts. 90 e 114 (coordenação técnica
-- sem subordinação); art. 92 (Índice Global); art. 112, §2º (divergência técnica vai ao CA).
-- Plano Quinquenal: Células de Produção (limites de projetos simultâneos por função),
-- IEO, Protocolo de Auditoria e Selo de Conformidade.
-- Lei 12.690/2012, art. 2º, §1º: a autonomia é exercida de forma coletiva e coordenada,
-- pelas regras fixadas em Assembleia — o BEP e o contrato são as regras do trabalho.
-- =====================================================================

-- ---------- Contratos ----------
create table if not exists public.contratos (
  id            uuid primary key default gen_random_uuid(),
  numero        text,
  objeto        text not null check (char_length(objeto) between 3 and 400),
  contratante   text not null,
  municipio     text,
  tipo          text not null check (tipo in ('licitacao', 'emenda', 'particular', 'cooperacao', 'dispensa', 'inexigibilidade')),
  natureza      text not null check (natureza in ('mercado', 'parceria')),
  remunerado    boolean not null default true,
  valor         numeric(14,2) not null default 0 check (valor >= 0),
  processo      text,
  assinatura    date,
  vigencia_fim  date,
  observacao    text,
  criado_nome   text,
  criado_em     timestamptz not null default now()
);
create table if not exists public.contrato_parcelas (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid not null references public.contratos(id) on delete cascade,
  descricao       text not null,
  valor           numeric(14,2) not null check (valor >= 0),
  previsto_em     date,
  recebido_em     date,
  valor_recebido  numeric(14,2),
  nota_fiscal     text,
  registrado_nome text,
  criado_em       timestamptz not null default now()
);

-- ---------- Projetos (amplia a tabela existente) ----------
alter table public.projetos
  add column if not exists contrato_id     uuid references public.contratos(id) on delete set null,
  add column if not exists coordenador_id  uuid references public.perfis(id) on delete set null,
  add column if not exists coordenador_nome text,
  add column if not exists coordenador_ato text,
  add column if not exists complexidade    text not null default 'padrao',
  add column if not exists bep             jsonb not null default '{}'::jsonb,
  add column if not exists cde_url         text,
  add column if not exists exige_contrato  boolean not null default true,
  add column if not exists atualizado_em   timestamptz;
-- projetos que já existiam continuam como antes (sem exigir contrato para gerar crédito)
update public.projetos set exige_contrato = false where contrato_id is null and criado_em < now() - interval '1 minute';
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.projetos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.projetos drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint where conrelid = 'public.projetos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%complexidade%' loop
    execute format('alter table public.projetos drop constraint %I', c);
  end loop;
end $$;
alter table public.projetos add constraint projetos_status_check check (status in ('Prospecção', 'Proposta', 'Contratado', 'Em execução', 'Concluído', 'Suspenso'));
alter table public.projetos add constraint projetos_complexidade_check check (complexidade in ('padrao', 'complexo'));

-- Limites de projetos simultâneos por função (Plano Quinquenal, Células de Produção).
-- A "carga" de cada participação é 1/limite; a soma de um cooperado não passa de 100%.
create table if not exists public.projeto_limites (
  funcao   text primary key,
  padrao   int not null check (padrao between 1 and 20),
  complexo int not null check (complexo between 1 and 20)
);
insert into public.projeto_limites (funcao, padrao, complexo) values
  ('coordenacao', 5, 3), ('supervisao', 5, 5), ('projeto', 2, 1), ('orcamento', 2, 1),
  ('modelagem', 1, 1), ('campo', 1, 1), ('outra', 2, 1)
on conflict (funcao) do nothing;

create table if not exists public.projeto_funcoes (
  id              uuid primary key default gen_random_uuid(),
  projeto_id      uuid not null references public.projetos(id) on delete cascade,
  funcao          text not null references public.projeto_limites(funcao),
  disciplina      text not null default 'geral',
  categoria_min   text,
  conselhos       text[] not null default '{}',
  vagas           int not null default 1 check (vagas between 1 and 50),
  horas_previstas numeric(10,2) not null default 0 check (horas_previstas >= 0),
  atribuicoes     text,
  prazo_adesao    date,
  status          text not null default 'aberta' check (status in ('aberta', 'fechada', 'cancelada')),
  criado_em       timestamptz not null default now()
);
create table if not exists public.projeto_adesoes (
  id            uuid primary key default gen_random_uuid(),
  funcao_id     uuid not null references public.projeto_funcoes(id) on delete cascade,
  projeto_id    uuid not null references public.projetos(id) on delete cascade,
  perfil_id     uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  nome          text,
  categoria     text,
  conselho      text,
  mensagem      text,
  status        text not null default 'manifestada' check (status in ('manifestada', 'confirmada', 'nao_selecionada', 'desistiu', 'encerrada')),
  motivo        text,
  decidido_nome text,
  decidido_em   timestamptz,
  criado_em     timestamptz not null default now(),
  unique (funcao_id, perfil_id)
);
create table if not exists public.projeto_marcos (
  id                uuid primary key default gen_random_uuid(),
  projeto_id        uuid not null references public.projetos(id) on delete cascade,
  titulo            text not null,
  previsto          date,
  entregue_em       date,
  conformidade_nome text,
  conformidade_em   timestamptz,
  observacao        text,
  criado_em         timestamptz not null default now()
);
create table if not exists public.projeto_apontamentos (
  id                uuid primary key default gen_random_uuid(),
  projeto_id        uuid not null references public.projetos(id) on delete cascade,
  autor_id          uuid not null default auth.uid(),
  autor_nome        text,
  destinatario_id   uuid references public.perfis(id) on delete set null,
  destinatario_nome text,
  disciplina        text,
  tipo              text not null check (tipo in ('bep', 'interferencia', 'simulacao', 'cliente', 'sugestao')),
  fundamento        text not null check (char_length(fundamento) between 3 and 300),
  descricao         text not null check (char_length(descricao) between 3 and 3000),
  impeditivo        boolean not null default false,
  prazo             date,
  status            text not null default 'aberto' check (status in ('aberto', 'corrigido', 'contestado', 'resolvido', 'cancelado')),
  resposta          text,
  decisao           text,
  decidido_nome     text,
  decidido_em       timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz
);
create table if not exists public.projeto_avaliacoes (
  id           uuid primary key default gen_random_uuid(),
  projeto_id   uuid not null references public.projetos(id) on delete cascade,
  avaliador_id uuid not null default auth.uid(),
  avaliado_id  uuid not null references public.perfis(id) on delete cascade,
  qualidade    int not null check (qualidade between 1 and 5),
  prazos       int not null check (prazos between 1 and 5),
  colaboracao  int not null check (colaboracao between 1 and 5),
  conformidade int not null check (conformidade between 1 and 5),
  comentario   text,
  criado_em    timestamptz not null default now(),
  unique (projeto_id, avaliador_id, avaliado_id)
);

-- ---------- Funções auxiliares ----------
create or replace function public.gere_projeto(p_projeto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_coordenacao() or public.is_ca()
      or exists (select 1 from public.projetos where id = p_projeto and coordenador_id = auth.uid());
$$;
create or replace function public.membro_projeto(p_projeto uuid, p_perfil uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projetos where id = p_projeto and coordenador_id = p_perfil)
      or exists (select 1 from public.projeto_adesoes where projeto_id = p_projeto and perfil_id = p_perfil and status in ('confirmada', 'encerrada'));
$$;
-- dedicação atual do cooperado: soma de 1/limite nas participações confirmadas em projetos ativos
create or replace function public.carga_cooperado(p_perfil uuid, p_excluir uuid default null) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(1.0 / case when pr.complexidade = 'complexo' then l.complexo else l.padrao end), 0)
    from public.projeto_adesoes a
    join public.projeto_funcoes f on f.id = a.funcao_id
    join public.projeto_limites l on l.funcao = f.funcao
    join public.projetos pr on pr.id = a.projeto_id
   where a.perfil_id = p_perfil and a.status = 'confirmada' and pr.status in ('Contratado', 'Em execução')
     and (p_excluir is null or a.id <> p_excluir);
$$;
grant execute on function public.gere_projeto(uuid) to authenticated;
grant execute on function public.membro_projeto(uuid, uuid) to authenticated;
grant execute on function public.carga_cooperado(uuid, uuid) to authenticated;

-- ---------- RLS ----------
alter table public.contratos enable row level security;
alter table public.contrato_parcelas enable row level security;
alter table public.projeto_limites enable row level security;
alter table public.projeto_funcoes enable row level security;
alter table public.projeto_adesoes enable row level security;
alter table public.projeto_marcos enable row level security;
alter table public.projeto_apontamentos enable row level security;
alter table public.projeto_avaliacoes enable row level security;

drop policy if exists contratos_ver on public.contratos;
create policy contratos_ver on public.contratos for select to authenticated using (public.is_ativo() or public.is_fiscal());
drop policy if exists contratos_gerir on public.contratos;
create policy contratos_gerir on public.contratos for all to authenticated using (public.is_coordenacao() or public.is_ca()) with check (public.is_coordenacao() or public.is_ca());

drop policy if exists parcelas_ver on public.contrato_parcelas;
create policy parcelas_ver on public.contrato_parcelas for select to authenticated using (public.is_ativo() or public.is_fiscal());
drop policy if exists parcelas_gerir on public.contrato_parcelas;
create policy parcelas_gerir on public.contrato_parcelas for all to authenticated
  using (public.is_coordenacao() or public.is_ca() or public.is_tesouraria()) with check (public.is_coordenacao() or public.is_ca() or public.is_tesouraria());

drop policy if exists limites_ver on public.projeto_limites;
create policy limites_ver on public.projeto_limites for select to authenticated using (true);
drop policy if exists limites_gerir on public.projeto_limites;
create policy limites_gerir on public.projeto_limites for update to authenticated using (public.is_coordenacao() or public.is_ca()) with check (public.is_coordenacao() or public.is_ca());

drop policy if exists projetos_gerir on public.projetos;
drop policy if exists projetos_criar on public.projetos;
create policy projetos_criar on public.projetos for insert to authenticated with check (public.is_coordenacao() or public.is_ca());
drop policy if exists projetos_editar on public.projetos;
create policy projetos_editar on public.projetos for update to authenticated using (public.gere_projeto(id)) with check (public.gere_projeto(id));
drop policy if exists projetos_apagar on public.projetos;
create policy projetos_apagar on public.projetos for delete to authenticated using (public.is_coordenacao() or public.is_ca());
drop policy if exists projetos_cf_ver on public.projetos;
create policy projetos_cf_ver on public.projetos for select to authenticated using (public.is_fiscal());

-- o coordenador do projeto cuida do BEP, das datas e da situação; contrato, nome e coordenador são da coordenação/CA
create or replace function public.proteger_projeto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is not null and not (public.is_coordenacao() or public.is_ca()) then
    new.nome := old.nome; new.orgao := old.orgao; new.municipio := old.municipio; new.modalidade := old.modalidade;
    new.valor := old.valor; new.contrato_id := old.contrato_id; new.coordenador_id := old.coordenador_id;
    new.coordenador_nome := old.coordenador_nome; new.coordenador_ato := old.coordenador_ato; new.exige_contrato := old.exige_contrato;
  end if;
  if tg_op = 'UPDATE' and new.coordenador_id is distinct from old.coordenador_id and current_setting('bimcore.designando', true) is distinct from 'sim' then
    raise exception 'Use "Designar coordenador" para trocar o coordenador do projeto.';
  end if;
  return new;
end;
$$;
drop trigger if exists proteger_projeto on public.projetos;
create trigger proteger_projeto before update on public.projetos for each row execute function public.proteger_projeto();

do $$
declare t text;
begin
  foreach t in array array['projeto_funcoes', 'projeto_marcos'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.is_ativo() or public.is_fiscal())', t);
    execute format('drop policy if exists %1$s_gerir on public.%1$s', t);
    execute format('create policy %1$s_gerir on public.%1$s for all to authenticated using (public.gere_projeto(projeto_id)) with check (public.gere_projeto(projeto_id))', t);
  end loop;
end $$;

-- Adesões: cada um manifesta a própria; quem gere o projeto confirma ou não seleciona (com motivo)
drop policy if exists adesoes_ver on public.projeto_adesoes;
create policy adesoes_ver on public.projeto_adesoes for select to authenticated using (public.is_ativo() or public.is_fiscal());
drop policy if exists adesoes_criar on public.projeto_adesoes;
create policy adesoes_criar on public.projeto_adesoes for insert to authenticated
  with check (perfil_id = auth.uid() and public.is_ativo() and status = 'manifestada');
drop policy if exists adesoes_editar on public.projeto_adesoes;
create policy adesoes_editar on public.projeto_adesoes for update to authenticated
  using (perfil_id = auth.uid() or public.gere_projeto(projeto_id)) with check (perfil_id = auth.uid() or public.gere_projeto(projeto_id));

create or replace function public.regras_adesao() returns trigger
language plpgsql security definer set search_path = public as $$
declare f public.projeto_funcoes; pr public.projetos; lim int; carga numeric; ocupadas int; gere boolean;
begin
  select * into f from public.projeto_funcoes where id = new.funcao_id;
  select * into pr from public.projetos where id = f.projeto_id;
  new.projeto_id := f.projeto_id;
  gere := public.gere_projeto(f.projeto_id) or current_setting('bimcore.designando', true) = 'sim';
  if tg_op = 'INSERT' then
    select nome into new.nome from public.perfis where id = new.perfil_id;
    if new.conselho is null then select conselho into new.conselho from public.fin_cooperados where perfil_id = new.perfil_id limit 1; end if;
    new.criado_em := now();
    if current_setting('bimcore.designando', true) is distinct from 'sim' then
      if f.status <> 'aberta' then raise exception 'Esta chamada não está aberta.'; end if;
      if f.prazo_adesao is not null and current_date > f.prazo_adesao then raise exception 'O prazo para manifestar adesão terminou em %.', to_char(f.prazo_adesao, 'DD/MM/YYYY'); end if;
      new.status := 'manifestada'; new.motivo := null; new.decidido_nome := null; new.decidido_em := null;
      return new;
    end if;
  else
    if new.perfil_id is distinct from old.perfil_id or new.funcao_id is distinct from old.funcao_id then raise exception 'Não é possível trocar a pessoa ou a função de uma adesão.'; end if;
    new.nome := old.nome; new.criado_em := old.criado_em;
    if new.status is not distinct from old.status then return new; end if;
    if new.perfil_id = auth.uid() and not gere then
      -- o próprio cooperado só pode desistir
      if new.status <> 'desistiu' then raise exception 'Quem confirma a equipe é quem coordena o projeto.'; end if;
      new.decidido_nome := old.decidido_nome; new.decidido_em := now(); return new;
    end if;
    if not gere then raise exception 'Só quem coordena o projeto confirma a equipe.'; end if;
    if new.status = 'nao_selecionada' and coalesce(trim(new.motivo), '') = '' then
      raise exception 'Diga o motivo de não selecionar (fica visível para o cooperado, por transparência).';
    end if;
  end if;
  if new.status = 'confirmada' then
    select count(*) into ocupadas from public.projeto_adesoes where funcao_id = new.funcao_id and status = 'confirmada' and id <> new.id;
    if ocupadas >= f.vagas then raise exception 'As % vaga(s) desta função já estão preenchidas.', f.vagas; end if;
    select case when pr.complexidade = 'complexo' then complexo else padrao end into lim from public.projeto_limites where funcao = f.funcao;
    carga := public.carga_cooperado(new.perfil_id, new.id) + case when pr.status in ('Contratado', 'Em execução', 'Proposta', 'Prospecção') then 1.0 / lim else 0 end;
    if carga > 1.0001 then
      raise exception 'Com este projeto, a dedicação de % passaria de 100%% (% %%). Nesta função, cada um participa de até % projeto(s) %.',
        new.nome, round(carga * 100), lim, case when pr.complexidade = 'complexo' then 'complexo(s)' else 'padrão' end;
    end if;
  end if;
  if new.status in ('confirmada', 'nao_selecionada', 'encerrada') then
    new.decidido_nome := (select nome from public.perfis where id = auth.uid()); new.decidido_em := now();
  end if;
  return new;
end;
$$;
drop trigger if exists regras_adesao on public.projeto_adesoes;
create trigger regras_adesao before insert or update on public.projeto_adesoes for each row execute function public.regras_adesao();

-- Designar o coordenador do projeto (decidido em reunião interna; fica registrado o ato)
create or replace function public.designar_coordenador(p_projeto uuid, p_perfil uuid, p_ato text)
returns void language plpgsql security definer set search_path = public as $$
declare fid uuid; nm text;
begin
  if not (public.is_coordenacao() or public.is_ca()) then raise exception 'Só a coordenação ou o Conselho de Administração designa o coordenador do projeto.'; end if;
  if coalesce(trim(p_ato), '') = '' then raise exception 'Informe o ato da designação (ex.: ata da reunião interna de dd/mm).'; end if;
  select nome into nm from public.perfis where id = p_perfil and status = 'ativo';
  if nm is null then raise exception 'Cooperado não encontrado ou inativo.'; end if;
  perform set_config('bimcore.designando', 'sim', true);
  update public.projeto_adesoes a set status = 'encerrada', motivo = 'Coordenação passada a ' || nm
    from public.projeto_funcoes f where f.id = a.funcao_id and f.projeto_id = p_projeto and f.funcao = 'coordenacao' and a.status = 'confirmada' and a.perfil_id <> p_perfil;
  select id into fid from public.projeto_funcoes where projeto_id = p_projeto and funcao = 'coordenacao' limit 1;
  if fid is null then
    insert into public.projeto_funcoes (projeto_id, funcao, disciplina, vagas, status, atribuicoes)
    values (p_projeto, 'coordenacao', 'compatibilizacao', 1, 'fechada', 'Verificar compatibilização, interferências, padronização e conformidade com o BEP, e informar à equipe as falhas encontradas.')
    returning id into fid;
  end if;
  insert into public.projeto_adesoes (funcao_id, perfil_id, status, mensagem) values (fid, p_perfil, 'confirmada', 'Designado(a) em reunião interna: ' || p_ato)
  on conflict (funcao_id, perfil_id) do update set status = 'confirmada';
  update public.projetos set coordenador_id = p_perfil, coordenador_nome = nm, coordenador_ato = p_ato where id = p_projeto;
  perform set_config('bimcore.designando', '', true);
end;
$$;
grant execute on function public.designar_coordenador(uuid, uuid, text) to authenticated;

-- Apontamentos: qualquer membro da equipe registra, sempre com o fundamento (item do BEP, cláusula, norma)
drop policy if exists apont_ver on public.projeto_apontamentos;
create policy apont_ver on public.projeto_apontamentos for select to authenticated using (public.is_ativo() or public.is_fiscal());
drop policy if exists apont_criar on public.projeto_apontamentos;
create policy apont_criar on public.projeto_apontamentos for insert to authenticated
  with check (autor_id = auth.uid() and (public.membro_projeto(projeto_id) or public.gere_projeto(projeto_id)));
drop policy if exists apont_editar on public.projeto_apontamentos;
create policy apont_editar on public.projeto_apontamentos for update to authenticated
  using (autor_id = auth.uid() or destinatario_id = auth.uid() or public.is_ca() or public.gere_projeto(projeto_id))
  with check (autor_id = auth.uid() or destinatario_id = auth.uid() or public.is_ca() or public.gere_projeto(projeto_id));

create or replace function public.regras_apontamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare eu uuid := auth.uid(); nm text;
begin
  nm := (select nome from public.perfis where id = eu);
  if tg_op = 'INSERT' then
    new.autor_id := eu; new.autor_nome := nm; new.status := 'aberto'; new.resposta := null; new.decisao := null; new.decidido_nome := null; new.decidido_em := null; new.criado_em := now();
    if new.destinatario_id is not null then new.destinatario_nome := (select nome from public.perfis where id = new.destinatario_id); end if;
    return new;
  end if;
  new.autor_id := old.autor_id; new.autor_nome := old.autor_nome; new.projeto_id := old.projeto_id; new.criado_em := old.criado_em;
  new.fundamento := old.fundamento; new.descricao := old.descricao; new.tipo := old.tipo; new.destinatario_id := old.destinatario_id; new.destinatario_nome := old.destinatario_nome;
  new.atualizado_em := now();
  if new.status is not distinct from old.status then return new; end if;
  -- quem recebeu: corrige ou contesta, com justificativa técnica
  if old.status = 'aberto' and new.status in ('corrigido', 'contestado') then
    if eu is distinct from old.destinatario_id and not (old.destinatario_id is null and public.membro_projeto(old.projeto_id) and eu <> old.autor_id) then
      raise exception 'Só quem recebeu o apontamento responde.';
    end if;
    if coalesce(trim(new.resposta), '') = '' then raise exception 'Escreva a resposta (o que foi corrigido ou o motivo técnico da contestação).'; end if;
    return new;
  end if;
  -- quem apontou: confere a correção, reabre ou cancela
  if (old.status = 'corrigido' and new.status in ('resolvido', 'aberto')) or (old.status = 'aberto' and new.status = 'cancelado') then
    if eu <> old.autor_id then raise exception 'Só quem fez o apontamento confere a correção ou cancela.'; end if;
    return new;
  end if;
  -- contestação: decide o Conselho de Administração, ouvidos os dois lados (por analogia ao RI, art. 112, §2º)
  if old.status = 'contestado' and new.status in ('aberto', 'cancelado') then
    if not public.is_ca() or eu = old.autor_id or eu = old.destinatario_id then raise exception 'A contestação é decidida pelo Conselho de Administração, por um conselheiro que não seja parte.'; end if;
    if coalesce(trim(new.decisao), '') = '' then raise exception 'Escreva a decisão e o fundamento.'; end if;
    new.decidido_nome := nm; new.decidido_em := now();
    return new;
  end if;
  raise exception 'Mudança de situação não permitida.';
end;
$$;
drop trigger if exists regras_apontamento on public.projeto_apontamentos;
create trigger regras_apontamento before insert or update on public.projeto_apontamentos for each row execute function public.regras_apontamento();

-- Avaliação entre pares ao concluir o projeto: cada um vê só o que deu; o resumo é anônimo
drop policy if exists aval_ver on public.projeto_avaliacoes;
create policy aval_ver on public.projeto_avaliacoes for select to authenticated using (avaliador_id = auth.uid());
drop policy if exists aval_criar on public.projeto_avaliacoes;
create policy aval_criar on public.projeto_avaliacoes for insert to authenticated
  with check (avaliador_id = auth.uid() and avaliado_id <> auth.uid() and public.membro_projeto(projeto_id) and public.membro_projeto(projeto_id, avaliado_id)
              and exists (select 1 from public.projetos where id = projeto_id and status = 'Concluído'));
create or replace function public.avaliacoes_projeto(p_projeto uuid)
returns table (avaliado_id uuid, nome text, n bigint, qualidade numeric, prazos numeric, colaboracao numeric, conformidade numeric, comentarios text[])
language sql stable security definer set search_path = public as $$
  select a.avaliado_id, p.nome, count(*), round(avg(a.qualidade), 1), round(avg(a.prazos), 1), round(avg(a.colaboracao), 1), round(avg(a.conformidade), 1),
         array_remove(array_agg(nullif(trim(a.comentario), '') order by random()), null)
    from public.projeto_avaliacoes a join public.perfis p on p.id = a.avaliado_id
   where a.projeto_id = p_projeto
     and (a.avaliado_id = auth.uid() or public.gere_projeto(p_projeto) or public.is_fiscal())
   group by a.avaliado_id, p.nome;
$$;
grant execute on function public.avaliacoes_projeto(uuid) to authenticated;

-- ---------- Horas: projeto obrigatório e aprovação por quem coordena ----------
alter table public.producao
  add column if not exists aprovacao     text not null default 'aprovada',
  add column if not exists aprovado_nome text,
  add column if not exists aprovado_em   timestamptz,
  add column if not exists aprov_motivo  text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'producao_aprovacao_check') then
    alter table public.producao add constraint producao_aprovacao_check check (aprovacao in ('pendente', 'aprovada', 'devolvida'));
  end if;
end $$;

create or replace function public.regras_hora_projeto() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr public.projetos; tem_equipe boolean;
begin
  if current_setting('bimcore.aprovando', true) = 'sim' then return new; end if;
  if tg_op = 'UPDATE' and (new.horas, new.data, new.tipo, new.projeto_id) is not distinct from (old.horas, old.data, old.tipo, old.projeto_id) then
    new.aprovacao := old.aprovacao; new.aprovado_nome := old.aprovado_nome; new.aprovado_em := old.aprovado_em; new.aprov_motivo := old.aprov_motivo;
    return new;
  end if;
  if new.tipo = 'produtiva' then
    if new.projeto_id is null then raise exception 'Hora de produção técnica precisa estar ligada a um projeto.'; end if;
    select * into pr from public.projetos where id = new.projeto_id;
    tem_equipe := pr.coordenador_id is not null or exists (select 1 from public.projeto_adesoes where projeto_id = pr.id and status = 'confirmada');
    if tem_equipe and not public.membro_projeto(pr.id, new.cooperado_id) then
      raise exception 'Você não está na equipe deste projeto. Manifeste adesão a uma das chamadas abertas.';
    end if;
    new.aprovacao := 'pendente'; new.aprovado_nome := null; new.aprovado_em := null; new.aprov_motivo := null;
  else
    new.aprovacao := 'aprovada'; new.aprovado_nome := null; new.aprovado_em := null; new.aprov_motivo := null;
  end if;
  return new;
end;
$$;
drop trigger if exists zz_regras_hora_projeto on public.producao;
create trigger zz_regras_hora_projeto before insert or update on public.producao for each row execute function public.regras_hora_projeto();

-- aprovar ou devolver: o coordenador do projeto; as horas do próprio coordenador (ou de projeto sem coordenador), um membro do CA
create or replace function public.aprovar_horas(p_ids uuid[], p_decisao text, p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare h public.producao; pr public.projetos; n int := 0; nm text;
begin
  if p_decisao not in ('aprovada', 'devolvida') then raise exception 'Decisão inválida.'; end if;
  if p_decisao = 'devolvida' and coalesce(trim(p_motivo), '') = '' then raise exception 'Diga o que precisa ser ajustado para o cooperado corrigir.'; end if;
  nm := (select nome from public.perfis where id = auth.uid());
  perform set_config('bimcore.aprovando', 'sim', true);
  for h in select * from public.producao where id = any(p_ids) loop
    if h.cooperado_id = auth.uid() then raise exception 'Ninguém aprova as próprias horas.'; end if;
    select * into pr from public.projetos where id = h.projeto_id;
    if not ((pr.coordenador_id = auth.uid() and h.cooperado_id <> pr.coordenador_id) or public.is_ca()) then
      raise exception 'Só o coordenador do projeto (ou o Conselho de Administração, para as horas do próprio coordenador) aprova estas horas.';
    end if;
    update public.producao set aprovacao = p_decisao, aprovado_nome = nm, aprovado_em = now(), aprov_motivo = nullif(trim(p_motivo), '') where id = h.id;
    n := n + 1;
  end loop;
  perform set_config('bimcore.aprovando', '', true);
  return n;
end;
$$;
grant execute on function public.aprovar_horas(uuid[], text, text) to authenticated;

-- quem aprova precisa ver as horas da equipe
drop policy if exists producao_proj_ver on public.producao;
create policy producao_proj_ver on public.producao for select to authenticated
  using (public.is_ca() or projeto_id in (select id from public.projetos where coordenador_id = auth.uid()));

-- o histórico de correções ignora a aprovação (só registra mudança nas horas)
create or replace function public.registrar_correcao_horas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (old.horas, old.data, old.tipo, old.projeto_id, old.descricao) is not distinct from (new.horas, new.data, new.tipo, new.projeto_id, new.descricao) then
    return new;
  end if;
  insert into public.producao_historico (producao_id, cooperado_id, acao, antes, depois, por_id, por_nome)
  values (old.id, old.cooperado_id, case when tg_op = 'DELETE' then 'excluido' else 'editado' end,
          to_jsonb(old), case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          auth.uid(), (select nome from public.perfis where id = auth.uid()));
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Hora que gera crédito: aprovada e, se for de projeto, de contrato remunerado
-- (acordo de cooperação gratuito conta como experiência, mas não como crédito)
create or replace function public.hora_gera_credito(p_tipo text, p_aprov text, p_projeto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_tipo <> 'produtiva' or (p_aprov = 'aprovada' and (p_projeto is null or exists (
    select 1 from public.projetos pr left join public.contratos ct on ct.id = pr.contrato_id
     where pr.id = p_projeto and (not pr.exige_contrato or coalesce(ct.remunerado, false)))));
$$;

create or replace function public.horas_mensais()
returns table (fin_cooperado_id uuid, mes date, produtivas numeric, formacao numeric, administrativas numeric, dias bigint)
language sql stable security definer set search_path = public as $$
  select c.id, date_trunc('month', p.data)::date,
         coalesce(sum(p.horas) filter (where p.tipo = 'produtiva'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'formacao'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'administrativa'), 0),
         count(distinct p.data) filter (where p.tipo in ('produtiva', 'formacao', 'administrativa'))
    from public.fin_cooperados c
    join public.producao p on p.cooperado_id = c.perfil_id
   where p.tipo in ('produtiva', 'formacao', 'administrativa')
     and public.hora_gera_credito(p.tipo, p.aprovacao, p.projeto_id)
     and (public.pode_validar() or public.is_fiscal() or c.perfil_id = auth.uid())
   group by 1, 2;
$$;
create or replace function public.horas_lancadas(p_mes date)
returns table (fin_cooperado_id uuid, produtivas numeric, formacao numeric, administrativas numeric, dias bigint)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(sum(p.horas) filter (where p.tipo = 'produtiva'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'formacao'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'administrativa'), 0),
         count(distinct p.data) filter (where p.tipo in ('produtiva', 'formacao', 'administrativa'))
    from public.fin_cooperados c
    join public.producao p on p.cooperado_id = c.perfil_id
   where public.is_tesouraria() and public.hora_gera_credito(p.tipo, p.aprovacao, p.projeto_id)
     and p.data >= date_trunc('month', p_mes)::date and p.data < (date_trunc('month', p_mes) + interval '1 month')::date
   group by c.id;
$$;
create or replace function public.horas_produtivas_total() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(horas), 0) from public.producao where tipo in ('produtiva', 'formacao') and public.hora_gera_credito(tipo, aprovacao, projeto_id);
$$;
-- experiência na BIMCORE: horas aprovadas (de contrato pago ou gratuito)
create or replace function public.horas_internas()
returns table (fin_cooperado_id uuid, mes date, horas numeric, origem text)
language sql stable security definer set search_path = public as $$
  with prod as (
    select c.id, date_trunc('month', p.data)::date as mes, sum(p.horas) as h
      from public.fin_cooperados c join public.producao p on p.cooperado_id = c.perfil_id
     where p.tipo in ('produtiva', 'formacao') and p.aprovacao = 'aprovada'
       and (public.pode_validar() or public.is_fiscal() or public.is_ca() or c.perfil_id = auth.uid())
     group by 1, 2
  ), fol as (
    select f.fin_cooperado_id as id, f.mes, f.horas_produtivas + f.horas_formacao as h
      from public.fin_folha f join public.fin_cooperados c on c.id = f.fin_cooperado_id
     where public.pode_validar() or public.is_fiscal() or public.is_ca() or c.perfil_id = auth.uid()
  )
  select coalesce(fol.id, prod.id), coalesce(fol.mes, prod.mes), coalesce(fol.h, prod.h),
         case when fol.id is not null then 'fechamento' else 'lancado' end
    from fol full join prod on prod.id = fol.id and prod.mes = fol.mes;
$$;

-- nomes de quem cria contrato
create or replace function public.nome_criador_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.criado_nome := (select nome from public.perfis where id = auth.uid()); new.criado_em := now(); return new; end;
$$;
drop trigger if exists nome_criador_contrato on public.contratos;
create trigger nome_criador_contrato before insert on public.contratos for each row execute function public.nome_criador_contrato();

-- nomes dos cooperados ativos (para designar coordenador e endereçar apontamentos)
create or replace function public.pessoas_ativas()
returns table (id uuid, nome text, especialidade text)
language sql stable security definer set search_path = public as $$
  select id, nome, especialidade from public.perfis where status = 'ativo' and (public.is_ativo() or public.is_fiscal()) order by nome;
$$;
grant execute on function public.pessoas_ativas() to authenticated;

select 'migracao 021 ok' as resultado;
