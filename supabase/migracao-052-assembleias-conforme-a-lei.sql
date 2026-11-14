-- =====================================================================
-- BIMCORE — migração 052: o passo a passo legal das assembleias passa a
-- ser exigido pelo banco (não só lembrado na tela).
--
-- Base: Lei 5.764/71 (arts. 38, 44 e 46), Lei 12.690/12 (arts. 11 e 12),
-- Lei 8.934/94 (art. 36), Estatuto (arts. 28 a 45) e Regimento (arts. 56 a 63).
--
--  1. Matéria de cada pauta. O banco aplica sozinho:
--     • reforma do Estatuto, fusão/incorporação/desmembramento, mudança de
--       objeto, dissolução e contas do liquidante → só em Assembleia Geral
--       Extraordinária, com 2/3 dos presentes (Lei 5.764, art. 46);
--     • prestação de contas, sobras ou perdas e eleição do Presidente/Vice →
--       só na AGO (Lei 5.764, art. 44); nas contas, administração e Conselho
--       Fiscal não votam (Estatuto, arts. 37 e 42, §1º).
--  2. Edital só é publicado completo (Estatuto, art. 33): ordem do dia, quem
--     convoca, plataforma e link, sessão digital de 2 h ou mais, 10 dias de
--     antecedência. A AGO só pode ser marcada de janeiro a março, uma por ano,
--     e precisa ter a prestação de contas na pauta (Lei 5.764, art. 44).
--  3. Convocação registrada por função, com data travada: e-mail a todos até
--     10 dias antes (Lei 12.690, art. 12; Estatuto, art. 34) e aplicativo de
--     mensagens (Regimento, art. 61). Sem os dois registros a sala não abre.
--  4. Quórum da assembleia digital: convocação única (Estatuto, art. 30, §2º),
--     então vale o quórum da 1ª convocação, 2/3 do quadro social, durante
--     toda a sessão (Lei 12.690, art. 11, §3º, I).
--  5. A ata só é fechada com o link da gravação (Estatuto, art. 31, §1º, III).
--  6. Registro da ata na JUCERJA (protocolo e arquivamento), com alerta pelo
--     prazo de 30 dias (Lei 8.934/94, art. 36).
--  7. Assembleias feitas fora do site (constituição, AGESP de 17/08/2026)
--     entram num registro próprio, para o calendário legal ficar completo.
--  8. Função de pendências legais, que o site mostra para a gestão.
-- =====================================================================

-- ---------- 1. Colunas novas ----------
alter table public.assembleias add column if not exists convocacao_whatsapp_em timestamptz;
alter table public.assembleias add column if not exists jucerja_protocolo text;
alter table public.assembleias add column if not exists jucerja_protocolo_em date;
alter table public.assembleias add column if not exists jucerja_arquivado_em date;
alter table public.assembleias add column if not exists jucerja_dispensa text;

alter table public.assembleia_pautas add column if not exists materia text not null default 'geral';
alter table public.assembleia_pautas drop constraint if exists assembleia_pautas_materia_check;
alter table public.assembleia_pautas add constraint assembleia_pautas_materia_check check (materia in (
  'geral', 'contas', 'sobras', 'eleicao_presidencia', 'conselho_fiscal', 'conselho_administracao', 'plano_anual',
  'reforma_estatuto', 'fusao_incorporacao', 'mudanca_objeto', 'dissolucao', 'contas_liquidante'));

-- matérias exclusivas da AGE (Lei 5.764, art. 46) e da AGO (art. 44)
create or replace function public.materia_exclusiva_age(m text) returns boolean language sql immutable as $$
  select m in ('reforma_estatuto', 'fusao_incorporacao', 'mudanca_objeto', 'dissolucao', 'contas_liquidante');
$$;
create or replace function public.materia_exclusiva_ago(m text) returns boolean language sql immutable as $$
  select m in ('contas', 'sobras', 'eleicao_presidencia');
$$;

