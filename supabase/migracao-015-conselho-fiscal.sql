-- =====================================================================
-- BIMCORE — migração 015: Conselho Fiscal (Estatuto, arts. 60 e 67;
-- Regimento, arts. 46-47, 82-86 e 170)
-- 1) Perfil "Conselho Fiscal": leitura irrestrita do financeiro (art. 67, §1º),
--    sem poder lançar, pagar ou validar nada.
-- 2) Conferências do CF (saldo em caixa, guias de INSS e IR).
-- 3) Prestação de contas trimestral dos 20%: só é publicada depois da
--    conferência do CF (RI, art. 170).
-- 4) Guias recolhidas pela tesouraria.
-- 5) Inconformidades (RI, art. 85) e relatórios trimestrais (RI, art. 86).
-- 6) Canal de denúncias e reclamações, com opção sigilosa (RI, arts. 46-47).
-- 7) Histórico das correções de horas.
-- =====================================================================

alter table public.perfis add column if not exists conselho_fiscal boolean not null default false;

create or replace function public.is_fiscal() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and status = 'ativo' and conselho_fiscal);
$$;
create or replace function public.pode_ver_fin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_tesouraria() or public.is_fiscal();
$$;
grant execute on function public.is_fiscal() to authenticated;
grant execute on function public.pode_ver_fin() to authenticated;

-- Só a coordenação marca quem é do Conselho Fiscal
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_coordenacao() then
    new.papel := old.papel;
    new.status := old.status;
    new.email := old.email;
    new.data_ingresso := old.data_ingresso;
    new.analise_obs := old.analise_obs;
    new.analisado_em := old.analisado_em;
    new.tesouraria := old.tesouraria;
    new.conselho_fiscal := old.conselho_fiscal;
  end if;
  if new.status is distinct from old.status then
    new.analisado_em := now();
  end if;
  if new.status = 'ativo' and new.data_ingresso is null then
    new.data_ingresso := current_date;
  end if;
  return new;
end;
$$;

-- Leitura para o Conselho Fiscal (as políticas somam com as que já existem)
do $$
declare t text;
begin
  foreach t in array array['perfis', 'producao', 'fin_cooperados', 'fin_despesas', 'fin_pagamentos', 'fin_folha', 'fin_receitas',
                           'fin_habilitacoes', 'fin_experiencias', 'fin_comprovantes', 'fin_retiradas', 'fin_saldos',
                           'financeiro_movimentos', 'financeiro_posicoes', 'financeiro_importacoes'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %1$s_cf_ver on public.%1$s', t);
      execute format('create policy %1$s_cf_ver on public.%1$s for select to authenticated using (public.is_fiscal())', t);
    end if;
  end loop;
end $$;
drop policy if exists cf_arquivos_ver on storage.objects;
create policy cf_arquivos_ver on storage.objects for select to authenticated
  using (bucket_id in ('comprovantes', 'experiencia', 'financeiro') and public.is_fiscal());

-- Horas por mês e experiência interna também para o CF
create or replace function public.horas_mensais()
returns table (fin_cooperado_id uuid, mes date, produtivas numeric, formacao numeric, administrativas numeric, dias bigint)
language sql stable security definer set search_path = public as $$
  select c.id, date_trunc('month', p.data)::date,
         coalesce(sum(p.horas) filter (where p.tipo = 'produtiva'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'formacao'), 0),
         coalesce(sum(p.horas) filter (where p.tipo = 'administrativa'), 0),
         count(distinct p.data) filter (where p.tipo in ('produtiva', 'formacao', 'administrativa'))
    from public.fin_cooperados c
    join public.producao p on p.cooperado_id = c.perfil_id
   where p.tipo in ('produtiva', 'formacao', 'administrativa')
     and (public.pode_validar() or public.is_fiscal() or c.perfil_id = auth.uid())
   group by 1, 2;
$$;
create or replace function public.horas_internas()
returns table (fin_cooperado_id uuid, mes date, horas numeric, origem text)
language sql stable security definer set search_path = public as $$
  with prod as (
    select c.id, date_trunc('month', p.data)::date as mes, sum(p.horas) as h
      from public.fin_cooperados c join public.producao p on p.cooperado_id = c.perfil_id
     where p.tipo in ('produtiva', 'formacao') and (public.pode_validar() or public.is_fiscal() or c.perfil_id = auth.uid())
     group by 1, 2
  ), fol as (
    select f.fin_cooperado_id as id, f.mes, f.horas_produtivas + f.horas_formacao as h
      from public.fin_folha f join public.fin_cooperados c on c.id = f.fin_cooperado_id
     where public.pode_validar() or public.is_fiscal() or c.perfil_id = auth.uid()
  )
  select coalesce(fol.id, prod.id), coalesce(fol.mes, prod.mes), coalesce(fol.h, prod.h),
         case when fol.id is not null then 'fechamento' else 'lancado' end
    from fol full join prod on prod.id = fol.id and prod.mes = fol.mes;
$$;

-- ---------- Conferências do CF (saldo em caixa, guias, mês) ----------
create table if not exists public.fin_conferencias (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('saldo', 'guia', 'mes')),
  ref_id          uuid,
  referencia      text,
  situacao        text not null check (situacao in ('conferido', 'divergente')),
  observacao      text,
  conselheiro_nome text,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now()
);
alter table public.fin_conferencias enable row level security;
drop policy if exists fconf_ver on public.fin_conferencias;
create policy fconf_ver on public.fin_conferencias for select to authenticated using (public.pode_ver_fin() or public.is_coordenacao());
drop policy if exists fconf_cf on public.fin_conferencias;
create policy fconf_cf on public.fin_conferencias for all to authenticated using (public.is_fiscal()) with check (public.is_fiscal());

