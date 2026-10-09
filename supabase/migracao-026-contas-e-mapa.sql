-- =====================================================================
-- BIMCORE — migração 026: contas bancárias, contas a pagar e mapa do dinheiro
-- Estatuto: art. 23, §8º (os 20% em conta específica); FIC em conta segregada
-- do patrimônio social; fundos aplicados em baixo risco e alta liquidez (art. 72, §2º).
-- A tesouraria informa o saldo de cada conta; o site separa o que está
-- comprometido (FIC, fundos, provisões, guias, retiradas, contas a pagar) do que
-- está livre, e publica um retrato para todos os cooperados (transparência).
-- =====================================================================

create table if not exists public.fin_contas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  tipo       text not null check (tipo in ('movimento', 'custo_op', 'fic', 'aplicacao', 'outra')),
  banco      text,
  finalidade text,
  ativa      boolean not null default true,
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);
create table if not exists public.fin_contas_saldos (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references public.fin_contas(id) on delete cascade,
  data            date not null,
  saldo           numeric(14,2) not null,
  observacao      text,
  registrado_nome text,
  criado_em       timestamptz not null default now()
);
create table if not exists public.fin_contas_pagar (
  id              uuid primary key default gen_random_uuid(),
  descricao       text not null check (char_length(descricao) between 3 and 200),
  categoria       text,
  fornecedor      text,
  valor           numeric(14,2) not null check (valor >= 0),
  vencimento      date not null,
  recorrencia     text not null default 'unica' check (recorrencia in ('unica', 'mensal', 'anual')),
  conta_id        uuid references public.fin_contas(id) on delete set null,
  status          text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  pago_em         date,
  valor_pago      numeric(14,2),
  despesa_id      uuid,
  observacao      text,
  registrado_nome text,
  criado_em       timestamptz not null default now()
);
create table if not exists public.fin_mapa (
  id          bigint generated always as identity primary key,
  dados       jsonb not null,
  gerado_nome text,
  gerado_em   timestamptz not null default now()
);

alter table public.fin_contas enable row level security;
alter table public.fin_contas_saldos enable row level security;
alter table public.fin_contas_pagar enable row level security;
alter table public.fin_mapa enable row level security;

drop policy if exists fcontas_ver on public.fin_contas;
create policy fcontas_ver on public.fin_contas for select to authenticated using (public.is_ativo() or public.is_fiscal());
drop policy if exists fcontas_gerir on public.fin_contas;
create policy fcontas_gerir on public.fin_contas for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());
drop policy if exists fcsal_ver on public.fin_contas_saldos;
create policy fcsal_ver on public.fin_contas_saldos for select to authenticated using (public.pode_ver_fin() or public.is_coordenacao());
drop policy if exists fcsal_gerir on public.fin_contas_saldos;
create policy fcsal_gerir on public.fin_contas_saldos for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());
drop policy if exists fpagar_ver on public.fin_contas_pagar;
create policy fpagar_ver on public.fin_contas_pagar for select to authenticated using (public.pode_ver_fin() or public.is_coordenacao());
drop policy if exists fpagar_gerir on public.fin_contas_pagar;
create policy fpagar_gerir on public.fin_contas_pagar for all to authenticated using (public.is_tesouraria()) with check (public.is_tesouraria());
drop policy if exists fmapa_ver on public.fin_mapa;
create policy fmapa_ver on public.fin_mapa for select to authenticated using (public.is_ativo() or public.is_fiscal());
drop policy if exists fmapa_publicar on public.fin_mapa;
create policy fmapa_publicar on public.fin_mapa for insert to authenticated with check (public.is_tesouraria());

create or replace function public.nome_registro_fin() returns trigger language plpgsql security definer set search_path = public as $$
begin new.registrado_nome := (select nome from public.perfis where id = auth.uid()); return new; end; $$;
drop trigger if exists nome_fcsal on public.fin_contas_saldos;
create trigger nome_fcsal before insert on public.fin_contas_saldos for each row execute function public.nome_registro_fin();
drop trigger if exists nome_fpagar on public.fin_contas_pagar;
create trigger nome_fpagar before insert on public.fin_contas_pagar for each row execute function public.nome_registro_fin();
create or replace function public.nome_mapa() returns trigger language plpgsql security definer set search_path = public as $$
begin new.gerado_nome := (select nome from public.perfis where id = auth.uid()); new.gerado_em := now();
  delete from public.fin_mapa where id not in (select id from public.fin_mapa order by gerado_em desc limit 60);
  return new; end; $$;
drop trigger if exists nome_mapa on public.fin_mapa;
create trigger nome_mapa before insert on public.fin_mapa for each row execute function public.nome_mapa();

-- saldo da conta movimento continua alimentando o caixa livre das retiradas
create or replace function public.saldo_movimento_caixa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select tipo from public.fin_contas where id = new.conta_id) = 'movimento' then
    insert into public.fin_saldos (data, saldo, observacao, registrado_nome)
    values (new.data, (select coalesce(sum(s.saldo), 0) from public.fin_contas c
                        join lateral (select saldo from public.fin_contas_saldos x where x.conta_id = c.id and x.data <= new.data order by x.data desc, x.criado_em desc limit 1) s on true
                       where c.tipo = 'movimento' and c.ativa),
            'Registrado em Contas e caixa', new.registrado_nome);
  end if;
  return new;
end;
$$;
drop trigger if exists saldo_movimento_caixa on public.fin_contas_saldos;
create trigger saldo_movimento_caixa after insert on public.fin_contas_saldos for each row execute function public.saldo_movimento_caixa();

select 'migracao 026 ok' as resultado;
