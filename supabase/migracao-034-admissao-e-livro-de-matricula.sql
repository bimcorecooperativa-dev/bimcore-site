-- =====================================================================
-- BIMCORE — migração 034: processo de admissão e Livro de Matrícula
-- Lei 5.764/1971, arts. 4º, 22, 23 e 29; Estatuto, arts. 3º e 4º; Regimento, arts. 16 a 20.
--  1. O candidato preenche a Ficha Cadastral de Matrícula, envia os documentos e assina a
--     declaração de livre adesão e de ciência do Estatuto, do Regimento e do Manual do Cooperado.
--  2. O Conselho de Administração decide na reunião ordinária (data da reunião registrada).
--  3. Aprovado, o candidato subscreve as quotas (10, no mínimo; à vista ou parcelado nas
--     retiradas — RI, art. 19, §1º) e dá o aceite no termo de matrícula.
--  4. A coordenação ou o CA registra a matrícula no Livro: número, data e assinatura.
--     Só então o cooperado fica ativo.
-- Quem já é cooperado (fundadores) e só criou a conta no site é vinculado à matrícula
-- existente, sem nova adesão.
-- =====================================================================

-- ---------- Situação "aprovado" (aprovado pelo CA, aguardando quotas e matrícula) ----------
alter table public.perfis drop constraint if exists perfis_status_check;
alter table public.perfis add constraint perfis_status_check
  check (status in ('pendente', 'entrevista', 'aprovado', 'ativo', 'recusado', 'desligado'));
alter table public.perfis add column if not exists ca_reuniao date;
alter table public.perfis add column if not exists ca_decidido_nome text;

-- O CA também decide a admissão (RI, art. 18); papel e cargos continuam com a coordenação.
-- Ninguém fica "ativo" sem registro no Livro de Matrícula, salvo a coordenação (ajustes de cadastro).
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare coord boolean := public.is_coordenacao(); ca boolean := public.is_ca();
        via_livro boolean := coalesce(current_setting('bimcore.matricula', true), '') = '1';
begin
  if auth.uid() is not null and not coord and not via_livro then
    new.papel := old.papel;
    new.email := old.email;
    new.data_ingresso := old.data_ingresso;
    new.tesouraria := old.tesouraria;
    new.conselho_fiscal := old.conselho_fiscal;
    new.conselho_adm := old.conselho_adm;
    new.cargo_ca := old.cargo_ca;
    if not ca or old.id = auth.uid() then
      new.status := old.status;
      new.analise_obs := old.analise_obs;
      new.analisado_em := old.analisado_em;
      new.ca_reuniao := old.ca_reuniao;
      new.ca_decidido_nome := old.ca_decidido_nome;
    elsif new.status is distinct from old.status and (new.status not in ('pendente', 'entrevista', 'aprovado', 'recusado')
          or old.status not in ('pendente', 'entrevista', 'aprovado', 'recusado')) then
      raise exception 'O Conselho de Administração decide a admissão (entrevista, aprovado ou não aprovado). A ativação acontece com o registro no Livro de Matrícula.';
    end if;
  end if;
  if new.conselho_adm and new.conselho_fiscal then
    raise exception 'Quem é do Conselho Fiscal não pode ser do Conselho de Administração (Estatuto, art. 60, §5º).';
  end if;
  if not new.conselho_adm then new.cargo_ca := null; end if;
  if new.status is distinct from old.status then
    new.analisado_em := now();
    if new.status in ('entrevista', 'aprovado', 'recusado') then new.ca_decidido_nome := (select nome from public.perfis where id = auth.uid()); end if;
  end if;
  if new.status = 'ativo' and new.data_ingresso is null then
    new.data_ingresso := current_date;
  end if;
  return new;
end;
$$;

