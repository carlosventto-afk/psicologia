import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function buscarUsuarioAtual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("Usuarios")
    .select(
      "id, id_user, nome, cpf, crp, contato, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo, plano, plano_pago, plano_pretendido, plano_pretendido_a_partir_de, assinatura_status, asaas_customer_id, asaas_subscription_id, plano_teste_expira_em, carne_leao_frequencia, carne_leao_email, carne_leao_ultimo_envio"
    )
    .eq("id_user", user.id)
    .single();

  if (error) throw new Error(error.message);

  // Cron preguiçoso: teste temporário concedido pelo admin (item 22) expira
  // sozinho no próximo carregamento de página, sem depender de job externo
  // — mesmo padrão já usado nas recorrências de sessão.
  if (data.plano_teste_expira_em && new Date(data.plano_teste_expira_em) <= new Date()) {
    const planoRevertido = data.plano_pago ?? "gratis";
    await createAdminClient()
      .from("Usuarios")
      .update({ plano: planoRevertido, plano_teste_expira_em: null })
      .eq("id", data.id);
    data.plano = planoRevertido;
    data.plano_teste_expira_em = null;
  }

  return normalizarIds(data, ["id"]);
}
