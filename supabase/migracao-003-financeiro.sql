-- =====================================================================
-- BIMCORE — migração 003: posição financeira de cada cooperado
-- (Estatuto: art. 7º IV, art. 19, art. 23 §4º, art. 25, art. 78, art. 79)
-- =====================================================================

-- Quem atua na tesouraria (além da coordenação)
alter table public.perfis add column if not exists tesouraria boolean not null default false;

create or replace function public.is_tesouraria() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and status = 'ativo'
                 and (papel = 'coordenacao' or tesouraria));
$$;

-- Só a coordenação muda papel, status, tesouraria e parecer
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
  end if;
  if new.status is distinct from old.status then
    new.analisado_em := now();
  end if;
  if new.status = 'ativo' and new.data_ingresso is null then
    new.data_ingresso := current_date;
  end if;
  return new;
end;
$$;

-- A tesouraria precisa ver o cadastro dos cooperados para conferir a planilha
drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select to authenticated
  using (id = auth.uid() or public.is_coordenacao() or public.is_tesouraria());

-- Cada envio de planilha
create table if not exists public.financeiro_importacoes (
  id          uuid primary key default gen_random_uuid(),
  data_base   date not null,
  arquivo     text,
  linhas      int not null default 0,
  criado_por  uuid references public.perfis(id) on delete set null,
  criado_nome text,
  criado_em   timestamptz not null default now()
);

-- Posição de cada cooperado numa data-base
create table if not exists public.financeiro_posicoes (
  id                     uuid primary key default gen_random_uuid(),
  importacao_id          uuid not null references public.financeiro_importacoes(id) on delete cascade,
  cooperado_id           uuid not null references public.perfis(id) on delete cascade,
  data_base              date not null,
  quotas_subscritas      numeric(10,2),
  capital_subscrito      numeric(14,2),
  capital_integralizado  numeric(14,2),
  contribuicoes_pagas    numeric(14,2),
  contribuicao_mensal    numeric(14,2),
  valor_em_aberto        numeric(14,2),
  meses_em_atraso        int,
  fic_saldo              numeric(14,2),
  fundo_13               numeric(14,2),
  fundo_ferias           numeric(14,2),
  sobras_a_receber       numeric(14,2),
  outros_creditos        numeric(14,2),
  observacao             text,
  criado_em              timestamptz not null default now()
);
create index if not exists fin_pos_coop_idx on public.financeiro_posicoes (cooperado_id, data_base desc);

alter table public.financeiro_importacoes enable row level security;
alter table public.financeiro_posicoes    enable row level security;

drop policy if exists fin_imp_gerir on public.financeiro_importacoes;
create policy fin_imp_gerir on public.financeiro_importacoes for all to authenticated
  using (public.is_tesouraria()) with check (public.is_tesouraria());

drop policy if exists fin_pos_ver on public.financeiro_posicoes;
create policy fin_pos_ver on public.financeiro_posicoes for select to authenticated
  using (cooperado_id = auth.uid() or public.is_tesouraria());
drop policy if exists fin_pos_gerir on public.financeiro_posicoes;
create policy fin_pos_gerir on public.financeiro_posicoes for insert to authenticated
  with check (public.is_tesouraria());
drop policy if exists fin_pos_apagar on public.financeiro_posicoes;
create policy fin_pos_apagar on public.financeiro_posicoes for delete to authenticated
  using (public.is_tesouraria());