drop policy if exists perfis_ca_ver on public.perfis;
create policy perfis_ca_ver on public.perfis for select to authenticated using (public.is_ca());
drop policy if exists perfis_ca_editar on public.perfis;
create policy perfis_ca_editar on public.perfis for update to authenticated
  using (public.is_ca() and status in ('pendente', 'entrevista', 'aprovado', 'recusado'))
  with check (public.is_ca());

-- ---------- Ficha Cadastral de Matrícula (dados pessoais: só o próprio, o CA e a coordenação veem) ----------
create table if not exists public.admissao_fichas (
  perfil_id            uuid primary key references public.perfis(id) on delete cascade,
  nome_completo        text,
  nacionalidade        text,
  estado_civil         text,
  profissao            text,
  data_nascimento      date,
  cpf                  text,
  rg                   text,
  rg_orgao             text,
  endereco             text,
  cep                  text,
  docs                 jsonb not null default '[]'::jsonb,   -- [{tipo, caminho, nome, tamanho, enviado_em}]
  declaracao_em        timestamptz,
  forma_integralizacao text check (forma_integralizacao in ('vista', 'parcelado')),
  parcelas             int check (parcelas between 1 and 60),
  aceite_matricula_em  timestamptz,
  atualizado_em        timestamptz not null default now()
);
alter table public.admissao_fichas enable row level security;

create or replace function public.e_candidato() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and status in ('pendente', 'entrevista', 'aprovado'));
$$;
grant execute on function public.e_candidato() to authenticated;

drop policy if exists ficha_ver on public.admissao_fichas;
create policy ficha_ver on public.admissao_fichas for select to authenticated
  using (perfil_id = auth.uid() or public.is_ca() or public.is_coordenacao());
drop policy if exists ficha_criar on public.admissao_fichas;
create policy ficha_criar on public.admissao_fichas for insert to authenticated
  with check (perfil_id = auth.uid() and public.e_candidato());
drop policy if exists ficha_editar on public.admissao_fichas;
create policy ficha_editar on public.admissao_fichas for update to authenticated
  using ((perfil_id = auth.uid() and public.e_candidato()) or public.is_coordenacao())
  with check ((perfil_id = auth.uid() and public.e_candidato()) or public.is_coordenacao());

create or replace function public.ficha_carimbo() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end; $$;
drop trigger if exists ficha_carimbo on public.admissao_fichas;
create trigger ficha_carimbo before insert or update on public.admissao_fichas for each row execute function public.ficha_carimbo();

-- Documentos do candidato: bucket privado, uma pasta por pessoa
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admissao', 'admissao', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
drop policy if exists admissao_enviar on storage.objects;
create policy admissao_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'admissao' and (storage.foldername(name))[1] = auth.uid()::text and public.e_candidato());
drop policy if exists admissao_ver on storage.objects;
create policy admissao_ver on storage.objects for select to authenticated
  using (bucket_id = 'admissao' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_ca() or public.is_coordenacao()));
drop policy if exists admissao_apagar on storage.objects;
create policy admissao_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'admissao' and (storage.foldername(name))[1] = auth.uid()::text and public.e_candidato());

-- Candidatos leem o Estatuto, o Regimento e o Manual do Cooperado (Documentos dessas categorias)
drop policy if exists documentos_candidato on public.documentos;
create policy documentos_candidato on public.documentos for select to authenticated
  using (public.e_candidato() and categoria in ('Estatuto e atas', 'Regimentos e manuais'));
drop policy if exists documentos_candidato_arq on storage.objects;
create policy documentos_candidato_arq on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.e_candidato()
         and exists (select 1 from public.documentos d where d.caminho = name and d.categoria in ('Estatuto e atas', 'Regimentos e manuais')));

