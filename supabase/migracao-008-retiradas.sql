-- =====================================================================
-- BIMCORE — migração 008: sistema financeiro, etapa 2
-- Fechamento mensal (horas, retiradas, INSS, contribuição, FIC, 13º,
-- férias, auxílios), receitas da cooperativa, sobras e parâmetros do
-- Estatuto editáveis pela tesouraria.
-- =====================================================================

alter table public.fin_parametros
  add column if not exists sm                numeric(14,2) not null default 1621,
  add column if not exists horas_ref         int           not null default 120,
  add column if not exists contrib_pct       numeric(8,5)  not null default 0.015,
  add column if not exists inss_pct          numeric(8,5)  not null default 0.11,
  add column if not exists inss_teto         numeric(14,2) not null default 8475.55,
  add column if not exists patronal_pct      numeric(8,5)  not null default 0.20,
  add column if not exists fic_coop_pct      numeric(8,5)  not null default 0.055,
  add column if not exists fic_vol_max       numeric(8,5)  not null default 0.025,
  add column if not exists tele_pct          numeric(8,5)  not null default 0.0925,
  add column if not exists alim_pct          numeric(8,5)  not null default 0.0278,
  add column if not exists custo_op_pct      numeric(8,5)  not null default 0.20,
  add column if not exists reserva_pct       numeric(8,5)  not null default 0.10,
  add column if not exists fates_pct         numeric(8,5)  not null default 0.05,
  add column if not exists base_demais_pleno numeric(14,2) not null default 6600,
  add column if not exists mult_junior       numeric(6,2)  not null default 8.5,
  add column if not exists mult_pleno        numeric(6,2)  not null default 11,
  add column if not exists mult_senior       numeric(6,2)  not null default 14,
  add column if not exists mult_coord        numeric(6,2)  not null default 17.5,
  add column if not exists sobras_mercado    numeric(14,2) not null default 0,
  add column if not exists sobras_publicas   numeric(14,2) not null default 0,
  add column if not exists rateio_pct        numeric(8,5)  not null default 1;

alter table public.fin_cooperados
  add column if not exists conselho        text,
  add column if not exists categoria       text check (categoria in ('Júnior', 'Pleno', 'Sênior', 'Coordenador')),
  add column if not exists teletrabalho    boolean not null default false,
  add column if not exists fic_voluntario  numeric(8,5) not null default 0 check (fic_voluntario between 0 and 0.025),
  add column if not exists fic_rendimentos numeric(14,2) not null default 0,
  add column if not exists fic_resgates    numeric(14,2) not null default 0;

create table if not exists public.fin_folha (
  id               uuid primary key default gen_random_uuid(),
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  mes              date not null,
  horas_produtivas numeric(8,2) not null default 0 check (horas_produtivas >= 0),
  horas_formacao   numeric(8,2) not null default 0 check (horas_formacao >= 0),
  dias             int not null default 0 check (dias between 0 and 31),
  decimo_pago      numeric(14,2) not null default 0,
  ferias_pago      numeric(14,2) not null default 0,
  observacao       text,
  atualizado_nome  text,
  atualizado_em    timestamptz not null default now(),
  unique (fin_cooperado_id, mes)
);

create table if not exists public.fin_receitas (
  mes             date primary key,
  receita_bruta   numeric(14,2) not null default 0,
  observacao      text,
  atualizado_nome text,
  atualizado_em   timestamptz not null default now()
);

alter table public.fin_folha    enable row level security;
alter table public.fin_receitas enable row level security;

drop policy if exists finfolha_ver on public.fin_folha;
create policy finfolha_ver on public.fin_folha for select to authenticated
  using (public.is_tesouraria() or exists (select 1 from public.fin_cooperados c where c.id = fin_cooperado_id and c.perfil_id = auth.uid()));
drop policy if exists finfolha_tes on public.fin_folha;
create policy finfolha_tes on public.fin_folha for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());
drop policy if exists finrec_tes on public.fin_receitas;
create policy finrec_tes on public.fin_receitas for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

-- Horas que os cooperados lançaram no site, para a tesouraria puxar no fechamento
create or replace function public.horas_lancadas(p_mes date)
returns table (fin_cooperado_id uuid, produtivas numeric, formacao numeric, dias bigint)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(sum(p.horas) filter (where p.tipo = 'produtiva'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'formacao'), 0),
         count(distinct p.data) filter (where p.tipo in ('produtiva', 'formacao'))
    from public.fin_cooperados c
    join public.producao p on p.cooperado_id = c.perfil_id
   where public.is_tesouraria()
     and p.data >= date_trunc('month', p_mes)::date and p.data < (date_trunc('month', p_mes) + interval '1 month')::date
   group by c.id;
$$;
grant execute on function public.horas_lancadas(date) to authenticated;

-- Extrato do cooperado com a folha dele e o total de horas da cooperativa (rateio das sobras)
create or replace function public.meu_extrato() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select * from public.fin_cooperados where perfil_id = auth.uid() limit 1),
  pg as (select p.* from public.fin_pagamentos p join me on me.id = p.fin_cooperado_id)
  select jsonb_build_object(
    'parametros', (select to_jsonb(x) from public.fin_parametros x where id = 1),
    'cooperado',  (select to_jsonb(me) from me),
    'pagamentos', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.data nulls last, pg.criado_em) from pg), '[]'::jsonb),
    'folha',      coalesce((select jsonb_agg(to_jsonb(f) order by f.mes) from public.fin_folha f join me on me.id = f.fin_cooperado_id), '[]'::jsonb),
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
