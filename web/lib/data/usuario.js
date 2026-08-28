import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function buscarUsuarioAtual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("Usuarios")
    .select(
      "id, id_user, nome, cpf, crp, contato, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo, plano, plano_pago, plano_pretendido, plano_pretendido_a_partir_de, assinatura_status, asaas_customer_id, asaas_subscription_id, carne_leao_frequencia, carne_leao_email, carne_leao_ultimo_envio"
    )
    .eq("id_user", user.id)
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id"]);
}
