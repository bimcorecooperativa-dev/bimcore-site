-- =====================================================================
-- BIMCORE — migração 007: sistema financeiro no site (etapa 1)
-- A tesouraria lança despesas, pagamentos, aportes e contribuições
-- direto no site. O site calcula a posição de cada cooperado pelo
-- Estatuto (mesma lógica da planilha) e exporta para Excel.
-- Enquanto fin_parametros.modo = 'planilha', nada muda para ninguém.
-- =====================================================================

create table if not exists public.fin_parametros (
  id              int primary key default 1 check (id = 1),
  quota           numeric(14,2) not null default 50,
  quotas_minimas  int not null default 10,
  contrib_inicio  date not null default '2026-04-01',
  fechamento      date,                       -- vazio = mês atual
  modo            text not null default 'planilha' check (modo in ('planilha', 'sistema')),
  atualizado_em   timestamptz not null default now(),
  atualizado_nome text
);
insert into public.fin_parametros (id) values (1) on conflict (id) do nothing;

create table if not exists public.fin_cooperados (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  email                  text,
  perfil_id              uuid unique references public.perfis(id) on delete set null,
  cargo                  text,
  quotas_iniciais        int not null default 10,
  integralizado_admissao numeric(14,2) not null default 0,
  data_admissao          date,
  situacao               text not null default 'ativo' check (situacao in ('ativo', 'desligado')),
  data_desligamento      date,
  compensar_aportes      boolean not null default false,
  observacao             text,
  criado_em              timestamptz not null default now()
);

create table if not exists public.fin_despesas (
  id            uuid primary key default gen_random_uuid(),
  data          date,
  descricao     text not null,
  categoria     text,
  valor         numeric(14,2) not null check (valor > 0),
  cobrar        boolean not null default false,
  participantes uuid[] not null default '{}',
  observacao    text,
  criado_nome   text,
  criado_em     timestamptz not null default now()
);

alter table public.financeiro_movimentos add column if not exists lancado boolean not null default false;

create table if not exists public.fin_pagamentos (
  id               uuid primary key default gen_random_uuid(),
  data             date,
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  tipo             text not null check (tipo in ('despesa', 'aporte', 'contribuicao', 'integralizacao', 'abatimento', 'chamada')),
  despesa_id       uuid references public.fin_despesas(id) on delete restrict,
  mes_ref          date,
  valor            numeric(14,2) not null check (valor > 0),
  observacao       text,
  origem           text not null default 'tesouraria' check (origem in ('tesouraria', 'pix', 'abatimento', 'planilha')),
  movimento_id     uuid references public.financeiro_movimentos(id) on delete cascade,
  criado_nome      text,
  criado_em        timestamptz not null default now()
);
create index if not exists fin_pag_coop_idx on public.fin_pagamentos (fin_cooperado_id);

-- ---------- acesso ----------
alter table public.fin_parametros enable row level security;
alter table public.fin_cooperados enable row level security;
alter table public.fin_despesas   enable row level security;
alter table public.fin_pagamentos enable row level security;

drop policy if exists finpar_ver on public.fin_parametros;
create policy finpar_ver on public.fin_parametros for select to authenticated using (true);
drop policy if exists finpar_tes on public.fin_parametros;
create policy finpar_tes on public.fin_parametros for update to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

drop policy if exists fincoop_ver on public.fin_cooperados;
create policy fincoop_ver on public.fin_cooperados for select to authenticated using (public.is_tesouraria() or perfil_id = auth.uid());
drop policy if exists fincoop_tes on public.fin_cooperados;
create policy fincoop_tes on public.fin_cooperados for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

drop policy if exists findesp_tes on public.fin_despesas;
create policy findesp_tes on public.fin_despesas for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

drop policy if exists finpag_ver on public.fin_pagamentos;
create policy finpag_ver on public.fin_pagamentos for select to authenticated
  using (public.is_tesouraria() or exists (select 1 from public.fin_cooperados c where c.id = fin_cooperado_id and c.perfil_id = auth.uid()));
