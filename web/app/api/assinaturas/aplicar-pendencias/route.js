import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const segredo = request.headers.get("x-cron-secret");
  if (!segredo || segredo !== process.env.ASSINATURA_CRON_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const { data: downgradesPendentes } = await admin
    .from("Usuarios")
    .select("id")
    .eq("plano_pretendido", "gratis")
    .lte("plano_pretendido_a_partir_de", agora);

  for (const usuario of downgradesPendentes ?? []) {
    await admin
      .from("Usuarios")
      .update({ plano: "gratis", plano_pago: null, plano_pretendido: null, plano_pretendido_a_partir_de: null })
      .eq("id", usuario.id);
    await admin.from("EventoAssinatura").insert({
      usuario: usuario.id,
      asaas_event_id: `downgrade-gratis-${usuario.id}-${agora}`,
      tipo: "downgrade_gratis_efetivado",
      payload: {},
    });
  }

  const cincoDiasAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const { data: inadimplentes } = await admin
    .from("Usuarios")
    .select("id")
    .eq("assinatura_status", "inadimplente")
    .lte("assinatura_vencida_em", cincoDiasAtras)
    .neq("plano", "gratis");

  for (const usuario of inadimplentes ?? []) {
    await admin.from("Usuarios").update({ plano: "gratis" }).eq("id", usuario.id);
    await admin.from("EventoAssinatura").insert({
      usuario: usuario.id,
      asaas_event_id: `carencia-expirada-${usuario.id}-${agora}`,
      tipo: "carencia_expirada",
      payload: {},
    });
  }

  return Response.json({ downgrades: downgradesPendentes?.length ?? 0, carencias: inadimplentes?.length ?? 0 });
}
