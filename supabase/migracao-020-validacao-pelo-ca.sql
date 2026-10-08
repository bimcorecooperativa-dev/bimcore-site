-- =====================================================================
-- BIMCORE — migração 020: a experiência é validada pelo Conselho de Administração
-- Estatuto, art. 8º, V (enquadramento por experiência comprovada);
-- Regimento Interno, arts. 71 (cargos do CA; o Conselheiro de Gestão Técnica
-- subsidia o enquadramento) e 89 (progressão).
-- A tesouraria continua vendo os registros (precisa deles para as retiradas),
-- mas só quem é do Conselho de Administração valida ou põe em exigência.
-- Cada análise registra o nome e o cargo do conselheiro.
-- =====================================================================

alter table public.perfis
  add column if not exists conselho_adm boolean not null default false,
  add column if not exists cargo_ca text check (cargo_ca is null or cargo_ca in ('presidente', 'gestao_tecnica', 'financeira', 'institucional', 'conselheiro'));

alter table public.fin_habilitacoes add column if not exists analise_cargo text;
alter table public.fin_experiencias add column if not exists analise_cargo text;

create or replace function public.is_ca() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and status = 'ativo' and conselho_adm);
$$;
grant execute on function public.is_ca() to authenticated;

create or replace function public.nome_cargo_ca(p text) returns text
language sql immutable as $$
  select case p when 'presidente' then 'Presidente do Conselho de Administração'
                when 'gestao_tecnica' then 'Conselheiro(a) de Gestão Técnica, BIM e Qualidade'
                when 'financeira' then 'Conselheiro(a) de Área Financeira e de Fundos'
                when 'institucional' then 'Conselheiro(a) de Área Institucional, Contratos e Relações Externas'
                else 'Conselheiro(a) de Administração' end;
$$;

-- Só a coordenação marca quem é do CA (e o cargo); o Conselho Fiscal não pode estar no CA (Estatuto, art. 60, §5º)
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_coordenacao() then
    new.papel := old.papel;
    new.status := old.status;
    new.email := old.email;
    new.data_ingresso := old.data_ingresso;
    new.analise_obs := old.analise_obs;
    new.analisado_em := old.analisado_em;
    new.tesouraria := old.tesouraria;
    new.conselho_fiscal := old.conselho_fiscal;
    new.conselho_adm := old.conselho_adm;
    new.cargo_ca := old.cargo_ca;
  end if;
  if new.conselho_adm and new.conselho_fiscal then
    raise exception 'Quem é do Conselho Fiscal não pode ser do Conselho de Administração (Estatuto, art. 60, §5º).';
  end if;
  if not new.conselho_adm then new.cargo_ca := null; end if;
  if new.status is distinct from old.status then
    new.analisado_em := now();
  end if;
  if new.status = 'ativo' and new.data_ingresso is null then
    new.data_ingresso := current_date;
  end if;
  return new;
end;
$$;

-- O Presidente é membro nato do CA (RI, art. 72)
update public.perfis set conselho_adm = true, cargo_ca = coalesce(cargo_ca, 'presidente')
 where papel = 'coordenacao' and status = 'ativo' and not conselho_fiscal and not conselho_adm;

-- Políticas: o dono envia; o CA valida; a tesouraria e o CF só leem
do $$
declare t text;
begin
  foreach t in array array['fin_habilitacoes', 'fin_experiencias'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.pode_validar() or public.is_ca())', t);
    execute format('drop policy if exists %1$s_criar on public.%1$s', t);
    execute format('create policy %1$s_criar on public.%1$s for insert to authenticated with check ((public.e_meu_fin(fin_cooperado_id) and status = ''pendente'' and analise_nome is null) or (public.is_ca() and not public.e_meu_fin(fin_cooperado_id)))', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for update to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.is_ca()) with check ((public.e_meu_fin(fin_cooperado_id) and status = ''pendente'') or (public.is_ca() and not public.e_meu_fin(fin_cooperado_id)))', t);
    execute format('drop policy if exists %1$s_apagar on public.%1$s', t);
    execute format('create policy %1$s_apagar on public.%1$s for delete to authenticated using ((public.e_meu_fin(fin_cooperado_id) and status <> ''aprovada'') or (public.is_ca() and not public.e_meu_fin(fin_cooperado_id)))', t);
  end loop;
