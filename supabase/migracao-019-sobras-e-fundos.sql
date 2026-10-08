-- =====================================================================
-- BIMCORE — migração 019: apuração das sobras por exercício e fundos coletivos
-- Estatuto, arts. 70 a 73; Regimento Interno, arts. 116 a 122 e 126.
-- Ordem (RI 116): I – Reserva e FATES; II – Fundo de Soberania até a meta
-- de 6 meses de custo operacional; III – FEI; IV – Fundo de Aposentadoria.
-- Sobras de parcerias públicas: depois de Reserva e FATES, tudo vai ao FEI
-- (Estatuto, art. 72). O restante das sobras de mercado é rateado pelas
-- horas do exercício (Estatuto, art. 7º e art. 71, §3º).
-- =====================================================================

create table if not exists public.fin_sobras (
  exercicio        int primary key check (exercicio between 2026 and 2100),
  mercado          numeric(14,2) not null default 0 check (mercado >= 0),
  publicas         numeric(14,2) not null default 0 check (publicas >= 0),
  reserva_pct      numeric(6,4) not null default 0.10 check (reserva_pct >= 0.10 and reserva_pct <= 1),
  fates_pct        numeric(6,4) not null default 0.05 check (fates_pct >= 0.05 and fates_pct <= 1),
  custo_mensal     numeric(14,2) not null default 0 check (custo_mensal >= 0),
  meta_meses       numeric(4,1) not null default 6 check (meta_meses >= 0),
  soberania_antes  numeric(14,2) not null default 0,
  reserva          numeric(14,2) not null default 0,
  fates            numeric(14,2) not null default 0,
  soberania        numeric(14,2) not null default 0 check (soberania >= 0),
  fei_publicas     numeric(14,2) not null default 0,
  fei_mercado      numeric(14,2) not null default 0 check (fei_mercado >= 0),
  aposentadoria    numeric(14,2) not null default 0 check (aposentadoria >= 0),
  apoio            numeric(14,2) not null default 0 check (apoio >= 0),
  rateio           numeric(14,2) not null default 0 check (rateio >= 0),
  horas_total      numeric(10,2) not null default 0,
  observacao       text,
  status           text not null default 'rascunho' check (status in ('rascunho', 'lancada')),
  aprovado_em      date,
  ata              text,
  salvo_nome       text,
  salvo_em         timestamptz not null default now(),
  lancado_nome     text,
  lancado_em       timestamptz,
  rateio_pago_em   date,
  rateio_pago_nome text
);

create table if not exists public.fin_sobras_cotas (
  exercicio        int not null references public.fin_sobras(exercicio) on delete cascade,
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  nome             text,
  horas            numeric(10,2) not null default 0,
  rateio           numeric(14,2) not null default 0,
  aposentadoria    numeric(14,2) not null default 0,
  pago_em          date,
  primary key (exercicio, fin_cooperado_id)
);

create table if not exists public.fin_fundos_mov (
  id              uuid primary key default gen_random_uuid(),
  fundo           text not null check (fundo in ('reserva', 'fates', 'soberania', 'fei', 'aposentadoria', 'apoio')),
  data            date not null,
  valor           numeric(14,2) not null check (valor <> 0),
  descricao       text not null check (char_length(descricao) between 3 and 300),
  exercicio       int references public.fin_sobras(exercicio) on delete cascade,
  registrado_nome text,
  criado_em       timestamptz not null default now()
);

alter table public.fin_sobras enable row level security;
alter table public.fin_sobras_cotas enable row level security;
alter table public.fin_fundos_mov enable row level security;

-- Apuração: a tesouraria monta o rascunho; depois de lançada, todos os cooperados veem
drop policy if exists sobras_ver on public.fin_sobras;
create policy sobras_ver on public.fin_sobras for select to authenticated
  using (public.pode_ver_fin() or public.is_coordenacao() or (status = 'lancada' and public.is_ativo()));
drop policy if exists sobras_criar on public.fin_sobras;
create policy sobras_criar on public.fin_sobras for insert to authenticated with check (public.is_tesouraria() and status = 'rascunho');
drop policy if exists sobras_editar on public.fin_sobras;
create policy sobras_editar on public.fin_sobras for update to authenticated
  using (public.is_tesouraria() and status = 'rascunho') with check (public.is_tesouraria() and status = 'rascunho');
drop policy if exists sobras_apagar on public.fin_sobras;
create policy sobras_apagar on public.fin_sobras for delete to authenticated using (public.is_tesouraria() and status = 'rascunho');

create or replace function public.regras_sobras() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.salvo_nome := (select nome from public.perfis where id = auth.uid());
  new.salvo_em := now();
  if tg_op = 'INSERT' or current_setting('bimcore.rpc_sobras', true) is distinct from 'sim' then
    new.status := 'rascunho'; new.lancado_nome := null; new.lancado_em := null; new.rateio_pago_em := null; new.rateio_pago_nome := null;
  end if;
  return new;
end;
$$;
drop trigger if exists regras_sobras on public.fin_sobras;
create trigger regras_sobras before insert or update on public.fin_sobras for each row execute function public.regras_sobras();

-- Cotas: cada cooperado vê só a sua; gravação só pelas funções abaixo
drop policy if exists cotas_ver on public.fin_sobras_cotas;
create policy cotas_ver on public.fin_sobras_cotas for select to authenticated
  using (public.pode_ver_fin() or public.is_coordenacao()
         or fin_cooperado_id in (select id from public.fin_cooperados where perfil_id = auth.uid()));

-- Fundos coletivos: extrato aberto a todos os cooperados (RI 126, transparência radical)
drop policy if exists fundos_ver on public.fin_fundos_mov;
create policy fundos_ver on public.fin_fundos_mov for select to authenticated
  using (public.is_ativo() or public.pode_ver_fin() or public.is_coordenacao());
