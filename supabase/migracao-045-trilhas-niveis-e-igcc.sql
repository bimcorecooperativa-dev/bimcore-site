-- =====================================================================
-- BIMCORE — migração 045: trilhas por nível, certificado conferido e Formação no IGCC
--  • Cada indicação tem tipo (curso ou trilha), nível (básico, intermediário,
--    avançado) e pode ser dirigida a funções e/ou a cooperados específicos.
--  • A conclusão só vale para o índice com o certificado conferido pelo CA ou pela
--    coordenação (ninguém confere o próprio).
--  • IGCC: novo componente "Formação" = trilhas essenciais e recomendadas da função
--    do cooperado concluídas e conferidas ÷ as indicadas. Peso 0 até o CA fixá-lo por
--    Resolução (Regimento, art. 92): até lá, aparece no índice mas não muda a nota.
-- =====================================================================

alter table public.cursos_indicados add column if not exists tipo text not null default 'curso' check (tipo in ('curso', 'trilha'));
alter table public.cursos_indicados add column if not exists nivel text not null default 'basico' check (nivel in ('basico', 'intermediario', 'avancado'));
alter table public.cursos_indicados add column if not exists cooperados uuid[] not null default '{}';

alter table public.cursos_progresso add column if not exists certificado_arquivo text;
alter table public.cursos_progresso add column if not exists conferencia text check (conferencia is null or conferencia in ('pendente', 'conferido', 'recusado'));
alter table public.cursos_progresso add column if not exists conferido_nome text;
alter table public.cursos_progresso add column if not exists conferido_em timestamptz;
alter table public.cursos_progresso add column if not exists conferencia_motivo text;

-- o cooperado não mexe na conferência; mudar a conclusão ou o certificado volta para "pendente"
create or replace function public.curso_progresso_regra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('bimcore.conferir', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then new.conferido_nome := old.conferido_nome; new.conferido_em := old.conferido_em; new.conferencia_motivo := old.conferencia_motivo; new.conferencia := old.conferencia;
  else new.conferido_nome := null; new.conferido_em := null; new.conferencia_motivo := null; new.conferencia := null; end if;
  if new.status = 'concluido' then
    if tg_op = 'INSERT' or new.status is distinct from old.status or new.certificado_arquivo is distinct from old.certificado_arquivo
       or new.certificado_link is distinct from old.certificado_link or new.concluido_em is distinct from old.concluido_em then
      new.conferencia := case when coalesce(new.certificado_arquivo, new.certificado_link, '') <> '' then 'pendente' end;
      new.conferido_nome := null; new.conferido_em := null; new.conferencia_motivo := null;
    end if;
  else
    new.conferencia := null;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists curso_progresso_regra on public.cursos_progresso;
create trigger curso_progresso_regra before insert or update on public.cursos_progresso for each row execute function public.curso_progresso_regra();

create or replace function public.curso_conferir(p_perfil uuid, p_curso uuid, p_aprovar boolean, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_coordenacao() or public.is_ca()) then raise exception 'Só a coordenação ou o CA conferem certificados.'; end if;
  if p_perfil = auth.uid() then raise exception 'Ninguém confere o próprio certificado.'; end if;
  if not p_aprovar and coalesce(btrim(p_motivo), '') = '' then raise exception 'Diga por que o certificado não foi aceito.'; end if;
  perform set_config('bimcore.conferir', '1', true);
  update public.cursos_progresso set conferencia = case when p_aprovar then 'conferido' else 'recusado' end, conferencia_motivo = case when p_aprovar then null else p_motivo end,
    conferido_nome = (select nome from public.perfis where id = auth.uid()), conferido_em = now()
   where perfil_id = p_perfil and curso_id = p_curso and status = 'concluido';
  if not found then raise exception 'Conclusão não encontrada.'; end if;
end;
$$;
grant execute on function public.curso_conferir(uuid, uuid, boolean, text) to authenticated;

-- certificados (PDF ou imagem): pasta de cada cooperado; leem o próprio, o CA e a coordenação
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados', 'certificados', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
drop policy if exists cert_enviar on storage.objects;
create policy cert_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'certificados' and (storage.foldername(name))[1] = auth.uid()::text and public.is_ativo());
drop policy if exists cert_ver on storage.objects;
create policy cert_ver on storage.objects for select to authenticated
  using (bucket_id = 'certificados' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_ca() or public.is_coordenacao()));
drop policy if exists cert_apagar on storage.objects;
create policy cert_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'certificados' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- IGCC: componente Formação ----------
alter table public.igcc_parametros add column if not exists peso_formacao numeric(5,2) not null default 0;

create or replace function public.funcoes_do_perfil(p uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array['todos',
    case when x.conselho_adm then 'ca' end, case when x.conselho_fiscal then 'cf' end,
    case when coalesce(x.tesouraria, false) then 'tesouraria' end, case when x.papel = 'coordenacao' then 'coordenacao' end], null)
  from public.perfis x where x.id = p;
$$;

