import { createClient } from "@/lib/supabase/server";
import { normalizarIds } from "@/lib/normalizar-ids";

export async function buscarUsuarioAtual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("Usuarios")
    .select("id, nome, cpf, crp, contato, whatsapp_number, whatsapp_verified, role, aprovado, criador_conteudo, plano")
    .eq("id_user", user.id)
    .single();

  if (error) throw new Error(error.message);
  return normalizarIds(data, ["id"]);
}
