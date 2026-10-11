-- =====================================================================
-- BIMCORE — migração 037: de onde saiu o dinheiro da despesa
-- Despesa paga com dinheiro da cooperativa guarda a conta de onde saiu
-- (conta_id). O site usa isso, com os demais movimentos já registrados,
-- para calcular o saldo esperado de cada conta: a tesouraria só confere
-- com o extrato, em vez de redigitar o que já lançou.
-- =====================================================================

alter table public.fin_despesas add column if not exists conta_id uuid references public.fin_contas(id) on delete set null;

select 'migracao 037 ok' as resultado;
