-- =====================================================================
-- BIMCORE — migração 027: cotas mensais atrasadas quitadas na retirada
-- O cooperado escolhe, ao pedir a retirada, quantas cotas atrasadas quer
-- quitar com ela. O mínimo obrigatório são as que couberem em 10% do líquido
-- (parâmetro atraso_desconto_pct). Quando a tesouraria registra a retirada como
-- paga, cada cota quitada vira um pagamento de contribuição do mês dela;
-- se o pagamento for desfeito, esses lançamentos saem junto.
-- =====================================================================

alter table public.fin_retiradas add column if not exists quitar_meses jsonb;      -- [{"mes":"2026-05","valor":50}, ...]
alter table public.fin_retiradas add column if not exists quitar_valor numeric(14,2);
alter table public.fin_pagamentos add column if not exists retirada_id uuid references public.fin_retiradas(id) on delete cascade;
alter table public.fin_parametros add column if not exists atraso_desconto_pct numeric(5,4) not null default 0.10;

create or replace function public.retirada_quita_cotas() returns trigger
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if new.status = 'paga' and (tg_op = 'INSERT' or old.status is distinct from 'paga') then
    delete from public.fin_pagamentos where retirada_id = new.id;
    for it in select * from jsonb_array_elements(coalesce(new.quitar_meses, '[]'::jsonb)) loop
      if coalesce((it->>'valor')::numeric, 0) > 0 then
        insert into public.fin_pagamentos (data, fin_cooperado_id, tipo, mes_ref, valor, observacao, origem, retirada_id, criado_nome)
        values (coalesce(new.pago_em, current_date), new.fin_cooperado_id, 'contribuicao', ((it->>'mes') || '-01')::date,
                (it->>'valor')::numeric, 'Descontado da retirada', 'tesouraria', new.id, new.pago_nome);
      end if;
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'paga' and new.status <> 'paga' then
    delete from public.fin_pagamentos where retirada_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists retirada_quita_cotas on public.fin_retiradas;
create trigger retirada_quita_cotas after insert or update of status on public.fin_retiradas
  for each row execute function public.retirada_quita_cotas();

select 'migracao 027 ok' as resultado;
