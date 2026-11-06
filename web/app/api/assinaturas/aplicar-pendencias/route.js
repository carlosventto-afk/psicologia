import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailResend } from "@/lib/email/resend";
import { montarEmailAvisoTeste } from "@/lib/email/aviso-teste-plano";
import { DIAS_AVISO, diasRestantes } from "@/lib/teste-plano";
import { PLANOS } from "@/lib/planos";

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

  // Testes de plano (liberação temporária). Expirar ANTES de avisar.
  const DIA_MS = 24 * 60 * 60 * 1000;

  // Defesa em profundidade: quem contratou plano pago durante o teste já teve
  // teste_* limpo pelo webhook. Se sobrou resíduo, só limpa -- NUNCA mexe no plano.
  const { error: erroResiduo } = await admin
    .from("Usuarios")
    .update({ teste_plano: null, teste_expira_em: null, teste_aviso_enviado_em: null })
    .not("teste_plano", "is", null)
    .not("plano_pago", "is", null)
    .lte("teste_expira_em", agora);

  if (erroResiduo) {
    console.error("Falha ao limpar resíduo de teste de plano:", erroResiduo);
  }

  const { data: testesVencidos, error: erroSelectTestes } = await admin
    .from("Usuarios")
    .select("id")
    .not("teste_plano", "is", null)
    .is("plano_pago", null)
    .lte("teste_expira_em", agora);

  if (erroSelectTestes) {
    console.error("Falha ao buscar testes de plano vencidos:", erroSelectTestes);
  }

  for (const usuario of testesVencidos ?? []) {
    const asaasEventId = `teste-expirado-${usuario.id}-${agora}`;

    const { error: erroUpdate } = await admin
      .from("Usuarios")
      .update({ plano: "gratis", teste_plano: null, teste_expira_em: null, teste_aviso_enviado_em: null })
      .eq("id", usuario.id)
      .is("plano_pago", null);

    await admin.from("EventoAssinatura").insert({
      usuario: usuario.id,
      asaas_event_id: asaasEventId,
      tipo: "teste_expirado",
      payload: {},
    });

    if (erroUpdate) {
      await admin
        .from("EventoAssinatura")
        .update({ processado_com_sucesso: false, mensagem_erro: erroUpdate.message })
        .eq("asaas_event_id", asaasEventId);
    }
  }

  const limiteAviso = new Date(Date.now() + DIAS_AVISO * DIA_MS).toISOString();
  const { data: testesParaAvisar, error: erroSelectAvisos } = await admin
    .from("Usuarios")
    .select("id, nome, email, teste_plano, teste_expira_em")
    .not("teste_plano", "is", null)
    .is("plano_pago", null)
    .is("teste_aviso_enviado_em", null)
    .gt("teste_expira_em", agora)
    .lte("teste_expira_em", limiteAviso);

  if (erroSelectAvisos) {
    console.error("Falha ao buscar testes de plano a avisar:", erroSelectAvisos);
  }

  // Decisão sobre falha de envio: enviarEmailResend NÃO lança; devolve
  // { error } e, quando falha, já enfileira o e-mail em EmailFalhado (reenvio
  // por /api/emails/reprocessar-fila). Mesmo assim só marcamos o aviso como
  // enviado em caso de sucesso real: se marcássemos na falha e o enfileiramento
  // também tivesse falhado (é silencioso), o aviso se perderia sem rastro.
  // Custo aceito: se a fila entregar depois, o usuário pode receber o aviso
  // duplicado (no máximo uma vez por execução do job até o teste vencer,
  // pois o usuário sai da seleção ao expirar). Duplicado é preferível a perdido.
  let avisosEnviados = 0;
  for (const usuario of testesParaAvisar ?? []) {
    if (!usuario.email) continue;

    const planoNome = PLANOS[usuario.teste_plano]?.nome ?? usuario.teste_plano;
    const { subject, html } = montarEmailAvisoTeste({
      nome: usuario.nome,
      planoNome,
      expiraEm: usuario.teste_expira_em,
      dias: diasRestantes(usuario.teste_expira_em, new Date()),
    });

    let envio;
    try {
      envio = await enviarEmailResend({ to: usuario.email, subject, html });
    } catch (erro) {
      envio = { error: erro };
    }
    if (envio?.error) {
      console.error("Falha ao enviar aviso de teste de plano:", usuario.id, envio.error);
      continue;
    }

    const asaasEventId = `teste-aviso-${usuario.id}-${agora}`;
    const { error: erroUpdate } = await admin
      .from("Usuarios")
      .update({ teste_aviso_enviado_em: agora })
      .eq("id", usuario.id);

    await admin.from("EventoAssinatura").insert({
      usuario: usuario.id,
      asaas_event_id: asaasEventId,
      tipo: "teste_aviso_enviado",
      payload: {},
    });

    if (erroUpdate) {
      await admin
        .from("EventoAssinatura")
        .update({ processado_com_sucesso: false, mensagem_erro: erroUpdate.message })
        .eq("asaas_event_id", asaasEventId);
    } else {
      avisosEnviados++;
    }
  }

  return Response.json({
    downgrades: downgradesPendentes?.length ?? 0,
    carencias: inadimplentes?.length ?? 0,
    testesExpirados: testesVencidos?.length ?? 0,
    avisosTeste: avisosEnviados,
  });
}
