-- =====================================================================
-- BIMCORE — migração 014: piso Júnior de cada conselho (art. 8º, II)
-- Em salários-mínimos, valor único para todo o estado. Referência: piso
-- regional do RJ (proposta Ceter/RJ para 2027): técnicos da construção
-- R$ 3.821,40 (2,36 SM); nível superior R$ 4.811,40 (2,97 SM).
-- CREA/CAU continuam em 8,5 SM (Lei 4.950-A). Substitui base_demais_pleno.
-- =====================================================================
alter table public.fin_parametros
  add column if not exists piso_cft   numeric(6,3) not null default 2.36,
  add column if not exists piso_cra   numeric(6,3) not null default 2.97,
  add column if not exists piso_crc   numeric(6,3) not null default 2.97,
  add column if not exists piso_oab   numeric(6,3) not null default 2.97,
  add column if not exists piso_outro numeric(6,3) not null default 2.97;

update public.fin_vigencias
   set dados = dados || jsonb_build_object('piso_cft', 2.36, 'piso_cra', 2.97, 'piso_crc', 2.97, 'piso_oab', 2.97, 'piso_outro', 2.97)
 where not (dados ? 'piso_cft');

select 'migracao 014 ok' as resultado;
