-- =====================================================================
-- BIMCORE — migração 039: comprovação da aprovação de despesas
-- Despesa cobrada dos cooperados (chamada, Estatuto art. 9º, I) ou paga por
-- um fundo só é aceita com o documento que a aprovou:
--   ata_ag       Ata de Assembleia Geral — assinada pela Mesa, administradores
--                e conselheiros fiscais presentes e comissão de cooperados (Estatuto, art. 39, §1º)
--   ata_ca       Ata de reunião do Conselho de Administração — assinada pelos
--                conselheiros presentes (Estatuto, art. 55, III)
--   resolucao_ca Resolução do CA — numerada e assinada pelo Presidente após
--                decisão colegiada (Regimento, art. 7º e §1º)
-- Quem pode aprovar o quê:
--   chamada, FATES (RI 118), FEI (RI 119)  → AG ou CA
--   Fundo de Reserva (Estatuto 73; RI 117) → AG
--   Fundo de Apoio (RI 122, §1º)           → CA
--   Fundo de Soberania (RI 120)            → não paga despesa: só cobre retiradas
-- O documento é um arquivo (bucket privado 'despesas') ou a ata publicada no site.
-- =====================================================================

alter table public.fin_despesas add column if not exists aprovacao jsonb;
-- {tipo, numero, data, valor, arquivo, arquivo_nome, assembleia_id, assinaturas: true, assinantes}

create or replace function public.despesa_exige_aprovacao() returns trigger
language plpgsql set search_path = public as $$
declare a jsonb := new.aprovacao; tipos text[]; quem text;
begin
  if tg_op = 'UPDATE' and new.cobrar is not distinct from old.cobrar and new.fonte is not distinct from old.fonte
     and new.fundo is not distinct from old.fundo and new.valor is not distinct from old.valor
     and new.aprovacao is not distinct from old.aprovacao and new.data is not distinct from old.data then
    return new;
  end if;
  if new.fonte = 'fundo' and new.fundo = 'soberania' then
    raise exception 'O Fundo de Soberania só cobre retiradas quando um pagamento de cliente atrasa (Regimento, art. 120). Não paga despesas.';
  end if;
  if new.cobrar then tipos := array['ata_ag','ata_ca','resolucao_ca']; quem := 'a chamada (Estatuto, art. 9º, I)';
  elsif new.fonte = 'fundo' and new.fundo = 'reserva' then tipos := array['ata_ag']; quem := 'o uso do Fundo de Reserva (Assembleia Geral)';
  elsif new.fonte = 'fundo' and new.fundo = 'apoio' then tipos := array['ata_ca','resolucao_ca']; quem := 'o uso do Fundo de Apoio (Conselho de Administração, Regimento, art. 122, §1º)';
  elsif new.fonte = 'fundo' then tipos := array['ata_ag','ata_ca','resolucao_ca']; quem := 'o uso do fundo';
  else return new;
  end if;
  if a is null or not (a->>'tipo' = any(tipos)) then
    raise exception 'Anexe o documento que aprovou %.', quem;
  end if;
  if coalesce(a->>'arquivo', '') = '' and coalesce(a->>'assembleia_id', '') = '' then
    raise exception 'Anexe o arquivo do documento de aprovação ou escolha a ata publicada no site.';
  end if;
  if coalesce(a->>'data', '') = '' then raise exception 'Informe a data da decisão.'; end if;
  if new.data is not null and (a->>'data')::date > new.data then
    raise exception 'A decisão (%) é posterior à despesa (%): a aprovação precisa vir antes do gasto.', to_char((a->>'data')::date, 'DD/MM/YYYY'), to_char(new.data, 'DD/MM/YYYY');
  end if;
  if a->>'tipo' = 'resolucao_ca' and coalesce(a->>'numero', '') = '' then
    raise exception 'Informe o número da Resolução (Regimento, art. 7º, §1º).';
  end if;
  if coalesce((a->>'assinaturas')::boolean, false) is not true then
    raise exception 'Confirme que o documento tem as assinaturas exigidas.';
  end if;
  if coalesce((a->>'valor')::numeric, 0) + 0.005 < new.valor then
    raise exception 'O valor aprovado no documento é menor que a despesa.';
  end if;
  return new;
end; $$;
drop trigger if exists despesa_exige_aprovacao on public.fin_despesas;
create trigger despesa_exige_aprovacao before insert or update on public.fin_despesas
  for each row execute function public.despesa_exige_aprovacao();

-- arquivos de aprovação: privados; a tesouraria envia, os conselhos e a coordenação leem
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('despesas', 'despesas', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
drop policy if exists despesas_enviar on storage.objects;
create policy despesas_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'despesas' and public.is_tesouraria());
drop policy if exists despesas_ver on storage.objects;
create policy despesas_ver on storage.objects for select to authenticated
  using (bucket_id = 'despesas' and (public.pode_ver_fin() or public.is_ca() or public.is_coordenacao()));
drop policy if exists despesas_apagar on storage.objects;
create policy despesas_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'despesas' and public.is_tesouraria());

select 'migracao 039 ok' as resultado;
