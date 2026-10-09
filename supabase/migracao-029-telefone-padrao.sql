-- =====================================================================
-- BIMCORE — migração 029: telefone sempre no padrão (xx) xxxxx-xxxx
-- Aceita o número digitado com ou sem parênteses, traço, espaço ou +55.
-- Celular (11 dígitos): (xx) xxxxx-xxxx · fixo (10 dígitos): (xx) xxxx-xxxx.
-- Outros formatos (ex.: número estrangeiro) ficam como foram digitados.
-- =====================================================================

create or replace function public.formatar_telefone(t text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if t is null or btrim(t) = '' then return t; end if;
  d := regexp_replace(t, '\D', '', 'g');
  if length(d) in (12, 13) and left(d, 2) = '55' then d := substr(d, 3); end if;
  if length(d) = 11 and substr(d, 3, 1) <> '0' then
    return '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 5) || '-' || substr(d, 8, 4);
  elsif length(d) = 10 then
    return '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 4) || '-' || substr(d, 7, 4);
  end if;
  return btrim(t);
end;
$$;

create or replace function public.telefone_padrao() returns trigger language plpgsql as $$
begin new.telefone := public.formatar_telefone(new.telefone); return new; end; $$;

drop trigger if exists a_telefone_padrao on public.perfis;
create trigger a_telefone_padrao before insert or update of telefone on public.perfis for each row execute function public.telefone_padrao();
drop trigger if exists a_telefone_padrao on public.contatos;
create trigger a_telefone_padrao before insert or update of telefone on public.contatos for each row execute function public.telefone_padrao();

-- corrige os já cadastrados
update public.perfis set telefone = public.formatar_telefone(telefone) where telefone is not null and telefone is distinct from public.formatar_telefone(telefone);
update public.contatos set telefone = public.formatar_telefone(telefone) where telefone is not null and telefone is distinct from public.formatar_telefone(telefone);

select 'migracao 029 ok' as resultado, (select count(*) from public.perfis where telefone is not null and telefone !~ '^\(\d{2}\) \d{4,5}-\d{4}$') as fora_do_padrao;
