-- =====================================================================
-- BIMCORE — migração 023: orçamento do projeto e cronograma físico-financeiro
-- 1) Contrato: retenções na nota (ISS/IR retidos pelo órgão) para saber o que de fato entra.
-- 2) Entrega ligada à parcela que ela libera (físico × financeiro).
-- 3) Atraso de pagamento: a tesouraria cobre as retiradas com o Fundo de Soberania
--    (RI, art. 120) e, quando a parcela é recebida, o fundo é recomposto sozinho.
-- 4) Adesões guardam a categoria e o conselho de quem entra (estimativa do custo da equipe).
-- =====================================================================

alter table public.contratos add column if not exists retencao_pct numeric(6,4) not null default 0 check (retencao_pct >= 0 and retencao_pct < 1);
alter table public.projeto_marcos add column if not exists parcela_id uuid references public.contrato_parcelas(id) on delete set null;
alter table public.contrato_parcelas
  add column if not exists coberto_soberania numeric(14,2),
  add column if not exists coberto_em       date,
  add column if not exists recomposto_em    date;

-- categoria/conselho de quem entra na equipe, quando não informados
create or replace function public.preenche_perfil_adesao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.categoria is null or new.conselho is null then
    select coalesce(new.categoria, categoria), coalesce(new.conselho, conselho) into new.categoria, new.conselho
      from public.fin_cooperados where perfil_id = new.perfil_id limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists aa_preenche_perfil_adesao on public.projeto_adesoes;
create trigger aa_preenche_perfil_adesao before insert on public.projeto_adesoes for each row execute function public.preenche_perfil_adesao();
update public.projeto_adesoes a set categoria = coalesce(a.categoria, c.categoria), conselho = coalesce(a.conselho, c.conselho)
  from public.fin_cooperados c where c.perfil_id = a.perfil_id and (a.categoria is null or a.conselho is null);

-- Cobrir retiradas com o Fundo de Soberania quando a parcela atrasa
create or replace function public.cobrir_com_soberania(p_parcela uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
declare x public.contrato_parcelas; ct public.contratos; saldo numeric; eu text;
begin
  if not public.is_tesouraria() then raise exception 'Só a tesouraria movimenta o Fundo de Soberania.'; end if;
  select * into x from public.contrato_parcelas where id = p_parcela for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if x.recebido_em is not null then raise exception 'Esta parcela já foi recebida.'; end if;
  if x.coberto_soberania is not null then raise exception 'Esta parcela já está coberta pelo Fundo de Soberania.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  select coalesce(sum(valor), 0) into saldo from public.fin_fundos_mov where fundo = 'soberania';
  if p_valor > saldo + 0.005 then raise exception 'O Fundo de Soberania tem % disponíveis.', to_char(saldo, 'FM999G999G990D00'); end if;
  select * into ct from public.contratos where id = x.contrato_id;
  eu := (select nome from public.perfis where id = auth.uid());
  insert into public.fin_fundos_mov (fundo, data, valor, descricao, registrado_nome)
  values ('soberania', current_date, -p_valor, 'Cobertura de retiradas: atraso da parcela "' || x.descricao || '" de ' || ct.contratante, eu);
  perform set_config('bimcore.cobrindo', 'sim', true);
  update public.contrato_parcelas set coberto_soberania = p_valor, coberto_em = current_date where id = p_parcela;
  perform set_config('bimcore.cobrindo', '', true);
end;
$$;
grant execute on function public.cobrir_com_soberania(uuid, numeric) to authenticated;

-- Ao receber: recompõe o fundo e registra no chat dos projetos do contrato
create or replace function public.ao_receber_parcela() returns trigger
language plpgsql security definer set search_path = public as $$
declare ct public.contratos; pr record;
begin
  if new.recebido_em is not null and old.recebido_em is null then
    select * into ct from public.contratos where id = new.contrato_id;
    if new.coberto_soberania is not null and new.recomposto_em is null then
      insert into public.fin_fundos_mov (fundo, data, valor, descricao, registrado_nome)
      values ('soberania', new.recebido_em, new.coberto_soberania, 'Recomposição: parcela "' || new.descricao || '" de ' || ct.contratante || ' recebida', 'Registro do site');
      new.recomposto_em := new.recebido_em;
    end if;
    for pr in select id from public.projetos where contrato_id = new.contrato_id and coordenador_id is not null and status <> 'Arquivado' loop
      perform public.chat_sistema(pr.id, 'Parcela recebida pela cooperativa: ' || new.descricao || '.');
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists ao_receber_parcela on public.contrato_parcelas;
create trigger ao_receber_parcela before update on public.contrato_parcelas for each row execute function public.ao_receber_parcela();

-- não deixa desfazer o recebimento de parcela que já recompôs o fundo sem estornar à mão
create or replace function public.proteger_parcela() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.recebido_em is not null and new.recebido_em is null and old.recomposto_em is not null then
    raise exception 'Esta parcela recompôs o Fundo de Soberania. Para desfazer, registre a saída correspondente no fundo e peça ajuda à coordenação.';
  end if;
  if current_setting('bimcore.cobrindo', true) is distinct from 'sim' then
    new.coberto_soberania := old.coberto_soberania; new.coberto_em := old.coberto_em;
    if not (new.recebido_em is not null and old.recebido_em is null) then new.recomposto_em := old.recomposto_em; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ab_proteger_parcela on public.contrato_parcelas;
create trigger ab_proteger_parcela before update on public.contrato_parcelas for each row execute function public.proteger_parcela();

select 'migracao 023 ok' as resultado;