drop policy if exists fundos_criar on public.fin_fundos_mov;
create policy fundos_criar on public.fin_fundos_mov for insert to authenticated
  with check (public.is_tesouraria() and exercicio is null and fundo <> 'aposentadoria');
drop policy if exists fundos_apagar on public.fin_fundos_mov;
create policy fundos_apagar on public.fin_fundos_mov for delete to authenticated
  using (public.is_tesouraria() and exercicio is null);

create or replace function public.nome_registro_fundo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.registrado_nome is null then new.registrado_nome := (select nome from public.perfis where id = auth.uid()); end if;
  new.criado_em := now(); return new;
end;
$$;
drop trigger if exists nome_registro_fundo on public.fin_fundos_mov;
create trigger nome_registro_fundo before insert on public.fin_fundos_mov for each row execute function public.nome_registro_fundo();

-- Lançar a apuração aprovada pela Assembleia: grava as cotas e as entradas nos fundos de uma vez
create or replace function public.lancar_sobras(p_exercicio int, p_cotas jsonb, p_aprovado_em date, p_ata text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.fin_sobras; eu text; d text;
begin
  if not public.is_tesouraria() then raise exception 'Só a tesouraria lança a apuração das sobras.'; end if;
  select * into s from public.fin_sobras where exercicio = p_exercicio for update;
  if not found then raise exception 'Apuração não encontrada.'; end if;
  if s.status <> 'rascunho' then raise exception 'Esta apuração já foi lançada.'; end if;
  if p_aprovado_em is null then raise exception 'Informe a data da Assembleia Geral que aprovou a destinação.'; end if;
  if abs(coalesce((select sum((x->>'rateio')::numeric) from jsonb_array_elements(p_cotas) x), 0) - s.rateio) > 0.05
     or abs(coalesce((select sum((x->>'aposentadoria')::numeric) from jsonb_array_elements(p_cotas) x), 0) - s.aposentadoria) > 0.05 then
    raise exception 'As cotas dos cooperados não fecham com o total da apuração. Recarregue a página e tente de novo.';
  end if;
  eu := (select nome from public.perfis where id = auth.uid());
  d := 'Sobras do exercício ' || p_exercicio;
  insert into public.fin_sobras_cotas (exercicio, fin_cooperado_id, nome, horas, rateio, aposentadoria)
  select p_exercicio, (x->>'fin_cooperado_id')::uuid, x->>'nome', coalesce((x->>'horas')::numeric, 0), coalesce((x->>'rateio')::numeric, 0), coalesce((x->>'aposentadoria')::numeric, 0)
    from jsonb_array_elements(p_cotas) x;
  insert into public.fin_fundos_mov (fundo, data, valor, descricao, exercicio, registrado_nome)
  select f, p_aprovado_em, v, d, p_exercicio, eu from (values
    ('reserva', s.reserva), ('fates', s.fates), ('soberania', s.soberania), ('fei', s.fei_publicas + s.fei_mercado),
    ('aposentadoria', s.aposentadoria), ('apoio', s.apoio)) t(f, v) where v > 0;
  perform set_config('bimcore.rpc_sobras', 'sim', true);
  update public.fin_sobras set status = 'lancada', aprovado_em = p_aprovado_em, ata = nullif(trim(p_ata), ''), lancado_nome = eu, lancado_em = now() where exercicio = p_exercicio;
  perform set_config('bimcore.rpc_sobras', '', true);
end;
$$;

-- Estornar (corrigir erro): só enquanto o rateio não foi pago
create or replace function public.estornar_sobras(p_exercicio int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.fin_sobras;
begin
  if not public.is_tesouraria() then raise exception 'Só a tesouraria estorna a apuração.'; end if;
  select * into s from public.fin_sobras where exercicio = p_exercicio for update;
  if not found or s.status <> 'lancada' then raise exception 'Esta apuração não está lançada.'; end if;
  if s.rateio_pago_em is not null then raise exception 'O rateio já foi pago. Desfaça o pagamento antes de estornar.'; end if;
  delete from public.fin_fundos_mov where exercicio = p_exercicio;
  delete from public.fin_sobras_cotas where exercicio = p_exercicio;
  perform set_config('bimcore.rpc_sobras', 'sim', true);
  update public.fin_sobras set status = 'rascunho', lancado_nome = null, lancado_em = null where exercicio = p_exercicio;
  perform set_config('bimcore.rpc_sobras', '', true);
end;
$$;

-- Pagamento do rateio aos cooperados (p_data nulo desfaz)
create or replace function public.pagar_rateio_sobras(p_exercicio int, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare s public.fin_sobras;
begin
  if not public.is_tesouraria() then raise exception 'Só a tesouraria registra o pagamento do rateio.'; end if;
  select * into s from public.fin_sobras where exercicio = p_exercicio for update;
  if not found or s.status <> 'lancada' then raise exception 'Lance a apuração antes de pagar o rateio.'; end if;
  perform set_config('bimcore.rpc_sobras', 'sim', true);
  update public.fin_sobras set rateio_pago_em = p_data,
    rateio_pago_nome = case when p_data is null then null else (select nome from public.perfis where id = auth.uid()) end
    where exercicio = p_exercicio;
  perform set_config('bimcore.rpc_sobras', '', true);
  update public.fin_sobras_cotas set pago_em = p_data where exercicio = p_exercicio;
end;
$$;

grant execute on function public.lancar_sobras(int, jsonb, date, text) to authenticated;
grant execute on function public.estornar_sobras(int) to authenticated;
grant execute on function public.pagar_rateio_sobras(int, date) to authenticated;

select 'migracao 019 ok' as resultado;
