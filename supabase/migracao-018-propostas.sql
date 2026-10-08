-- =====================================================================
-- BIMCORE — migração 018: propostas e sugestões dos cooperados
-- Estatuto, art. 7º, II: todo cooperado pode propor medidas de interesse da
-- cooperativa ao Conselho de Administração, ao Conselho Fiscal ou à Assembleia.
-- Art. 7º, §1º: para ir à Assembleia, a proposta do cooperado é apresentada
-- com 30 dias de antecedência e consta do edital.
-- Art. 28, §1º: 1/5 dos cooperados pode requerer a convocação; o Presidente
-- convoca em até 15 dias (aqui, pelos apoios à proposta).
-- =====================================================================

create table if not exists public.propostas (
  id              uuid primary key default gen_random_uuid(),
  autor_id        uuid not null default auth.uid(),
  autor_nome      text,
  tipo            text not null check (tipo in ('pauta', 'melhoria', 'mudanca')),
  titulo          text not null check (char_length(titulo) between 3 and 200),
  descricao       text not null,
  justificativa   text,
  status          text not null default 'enviada' check (status in ('enviada', 'em_analise', 'aceita', 'incluida', 'arquivada')),
  resposta        text,
  respondido_nome text,
  respondido_em   timestamptz,
  assembleia_id   uuid references public.assembleias(id) on delete set null,
  criado_em       timestamptz not null default now()
);
create table if not exists public.proposta_apoios (
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  perfil_id   uuid not null default auth.uid(),
  nome        text,
  em          timestamptz not null default now(),
  primary key (proposta_id, perfil_id)
);
create table if not exists public.proposta_comentarios (
  id          uuid primary key default gen_random_uuid(),
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  perfil_id   uuid not null default auth.uid(),
  nome        text,
  texto       text not null check (char_length(texto) between 1 and 2000),
  em          timestamptz not null default now()
);

alter table public.propostas enable row level security;
alter table public.proposta_apoios enable row level security;
alter table public.proposta_comentarios enable row level security;

-- transparência: todos os cooperados ativos veem as propostas, os apoios e a discussão
drop policy if exists prop_ver on public.propostas;
create policy prop_ver on public.propostas for select to authenticated using (public.is_ativo() or public.pode_convocar());
drop policy if exists prop_criar on public.propostas;
create policy prop_criar on public.propostas for insert to authenticated
  with check (public.is_ativo() and autor_id = auth.uid() and status = 'enviada' and resposta is null);
drop policy if exists prop_editar on public.propostas;
create policy prop_editar on public.propostas for update to authenticated
  using ((autor_id = auth.uid() and status = 'enviada') or public.pode_convocar())
  with check ((autor_id = auth.uid() and status = 'enviada') or public.pode_convocar());
drop policy if exists prop_apagar on public.propostas;
create policy prop_apagar on public.propostas for delete to authenticated using (autor_id = auth.uid() and status = 'enviada');

create or replace function public.regras_proposta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.autor_nome := (select nome from public.perfis where id = auth.uid());
    new.criado_em := now();
    return new;
  end if;
  -- o autor corrige o texto; quem avalia muda a situação e responde
  if not public.pode_convocar() then
    new.status := old.status; new.resposta := old.resposta; new.respondido_nome := old.respondido_nome; new.respondido_em := old.respondido_em; new.assembleia_id := old.assembleia_id;
  elsif new.status is distinct from old.status or new.resposta is distinct from old.resposta then
    new.respondido_nome := (select nome from public.perfis where id = auth.uid()); new.respondido_em := now();
  end if;
  new.autor_id := old.autor_id; new.autor_nome := old.autor_nome; new.criado_em := old.criado_em;
  return new;
end;
$$;
drop trigger if exists regras_proposta on public.propostas;
create trigger regras_proposta before insert or update on public.propostas for each row execute function public.regras_proposta();

drop policy if exists apoio_ver on public.proposta_apoios;
create policy apoio_ver on public.proposta_apoios for select to authenticated using (public.is_ativo() or public.pode_convocar());
drop policy if exists apoio_dar on public.proposta_apoios;
create policy apoio_dar on public.proposta_apoios for insert to authenticated
  with check (public.is_ativo() and perfil_id = auth.uid()
              and exists (select 1 from public.propostas p where p.id = proposta_id and p.status <> 'arquivada'));
drop policy if exists apoio_tirar on public.proposta_apoios;
create policy apoio_tirar on public.proposta_apoios for delete to authenticated using (perfil_id = auth.uid());

drop policy if exists pcom_ver on public.proposta_comentarios;
create policy pcom_ver on public.proposta_comentarios for select to authenticated using (public.is_ativo() or public.pode_convocar());
drop policy if exists pcom_criar on public.proposta_comentarios;
create policy pcom_criar on public.proposta_comentarios for insert to authenticated with check (public.is_ativo() and perfil_id = auth.uid());
drop policy if exists pcom_apagar on public.proposta_comentarios;
create policy pcom_apagar on public.proposta_comentarios for delete to authenticated using (perfil_id = auth.uid());

create or replace function public.nome_do_autor() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.nome := (select nome from public.perfis where id = auth.uid()); new.em := now(); return new; end;
$$;
drop trigger if exists nome_apoio on public.proposta_apoios;
create trigger nome_apoio before insert on public.proposta_apoios for each row execute function public.nome_do_autor();
drop trigger if exists nome_comentario on public.proposta_comentarios;
create trigger nome_comentario before insert on public.proposta_comentarios for each row execute function public.nome_do_autor();

select 'migracao 018 ok' as resultado;
