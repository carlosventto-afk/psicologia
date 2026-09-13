import { createAdminClient } from "@/lib/supabase/admin";
import { enviarWhatsapp, NUMERO_GESTOR } from "@/lib/whatsapp";

export async function POST(request) {
  const segredo = request.headers.get("x-cron-secret");
  if (!segredo || segredo !== process.env.RESUMO_DIARIO_CRON_SECRET) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const admin = createAdminClient();
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: leadsNovos } = await admin
    .from("Lead")
    .select("origem")
    .gte("created_at", desde24h);

  const porOrigem = { cadastro: 0, manual: 0, whatsapp: 0 };
  for (const lead of leadsNovos ?? []) {
    if (porOrigem[lead.origem] !== undefined) porOrigem[lead.origem] += 1;
  }

  const { count: aguardandoVoce } = await admin
    .from("Lead")
    .select("id", { count: "exact", head: true })
    .eq("aguardando_humano", true);

  const { count: emailsPendentes } = await admin
    .from("EmailFalhado")
    .select("id", { count: "exact", head: true })
    .eq("resolvido", false)
    .eq("esgotado", false);

  const { count: emailsEsgotados } = await admin
    .from("EmailFalhado")
    .select("id", { count: "exact", head: true })
    .eq("esgotado", true)
    .gte("created_at", desde24h);

  const mensagem = `☀️ Resumo do PsiAgente — ${new Date().toLocaleDateString("pt-BR")}

Leads novos (24h): ${leadsNovos?.length ?? 0}
  · Cadastro: ${porOrigem.cadastro}
  · Manual: ${porOrigem.manual}
  · WhatsApp: ${porOrigem.whatsapp}

Aguardando você agora: ${aguardandoVoce ?? 0}

E-mails na fila: ${emailsPendentes ?? 0} pendente(s)
E-mails esgotados (24h): ${emailsEsgotados ?? 0}`;

  const { error } = await enviarWhatsapp({ numero: NUMERO_GESTOR, mensagem });

  if (error) {
    console.error("Falha ao enviar resumo diário por WhatsApp:", error.message);
    return Response.json({ enviado: false }, { status: 200 });
  }

  return Response.json({ enviado: true });
}
