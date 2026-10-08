-- =====================================================================
-- BIMCORE — migração 011: tipo de hora "Suporte administrativo"
-- Execução das atividades administrativas, financeiras e de suporte
-- (art. 53, §4º e §5º): paga por hora pelo valor da categoria e
-- custeada pelo Custo de Operação e Gestão (20%, art. 23, §7º).
-- Não entra no rateio das sobras nem na experiência interna.
-- =====================================================================

do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.producao'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%ociosidade_operacional%'
  loop
    execute format('alter table public.producao drop constraint %I', c);
  end loop;
end $$;
alter table public.producao add constraint producao_tipo_check
  check (tipo in ('produtiva', 'formacao', 'administrativa', 'ociosidade_estrategica', 'ociosidade_operacional'));

alter table public.fin_folha
  add column if not exists horas_admin numeric(8,2) not null default 0 check (horas_admin >= 0);

drop function if exists public.horas_lancadas(date);
create function public.horas_lancadas(p_mes date)
returns table (fin_cooperado_id uuid, produtivas numeric, formacao numeric, administrativas numeric, dias bigint)
language sql stable security definer set search_path = public as $$
  select c.id,
         coalesce(sum(p.horas) filter (where p.tipo = 'produtiva'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'formacao'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'administrativa'), 0),
         count(distinct p.data) filter (where p.tipo in ('produtiva', 'formacao', 'administrativa'))
    from public.fin_cooperados c
    join public.producao p on p.cooperado_id = c.perfil_id
   where public.is_tesouraria()
     and p.data >= date_trunc('month', p_mes)::date and p.data < (date_trunc('month', p_mes) + interval '1 month')::date
   group by c.id;
$$;
grant execute on function public.horas_lancadas(date) to authenticated;

select 'migracao 011 ok' as resultado;
