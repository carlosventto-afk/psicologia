import { createAdminClient } from "@/lib/supabase/admin";

// Chamada depois que /auth/callback ou /auth/confirm confirmam a sessao
// com sucesso. Se esse login nao tiver nada a ver com o fluxo de
// onboarding/revalidacao via WhatsApp (ex: login normal, convite,
// recuperacao de senha), nao encontra nenhuma linha pendente e nao faz
// nada. Nunca lanca erro -- uma falha aqui nao pode impedir o usuario de
// entrar no app.
export async function continuarFluxoWhatsapp(userIdAuth) {
  if (!userIdAuth) return;

  try {
    const admin = createAdminClient();

    const { data: usuario } = await admin.from("Usuarios").select("id").eq("id_user", userIdAuth).maybeSingle();
    if (!usuario) return;

    const { data: sessao } = await admin
      .from("agent_sessions")
      .select("whatsapp_number")
      .eq("usuario_id", usuario.id)
      .eq("link_confirmacao_pendente", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sessao) return;

    const webhookUrl = process.env.N8N_ONBOARDING_CONTINUE_URL;
    const secret = process.env.N8N_ONBOARDING_SECRET;
    if (!webhookUrl || !secret) {
      console.error("N8N_ONBOARDING_CONTINUE_URL/N8N_ONBOARDING_SECRET ausentes -- onboarding via WhatsApp não pôde ser retomado.");
      return;
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-onboarding-secret": secret },
      body: JSON.stringify({ whatsapp_number: sessao.whatsapp_number }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (erro) {
    console.error("Falha ao retomar onboarding via WhatsApp:", erro.message);
  }
}
