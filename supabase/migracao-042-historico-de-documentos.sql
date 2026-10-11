-- =====================================================================
-- BIMCORE — migração 042: aviso de mudanças em Documentos
-- Cada envio, substituição de arquivo ou exclusão de documento fica registrado
-- (quem, quando, título e categoria). O Início de cada cooperado mostra as
-- mudanças desde a última vez que ele abriu Documentos. Avisos só dentro do site.
-- =====================================================================

alter table public.documentos add column if not exists atualizado_em timestamptz;

create table if not exists public.documentos_historico (
  id           uuid primary key default gen_random_uuid(),
  documento_id uuid,
  acao         text not null check (acao in ('enviado', 'substituido', 'excluido', 'editado')),
  titulo       text,
  categoria    text,
  por_nome     text,
  em           timestamptz not null default now()
);
create index if not exists documentos_historico_em on public.documentos_historico (em desc);
alter table public.documentos_historico enable row level security;
drop policy if exists dochist_ver on public.documentos_historico;
create policy dochist_ver on public.documentos_historico for select to authenticated using (public.is_ativo() or public.is_coordenacao());

create or replace function public.documentos_registrar() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem text := (select nome from public.perfis where id = auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.documentos_historico (documento_id, acao, titulo, categoria, por_nome) values (new.id, 'enviado', new.titulo, new.categoria, quem);
  elsif tg_op = 'UPDATE' then
    if new.caminho is distinct from old.caminho then
      insert into public.documentos_historico (documento_id, acao, titulo, categoria, por_nome) values (new.id, 'substituido', new.titulo, new.categoria, quem);
    elsif new.titulo is distinct from old.titulo or new.categoria is distinct from old.categoria then
      insert into public.documentos_historico (documento_id, acao, titulo, categoria, por_nome) values (new.id, 'editado', new.titulo, new.categoria, quem);
    end if;
  else
    insert into public.documentos_historico (documento_id, acao, titulo, categoria, por_nome) values (old.id, 'excluido', old.titulo, old.categoria, quem);
  end if;
  return null;
end;
$$;
drop trigger if exists documentos_registrar on public.documentos;
create trigger documentos_registrar after insert or update or delete on public.documentos
  for each row execute function public.documentos_registrar();

select 'migracao 042 ok' as resultado;
