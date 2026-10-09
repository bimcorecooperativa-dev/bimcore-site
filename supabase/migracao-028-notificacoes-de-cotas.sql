-- =====================================================================
-- BIMCORE — migração 028: notificação automática de cotas mensais atrasadas
-- Quitar cotas atrasadas na retirada é opcional. A partir da 2ª retirada paga,
-- se o cooperado tiver cotas vencidas em aberto e a retirada não quitar nenhuma,
-- o site registra uma notificação. Ela NÃO é advertência: a advertência escrita
-- só pode ser aplicada pelo CA em processo disciplinar, com prazo de defesa
-- (Estatuto, arts. 15 e 16; Regimento, arts. 26 e 27). O registro serve de prova
-- para o CA agir e para o CF fiscalizar (Estatuto, art. 9º, deveres do cooperado).
-- =====================================================================

alter table public.fin_retiradas add column if not exists atrasadas_valor numeric(14,2);
alter table public.fin_retiradas add column if not exists atrasadas_meses jsonb;   -- ["2026-05", ...] em aberto no pagamento

create table if not exists public.fin_notificacoes (
  id               uuid primary key default gen_random_uuid(),
  fin_cooperado_id uuid not null references public.fin_cooperados(id) on delete cascade,
  retirada_id      uuid references public.fin_retiradas(id) on delete cascade,
  cooperado_nome   text,
  tipo             text not null default 'cotas_atrasadas' check (tipo in ('cotas_atrasadas')),
  numero           int not null,                       -- 1ª, 2ª... notificação deste cooperado
  meses            jsonb,
  valor            numeric(14,2) not null default 0,
  retiradas_pagas  int,
  status           text not null default 'aberta' check (status in ('aberta', 'regularizada', 'processo', 'advertencia', 'arquivada')),
  providencia      text,
  decidido_nome    text,
  decidido_em      timestamptz,
  criado_em        timestamptz not null default now()
);
create index if not exists fin_notif_coop on public.fin_notificacoes (fin_cooperado_id);
alter table public.fin_notificacoes enable row level security;

drop policy if exists fnotif_ver on public.fin_notificacoes;
create policy fnotif_ver on public.fin_notificacoes for select to authenticated
  using (public.e_meu_fin(fin_cooperado_id) or public.is_ca() or public.is_fiscal() or public.is_coordenacao() or public.is_tesouraria());
drop policy if exists fnotif_ca on public.fin_notificacoes;
create policy fnotif_ca on public.fin_notificacoes for update to authenticated
  using (public.is_ca() or public.is_coordenacao()) with check (public.is_ca() or public.is_coordenacao());
-- inserção só pelo gatilho (security definer); ninguém apaga pelo site

create or replace function public.notif_decisao() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- só status, providência e quem decidiu mudam; o fato registrado fica como está
  new.fin_cooperado_id := old.fin_cooperado_id; new.cooperado_nome := old.cooperado_nome; new.retirada_id := old.retirada_id; new.tipo := old.tipo; new.numero := old.numero;
  new.meses := old.meses; new.valor := old.valor; new.retiradas_pagas := old.retiradas_pagas; new.criado_em := old.criado_em;
  new.decidido_nome := (select nome from public.perfis where id = auth.uid()); new.decidido_em := now();
  return new;
end; $$;
drop trigger if exists notif_decisao on public.fin_notificacoes;
create trigger notif_decisao before update on public.fin_notificacoes for each row execute function public.notif_decisao();

create or replace function public.retirada_notifica() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.status = 'paga' and (tg_op = 'INSERT' or old.status is distinct from 'paga') then
    select count(*) into n from public.fin_retiradas where fin_cooperado_id = new.fin_cooperado_id and status = 'paga';
    if n >= 2 and coalesce(new.quitar_valor, 0) = 0 and coalesce(new.atrasadas_valor, 0) > 0 then
      insert into public.fin_notificacoes (fin_cooperado_id, cooperado_nome, retirada_id, numero, meses, valor, retiradas_pagas)
      values (new.fin_cooperado_id, (select nome from public.fin_cooperados where id = new.fin_cooperado_id), new.id,
              (select coalesce(max(numero), 0) + 1 from public.fin_notificacoes where fin_cooperado_id = new.fin_cooperado_id),
              new.atrasadas_meses, new.atrasadas_valor, n);
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'paga' and new.status <> 'paga' then
    -- pagamento desfeito por engano: a notificação ainda não tratada sai junto
    delete from public.fin_notificacoes where retirada_id = new.id and status = 'aberta';
  end if;
  return new;
end;
$$;
drop trigger if exists retirada_notifica on public.fin_retiradas;
create trigger retirada_notifica after insert or update of status on public.fin_retiradas
  for each row execute function public.retirada_notifica();

select 'migracao 028 ok' as resultado;
