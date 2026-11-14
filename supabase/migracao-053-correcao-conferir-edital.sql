-- =====================================================================
-- BIMCORE — migração 053: correção da conferência do edital (migração 052).
-- A lista de erros usava "texto[] || 'texto'", que o Postgres lia como
-- vetor; agora usa array_append.
-- =====================================================================
create or replace function public.assembleia_conferir_edital(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.assembleias; erros text[] := '{}'; mes int; ano int; p record;
begin
  select * into a from public.assembleias where id = p_id;
  if a.id is null then raise exception 'Assembleia não encontrada.'; end if;
  if not exists (select 1 from public.assembleia_pautas where assembleia_id = p_id) then
    erros := array_append(erros, 'Inclua ao menos uma pauta na ordem do dia (Estatuto, art. 33, IV).'::text);
  end if;
  if a.tipo <> 'pre' then
    if a.data_hora < now() + interval '10 days' then
      erros := array_append(erros, 'A data precisa estar a pelo menos 10 dias da publicação do edital (Lei 12.690, art. 12; Estatuto, arts. 30 e 34).'::text);
    end if;
    if coalesce(trim(a.convocante), '') = '' then erros := array_append(erros, 'Informe quem convoca: nome e qualidade, que assinam o edital (Estatuto, art. 33, VI).'::text); end if;
    if coalesce(trim(a.plataforma), '') = '' or coalesce(trim(a.link_video), '') = '' then
      erros := array_append(erros, 'Informe a plataforma e o link da sala de vídeo (Estatuto, art. 33, II).'::text);
    end if;
    if a.duracao_min < 120 then erros := array_append(erros, 'A sessão digital dura no mínimo 2 horas (Estatuto, art. 30, §2º).'::text); end if;
    mes := extract(month from a.data_hora at time zone 'America/Sao_Paulo');
    ano := extract(year from a.data_hora at time zone 'America/Sao_Paulo');
    if a.tipo = 'ordinaria' then
      if mes > 3 then
        erros := array_append(erros, 'A AGO acontece nos 3 primeiros meses depois do fim do exercício, ou seja, de janeiro a março (Lei 5.764, art. 44). Para outros assuntos, use a Especial ou a Extraordinária.'::text);
      end if;
      if not exists (select 1 from public.assembleia_pautas where assembleia_id = p_id and materia = 'contas') then
        erros := array_append(erros, 'A AGO precisa ter a prestação de contas do exercício anterior, com o parecer do Conselho Fiscal (Lei 5.764, art. 44, I).'::text);
      end if;
      if exists (select 1 from public.assembleias x where x.id <> p_id and x.tipo = 'ordinaria' and x.status not in ('rascunho', 'cancelada', 'sem_quorum')
                   and extract(year from x.data_hora at time zone 'America/Sao_Paulo') = ano) then
        erros := array_append(erros, 'Já existe uma AGO convocada ou realizada neste ano.'::text);
      end if;
    end if;
    for p in select materia from public.assembleia_pautas where assembleia_id = p_id loop
      if public.materia_exclusiva_age(p.materia) and a.tipo <> 'extraordinaria' then
        erros := array_append(erros, 'Há pauta que só pode ser votada em Assembleia Geral Extraordinária (Lei 5.764, art. 46).'::text);
      end if;
      if public.materia_exclusiva_ago(p.materia) and a.tipo <> 'ordinaria' then
        erros := array_append(erros, 'Há pauta que só pode ser votada na AGO (Lei 5.764, art. 44).'::text);
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', coalesce(array_length(erros, 1), 0) = 0, 'erros', to_jsonb(erros));
end;
$$;
grant execute on function public.assembleia_conferir_edital(uuid) to authenticated;

select 'migracao 053 ok' as resultado;
