-- =====================================================================
-- BIMCORE — migração 016: assembleias online
-- Estatuto, arts. 28 a 40 (convocação, composição, quórum, edital,
-- votação, ata) e 31 (assembleias digitais); Regimento, arts. 56 a 63.
--  • Rascunho → edital publicado (≥ 10 dias antes; art. 30) → sala aberta
--    → instalada (quórum) → encerrada. Pré-assembleia (RI, art. 60) é consultiva.
--  • Digital: horário único; 2/3 na 1ª hora, metade + 1 na 2ª hora e
--    mínimo de 4 a partir da 3ª hora (arts. 30, §§1º-2º, e 32).
--  • Só vota quem foi admitido antes do edital (art. 28, §3º), está presente
--    e não está impedido na pauta (arts. 37 e 42, §1º). 1 voto por pessoa (art. 40).
--  • Aprovação por maioria absoluta dos presentes aptos, ou 2/3 nas matérias
--    do art. 44; abstenções > 50% adiam a pauta (art. 38, §3º).
--  • Voto aberto em regra; secreto quando a assembleia decidir (art. 40, §2º).
--  • Ata assinada pela plataforma (art. 39, §2º) e publicada em até 10 dias (RI, art. 63).
-- =====================================================================

create or replace function public.pode_convocar() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_coordenacao() or public.is_fiscal();
$$;
grant execute on function public.pode_convocar() to authenticated;

create table if not exists public.assembleias (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null check (tipo in ('ordinaria', 'extraordinaria', 'especial', 'pre')),
  titulo             text not null,
  data_hora          timestamptz not null,
  duracao_min        int not null default 120 check (duracao_min between 30 and 600),
  plataforma         text,
  link_video         text,
  convocante         text,
  status             text not null default 'rascunho' check (status in ('rascunho', 'agendada', 'aberta', 'instalada', 'encerrada', 'sem_quorum', 'cancelada')),
  edital_publicado_em timestamptz,
  convocacao_enviada_em timestamptz,
  membros_na_data    int,
  aberta_em          timestamptz,
  instalada_em       timestamptz,
  instalada_presentes int,
  instalada_convocacao int,
  encerrada_em       timestamptz,
  motivo_cancelamento text,
  gravacao_url       text,
  ata                text,
  ata_publicada_em   timestamptz,
  criado_por         uuid default auth.uid(),
  criado_nome        text,
  criado_em          timestamptz not null default now()
);

create table if not exists public.assembleia_pautas (
  id             uuid primary key default gen_random_uuid(),
  assembleia_id  uuid not null references public.assembleias(id) on delete cascade,
  ordem          int not null default 1,
  titulo         text not null,
  descricao      text,
  quorum         text not null default 'maioria' check (quorum in ('maioria', 'dois_tercos')),
  impedir_orgaos boolean not null default false,
  voto_secreto   boolean not null default false,
  status         text not null default 'aguardando' check (status in ('aguardando', 'em_votacao', 'encerrada')),
  aberta_em      timestamptz,
  encerrada_em   timestamptz,
  resultado      jsonb
);
create index if not exists assembleia_pautas_a on public.assembleia_pautas (assembleia_id, ordem);

create table if not exists public.assembleia_presencas (
  assembleia_id  uuid not null references public.assembleias(id) on delete cascade,
  perfil_id      uuid not null,
  nome           text,
  apto           boolean not null default true,
  orgao          boolean not null default false,
  entrou_em      timestamptz not null default now(),
  primary key (assembleia_id, perfil_id)
);

create table if not exists public.assembleia_votos (
  pauta_id   uuid not null references public.assembleia_pautas(id) on delete cascade,
  perfil_id  uuid not null,
  nome       text,
  voto       text check (voto in ('favor', 'contra', 'abstencao')),
  em         timestamptz not null default now(),
  primary key (pauta_id, perfil_id)
);
-- voto secreto: quem votou fica separado do conteúdo do voto
create table if not exists public.assembleia_votos_secretos (
  id        uuid primary key default gen_random_uuid(),
  pauta_id  uuid not null references public.assembleia_pautas(id) on delete cascade,
  voto      text not null check (voto in ('favor', 'contra', 'abstencao'))
);

