-- =====================================================================
-- BIMCORE — migração 012: crédito de trabalho e solicitação de retirada
-- As horas lançadas geram crédito (horas × valor-hora da categoria).
-- O cooperado solicita a retirada; a tesouraria transfere até o 5º dia
-- útil do mês seguinte e marca como paga (Regimento, arts. 76 e 81).
-- =====================================================================

alter table public.fin_parametros
  add column if not exists retirada_minima numeric(14,2) not null default 0 check (retirada_minima >= 0),
  add column if not exists retirada_dia_util int not null default 5 check (retirada_dia_util between 1 and 20);

create table if not exists public.fin_retiradas (
  id               uuid primary key default gen_random_uuid(),
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  valor            numeric(14,2) not null check (valor > 0),
  status           text not null default 'solicitada' check (status in ('solicitada', 'paga', 'cancelada')),
  solicitado_em    timestamptz not null default now(),
  solicitado_nome  text,
  prazo            date,
  pago_em          date,
  pago_nome        text,
  inss             numeric(14,2),
  contribuicao     numeric(14,2),
  fic_vol          numeric(14,2),
  liquido          numeric(14,2),
  motivo           text,
  atualizado_em    timestamptz not null default now()
);
create index if not exists fin_retiradas_coop on public.fin_retiradas (fin_cooperado_id);

alter table public.fin_retiradas enable row level security;
drop policy if exists finret_ver on public.fin_retiradas;
create policy finret_ver on public.fin_retiradas for select to authenticated
  using (public.e_meu_fin(fin_cooperado_id) or public.pode_validar());
drop policy if exists finret_pedir on public.fin_retiradas;
create policy finret_pedir on public.fin_retiradas for insert to authenticated
  with check ((public.e_meu_fin(fin_cooperado_id) and status = 'solicitada' and pago_em is null and pago_nome is null) or public.is_tesouraria());
-- o cooperado só pode cancelar o próprio pedido enquanto não foi pago; a tesouraria paga ou cancela
drop policy if exists finret_editar on public.fin_retiradas;
create policy finret_editar on public.fin_retiradas for update to authenticated
  using ((public.e_meu_fin(fin_cooperado_id) and status = 'solicitada') or public.is_tesouraria())
  with check ((public.e_meu_fin(fin_cooperado_id) and status = 'cancelada' and pago_em is null) or public.is_tesouraria());
drop policy if exists finret_apagar on public.fin_retiradas;
create policy finret_apagar on public.fin_retiradas for delete to authenticated using (public.is_tesouraria());

-- Horas por mês de cada cooperado (base do crédito). Ociosidade não gera crédito.
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
     and (public.pode_validar() or c.perfil_id = auth.uid())
   group by 1, 2;
$$;
grant execute on function public.horas_mensais() to authenticated;

-- Total de horas produtivas da cooperativa (rateio das sobras) passa a vir das horas lançadas
create or replace function public.horas_produtivas_total() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(horas), 0) from public.producao where tipo in ('produtiva', 'formacao');
$$;
grant execute on function public.horas_produtivas_total() to authenticated;

select 'migracao 012 ok' as resultado;
