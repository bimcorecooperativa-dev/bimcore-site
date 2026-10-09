-- =====================================================================
-- BIMCORE — migração 030: telefone de fora do Brasil
-- Começando com + (ou 00) e o código do país: +55 vira o padrão brasileiro;
-- EUA/Canadá (+1) vira +1 (xxx) xxx-xxxx; demais países ficam como digitados, com +.
-- =====================================================================

create or replace function public.formatar_telefone(t text) returns text
language plpgsql immutable as $$
declare d text; b text;
begin
  if t is null or btrim(t) = '' then return t; end if;
  b := btrim(t);
  d := regexp_replace(b, '\D', '', 'g');
  if d = '' then return b; end if;
  if left(b, 1) = '+' or left(b, 2) = '00' then
    if left(b, 2) = '00' then d := substr(d, 3); end if;
    if left(d, 2) = '55' and length(d) in (12, 13) then
      d := substr(d, 3);
    elsif left(d, 1) = '1' and length(d) = 11 then
      return '+1 (' || substr(d, 2, 3) || ') ' || substr(d, 5, 3) || '-' || substr(d, 8, 4);
    else
      return '+' || regexp_replace(regexp_replace(b, '^(\+|00)\s*', ''), '\s+', ' ', 'g');
    end if;
  elsif length(d) in (12, 13) and left(d, 2) = '55' then
    d := substr(d, 3);
  end if;
  if length(d) = 11 and substr(d, 3, 1) <> '0' then
    return '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 5) || '-' || substr(d, 8, 4);
  elsif length(d) = 10 then
    return '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 4) || '-' || substr(d, 7, 4);
  end if;
  return b;
end;
$$;

select 'migracao 030 ok' as resultado;