-- ---------- Livro de Matrícula ----------
create table if not exists public.livro_matricula (
  numero              int primary key,
  perfil_id           uuid unique references public.perfis(id) on delete set null,
  fin_cooperado_id    uuid unique references public.fin_cooperados(id) on delete set null,
  nome                text not null,
  data_admissao       date not null,
  quotas_subscritas   int not null default 10 check (quotas_subscritas >= 1),
  forma_integralizacao text,
  reuniao_ca          date,
  fundador            boolean not null default false,
  assinado_em         date,
  data_desligamento   date,
  motivo_desligamento text,
  observacao          text,
  registrado_nome     text,
  criado_em           timestamptz not null default now()
);
alter table public.livro_matricula enable row level security;
drop policy if exists livro_ver on public.livro_matricula;
create policy livro_ver on public.livro_matricula for select to authenticated using (public.is_ativo() or public.is_fiscal());
drop policy if exists livro_gerir on public.livro_matricula;
create policy livro_gerir on public.livro_matricula for update to authenticated
  using (public.is_coordenacao() or public.is_ca()) with check (public.is_coordenacao() or public.is_ca());

-- Fundadores: uma linha por cooperado já cadastrado no financeiro (numeração em ordem alfabética;
-- ajuste os números ao livro físico, se for diferente)
insert into public.livro_matricula (numero, perfil_id, fin_cooperado_id, nome, data_admissao, quotas_subscritas, fundador, assinado_em, registrado_nome)
select row_number() over (order by c.nome), c.perfil_id, c.id, c.nome, coalesce(c.data_admissao, '2026-01-28'), coalesce(c.quotas_iniciais, 10), true,
       coalesce(c.data_admissao, '2026-01-28'), 'Assembleia de fundação'
  from public.fin_cooperados c
 where not exists (select 1 from public.livro_matricula)
   and c.situacao <> 'desligado';

-- Livro para leitura dos cooperados: capital subscrito e integralizado de cada um
create or replace function public.livro_matricula_publico() returns table (
  numero int, nome text, data_admissao date, fundador boolean, situacao text, data_desligamento date,
  quotas_iniciais int, capital_subscrito numeric, capital_integralizado numeric, quota numeric)
language sql stable security definer set search_path = public as $$
  with par as (select coalesce(quota, 50) as q from public.fin_parametros where id = 1)
  select l.numero, l.nome, l.data_admissao, l.fundador,
         case when l.data_desligamento is not null then 'desligado' else coalesce(c.situacao, 'ativo') end,
         l.data_desligamento, l.quotas_subscritas,
         round(l.quotas_subscritas * (select q from par) + coalesce(ct.v, 0), 2),
         round(coalesce(c.integralizado_admissao, 0) + coalesce(pg.v, 0) + coalesce(ct.v, 0), 2),
         (select q from par)
    from public.livro_matricula l
    left join public.fin_cooperados c on c.id = l.fin_cooperado_id
    left join lateral (select sum(p.valor) v from public.fin_pagamentos p where p.fin_cooperado_id = c.id and p.tipo in ('integralizacao', 'abatimento')) pg on true
    left join lateral (select coalesce(sum(p.valor), 0) + coalesce((select sum(coalesce(r.contribuicao, 0)) from public.fin_retiradas r where r.fin_cooperado_id = c.id and r.status = 'paga'), 0) v
                         from public.fin_pagamentos p where p.fin_cooperado_id = c.id and p.tipo = 'contribuicao') ct on true
   where public.is_ativo() or public.is_fiscal()
   order by l.numero;
$$;
grant execute on function public.livro_matricula_publico() to authenticated;

