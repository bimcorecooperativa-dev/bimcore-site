-- =====================================================================
-- BIMCORE — migração 006: pagamento por Pix e abatimento com aportes
-- * Pix: o cooperado gera o QR code no site e avisa que pagou; a
--   tesouraria confirma (ou recusa) depois de conferir o extrato.
-- * Abatimento: o cooperado usa os próprios aportes para integralizar as
--   quotas iniciais. É validado aqui no banco e vale na hora.
-- * Cada movimento confirmado entra na aba "Lançamentos do site" da
--   planilha atual quando a tesouraria a baixa pelo site.
-- =====================================================================

create table if not exists public.financeiro_movimentos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  cooperado_id   uuid not null references public.perfis(id) on delete cascade,
  tipo           text not null check (tipo in ('pix', 'compensacao')),
  valor          numeric(14,2) not null check (valor > 0),
  alocacao       jsonb not null default '[]'::jsonb,
  status         text not null default 'aguardando' check (status in ('aguardando', 'confirmado', 'recusado', 'cancelado')),
  comprovante    text,
  observacao     text,
  criado_em      timestamptz not null default now(),
  decidido_em    timestamptz,
  decidido_nome  text,
  motivo         text,
  incorporado_em uuid references public.financeiro_importacoes(id) on delete set null
);
create index if not exists fin_mov_coop_idx on public.financeiro_movimentos (cooperado_id, criado_em desc);

alter table public.financeiro_movimentos enable row level security;

drop policy if exists fin_mov_ver on public.financeiro_movimentos;
create policy fin_mov_ver on public.financeiro_movimentos for select to authenticated
  using (cooperado_id = auth.uid() or public.is_tesouraria());

drop policy if exists fin_mov_pix on public.financeiro_movimentos;
create policy fin_mov_pix on public.financeiro_movimentos for insert to authenticated
  with check (cooperado_id = auth.uid() and public.is_ativo() and tipo = 'pix' and status = 'aguardando'
              and decidido_em is null and incorporado_em is null);

drop policy if exists fin_mov_tes on public.financeiro_movimentos;
create policy fin_mov_tes on public.financeiro_movimentos for update to authenticated
  using (public.is_tesouraria()) with check (public.is_tesouraria());

-- Saldos do cooperado = última posição da planilha + movimentos ainda não incorporados
create or replace function public.saldos_para_abatimento(p_id uuid)
returns table (aportes numeric, falta_inicial numeric)
language sql stable security definer set search_path = public as $$
  with pos as (
    select coalesce(outros_creditos, 0) as aportes,
           coalesce((detalhes->'resumo'->>'falta_inicial')::numeric, 0) as falta
      from public.financeiro_posicoes
     where cooperado_id = p_id
     order by data_base desc, criado_em desc
     limit 1
  ), mov as (
    select
      coalesce(sum(case when tipo = 'compensacao' and status = 'confirmado' then valor end), 0) as comp,
      coalesce(sum((select coalesce(sum((a->>'valor')::numeric), 0) from jsonb_array_elements(alocacao) a
                     where a->>'destino' = 'integralizacao')), 0) as integ
      from public.financeiro_movimentos
     where cooperado_id = p_id and incorporado_em is null
       and (status = 'confirmado' or (status = 'aguardando' and tipo = 'pix'))
  )
  select greatest(0, pos.aportes - mov.comp), greatest(0, pos.falta - mov.integ) from pos, mov;
$$;

create or replace function public.abater_com_aportes(p_valor numeric)
returns public.financeiro_movimentos
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s record;
  m public.financeiro_movimentos;
begin
  if uid is null or not public.is_ativo() then raise exception 'Acesso negado.'; end if;
  p_valor := round(coalesce(p_valor, 0), 2);
  if p_valor <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  select * into s from public.saldos_para_abatimento(uid);
  if s is null then raise exception 'Ainda não há posição financeira sua no site.'; end if;
  if p_valor > least(s.aportes, s.falta_inicial) + 0.005 then
    raise exception 'O valor máximo para abater agora é R$ %.', replace(to_char(least(s.aportes, s.falta_inicial), 'FM999999990.00'), '.', ',');
  end if;
  insert into public.financeiro_movimentos (cooperado_id, tipo, valor, alocacao, status, decidido_em, decidido_nome)
  values (uid, 'compensacao', p_valor, jsonb_build_array(jsonb_build_object('destino', 'integralizacao', 'valor', p_valor)),
          'confirmado', now(), 'Feito pelo cooperado no site')
  returning * into m;
  return m;
end $$;

create or replace function public.cancelar_pix(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.financeiro_movimentos set status = 'cancelado', decidido_em = now(), decidido_nome = 'Cancelado pelo cooperado'
   where id = p_id and cooperado_id = auth.uid() and tipo = 'pix' and status = 'aguardando';
  if not found then raise exception 'Este Pix não pode mais ser cancelado.'; end if;
end $$;

revoke execute on function public.saldos_para_abatimento(uuid) from public, anon, authenticated;
grant execute on function public.abater_com_aportes(numeric) to authenticated;
grant execute on function public.cancelar_pix(uuid) to authenticated;

-- Comprovantes de Pix (opcionais), em pasta com o id do cooperado
insert into storage.buckets (id, name, public, file_size_limit)
values ('comprovantes', 'comprovantes', false, 10485760)
on conflict (id) do nothing;

drop policy if exists comp_enviar on storage.objects;
create policy comp_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists comp_ver on storage.objects;
create policy comp_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_tesouraria()));
