-- =====================================================================
-- BIMCORE — migração 005: vínculo automático da planilha financeira
-- Linhas da planilha cujo cooperado ainda não tem cadastro no site ficam
-- guardadas como "pendentes" no envio. Quando a pessoa se cadastra (ou
-- muda nome/e-mail/status), a posição dela é criada automaticamente a
-- partir da planilha atual — pelo e-mail ou pelo nome.
-- =====================================================================

alter table public.financeiro_importacoes add column if not exists pendentes jsonb;

create or replace function public.nome_normalizado(t text) returns text
language sql immutable as $$
  select lower(trim(regexp_replace(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'), '\s+', ' ', 'g')));
$$;

create or replace function public.nomes_combinam(a text, b text) returns boolean
language sql immutable as $$
  select public.nome_normalizado(a) <> '' and (
    public.nome_normalizado(a) = public.nome_normalizado(b)
    or (split_part(public.nome_normalizado(a), ' ', 1) = split_part(public.nome_normalizado(b), ' ', 1)
        and regexp_replace(public.nome_normalizado(a), '^.* ', '') = regexp_replace(public.nome_normalizado(b), '^.* ', '')
        and position(' ' in public.nome_normalizado(a)) > 0
        and position(' ' in public.nome_normalizado(b)) > 0));
$$;

create or replace function public.vincular_financeiro_pendente(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p   public.perfis;
  imp public.financeiro_importacoes;
  e   jsonb;
begin
  select * into p from public.perfis where id = p_id;
  if not found then return; end if;
  select * into imp from public.financeiro_importacoes order by criado_em desc limit 1;
  if not found or imp.pendentes is null then return; end if;
  if exists (select 1 from public.financeiro_posicoes where importacao_id = imp.id and cooperado_id = p_id) then return; end if;

  select x into e from jsonb_array_elements(imp.pendentes) x
   where (coalesce(x->>'email', '') <> '' and lower(trim(x->>'email')) = lower(trim(p.email)))
      or public.nomes_combinam(x->>'nome', p.nome)
   order by (lower(trim(coalesce(x->>'email', ''))) = lower(trim(p.email))) desc,
            (public.nome_normalizado(x->>'nome') = public.nome_normalizado(p.nome)) desc
   limit 1;
  if e is null then return; end if;

  insert into public.financeiro_posicoes (importacao_id, cooperado_id, data_base,
    quotas_subscritas, capital_subscrito, capital_integralizado, contribuicoes_pagas, contribuicao_mensal,
    valor_em_aberto, meses_em_atraso, fic_saldo, fundo_13, fundo_ferias, sobras_a_receber, outros_creditos,
    observacao, detalhes)
  select imp.id, p_id, imp.data_base,
    r.quotas_subscritas, r.capital_subscrito, r.capital_integralizado, r.contribuicoes_pagas, r.contribuicao_mensal,
    r.valor_em_aberto, r.meses_em_atraso, r.fic_saldo, r.fundo_13, r.fundo_ferias, r.sobras_a_receber, r.outros_creditos,
    r.observacao, r.detalhes
  from jsonb_populate_record(null::public.financeiro_posicoes, e->'dados') r;
end $$;

create or replace function public.ao_mudar_perfil_financeiro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.vincular_financeiro_pendente(new.id);
  return new;
end $$;

drop trigger if exists vincular_financeiro on public.perfis;
create trigger vincular_financeiro after insert or update of nome, email, status on public.perfis
  for each row execute function public.ao_mudar_perfil_financeiro();

revoke execute on function public.vincular_financeiro_pendente(uuid) from public, anon, authenticated;
