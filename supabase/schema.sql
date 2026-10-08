-- =====================================================================
-- BIMCORE — banco de dados (Supabase / PostgreSQL)
-- Rode este arquivo inteiro uma única vez em: Supabase > SQL Editor > New query
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null default '',
  email         text not null,
  telefone      text,
  especialidade text,
  papel         text not null default 'cooperado' check (papel in ('cooperado','coordenacao')),
  status        text not null default 'pendente'  check (status in ('pendente','ativo','desligado')),
  data_ingresso date,
  criado_em     timestamptz not null default now()
);

create table if not exists public.projetos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  orgao         text,
  municipio     text,
  modalidade    text,
  status        text not null default 'Prospecção'
                check (status in ('Prospecção','Proposta','Em execução','Concluído','Suspenso')),
  lod           text,
  horas_orcadas numeric(10,2) not null default 0 check (horas_orcadas >= 0),
  valor         numeric(14,2),
  inicio        date,
  fim           date,
  criado_em     timestamptz not null default now()
);

create table if not exists public.producao (
  id           uuid primary key default gen_random_uuid(),
  cooperado_id uuid not null references public.perfis(id) on delete cascade,
  projeto_id   uuid references public.projetos(id) on delete restrict,
  data         date not null,
  horas        numeric(5,2) not null check (horas > 0 and horas <= 12),
  tipo         text not null check (tipo in ('produtiva','formacao','administrativa','ociosidade_estrategica','ociosidade_operacional')),
  descricao    text not null default '',
  criado_em    timestamptz not null default now()
);
create index if not exists producao_cooperado_idx on public.producao (cooperado_id, data desc);
create index if not exists producao_projeto_idx   on public.producao (projeto_id);

create table if not exists public.comunicados (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  corpo        text not null,
  autor_id     uuid references public.perfis(id) on delete set null,
  autor_nome   text,
  publicado_em timestamptz not null default now()
);

create table if not exists public.documentos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  categoria    text not null default 'Outros',
  nome_arquivo text not null,
  tamanho      bigint,
  caminho      text not null unique,
  criado_em    timestamptz not null default now()
);

create table if not exists public.contatos (
  id        uuid primary key default gen_random_uuid(),
  tipo      text not null default 'contato' check (tipo in ('contato','denuncia')),
  nome      text not null default 'Anônimo' check (char_length(nome) between 1 and 120),
  email     text check (char_length(email) <= 160),
  orgao     text check (char_length(orgao) <= 160),
  telefone  text check (char_length(telefone) <= 40),
  mensagem  text not null check (char_length(mensagem) between 1 and 4000),
  lido      boolean not null default false,
  criado_em timestamptz not null default now()
);

-- ---------- Funções de permissão ----------
create or replace function public.is_coordenacao() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'coordenacao' and status = 'ativo');
$$;

create or replace function public.is_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and status = 'ativo');
$$;

-- Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- Impede que um cooperado mude o próprio papel, status ou e-mail
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() nulo = comando rodado pelo painel do Supabase (administrador)
  if auth.uid() is not null and not public.is_coordenacao() then
    new.papel := old.papel;
    new.status := old.status;
    new.email := old.email;
    new.data_ingresso := old.data_ingresso;
  end if;
  if new.status = 'ativo' and new.data_ingresso is null then
    new.data_ingresso := current_date;
  end if;
  return new;
end;
$$;
drop trigger if exists antes_atualizar_perfil on public.perfis;
create trigger antes_atualizar_perfil before update on public.perfis
  for each row execute function public.proteger_perfil();

-- ---------- Segurança por linha (RLS) ----------
alter table public.perfis      enable row level security;
alter table public.projetos    enable row level security;
alter table public.producao    enable row level security;
alter table public.comunicados enable row level security;
alter table public.documentos  enable row level security;
alter table public.contatos    enable row level security;

-- perfis
drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select to authenticated
  using (id = auth.uid() or public.is_coordenacao());
drop policy if exists perfis_editar on public.perfis;
create policy perfis_editar on public.perfis for update to authenticated
  using (id = auth.uid() or public.is_coordenacao())
  with check (id = auth.uid() or public.is_coordenacao());

-- projetos: cooperados ativos leem; coordenação edita
drop policy if exists projetos_ver on public.projetos;
create policy projetos_ver on public.projetos for select to authenticated using (public.is_ativo());
drop policy if exists projetos_gerir on public.projetos;
create policy projetos_gerir on public.projetos for all to authenticated
  using (public.is_coordenacao()) with check (public.is_coordenacao());

-- produção: cada um vê e lança as próprias horas; coordenação vê todas
drop policy if exists producao_ver on public.producao;
create policy producao_ver on public.producao for select to authenticated
  using (cooperado_id = auth.uid() or public.is_coordenacao());
drop policy if exists producao_lancar on public.producao;
create policy producao_lancar on public.producao for insert to authenticated
  with check (cooperado_id = auth.uid() and public.is_ativo());
drop policy if exists producao_editar on public.producao;
create policy producao_editar on public.producao for update to authenticated
  using (cooperado_id = auth.uid() or public.is_coordenacao())
  with check (cooperado_id = auth.uid() or public.is_coordenacao());
drop policy if exists producao_excluir on public.producao;
create policy producao_excluir on public.producao for delete to authenticated
  using (cooperado_id = auth.uid() or public.is_coordenacao());

-- comunicados
drop policy if exists comunicados_ver on public.comunicados;
create policy comunicados_ver on public.comunicados for select to authenticated using (public.is_ativo());
drop policy if exists comunicados_gerir on public.comunicados;
create policy comunicados_gerir on public.comunicados for all to authenticated
  using (public.is_coordenacao()) with check (public.is_coordenacao());

-- documentos
drop policy if exists documentos_ver on public.documentos;
create policy documentos_ver on public.documentos for select to authenticated using (public.is_ativo());
drop policy if exists documentos_gerir on public.documentos;
create policy documentos_gerir on public.documentos for all to authenticated
  using (public.is_coordenacao()) with check (public.is_coordenacao());

-- contatos: qualquer visitante envia; só a coordenação lê
drop policy if exists contatos_enviar on public.contatos;
create policy contatos_enviar on public.contatos for insert to anon, authenticated with check (lido = false);
drop policy if exists contatos_ver on public.contatos;
create policy contatos_ver on public.contatos for select to authenticated using (public.is_coordenacao());
drop policy if exists contatos_marcar on public.contatos;
create policy contatos_marcar on public.contatos for update to authenticated
  using (public.is_coordenacao()) with check (public.is_coordenacao());

-- ---------- Armazenamento de arquivos ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 52428800)
on conflict (id) do nothing;

drop policy if exists docs_baixar on storage.objects;
create policy docs_baixar on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.is_ativo());
drop policy if exists docs_enviar on storage.objects;
create policy docs_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.is_coordenacao());
drop policy if exists docs_apagar on storage.objects;
create policy docs_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.is_coordenacao());

-- =====================================================================
-- DEPOIS do primeiro cadastro do presidente no site, rode só a linha
-- abaixo (trocando o e-mail) para torná-lo coordenação:
--
-- update public.perfis set papel = 'coordenacao', status = 'ativo'
-- where email = 'seu-email@exemplo.com';
-- =====================================================================