-- ---------- Guias recolhidas (INSS, IRRF) ----------
create table if not exists public.fin_guias (
  id              uuid primary key default gen_random_uuid(),
  competencia     date not null,
  tipo            text not null check (tipo in ('INSS', 'IRRF', 'Outro')),
  valor           numeric(14,2) not null check (valor >= 0),
  pago_em         date,
  observacao      text,
  registrado_nome text,
  criado_em       timestamptz not null default now()
);
alter table public.fin_guias enable row level security;
drop policy if exists fguia_ver on public.fin_guias;
create policy fguia_ver on public.fin_guias for select to authenticated using (public.pode_ver_fin() or public.is_coordenacao());
drop policy if exists fguia_tes on public.fin_guias;
create policy fguia_tes on public.fin_guias for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());

-- ---------- Prestação de contas trimestral dos 20% ----------
create table if not exists public.fin_prestacoes (
  trimestre       text primary key check (trimestre ~ '^\d{4}-T[1-4]$'),
  dados           jsonb not null,
  status          text not null default 'aguardando_cf' check (status in ('aguardando_cf', 'devolvida', 'conferida', 'publicada')),
  preparado_nome  text,
  preparado_em    timestamptz not null default now(),
  conferido_nome  text,
  conferido_em    timestamptz,
  parecer         text,
  publicado_em    timestamptz
);
alter table public.fin_prestacoes enable row level security;
drop policy if exists fprest_ver on public.fin_prestacoes;
create policy fprest_ver on public.fin_prestacoes for select to authenticated
  using (status = 'publicada' or public.pode_ver_fin() or public.is_coordenacao());
drop policy if exists fprest_criar on public.fin_prestacoes;
create policy fprest_criar on public.fin_prestacoes for insert to authenticated with check (public.is_tesouraria() and status = 'aguardando_cf');
drop policy if exists fprest_editar on public.fin_prestacoes;
create policy fprest_editar on public.fin_prestacoes for update to authenticated
  using (public.is_tesouraria() or public.is_fiscal()) with check (public.is_tesouraria() or public.is_fiscal());

create or replace function public.regras_prestacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare cf boolean := public.is_fiscal(); tes boolean := public.is_tesouraria();
begin
  if old.status = 'publicada' then raise exception 'Prestação já publicada não pode ser alterada.'; end if;
  if cf and not tes then
    -- o CF só confere ou devolve; não mexe nos números nem publica
    new.dados := old.dados; new.preparado_nome := old.preparado_nome; new.preparado_em := old.preparado_em; new.publicado_em := old.publicado_em;
    if new.status not in ('conferida', 'devolvida') then raise exception 'O Conselho Fiscal só pode conferir ou devolver a prestação.'; end if;
    new.conferido_em := now();
  elsif tes and not cf then
    new.conferido_nome := old.conferido_nome; new.conferido_em := old.conferido_em; new.parecer := old.parecer;
    if new.status = 'publicada' then
      if old.status <> 'conferida' then raise exception 'A prestação só pode ser publicada depois da conferência do Conselho Fiscal.'; end if;
      new.dados := old.dados; new.publicado_em := now();
    elsif new.dados is distinct from old.dados then
      -- números refeitos: volta para o CF conferir de novo
      new.status := 'aguardando_cf'; new.conferido_nome := null; new.conferido_em := null; new.parecer := null; new.preparado_em := now();
    elsif new.status in ('conferida', 'devolvida') and new.status is distinct from old.status then
      raise exception 'Só o Conselho Fiscal confere a prestação.';
    end if;
  else
    raise exception 'Quem acumula tesouraria e Conselho Fiscal não pode conferir a própria prestação.';
  end if;
  return new;
