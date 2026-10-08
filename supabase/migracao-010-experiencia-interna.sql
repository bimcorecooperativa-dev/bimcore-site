-- =====================================================================
-- BIMCORE — migração 010: experiência interna automática
-- As horas lançadas no site (ou as do fechamento do mês, quando houver)
-- viram experiência na cooperativa: mês de referência = dias úteis ×
-- jornada; 11 meses completos = 1 ano (recesso de férias).
-- =====================================================================

alter table public.fin_parametros
  add column if not exists horas_dia          numeric(4,2) not null default 6,
  add column if not exists meses_ano          int not null default 11 check (meses_ano between 1 and 12),
  add column if not exists feriados_extras    text not null default '20/01, 06/02, 23/04',
  add column if not exists facultativos_folga boolean not null default true;

create or replace function public.horas_internas()
returns table (fin_cooperado_id uuid, mes date, horas numeric, origem text)
language sql stable security definer set search_path = public as $$
  with prod as (
    select c.id, date_trunc('month', p.data)::date as mes, sum(p.horas) as h
      from public.fin_cooperados c join public.producao p on p.cooperado_id = c.perfil_id
     where p.tipo in ('produtiva', 'formacao') and (public.pode_validar() or c.perfil_id = auth.uid())
     group by 1, 2
  ), fol as (
    select f.fin_cooperado_id as id, f.mes, f.horas_produtivas + f.horas_formacao as h
      from public.fin_folha f join public.fin_cooperados c on c.id = f.fin_cooperado_id
     where public.pode_validar() or c.perfil_id = auth.uid()
  )
  select coalesce(fol.id, prod.id), coalesce(fol.mes, prod.mes), coalesce(fol.h, prod.h),
         case when fol.id is not null then 'fechamento' else 'lancado' end
    from fol full join prod on prod.id = fol.id and prod.mes = fol.mes;
$$;
grant execute on function public.horas_internas() to authenticated;
