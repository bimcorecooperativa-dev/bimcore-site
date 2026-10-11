-- =====================================================================
-- BIMCORE — migração 041: lembretes adiados ("Lembrar depois")
-- Guarda, por pessoa, até quando um lembrete do site fica escondido
-- (ex.: o balão da filiação sindical, adiado por 30 dias). Só a própria
-- pessoa lê e grava; vale em qualquer aparelho.
-- =====================================================================

create table if not exists public.lembretes_adiados (
  perfil_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  chave     text not null check (char_length(chave) between 2 and 60),
  ate       timestamptz not null,
  primary key (perfil_id, chave)
);
alter table public.lembretes_adiados enable row level security;
drop policy if exists lembrete_proprio on public.lembretes_adiados;
create policy lembrete_proprio on public.lembretes_adiados for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

select 'migracao 041 ok' as resultado;
