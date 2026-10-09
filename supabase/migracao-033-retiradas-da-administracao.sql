-- =====================================================================
-- BIMCORE — migração 033: retiradas da administração saem dos 20%
-- As horas administrativas são pagas com o Custo de Operação e Gestão (20% de cada
-- contrato, art. 23, §7º). O mapa do dinheiro reserva os créditos de administração
-- ainda não retirados dentro dos 20% e informa quanto deles os 20% recebidos cobrem
-- (cobertura_admin). O caixa das retiradas passa esse índice ao site do cooperado:
-- a parte de produção do pedido sai do livre da conta movimento; a parte de
-- administração, da reserva dos 20%.
-- =====================================================================

create or replace function public.caixa_retiradas() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from public.fin_saldos order by data desc, criado_em desc limit 1),
       par as (select patronal_pct, reserva_caixa from public.fin_parametros where id = 1),
       mp as (select coalesce((dados->>'reservado_mov')::numeric, 0) as reservado,
                     coalesce((dados->>'cobertura_admin')::numeric, 1) as cobertura, gerado_em
                from public.fin_mapa order by gerado_em desc limit 1)
  select jsonb_build_object(
    'data', (select data from s),
    'saldo', (select saldo from s),
    'reserva', greatest(coalesce((select reserva_caixa from par), 0), coalesce((select reservado from mp), 0)),
    'reserva_minima', (select reserva_caixa from par),
    'reservado_mov', coalesce((select reservado from mp), 0),
    'cobertura_admin', coalesce((select cobertura from mp), 1),
    'camadas_em', (select gerado_em from mp),
    'patronal_pct', (select patronal_pct from par),
    'pedidos', coalesce((select sum(valor) from public.fin_retiradas where status = 'solicitada'), 0),
    'pagas_depois', coalesce((select sum(r.valor) from public.fin_retiradas r, s
                               where r.status = 'paga' and (r.pago_em > s.data or (r.pago_em = s.data and r.atualizado_em > s.criado_em))), 0)
  );
$$;
grant execute on function public.caixa_retiradas() to authenticated;

select 'migracao 033 ok' as resultado;
