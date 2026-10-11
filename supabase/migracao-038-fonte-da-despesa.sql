-- =====================================================================
-- BIMCORE — migração 038: de onde vem o recurso que paga a despesa
-- custo_op: os 20% (Custo de Operação e Gestão, Estatuto art. 23, §8º) — despesa administrativa
-- caixa:    caixa geral da cooperativa (capital, aportes e outras entradas, até a destinação do exercício)
-- fundo:    um fundo específico (FATES, Reserva, Soberania, FEI, Apoio); a saída é lançada no extrato do fundo
-- =====================================================================

alter table public.fin_despesas add column if not exists fonte text not null default 'custo_op' check (fonte in ('custo_op', 'caixa', 'fundo'));
alter table public.fin_despesas add column if not exists fundo text check (fundo is null or fundo in ('reserva', 'fates', 'soberania', 'fei', 'apoio'));
alter table public.fin_despesas add column if not exists fundo_mov_id uuid references public.fin_fundos_mov(id) on delete set null;

select 'migracao 038 ok' as resultado;