-- Registro da matrícula: cria o cadastro financeiro, numera no Livro e ativa o cooperado
create or replace function public.registrar_matricula(p_perfil uuid, p_assinado date, p_obs text default null) returns int
language plpgsql security definer set search_path = public as $$
declare pf record; fi record; fc uuid; num int; quem text;
begin
  if not (public.is_coordenacao() or public.is_ca()) then raise exception 'Só a coordenação ou o Conselho de Administração registra matrículas.'; end if;
  select * into pf from public.perfis where id = p_perfil;
  if pf is null then raise exception 'Cadastro não encontrado.'; end if;
  if pf.status <> 'aprovado' then raise exception 'A admissão precisa estar aprovada pelo Conselho de Administração.'; end if;
  select * into fi from public.admissao_fichas where perfil_id = p_perfil;
  if fi is null or fi.declaracao_em is null then raise exception 'Falta a declaração de livre adesão e de ciência do Estatuto (Estatuto, art. 4º).'; end if;
  if fi.aceite_matricula_em is null then raise exception 'Falta o aceite do candidato no termo de matrícula.'; end if;
  if exists (select 1 from public.livro_matricula where perfil_id = p_perfil) then raise exception 'Esta pessoa já tem matrícula.'; end if;
  quem := (select nome from public.perfis where id = auth.uid());
  perform set_config('bimcore.matricula', '1', true);
  select id into fc from public.fin_cooperados where perfil_id = p_perfil;
  if fc is null then
    insert into public.fin_cooperados (nome, email, perfil_id, quotas_iniciais, integralizado_admissao, data_admissao, situacao, observacao)
    values (coalesce(nullif(fi.nome_completo, ''), pf.nome), pf.email, p_perfil, 10, 0, coalesce(p_assinado, current_date), 'ativo',
            case when fi.forma_integralizacao = 'parcelado' then 'Quotas iniciais a integralizar em ' || coalesce(fi.parcelas, 1) || ' parcela(s) descontadas das retiradas (RI, art. 19, §1º)' else null end)
    returning id into fc;
  end if;
  select coalesce(max(numero), 0) + 1 into num from public.livro_matricula;
  insert into public.livro_matricula (numero, perfil_id, fin_cooperado_id, nome, data_admissao, quotas_subscritas, forma_integralizacao, reuniao_ca, assinado_em, observacao, registrado_nome)
  values (num, p_perfil, fc, coalesce(nullif(fi.nome_completo, ''), pf.nome), coalesce(p_assinado, current_date), 10, fi.forma_integralizacao, pf.ca_reuniao, coalesce(p_assinado, current_date), p_obs, quem);
  update public.perfis set status = 'ativo', data_ingresso = coalesce(p_assinado, current_date) where id = p_perfil;
  return num;
end;
$$;
grant execute on function public.registrar_matricula(uuid, date, text) to authenticated;

-- Quem já é cooperado (matrícula existente) e só criou a conta no site: vincula, sem nova adesão
create or replace function public.vincular_cooperado_existente(p_perfil uuid, p_fin uuid) returns int
language plpgsql security definer set search_path = public as $$
declare num int; outro uuid;
begin
  if not (public.is_coordenacao() or public.is_ca()) then raise exception 'Só a coordenação ou o Conselho de Administração faz o vínculo.'; end if;
  select perfil_id into outro from public.fin_cooperados where id = p_fin;
  if outro is not null and outro <> p_perfil then raise exception 'Esta matrícula já está ligada a outra conta do site.'; end if;
  perform set_config('bimcore.matricula', '1', true);
  update public.fin_cooperados set perfil_id = p_perfil where id = p_fin;
  update public.livro_matricula set perfil_id = p_perfil where fin_cooperado_id = p_fin returning numero into num;
  update public.perfis set status = 'ativo', analise_obs = coalesce(analise_obs, 'Cooperado já matriculado: conta do site vinculada à matrícula existente, sem nova adesão.') where id = p_perfil;
  return num;
end;
$$;
grant execute on function public.vincular_cooperado_existente(uuid, uuid) to authenticated;

-- Cooperados ainda sem conta no site (para o vínculo)
create or replace function public.matriculas_sem_conta() returns table (fin_id uuid, nome text, numero int)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, l.numero from public.fin_cooperados c left join public.livro_matricula l on l.fin_cooperado_id = c.id
   where c.perfil_id is null and c.situacao <> 'desligado' and (public.is_coordenacao() or public.is_ca())
   order by c.nome;
$$;
grant execute on function public.matriculas_sem_conta() to authenticated;

select 'migracao 034 ok' as resultado;