-- ---------- Regras de cada pauta ----------
create or replace function public.regras_pauta() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  t := (select tipo from public.assembleias where id = new.assembleia_id);
  new.materia := coalesce(new.materia, 'geral');
  if new.especial = 'comissao' then new.materia := 'geral'; return new; end if;
  if t <> 'pre' then
    if public.materia_exclusiva_age(new.materia) and t <> 'extraordinaria' then
      raise exception 'Esta matéria só pode ser votada em Assembleia Geral Extraordinária (Lei 5.764, art. 46; Estatuto, art. 44).';
    end if;
    if public.materia_exclusiva_ago(new.materia) and t <> 'ordinaria' then
      raise exception 'Prestação de contas, sobras ou perdas e eleição do Presidente e do Vice são matérias da Assembleia Geral Ordinária (Lei 5.764, art. 44; Estatuto, art. 42).';
    end if;
  end if;
  if public.materia_exclusiva_age(new.materia) then new.quorum := 'dois_tercos'; end if;
  if new.materia = 'contas' then new.impedir_orgaos := true; end if;
  return new;
end;
$$;
drop trigger if exists regras_pauta on public.assembleia_pautas;
create trigger regras_pauta before insert or update of materia, quorum, impedir_orgaos, assembleia_id on public.assembleia_pautas
  for each row execute function public.regras_pauta();