drop policy if exists finpag_tes on public.fin_pagamentos;
create policy finpag_tes on public.fin_pagamentos for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

-- ---------- extrato do próprio cooperado (só os dados dele) ----------
create or replace function public.meu_extrato() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select * from public.fin_cooperados where perfil_id = auth.uid() limit 1),
  pg as (select p.* from public.fin_pagamentos p join me on me.id = p.fin_cooperado_id)
  select jsonb_build_object(
    'parametros', (select to_jsonb(x) from public.fin_parametros x where id = 1),
    'cooperado',  (select to_jsonb(me) from me),
    'pagamentos', coalesce((select jsonb_agg(to_jsonb(pg) order by pg.data nulls last, pg.criado_em) from pg), '[]'::jsonb),
    'despesas',   coalesce((select jsonb_agg(jsonb_build_object(
                     'id', d.id, 'data', d.data, 'descricao', d.descricao, 'valor', d.valor, 'cobrar', d.cobrar,
                     'n_participantes', cardinality(d.participantes),
                     'participantes', case when me.id = any(d.participantes) then array[me.id] else '{}'::uuid[] end))
                   from public.fin_despesas d, me
                   where (d.cobrar and me.id = any(d.participantes)) or d.id in (select despesa_id from pg where despesa_id is not null)), '[]'::jsonb)
  );
$$;
grant execute on function public.meu_extrato() to authenticated;

