-- =====================================================================
-- BIMCORE — migração 036: vínculo de quem já é cooperado
-- A lista de matrículas para "vincular sem nova adesão" passa a incluir também as
-- matrículas já ligadas a uma conta do site que ainda não foi ativada (ex.: a tesouraria
-- ligou o cadastro financeiro à conta, mas a pessoa caiu como candidata).
-- =====================================================================

drop function if exists public.matriculas_sem_conta();
create or replace function public.matriculas_sem_conta() returns table (fin_id uuid, nome text, numero int, perfil_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, l.numero, c.perfil_id
    from public.fin_cooperados c
    left join public.livro_matricula l on l.fin_cooperado_id = c.id
    left join public.perfis p on p.id = c.perfil_id
   where c.situacao <> 'desligado'
     and (c.perfil_id is null or p.status in ('pendente', 'entrevista', 'aprovado'))
     and (public.is_coordenacao() or public.is_ca())
   order by c.nome;
$$;
grant execute on function public.matriculas_sem_conta() to authenticated;

select 'migracao 036 ok' as resultado;
