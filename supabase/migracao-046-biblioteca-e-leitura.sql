-- =====================================================================
-- BIMCORE — migração 046: Biblioteca e cronômetro de leitura
-- A cooperativa oferece livros (PDF/EPUB) só para os cooperados, num depósito
-- privado. O cooperado liga o cronômetro ao começar a ler e para ao terminar,
-- informando a página em que parou. O tempo vira pontos (1 ponto a cada 10 min)
-- e um componente novo do IGCC, "Leitura", com peso 0 até o CA definir por
-- Resolução. Educação cooperativista: 5º princípio, Regimento, Título XIII.
-- Regras contra exagero: o horário vem do servidor; cada sessão conta no máximo
-- 90 min; cada dia conta no máximo 180 min (horário de Brasília).
-- =====================================================================

create table if not exists public.livros (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null check (char_length(titulo) between 2 and 200),
  autor       text,
  tradutor    text,
  ano         text,
  descricao   text,
  tema        text,
  paginas     int check (paginas is null or paginas > 0),
  arquivos    jsonb not null default '{}'::jsonb,     -- {"pdf": "caminho", "epub": "caminho"}
  ordem       int not null default 100,
  ativo       boolean not null default true,
  criado_nome text,
  criado_em   timestamptz not null default now()
);
alter table public.livros enable row level security;
drop policy if exists livros_ver on public.livros;
create policy livros_ver on public.livros for select to authenticated using (public.is_ativo() or public.is_coordenacao());
drop policy if exists livros_gerir on public.livros;
create policy livros_gerir on public.livros for all to authenticated
  using (public.is_coordenacao() or public.is_ca()) with check (public.is_coordenacao() or public.is_ca());
drop trigger if exists livro_carimbo on public.livros;
create trigger livro_carimbo before insert on public.livros for each row execute function public.curso_carimbo();

-- depósito privado dos livros: leem os cooperados ativos; enviam a coordenação e o CA
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('biblioteca', 'biblioteca', false, 52428800, array['application/pdf', 'application/epub+zip', 'application/octet-stream'])
on conflict (id) do nothing;
drop policy if exists bib_ver on storage.objects;
create policy bib_ver on storage.objects for select to authenticated
  using (bucket_id = 'biblioteca' and (public.is_ativo() or public.is_coordenacao()));
drop policy if exists bib_enviar on storage.objects;
create policy bib_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'biblioteca' and (public.is_coordenacao() or public.is_ca()));
drop policy if exists bib_apagar on storage.objects;
create policy bib_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'biblioteca' and (public.is_coordenacao() or public.is_ca()));

-- sessões de leitura (só pelas funções abaixo)
create table if not exists public.leitura_sessoes (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references public.perfis(id) on delete cascade,
  livro_id    uuid not null references public.livros(id) on delete cascade,
  inicio      timestamptz not null default now(),
  fim         timestamptz,
  minutos     numeric(6,1),
  pagina      int,
  nota        text
);
create index if not exists leitura_sessoes_perfil on public.leitura_sessoes (perfil_id, inicio);
create unique index if not exists leitura_uma_aberta on public.leitura_sessoes (perfil_id) where fim is null;
alter table public.leitura_sessoes enable row level security;
drop policy if exists lses_ver on public.leitura_sessoes;
create policy lses_ver on public.leitura_sessoes for select to authenticated
  using (perfil_id = auth.uid() or public.is_coordenacao() or public.is_ca() or public.is_fiscal());

-- onde cada um está em cada livro
create table if not exists public.leituras (
  perfil_id    uuid not null references public.perfis(id) on delete cascade,
  livro_id     uuid not null references public.livros(id) on delete cascade,
  pagina       int,
  concluido_em date,
  atualizado_em timestamptz not null default now(),
  primary key (perfil_id, livro_id)
);
alter table public.leituras enable row level security;
drop policy if exists leit_ver on public.leituras;
create policy leit_ver on public.leituras for select to authenticated
  using (perfil_id = auth.uid() or public.is_coordenacao() or public.is_ca() or public.is_fiscal());