-- ---------- vínculo automático entre conta do site e cadastro financeiro ----------
create or replace function public.vincular_fin_cooperado(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.perfis; c uuid;
begin
  if exists (select 1 from public.fin_cooperados where perfil_id = p_id) then return; end if;
  select * into p from public.perfis where id = p_id; if not found then return; end if;
  select id into c from public.fin_cooperados
   where perfil_id is null and ((coalesce(email, '') <> '' and lower(trim(email)) = lower(trim(p.email))) or public.nomes_combinam(nome, p.nome))
   order by (coalesce(email, '') <> '' and lower(trim(email)) = lower(trim(p.email))) desc, (public.nome_normalizado(nome) = public.nome_normalizado(p.nome)) desc
   limit 1;
  if c is not null then update public.fin_cooperados set perfil_id = p_id, email = coalesce(nullif(email, ''), p.email) where id = c; end if;
end $$;
revoke execute on function public.vincular_fin_cooperado(uuid) from public, anon, authenticated;

create or replace function public.ao_mudar_perfil_fin() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.vincular_fin_cooperado(new.id); return new; end $$;
drop trigger if exists vincular_fin on public.perfis;
create trigger vincular_fin after insert or update of nome, email, status on public.perfis
  for each row execute function public.ao_mudar_perfil_fin();

create or replace function public.ao_mudar_fin_cooperado() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.perfil_id is null then
    for p in select id from public.perfis where id not in (select perfil_id from public.fin_cooperados where perfil_id is not null) loop
      perform public.vincular_fin_cooperado(p.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists fin_coop_vincular on public.fin_cooperados;
create trigger fin_coop_vincular after insert or update of nome, email on public.fin_cooperados
  for each row execute function public.ao_mudar_fin_cooperado();

-- ---------- Pix confirmado e abatimento viram lançamentos do sistema ----------
create or replace function public.lancar_movimento() returns trigger
language plpgsql security definer set search_path = public as $$
declare c uuid; a jsonb; quando date;
begin
  if new.status <> 'confirmado' or new.lancado then return new; end if;
  if (select modo from public.fin_parametros where id = 1) <> 'sistema' then return new; end if;
  select id into c from public.fin_cooperados where perfil_id = new.cooperado_id;
  if c is null then return new; end if;
  quando := (coalesce(new.decidido_em, now()) at time zone 'America/Sao_Paulo')::date;
  for a in select * from jsonb_array_elements(new.alocacao) loop
    insert into public.fin_pagamentos (data, fin_cooperado_id, tipo, mes_ref, valor, observacao, origem, movimento_id, criado_nome)
    values (quando, c,
      case a->>'destino' when 'integralizacao' then (case when new.tipo = 'pix' then 'integralizacao' else 'abatimento' end)
                         when 'contribuicao' then 'contribuicao' else 'chamada' end,
      case when a->>'destino' = 'contribuicao' then coalesce(((a->>'mes') || '-01')::date, date_trunc('month', quando)::date) end,
      (a->>'valor')::numeric,
      case when new.tipo = 'pix' then 'Pix BIMC' || new.codigo else 'Abatimento com aportes feito no site' end,
      case when new.tipo = 'pix' then 'pix' else 'abatimento' end, new.id, new.decidido_nome);
  end loop;
  update public.financeiro_movimentos set lancado = true where id = new.id;
  return new;
end $$;
drop trigger if exists lancar_mov on public.financeiro_movimentos;
create trigger lancar_mov after insert or update of status on public.financeiro_movimentos
  for each row execute function public.lancar_movimento();

-- ---------- saldos para o abatimento, no modo sistema ----------
create or replace function public.saldos_para_abatimento(p_id uuid)
returns table (aportes numeric, falta_inicial numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  modo text; c public.fin_cooperados; quota numeric;
  j numeric; k numeric; ap numeric; ab numeric; pix numeric; comp numeric; ac numeric; reserv numeric; base numeric;
begin
  select x.modo, x.quota into modo, quota from public.fin_parametros x where id = 1;
  if modo = 'sistema' then
    select * into c from public.fin_cooperados where perfil_id = p_id;
    if not found then return; end if;
    select coalesce(sum(round(d.valor / nullif(cardinality(d.participantes), 0), 2)), 0) into j
      from public.fin_despesas d where d.cobrar and c.id = any(d.participantes);
    select coalesce(sum(p.valor) filter (where p.tipo = 'chamada' or (p.tipo = 'despesa' and d.cobrar)), 0),
           coalesce(sum(p.valor) filter (where p.tipo = 'aporte' or (p.tipo = 'despesa' and coalesce(d.cobrar, false) = false)), 0),
           coalesce(sum(p.valor) filter (where p.tipo = 'integralizacao'), 0),
           coalesce(sum(p.valor) filter (where p.tipo = 'abatimento'), 0)
      into k, ap, pix, comp
      from public.fin_pagamentos p left join public.fin_despesas d on d.id = p.despesa_id
     where p.fin_cooperado_id = c.id;
    ab := ap + greatest(0, k - j);
    base := greatest(0, c.quotas_iniciais * quota - c.integralizado_admissao - pix);
    ac := least(ab, base, case when c.compensar_aportes then ab else 0 end + comp);
    select coalesce(sum((a->>'valor')::numeric), 0) into reserv
      from public.financeiro_movimentos m, jsonb_array_elements(m.alocacao) a
     where m.cooperado_id = p_id and m.status = 'aguardando' and m.tipo = 'pix' and a->>'destino' = 'integralizacao';
    aportes := greatest(0, ab - ac);
    falta_inicial := greatest(0, base - ac - reserv);
    return next; return;
  end if;
  return query
  with pos as (
    select coalesce(outros_creditos, 0) as aportes, coalesce((detalhes->'resumo'->>'falta_inicial')::numeric, 0) as falta
      from public.financeiro_posicoes where cooperado_id = p_id order by data_base desc, criado_em desc limit 1
  ), mov as (
    select coalesce(sum(case when tipo = 'compensacao' and status = 'confirmado' then valor end), 0) as comp,
           coalesce(sum((select coalesce(sum((a->>'valor')::numeric), 0) from jsonb_array_elements(alocacao) a where a->>'destino' = 'integralizacao')), 0) as integ
      from public.financeiro_movimentos
     where cooperado_id = p_id and incorporado_em is null and (status = 'confirmado' or (status = 'aguardando' and tipo = 'pix'))
  )
  select greatest(0, pos.aportes - mov.comp), greatest(0, pos.falta - mov.integ) from pos, mov;
end $$;
revoke execute on function public.saldos_para_abatimento(uuid) from public, anon, authenticated;
