-- =====================================================================
-- BIMCORE — migração 002: solicitação de admissão de cooperados
-- =====================================================================

alter table public.perfis
  add column if not exists cidade                text,
  add column if not exists area_atuacao          text,
  add column if not exists formacao              text,
  add column if not exists registro_profissional text,
  add column if not exists curriculo_url         text,
  add column if not exists experiencia           text,
  add column if not exists motivacao             text,
  add column if not exists analise_obs           text,
  add column if not exists analisado_em          timestamptz;

alter table public.perfis drop constraint if exists perfis_status_check;
alter table public.perfis add constraint perfis_status_check
  check (status in ('pendente','entrevista','ativo','recusado','desligado'));

-- O perfil nasce com os dados da solicitação enviados no cadastro
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfis (id, email, nome, telefone, cidade, area_atuacao, especialidade,
                             formacao, registro_profissional, curriculo_url, experiencia, motivacao)
  values (new.id, new.email,
          left(coalesce(m->>'nome', ''), 120),
          left(m->>'telefone', 40),
          left(m->>'cidade', 120),
          left(m->>'area_atuacao', 120),
          left(m->>'area_atuacao', 120),
          left(m->>'formacao', 200),
          left(m->>'registro_profissional', 80),
          left(m->>'curriculo_url', 300),
          left(m->>'experiencia', 3000),
          left(m->>'motivacao', 3000))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Só a coordenação muda status, papel e parecer; registra a data da análise
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() nulo = comando rodado pelo painel do Supabase (administrador)
  if auth.uid() is not null and not public.is_coordenacao() then
    new.papel := old.papel;
    new.status := old.status;
    new.email := old.email;
    new.data_ingresso := old.data_ingresso;
    new.analise_obs := old.analise_obs;
    new.analisado_em := old.analisado_em;
  end if;
  if new.status is distinct from old.status then
    new.analisado_em := now();
  end if;
  if new.status = 'ativo' and new.data_ingresso is null then
    new.data_ingresso := current_date;
  end if;
  return new;
end;
$$;
