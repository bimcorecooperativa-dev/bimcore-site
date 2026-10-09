-- =====================================================================
-- BIMCORE — migração 022: chat do projeto (com anexos e registros automáticos)
-- e arquivamento ao final: exporta tudo e apaga do site o que é de trabalho.
-- Ficam no site apenas o necessário para as contas e a experiência: o contrato,
-- as parcelas, as horas lançadas e um resumo do projeto (onde foi arquivado,
-- IEO e médias da avaliação entre pares).
-- =====================================================================

create table if not exists public.projeto_mensagens (
  id            uuid primary key default gen_random_uuid(),
  projeto_id    uuid not null references public.projetos(id) on delete cascade,
  autor_id      uuid default auth.uid(),
  autor_nome    text,
  tipo          text not null default 'msg' check (tipo in ('msg', 'sistema')),
  texto         text check (texto is null or char_length(texto) <= 4000),
  anexo_caminho text,
  anexo_nome    text,
  anexo_tamanho bigint,
  criado_em     timestamptz not null default now(),
  check (coalesce(trim(texto), '') <> '' or anexo_caminho is not null)
);
create index if not exists projeto_mensagens_p on public.projeto_mensagens (projeto_id, criado_em);
alter table public.projeto_mensagens enable row level security;

drop policy if exists pmsg_ver on public.projeto_mensagens;
create policy pmsg_ver on public.projeto_mensagens for select to authenticated
  using (public.membro_projeto(projeto_id) or public.gere_projeto(projeto_id) or public.is_fiscal());
drop policy if exists pmsg_enviar on public.projeto_mensagens;
create policy pmsg_enviar on public.projeto_mensagens for insert to authenticated
  with check (tipo = 'msg' and autor_id = auth.uid() and (public.membro_projeto(projeto_id) or public.gere_projeto(projeto_id))
              and exists (select 1 from public.projetos where id = projeto_id and coordenador_id is not null and status <> 'Arquivado'));

create or replace function public.regras_mensagem() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'msg' then
    new.autor_id := auth.uid(); new.autor_nome := (select nome from public.perfis where id = auth.uid());
    if new.anexo_caminho is not null and split_part(new.anexo_caminho, '/', 1) <> new.projeto_id::text then
      raise exception 'Anexo fora da pasta do projeto.';
    end if;
  end if;
  new.criado_em := now();
  return new;
end;
$$;
drop trigger if exists regras_mensagem on public.projeto_mensagens;
create trigger regras_mensagem before insert on public.projeto_mensagens for each row execute function public.regras_mensagem();

-- registro automático no chat
create or replace function public.chat_sistema(p_projeto uuid, p_texto text) returns void
language sql security definer set search_path = public as $$
  insert into public.projeto_mensagens (projeto_id, autor_id, autor_nome, tipo, texto) values (p_projeto, null, 'Registro do site', 'sistema', p_texto);
$$;

-- Arquivos do projeto (PDF e imagens, até 20 MB cada)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projetos', 'projetos', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists proj_arq_ver on storage.objects;
create policy proj_arq_ver on storage.objects for select to authenticated
  using (bucket_id = 'projetos' and (public.membro_projeto(((storage.foldername(name))[1])::uuid) or public.gere_projeto(((storage.foldername(name))[1])::uuid) or public.is_fiscal()));
drop policy if exists proj_arq_enviar on storage.objects;
create policy proj_arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'projetos' and (public.membro_projeto(((storage.foldername(name))[1])::uuid) or public.gere_projeto(((storage.foldername(name))[1])::uuid)));
drop policy if exists proj_arq_apagar on storage.objects;
create policy proj_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'projetos' and public.gere_projeto(((storage.foldername(name))[1])::uuid));

