-- =====================================================================
-- BIMCORE — migração 034: manual do site dentro da área do cooperado
-- Uma única versão vigente (id = 1). Só cooperados ativos e o Conselho Fiscal leem.
-- A gravação é feita pela manutenção do site (SQL), substituindo a versão anterior.
-- =====================================================================

create table if not exists public.site_manual (
  id            int primary key default 1 check (id = 1),
  html          text not null,
  atualizado_em timestamptz not null default now(),
  observacao    text
);
alter table public.site_manual enable row level security;
drop policy if exists manual_ver on public.site_manual;
create policy manual_ver on public.site_manual for select to authenticated using (public.is_ativo() or public.is_fiscal());

select 'migracao 034 ok' as resultado;