end $$;

-- Quem analisa fica registrado pelo banco (nome e cargo no CA), não pelo navegador
create or replace function public.registrar_analise_exp() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.perfis;
begin
  if new.status in ('aprovada', 'recusada') and (tg_op = 'INSERT' or new.status is distinct from old.status or new.motivo is distinct from old.motivo) then
    if not public.is_ca() then raise exception 'Só o Conselho de Administração valida formação e experiência (Estatuto, art. 8º, V).'; end if;
    if public.e_meu_fin(new.fin_cooperado_id) then raise exception 'Você não pode validar o seu próprio registro.'; end if;
    select * into p from public.perfis where id = auth.uid();
    new.analise_nome := p.nome; new.analise_cargo := public.nome_cargo_ca(p.cargo_ca); new.analise_em := now();
  elsif new.status = 'pendente' then
    new.analise_nome := null; new.analise_cargo := null; new.analise_em := null;
    if tg_op = 'UPDATE' and old.status = 'aprovada' and not public.is_ca() then raise exception 'Registro já validado: peça ao Conselho de Administração para alterar.'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists registrar_analise_exp on public.fin_habilitacoes;
create trigger registrar_analise_exp before insert or update on public.fin_habilitacoes for each row execute function public.registrar_analise_exp();
drop trigger if exists registrar_analise_exp on public.fin_experiencias;
create trigger registrar_analise_exp before insert or update on public.fin_experiencias for each row execute function public.registrar_analise_exp();

-- Documentos e arquivos: o CA também vê
drop policy if exists fincomp_ver on public.fin_comprovantes;
create policy fincomp_ver on public.fin_comprovantes for select to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.pode_validar() or public.is_ca());
drop policy if exists fincomp_criar on public.fin_comprovantes;
create policy fincomp_criar on public.fin_comprovantes for insert to authenticated with check (public.e_meu_fin(fin_cooperado_id) or public.is_ca());
drop policy if exists fincomp_apagar on public.fin_comprovantes;
create policy fincomp_apagar on public.fin_comprovantes for delete to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.is_ca());
drop policy if exists exp_enviar on storage.objects;
create policy exp_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'experiencia' and (public.e_meu_fin(((storage.foldername(name))[1])::uuid) or public.is_ca()));
drop policy if exists exp_ver on storage.objects;
create policy exp_ver on storage.objects for select to authenticated
  using (bucket_id = 'experiencia' and (public.e_meu_fin(((storage.foldername(name))[1])::uuid) or public.pode_validar() or public.is_ca()));
drop policy if exists exp_apagar on storage.objects;
create policy exp_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'experiencia' and (public.e_meu_fin(((storage.foldername(name))[1])::uuid) or public.is_ca()));

-- O CA vê os cadastros e as horas internas (para calcular o tempo de experiência na BIMCORE)
drop policy if exists fincoop_ca_ver on public.fin_cooperados;
create policy fincoop_ca_ver on public.fin_cooperados for select to authenticated using (public.is_ca());
create or replace function public.horas_internas()
returns table (fin_cooperado_id uuid, mes date, horas numeric, origem text)
language sql stable security definer set search_path = public as $$
  with prod as (
    select c.id, date_trunc('month', p.data)::date as mes, sum(p.horas) as h
      from public.fin_cooperados c join public.producao p on p.cooperado_id = c.perfil_id
     where p.tipo in ('produtiva', 'formacao') and (public.pode_validar() or public.is_fiscal() or public.is_ca() or c.perfil_id = auth.uid())
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

select 'migracao 020 ok' as resultado;
