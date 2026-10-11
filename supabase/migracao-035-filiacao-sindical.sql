-- =====================================================================
-- BIMCORE — migração 035: incentivo à filiação sindical (Estatuto, art. 3º, §5º)
-- O cooperado informa, se quiser, o sindicato a que é filiado. É dado pessoal sensível
-- (LGPD, art. 5º, II): informado voluntariamente, visível só para o próprio cooperado e,
-- para a cooperativa, apenas em número agregado (quantos são filiados).
-- =====================================================================

-- tabela própria: nem a coordenação nem o CA leem os nomes (só o próprio cooperado)
create table if not exists public.filiacao_sindical (
  perfil_id    uuid primary key references public.perfis(id) on delete cascade,
  sindicato    text not null check (char_length(btrim(sindicato)) between 2 and 120),
  informado_em timestamptz not null default now()
);
alter table public.filiacao_sindical enable row level security;
drop policy if exists sind_proprio on public.filiacao_sindical;
create policy sind_proprio on public.filiacao_sindical for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- Indicador agregado (sem nomes): para o relatório anual e o Livro de Matrícula
create or replace function public.sindicalizacao() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_ativo() or public.is_fiscal() then jsonb_build_object(
    'ativos', (select count(*) from public.perfis where status = 'ativo'),
    'filiados', (select count(*) from public.filiacao_sindical f join public.perfis p on p.id = f.perfil_id where p.status = 'ativo')) end;
$$;
grant execute on function public.sindicalizacao() to authenticated;

select 'migracao 035 ok' as resultado;