create table if not exists public.assembleia_chat (
  id             uuid primary key default gen_random_uuid(),
  assembleia_id  uuid not null references public.assembleias(id) on delete cascade,
  perfil_id      uuid not null default auth.uid(),
  nome           text,
  texto          text not null check (char_length(texto) between 1 and 1000),
  em             timestamptz not null default now()
);
create index if not exists assembleia_chat_a on public.assembleia_chat (assembleia_id, em);

create table if not exists public.assembleia_assinaturas (
  assembleia_id  uuid not null references public.assembleias(id) on delete cascade,
  perfil_id      uuid not null,
  nome           text,
  qualidade      text not null,
  em             timestamptz not null default now(),
  primary key (assembleia_id, perfil_id)
);

-- ---------- Segurança ----------
alter table public.assembleias enable row level security;
alter table public.assembleia_pautas enable row level security;
alter table public.assembleia_presencas enable row level security;
alter table public.assembleia_votos enable row level security;
alter table public.assembleia_votos_secretos enable row level security;
alter table public.assembleia_chat enable row level security;
alter table public.assembleia_assinaturas enable row level security;

drop policy if exists asm_ver on public.assembleias;
create policy asm_ver on public.assembleias for select to authenticated using ((public.is_ativo() and status <> 'rascunho') or public.pode_convocar());
drop policy if exists asm_gerir on public.assembleias;
create policy asm_gerir on public.assembleias for all to authenticated using (public.pode_convocar()) with check (public.pode_convocar());

drop policy if exists asmp_ver on public.assembleia_pautas;
create policy asmp_ver on public.assembleia_pautas for select to authenticated
  using (exists (select 1 from public.assembleias a where a.id = assembleia_id and ((public.is_ativo() and a.status <> 'rascunho') or public.pode_convocar())));
drop policy if exists asmp_gerir on public.assembleia_pautas;
create policy asmp_gerir on public.assembleia_pautas for all to authenticated
  using (public.pode_convocar() and exists (select 1 from public.assembleias a where a.id = assembleia_id and a.status = 'rascunho'))
  with check (public.pode_convocar() and exists (select 1 from public.assembleias a where a.id = assembleia_id and a.status = 'rascunho'));

drop policy if exists asmpr_ver on public.assembleia_presencas;
create policy asmpr_ver on public.assembleia_presencas for select to authenticated using (public.is_ativo() or public.pode_convocar());

-- voto aberto: cada um vê o próprio; todos veem depois que a votação encerra (registro individual, art. 31, §1º, II)
drop policy if exists asmv_ver on public.assembleia_votos;
create policy asmv_ver on public.assembleia_votos for select to authenticated
  using (perfil_id = auth.uid() or exists (select 1 from public.assembleia_pautas p where p.id = pauta_id and p.status = 'encerrada' and not p.voto_secreto));
drop policy if exists asmvs_ver on public.assembleia_votos_secretos;
create policy asmvs_ver on public.assembleia_votos_secretos for select to authenticated
  using (exists (select 1 from public.assembleia_pautas p where p.id = pauta_id and p.status = 'encerrada'));

drop policy if exists asmc_ver on public.assembleia_chat;
create policy asmc_ver on public.assembleia_chat for select to authenticated using (public.is_ativo() or public.pode_convocar());
drop policy if exists asmc_enviar on public.assembleia_chat;
create policy asmc_enviar on public.assembleia_chat for insert to authenticated
  with check (perfil_id = auth.uid()
              and exists (select 1 from public.assembleias a where a.id = assembleia_id and a.status in ('aberta', 'instalada'))
              and exists (select 1 from public.assembleia_presencas x where x.assembleia_id = assembleia_chat.assembleia_id and x.perfil_id = auth.uid()));

drop policy if exists asma_ver on public.assembleia_assinaturas;
create policy asma_ver on public.assembleia_assinaturas for select to authenticated using (public.is_ativo() or public.pode_convocar());

