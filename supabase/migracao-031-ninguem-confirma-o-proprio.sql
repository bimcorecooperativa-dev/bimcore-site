-- =====================================================================
-- BIMCORE — migração 031: ninguém confirma o próprio pagamento
-- Quem é da tesouraria (ou coordenação) não confirma o próprio Pix nem registra
-- o pagamento da própria retirada: outra pessoa da tesouraria faz isso.
-- Mesma lógica de "ninguém aprova as próprias horas" (segregação de funções).
-- =====================================================================

drop policy if exists fin_mov_tes on public.financeiro_movimentos;
create policy fin_mov_tes on public.financeiro_movimentos for update to authenticated
  using (public.is_tesouraria() and cooperado_id <> auth.uid())
  with check (public.is_tesouraria() and cooperado_id <> auth.uid());

drop policy if exists finret_editar on public.fin_retiradas;
create policy finret_editar on public.fin_retiradas for update to authenticated
  using ((public.e_meu_fin(fin_cooperado_id) and status = 'solicitada') or (public.is_tesouraria() and not public.e_meu_fin(fin_cooperado_id)))
  with check ((public.e_meu_fin(fin_cooperado_id) and status = 'cancelada' and pago_em is null) or (public.is_tesouraria() and not public.e_meu_fin(fin_cooperado_id)));

select 'migracao 031 ok' as resultado;