end;
$$;
drop trigger if exists regras_prestacao on public.fin_prestacoes;
create trigger regras_prestacao before update on public.fin_prestacoes for each row execute function public.regras_prestacao();

-- ---------- Inconformidades (RI, art. 85) ----------
create table if not exists public.cf_inconformidades (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  descricao       text,
  origem          text,
  status          text not null default 'aberta' check (status in ('aberta', 'arquivada', 'esclarecimento', 'respondida', 'irregularidade')),
  decisao         text,
  decidido_em     timestamptz,
  resposta_ca     text,
  respondido_nome text,
  respondido_em   timestamptz,
  criado_nome     text,
  criado_em       timestamptz not null default now()
);
alter table public.cf_inconformidades enable row level security;
drop policy if exists cfinc_ver on public.cf_inconformidades;
create policy cfinc_ver on public.cf_inconformidades for select to authenticated using (public.is_fiscal() or public.is_coordenacao());
drop policy if exists cfinc_cf on public.cf_inconformidades;
create policy cfinc_cf on public.cf_inconformidades for all to authenticated using (public.is_fiscal()) with check (public.is_fiscal());
drop policy if exists cfinc_ca on public.cf_inconformidades;
create policy cfinc_ca on public.cf_inconformidades for update to authenticated
  using (public.is_coordenacao() and status = 'esclarecimento') with check (public.is_coordenacao());
create or replace function public.regras_inconformidade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_coordenacao() and not public.is_fiscal() then
    -- o Conselho de Administração só responde ao pedido de esclarecimento
    new.titulo := old.titulo; new.descricao := old.descricao; new.origem := old.origem; new.decisao := old.decisao;
    new.decidido_em := old.decidido_em; new.criado_nome := old.criado_nome; new.criado_em := old.criado_em;
    new.status := 'respondida'; new.respondido_em := now();
  end if;
  return new;
end;
$$;
drop trigger if exists regras_inconformidade on public.cf_inconformidades;
create trigger regras_inconformidade before update on public.cf_inconformidades for each row execute function public.regras_inconformidade();

-- ---------- Relatórios trimestrais ao Conselho de Administração (RI, art. 86) ----------
create table if not exists public.cf_relatorios (
  id              uuid primary key default gen_random_uuid(),
  periodo         text not null,
  conclusoes      text not null,
  recomendacoes   text,
  criado_nome     text,
  criado_em       timestamptz not null default now()
);
alter table public.cf_relatorios enable row level security;
drop policy if exists cfrel_ver on public.cf_relatorios;
create policy cfrel_ver on public.cf_relatorios for select to authenticated using (public.is_fiscal() or public.is_coordenacao());
drop policy if exists cfrel_cf on public.cf_relatorios;
create policy cfrel_cf on public.cf_relatorios for all to authenticated using (public.is_fiscal()) with check (public.is_fiscal());

-- ---------- Denúncias e reclamações (RI, arts. 46-47; Estatuto, art. 67, k) ----------
create table if not exists public.cf_denuncias (
  id                   uuid primary key default gen_random_uuid(),
  protocolo            text unique,
  tipo                 text not null check (tipo in ('denuncia', 'reclamacao')),
  sigilosa             boolean not null default false,
  autor_id             uuid,
  autor_nome           text,
  assunto              text not null,
  descricao            text not null,
  envolvidos           text,
  status               text not null default 'recebida' check (status in ('recebida', 'em_apuracao', 'procedente', 'improcedente', 'arquivada')),
  prazo                date,
  prorrogada           boolean not null default false,
  afastamento_proposto boolean not null default false,
  conclusao            text,
  atualizado_em        timestamptz not null default now(),
  criado_em            timestamptz not null default now()
);
alter table public.cf_denuncias enable row level security;
drop policy if exists cfden_criar on public.cf_denuncias;
create policy cfden_criar on public.cf_denuncias for insert to authenticated
  with check (public.is_ativo() and status = 'recebida' and conclusao is null
              and ((sigilosa and autor_id is null and autor_nome is null) or (not sigilosa and autor_id = auth.uid())));
