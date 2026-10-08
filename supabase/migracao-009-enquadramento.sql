-- =====================================================================
-- BIMCORE — migração 009: enquadramento automático (art. 8º, IV e V)
-- O cooperado envia formações (diploma/registro) e experiências com
-- comprovantes. A coordenação ou a tesouraria valida (ninguém valida o
-- próprio registro). O site calcula a categoria mês a mês.
-- =====================================================================

alter table public.fin_parametros
  add column if not exists exp_tecnico_antes  boolean not null default true,
  add column if not exists exp_superior_antes boolean not null default false;

create table if not exists public.fin_habilitacoes (
  id               uuid primary key default gen_random_uuid(),
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  titulo           text not null,
  nivel            text not null check (nivel in ('tecnico', 'superior', 'outro')),
  conselho         text,
  data_habilitacao date,
  registro         text,
  status           text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  analise_nome     text,
  analise_em       timestamptz,
  motivo           text,
  criado_em        timestamptz not null default now()
);

create table if not exists public.fin_experiencias (
  id               uuid primary key default gen_random_uuid(),
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  habilitacao_id   uuid references public.fin_habilitacoes(id) on delete set null,
  descricao        text not null,
  inicio           date not null,
  fim              date,
  status           text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  analise_nome     text,
  analise_em       timestamptz,
  motivo           text,
  criado_em        timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);

create table if not exists public.fin_comprovantes (
  id               uuid primary key default gen_random_uuid(),
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  ref_tipo         text not null check (ref_tipo in ('habilitacao', 'experiencia')),
  ref_id           uuid not null,
  caminho          text not null,
  nome_arquivo     text not null,
  tamanho          bigint,
  criado_em        timestamptz not null default now()
);

alter table public.fin_cooperados
  add column if not exists habilitacao_remuneracao uuid references public.fin_habilitacoes(id) on delete set null,
  add column if not exists coordenador_designado   boolean not null default false,
  add column if not exists coordenador_desde       date,
  add column if not exists coordenador_ato         text;

-- quem é dono do registro
create or replace function public.e_meu_fin(p_coop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fin_cooperados where id = p_coop and perfil_id = auth.uid());
$$;
create or replace function public.pode_validar() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_coordenacao() or public.is_tesouraria();
$$;

alter table public.fin_habilitacoes enable row level security;
alter table public.fin_experiencias enable row level security;
alter table public.fin_comprovantes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fin_habilitacoes', 'fin_experiencias'] loop
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.pode_validar())', t);
    execute format('drop policy if exists %1$s_criar on public.%1$s', t);
    execute format('create policy %1$s_criar on public.%1$s for insert to authenticated with check ((public.e_meu_fin(fin_cooperado_id) and status = ''pendente'' and analise_nome is null) or public.pode_validar())', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for update to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.pode_validar()) with check ((public.e_meu_fin(fin_cooperado_id) and status = ''pendente'') or (public.pode_validar() and not public.e_meu_fin(fin_cooperado_id)))', t);
    execute format('drop policy if exists %1$s_apagar on public.%1$s', t);
    execute format('create policy %1$s_apagar on public.%1$s for delete to authenticated using ((public.e_meu_fin(fin_cooperado_id) and status <> ''aprovada'') or (public.pode_validar() and not public.e_meu_fin(fin_cooperado_id)))', t);
  end loop;
end $$;

drop policy if exists fincomp_ver on public.fin_comprovantes;
create policy fincomp_ver on public.fin_comprovantes for select to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.pode_validar());
drop policy if exists fincomp_criar on public.fin_comprovantes;
create policy fincomp_criar on public.fin_comprovantes for insert to authenticated with check (public.e_meu_fin(fin_cooperado_id) or public.pode_validar());
drop policy if exists fincomp_apagar on public.fin_comprovantes;
create policy fincomp_apagar on public.fin_comprovantes for delete to authenticated using (public.e_meu_fin(fin_cooperado_id) or public.pode_validar());

-- O cooperado ligado à conta pode ver o próprio cadastro financeiro (já existia) — e quem valida também
drop policy if exists fincoop_ver on public.fin_cooperados;
create policy fincoop_ver on public.fin_cooperados for select to authenticated using (public.is_tesouraria() or public.is_coordenacao() or perfil_id = auth.uid());

-- Arquivos: pasta com o id do cadastro financeiro
insert into storage.buckets (id, name, public, file_size_limit) values ('experiencia', 'experiencia', false, 20971520) on conflict (id) do nothing;
drop policy if exists exp_enviar on storage.objects;
create policy exp_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'experiencia' and (public.e_meu_fin(((storage.foldername(name))[1])::uuid) or public.pode_validar()));
drop policy if exists exp_ver on storage.objects;
create policy exp_ver on storage.objects for select to authenticated
  using (bucket_id = 'experiencia' and (public.e_meu_fin(((storage.foldername(name))[1])::uuid) or public.pode_validar()));
drop policy if exists exp_apagar on storage.objects;
create policy exp_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'experiencia' and (public.e_meu_fin(((storage.foldername(name))[1])::uuid) or public.pode_validar()));

-- Extrato inclui formações e experiências (para o enquadramento na Minha conta)
create or replace function public.meu_extrato() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select * from public.fin_cooperados where perfil_id = auth.uid() limit 1),
  pg as (select p.* from public.fin_pagamentos p join me on me.id = p.fin_cooperado_id)
  select jsonb_build_object(
    'parametros', (select to_jsonb(x) from public.fin_parametros x where id = 1),
    'cooperado',  (select to_jsonb(me) from me),
    'pagamentos', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.data nulls last, pg.criado_em) from pg), '[]'::jsonb),
    'folha',      coalesce((select jsonb_agg(to_jsonb(f) order by f.mes) from public.fin_folha f join me on me.id = f.fin_cooperado_id), '[]'::jsonb),
    'habilitacoes', coalesce((select jsonb_agg(to_jsonb(h) order by h.data_habilitacao) from public.fin_habilitacoes h join me on me.id = h.fin_cooperado_id), '[]'::jsonb),
    'experiencias', coalesce((select jsonb_agg(to_jsonb(e) order by e.inicio) from public.fin_experiencias e join me on me.id = e.fin_cooperado_id), '[]'::jsonb),
    'horas_total', (select coalesce(sum(horas_produtivas + horas_formacao), 0) from public.fin_folha),
    'despesas',   coalesce((select jsonb_agg(jsonb_build_object(
                     'id', d.id, 'data', d.data, 'descricao', d.descricao, 'valor', d.valor, 'cobrar', d.cobrar,
                     'n_participantes', cardinality(d.participantes),
                     'participantes', case when me.id = any(d.participantes) then array[me.id] else '{}'::uuid[] end))
                   from public.fin_despesas d, me
                   where (d.cobrar and me.id = any(d.participantes)) or d.id in (select despesa_id from pg where despesa_id is not null)), '[]'::jsonb)
  );
$$;
grant execute on function public.meu_extrato() to authenticated;