-- ---------- 2. Conferência do edital (a mesma lista que o site mostra) ----------
create or replace function public.assembleia_conferir_edital(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.assembleias; erros text[] := '{}'; mes int; ano int; p record;
begin
  select * into a from public.assembleias where id = p_id;
  if a.id is null then raise exception 'Assembleia não encontrada.'; end if;
  if not exists (select 1 from public.assembleia_pautas where assembleia_id = p_id) then
    erros := erros || 'Inclua ao menos uma pauta na ordem do dia (Estatuto, art. 33, IV).';
  end if;
  if a.tipo <> 'pre' then
    if a.data_hora < now() + interval '10 days' then
      erros := erros || 'A data precisa estar a pelo menos 10 dias da publicação do edital (Lei 12.690, art. 12; Estatuto, arts. 30 e 34).';
    end if;
    if coalesce(trim(a.convocante), '') = '' then erros := erros || 'Informe quem convoca: nome e qualidade, que assinam o edital (Estatuto, art. 33, VI).'; end if;
    if coalesce(trim(a.plataforma), '') = '' or coalesce(trim(a.link_video), '') = '' then
      erros := erros || 'Informe a plataforma e o link da sala de vídeo (Estatuto, art. 33, II).';
    end if;
    if a.duracao_min < 120 then erros := erros || 'A sessão digital dura no mínimo 2 horas (Estatuto, art. 30, §2º).'; end if;
    mes := extract(month from a.data_hora at time zone 'America/Sao_Paulo');
    ano := extract(year from a.data_hora at time zone 'America/Sao_Paulo');
    if a.tipo = 'ordinaria' then
      if mes > 3 then
        erros := erros || 'A AGO acontece nos 3 primeiros meses depois do fim do exercício, ou seja, de janeiro a março (Lei 5.764, art. 44). Para outros assuntos, use a Especial ou a Extraordinária.';
      end if;
      if not exists (select 1 from public.assembleia_pautas where assembleia_id = p_id and materia = 'contas') then
        erros := erros || 'A AGO precisa ter a prestação de contas do exercício anterior, com o parecer do Conselho Fiscal (Lei 5.764, art. 44, I).';
      end if;
      if exists (select 1 from public.assembleias x where x.id <> p_id and x.tipo = 'ordinaria' and x.status not in ('rascunho', 'cancelada', 'sem_quorum')
                   and extract(year from x.data_hora at time zone 'America/Sao_Paulo') = ano) then
        erros := erros || 'Já existe uma AGO convocada ou realizada neste ano.';
      end if;
    end if;
    for p in select materia from public.assembleia_pautas where assembleia_id = p_id loop
      if public.materia_exclusiva_age(p.materia) and a.tipo <> 'extraordinaria' then
        erros := erros || 'Há pauta que só pode ser votada em Assembleia Geral Extraordinária (Lei 5.764, art. 46).';
      end if;
      if public.materia_exclusiva_ago(p.materia) and a.tipo <> 'ordinaria' then
        erros := erros || 'Há pauta que só pode ser votada na AGO (Lei 5.764, art. 44).';
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', coalesce(array_length(erros, 1), 0) = 0, 'erros', to_jsonb(erros));
end;
$$;
grant execute on function public.assembleia_conferir_edital(uuid) to authenticated;

-- ---------- Regras da tabela de assembleias (substitui a da migração 040) ----------
create or replace function public.regras_assembleia() returns trigger
language plpgsql security definer set search_path = public as $$
declare rpc boolean := coalesce(current_setting('bimcore.rpc', true), '') = '1'; c jsonb;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then raise exception 'A assembleia começa como rascunho; depois publique o edital.'; end if;
    if coalesce(array_length(new.comissao_proposta, 1), 0) > 5 then raise exception 'A comissão tem no máximo 5 cooperados (Estatuto, art. 39, §1º).'; end if;
    new.criado_nome := (select nome from public.perfis where id = auth.uid());
    new.comissao := null; new.notas := '{}'::jsonb; new.ata := null; new.ata_fechada_em := null; new.ata_hash := null; new.ata_pdf := null; new.ata_signatarios := null; new.ata_concluida_em := null;
    new.convocacao_enviada_em := null; new.convocacao_whatsapp_em := null;
    new.jucerja_protocolo := null; new.jucerja_protocolo_em := null; new.jucerja_arquivado_em := null; new.jucerja_dispensa := null;
    new.duracao_min := greatest(coalesce(new.duracao_min, 120), case when new.tipo = 'pre' then 30 else 120 end);
    return new;
  end if;
  if rpc then return new; end if;
  if new.comissao is distinct from old.comissao or new.notas is distinct from old.notas or new.ata is distinct from old.ata
     or new.ata_fechada_em is distinct from old.ata_fechada_em or new.ata_hash is distinct from old.ata_hash or new.ata_pdf is distinct from old.ata_pdf
     or new.ata_signatarios is distinct from old.ata_signatarios or new.ata_concluida_em is distinct from old.ata_concluida_em
     or new.ata_publicada_em is distinct from old.ata_publicada_em then
    raise exception 'A ata e as anotações só mudam pelos botões da sala.';
  end if;
  if new.convocacao_enviada_em is distinct from old.convocacao_enviada_em or new.convocacao_whatsapp_em is distinct from old.convocacao_whatsapp_em then
    raise exception 'O envio da convocação é registrado pelo botão Enviar convocação, que grava a data.';
  end if;
  if new.jucerja_protocolo is distinct from old.jucerja_protocolo or new.jucerja_protocolo_em is distinct from old.jucerja_protocolo_em
     or new.jucerja_arquivado_em is distinct from old.jucerja_arquivado_em or new.jucerja_dispensa is distinct from old.jucerja_dispensa then
    raise exception 'O registro na JUCERJA é informado pelo botão da ata.';
  end if;
  if (new.mesa_presidente is distinct from old.mesa_presidente or new.mesa_secretario is distinct from old.mesa_secretario or new.comissao_proposta is distinct from old.comissao_proposta)
     and old.status not in ('rascunho', 'agendada', 'aberta') then
    raise exception 'A mesa e a comissão proposta só mudam até a instalação da assembleia.';
  end if;
  if coalesce(array_length(new.comissao_proposta, 1), 0) > 5 then raise exception 'A comissão tem no máximo 5 cooperados (Estatuto, art. 39, §1º).'; end if;
  if new.gravacao_url is distinct from old.gravacao_url and old.ata_fechada_em is not null then raise exception 'A ata já foi fechada; o link da gravação não muda mais.'; end if;
  if old.status = 'rascunho' and new.status = 'rascunho' and new.tipo <> 'pre' and new.duracao_min < 120 then
    raise exception 'A sessão digital dura no mínimo 2 horas (Estatuto, art. 30, §2º).';
  end if;
  if old.status = 'rascunho' and new.status = 'agendada' then
    c := public.assembleia_conferir_edital(new.id);
    -- confere também os campos que estão sendo gravados agora
    if new.tipo <> 'pre' and new.data_hora < now() + interval '10 days' then
      raise exception 'O edital precisa ser publicado com pelo menos 10 dias de antecedência (Lei 12.690, art. 12; Estatuto, art. 30).';
    end if;
    if not (c->>'ok')::boolean then
      raise exception 'O edital ainda não pode ser publicado: %', (select string_agg(x, ' ') from jsonb_array_elements_text(c->'erros') x);
    end if;
    new.edital_publicado_em := now();
    new.membros_na_data := public.quadro_social();
    return new;
  end if;
  if new.status = 'cancelada' and old.status in ('rascunho', 'agendada') then return new; end if;
  if new.status is distinct from old.status then raise exception 'Use os botões da sala para mudar o andamento da assembleia.'; end if;
  if old.status <> 'rascunho' then
    if new.data_hora is distinct from old.data_hora or new.tipo is distinct from old.tipo or new.titulo is distinct from old.titulo or new.duracao_min is distinct from old.duracao_min
       or new.convocante is distinct from old.convocante or new.plataforma is distinct from old.plataforma then
      raise exception 'Depois do edital publicado, data, tipo, ordem do dia e quem convoca não mudam. Cancele e convoque outra assembleia.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 3. Registro da convocação (e-mail e aplicativo de mensagens) ----------
create or replace function public.assembleia_registrar_convocacao(p_id uuid, p_canal text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem convoca registra o envio da convocação.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status <> 'agendada' then raise exception 'A convocação é enviada depois de publicar o edital e antes de abrir a sala.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  if p_canal = 'email' then
    if a.convocacao_enviada_em is not null then raise exception 'O envio por e-mail já foi registrado em %.', to_char(a.convocacao_enviada_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'); end if;
    if a.tipo <> 'pre' and now() > a.data_hora - interval '10 days' then
      raise exception 'O prazo para notificar por e-mail (10 dias antes, Lei 12.690, art. 12; Estatuto, art. 34) já passou. Cancele esta assembleia e convoque outra data.';
    end if;
    update public.assembleias set convocacao_enviada_em = now() where id = p_id;
  elsif p_canal = 'whatsapp' then
    if a.convocacao_whatsapp_em is not null then raise exception 'O aviso no aplicativo de mensagens já foi registrado.'; end if;
    update public.assembleias set convocacao_whatsapp_em = now() where id = p_id;
  else
    raise exception 'Canal inválido.';
  end if;
end;
$$;
grant execute on function public.assembleia_registrar_convocacao(uuid, text) to authenticated;

-- ---------- A sala só abre com a convocação feita ----------
create or replace function public.assembleia_abrir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem convoca (Presidente/coordenação ou Conselho Fiscal) abre a sala.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status <> 'agendada' then raise exception 'A assembleia não está agendada.'; end if;
  if now() < a.data_hora - interval '30 minutes' then raise exception 'A sala abre 30 minutos antes do horário do edital.'; end if;
  if a.tipo <> 'pre' then
    if a.convocacao_enviada_em is null then
      raise exception 'Não há registro da convocação por e-mail a todos os cooperados (Lei 12.690, art. 12; Estatuto, art. 34). Sem ela a assembleia é irregular: cancele e convoque outra data.';
    end if;
    if a.convocacao_whatsapp_em is null then
      raise exception 'Registre o aviso no aplicativo de mensagens antes de abrir a sala (Regimento, art. 61).';
    end if;
    if a.mesa_presidente is null or a.mesa_secretario is null then
      raise exception 'Defina quem preside e quem secretaria a mesa antes de abrir a sala (Estatuto, art. 36).';
    end if;
  end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set status = 'aberta', aberta_em = now() where id = p_id;
end;
$$;

-- ---------- 4. Quórum: assembleia digital tem convocação única ----------
create or replace function public.assembleia_quorum(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.assembleias; n int; pres int; req int;
begin
  select * into a from public.assembleias where id = p_id;
  n := coalesce(a.membros_na_data, public.quadro_social());
  pres := (select count(*) from public.assembleia_presencas where assembleia_id = p_id and apto);
  -- Estatuto, art. 30, §2º: horário único e quórum verificável durante toda a sessão.
  -- Sem 2ª e 3ª convocações, vale o quórum da 1ª: 2/3 dos cooperados (Lei 12.690, art. 11, §3º, I; Estatuto, art. 32).
  req := ceil(n * 2.0 / 3);
  return jsonb_build_object('membros', n, 'presentes', pres, 'convocacao', 1, 'necessario', req, 'atingido', pres >= req, 'tipo', a.tipo);
end;
$$;

-- ---------- 5. A ata só fecha com a gravação ----------
create or replace function public.ata_fechar(p_id uuid, p_texto text, p_pdf text, p_hash text, p_signatarios jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.e_mesa(p_id) then raise exception 'Só a mesa fecha a ata.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status not in ('encerrada', 'sem_quorum') then raise exception 'A ata é fechada depois do encerramento.'; end if;
  if a.ata_fechada_em is not null then raise exception 'A ata já foi fechada e não muda mais.'; end if;
  if a.tipo <> 'pre' and coalesce(trim(a.gravacao_url), '') = '' then
    raise exception 'Salve o link da gravação antes de fechar a ata: a gravação é obrigatória e integra a ata (Estatuto, arts. 31, §1º, III, e 39, §3º).';
  end if;
  if coalesce(p_texto, '') = '' or coalesce(p_pdf, '') = '' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Ata incompleta.'; end if;
  if jsonb_typeof(p_signatarios) <> 'array' or jsonb_array_length(p_signatarios) = 0 then raise exception 'Informe quem assina a ata.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set ata = p_texto, ata_pdf = p_pdf, ata_hash = p_hash, ata_signatarios = p_signatarios, ata_fechada_em = now() where id = p_id;
end;
$$;

-- ---------- 6. Registro da ata na JUCERJA ----------
create or replace function public.assembleia_jucerja(p_id uuid, p_protocolo text, p_protocolo_em date, p_arquivado_em date, p_dispensa text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só a gestão registra o protocolo na JUCERJA.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.tipo = 'pre' then raise exception 'Pré-assembleia não tem ata para registrar.'; end if;
  if a.ata_publicada_em is null then raise exception 'Publique a ata assinada antes de registrar o protocolo.'; end if;
  if coalesce(trim(p_dispensa), '') = '' and (coalesce(trim(p_protocolo), '') = '' or p_protocolo_em is null) then
    raise exception 'Informe o número e a data do protocolo na JUCERJA, ou o motivo de a ata não ir a registro.';
  end if;
  if p_protocolo_em is not null and p_protocolo_em > current_date then raise exception 'A data do protocolo não pode estar no futuro.'; end if;
  if p_arquivado_em is not null and p_protocolo_em is not null and p_arquivado_em < p_protocolo_em then raise exception 'O arquivamento não pode ser anterior ao protocolo.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set jucerja_protocolo = nullif(trim(p_protocolo), ''), jucerja_protocolo_em = p_protocolo_em,
    jucerja_arquivado_em = p_arquivado_em, jucerja_dispensa = nullif(trim(p_dispensa), '') where id = p_id;
end;
$$;
grant execute on function public.assembleia_jucerja(uuid, text, date, date, text) to authenticated;

-- ---------- 7. Assembleias realizadas fora do site ----------
create table if not exists public.assembleias_externas (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('constituicao', 'ordinaria', 'extraordinaria', 'especial')),
  data          date not null,
  descricao     text not null,
  jucerja_protocolo text,
  jucerja_arquivado_em date,
  arquivo_url   text,
  criado_nome   text,
  criado_em     timestamptz not null default now()
);
alter table public.assembleias_externas enable row level security;
drop policy if exists asmext_ver on public.assembleias_externas;
create policy asmext_ver on public.assembleias_externas for select to authenticated using (public.is_ativo() or public.pode_convocar());
drop policy if exists asmext_gerir on public.assembleias_externas;
create policy asmext_gerir on public.assembleias_externas for all to authenticated using (public.pode_convocar()) with check (public.pode_convocar());

-- ---------- 8. Pendências legais ----------
create or replace function public.assembleias_pendencias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  ano int := extract(year from (now() at time zone 'America/Sao_Paulo'));
  inicio int := 2026;  -- ano de constituição da cooperativa
  out jsonb := '[]'::jsonb; a record; tem boolean; prazo date;
begin
  if not (public.pode_convocar() or public.is_ativo()) then return out; end if;

  -- AGO do ano (contas do exercício anterior), de janeiro a março
  if ano - 1 >= inicio then
    tem := exists (select 1 from public.assembleias x where x.tipo = 'ordinaria' and x.status = 'encerrada' and extract(year from x.data_hora at time zone 'America/Sao_Paulo') = ano)
        or exists (select 1 from public.assembleias_externas e where e.tipo = 'ordinaria' and extract(year from e.data) = ano);
    if not tem then
      if exists (select 1 from public.assembleias x where x.tipo = 'ordinaria' and x.status in ('agendada', 'aberta', 'instalada') and extract(year from x.data_hora at time zone 'America/Sao_Paulo') = ano) then
        null;
      elsif hoje <= make_date(ano, 3, 21) then
        out := out || jsonb_build_object('nivel', 'aviso', 'texto', format('Convocar a AGO de %s (contas de %s) até 21/03, para acontecer até 31/03 (Lei 5.764, art. 44).', ano, ano - 1));
      else
        out := out || jsonb_build_object('nivel', 'grave', 'texto', format('A AGO de %s, com as contas de %s, não foi realizada no prazo de 31/03 (Lei 5.764, art. 44). Convoque o quanto antes.', ano, ano - 1));
      end if;
    end if;
  end if;

  -- Assembleia Geral Especial no 2º semestre (Lei 12.690, art. 11, §6º)
  if extract(month from hoje) >= 7 then
    tem := exists (select 1 from public.assembleias x where x.tipo = 'especial' and x.status = 'encerrada'
                     and (x.data_hora at time zone 'America/Sao_Paulo')::date between make_date(ano, 7, 1) and make_date(ano, 12, 31))
        or exists (select 1 from public.assembleias_externas e where e.tipo = 'especial' and e.data between make_date(ano, 7, 1) and make_date(ano, 12, 31));
    if not tem and not exists (select 1 from public.assembleias x where x.tipo = 'especial' and x.status in ('agendada', 'aberta', 'instalada')
                                 and (x.data_hora at time zone 'America/Sao_Paulo')::date between hoje and make_date(ano, 12, 31)) then
      out := out || jsonb_build_object('nivel', case when extract(month from hoje) = 12 then 'grave' else 'aviso' end,
        'texto', format('Falta a Assembleia Geral Especial do 2º semestre de %s (Lei 12.690, art. 11, §6º). O edital precisa sair até 21/12.', ano));
    end if;
  end if;

  for a in select * from public.assembleias where status not in ('rascunho', 'cancelada') order by data_hora loop
    -- convocação
    if a.status = 'agendada' and a.tipo <> 'pre' then
      if a.convocacao_enviada_em is null then
        prazo := ((a.data_hora - interval '10 days') at time zone 'America/Sao_Paulo')::date;
        if now() > a.data_hora - interval '10 days' then
          out := out || jsonb_build_object('nivel', 'grave', 'assembleia_id', a.id, 'texto', format('%s: o prazo para o e-mail de convocação (10 dias antes) passou sem registro. Cancele e convoque outra data.', a.titulo));
        else
          out := out || jsonb_build_object('nivel', 'aviso', 'assembleia_id', a.id, 'texto', format('%s: envie a convocação por e-mail a todos até %s e registre no site.', a.titulo, to_char(prazo, 'DD/MM/YYYY')));
        end if;
      end if;
      if a.convocacao_whatsapp_em is null then
        out := out || jsonb_build_object('nivel', 'aviso', 'assembleia_id', a.id, 'texto', format('%s: falta registrar o aviso no grupo de WhatsApp (Regimento, art. 61).', a.titulo));
      end if;
      if a.mesa_presidente is null or a.mesa_secretario is null then
        out := out || jsonb_build_object('nivel', 'aviso', 'assembleia_id', a.id, 'texto', format('%s: defina quem preside e quem secretaria a mesa (Estatuto, art. 36).', a.titulo));
      end if;
    end if;
    -- ata em até 10 dias (Regimento, art. 63)
    if a.tipo <> 'pre' and a.status in ('encerrada', 'sem_quorum') and a.ata_publicada_em is null
       and a.encerrada_em is not null and now() > a.encerrada_em + interval '7 days' then
      out := out || jsonb_build_object('nivel', case when now() > a.encerrada_em + interval '10 days' then 'grave' else 'aviso' end, 'assembleia_id', a.id,
        'texto', format('%s: a ata precisa estar assinada e publicada até %s (Regimento, art. 63).', a.titulo, to_char((a.encerrada_em + interval '10 days') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')));
    end if;
    -- JUCERJA em até 30 dias da assinatura (Lei 8.934/94, art. 36)
    if a.tipo <> 'pre' and a.status = 'encerrada' and a.ata_publicada_em is not null and a.jucerja_protocolo is null and a.jucerja_dispensa is null then
      prazo := ((coalesce(a.ata_concluida_em, a.ata_publicada_em) + interval '30 days') at time zone 'America/Sao_Paulo')::date;
      out := out || jsonb_build_object('nivel', case when hoje > prazo then 'grave' when hoje > prazo - 10 then 'aviso' else 'info' end, 'assembleia_id', a.id,
        'texto', format('%s: protocolar a ata na JUCERJA até %s, para valer desde a data da assembleia (Lei 8.934/94, art. 36).', a.titulo, to_char(prazo, 'DD/MM/YYYY')));
    end if;
  end loop;
  return out;
end;
$$;
grant execute on function public.assembleias_pendencias() to authenticated;

-- assembleias de 2026 feitas antes do módulo (atas arquivadas na JUCERJA)
insert into public.assembleias_externas (tipo, data, descricao, jucerja_protocolo, jucerja_arquivado_em, criado_nome)
select 'constituicao', date '2026-01-28', 'Assembleia Geral de Constituição: aprovação do Estatuto Social e eleição dos órgãos', '2026/00337325-5', date '2026-03-30', 'migração 052'
where not exists (select 1 from public.assembleias_externas where tipo = 'constituicao');
insert into public.assembleias_externas (tipo, data, descricao, jucerja_protocolo, jucerja_arquivado_em, criado_nome)
select 'especial', date '2026-08-17', 'Assembleia Geral Especial: Regimento Interno e nomeação do Conselho de Administração (por WhatsApp)', '2026/01055834-6', date '2026-09-28', 'migração 052'
where not exists (select 1 from public.assembleias_externas where tipo = 'especial' and data = date '2026-08-17');

-- pautas que já existem: as de 2/3 viram reforma do Estatuto só se o título disser isso; o resto fica "geral"
update public.assembleia_pautas set materia = 'geral' where materia is null;

select 'migracao 052 ok' as resultado;
