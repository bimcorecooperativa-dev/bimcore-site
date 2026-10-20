-- =====================================================================
-- BIMCORE — migração 047: notificações no celular (Web Push) e número no ícone
-- O cooperado autoriza as notificações uma vez em cada aparelho. Quando sai um
-- comunicado, uma assembleia é convocada ou aberta, um documento é publicado ou
-- substituído, ou há uma pendência pessoal (cadastro, certificado, hora
-- devolvida), o banco põe o aviso numa fila e chama a função "push", que envia.
-- As chaves VAPID e o segredo interno são gerados aqui e na função; ninguém
-- precisa digitá-los. Sem e-mail: o aviso continua também dentro do site.
-- =====================================================================

create extension if not exists pg_net;

-- configuração (só o servidor lê; nenhuma política para usuários)
create table if not exists public.push_config (
  id       int primary key default 1 check (id = 1),
  publica  text,
  privada  text,
  segredo  text not null default md5(random()::text || clock_timestamp()::text) || md5(random()::text || pg_backend_pid()::text)
);
alter table public.push_config enable row level security;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

create or replace function public.push_chave_publica() returns text
language sql stable security definer set search_path = public as $$ select publica from public.push_config where id = 1; $$;
grant execute on function public.push_chave_publica() to authenticated;

-- aparelhos inscritos (cada pessoa vê e apaga os seus)
create table if not exists public.push_inscricoes (
  endpoint   text primary key,
  perfil_id  uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  aparelho   text,
  criado_em  timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
drop policy if exists push_proprio on public.push_inscricoes;
create policy push_proprio on public.push_inscricoes for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- fila de avisos (só o servidor)
create table if not exists public.push_fila (
  id         bigserial primary key,
  perfil_id  uuid references public.perfis(id) on delete cascade,   -- nulo = todos os cooperados ativos
  titulo     text not null,
  corpo      text,
  url        text,
  criado_em  timestamptz not null default now(),
  enviado_em timestamptz,
  resultado  jsonb
);
alter table public.push_fila enable row level security;

create or replace function public.push_enfileirar(p_perfil uuid, p_titulo text, p_corpo text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare v bigint; seg text;
begin
  insert into public.push_fila (perfil_id, titulo, corpo, url) values (p_perfil, left(p_titulo, 120), left(p_corpo, 240), p_url) returning id into v;
  select segredo into seg from public.push_config where id = 1;
  begin
    perform net.http_post(
      url := 'https://whedaqxqcwajjkrqiuyv.supabase.co/functions/v1/push',
      body := jsonb_build_object('id', v),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-bimcore-segredo', seg),
      timeout_milliseconds := 10000);
  exception when others then null;   -- aviso nunca impede a operação principal
  end;
end; $$;
revoke execute on function public.push_enfileirar(uuid, text, text, text) from public, anon, authenticated;

-- gatilhos
create or replace function public.push_comunicado() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.push_enfileirar(null, 'Comunicado: ' || new.titulo, new.corpo, '/painel.html#inicio'); return null; end; $$;
drop trigger if exists push_comunicado on public.comunicados;
create trigger push_comunicado after insert on public.comunicados for each row execute function public.push_comunicado();

create or replace function public.push_assembleia() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'pre' then return null; end if;
  if new.status = 'agendada' and old.status is distinct from 'agendada' then
    perform public.push_enfileirar(null, 'Assembleia convocada', new.titulo || ' · ' || to_char(new.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || '. Veja o edital.', '/painel.html#assembleias');
  elsif new.status = 'aberta' and old.status is distinct from 'aberta' then
    perform public.push_enfileirar(null, 'A sala da assembleia está aberta', new.titulo || '. Entre pelo app para registrar sua presença.', '/painel.html#assembleias');
  end if;
  return null;
end; $$;
drop trigger if exists push_assembleia on public.assembleias;
create trigger push_assembleia after update of status on public.assembleias for each row execute function public.push_assembleia();

create or replace function public.push_documento() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.acao = 'enviado' then perform public.push_enfileirar(null, 'Documento novo', coalesce(new.titulo, 'documento') || coalesce(' (' || new.categoria || ')', ''), '/painel.html#documentos');
  elsif new.acao = 'substituido' then perform public.push_enfileirar(null, 'Documento atualizado', coalesce(new.titulo, 'documento') || ' tem uma nova versão.', '/painel.html#documentos');
  end if;
  return null;
end; $$;
drop trigger if exists push_documento on public.documentos_historico;
create trigger push_documento after insert on public.documentos_historico for each row execute function public.push_documento();

create or replace function public.push_cadastro() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dados_status is distinct from old.dados_status then
    if new.dados_status = 'aprovado' then perform public.push_enfileirar(new.perfil_id, 'Dados cadastrais conferidos', 'Suas retiradas estão liberadas.', '/painel.html#inicio');
    elsif new.dados_status = 'devolvido' then perform public.push_enfileirar(new.perfil_id, 'Dados cadastrais devolvidos', coalesce(new.dados_motivo, 'Veja o que corrigir em Meu perfil.'), '/painel.html#perfil');
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists push_cadastro on public.admissao_fichas;
create trigger push_cadastro after update of dados_status on public.admissao_fichas for each row execute function public.push_cadastro();

create or replace function public.push_certificado() returns trigger language plpgsql security definer set search_path = public as $$
declare t text := (select titulo from public.cursos_indicados where id = new.curso_id);
begin
  if new.conferencia is distinct from old.conferencia then
    if new.conferencia = 'conferido' then perform public.push_enfileirar(new.perfil_id, 'Certificado conferido', coalesce(t, 'curso'), '/painel.html#formacao');
    elsif new.conferencia = 'recusado' then perform public.push_enfileirar(new.perfil_id, 'Certificado não aceito', coalesce(t, 'curso') || ': ' || coalesce(new.conferencia_motivo, ''), '/painel.html#formacao');
    end if;
  end if;
  return null;
end; $$;
drop trigger if exists push_certificado on public.cursos_progresso;
create trigger push_certificado after update of conferencia on public.cursos_progresso for each row execute function public.push_certificado();

create or replace function public.push_hora() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.aprovacao = 'devolvida' and old.aprovacao is distinct from 'devolvida' and new.cooperado_id is not null then
    perform public.push_enfileirar(new.cooperado_id, 'Hora devolvida para correção', to_char(new.data, 'DD/MM') || ' · ' || new.horas || ' h. Veja o motivo em Minhas horas.', '/painel.html#horas');
  end if;
  return null;
end; $$;
drop trigger if exists push_hora on public.producao;
create trigger push_hora after update of aprovacao on public.producao for each row execute function public.push_hora();

select 'migracao 047 ok' as resultado;
