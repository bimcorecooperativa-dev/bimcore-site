-- =====================================================================
-- BIMCORE — migração 017: o número de membros da assembleia é o quadro
-- social inteiro (Estatuto, art. 33, V), inclusive quem ainda não tem
-- conta no site: usa o maior número entre contas ativas e cooperados
-- ativos no cadastro da tesouraria.
-- =====================================================================
create or replace function public.quadro_social() returns int
language sql stable security definer set search_path = public as $$
  select greatest((select count(*) from public.perfis where status = 'ativo'),
                  (select count(*) from public.fin_cooperados where coalesce(situacao, 'ativo') = 'ativo'))::int;
$$;
grant execute on function public.quadro_social() to authenticated;

create or replace function public.regras_assembleia() returns trigger
language plpgsql security definer set search_path = public as $$
declare rpc boolean := coalesce(current_setting('bimcore.rpc', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then raise exception 'A assembleia começa como rascunho; depois publique o edital.'; end if;
    new.criado_nome := (select nome from public.perfis where id = auth.uid());
    return new;
  end if;
  if rpc then return new; end if;
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
    if old.ata_publicada_em is not null and new.ata is distinct from old.ata then raise exception 'A ata já foi publicada.'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.assembleia_quorum(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.assembleias; n int; pres int; conv int; req int; min_passados numeric;
begin
  select * into a from public.assembleias where id = p_id;
  n := coalesce(a.membros_na_data, public.quadro_social());
  pres := (select count(*) from public.assembleia_presencas where assembleia_id = p_id and apto);
  min_passados := extract(epoch from (now() - a.data_hora)) / 60;
  conv := case when min_passados < 60 then 1 when min_passados < 120 then 2 else 3 end;
  req := case conv when 1 then ceil(n * 2.0 / 3) when 2 then floor(n / 2.0) + 1
                   else case when n <= 19 then 4 else least(50, ceil(n * 0.2)) end end;
  return jsonb_build_object('membros', n, 'presentes', pres, 'convocacao', conv, 'necessario', req, 'atingido', pres >= req, 'tipo', a.tipo);
end;
$$;

select 'migracao 017 ok, quadro social = ' || public.quadro_social() as resultado;
