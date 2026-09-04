import { createAdminClient } from "@/lib/supabase/admin";
import { PLANOS } from "@/lib/planos";

const TOOLS_VALIDAS = [
  "agent_buscar_paciente",
  "agent_get_agenda",
  "agent_status_pagamento_paciente",
  "agent_listar_debitos_paciente",
  "agent_registrar_pagamento_sessao",
  "agent_marcar_atendimento_realizado",
  "agent_agendar_sessao_avulsa",
  "agent_cancelar_sessao",
  "agent_gerar_recibo",
  "agent_listar_inadimplentes",
  "agent_resumo_financeiro",
  "agent_reagendar_sessao",
  "agent_excluir_sessao",
  "agent_excluir_pagamento",
  "agent_registrar_lancamento_despesa",
  "agent_registrar_anamnese",
  "agent_criar_consultorio",
  "agent_criar_paciente",
  "agent_criar_conta_bancaria",
];

// Tools do onboarding guiado: ignoram a checagem de plano enquanto o
// onboarding nao terminou (decisao do usuario, 2026-09-04 -- ver spec
// docs/superpowers/specs/2026-09-04-inicio-operacao-via-whatsapp-design.md,
// secao "Tools novas"). Depois de onboarding_etapa = 'concluido', voltam a
// exigir plano pago como as demais tools.
const TOOLS_ONBOARDING = ["agent_criar_consultorio", "agent_criar_paciente", "agent_criar_conta_bancaria"];

export async function POST(request) {
  const segredo = request.headers.get("x-agent-secret");
  if (!segredo || segredo !== process.env.AGENT_TOOL_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error_code: "CORPO_INVALIDO" }, { status: 400 });
  }

  const { tool_name, whatsapp_number, params } = body;

  if (!TOOLS_VALIDAS.includes(tool_name)) {
    return Response.json({ success: false, error_code: "TOOL_DESCONHECIDA" }, { status: 400 });
  }

  if (!whatsapp_number) {
    return Response.json({ success: false, error_code: "WHATSAPP_NUMBER_AUSENTE" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Espelha exatamente a condição usada por _agent_get_owner_uuid (whatsapp_number
  // + whatsapp_verified = true) pra achar o profissional dono desse número e
  // checar se o plano atual dele ainda inclui acesso ao agente de WhatsApp --
  // sem isso, downgrade pro plano Grátis nunca revoga o uso do agente.
  const { data: profissional } = await admin
    .from("Usuarios")
    .select("plano")
    .eq("whatsapp_number", whatsapp_number)
    .eq("whatsapp_verified", true)
    .maybeSingle();

  if (!profissional) {
    return Response.json({ success: false, error_code: "PLANO_SEM_WHATSAPP" }, { status: 200 });
  }

  const isToolOnboarding = TOOLS_ONBOARDING.includes(tool_name);
  let onboardingConcluido = true;

  if (isToolOnboarding) {
    const { data: sessaoOnboarding } = await admin
      .from("agent_sessions")
      .select("onboarding_etapa")
      .eq("whatsapp_number", whatsapp_number)
      .maybeSingle();
    onboardingConcluido = sessaoOnboarding?.onboarding_etapa === "concluido" || !sessaoOnboarding?.onboarding_etapa;
  }

  const exigePlano = !isToolOnboarding || onboardingConcluido;

  if (exigePlano && !PLANOS[profissional.plano]?.temWhatsapp) {
    return Response.json({ success: false, error_code: "PLANO_SEM_WHATSAPP" }, { status: 200 });
  }

  const { data, error } = await admin.rpc(tool_name, {
    ...(params ?? {}),
    p_whatsapp_number: whatsapp_number,
  });

  const { error: erroAuditoria } = await admin.from("agent_audit_log").insert({
    whatsapp_number,
    tool_name,
    parametros: params ?? {},
    resultado: error ? null : data,
    sucesso: !error,
    mensagem_erro: error?.message ?? null,
  });

  if (erroAuditoria) {
    console.error("Falha ao gravar agent_audit_log:", erroAuditoria.message);
  }

  if (error) {
    return Response.json(
      { success: false, error_code: error.message, error_pg_code: error.code ?? null },
      { status: 200 }
    );
  }

  return Response.json({ success: true, data });
}
