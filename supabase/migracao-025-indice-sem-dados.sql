-- BIMCORE — migração 025: índice em branco para quem ainda não tem nenhum dado
create or replace function public.igcc_calcular(p_perfil uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare par public.igcc_parametros; ini date; ini_r date; ingresso date;
  ef_prev numeric := 0; ef_real numeric := 0; v1 numeric; v2 numeric; s_ef numeric; s_par numeric; s_ret numeric; s_asm numeric; s_con numeric;
  n_par int; n_ret numeric; n_asm int; n_pres int; n_con numeric; n_disc numeric; participou boolean; total numeric := 0; pesos numeric := 0;
begin
  select * into par from public.igcc_parametros where id = 1;
  ini := current_date - make_interval(months => par.meses); ini_r := current_date - make_interval(months => par.meses_retrabalho);
  select data_ingresso into ingresso from public.perfis where id = p_perfil;
  -- eficiência (previstas ÷ realizadas, teto 100%)
  select previstas, realizadas into v1, v2 from public.igcc_eficiencia_viva(p_perfil); ef_prev := ef_prev + v1; ef_real := ef_real + v2;
  select coalesce(sum(previstas), 0), coalesce(sum(realizadas), 0) into v1, v2 from public.igcc_registros where perfil_id = p_perfil and componente = 'eficiencia' and data >= ini and realizadas > 0;
  ef_prev := ef_prev + v1; ef_real := ef_real + v2;
  s_ef := case when ef_real > 0 then least(100, round(ef_prev / ef_real * 100, 1)) end;
  -- avaliação entre pares (1 a 5 → 0 a 100)
  select count(*), round(avg(((qualidade + prazos + colaboracao + conformidade) / 4.0 - 1) / 4 * 100), 1) into n_par, s_par
    from public.projeto_avaliacoes where avaliado_id = p_perfil and criado_em >= ini;
  if n_par = 0 then s_par := null; end if;
  -- retrabalho (24 meses): cada apontamento procedente tira 10 pontos; impeditivo vale 2
  participou := exists (select 1 from public.producao where cooperado_id = p_perfil and tipo = 'produtiva' and projeto_id is not null and data >= ini_r);
  select coalesce(sum(quantidade), 0) into n_ret from public.igcc_registros where perfil_id = p_perfil and componente = 'retrabalho' and data >= ini_r;
  s_ret := case when participou or n_ret > 0 then greatest(0, 100 - 10 * n_ret) end;
  -- assembleias realizadas desde o ingresso + Reuniões de Disciplina registradas pelo CA
  select count(*), count(pr.perfil_id) into n_asm, n_pres from public.assembleias a
    left join public.assembleia_presencas pr on pr.assembleia_id = a.id and pr.perfil_id = p_perfil
   where a.status in ('encerrada', 'sem_quorum') and a.tipo <> 'pre' and a.data_hora >= ini and (ingresso is null or a.data_hora::date >= ingresso);
  select coalesce(sum(quantidade), 0) into n_disc from public.igcc_registros where perfil_id = p_perfil and componente = 'disciplina' and data >= ini;
  s_asm := case when n_asm > 0 then round(n_pres::numeric / n_asm * 100, 1) end;
  -- contribuições (cada ponto registrado pelo CA vale 10, até 100)
  select coalesce(sum(quantidade), 0) into n_con from public.igcc_registros where perfil_id = p_perfil and componente = 'contribuicao' and data >= ini;
  s_con := least(100, n_con * 10);
  if s_ef is not null then total := total + s_ef * par.peso_eficiencia; pesos := pesos + par.peso_eficiencia; end if;
  if s_par is not null then total := total + s_par * par.peso_pares; pesos := pesos + par.peso_pares; end if;
  if s_ret is not null then total := total + s_ret * par.peso_retrabalho; pesos := pesos + par.peso_retrabalho; end if;
  if s_asm is not null then total := total + s_asm * par.peso_assembleia; pesos := pesos + par.peso_assembleia; end if;
  -- sem nenhum dado ainda (novo cooperado), o índice fica em branco em vez de zero
  if pesos > 0 or n_con > 0 then total := total + s_con * par.peso_contrib; pesos := pesos + par.peso_contrib; end if;
  return jsonb_build_object(
    'indice', case when pesos > 0 then round(total / pesos, 1) end,
    'eficiencia', jsonb_build_object('nota', s_ef, 'previstas', ef_prev, 'realizadas', ef_real),
    'pares', jsonb_build_object('nota', s_par, 'avaliacoes', n_par),
    'retrabalho', jsonb_build_object('nota', s_ret, 'apontamentos', n_ret),
    'assembleias', jsonb_build_object('nota', s_asm, 'realizadas', n_asm, 'presente', n_pres, 'reunioes_disciplina', n_disc),
    'contribuicoes', jsonb_build_object('nota', s_con, 'pontos', n_con),
    'periodo_meses', par.meses, 'periodo_retrabalho', par.meses_retrabalho);
end;
$$;

select 'migracao 025 ok' as resultado;
