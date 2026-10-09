-- =====================================================================
-- BIMCORE — migração 024: Índice Global de Contribuição do Cooperado (IGCC)
-- Regimento Interno, art. 92 (eficiência operacional, qualidade técnica e
-- engajamento coletivo) e art. 137 (sem retrabalho relevante em 24 meses;
-- horas orçadas cumpridas com qualidade; 2/3 das assembleias e Reuniões de
-- Disciplina). Plano Quinquenal, cap. 5 (IEO; CF valida o IGCC por trimestre;
-- 40% das sobras ligadas ao IGCC).
-- Acesso: CA e Conselho Fiscal veem tudo; cada cooperado vê o seu, com os
-- componentes; o coordenador de projeto vê só a faixa de quem manifestou adesão.
-- Os pesos são fixados em Resolução do Conselho de Administração.
-- =====================================================================

create table if not exists public.igcc_parametros (
  id              int primary key default 1 check (id = 1),
  peso_eficiencia numeric(5,2) not null default 30,
  peso_pares      numeric(5,2) not null default 25,
  peso_retrabalho numeric(5,2) not null default 15,
  peso_assembleia numeric(5,2) not null default 15,
  peso_contrib    numeric(5,2) not null default 15,
  meses           int not null default 12 check (meses between 3 and 36),
  meses_retrabalho int not null default 24 check (meses_retrabalho between 3 and 36),
  resolucao       text,
  atualizado_nome text,
  atualizado_em   timestamptz default now()
);
insert into public.igcc_parametros (id) values (1) on conflict (id) do nothing;

-- Registros que sobrevivem ao arquivamento do projeto
create table if not exists public.igcc_registros (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  data       date not null default current_date,
  componente text not null check (componente in ('retrabalho', 'eficiencia', 'contribuicao', 'disciplina')),
  quantidade numeric(10,2) not null default 1,
  previstas  numeric(10,2),
  realizadas numeric(10,2),
  descricao  text,
  projeto_id uuid,
  registrado_nome text,
  criado_em  timestamptz not null default now()
);
create index if not exists igcc_registros_p on public.igcc_registros (perfil_id, data);
alter table public.igcc_parametros enable row level security;
alter table public.igcc_registros enable row level security;
drop policy if exists igccp_ver on public.igcc_parametros;
create policy igccp_ver on public.igcc_parametros for select to authenticated using (true);
drop policy if exists igccp_gerir on public.igcc_parametros;
create policy igccp_gerir on public.igcc_parametros for update to authenticated using (public.is_ca()) with check (public.is_ca());
drop policy if exists igccr_ver on public.igcc_registros;
create policy igccr_ver on public.igcc_registros for select to authenticated using (perfil_id = auth.uid() or public.is_ca() or public.is_fiscal());
-- o CA registra contribuições (biblioteca BIM, leitura, indicação de cooperado ou contrato) e presença em Reunião de Disciplina
drop policy if exists igccr_criar on public.igcc_registros;
create policy igccr_criar on public.igcc_registros for insert to authenticated
  with check (public.is_ca() and componente in ('contribuicao', 'disciplina') and perfil_id <> auth.uid());
drop policy if exists igccr_apagar on public.igcc_registros;
create policy igccr_apagar on public.igcc_registros for delete to authenticated using (public.is_ca() and componente in ('contribuicao', 'disciplina'));
create or replace function public.nome_igcc() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.registrado_nome is null then new.registrado_nome := coalesce((select nome from public.perfis where id = auth.uid()), 'Registro do site'); end if; return new; end; $$;
drop trigger if exists nome_igcc on public.igcc_registros;
create trigger nome_igcc before insert on public.igcc_registros for each row execute function public.nome_igcc();

-- Retrabalho: apontamento de não conformidade, interferência ou exigência do cliente que procedeu
create or replace function public.igcc_apontamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.destinatario_id is null or new.tipo = 'sugestao' then return new; end if;
  if (new.status = 'resolvido' and old.status = 'corrigido') or (old.status = 'contestado' and new.status = 'aberto') then
    if not exists (select 1 from public.igcc_registros where componente = 'retrabalho' and descricao like '%' || new.id::text) then
      insert into public.igcc_registros (perfil_id, componente, quantidade, descricao, projeto_id, registrado_nome)
      values (new.destinatario_id, 'retrabalho', case when new.impeditivo then 2 else 1 end, 'Apontamento procedente: ' || left(new.fundamento, 120) || ' · ' || new.id::text, new.projeto_id, 'Registro do site');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists igcc_apontamento on public.projeto_apontamentos;
create trigger igcc_apontamento after update on public.projeto_apontamentos for each row execute function public.igcc_apontamento();