-- ---------- Regras da tabela de assembleias ----------
-- Mudanças de andamento só pelas funções abaixo (que ligam bimcore.rpc).
create or replace function public.regras_assembleia() returns trigger
language plpgsql security definer set search_path = public as $$
declare rpc boolean := coalesce(current_setting('bimcore.rpc', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then raise exception 'A assembleia começa como rascunho; depois publique o edital.'; end if;
    new.criado_nome := (select nome from public.perfis where id = auth.uid());
    return new;
  end if;
  if rpc then return new; end if;
  -- publicar edital
  if old.status = 'rascunho' and new.status = 'agendada' then
    if new.tipo <> 'pre' and new.data_hora < now() + interval '10 days' then
      raise exception 'O edital precisa ser publicado com pelo menos 10 dias de antecedência (Estatuto, art. 30).';
    end if;
    if not exists (select 1 from public.assembleia_pautas where assembleia_id = new.id) then
      raise exception 'Inclua ao menos uma pauta na ordem do dia (Estatuto, art. 33, IV).';
    end if;
    new.edital_publicado_em := now();
    new.membros_na_data := (select count(*) from public.perfis where status = 'ativo');
    return new;
  end if;
  if new.status = 'cancelada' and old.status in ('rascunho', 'agendada') then return new; end if;
  if new.status is distinct from old.status then raise exception 'Use os botões da sala para mudar o andamento da assembleia.'; end if;
  if old.status <> 'rascunho' then
    -- depois do edital, só mudam o link da sala, a gravação, a ata e o registro do envio da convocação
    if new.data_hora is distinct from old.data_hora or new.tipo is distinct from old.tipo or new.titulo is distinct from old.titulo or new.duracao_min is distinct from old.duracao_min then
      raise exception 'Depois do edital publicado, data, tipo e ordem do dia não mudam. Cancele e convoque outra assembleia.';
    end if;
    if old.ata_publicada_em is not null and new.ata is distinct from old.ata then raise exception 'A ata já foi publicada.'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists regras_assembleia on public.assembleias;
create trigger regras_assembleia before insert or update on public.assembleias for each row execute function public.regras_assembleia();

-- ---------- Quórum (Estatuto, arts. 30 e 32, até 14 cooperados) ----------
create or replace function public.assembleia_quorum(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.assembleias; n int; pres int; conv int; req int; min_passados numeric;
begin
  select * into a from public.assembleias where id = p_id;
  n := coalesce(a.membros_na_data, (select count(*) from public.perfis where status = 'ativo'));
  pres := (select count(*) from public.assembleia_presencas where assembleia_id = p_id and apto);
  min_passados := extract(epoch from (now() - a.data_hora)) / 60;
  conv := case when min_passados < 60 then 1 when min_passados < 120 then 2 else 3 end;
  req := case conv when 1 then ceil(n * 2.0 / 3) when 2 then floor(n / 2.0) + 1
                   else case when n <= 19 then 4 else least(50, ceil(n * 0.2)) end end;
  return jsonb_build_object('membros', n, 'presentes', pres, 'convocacao', conv, 'necessario', req, 'atingido', pres >= req, 'tipo', a.tipo);
end;
$$;
grant execute on function public.assembleia_quorum(uuid) to authenticated;

-- ---------- Andamento ----------
create or replace function public.assembleia_abrir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem convoca (Presidente/coordenação ou Conselho Fiscal) abre a sala.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status <> 'agendada' then raise exception 'A assembleia não está agendada.'; end if;
  if now() < a.data_hora - interval '30 minutes' then raise exception 'A sala abre 30 minutos antes do horário do edital.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set status = 'aberta', aberta_em = now() where id = p_id;
end;
$$;

create or replace function public.assembleia_entrar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias; p public.perfis;
begin
  select * into a from public.assembleias where id = p_id;
  if a.status not in ('aberta', 'instalada') then raise exception 'A sala desta assembleia não está aberta.'; end if;
  select * into p from public.perfis where id = auth.uid();
  if p.status <> 'ativo' then raise exception 'Só cooperados ativos participam.'; end if;
  insert into public.assembleia_presencas (assembleia_id, perfil_id, nome, apto, orgao)
  values (p_id, p.id, p.nome,
          -- admitido antes do edital (art. 28, §3º)
          (p.data_ingresso is null or a.edital_publicado_em is null or p.data_ingresso <= (a.edital_publicado_em at time zone 'America/Sao_Paulo')::date),
          (p.papel = 'coordenacao' or coalesce(p.tesouraria, false) or coalesce(p.conselho_fiscal, false)))
  on conflict (assembleia_id, perfil_id) do nothing;
end;
$$;

create or replace function public.assembleia_instalar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.assembleias; q jsonb;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia a instala.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status <> 'aberta' then raise exception 'A sala precisa estar aberta.'; end if;
  if a.tipo <> 'pre' then
    if now() < a.data_hora then raise exception 'A assembleia só pode ser instalada a partir do horário do edital.'; end if;
    q := public.assembleia_quorum(p_id);
    if not (q->>'atingido')::boolean then
      raise exception 'Quórum ainda não atingido: % presentes aptos, % necessários na %ª convocação.', q->>'presentes', q->>'necessario', q->>'convocacao';
    end if;
  else
    q := jsonb_build_object('presentes', (select count(*) from public.assembleia_presencas where assembleia_id = p_id), 'convocacao', 0);
  end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set status = 'instalada', instalada_em = now(), instalada_presentes = (q->>'presentes')::int, instalada_convocacao = (q->>'convocacao')::int where id = p_id;
  return q;
end;
$$;

create or replace function public.assembleia_encerrar(p_id uuid, p_sem_quorum boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia a encerra.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if p_sem_quorum then
    if a.status <> 'aberta' then raise exception 'Só uma sala aberta e não instalada pode ser encerrada por falta de quórum.'; end if;
    if a.tipo <> 'pre' and now() < a.data_hora + make_interval(mins => greatest(a.duracao_min, 120)) then
      raise exception 'Numa assembleia digital, o quórum pode ser alcançado durante todo o período mínimo da sessão (Estatuto, art. 30, §2º).';
    end if;
  else
    if a.status <> 'instalada' then raise exception 'A assembleia não está instalada.'; end if;
    if exists (select 1 from public.assembleia_pautas where assembleia_id = p_id and status = 'em_votacao') then raise exception 'Encerre a votação em andamento antes.'; end if;
  end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set status = case when p_sem_quorum then 'sem_quorum' else 'encerrada' end, encerrada_em = now() where id = p_id;
end;
$$;

-- ---------- Votação ----------
create or replace function public.pauta_abrir(p_pauta uuid, p_secreto boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p public.assembleia_pautas; a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia abre a votação.'; end if;
  select * into p from public.assembleia_pautas where id = p_pauta for update;
  select * into a from public.assembleias where id = p.assembleia_id;
  if a.status <> 'instalada' then raise exception 'A assembleia precisa estar instalada para votar.'; end if;
  if p.status <> 'aguardando' then raise exception 'Esta pauta já foi votada.'; end if;
  if exists (select 1 from public.assembleia_pautas where assembleia_id = a.id and status = 'em_votacao') then raise exception 'Já há uma votação aberta.'; end if;
  update public.assembleia_pautas set status = 'em_votacao', aberta_em = now(), voto_secreto = coalesce(p_secreto, false) where id = p_pauta;
end;
$$;

create or replace function public.pauta_votar(p_pauta uuid, p_voto text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.assembleia_pautas; x public.assembleia_presencas;
begin
  select * into p from public.assembleia_pautas where id = p_pauta;
  if p.status <> 'em_votacao' then raise exception 'A votação desta pauta não está aberta.'; end if;
  select * into x from public.assembleia_presencas where assembleia_id = p.assembleia_id and perfil_id = auth.uid();
  if x.perfil_id is null then raise exception 'Entre na sala para votar (sua presença identifica o seu voto).'; end if;
  if not x.apto then raise exception 'Quem foi admitido depois do edital não vota nesta assembleia (Estatuto, art. 28, §3º).'; end if;
  if p.impedir_orgaos and x.orgao then raise exception 'Membros da administração e do Conselho Fiscal não votam nesta matéria (Estatuto, arts. 37 e 42, §1º).'; end if;
  if p_voto not in ('favor', 'contra', 'abstencao') then raise exception 'Voto inválido.'; end if;
  if exists (select 1 from public.assembleia_votos where pauta_id = p_pauta and perfil_id = auth.uid()) then raise exception 'Você já votou nesta pauta. O voto não pode ser mudado.'; end if;
  if p.voto_secreto then
    insert into public.assembleia_votos (pauta_id, perfil_id, nome, voto) values (p_pauta, auth.uid(), x.nome, null);
    insert into public.assembleia_votos_secretos (pauta_id, voto) values (p_pauta, p_voto);
  else
    insert into public.assembleia_votos (pauta_id, perfil_id, nome, voto) values (p_pauta, auth.uid(), x.nome, p_voto);
  end if;
end;
$$;

create or replace function public.pauta_encerrar(p_pauta uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.assembleia_pautas; a public.assembleias; aptos int; fav int; con int; abs_ int; naov int; res text; r jsonb; minimo int;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia encerra a votação.'; end if;
  select * into p from public.assembleia_pautas where id = p_pauta for update;
  if p.status <> 'em_votacao' then raise exception 'A votação desta pauta não está aberta.'; end if;
  select * into a from public.assembleias where id = p.assembleia_id;
  aptos := (select count(*) from public.assembleia_presencas where assembleia_id = a.id and apto and not (p.impedir_orgaos and orgao));
  if p.voto_secreto then
    select count(*) filter (where voto = 'favor'), count(*) filter (where voto = 'contra'), count(*) filter (where voto = 'abstencao')
      into fav, con, abs_ from public.assembleia_votos_secretos where pauta_id = p_pauta;
  else
    select count(*) filter (where voto = 'favor'), count(*) filter (where voto = 'contra'), count(*) filter (where voto = 'abstencao')
      into fav, con, abs_ from public.assembleia_votos where pauta_id = p_pauta;
  end if;
  naov := greatest(0, aptos - fav - con - abs_);
  minimo := case when p.quorum = 'dois_tercos' then ceil(aptos * 2.0 / 3) else floor(aptos / 2.0) + 1 end;
  res := case when a.tipo = 'pre' then 'consulta'
              when (abs_ + naov) * 2 > aptos then 'adiada'
              when fav >= minimo and aptos > 0 then 'aprovada' else 'rejeitada' end;
  r := jsonb_build_object('aptos', aptos, 'favor', fav, 'contra', con, 'abstencao', abs_, 'nao_votaram', naov, 'necessario', minimo, 'resultado', res, 'secreto', p.voto_secreto);
  update public.assembleia_pautas set status = 'encerrada', encerrada_em = now(), resultado = r where id = p_pauta;
  return r;
end;
$$;

-- ---------- Ata ----------
create or replace function public.ata_assinar(p_id uuid, p_qualidade text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  select * into a from public.assembleias where id = p_id;
  if a.status not in ('encerrada', 'sem_quorum') then raise exception 'A ata é assinada depois do encerramento.'; end if;
  if a.ata_publicada_em is not null then raise exception 'A ata já foi publicada.'; end if;
  if coalesce(a.ata, '') = '' then raise exception 'A ata ainda não foi redigida.'; end if;
  if not exists (select 1 from public.assembleia_presencas where assembleia_id = p_id and perfil_id = auth.uid()) then raise exception 'Só quem esteve presente assina a ata.'; end if;
  insert into public.assembleia_assinaturas (assembleia_id, perfil_id, nome, qualidade)
  values (p_id, auth.uid(), (select nome from public.perfis where id = auth.uid()), coalesce(nullif(trim(p_qualidade), ''), 'cooperado'))
  on conflict (assembleia_id, perfil_id) do update set qualidade = excluded.qualidade, em = now();
end;
$$;

create or replace function public.ata_publicar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia publica a ata.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status not in ('encerrada', 'sem_quorum') then raise exception 'A assembleia ainda não foi encerrada.'; end if;
  if coalesce(a.ata, '') = '' then raise exception 'Redija a ata antes de publicar.'; end if;
  if not exists (select 1 from public.assembleia_assinaturas where assembleia_id = p_id) then raise exception 'A ata precisa de pelo menos uma assinatura.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set ata_publicada_em = now() where id = p_id;
end;
$$;

-- Quem já votou em cada pauta (sem o conteúdo do voto), para acompanhar a votação ao vivo
create or replace function public.assembleia_votantes(p_id uuid)
returns table (pauta_id uuid, perfil_id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select v.pauta_id, v.perfil_id, v.nome from public.assembleia_votos v join public.assembleia_pautas p on p.id = v.pauta_id
   where p.assembleia_id = p_id and public.is_ativo();
$$;
grant execute on function public.assembleia_votantes(uuid) to authenticated;

grant execute on function public.assembleia_abrir(uuid), public.assembleia_entrar(uuid), public.assembleia_instalar(uuid), public.assembleia_encerrar(uuid, boolean),
  public.pauta_abrir(uuid, boolean), public.pauta_votar(uuid, text), public.pauta_encerrar(uuid), public.ata_assinar(uuid, text), public.ata_publicar(uuid) to authenticated;

select 'migracao 016 ok' as resultado;
