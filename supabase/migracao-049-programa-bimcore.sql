-- =====================================================================
-- BIMCORE — migração 049: Programa BIMCORE Edificações
-- Os cooperados baixam o programa (instalador e atualizações publicados pela
-- coordenação) e relatam erros e problemas, com prints. A coordenação acompanha,
-- responde e marca a versão em que o problema foi corrigido.
-- =====================================================================

create table if not exists public.programa_versoes (
  id           uuid primary key default gen_random_uuid(),
  versao       text not null check (char_length(versao) between 1 and 30),
  tipo         text not null default 'instalador' check (tipo in ('instalador', 'atualizacao')),
  url          text not null check (url like 'https://%'),
  tamanho      bigint,
  notas        text,
  publicado_em timestamptz not null default now()
);
alter table public.programa_versoes enable row level security;
drop policy if exists progv_ver on public.programa_versoes;
create policy progv_ver on public.programa_versoes for select to authenticated using (public.is_ativo() or public.is_coordenacao());
drop policy if exists progv_gerir on public.programa_versoes;
create policy progv_gerir on public.programa_versoes for all to authenticated
  using (public.is_coordenacao()) with check (public.is_coordenacao());

create table if not exists public.programa_relatos (
  id               uuid primary key default gen_random_uuid(),
  protocolo        text unique,
  autor_id         uuid references public.perfis(id) on delete set null,
  autor_nome       text,
  tipo             text not null check (tipo in ('erro', 'problema', 'sugestao')),
  gravidade        text not null default 'atrapalha' check (gravidade in ('trava', 'impede', 'atrapalha', 'detalhe')),
  titulo           text not null check (char_length(titulo) between 3 and 150),
  descricao        text not null check (char_length(descricao) between 3 and 5000),
  passos           text check (passos is null or char_length(passos) <= 5000),
  versao           text,
  modulo           text,
  status           text not null default 'recebido'
                   check (status in ('recebido', 'em_analise', 'em_correcao', 'corrigido', 'nao_reproduzido', 'duplicado', 'recusado')),
  resposta         text,
  versao_corrigida text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists programa_relatos_status on public.programa_relatos (status, criado_em);
alter table public.programa_relatos enable row level security;

-- quem envia é o próprio cooperado; protocolo, autor e situação inicial vêm do banco
create or replace function public.programa_relato_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := auth.uid();
  new.autor_nome := (select nome from public.perfis where id = auth.uid());
  new.protocolo := 'BP-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4));
  new.status := 'recebido';
  new.resposta := null;
  new.versao_corrigida := null;
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists programa_relato_carimbo on public.programa_relatos;
create trigger programa_relato_carimbo before insert on public.programa_relatos for each row execute function public.programa_relato_carimbo();

drop policy if exists progr_enviar on public.programa_relatos;
create policy progr_enviar on public.programa_relatos for insert to authenticated
  with check (public.is_ativo() or public.is_coordenacao());
drop policy if exists progr_ver on public.programa_relatos;
create policy progr_ver on public.programa_relatos for select to authenticated
  using (autor_id = auth.uid() or public.is_coordenacao());
drop policy if exists progr_atualizar on public.programa_relatos;
create policy progr_atualizar on public.programa_relatos for update to authenticated
  using (public.is_coordenacao()) with check (public.is_coordenacao());

-- prints e arquivos do relato (imagens pequenas guardadas no próprio banco; até 3 por relato)
create table if not exists public.programa_relato_anexos (
  id        uuid primary key default gen_random_uuid(),
  relato_id uuid not null references public.programa_relatos(id) on delete cascade,
  nome      text not null,
  tipo      text not null,
  tamanho   int not null check (tamanho > 0 and tamanho <= 3145728),
  dados     text not null,
  criado_em timestamptz not null default now()
);
alter table public.programa_relato_anexos enable row level security;
drop policy if exists progra_enviar on public.programa_relato_anexos;
create policy progra_enviar on public.programa_relato_anexos for insert to authenticated
  with check (exists (select 1 from public.programa_relatos r where r.id = relato_id and r.autor_id = auth.uid())
              and (select count(*) from public.programa_relato_anexos a where a.relato_id = programa_relato_anexos.relato_id) < 3);
drop policy if exists progra_ver on public.programa_relato_anexos;
create policy progra_ver on public.programa_relato_anexos for select to authenticated
  using (exists (select 1 from public.programa_relatos r where r.id = relato_id and (r.autor_id = auth.uid() or public.is_coordenacao())));
