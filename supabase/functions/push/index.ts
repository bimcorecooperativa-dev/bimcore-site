// BIMCORE — função "push": envia os avisos da fila (push_fila) aos aparelhos inscritos.
// Chamada só pelo banco (pg_net), com o segredo guardado em push_config. Sem o segredo, devolve
// apenas a chave pública VAPID. As chaves são geradas aqui na primeira chamada e guardadas no banco.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  let { data: c } = await sb.from("push_config").select("*").eq("id", 1).single();
  if (!c) return json({ erro: "sem configuração" }, 500);
  if (!c.publica || !c.privada) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("push_config").update({ publica: k.publicKey, privada: k.privateKey }).eq("id", 1).is("publica", null);
    ({ data: c } = await sb.from("push_config").select("*").eq("id", 1).single());
  }
  if (req.headers.get("x-bimcore-segredo") !== c.segredo) return json({ publica: c.publica });

  const { id } = await req.json().catch(() => ({ id: null }));
  const { data: f } = await sb.from("push_fila").select("*").eq("id", id).single();
  if (!f || f.enviado_em) return json({ ok: false, motivo: "aviso não encontrado ou já enviado" });

  let q = sb.from("push_inscricoes").select("endpoint, p256dh, auth, perfil_id, perfis!inner(status)").eq("perfis.status", "ativo");
  if (f.perfil_id) q = q.eq("perfil_id", f.perfil_id);
  const { data: subs } = await q;

  webpush.setVapidDetails("https://bimcore.com.br", c.publica, c.privada);
  const carga = JSON.stringify({ titulo: f.titulo, corpo: f.corpo || "", url: f.url || "/painel.html", id: f.id });
  let ok = 0, falhas = 0; const apagar: string[] = [];
  await Promise.all((subs || []).map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 86400, urgency: "normal" }); ok++; }
    catch (e) { falhas++; const st = (e as { statusCode?: number }).statusCode; if (st === 404 || st === 410) apagar.push(s.endpoint); }
  }));
  if (apagar.length) await sb.from("push_inscricoes").delete().in("endpoint", apagar);
  await sb.from("push_fila").update({ enviado_em: new Date().toISOString(), resultado: { enviados: ok, falhas, removidos: apagar.length } }).eq("id", f.id);
  return json({ ok: true, enviados: ok, falhas });
});
