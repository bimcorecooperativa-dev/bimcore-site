-- =====================================================================
-- BIMCORE — migração 044: Formação (cursos indicados em outras plataformas)
-- A coordenação e o CA indicam cursos gratuitos (CapacitaCoop/Sescoop e outros),
-- com prioridade por função (todos, CA, Conselho Fiscal, tesouraria, coordenação).
-- Cada cooperado marca o que está fazendo e o que concluiu (com o link do
-- certificado, se quiser). Educação cooperativista: Regimento, Título XIII e art. 118.
-- =====================================================================

create table if not exists public.cursos_indicados (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (char_length(titulo) between 3 and 200),
  plataforma    text,
  link          text not null check (link ~ '^https?://'),
  descricao     text,
  carga_horaria text,
  tema          text,
  publicos      text[] not null default '{todos}',      -- todos, ca, cf, tesouraria, coordenacao
  prioridade    int not null default 2 check (prioridade between 1 and 3),   -- 1 essencial, 2 recomendado, 3 complementar
  ordem         int not null default 100,
  ativo         boolean not null default true,
  criado_nome   text,
  criado_em     timestamptz not null default now()
);
alter table public.cursos_indicados enable row level security;
drop policy if exists cursos_ver on public.cursos_indicados;
create policy cursos_ver on public.cursos_indicados for select to authenticated using (public.is_ativo() or public.is_coordenacao());
drop policy if exists cursos_gerir on public.cursos_indicados;
create policy cursos_gerir on public.cursos_indicados for all to authenticated
  using (public.is_coordenacao() or public.is_ca()) with check (public.is_coordenacao() or public.is_ca());

create table if not exists public.cursos_progresso (
  perfil_id        uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  curso_id         uuid not null references public.cursos_indicados(id) on delete cascade,
  status           text not null check (status in ('fazendo', 'concluido')),
  concluido_em     date,
  certificado_link text check (certificado_link is null or certificado_link ~ '^https?://'),
  atualizado_em    timestamptz not null default now(),
  primary key (perfil_id, curso_id)
);
alter table public.cursos_progresso enable row level security;
drop policy if exists cprog_proprio on public.cursos_progresso;
create policy cprog_proprio on public.cursos_progresso for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and public.is_ativo());
drop policy if exists cprog_gestao on public.cursos_progresso;
create policy cprog_gestao on public.cursos_progresso for select to authenticated using (public.is_coordenacao() or public.is_ca());

create or replace function public.curso_carimbo() returns trigger language plpgsql security definer set search_path = public as $$
begin new.criado_nome := coalesce(new.criado_nome, (select nome from public.perfis where id = auth.uid())); return new; end; $$;
drop trigger if exists curso_carimbo on public.cursos_indicados;
create trigger curso_carimbo before insert on public.cursos_indicados for each row execute function public.curso_carimbo();

-- primeiras indicações (CapacitaCoop, cursos gratuitos do Sistema OCB/Sescoop, com certificado)
insert into public.cursos_indicados (titulo, plataforma, link, descricao, carga_horaria, tema, publicos, prioridade, ordem, criado_nome)
select * from (values
  ('Fundamentos do Cooperativismo', 'CapacitaCoop (via WhatsApp)', 'https://capacita.coop.br/cursos-whatsapp/fundamentos-do-cooperativismo', 'Os princípios e valores do cooperativismo, em aulas curtas pelo WhatsApp. Bom primeiro passo para quem está chegando.', '30 min', 'Cooperativismo', '{todos}'::text[], 1, 10, 'Indicação inicial'),
  ('Entendendo a Sociedade Cooperativa', 'CapacitaCoop', 'https://capacita.coop.br/cursos-studion/entendendo-a-sociedade-cooperativa', 'Como a cooperativa funciona: cooperado, assembleia, órgãos de administração e fiscalização, capital e sobras.', '10 h', 'Cooperativismo', '{todos}'::text[], 1, 20, 'Indicação inicial'),
  ('História, Memória e Cultura Cooperativista', 'CapacitaCoop (trilha)', 'https://capacita.coop.br/jornadas-studion/historia-memoria-e-cultura-cooperativista', 'De onde vem o cooperativismo e por que ele é diferente de uma empresa comum.', '9 h', 'Cooperativismo', '{todos}'::text[], 2, 30, 'Indicação inicial'),
  ('Noções Contábeis e Tributárias das Cooperativas', 'CapacitaCoop (via WhatsApp)', 'https://capacita.coop.br/cursos-whatsapp/nocoes-contabeis-e-tributarias-das-cooperativas', 'Ato cooperativo, sobras, fundos e tributos: o básico para entender a prestação de contas.', '30 min', 'Gestão e finanças', '{tesouraria,cf,ca}'::text[], 1, 40, 'Indicação inicial'),
  ('Governança Cooperativa: Princípios e Boas Práticas', 'CapacitaCoop', 'https://capacita.coop.br/', 'Papéis da assembleia, do Conselho de Administração e do Conselho Fiscal, e boas práticas de governança. Procure o curso pelo nome na plataforma.', '', 'Governança', '{ca,cf,coordenacao}'::text[], 1, 50, 'Indicação inicial'),
  ('Como Constituir uma Cooperativa', 'CapacitaCoop (via WhatsApp)', 'https://capacita.coop.br/cursos-whatsapp/como-constituir-uma-cooperativa', 'Passo a passo da formação de uma cooperativa. Útil para quem participa da expansão da rede (FEI).', '30 min', 'Cooperativismo', '{coordenacao,ca}'::text[], 3, 60, 'Indicação inicial')
) v(titulo, plataforma, link, descricao, carga_horaria, tema, publicos, prioridade, ordem, criado_nome)
where not exists (select 1 from public.cursos_indicados);

select 'migracao 044 ok' as resultado;
