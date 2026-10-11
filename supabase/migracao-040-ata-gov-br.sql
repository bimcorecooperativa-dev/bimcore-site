-- =====================================================================
-- BIMCORE — migração 040: mesa, comissão, ata redigida ao vivo e assinatura gov.br
-- Estatuto, art. 39: ata circunstanciada, assinada pela Mesa, pelos administradores
-- e conselheiros fiscais presentes e por comissão de até 5 cooperados designada
-- pela própria Assembleia. Assinatura válida da ata: gov.br (Lei 14.063/2020),
-- colhida um por um sobre o mesmo PDF, que o site trava e identifica pelo SHA-256.
--  • Mesa (presidente e secretário) e comissão proposta: definidas na marcação,
--    até a instalação. Na instalação, a designação da comissão entra como
--    primeiro item, votado pela assembleia.
--  • Anotações da mesa (abertura, cada pauta, assuntos gerais): só durante a sessão.
--  • Depois do encerramento, a mesa fecha a ata: texto + PDF + hash + lista de
--    signatários. Nada disso muda depois.
--  • Cada signatário baixa a versão atual, assina no gov.br e devolve. O site
--    guarda cada versão; a ata só é publicada com todas as assinaturas.
--  • A "assinatura" dentro do site passa a ser só a confirmação de presença e
--    participação (lista de presença), que não substitui a assinatura da ata.
-- =====================================================================

alter table public.assembleias add column if not exists mesa_presidente uuid references public.perfis(id) on delete set null;
alter table public.assembleias add column if not exists mesa_secretario uuid references public.perfis(id) on delete set null;
alter table public.assembleias add column if not exists comissao_proposta uuid[] not null default '{}';
alter table public.assembleias add column if not exists comissao uuid[];
alter table public.assembleias add column if not exists notas jsonb not null default '{}'::jsonb;
alter table public.assembleias add column if not exists ata_fechada_em timestamptz;
alter table public.assembleias add column if not exists ata_hash text;
alter table public.assembleias add column if not exists ata_pdf text;
alter table public.assembleias add column if not exists ata_signatarios jsonb;
alter table public.assembleias add column if not exists ata_concluida_em timestamptz;
alter table public.assembleia_pautas add column if not exists especial text check (especial is null or especial in ('comissao'));

create table if not exists public.assembleia_ata_versoes (
  id            uuid primary key default gen_random_uuid(),
  assembleia_id uuid not null references public.assembleias(id) on delete cascade,
  ordem         int not null,
  perfil_id     uuid,
  nome          text,
  arquivo       text not null,
  sha256        text not null,
  tamanho       int,
  assinaturas   int,
  prefixo_ok    boolean,
  enviado_por   uuid default auth.uid(),
  enviado_nome  text,
  enviado_em    timestamptz not null default now(),
  unique (assembleia_id, ordem)
);
alter table public.assembleia_ata_versoes enable row level security;
drop policy if exists asmav_ver on public.assembleia_ata_versoes;
create policy asmav_ver on public.assembleia_ata_versoes for select to authenticated using (public.is_ativo() or public.pode_convocar());

