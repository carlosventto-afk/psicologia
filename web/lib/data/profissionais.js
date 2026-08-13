import { createClient } from "@/lib/supabase/server";
import { normalizarIdsLista } from "@/lib/normalizar-ids";

export async function listarProfissionais() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Usuarios")
    .select("id, nome, email, contato, role, crp, aprovado, criador_conteudo, plano, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return normalizarIdsLista(data, ["id"]);
}
