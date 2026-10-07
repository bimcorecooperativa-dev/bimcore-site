-- =====================================================================
-- BIMCORE — migração 004: planilha financeira completa
-- Guarda o arquivo enviado pela tesouraria (vira o modelo para o próximo
-- envio) e os detalhes de cada cooperado lidos da planilha.
-- =====================================================================

alter table public.financeiro_importacoes add column if not exists caminho_arquivo text;
alter table public.financeiro_posicoes    add column if not exists detalhes jsonb;

insert into storage.buckets (id, name, public, file_size_limit)
values ('financeiro', 'financeiro', false, 20971520)
on conflict (id) do nothing;

drop policy if exists fin_arq_ver on storage.objects;
create policy fin_arq_ver on storage.objects for select to authenticated
  using (bucket_id = 'financeiro' and public.is_tesouraria());
drop policy if exists fin_arq_enviar on storage.objects;
create policy fin_arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'financeiro' and public.is_tesouraria());
drop policy if exists fin_arq_apagar on storage.objects;
create policy fin_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'financeiro' and public.is_tesouraria());