create or replace function public.e_mesa(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.pode_convocar() or exists (select 1 from public.assembleias a where a.id = p_id and auth.uid() in (a.mesa_presidente, a.mesa_secretario));
$$;
grant execute on function public.e_mesa(uuid) to authenticated;

-- ---------- Regras da tabela ----------
create or replace function public.regras_assembleia() returns trigger
language plpgsql security definer set search_path = public as $$
declare rpc boolean := coalesce(current_setting('bimcore.rpc', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then raise exception 'A assembleia começa como rascunho; depois publique o edital.'; end if;
    if coalesce(array_length(new.comissao_proposta, 1), 0) > 5 then raise exception 'A comissão tem no máximo 5 cooperados (Estatuto, art. 39, §1º).'; end if;
    new.criado_nome := (select nome from public.perfis where id = auth.uid());
    new.comissao := null; new.notas := '{}'::jsonb; new.ata := null; new.ata_fechada_em := null; new.ata_hash := null; new.ata_pdf := null; new.ata_signatarios := null; new.ata_concluida_em := null;
    return new;
  end if;
  if rpc then return new; end if;
  -- campos que só as funções da sala mudam
  if new.comissao is distinct from old.comissao or new.notas is distinct from old.notas or new.ata is distinct from old.ata
     or new.ata_fechada_em is distinct from old.ata_fechada_em or new.ata_hash is distinct from old.ata_hash or new.ata_pdf is distinct from old.ata_pdf
     or new.ata_signatarios is distinct from old.ata_signatarios or new.ata_concluida_em is distinct from old.ata_concluida_em
     or new.ata_publicada_em is distinct from old.ata_publicada_em then
    raise exception 'A ata e as anotações só mudam pelos botões da sala.';
  end if;
  if (new.mesa_presidente is distinct from old.mesa_presidente or new.mesa_secretario is distinct from old.mesa_secretario or new.comissao_proposta is distinct from old.comissao_proposta)
     and old.status not in ('rascunho', 'agendada', 'aberta') then
    raise exception 'A mesa e a comissão proposta só mudam até a instalação da assembleia.';
  end if;
  if coalesce(array_length(new.comissao_proposta, 1), 0) > 5 then raise exception 'A comissão tem no máximo 5 cooperados (Estatuto, art. 39, §1º).'; end if;
  if new.gravacao_url is distinct from old.gravacao_url and old.ata_fechada_em is not null then raise exception 'A ata já foi fechada; o link da gravação não muda mais.'; end if;
  if old.status = 'rascunho' and new.status = 'agendada' then
    if new.tipo <> 'pre' and new.data_hora < now() + interval '10 days' then
      raise exception 'O edital precisa ser publicado com pelo menos 10 dias de antecedência (Estatuto, art. 30).';
    end if;
    if not exists (select 1 from public.assembleia_pautas where assembleia_id = new.id) then
      raise exception 'Inclua ao menos uma pauta na ordem do dia (Estatuto, art. 33, IV).';
    end if;
    new.edital_publicado_em := now();
    new.membros_na_data := public.quadro_social();
    return new;
  end if;
  if new.status = 'cancelada' and old.status in ('rascunho', 'agendada') then return new; end if;
  if new.status is distinct from old.status then raise exception 'Use os botões da sala para mudar o andamento da assembleia.'; end if;
  if old.status <> 'rascunho' then
    if new.data_hora is distinct from old.data_hora or new.tipo is distinct from old.tipo or new.titulo is distinct from old.titulo or new.duracao_min is distinct from old.duracao_min then
      raise exception 'Depois do edital publicado, data, tipo e ordem do dia não mudam. Cancele e convoque outra assembleia.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- Instalação: a designação da comissão entra como primeiro item ----------
create or replace function public.assembleia_instalar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.assembleias; q jsonb; nomes text;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia a instala.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status <> 'aberta' then raise exception 'A sala precisa estar aberta.'; end if;
  if a.tipo <> 'pre' then
    if a.mesa_presidente is null or a.mesa_secretario is null then raise exception 'Defina quem preside e quem secretaria a mesa antes de instalar (Estatuto, art. 36).'; end if;
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
  if a.tipo <> 'pre' and coalesce(array_length(a.comissao_proposta, 1), 0) > 0
     and not exists (select 1 from public.assembleia_pautas where assembleia_id = p_id and especial = 'comissao') then
    select string_agg(nome, ', ' order by nome) into nomes from public.perfis where id = any(a.comissao_proposta);
    insert into public.assembleia_pautas (assembleia_id, ordem, titulo, descricao, quorum, especial)
    values (p_id, 0, 'Designação da comissão que assina a ata (Estatuto, art. 39, §1º)', 'Proposta: ' || coalesce(nomes, '—') || '.', 'maioria', 'comissao');
  end if;
  return q;
end;
$$;

-- aprovada a pauta da comissão, a comissão fica designada
create or replace function public.pauta_comissao_aprovada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.especial = 'comissao' and new.status = 'encerrada' and old.status <> 'encerrada' and new.resultado->>'resultado' = 'aprovada' then
    perform set_config('bimcore.rpc', '1', true);
    update public.assembleias set comissao = comissao_proposta where id = new.assembleia_id;
  end if;
  return new;
end;
$$;
drop trigger if exists pauta_comissao_aprovada on public.assembleia_pautas;
create trigger pauta_comissao_aprovada after update on public.assembleia_pautas for each row execute function public.pauta_comissao_aprovada();

-- comissão escolhida de outro jeito na sessão (proposta rejeitada e nova indicação, por exemplo)
create or replace function public.assembleia_comissao(p_id uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.e_mesa(p_id) then raise exception 'Só a mesa registra a comissão.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status <> 'instalada' then raise exception 'A comissão é designada durante a assembleia.'; end if;
  if coalesce(array_length(p_ids, 1), 0) not between 1 and 5 then raise exception 'A comissão tem de 1 a 5 cooperados (Estatuto, art. 39, §1º).'; end if;
  if exists (select 1 from unnest(p_ids) x where not exists (select 1 from public.assembleia_presencas pr where pr.assembleia_id = p_id and pr.perfil_id = x)) then
    raise exception 'A comissão só pode ter cooperados presentes.';
  end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set comissao = p_ids where id = p_id;
end;
$$;

-- ---------- Anotações da mesa durante a sessão ----------
create or replace function public.assembleia_nota(p_id uuid, p_chave text, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.e_mesa(p_id) then raise exception 'Só a mesa (presidente e secretário) escreve na ata.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status not in ('aberta', 'instalada') then raise exception 'As anotações da ata são feitas durante a sessão. Depois do encerramento, o texto fica travado.'; end if;
  if p_chave !~ '^(abertura|gerais|[0-9a-f-]{36})$' then raise exception 'Campo inválido.'; end if;
  if char_length(coalesce(p_texto, '')) > 20000 then raise exception 'Texto longo demais.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set notas = notas || jsonb_build_object(p_chave, coalesce(p_texto, '')) where id = p_id;
end;
$$;

-- ---------- Presença e participação (dentro do site; não é a assinatura da ata) ----------
create or replace function public.ata_assinar(p_id uuid, p_qualidade text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  select * into a from public.assembleias where id = p_id;
  if a.status not in ('aberta', 'instalada', 'encerrada', 'sem_quorum') then raise exception 'A confirmação de presença é feita durante ou logo depois da assembleia.'; end if;
  if a.ata_publicada_em is not null then raise exception 'A ata já foi publicada.'; end if;
  if not exists (select 1 from public.assembleia_presencas where assembleia_id = p_id and perfil_id = auth.uid()) then raise exception 'Só quem esteve presente confirma a presença.'; end if;
  insert into public.assembleia_assinaturas (assembleia_id, perfil_id, nome, qualidade)
  values (p_id, auth.uid(), (select nome from public.perfis where id = auth.uid()), 'presença e participação')
  on conflict (assembleia_id, perfil_id) do update set em = now();
end;
$$;

-- ---------- Fechamento da ata ----------
-- CPFs dos signatários (da ficha de admissão), só para a mesa montar o bloco de assinaturas
create or replace function public.assembleia_cpfs(p_id uuid) returns table (perfil_id uuid, cpf text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.e_mesa(p_id) then raise exception 'Só a mesa vê esses dados.'; end if;
  return query select f.perfil_id, f.cpf from public.admissao_fichas f
    where f.perfil_id in (select pr.perfil_id from public.assembleia_presencas pr where pr.assembleia_id = p_id) and coalesce(f.cpf, '') <> '';
end;
$$;

create or replace function public.ata_fechar(p_id uuid, p_texto text, p_pdf text, p_hash text, p_signatarios jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.e_mesa(p_id) then raise exception 'Só a mesa fecha a ata.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status not in ('encerrada', 'sem_quorum') then raise exception 'A ata é fechada depois do encerramento.'; end if;
  if a.ata_fechada_em is not null then raise exception 'A ata já foi fechada e não muda mais.'; end if;
  if coalesce(p_texto, '') = '' or coalesce(p_pdf, '') = '' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Ata incompleta.'; end if;
  if jsonb_typeof(p_signatarios) <> 'array' or jsonb_array_length(p_signatarios) = 0 then raise exception 'Informe quem assina a ata.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set ata = p_texto, ata_pdf = p_pdf, ata_hash = p_hash, ata_signatarios = p_signatarios, ata_fechada_em = now() where id = p_id;
end;
$$;

-- ---------- Coleta das assinaturas gov.br, uma por vez ----------
create or replace function public.ata_versao(p_id uuid, p_arquivo text, p_sha text, p_tamanho int, p_assinaturas int, p_prefixo_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias; k int; n int; sig jsonb;
begin
  select * into a from public.assembleias where id = p_id for update;
  if a.ata_fechada_em is null then raise exception 'A ata ainda não foi fechada.'; end if;
  if a.ata_concluida_em is not null then raise exception 'Todas as assinaturas já foram colhidas.'; end if;
  k := (select count(*) from public.assembleia_ata_versoes where assembleia_id = p_id);
  n := jsonb_array_length(a.ata_signatarios);
  sig := a.ata_signatarios -> k;
  if auth.uid()::text <> sig->>'perfil_id' and not public.pode_convocar() then
    raise exception 'Agora é a vez de % assinar.', sig->>'nome';
  end if;
  if p_sha !~ '^[0-9a-f]{64}$' or coalesce(p_arquivo, '') = '' then raise exception 'Arquivo inválido.'; end if;
  if p_sha = a.ata_hash or exists (select 1 from public.assembleia_ata_versoes where assembleia_id = p_id and sha256 = p_sha) then
    raise exception 'Este arquivo é igual a uma versão anterior: falta a assinatura gov.br.';
  end if;
  insert into public.assembleia_ata_versoes (assembleia_id, ordem, perfil_id, nome, arquivo, sha256, tamanho, assinaturas, prefixo_ok, enviado_nome)
  values (p_id, k + 1, (sig->>'perfil_id')::uuid, sig->>'nome', p_arquivo, p_sha, p_tamanho, p_assinaturas, p_prefixo_ok, (select nome from public.perfis where id = auth.uid()));
  if k + 1 >= n then
    perform set_config('bimcore.rpc', '1', true);
    update public.assembleias set ata_concluida_em = now() where id = p_id;
  end if;
end;
$$;

-- arquivo errado: a mesa desfaz a última versão enviada
create or replace function public.ata_versao_desfazer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia desfaz uma versão.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.ata_publicada_em is not null then raise exception 'A ata já foi publicada.'; end if;
  delete from public.assembleia_ata_versoes where assembleia_id = p_id and ordem = (select max(ordem) from public.assembleia_ata_versoes where assembleia_id = p_id);
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set ata_concluida_em = null where id = p_id;
end;
$$;

create or replace function public.ata_publicar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assembleias;
begin
  if not public.pode_convocar() then raise exception 'Só quem dirige a assembleia publica a ata.'; end if;
  select * into a from public.assembleias where id = p_id for update;
  if a.status not in ('encerrada', 'sem_quorum') then raise exception 'A assembleia ainda não foi encerrada.'; end if;
  if a.ata_fechada_em is null then raise exception 'Feche a ata antes de publicar.'; end if;
  if a.ata_concluida_em is null then raise exception 'Faltam assinaturas gov.br na ata.'; end if;
  perform set_config('bimcore.rpc', '1', true);
  update public.assembleias set ata_publicada_em = now() where id = p_id;
end;
$$;

grant execute on function public.assembleia_comissao(uuid, uuid[]), public.assembleia_nota(uuid, text, text), public.assembleia_cpfs(uuid),
  public.ata_fechar(uuid, text, text, text, jsonb), public.ata_versao(uuid, text, text, int, int, boolean), public.ata_versao_desfazer(uuid) to authenticated;

-- PDFs da ata: privados; qualquer cooperado ativo lê e envia a versão assinada (a função ata_versao confere a vez)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atas', 'atas', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists atas_enviar on storage.objects;
create policy atas_enviar on storage.objects for insert to authenticated with check (bucket_id = 'atas' and (public.is_ativo() or public.pode_convocar()));
drop policy if exists atas_ver on storage.objects;
create policy atas_ver on storage.objects for select to authenticated using (bucket_id = 'atas' and (public.is_ativo() or public.pode_convocar()));

select 'migracao 040 ok' as resultado;