-- ---------- Registros automáticos ----------
create or replace function public.chat_adesao() returns trigger
language plpgsql security definer set search_path = public as $$
declare f public.projeto_funcoes; fn text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select * into f from public.projeto_funcoes where id = new.funcao_id;
  fn := case f.funcao when 'coordenacao' then 'Coordenação BIM' when 'supervisao' then 'Supervisão técnica e simulação' when 'projeto' then 'Projeto da disciplina'
        when 'orcamento' then 'Orçamento e planejamento' when 'modelagem' then 'Modelagem BIM' when 'campo' then 'Levantamento e campo' else 'Outra função' end
        || case when f.disciplina is not null and f.disciplina <> 'geral' then ' (' || f.disciplina || ')' else '' end;
  if new.status = 'confirmada' then
    perform public.chat_sistema(new.projeto_id, new.nome || ' entrou na equipe: ' || fn || '. Confirmado por ' || coalesce(new.decidido_nome, 'coordenação') || '.');
  elsif new.status in ('encerrada', 'desistiu') and tg_op = 'UPDATE' and old.status = 'confirmada' then
    perform public.chat_sistema(new.projeto_id, new.nome || ' saiu da equipe (' || fn || ')' || coalesce(': ' || new.motivo, '') || '.');
  end if;
  return new;
end;
$$;
drop trigger if exists chat_adesao on public.projeto_adesoes;
create trigger chat_adesao after insert or update on public.projeto_adesoes for each row execute function public.chat_adesao();

create or replace function public.chat_apontamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  t := case new.tipo when 'bep' then 'não conformidade com o BEP' when 'interferencia' then 'interferência' when 'simulacao' then 'resultado de simulação' when 'cliente' then 'exigência do cliente' else 'sugestão' end;
  if tg_op = 'INSERT' then
    perform public.chat_sistema(new.projeto_id, new.autor_nome || ' registrou um apontamento (' || t || case when new.impeditivo then ', impeditivo' else '' end || ') para ' || coalesce(new.destinatario_nome, 'a equipe') || '. Fundamento: ' || new.fundamento || '. ' || left(new.descricao, 500));
  elsif new.status is distinct from old.status then
    perform public.chat_sistema(new.projeto_id, 'Apontamento (' || t || ') de ' || new.autor_nome || ': ' ||
      case new.status when 'corrigido' then 'corrigido. ' || coalesce(new.resposta, '') when 'contestado' then 'contestado, vai ao Conselho de Administração. ' || coalesce(new.resposta, '')
        when 'resolvido' then 'conferido e resolvido.' when 'cancelado' then coalesce('decisão do CA: ' || new.decisao, 'cancelado.') when 'aberto' then coalesce('decisão do CA: ' || new.decisao, 'reaberto. ' || coalesce(new.resposta, '')) else new.status end);
  end if;
  return new;
end;
$$;
drop trigger if exists chat_apontamento on public.projeto_apontamentos;
create trigger chat_apontamento after insert or update on public.projeto_apontamentos for each row execute function public.chat_apontamento();

create or replace function public.chat_marco() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.chat_sistema(new.projeto_id, 'Entrega prevista: ' || new.titulo || coalesce(' para ' || to_char(new.previsto, 'DD/MM/YYYY'), '') || '.');
  elsif new.entregue_em is not null and old.entregue_em is null then
    perform public.chat_sistema(new.projeto_id, 'Entrega registrada: ' || new.titulo || ' em ' || to_char(new.entregue_em, 'DD/MM/YYYY') || ', com relatório de conformidade de ' || coalesce(new.conformidade_nome, '') || '.');
  end if;
  return new;
end;
$$;
drop trigger if exists chat_marco on public.projeto_marcos;
create trigger chat_marco after insert or update on public.projeto_marcos for each row execute function public.chat_marco();

create or replace function public.chat_projeto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Arquivado' then return new; end if;
  if new.coordenador_id is distinct from old.coordenador_id and new.coordenador_id is not null then
    perform public.chat_sistema(new.id, case when old.coordenador_id is null then 'Chat do projeto aberto. ' else '' end || 'Coordenador do projeto: ' || coalesce(new.coordenador_nome, '') || coalesce(' (' || new.coordenador_ato || ')', '') || '.');
  end if;
  if new.status is distinct from old.status and new.status <> 'Arquivado' then
    perform public.chat_sistema(new.id, 'Situação do projeto: ' || new.status || '.');
  end if;
  if new.bep is distinct from old.bep or new.cde_url is distinct from old.cde_url then
    perform public.chat_sistema(new.id, 'O BEP foi atualizado por ' || coalesce((select nome from public.perfis where id = auth.uid()), '') || '.');
  end if;
  return new;
end;
$$;
drop trigger if exists chat_projeto on public.projetos;
create trigger chat_projeto after update on public.projetos for each row execute function public.chat_projeto();

