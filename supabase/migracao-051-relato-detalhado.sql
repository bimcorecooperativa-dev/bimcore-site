-- =====================================================================
-- BIMCORE — migração 051: relato de problema mais detalhado
-- O cooperado indica o programa, a aba/comando, o que estava fazendo, o que
-- esperava, o que aconteceu, a mensagem de erro e com que frequência acontece.
-- =====================================================================
alter table public.programa_relatos add column if not exists programa text not null default 'BIMCORE Edificações';
alter table public.programa_relatos add column if not exists aba text;
alter table public.programa_relatos add column if not exists esperado text check (esperado is null or char_length(esperado) <= 5000);
alter table public.programa_relatos add column if not exists mensagem_erro text check (mensagem_erro is null or char_length(mensagem_erro) <= 5000);
alter table public.programa_relatos add column if not exists frequencia text check (frequencia is null or frequencia in ('sempre', 'as_vezes', 'uma_vez'));
alter table public.programa_relatos add column if not exists sistema text check (sistema is null or char_length(sistema) <= 200);