create or replace function public.leitura_iniciar(p_livro uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.is_ativo() then raise exception 'Só cooperados ativos registram leitura.'; end if;
  if not exists (select 1 from public.livros where id = p_livro and ativo) then raise exception 'Livro não encontrado.'; end if;
  select id into v from public.leitura_sessoes where perfil_id = auth.uid() and fim is null;
  if v is not null then raise exception 'Já existe um cronômetro ligado. Pare ou descarte a leitura em andamento.'; end if;
  insert into public.leitura_sessoes (perfil_id, livro_id) values (auth.uid(), p_livro) returning id into v;
  return v;
end; $$;

create or replace function public.leitura_parar(p_sessao uuid, p_pagina int, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.leitura_sessoes; bruto numeric; hoje_min numeric; dia date; conta numeric; tot int;
begin
  select * into s from public.leitura_sessoes where id = p_sessao and perfil_id = auth.uid() and fim is null for update;
  if s.id is null then raise exception 'Leitura não encontrada ou já encerrada.'; end if;
  if p_pagina is null or p_pagina < 1 then raise exception 'Informe a página em que você parou.'; end if;
  select paginas into tot from public.livros where id = s.livro_id;
  if tot is not null and p_pagina > tot then raise exception 'O livro tem % páginas.', tot; end if;
  bruto := extract(epoch from (now() - s.inicio)) / 60.0;
  dia := (s.inicio at time zone 'America/Sao_Paulo')::date;
  select coalesce(sum(minutos), 0) into hoje_min from public.leitura_sessoes
   where perfil_id = auth.uid() and fim is not null and (inicio at time zone 'America/Sao_Paulo')::date = dia;
  conta := greatest(0, least(bruto, 90, 180 - hoje_min));
  if bruto < 2 then conta := 0; end if;
  update public.leitura_sessoes set fim = now(), minutos = round(conta, 1), pagina = p_pagina, nota = nullif(trim(coalesce(p_nota, '')), '') where id = s.id;
  insert into public.leituras (perfil_id, livro_id, pagina) values (auth.uid(), s.livro_id, p_pagina)
  on conflict (perfil_id, livro_id) do update set pagina = greatest(coalesce(public.leituras.pagina, 0), excluded.pagina), atualizado_em = now();
  return jsonb_build_object('bruto', round(bruto, 1), 'contados', round(conta, 1), 'limite_dia', bruto >= 2 and conta < least(bruto, 90));
end; $$;

create or replace function public.leitura_descartar(p_sessao uuid) returns void
language plpgsql security definer set search_path = public as $$
begin delete from public.leitura_sessoes where id = p_sessao and perfil_id = auth.uid() and fim is null; end; $$;

create or replace function public.leitura_concluir(p_livro uuid, p_concluido boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ativo() then raise exception 'Só cooperados ativos.'; end if;
  insert into public.leituras (perfil_id, livro_id, concluido_em) values (auth.uid(), p_livro, case when p_concluido then (now() at time zone 'America/Sao_Paulo')::date end)
  on conflict (perfil_id, livro_id) do update set concluido_em = excluded.concluido_em, atualizado_em = now();
end; $$;
grant execute on function public.leitura_iniciar(uuid) to authenticated;
grant execute on function public.leitura_parar(uuid, int, text) to authenticated;
grant execute on function public.leitura_descartar(uuid) to authenticated;
grant execute on function public.leitura_concluir(uuid, boolean) to authenticated;

-- IGCC: componente Leitura (peso 0 até Resolução do CA). Meta = pontos no período para nota 100.
alter table public.igcc_parametros add column if not exists peso_leitura numeric not null default 0;
alter table public.igcc_parametros add column if not exists meta_leitura numeric not null default 60;   -- 60 pontos = 10 h no período

create or replace function public.igcc_leitura(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with par as (select meses, meta_leitura from public.igcc_parametros where id = 1),
  m as (select coalesce(sum(s.minutos), 0) mi from public.leitura_sessoes s, par
         where s.perfil_id = p_perfil and s.fim is not null and s.inicio >= now() - make_interval(months => par.meses)),
  c as (select count(*) n from public.leituras l, par where l.perfil_id = p_perfil and l.concluido_em >= current_date - make_interval(months => par.meses))
  select jsonb_build_object('minutos', (select mi from m), 'pontos', floor((select mi from m) / 10), 'meta', (select meta_leitura from par),
    'livros', (select n from c),
    'nota', case when (select meta_leitura from par) > 0 then least(100, round(floor((select mi from m) / 10) / (select meta_leitura from par) * 100, 1)) end);
$$;

create or replace function public.igcc_calcular(p_perfil uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare par public.igcc_parametros; ini date; ini_r date; ingresso date;
  ef_prev numeric := 0; ef_real numeric := 0; v1 numeric; v2 numeric; s_ef numeric; s_par numeric; s_ret numeric; s_asm numeric; s_con numeric; s_for numeric; f jsonb; s_lei numeric; l jsonb;
  n_par int; n_ret numeric; n_asm int; n_pres int; n_con numeric; n_disc numeric; participou boolean; total numeric := 0; pesos numeric := 0;
begin
  select * into par from public.igcc_parametros where id = 1;
  ini := current_date - make_interval(months => par.meses); ini_r := current_date - make_interval(months => par.meses_retrabalho);
  select data_ingresso into ingresso from public.perfis where id = p_perfil;
  select previstas, realizadas into v1, v2 from public.igcc_eficiencia_viva(p_perfil); ef_prev := ef_prev + v1; ef_real := ef_real + v2;
  select coalesce(sum(previstas), 0), coalesce(sum(realizadas), 0) into v1, v2 from public.igcc_registros where perfil_id = p_perfil and componente = 'eficiencia' and data >= ini and realizadas > 0;
  ef_prev := ef_prev + v1; ef_real := ef_real + v2;
  s_ef := case when ef_real > 0 then least(100, round(ef_prev / ef_real * 100, 1)) end;
  select count(*), round(avg(((qualidade + prazos + colaboracao + conformidade) / 4.0 - 1) / 4 * 100), 1) into n_par, s_par
    from public.projeto_avaliacoes where avaliado_id = p_perfil and criado_em >= ini;
  if n_par = 0 then s_par := null; end if;
  participou := exists (select 1 from public.producao where cooperado_id = p_perfil and tipo = 'produtiva' and projeto_id is not null and data >= ini_r);
  select coalesce(sum(quantidade), 0) into n_ret from public.igcc_registros where perfil_id = p_perfil and componente = 'retrabalho' and data >= ini_r;
  s_ret := case when participou or n_ret > 0 then greatest(0, 100 - 10 * n_ret) end;
  select count(*), count(pr.perfil_id) into n_asm, n_pres from public.assembleias a
    left join public.assembleia_presencas pr on pr.assembleia_id = a.id and pr.perfil_id = p_perfil
   where a.status in ('encerrada', 'sem_quorum') and a.tipo <> 'pre' and a.data_hora >= ini and (ingresso is null or a.data_hora::date >= ingresso);
  select coalesce(sum(quantidade), 0) into n_disc from public.igcc_registros where perfil_id = p_perfil and componente = 'disciplina' and data >= ini;
  s_asm := case when n_asm > 0 then round(n_pres::numeric / n_asm * 100, 1) end;
  select coalesce(sum(quantidade), 0) into n_con from public.igcc_registros where perfil_id = p_perfil and componente = 'contribuicao' and data >= ini;
  s_con := least(100, n_con * 10);
  f := public.igcc_formacao(p_perfil); s_for := (f->>'nota')::numeric;
  l := public.igcc_leitura(p_perfil); s_lei := (l->>'nota')::numeric;
  if s_ef is not null then total := total + s_ef * par.peso_eficiencia; pesos := pesos + par.peso_eficiencia; end if;
  if s_par is not null then total := total + s_par * par.peso_pares; pesos := pesos + par.peso_pares; end if;
  if s_ret is not null then total := total + s_ret * par.peso_retrabalho; pesos := pesos + par.peso_retrabalho; end if;
  if s_asm is not null then total := total + s_asm * par.peso_assembleia; pesos := pesos + par.peso_assembleia; end if;
  if s_for is not null and par.peso_formacao > 0 then total := total + s_for * par.peso_formacao; pesos := pesos + par.peso_formacao; end if;
  if s_lei is not null and par.peso_leitura > 0 then total := total + s_lei * par.peso_leitura; pesos := pesos + par.peso_leitura; end if;
  if pesos > 0 or n_con > 0 then total := total + s_con * par.peso_contrib; pesos := pesos + par.peso_contrib; end if;
  return jsonb_build_object(
    'indice', case when pesos > 0 then round(total / pesos, 1) end,
    'eficiencia', jsonb_build_object('nota', s_ef, 'previstas', ef_prev, 'realizadas', ef_real),
    'pares', jsonb_build_object('nota', s_par, 'avaliacoes', n_par),
    'retrabalho', jsonb_build_object('nota', s_ret, 'apontamentos', n_ret),
    'assembleias', jsonb_build_object('nota', s_asm, 'realizadas', n_asm, 'presente', n_pres, 'reunioes_disciplina', n_disc),
    'contribuicoes', jsonb_build_object('nota', s_con, 'pontos', n_con),
    'formacao', f,
    'leitura', l,
    'periodo_meses', par.meses, 'periodo_retrabalho', par.meses_retrabalho);
end;
$$;


-- primeiro livro (os arquivos são enviados pela coordenação na própria Biblioteca)
insert into public.livros (titulo, autor, tradutor, ano, descricao, tema, paginas, ordem, criado_nome)
select 'Os 28 Tecelões de Rochdale', 'George Jacob Holyoake', 'Archimedes Taborda', '1933 (edição atualizada)',
  'A história dos tecelões que fundaram, em 1844, a cooperativa de Rochdale, na Inglaterra, de onde vêm os princípios do cooperativismo. Edição com ortografia e linguagem atualizadas e valores convertidos para reais de hoje.',
  'História do cooperativismo', 79, 10, 'Indicação inicial'
where not exists (select 1 from public.livros where titulo = 'Os 28 Tecelões de Rochdale');

select 'migracao 046 ok' as resultado;
