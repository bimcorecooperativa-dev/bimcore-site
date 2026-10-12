-- =====================================================================
-- BIMCORE — migração 043: dados cadastrais do cooperado (Ficha de Matrícula)
-- O cooperado ativo mantém a própria ficha pelo Meu perfil: qualificação civil
-- (vai para atas e JUCERJA), conselho profissional e número, e a chave Pix
-- para receber as retiradas. A coordenação ou o CA conferem; qualquer mudança
-- volta para conferência. Sem cadastro completo e conferido, não há retirada.
-- Quem vê a ficha: o próprio, o CA e a coordenação (como já era). A tesouraria
-- vê só a chave Pix, na hora de pagar.
-- =====================================================================

alter table public.admissao_fichas add column if not exists conselho text;            -- CREA, CAU, CFT, CRA... ou 'nenhum'
alter table public.admissao_fichas add column if not exists registro_numero text;
alter table public.admissao_fichas add column if not exists pix_tipo text check (pix_tipo is null or pix_tipo in ('cpf', 'email', 'telefone', 'aleatoria'));
alter table public.admissao_fichas add column if not exists pix_chave text;
alter table public.admissao_fichas add column if not exists cidade text;
alter table public.admissao_fichas add column if not exists dados_status text not null default 'incompleto' check (dados_status in ('incompleto', 'enviado', 'aprovado', 'devolvido'));
alter table public.admissao_fichas add column if not exists dados_motivo text;
alter table public.admissao_fichas add column if not exists dados_conferido_nome text;
alter table public.admissao_fichas add column if not exists dados_conferido_em timestamptz;

-- o cooperado ativo também cria e edita a própria ficha
drop policy if exists ficha_criar on public.admissao_fichas;
create policy ficha_criar on public.admissao_fichas for insert to authenticated
  with check (perfil_id = auth.uid() and (public.e_candidato() or public.is_ativo()));
drop policy if exists ficha_editar on public.admissao_fichas;
create policy ficha_editar on public.admissao_fichas for update to authenticated
  using ((perfil_id = auth.uid() and (public.e_candidato() or public.is_ativo())) or public.is_coordenacao())
  with check ((perfil_id = auth.uid() and (public.e_candidato() or public.is_ativo())) or public.is_coordenacao());

