-- =====================================================================
-- BIMCORE — migração 032: caixa livre para retiradas por camadas
-- O saldo da conta movimento não é todo livre para retiradas: guias a recolher,
-- contas a pagar em 30 dias, sobras a pagar, os 20% ainda não gastos (art. 23, §8º)
-- e o que ainda falta transferir para o FIC e para as aplicações ficam reservados.
-- A tesouraria calcula essas camadas no mapa do dinheiro (publicado sozinho ao abrir
-- Contas e caixa); o caixa das retiradas passa a descontar a maior entre a reserva
-- mínima manual e as camadas do último mapa.
-- =====================================================================

create or replace function public.caixa_retiradas() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from public.fin_saldos order by data desc, criado_em desc limit 1),
       par as (select patronal_pct, reserva_caixa from public.fin_parametros where id = 1),
       mp as (select coalesce((dados->>'reservado_mov')::numeric, 0) as reservado, gerado_em from public.fin_mapa order by gerado_em desc limit 1)
  select jsonb_build_object(
    'data', (select data from s),
    'saldo', (select saldo from s),
    'reserva', greatest(coalesce((select reserva_caixa from par), 0), coalesce((select reservado from mp), 0)),
    'reserva_minima', (select reserva_caixa from par),
    'reservado_mov', coalesce((select reservado from mp), 0),
    'camadas_em', (select gerado_em from mp),
    'patronal_pct', (select patronal_pct from par),
    'pedidos', coalesce((select sum(valor) from public.fin_retiradas where status = 'solicitada'), 0),
    'pagas_depois', coalesce((select sum(r.valor) from public.fin_retiradas r, s
                               where r.status = 'paga' and (r.pago_em > s.data or (r.pago_em = s.data and r.atualizado_em > s.criado_em))), 0)
  );
$$;
grant execute on function public.caixa_retiradas() to authenticated;

select 'migracao 032 ok' as resultado;
