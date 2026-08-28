import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const segredo = request.headers.get("x-cron-secret");
  if (!segredo || segredo !== process.env.ASSINATURA_CRON_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  const { data: downgradesPendentes, error: erroSelectDowngrades } = await admin
    .from("Usuarios")
    .select("id")
    .eq("plano_pretendido", "gratis")
    .lte("plano_pretendido_a_partir_de", agora);

  if (erroSelectDowngrades) {
    console.error("Falha ao buscar downgrades pendentes:", erroSelectDowngrades);
  }

  for (const usuario of downgradesPendentes ?? []) {
    const asaasEventId = `downgrade-gratis-${usuario.id}-${agora}`;

    const { error: erroUpdate } = await admin
      .from("Usuarios")
      .update({ plano: "gratis", plano_pago: null, plano_pretendido: null, plano_pretendido_a_partir_de: null })
      .eq("id", usuario.id);

    await admin.from("EventoAssinatura").insert({
      usuario: usuario.id,
      asaas_event_id: asaasEventId,
      tipo: "downgrade_gratis_efetivado",
      payload: {},
    });

    if (erroUpdate) {
      // A linha de EventoAssinatura já foi gravada com o default
      // (processado_com_sucesso = true) -- corrige aqui pra registrar que a
      // atualização em Usuarios falhou, senão a tabela de auditoria fica
      // afirmando sucesso num downgrade que não foi aplicado.
      await admin
        .from("EventoAssinatura")
        .update({ processado_com_sucesso: false, mensagem_erro: erroUpdate.message })
        .eq("asaas_event_id", asaasEventId);
    }
  }

  const cincoDiasAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const { data: inadimplentes, error: erroSelectInadimplentes } = await admin
    .from("Usuarios")
    .select("id")
    .eq("assinatura_status", "inadimplente")
    .lte("assinatura_vencida_em", cincoDiasAtras)
    .neq("plano", "gratis");

  if (erroSelectInadimplentes) {
    console.error("Falha ao buscar carências expiradas:", erroSelectInadimplentes);
  }

  for (const usuario of inadimplentes ?? []) {
    const asaasEventId = `carencia-expirada-${usuario.id}-${agora}`;

    const { error: erroUpdate } = await admin.from("Usuarios").update({ plano: "gratis" }).eq("id", usuario.id);

    await admin.from("EventoAssinatura").insert({
      usuario: usuario.id,
      asaas_event_id: asaasEventId,
      tipo: "carencia_expirada",
      payload: {},
    });

    if (erroUpdate) {
      await admin
        .from("EventoAssinatura")
        .update({ processado_com_sucesso: false, mensagem_erro: erroUpdate.message })
        .eq("asaas_event_id", asaasEventId);
    }
  }

  return Response.json({ downgrades: downgradesPendentes?.length ?? 0, carencias: inadimplentes?.length ?? 0 });
}
