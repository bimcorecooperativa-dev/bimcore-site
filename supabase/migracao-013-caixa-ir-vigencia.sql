-- =====================================================================
-- BIMCORE — migração 013
-- 1) Saldo em conta: a tesouraria informa o saldo do banco; as retiradas
--    só podem ser pedidas até o caixa livre (saldo − reserva − pedidos).
-- 2) IR retido na fonte nas retiradas (Lei 8.541/1992, art. 45, §1º;
--    tabela progressiva e redução da Lei 15.270/2025).
-- 3) Vigência: os valores que mudam todo ano (salário-mínimo, quota,
--    tabela, INSS, IR) valem a partir de um mês e não reescrevem o passado.
-- =====================================================================

alter table public.fin_parametros
  add column if not exists reserva_caixa numeric(14,2) not null default 0,
  add column if not exists ir_f1 numeric(12,2) not null default 2428.80,
  add column if not exists ir_f2 numeric(12,2) not null default 2826.65,
  add column if not exists ir_f3 numeric(12,2) not null default 3751.05,
  add column if not exists ir_f4 numeric(12,2) not null default 4664.68,
  add column if not exists ir_d1 numeric(12,2) not null default 182.16,
  add column if not exists ir_d2 numeric(12,2) not null default 394.16,
  add column if not exists ir_d3 numeric(12,2) not null default 675.49,
  add column if not exists ir_d4 numeric(12,2) not null default 908.73,
  add column if not exists ir_dep numeric(12,2) not null default 189.59,
  add column if not exists ir_simpl numeric(12,2) not null default 607.20,
  add column if not exists ir_red_lim1 numeric(12,2) not null default 5000,
  add column if not exists ir_red_max1 numeric(12,2) not null default 312.89,
  add column if not exists ir_red_lim2 numeric(12,2) not null default 7350,
  add column if not exists ir_red_a numeric(12,2) not null default 978.62,
  add column if not exists ir_red_b numeric(10,6) not null default 0.133145;

alter table public.fin_cooperados add column if not exists dependentes_ir int not null default 0 check (dependentes_ir between 0 and 20);
alter table public.fin_retiradas add column if not exists ir numeric(14,2);

-- Saldos do banco informados pela tesouraria
create table if not exists public.fin_saldos (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  saldo           numeric(14,2) not null,
  observacao      text,
  registrado_nome text,
  criado_em       timestamptz not null default now()
);
alter table public.fin_saldos enable row level security;
drop policy if exists finsal_ver on public.fin_saldos;
create policy finsal_ver on public.fin_saldos for select to authenticated using (public.pode_validar());
drop policy if exists finsal_gravar on public.fin_saldos;
create policy finsal_gravar on public.fin_saldos for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

-- Valores com vigência (cada linha vale a partir do mês indicado)
create table if not exists public.fin_vigencias (
  vigencia   date primary key,
  dados      jsonb not null,
  salvo_nome text,
  salvo_em   timestamptz not null default now()
);
alter table public.fin_vigencias enable row level security;
drop policy if exists finvig_ver on public.fin_vigencias;
create policy finvig_ver on public.fin_vigencias for select to authenticated using (true);
drop policy if exists finvig_gravar on public.fin_vigencias;
create policy finvig_gravar on public.fin_vigencias for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

-- Primeira vigência: os valores atuais valem desde janeiro de 2026
insert into public.fin_vigencias (vigencia, dados, salvo_nome)
select date '2026-01-01', (to_jsonb(p) - 'id' - 'modo' - 'fechamento' - 'atualizado_em' - 'atualizado_nome'), 'migração 013'
  from public.fin_parametros p where p.id = 1
on conflict (vigencia) do nothing;

-- Caixa para retiradas: qualquer cooperado vê se há caixa, sem ver o extrato do banco
create or replace function public.caixa_retiradas() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from public.fin_saldos order by data desc, criado_em desc limit 1),
       par as (select patronal_pct, reserva_caixa from public.fin_parametros where id = 1)
  select jsonb_build_object(
    'data', (select data from s),
    'saldo', (select saldo from s),
    'reserva', (select reserva_caixa from par),
    'patronal_pct', (select patronal_pct from par),
    'pedidos', coalesce((select sum(valor) from public.fin_retiradas where status = 'solicitada'), 0),
    'pagas_depois', coalesce((select sum(valor) from public.fin_retiradas r, s where r.status = 'paga' and r.pago_em > s.data), 0)
  );
$$;
grant execute on function public.caixa_retiradas() to authenticated;

select 'migracao 013 ok' as resultado;