-- Eficiência por pessoa: horas previstas na função ÷ horas aprovadas (no projeto ativo, ao vivo; no arquivado, pelo registro)
create or replace function public.igcc_eficiencia_viva(p_perfil uuid)
returns table (previstas numeric, realizadas numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(prev), 0), coalesce(sum(real), 0) from (
    select a.projeto_id, sum(f.horas_previstas) as prev,
           (select coalesce(sum(h.horas), 0) from public.producao h where h.projeto_id = a.projeto_id and h.cooperado_id = p_perfil and h.tipo = 'produtiva' and h.aprovacao = 'aprovada') as real
      from public.projeto_adesoes a join public.projeto_funcoes f on f.id = a.funcao_id
     where a.perfil_id = p_perfil and a.status in ('confirmada', 'encerrada') and f.horas_previstas > 0
     group by a.projeto_id) x where x.real > 0;
$$;

-- arquivar: guarda a eficiência de cada membro e mantém a avaliação entre pares
create or replace function public.arquivar_projeto(p_projeto uuid, p_local text, p_resumo jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.projetos;
begin
  select * into pr from public.projetos where id = p_projeto for update;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if not public.gere_projeto(p_projeto) then raise exception 'Só o coordenador do projeto, a coordenação ou o CA arquiva o projeto.'; end if;
  if pr.status <> 'Concluído' then raise exception 'Só um projeto concluído pode ser arquivado.'; end if;
  if coalesce(trim(p_local), '') = '' then raise exception 'Informe onde o arquivo do projeto foi guardado.'; end if;
  insert into public.igcc_registros (perfil_id, componente, quantidade, previstas, realizadas, descricao, projeto_id, registrado_nome)
  select a.perfil_id, 'eficiencia', 1, sum(f.horas_previstas),
         (select coalesce(sum(h.horas), 0) from public.producao h where h.projeto_id = p_projeto and h.cooperado_id = a.perfil_id and h.tipo = 'produtiva' and h.aprovacao = 'aprovada'),
         'Projeto arquivado: ' || pr.nome, p_projeto, 'Registro do site'
    from public.projeto_adesoes a join public.projeto_funcoes f on f.id = a.funcao_id
   where a.projeto_id = p_projeto and a.status in ('confirmada', 'encerrada') and f.horas_previstas > 0
   group by a.perfil_id;
  delete from public.projeto_mensagens where projeto_id = p_projeto;
  delete from public.projeto_apontamentos where projeto_id = p_projeto;
  delete from public.projeto_marcos where projeto_id = p_projeto;
  delete from public.projeto_adesoes where projeto_id = p_projeto;
  delete from public.projeto_funcoes where projeto_id = p_projeto;
  perform set_config('bimcore.designando', 'sim', true);
  update public.projetos set status = 'Arquivado', bep = '{}'::jsonb, cde_url = null, arquivado_em = now(),
    arquivado_nome = (select nome from public.perfis where id = auth.uid()), arquivo_local = trim(p_local), resumo_arquivo = p_resumo
   where id = p_projeto;
  perform set_config('bimcore.designando', '', true);
end;
$$;

-- ---------- Cálculo ----------
create or replace function public.igcc_calcular(p_perfil uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare par public.igcc_parametros; ini date; ini_r date; ingresso date;
  ef_prev numeric := 0; ef_real numeric := 0; v1 numeric; v2 numeric; s_ef numeric; s_par numeric; s_ret numeric; s_asm numeric; s_con numeric;
  n_par int; n_ret numeric; n_asm int; n_pres int; n_con numeric; n_disc numeric; participou boolean; total numeric := 0; pesos numeric := 0;
begin
  select * into par from public.igcc_parametros where id = 1;
  ini := current_date - make_interval(months => par.meses); ini_r := current_date - make_interval(months => par.meses_retrabalho);
  select data_ingresso into ingresso from public.perfis where id = p_perfil;
  -- eficiência (previstas ÷ realizadas, teto 100%)
  select previstas, realizadas into v1, v2 from public.igcc_eficiencia_viva(p_perfil); ef_prev := ef_prev + v1; ef_real := ef_real + v2;
  select coalesce(sum(previstas), 0), coalesce(sum(realizadas), 0) into v1, v2 from public.igcc_registros where perfil_id = p_perfil and componente = 'eficiencia' and data >= ini and realizadas > 0;
  ef_prev := ef_prev + v1; ef_real := ef_real + v2;
  s_ef := case when ef_real > 0 then least(100, round(ef_prev / ef_real * 100, 1)) end;
  -- avaliação entre pares (1 a 5 → 0 a 100)
  select count(*), round(avg(((qualidade + prazos + colaboracao + conformidade) / 4.0 - 1) / 4 * 100), 1) into n_par, s_par
    from public.projeto_avaliacoes where avaliado_id = p_perfil and criado_em >= ini;
  if n_par = 0 then s_par := null; end if;
  -- retrabalho (24 meses): cada apontamento procedente tira 10 pontos; impeditivo vale 2
  participou := exists (select 1 from public.producao where cooperado_id = p_perfil and tipo = 'produtiva' and projeto_id is not null and data >= ini_r);
  select coalesce(sum(quantidade), 0) into n_ret from public.igcc_registros where perfil_id = p_perfil and componente = 'retrabalho' and data >= ini_r;
  s_ret := case when participou or n_ret > 0 then greatest(0, 100 - 10 * n_ret) end;
  -- assembleias realizadas desde o ingresso + Reuniões de Disciplina registradas pelo CA
  select count(*), count(pr.perfil_id) into n_asm, n_pres from public.assembleias a
    left join public.assembleia_presencas pr on pr.assembleia_id = a.id and pr.perfil_id = p_perfil
   where a.status in ('encerrada', 'sem_quorum') and a.tipo <> 'pre' and a.data_hora >= ini and (ingresso is null or a.data_hora::date >= ingresso);
  select coalesce(sum(quantidade), 0) into n_disc from public.igcc_registros where perfil_id = p_perfil and componente = 'disciplina' and data >= ini;
  s_asm := case when n_asm > 0 then round(n_pres::numeric / n_asm * 100, 1) end;
  -- contribuições (cada ponto registrado pelo CA vale 10, até 100)
  select coalesce(sum(quantidade), 0) into n_con from public.igcc_registros where perfil_id = p_perfil and componente = 'contribuicao' and data >= ini;
  s_con := least(100, n_con * 10);
  if s_ef is not null then total := total + s_ef * par.peso_eficiencia; pesos := pesos + par.peso_eficiencia; end if;
  if s_par is not null then total := total + s_par * par.peso_pares; pesos := pesos + par.peso_pares; end if;
  if s_ret is not null then total := total + s_ret * par.peso_retrabalho; pesos := pesos + par.peso_retrabalho; end if;
  if s_asm is not null then total := total + s_asm * par.peso_assembleia; pesos := pesos + par.peso_assembleia; end if;
  -- sem nenhum dado ainda (novo cooperado), o índice fica em branco em vez de zero
  if pesos > 0 or n_con > 0 then total := total + s_con * par.peso_contrib; pesos := pesos + par.peso_contrib; end if;
  return jsonb_build_object(
    'indice', case when pesos > 0 then round(total / pesos, 1) end,
    'eficiencia', jsonb_build_object('nota', s_ef, 'previstas', ef_prev, 'realizadas', ef_real),
    'pares', jsonb_build_object('nota', s_par, 'avaliacoes', n_par),
    'retrabalho', jsonb_build_object('nota', s_ret, 'apontamentos', n_ret),
    'assembleias', jsonb_build_object('nota', s_asm, 'realizadas', n_asm, 'presente', n_pres, 'reunioes_disciplina', n_disc),
    'contribuicoes', jsonb_build_object('nota', s_con, 'pontos', n_con),
    'periodo_meses', par.meses, 'periodo_retrabalho', par.meses_retrabalho);
end;
$$;

create or replace function public.igcc_meu() returns jsonb
language sql stable security definer set search_path = public as $$ select public.igcc_calcular(auth.uid()); $$;

create or replace function public.igcc_todos()
returns table (perfil_id uuid, nome text, dados jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_ca() or public.is_fiscal()) then raise exception 'O índice completo é visto pelo Conselho de Administração e pelo Conselho Fiscal.'; end if;
  return query select p.id, p.nome, public.igcc_calcular(p.id) from public.perfis p where p.status = 'ativo' order by p.nome;
end;
$$;

-- faixa (acima, na média, abaixo) de quem manifestou adesão às chamadas do projeto
create or replace function public.igcc_faixas(p_projeto uuid)
returns table (perfil_id uuid, faixa text)
language plpgsql stable security definer set search_path = public as $$
declare media numeric;
begin
  if not public.gere_projeto(p_projeto) then raise exception 'Só quem coordena o projeto vê as faixas.'; end if;
  select avg((public.igcc_calcular(id)->>'indice')::numeric) into media from public.perfis where status = 'ativo';
  return query
    select a.perfil_id, case when ind is null or media is null then 'sem dados' when ind >= media + 10 then 'acima da média' when ind <= media - 10 then 'abaixo da média' else 'na média' end
      from (select distinct x.perfil_id, (public.igcc_calcular(x.perfil_id)->>'indice')::numeric as ind from public.projeto_adesoes x where x.projeto_id = p_projeto) a;
end;
$$;

grant execute on function public.igcc_meu() to authenticated;
grant execute on function public.igcc_todos() to authenticated;
grant execute on function public.igcc_faixas(uuid) to authenticated;
revoke execute on function public.igcc_calcular(uuid) from public, anon, authenticated;
revoke execute on function public.igcc_eficiencia_viva(uuid) from public, anon, authenticated;

select 'migracao 024 ok' as resultado;
