-- =====================================================================
-- BIMCORE — migração 050: modelos (templates) do BIMCORE Edificações
-- Modelos de projeto por disciplina e tipo de projeto, publicados pela
-- coordenação e baixados pelos cooperados. Os arquivos ficam no bucket
-- privado "programa", que também guarda os pacotes de atualização.
-- =====================================================================

create table if not exists public.programa_modelos (
  id           uuid primary key default gen_random_uuid(),
  disciplina   text not null check (char_length(disciplina) between 2 and 60),
  tipo_projeto text not null default 'Todos os tipos' check (char_length(tipo_projeto) between 2 and 80),
  nome         text not null check (char_length(nome) between 2 and 150),
  descricao    text,
  versao       text,
  caminho      text not null,
  nome_arquivo text not null,
  tamanho      bigint,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.programa_modelos enable row level security;
drop policy if exists progm_ver on public.programa_modelos;
create policy progm_ver on public.programa_modelos for select to authenticated
  using ((ativo and public.is_ativo()) or public.is_coordenacao());
drop policy if exists progm_gerir on public.programa_modelos;
create policy progm_gerir on public.programa_modelos for all to authenticated
  using (public.is_coordenacao()) with check (public.is_coordenacao());

-- versões podem apontar para um link externo (instalador no Drive) ou para um arquivo do bucket (atualizações)
alter table public.programa_versoes add column if not exists caminho text;
alter table public.programa_versoes alter column url drop not null;
alter table public.programa_versoes drop constraint if exists programa_versoes_destino;
alter table public.programa_versoes add constraint programa_versoes_destino check (url is not null or caminho is not null);

insert into storage.buckets (id, name, public, file_size_limit)
values ('programa', 'programa', false, 52428800)
on conflict (id) do nothing;
drop policy if exists prog_arq_ver on storage.objects;
create policy prog_arq_ver on storage.objects for select to authenticated
  using (bucket_id = 'programa' and (public.is_ativo() or public.is_coordenacao()));
drop policy if exists prog_arq_enviar on storage.objects;
create policy prog_arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'programa' and public.is_coordenacao());
drop policy if exists prog_arq_apagar on storage.objects;
create policy prog_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'programa' and public.is_coordenacao());

grant select, insert, update, delete on public.programa_modelos to authenticated;
grant select, insert, update, delete on public.programa_modelos to service_role;