create or replace function public.igcc_formacao(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with alvo as (
    select c.id from public.cursos_indicados c
     where c.ativo and c.prioridade <= 2 and (c.publicos && public.funcoes_do_perfil(p_perfil) or p_perfil = any(c.cooperados))
  ), ok as (
    select count(*) n from public.cursos_progresso g join alvo on alvo.id = g.curso_id
     where g.perfil_id = p_perfil and g.status = 'concluido' and g.conferencia = 'conferido'
  )
  select jsonb_build_object('indicadas', (select count(*) from alvo), 'conferidas', (select n from ok),
    'nota', case when (select count(*) from alvo) > 0 then least(100, round((select n from ok)::numeric / (select count(*) from alvo) * 100, 1)) end);
$$;

create or replace function public.igcc_calcular(p_perfil uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare par public.igcc_parametros; ini date; ini_r date; ingresso date;
  ef_prev numeric := 0; ef_real numeric := 0; v1 numeric; v2 numeric; s_ef numeric; s_par numeric; s_ret numeric; s_asm numeric; s_con numeric; s_for numeric; f jsonb;
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
  if s_ef is not null then total := total + s_ef * par.peso_eficiencia; pesos := pesos + par.peso_eficiencia; end if;
  if s_par is not null then total := total + s_par * par.peso_pares; pesos := pesos + par.peso_pares; end if;
  if s_ret is not null then total := total + s_ret * par.peso_retrabalho; pesos := pesos + par.peso_retrabalho; end if;
  if s_asm is not null then total := total + s_asm * par.peso_assembleia; pesos := pesos + par.peso_assembleia; end if;
  if s_for is not null and par.peso_formacao > 0 then total := total + s_for * par.peso_formacao; pesos := pesos + par.peso_formacao; end if;
  if pesos > 0 or n_con > 0 then total := total + s_con * par.peso_contrib; pesos := pesos + par.peso_contrib; end if;
  return jsonb_build_object(
    'indice', case when pesos > 0 then round(total / pesos, 1) end,
    'eficiencia', jsonb_build_object('nota', s_ef, 'previstas', ef_prev, 'realizadas', ef_real),
    'pares', jsonb_build_object('nota', s_par, 'avaliacoes', n_par),
    'retrabalho', jsonb_build_object('nota', s_ret, 'apontamentos', n_ret),
    'assembleias', jsonb_build_object('nota', s_asm, 'realizadas', n_asm, 'presente', n_pres, 'reunioes_disciplina', n_disc),
    'contribuicoes', jsonb_build_object('nota', s_con, 'pontos', n_con),
    'formacao', f,
    'periodo_meses', par.meses, 'periodo_retrabalho', par.meses_retrabalho);
end;
$$;

-- trilhas do CapacitaCoop (níveis e funções)
update public.cursos_indicados set tipo = 'trilha' where link like '%/trilhas-studion/%' or link like '%/jornadas-studion/%';
insert into public.cursos_indicados (titulo, plataforma, link, descricao, carga_horaria, tema, publicos, prioridade, ordem, tipo, nivel, criado_nome)
select * from (values
  ('Governança Participativa', 'CapacitaCoop', 'https://capacita.coop.br/trilhas-studion/governanca-participativa', 'Assembleia, conselhos e participação do cooperado nas decisões.', '15 h', 'Governança', '{todos}'::text[], 2, 35, 'trilha', 'basico', 'Indicação inicial'),
  ('Conselheiros Administrativos: Desafios da Primeira Gestão', 'CapacitaCoop', 'https://capacita.coop.br/trilhas-studion/conselheiros-administrativos-desafios-da-primeira-gestao', 'Gestão profissional para quem está no primeiro mandato no Conselho de Administração.', '44 h', 'Governança', '{ca}'::text[], 1, 55, 'trilha', 'basico', 'Indicação inicial'),
  ('Preparatório para Certificação de Conselheiros de Administração', 'CapacitaCoop (trilha estadual MT)', 'https://capacita.coop.br/mt/trilhas/trilhas-studion/preparatorio-para-certificacao-de-conselheiros-de-administracao', 'Cooperativismo, governança, gestão, finanças, contabilidade e compliance. Prepara para a certificação de conselheiros. Confira se a inscrição está aberta a outros estados.', '45 h', 'Governança', '{ca}'::text[], 2, 56, 'trilha', 'avancado', 'Indicação inicial'),
  ('Cooperativismo e Relações Governamentais', 'CapacitaCoop', 'https://capacita.coop.br/trilhas-studion/cooperativismo-e-relacoes-governamentais', 'Como a cooperativa se relaciona com o poder público: essencial para o nosso foco em prefeituras e órgãos públicos.', '11 h', 'Legislação e políticas', '{coordenacao,ca}'::text[], 1, 57, 'trilha', 'intermediario', 'Indicação inicial'),
  ('Comunicação e Marketing no Cooperativismo — Básico', 'CapacitaCoop', 'https://capacita.coop.br/trilhas-studion/comunicacao-e-marketing-no-cooperativismo', 'Comunicação da cooperativa alinhada aos princípios cooperativistas: redes sociais, marca e relacionamento.', '37 h', 'Comunicação', '{coordenacao}'::text[], 2, 70, 'trilha', 'basico', 'Indicação inicial'),
  ('Comunicação e Marketing no Cooperativismo — Avançado', 'CapacitaCoop', 'https://capacita.coop.br/trilhas-studion/comunicacao-e-marketing-no-cooperativismo-avancado', 'Estratégia, inovação e tecnologia em comunicação e marketing. Faça depois do Básico.', '49 h', 'Comunicação', '{coordenacao}'::text[], 3, 71, 'trilha', 'avancado', 'Indicação inicial')
) v(titulo, plataforma, link, descricao, carga_horaria, tema, publicos, prioridade, ordem, tipo, nivel, criado_nome)
where not exists (select 1 from public.cursos_indicados c where c.link = v.link);

select 'migracao 045 ok' as resultado;
