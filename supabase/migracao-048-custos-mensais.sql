-- BIMCORE — migração 048: custos mensais (assinaturas e mensalidades)
-- A despesa marcada como mensal ganha, todo mês, o botão "Lançar o próximo mês" na tesouraria.
-- Cada mês é uma despesa própria, com quem pagou (aporte do cooperado ou conta da cooperativa),
-- para o valor poder mudar (câmbio) e para registrar quando a cooperativa assumir o custo.
alter table public.fin_despesas add column if not exists mensal boolean not null default false;
select 'migracao 048 ok' as resultado;
