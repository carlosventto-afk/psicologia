import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarProfissionais() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Usuarios")
    .select("id, nome, email, contato, role, crp, aprovado, crp_conferido, criador_conteudo, plano, plano_pretendido, plano_pago, assinatura_status, teste_plano, teste_expira_em, teste_aviso_enviado_em, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id"]);
}