-- completo = todos os campos que a cooperativa precisa
create or replace function public.ficha_completa(f public.admissao_fichas) returns boolean
language sql immutable as $$
  select coalesce(btrim(f.nome_completo), '') <> '' and coalesce(btrim(f.nacionalidade), '') <> '' and coalesce(btrim(f.estado_civil), '') <> ''
     and coalesce(btrim(f.profissao), '') <> '' and f.data_nascimento is not null and length(regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g')) = 11
     and coalesce(btrim(f.rg), '') <> '' and coalesce(btrim(f.rg_orgao), '') <> '' and coalesce(btrim(f.endereco), '') <> '' and coalesce(btrim(f.cidade), '') <> ''
     and length(regexp_replace(coalesce(f.cep, ''), '\D', '', 'g')) = 8
     and coalesce(btrim(f.conselho), '') <> '' and (f.conselho = 'nenhum' or coalesce(btrim(f.registro_numero), '') <> '')
     and f.pix_tipo is not null and coalesce(btrim(f.pix_chave), '') <> '';
$$;

-- quem não é da coordenação/CA não mexe na conferência; mudar dados volta para conferência
create or replace function public.ficha_conferencia() returns trigger
language plpgsql security definer set search_path = public as $$
declare rpc boolean := coalesce(current_setting('bimcore.conferir', true), '') = '1';
begin
  if rpc then return new; end if;
  if tg_op = 'UPDATE' then
    new.dados_conferido_nome := old.dados_conferido_nome; new.dados_conferido_em := old.dados_conferido_em; new.dados_motivo := old.dados_motivo;
  else
    new.dados_conferido_nome := null; new.dados_conferido_em := null; new.dados_motivo := null;
  end if;
  if tg_op = 'INSERT' or (new.nome_completo, new.nacionalidade, new.estado_civil, new.profissao, new.data_nascimento, new.cpf, new.rg, new.rg_orgao, new.endereco, new.cep, new.cidade, new.conselho, new.registro_numero, new.pix_tipo, new.pix_chave)
     is distinct from (old.nome_completo, old.nacionalidade, old.estado_civil, old.profissao, old.data_nascimento, old.cpf, old.rg, old.rg_orgao, old.endereco, old.cep, old.cidade, old.conselho, old.registro_numero, old.pix_tipo, old.pix_chave) then
    new.dados_status := case when public.ficha_completa(new) then 'enviado' else 'incompleto' end;
  else
    new.dados_status := old.dados_status;
  end if;
  return new;
end;
$$;
drop trigger if exists ficha_conferencia on public.admissao_fichas;
create trigger ficha_conferencia before insert or update on public.admissao_fichas for each row execute function public.ficha_conferencia();

-- conselho e número aparecem padronizados no cadastro (aba Cooperados): "CREA nº 123"
create or replace function public.ficha_registro_no_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.conselho is not null then
    update public.perfis set registro_profissional = case when new.conselho = 'nenhum' then 'sem conselho profissional'
      else new.conselho || coalesce(' nº ' || nullif(btrim(new.registro_numero), ''), '') end,
      cidade = coalesce(nullif(btrim(new.cidade), ''), cidade)
    where id = new.perfil_id;
  end if;
  return null;
end;
$$;
drop trigger if exists ficha_registro_no_perfil on public.admissao_fichas;
create trigger ficha_registro_no_perfil after insert or update on public.admissao_fichas for each row execute function public.ficha_registro_no_perfil();

-- conferir ou devolver: coordenação ou CA, nunca a própria ficha
create or replace function public.ficha_conferir(p_perfil uuid, p_aprovar boolean, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.admissao_fichas;
begin
  if not (public.is_coordenacao() or public.is_ca()) then raise exception 'Só a coordenação ou o CA conferem o cadastro.'; end if;
  if p_perfil = auth.uid() then raise exception 'Ninguém confere o próprio cadastro.'; end if;
  select * into f from public.admissao_fichas where perfil_id = p_perfil for update;
  if f.perfil_id is null then raise exception 'Este cooperado ainda não preencheu os dados cadastrais.'; end if;
  if p_aprovar and not public.ficha_completa(f) then raise exception 'O cadastro está incompleto.'; end if;
  if not p_aprovar and coalesce(btrim(p_motivo), '') = '' then raise exception 'Diga o que precisa ser corrigido.'; end if;
  perform set_config('bimcore.conferir', '1', true);
  update public.admissao_fichas set dados_status = case when p_aprovar then 'aprovado' else 'devolvido' end, dados_motivo = case when p_aprovar then null else p_motivo end,
    dados_conferido_nome = (select nome from public.perfis where id = auth.uid()), dados_conferido_em = now() where perfil_id = p_perfil;
end;
$$;
grant execute on function public.ficha_conferir(uuid, boolean, text) to authenticated;

-- situação do cadastro de todos (sem os dados): para a aba Cooperados e a tesouraria
create or replace function public.cadastros_situacao() returns table (perfil_id uuid, dados_status text, conferido_em timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(f.dados_status, 'incompleto'), f.dados_conferido_em
  from public.perfis p left join public.admissao_fichas f on f.perfil_id = p.id
  where public.is_coordenacao() or public.is_ca() or public.is_tesouraria() or public.is_fiscal() or p.id = auth.uid();
$$;
grant execute on function public.cadastros_situacao() to authenticated;

-- chave Pix para a tesouraria pagar a retirada (só de cadastro conferido)
create or replace function public.pix_do_cooperado(p_fin uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f public.admissao_fichas;
begin
  if not public.is_tesouraria() then raise exception 'Só a tesouraria vê a chave Pix.'; end if;
  select x.* into f from public.admissao_fichas x join public.fin_cooperados c on c.perfil_id = x.perfil_id where c.id = p_fin;
  if f.perfil_id is null then return null; end if;
  return jsonb_build_object('tipo', f.pix_tipo, 'chave', f.pix_chave, 'status', f.dados_status, 'nome', f.nome_completo);
end;
$$;
grant execute on function public.pix_do_cooperado(uuid) to authenticated;

-- sem cadastro conferido, não há pedido de retirada
create or replace function public.retirada_exige_cadastro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.fin_cooperados c join public.admissao_fichas f on f.perfil_id = c.perfil_id
                 where c.id = new.fin_cooperado_id and f.dados_status = 'aprovado') then
    raise exception 'Retirada bloqueada: os dados cadastrais (Meu perfil → Dados cadastrais) precisam estar completos e conferidos pela coordenação ou pelo CA.';
  end if;
  return new;
end;
$$;
drop trigger if exists retirada_exige_cadastro on public.fin_retiradas;
create trigger retirada_exige_cadastro before insert on public.fin_retiradas for each row execute function public.retirada_exige_cadastro();

select 'migracao 043 ok' as resultado;