-- aprovação de horas: um registro por pessoa a cada decisão
create or replace function public.aprovar_horas(p_ids uuid[], p_decisao text, p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare h public.producao; pr public.projetos; n int := 0; nm text; r record;
begin
  if p_decisao not in ('aprovada', 'devolvida') then raise exception 'Decisão inválida.'; end if;
  if p_decisao = 'devolvida' and coalesce(trim(p_motivo), '') = '' then raise exception 'Diga o que precisa ser ajustado para o cooperado corrigir.'; end if;
  nm := (select nome from public.perfis where id = auth.uid());
  perform set_config('bimcore.aprovando', 'sim', true);
  for h in select * from public.producao where id = any(p_ids) loop
    if h.cooperado_id = auth.uid() then raise exception 'Ninguém aprova as próprias horas.'; end if;
    select * into pr from public.projetos where id = h.projeto_id;
    if not ((pr.coordenador_id = auth.uid() and h.cooperado_id <> pr.coordenador_id) or public.is_ca()) then
      raise exception 'Só o coordenador do projeto (ou o Conselho de Administração, para as horas do próprio coordenador) aprova estas horas.';
    end if;
    update public.producao set aprovacao = p_decisao, aprovado_nome = nm, aprovado_em = now(), aprov_motivo = nullif(trim(p_motivo), '') where id = h.id;
    n := n + 1;
  end loop;
  perform set_config('bimcore.aprovando', '', true);
  for r in select p.projeto_id, pe.nome, sum(p.horas) as hs from public.producao p join public.perfis pe on pe.id = p.cooperado_id
            where p.id = any(p_ids) and p.projeto_id is not null group by 1, 2 loop
    perform public.chat_sistema(r.projeto_id, nm || case when p_decisao = 'aprovada' then ' aprovou ' else ' devolveu ' end || trim(to_char(r.hs, 'FM9999990.##')) || ' h de ' || r.nome
      || case when p_decisao = 'devolvida' then '. Ajuste pedido: ' || p_motivo else '' end || '.');
  end loop;
  return n;
end;
$$;

-- ---------- Arquivamento ----------
alter table public.projetos
  add column if not exists arquivado_em   timestamptz,
  add column if not exists arquivado_nome text,
  add column if not exists arquivo_local  text,
  add column if not exists resumo_arquivo jsonb;
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.projetos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.projetos drop constraint %I', c);
  end loop;
end $$;
alter table public.projetos add constraint projetos_status_check check (status in ('Prospecção', 'Proposta', 'Contratado', 'Em execução', 'Concluído', 'Suspenso', 'Arquivado'));

-- Depois de exportado e guardado fora do site: apaga chat, apontamentos, entregas, chamadas, equipe e avaliações.
-- Os arquivos do chat são apagados pelo navegador antes de chamar esta função.
create or replace function public.arquivar_projeto(p_projeto uuid, p_local text, p_resumo jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.projetos;
begin
  select * into pr from public.projetos where id = p_projeto for update;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if not public.gere_projeto(p_projeto) then raise exception 'Só o coordenador do projeto, a coordenação ou o CA arquiva o projeto.'; end if;
  if pr.status <> 'Concluído' then raise exception 'Só um projeto concluído pode ser arquivado.'; end if;
  if coalesce(trim(p_local), '') = '' then raise exception 'Informe onde o arquivo do projeto foi guardado.'; end if;
  delete from public.projeto_mensagens where projeto_id = p_projeto;
  delete from public.projeto_apontamentos where projeto_id = p_projeto;
  delete from public.projeto_marcos where projeto_id = p_projeto;
  delete from public.projeto_avaliacoes where projeto_id = p_projeto;
  delete from public.projeto_adesoes where projeto_id = p_projeto;
  delete from public.projeto_funcoes where projeto_id = p_projeto;
  perform set_config('bimcore.designando', 'sim', true);
  update public.projetos set status = 'Arquivado', bep = '{}'::jsonb, cde_url = null, arquivado_em = now(),
    arquivado_nome = (select nome from public.perfis where id = auth.uid()), arquivo_local = trim(p_local), resumo_arquivo = p_resumo
   where id = p_projeto;
  perform set_config('bimcore.designando', '', true);
end;
$$;
grant execute on function public.arquivar_projeto(uuid, text, jsonb) to authenticated;

select 'migracao 022 ok' as resultado;