drop policy if exists cfden_ver on public.cf_denuncias;
create policy cfden_ver on public.cf_denuncias for select to authenticated using (public.is_fiscal() or autor_id = auth.uid());
drop policy if exists cfden_cf on public.cf_denuncias;
create policy cfden_cf on public.cf_denuncias for update to authenticated using (public.is_fiscal()) with check (public.is_fiscal());

create or replace function public.nova_denuncia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.protocolo := 'BC-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  new.prazo := (now() at time zone 'America/Sao_Paulo')::date + 30;
  return new;
end;
$$;
drop trigger if exists nova_denuncia on public.cf_denuncias;
create trigger nova_denuncia before insert on public.cf_denuncias for each row execute function public.nova_denuncia();

-- Envio pelo site: devolve o protocolo (inclusive na sigilosa, que não guarda o autor)
create or replace function public.enviar_denuncia(p_tipo text, p_sigilosa boolean, p_assunto text, p_descricao text, p_envolvidos text)
returns text language plpgsql security definer set search_path = public as $$
declare v_prot text;
begin
  if not public.is_ativo() then raise exception 'permission denied'; end if;
  if coalesce(trim(p_assunto), '') = '' or coalesce(trim(p_descricao), '') = '' then raise exception 'Informe o assunto e a descrição.'; end if;
  insert into public.cf_denuncias (tipo, sigilosa, autor_id, autor_nome, assunto, descricao, envolvidos)
  values (p_tipo, coalesce(p_sigilosa, false),
          case when coalesce(p_sigilosa, false) then null else auth.uid() end,
          case when coalesce(p_sigilosa, false) then null else (select nome from public.perfis where id = auth.uid()) end,
          trim(p_assunto), trim(p_descricao), nullif(trim(coalesce(p_envolvidos, '')), ''))
  returning protocolo into v_prot;
  return v_prot;
end;
$$;
grant execute on function public.enviar_denuncia(text, boolean, text, text, text) to authenticated;

-- Quem fez a denúncia sigilosa acompanha só pelo protocolo
create or replace function public.acompanhar_denuncia(p_protocolo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('protocolo', protocolo, 'tipo', tipo, 'assunto', assunto, 'status', status, 'criado_em', criado_em, 'prazo', prazo,
                            'conclusao', case when status in ('procedente', 'improcedente', 'arquivada') then conclusao end)
    from public.cf_denuncias where protocolo = upper(trim(p_protocolo));
$$;
grant execute on function public.acompanhar_denuncia(text) to authenticated;

-- ---------- Histórico de correções de horas ----------
create table if not exists public.producao_historico (
  id           uuid primary key default gen_random_uuid(),
  producao_id  uuid,
  cooperado_id uuid,
  acao         text not null check (acao in ('editado', 'excluido')),
  antes        jsonb,
  depois       jsonb,
  por_id       uuid,
  por_nome     text,
  em           timestamptz not null default now()
);
alter table public.producao_historico enable row level security;
drop policy if exists prodhist_ver on public.producao_historico;
create policy prodhist_ver on public.producao_historico for select to authenticated
  using (cooperado_id = auth.uid() or public.is_coordenacao() or public.is_fiscal());

create or replace function public.registrar_correcao_horas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.producao_historico (producao_id, cooperado_id, acao, antes, depois, por_id, por_nome)
  values (old.id, old.cooperado_id, case when tg_op = 'DELETE' then 'excluido' else 'editado' end,
          to_jsonb(old), case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          auth.uid(), (select nome from public.perfis where id = auth.uid()));
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists registrar_correcao_horas on public.producao;
create trigger registrar_correcao_horas after update or delete on public.producao for each row execute function public.registrar_correcao_horas();

-- Caixa: retirada paga no mesmo dia do saldo, mas depois de registrá-lo, também sai do livre
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
    'pagas_depois', coalesce((select sum(r.valor) from public.fin_retiradas r, s
                               where r.status = 'paga' and (r.pago_em > s.data or (r.pago_em = s.data and r.atualizado_em > s.criado_em))), 0)
  );
$$;

select 'migracao 015 ok' as resultado;
